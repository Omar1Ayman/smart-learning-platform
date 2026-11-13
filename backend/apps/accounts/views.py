"""
Auth endpoints. The refresh token never appears in a JSON body the
frontend's JS can read — it is set as an httpOnly cookie here and read
back from the cookie on refresh/logout. See SECURITY.md #2 (Session
attacks) and ARCHITECTURE.md #6 for why.

All imports live at the top, before any class that uses them. Do not
add imports mid-file — Python evaluates class bodies top-to-bottom, and
a mid-file import would produce NameError at class definition time.

Wave Zero fixes reflected here:
- S-6 (partial — AttemptViewSet handles its own scope)
- S-7: StudentDetailView now enforces teacher scope via
  `_teacher_can_view_student` below
- TeacherDetailView: self-service access for TEACHER role (was
  OWNER/ADMIN-only, breaking /settings/profile)
"""


from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.db.models import Q
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework import generics, status, viewsets
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework.pagination import PageNumberPagination

from apps.audit.services import log_action
from apps.common.mixins import TenantContextMixin
from apps.common.permissions import (
    HasRole,
    IsAdminForWriteActions,
    IsSameTenantObject,
    IsTenantMember,
)
from apps.people.models import Enrollment, TeacherAssignment
from apps.tenants.permissions import user_can

from .models import User, UserSession
from .serializers import (
    ChangePasswordSerializer,
    MeSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    ProfileSerializer,
    StudentDetailSerializer,
    TeacherDetailSerializer,
    TwoFactorCodeSerializer,
    TwoFactorDisableSerializer,
    TwoFactorLoginSerializer,
    UserCreateSerializer,
    UserSerializer,
    UserSessionSerializer,
    UserUpdateSerializer,
)
from .sessions import (
    create_session,
    get_session_from_jti,
    get_session_from_jti_id,
    revoke_all_sessions,
    revoke_session,
    rotate_session,
)
from .tokens import TenantTokenObtainPairSerializer
from .two_factor import (
    generate_provisioning_uri,
    generate_recovery_codes,
    generate_secret,
    generate_twofa_token,
    hash_recovery_codes,
    verify_recovery_code,
    verify_totp_code,
    verify_twofa_token,
)

def _set_refresh_cookie(response, refresh_token: str):
    response.set_cookie(
        key=settings.REFRESH_TOKEN_COOKIE_NAME,
        value=refresh_token,
        httponly=True,
        secure=not settings.DEBUG,
        samesite=settings.REFRESH_TOKEN_COOKIE_SAMESITE,
        max_age=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
        path=settings.REFRESH_TOKEN_COOKIE_PATH,
    )


class TenantTokenObtainPairView(TokenObtainPairView):
    """POST /auth/login/ — body: {email, password}.

    If the authenticated user has 2FA enabled, this does NOT return tokens
    — it returns a short-lived `twofa_token` to be exchanged at
    /auth/login/2fa/. The tokens issued by the parent serializer are
    discarded before they leave the process: the client never sees them.
    """

    serializer_class = TenantTokenObtainPairSerializer
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code != 200:
            return response

        email = (request.data.get("email") or "").lower()
        user = User.objects.filter(email=email).first()
        if user is None:
            return response

        if user.two_factor_enabled:
            token = generate_twofa_token(user)
            return Response(
                {"requires_2fa": True, "twofa_token": token},
                status=status.HTTP_200_OK,
            )

        refresh = response.data.pop("refresh")
        session = create_session(user, refresh, request)
        _set_refresh_cookie(response, refresh)
        response.data["session_id"] = str(session.id)
        log_action(actor=user, tenant=user.tenant, action="user.logged_in", obj=user)
        return response


class CookieTokenRefreshView(TokenRefreshView):
    """POST /api/v1/auth/refresh/ — no body; reads the httpOnly cookie.

    HIGH#5 fix (Wave Zero follow-up): the previous version decoded the
    refresh JWT and issued new tokens without checking whether the user
    was still `is_active`. JWTAuthentication on the *access* path does
    reject inactive users, but the refresh path bypassed that check
    entirely. A deactivated account could keep minting fresh access
    tokens as long as its 7-day refresh cookie was valid.

    Now: after decoding the refresh token, we verify the user exists
    and is still active before returning anything. A deactivated user
    gets a clean 401 that tells them to contact their school admin.
    """

    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "refresh"

    def post(self, request, *args, **kwargs):
        refresh_token = request.COOKIES.get(settings.REFRESH_TOKEN_COOKIE_NAME)
        if not refresh_token:
            return Response(
                {"error": {"status": 401, "detail": "لا يوجد جلسة نشطة."}},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        try:
            old_refresh = RefreshToken(refresh_token)
            old_jti = old_refresh["jti"]
            user_id = old_refresh["user_id"]
        except TokenError:
            return Response(
                {
                    "error": {
                        "status": 401,
                        "detail": "انتهت صلاحية الجلسة، يرجى تسجيل الدخول مرة أخرى.",
                    }
                },
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # HIGH#5: reject refresh for a deactivated account.
        user = User.objects.filter(id=user_id).only("is_active").first()
        if user is None or not user.is_active:
            return Response(
                {
                    "error": {
                        "status": 401,
                        "detail": "الحساب غير نشط. يرجى التواصل مع مسؤول المؤسسة.",
                    }
                },
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # Check: is the corresponding session revoked?
        session = get_session_from_jti_id(user_id, old_jti)
        if session and session.revoked_at is not None:
            return Response(
                {
                    "error": {
                        "status": 401,
                        "detail": "تم إنهاء هذه الجلسة. يرجى تسجيل الدخول مرة أخرى.",
                    }
                },
                status=status.HTTP_401_UNAUTHORIZED,
            )

        serializer = self.get_serializer(data={"refresh": refresh_token})
        try:
            serializer.is_valid(raise_exception=True)
        except TokenError:
            return Response(
                {
                    "error": {
                        "status": 401,
                        "detail": "انتهت صلاحية الجلسة، يرجى تسجيل الدخول مرة أخرى.",
                    }
                },
                status=status.HTTP_401_UNAUTHORIZED,
            )
        data = dict(serializer.validated_data)
        new_refresh = data.pop("refresh", None)
        response = Response(data, status=status.HTTP_200_OK)
        if new_refresh:
            _set_refresh_cookie(response, new_refresh)
            # `user` here is the one we already fetched — reuse it instead
            # of a second query.
            rotated = rotate_session(user, old_jti, new_refresh, request)
            response.data["session_id"] = str(rotated.id)
        return response
class LogoutView(APIView):
    """POST /api/v1/auth/logout/ — blacklists the refresh token and clears
    the cookie, so a copy of it (if one ever leaked) is dead immediately."""

    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        refresh_token = request.COOKIES.get(settings.REFRESH_TOKEN_COOKIE_NAME)
        if refresh_token:
            try:
                parsed = RefreshToken(refresh_token)
                session = get_session_from_jti(request.user, parsed["jti"])
                if session:
                    revoke_session(session, reason="logout")
                parsed.blacklist()
            except TokenError:
                pass
        log_action(
            actor=request.user,
            tenant=getattr(request, "tenant", None),
            action="user.logged_out",
        )
        response = Response(status=status.HTTP_204_NO_CONTENT)
        response.delete_cookie(
            settings.REFRESH_TOKEN_COOKIE_NAME,
            path=settings.REFRESH_TOKEN_COOKIE_PATH,
        )
        return response


class MeView(generics.RetrieveAPIView):
    serializer_class = MeSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        return self.request.user


class PasswordResetRequestView(APIView):
    """POST /auth/password-reset/ — body: {email}.

    Always returns 200 with the same message, whether the email exists or
    not. The email itself, when it does exist, contains a link with a
    token that's single-use and expires per PASSWORD_RESET_TIMEOUT.
    """

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_reset"

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]

        user = User.objects.filter(email=email, is_active=True).first()
        if user is not None:
            uidb64 = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)
            reset_url = (
                f"{settings.FRONTEND_URL}/reset-password?uidb64={uidb64}&token={token}"
            )
            send_mail(
                subject="إعادة تعيين كلمة المرور — منصة التعلم الذكية",
                message=(
                    f"مرحبًا،\n\n"
                    f"لإعادة تعيين كلمة المرور، افتح الرابط التالي:\n\n"
                    f"{reset_url}\n\n"
                    f"الرابط صالح لمدة 3 أيام. إن لم تطلب هذا، تجاهل الرسالة.\n"
                ),
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[email],
                fail_silently=True,
            )

        return Response(
            {"detail": "إن كان البريد مسجلًا، ستصلك رسالة بها رابط إعادة التعيين."}
        )


class PasswordResetConfirmView(APIView):
    """POST /auth/password-reset/confirm/ — body: {uidb64, token, new_password}."""

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_reset"

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        user.set_password(serializer.validated_data["new_password"])
        user.save(update_fields=["password"])
        return Response(
            {"detail": "تم تحديث كلمة المرور. يمكنك الآن تسجيل الدخول."}
        )

class UsersPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = "page_size"
    max_page_size = 100
class UserViewSet(TenantContextMixin, viewsets.ModelViewSet):
    """/api/v1/users/ — Owner/Admin manage Teacher/Student/Admin accounts
    for their own tenant. Read access is *also* role-scoped: a STUDENT or
    TEACHER has no business reason to browse the full roster (every
    teacher's email, every admin's email) — only OWNER/ADMIN who actually
    manage the roster get the full list.

    Wave 2A: added `role__in` query support so the frontend can request
    "all staff" (OWNER,ADMIN,TEACHER) in one call — the /team page needs
    this to split Staff vs Students into tabs without three separate API
    calls.
    """
    filterset_fields = ["role", "is_active"]
    search_fields = ["email", "first_name", "last_name", "student_code"]
    ordering_fields = [
        "email",
        "created_at",
        "role",
        "first_name",
        "student_code",
        "is_active",
        "_grade_name",
        "_group_name",
    ]
    pagination_class = UsersPagination
    ordering = ["role", "first_name", "email"]
    permission_classes = [
        IsAuthenticated,
        IsTenantMember,
        IsSameTenantObject,
        IsAdminForWriteActions,
    ]
    queryset = User.objects.none()
    serializer_class = UserSerializer
    filterset_fields = ["role", "is_active"]
    def get_queryset(self):
        # 1. تحسين الأداء للتسجيلات فقط (بدون teacher_assignments لأن اسمها مختلف)
        qs = User.objects.for_tenant(self.request.tenant).prefetch_related(
            "enrollments__group__grade"
        )

        # أعمدة ترتيب افتراضية لأسماء الصف/المجموعة (عمود واحد لكل طالب نشط)
        from django.db.models import OuterRef, Subquery
        from apps.people.models import Enrollment

        active_enrollment = Enrollment.objects.filter(
            student=OuterRef("pk"), status="ACTIVE"
        )
        qs = qs.annotate(
            _grade_name=Subquery(
                active_enrollment.values("group__grade__name")[:1]
            ),
            _group_name=Subquery(
                active_enrollment.values("group__name")[:1]
            ),
        )

        # 2. فلتر الأدوار (role__in)
        role_in = self.request.query_params.get("role__in")
        if role_in:
            roles = [r.strip() for r in role_in.split(",") if r.strip()]
            if roles:
                qs = qs.filter(role__in=roles)

        # 3. فلتر المقرر (للمعلمين) — باستخدام Subquery لتجنب اسم العلاقة
        course_id = self.request.query_params.get("course")
        if course_id:
            from apps.people.models import TeacherAssignment
            teacher_ids = (
                TeacherAssignment.objects.for_tenant(self.request.tenant)
                .filter(course_id=course_id)
                .values_list("teacher_id", flat=True)
            )
            qs = qs.filter(id__in=teacher_ids)

        # 4. فلتر الصف والمجموعة (للطلاب فقط)
        role_filter = self.request.query_params.get("role")
        is_student_query = role_filter == "STUDENT" or (
            role_in and "STUDENT" in role_in
        )

        if is_student_query:
            grade_id = self.request.query_params.get("grade")
            if grade_id:
                qs = qs.filter(
                    enrollments__group__grade_id=grade_id,
                    enrollments__status="ACTIVE",
                )

            group_id = self.request.query_params.get("group")
            if group_id:
                qs = qs.filter(
                    enrollments__group_id=group_id,
                    enrollments__status="ACTIVE",
                )

        # 5. تقييد الصلاحيات (لغير المالك والمسؤول)
        if self.request.user.role not in (User.Role.OWNER, User.Role.ADMIN):
            return qs.filter(id=self.request.user.id)

        return qs.distinct()
    def get_serializer_class(self):
        if self.action == "create":
            return UserCreateSerializer
        if self.action in ("update", "partial_update"):
            return UserUpdateSerializer
        return UserSerializer

    def perform_create(self, serializer):
        if (
            self.request.user.role == User.Role.ADMIN
            and serializer.validated_data.get("role") == User.Role.TEACHER
            and not user_can(self.request.user, "admins_can_manage_teachers")
        ):
            raise PermissionDenied("إضافة المعلمين غير مسموحة للمسؤول حسب إعدادات المؤسسة.")
        user = serializer.save()
        log_action(
            actor=self.request.user,
            tenant=self.request.tenant,
            action="user.created",
            obj=user,
            metadata={"role": user.role, "email": user.email},
        )

    def perform_update(self, serializer):
        instance = serializer.instance
        if (
            self.request.user.role == User.Role.ADMIN
            and instance.role == User.Role.TEACHER
            and not user_can(self.request.user, "admins_can_manage_teachers")
        ):
            raise PermissionDenied("إدارة المعلمين غير مسموحة للمسؤول حسب إعدادات المؤسسة.")
        if instance.role == User.Role.OWNER and instance.id != self.request.user.id:
            raise PermissionDenied("لا يمكن تعديل حساب مالك المؤسسة.")
        super().perform_update(serializer)
        log_action(
            actor=self.request.user,
            tenant=self.request.tenant,
            action="user.updated",
            obj=instance,
            metadata={"fields": list(serializer.validated_data.keys())},
        )

    def perform_destroy(self, instance):
        if (
            self.request.user.role == User.Role.ADMIN
            and instance.role == User.Role.TEACHER
            and not user_can(self.request.user, "admins_can_manage_teachers")
        ):
            raise PermissionDenied("إدارة المعلمين غير مسموحة للمسؤول حسب إعدادات المؤسسة.")
        if instance.role == User.Role.OWNER:
            raise PermissionDenied("لا يمكن حذف حساب مالك المؤسسة.")
        if instance.id == self.request.user.id:
            raise PermissionDenied("لا يمكنك حذف حسابك الخاص.")
        log_action(
            actor=self.request.user,
            tenant=self.request.tenant,
            action="user.deleted",
            obj=instance,
            metadata={"email": instance.email, "role": instance.role},
        )
        super().perform_destroy(instance)

class TwoFactorSetupView(APIView):
    """POST /auth/2fa/setup/ — generate secret + QR + recovery codes.
    Does NOT enable 2FA yet — that requires confirmation with a valid
    code (see TwoFactorEnableView)."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "twofa_setup"

    def post(self, request):
        user = request.user
        if user.two_factor_enabled:
            return Response(
                {
                    "error": {
                        "status": 400,
                        "detail": "المصادقة الثنائية مُفعّلة بالفعل.",
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        secret = generate_secret()
        uri = generate_provisioning_uri(secret, user.email)
        codes = generate_recovery_codes()

        user.two_factor_secret = secret
        user.two_factor_recovery_codes = hash_recovery_codes(codes)
        user.two_factor_enabled = False
        user.save(
            update_fields=[
                "two_factor_secret",
                "two_factor_recovery_codes",
                "two_factor_enabled",
            ]
        )

        return Response(
            {
                "secret": secret,
                "provisioning_uri": uri,
                "recovery_codes": codes,
            }
        )


class TwoFactorEnableView(APIView):
    """POST /auth/2fa/enable/ — {code} — confirm and enable."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "twofa_verify"

    def post(self, request):
        user = request.user
        if user.two_factor_enabled:
            return Response(
                {
                    "error": {
                        "status": 400,
                        "detail": "المصادقة الثنائية مُفعّلة بالفعل.",
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not user.two_factor_secret:
            return Response(
                {
                    "error": {
                        "status": 400,
                        "detail": "لم يتم بدء الإعداد. اطلب /auth/2fa/setup/ أولًا.",
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = TwoFactorCodeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if not verify_totp_code(
            user.two_factor_secret, serializer.validated_data["code"]
        ):
            return Response(
                {
                    "error": {
                        "status": 400,
                        "detail": "رمز غير صالح. حاول مرة أخرى.",
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.two_factor_enabled = True
        user.save(update_fields=["two_factor_enabled"])
        log_action(
            actor=user, tenant=user.tenant, action="user.twofa_enabled", obj=user
        )

        return Response({"detail": "تم تفعيل المصادقة الثنائية بنجاح."})


class TwoFactorDisableView(APIView):
    """POST /auth/2fa/disable/ — {password, code} — two-factor confirmation."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "twofa_verify"

    def post(self, request):
        user = request.user
        if not user.two_factor_enabled:
            return Response(
                {
                    "error": {
                        "status": 400,
                        "detail": "المصادقة الثنائية غير مُفعّلة.",
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = TwoFactorDisableSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if not user.check_password(serializer.validated_data["password"]):
            return Response(
                {
                    "error": {
                        "status": 400,
                        "detail": "كلمة المرور غير صحيحة.",
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not verify_totp_code(
            user.two_factor_secret, serializer.validated_data["code"]
        ):
            return Response(
                {"error": {"status": 400, "detail": "رمز غير صالح."}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.two_factor_enabled = False
        user.two_factor_secret = ""
        user.two_factor_recovery_codes = []
        user.save(
            update_fields=[
                "two_factor_enabled",
                "two_factor_secret",
                "two_factor_recovery_codes",
            ]
        )
        log_action(
            actor=user, tenant=user.tenant, action="user.twofa_disabled", obj=user
        )

        return Response({"detail": "تم إلغاء المصادقة الثنائية."})


class TwoFactorLoginView(APIView):
    """POST /auth/login/2fa/ — {twofa_token, code}.

    Accepts a TOTP code (6 digits) or a recovery code (format XXXXX-XXXX).
    """

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "twofa_verify"

    def post(self, request):
        serializer = TwoFactorLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user_id = verify_twofa_token(serializer.validated_data["twofa_token"])
        if user_id is None:
            return Response(
                {
                    "error": {
                        "status": 401,
                        "detail": "انتهت صلاحية الجلسة. يرجى تسجيل الدخول مرة أخرى.",
                    }
                },
                status=status.HTTP_401_UNAUTHORIZED,
            )

        user = User.objects.filter(
            id=user_id, is_active=True, two_factor_enabled=True
        ).first()
        if user is None:
            return Response(
                {"error": {"status": 401, "detail": "حساب غير صالح."}},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        code = serializer.validated_data["code"].strip()

        is_totp = len(code) == 6 and code.isdigit()
        if is_totp:
            if not verify_totp_code(user.two_factor_secret, code):
                return Response(
                    {"error": {"status": 400, "detail": "رمز غير صالح."}},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            if not verify_recovery_code(user, code):
                return Response(
                    {
                        "error": {
                            "status": 400,
                            "detail": "رمز الاسترداد غير صالح أو مستخدم بالفعل.",
                        }
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        token = TenantTokenObtainPairSerializer.get_token(user)
        refresh_str = str(token)
        access_str = str(token.access_token)

        # Create the session row BEFORE building the response — the
        # response includes session_id, so it must exist first.
        session = create_session(user, refresh_str, request)

        data = {
            "access": access_str,
            "session_id": str(session.id),
            "tenant": (
                {
                    "id": str(user.tenant.id),
                    "name": user.tenant.name,
                    "slug": user.tenant.slug,
                }
                if user.tenant
                else None
            ),
            "user": {"id": str(user.id), "email": user.email, "role": user.role},
        }
        response = Response(data, status=status.HTTP_200_OK)
        _set_refresh_cookie(response, refresh_str)

        log_action(
            actor=user, tenant=user.tenant, action="user.logged_in_2fa", obj=user
        )
        return response


class UserSessionsView(APIView):
    """GET /auth/sessions/ — list all sessions for the current user."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        sessions = UserSession.objects.filter(user=request.user).order_by(
            "-last_seen_at"
        )
        current_session_id = request.query_params.get("current")
        serializer = UserSessionSerializer(
            sessions, many=True, context={"current_session_id": current_session_id}
        )
        return Response(
            {
                "sessions": serializer.data,
                "active_count": sum(1 for s in sessions if s.revoked_at is None),
            }
        )


class RevokeSessionView(APIView):
    """POST /auth/sessions/<id>/revoke/ — revoke a single session."""

    permission_classes = [IsAuthenticated]

    def post(self, request, session_id):
        session = UserSession.objects.filter(
            id=session_id, user=request.user
        ).first()
        if session is None:
            return Response(
                {"error": {"status": 404, "detail": "الجلسة غير موجودة."}},
                status=status.HTTP_404_NOT_FOUND,
            )
        if session.revoked_at is not None:
            return Response({"detail": "الجلسة منتهية بالفعل."})

        revoke_session(session, reason="user_revoked")
        log_action(
            actor=request.user,
            tenant=getattr(request.user, "tenant", None),
            action="session.revoked",
            metadata={"session_id": str(session.id), "device": session.device_label},
        )
        return Response({"detail": "تم إنهاء الجلسة."})


class RevokeAllSessionsView(APIView):
    """POST /auth/sessions/revoke-all/ — revoke all OTHER sessions.

    The current session is identified from the refresh cookie, NOT from
    a client-supplied parameter. Trusting client input here would let an
    attacker who somehow got a stolen access token skip revoking the
    victim's actual active session — the whole point is to protect that
    session. Cookie-based identification is authoritative.

    Note: `CookieTokenRefreshView` rotates the DB session's jti to match
    the newest refresh cookie on every rotation, so cookie.jti always
    equals the current session row's jti.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        keep_jti = None
        refresh_token = request.COOKIES.get(settings.REFRESH_TOKEN_COOKIE_NAME)
        if refresh_token:
            try:
                keep_jti = RefreshToken(refresh_token)["jti"]
            except TokenError:
                # Cookie invalid/expired — no current session to protect.
                keep_jti = None

        count = revoke_all_sessions(
            request.user, except_jti=keep_jti, reason="user_revoked_all"
        )
        log_action(
            actor=request.user,
            tenant=getattr(request.user, "tenant", None),
            action="session.revoked_all",
            metadata={"count": count, "kept_current": bool(keep_jti)},
        )
        return Response({"detail": f"تم إنهاء {count} جلسة أخرى."})


class ChangePasswordView(APIView):
    """POST /auth/change-password/ — verify current password, set new, revoke other sessions."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_change"

    def post(self, request):
        serializer = ChangePasswordSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data["new_password"])
        request.user.save(update_fields=["password"])

        # Detect the current session from the refresh cookie — same
        # rationale as RevokeAllSessionsView. The user who just changed
        # their password stays logged in on this device; every other
        # browser/phone loses access immediately.
        keep_jti = None
        refresh_token = request.COOKIES.get(settings.REFRESH_TOKEN_COOKIE_NAME)
        if refresh_token:
            try:
                keep_jti = RefreshToken(refresh_token)["jti"]
            except TokenError:
                pass

        count = revoke_all_sessions(
            request.user, except_jti=keep_jti, reason="password_changed"
        )

        log_action(
            actor=request.user,
            tenant=getattr(request.user, "tenant", None),
            action="user.password_changed",
            metadata={"other_sessions_revoked": count},
        )
        return Response(
            {
                "detail": "تم تحديث كلمة المرور.",
                "other_sessions_revoked": count,
            }
        )


class ProfileView(APIView):
    """GET/PATCH /auth/profile/ — self-service profile update.

    Only first_name/last_name are writable. Email, role, tenant are
    read-only (see ProfileSerializer docstring for rationale)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(ProfileSerializer(request.user).data)

    def patch(self, request):
        serializer = ProfileSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        log_action(
            actor=request.user,
            tenant=getattr(request.user, "tenant", None),
            action="user.profile_updated",
            obj=request.user,
        )
        return Response(serializer.data)


# ---------------------------------------------------------------------------
# S-7 helper — Wave Zero.
# ---------------------------------------------------------------------------


def _teacher_can_view_student(teacher, student, tenant) -> bool:
    """A TEACHER can view a STUDENT's profile only if that student has
    an ACTIVE enrollment in a group (or grade) the teacher is assigned to.

    Matches the exact scoping used by EnrollmentViewSet.get_queryset(),
    so teachers see the same students in /students/<id>/ that they see
    in /enrollments/.
    """
    assignments = TeacherAssignment.objects.for_tenant(tenant).filter(teacher=teacher)
    narrowed_group_ids = list(
        assignments.filter(groups__isnull=False).values_list("groups__id", flat=True)
    )
    whole_grade_ids = list(
        assignments.filter(groups__isnull=True).values_list("course__grade_id", flat=True)
    )
    if not narrowed_group_ids and not whole_grade_ids:
        return False

    return (
        Enrollment.objects.for_tenant(tenant)
        .filter(student=student, status=Enrollment.Status.ACTIVE)
        .filter(
            Q(group_id__in=narrowed_group_ids) | Q(group__grade_id__in=whole_grade_ids)
        )
        .exists()
    )


class StudentDetailView(TenantContextMixin, APIView):
    """GET /students/<id>/ — full student profile.

    S-7 FIX (Wave Zero):
      - OWNER/ADMIN: any student in their tenant (unchanged).
      - TEACHER: only students in their teaching scope (an ACTIVE
        enrollment in a group/grade they're assigned to). Previously any
        teacher could read any student's full academic history + results
        — a horizontal IDOR.
      - STUDENT: only themselves.
    """

    permission_classes = [IsAuthenticated, IsTenantMember]

    def get(self, request, user_id):
        student = (
            User.objects.for_tenant(request.tenant)
            .filter(id=user_id, role=User.Role.STUDENT)
            .first()
        )
        if student is None:
            return Response(
                {"error": {"status": 404, "detail": "الطالب غير موجود."}},
                status=404,
            )

        user = request.user
        if user.role in ("OWNER", "ADMIN"):
            pass  # full visibility
        elif user.role == "STUDENT":
            if user.id != student.id:
                return Response(
                    {
                        "error": {
                            "status": 403,
                            "detail": "لا يمكنك عرض بيانات طالب آخر.",
                        }
                    },
                    status=403,
                )
        elif user.role == "TEACHER":
            if not _teacher_can_view_student(user, student, request.tenant):
                return Response(
                    {
                        "error": {
                            "status": 403,
                            "detail": "هذا الطالب خارج نطاق موادك.",
                        }
                    },
                    status=403,
                )
        else:
            return Response(
                {"error": {"status": 403, "detail": "غير مصرح."}},
                status=403,
            )

        return Response(StudentDetailSerializer(student).data)


class TeacherDetailView(TenantContextMixin, APIView):
    """GET /teachers/<id>/ — full teacher profile.

    Was `HasRole("OWNER", "ADMIN")` — which blocked teachers from viewing
    their own profile (breaking `/settings/profile`'s teacher-context
    card, which silently rendered nothing). Fixed as part of Wave Zero:

      - OWNER/ADMIN: any teacher in their tenant.
      - TEACHER: only their own profile (self-service).
      - STUDENT: blocked entirely (no business reason to see staff
        metadata like "pending grading count" or assignment lists).
    """

    permission_classes = [IsAuthenticated, IsTenantMember]

    def get(self, request, user_id):
        teacher = (
            User.objects.for_tenant(request.tenant)
            .filter(id=user_id, role=User.Role.TEACHER)
            .first()
        )
        if teacher is None:
            return Response(
                {"error": {"status": 404, "detail": "المعلم غير موجود."}},
                status=404,
            )

        user = request.user
        if user.role in ("OWNER", "ADMIN"):
            pass  # full visibility
        elif user.role == "TEACHER" and user.id == teacher.id:
            pass  # self-service — needed by /settings/profile
        else:
            return Response(
                {
                    "error": {
                        "status": 403,
                        "detail": "لا يمكنك عرض بيانات معلم آخر.",
                    }
                },
                status=403,
            )

        return Response(TeacherDetailSerializer(teacher).data)