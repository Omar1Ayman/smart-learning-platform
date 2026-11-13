from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework import serializers

from apps.accounts.invitations import InvitationDeliveryError, send_account_invitation
from apps.tenants.permissions import user_can

from .models import UserSession

User = get_user_model()

class MeTenantSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    slug = serializers.CharField()
    primary_color = serializers.CharField()    
    logo_url = serializers.CharField()         
    contact_email = serializers.CharField()    


class MeSerializer(serializers.ModelSerializer):
    tenant = serializers.SerializerMethodField()
    can_view_audit_log = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "first_name",
            "last_name",
            "role",
            "tenant",
            "can_view_audit_log",
            "is_platform_admin",
            "two_factor_enabled",
            "student_code",   
        ]
        read_only_fields = fields

    def get_tenant(self, obj):
        if not obj.tenant_id:
            return None
        t = obj.tenant
        return {
            "id": str(t.id),
            "name": t.name,
            "slug": t.slug,
            "primary_color": t.primary_color,       
            "logo_url": t.logo_url,                 
            "contact_email": t.contact_email,       
        }

    def get_can_view_audit_log(self, obj):
        return obj.role in (User.Role.OWNER, User.Role.ADMIN) or (
            obj.role == User.Role.TEACHER
            and user_can(obj, "enable_audit_log_for_teachers")
        )
class UserSerializer(serializers.ModelSerializer):
    """Read serializer for listing/retrieving tenant members — never
    exposes the password hash or any Django auth internals (SECURITY.md
    §1, 'Sensitive data exposure').

    `student_code` is included for STUDENT rows (null for staff). The
    attendance barcode printed on the student ID card uses this value.
    """
    assignments_count = serializers.SerializerMethodField()
    password_setup_pending = serializers.SerializerMethodField()
    current_grade_name = serializers.SerializerMethodField()
    current_group_name = serializers.SerializerMethodField()
    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "first_name",
            "last_name",
            "role",
            "is_active",
            "student_code",  
            "password_setup_pending",
            "created_at",
            "assignments_count", 
            "current_grade_name", "current_group_name",
        ]
        read_only_fields = fields

    def get_password_setup_pending(self, obj):
        return not obj.has_usable_password()

    def get_current_grade_name(self, obj):
        if obj.role != "STUDENT":
            return None
        from apps.people.models import Enrollment
        # نجلب التسجيل النشط فقط
        enrollment = Enrollment.objects.filter(student=obj, status="ACTIVE").select_related('group__grade').first()
        return enrollment.group.grade.name if enrollment and enrollment.group else None

    def get_current_group_name(self, obj):
        if obj.role != "STUDENT":
            return None
        from apps.people.models import Enrollment
        enrollment = Enrollment.objects.filter(student=obj, status="ACTIVE").select_related('group').first()
        return enrollment.group.name if enrollment and enrollment.group else None
    def get_assignments_count(self, obj):
        # نحسب التكليفات فقط إذا كان المستخدم معلماً
        if obj.role != "TEACHER":
            return 0
        
        from apps.people.models import TeacherAssignment
        return TeacherAssignment.objects.filter(teacher=obj).count()
class UserCreateSerializer(serializers.ModelSerializer):
    """OWNER/ADMIN-only (enforced by the view's permission_classes, same
    IsAdminForWriteActions used everywhere else). Creates a TEACHER,
    STUDENT, or ADMIN account inside the caller's own tenant — never
    OWNER (there is exactly one OWNER per tenant, set at signup) and
    never cross-tenant (tenant is taken from request.tenant, not from
    the request body, same rule as every other create path).

    New accounts receive an expiring, single-use email invitation to set
    their own password; administrators never choose or transmit a user's
    password.
    """

    password_setup_pending = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "first_name",
            "last_name",
            "role",
            "password_setup_pending",
        ]
        read_only_fields = ["id", "password_setup_pending"]

    def get_password_setup_pending(self, obj):
        return not obj.has_usable_password()

    def validate_email(self, value):
        value = value.lower()
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("هذا البريد الإلكتروني مستخدم بالفعل.")
        return value

    def validate_role(self, value):
        if value not in (
            User.Role.ADMIN,
            User.Role.TEACHER,
            User.Role.STUDENT,
            User.Role.PARENT,
        ):
            raise serializers.ValidationError(
                "الدور يجب أن يكون ADMIN أو TEACHER أو STUDENT أو PARENT."
            )
        return value

    def validate(self, attrs):
        """Phase 3 — enforce plan limits on user creation."""
        if "password" in self.initial_data:
            raise serializers.ValidationError(
                {"password": "لا ترسل كلمة مرور. ستصل للمستخدم دعوة آمنة لتعيينها بنفسه."}
            )

        role = attrs.get("role")
        request = self.context.get("request")
        if request and getattr(request, "tenant", None):
            from apps.accounts.models import User
            from apps.billing.services import require_within_limit

            tenant = request.tenant
            if role == User.Role.STUDENT:
                current = (
                    User.objects.for_tenant(tenant)
                    .filter(role=User.Role.STUDENT)
                    .count()
                )
                require_within_limit(tenant, "max_students", current)
            elif role == User.Role.TEACHER:
                current = (
                    User.objects.for_tenant(tenant)
                    .filter(role=User.Role.TEACHER)
                    .count()
                )
                require_within_limit(tenant, "max_teachers", current)
        return attrs
    def create(self, validated_data):
        request = self.context["request"]
        with transaction.atomic():
            user = User.objects.create_user(
                tenant=request.tenant,
                password=None,
                **validated_data,
            )
            send_account_invitation(user)
        return user

class UserUpdateSerializer(serializers.ModelSerializer):
    """Limited field set by design.

    Email and role are deliberately read-only here:
    - Changing an email requires re-verification (a future flow with a
      confirmation link) — not something a PATCH should silently do, or
      a hijacked admin session can transfer an account's identity.
    - Changing a role bypasses two invariants: "one OWNER per tenant"
      (set at signup, changed only by an off-boarding flow) and
      "nobody approves their own question" (a TEACHER promoted to
      ADMIN between creating and reviewing their own question would
      slip through).

    F-03 FIX (Milestone 0, Batch 2): `parent_name`, `parent_email`, and
    `parent_phone` were previously MISSING from the writable field list,
    even though `UserEditForm.tsx` collects them for STUDENT rows and
    submits them. Admins would save a parent email → see a success toast
    → the value was silently dropped. This is a data-loss bug that also
    made the frontend's "سيستلم إشعارات الغياب على هذا البريد" hint a lie.

    These fields are only writable for STUDENT rows (validated below);
    they're blank on staff accounts and would be a no-op there anyway.
    """

    class Meta:
        model = User
        fields = [
            "first_name",
            "last_name",
            "is_active",
            # F-03: parent contact fields (STUDENT rows only — see validate).
            "parent_name",
            "parent_email",
            "parent_phone",
        ]
        read_only_fields = ["id"]

    def validate(self, attrs):
        """Reject attempts to set parent contact fields on non-STUDENT
        rows. This matches the frontend, which only shows these fields
        for STUDENT — a caller bypassing the UI with a manual PATCH
        should get a clear error instead of silently ignored values.
        """
        if self.instance is not None:
            has_parent_update = any(
                field in attrs for field in ("parent_name", "parent_email", "parent_phone")
            )
            if has_parent_update and self.instance.role != User.Role.STUDENT:
                raise serializers.ValidationError(
                    {
                        "parent_email": (
                            "بيانات ولي الأمر متاحة للطلاب فقط (role=STUDENT)."
                        )
                    }
                )
        return attrs
class PasswordResetRequestSerializer(serializers.Serializer):
    """Step 1: request a reset link. Deliberately does NOT reveal whether
    the email exists — same response either way, so an attacker cannot
    enumerate tenant emails by hitting this endpoint."""

    email = serializers.EmailField()

    def validate_email(self, value):
        return value.lower()


class PasswordResetConfirmSerializer(serializers.Serializer):
    """Step 2: submit the new password with the token from the email.

    H-9 FIX (Wave Zero): the previous version only enforced `min_length=10`.
    Password reset would happily accept `aaaaaaaaaa`, which would then
    become a valid (weak) credential for an account that might otherwise
    be protected by 2FA. Now `validate_password()` runs against the
    resolved user, so UserAttributeSimilarityValidator + CommonPassword
    + NumericPassword all apply — matching what ChangePasswordSerializer
    already does.
    """

    uidb64 = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True, min_length=10)

    def validate(self, attrs):
        from django.contrib.auth.tokens import default_token_generator
        from django.utils.encoding import force_str
        from django.utils.http import urlsafe_base64_decode

        try:
            uid = force_str(urlsafe_base64_decode(attrs["uidb64"]))
            user = User.objects.get(pk=uid)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            raise serializers.ValidationError(
                {"token": "رابط إعادة التعيين غير صالح أو منتهي الصلاحية."}
            )

        if not default_token_generator.check_token(user, attrs["token"]):
            raise serializers.ValidationError(
                {"token": "رابط إعادة التعيين غير صالح أو منتهي الصلاحية."}
            )

        # H-9: run Django's validators against the actual user.
        try:
            validate_password(attrs["new_password"], user=user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"new_password": list(exc.messages)})

        attrs["user"] = user
        return attrs


class TwoFactorCodeSerializer(serializers.Serializer):
    code = serializers.CharField(min_length=6, max_length=10)


class TwoFactorDisableSerializer(serializers.Serializer):
    password = serializers.CharField(write_only=True)
    code = serializers.CharField(min_length=6, max_length=10)


class TwoFactorLoginSerializer(serializers.Serializer):
    twofa_token = serializers.CharField()
    code = serializers.CharField(min_length=6, max_length=10)


class UserSessionSerializer(serializers.ModelSerializer):
    is_current = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()

    class Meta:
        model = UserSession
        fields = [
            "id",
            "device_label",
            "ip_address",
            "user_agent",
            "created_at",
            "last_seen_at",
            "revoked_at",
            "revoked_reason",
            "is_current",
            "status",
        ]
        read_only_fields = fields

    def get_is_current(self, obj) -> bool:
        current_id = self.context.get("current_session_id")
        return bool(current_id and str(obj.id) == str(current_id))

    def get_status(self, obj) -> str:
        return "active" if obj.revoked_at is None else "revoked"


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=10)
    confirm_password = serializers.CharField(write_only=True)

    def validate_current_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("كلمة المرور الحالية غير صحيحة.")
        return value

    def validate(self, attrs):
        if attrs["new_password"] != attrs["confirm_password"]:
            raise serializers.ValidationError(
                {"confirm_password": "كلمتا المرور الجديدتان غير متطابقتين."}
            )
        if attrs["new_password"] == attrs["current_password"]:
            raise serializers.ValidationError(
                {"new_password": "يجب اختيار كلمة مرور جديدة مختلفة عن الحالية."}
            )
        try:
            validate_password(attrs["new_password"], user=self.context["request"].user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"new_password": list(exc.messages)})
        return attrs


class ProfileSerializer(serializers.ModelSerializer):
    """Self-service profile. Deliberately excludes email/role/tenant —
    those are admin-controlled (email change requires re-verification
    in a future flow; role change bypasses the "one OWNER per tenant"
    invariant; tenant is set at signup)."""

    tenant_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "first_name",
            "last_name",
            "role",
            "tenant_name",
            "two_factor_enabled",
        ]
        read_only_fields = ["id", "email", "role", "tenant_name", "two_factor_enabled"]

    def get_tenant_name(self, obj):
        return obj.tenant.name if obj.tenant_id else None


class StudentDetailSerializer(serializers.ModelSerializer):
    """Full student profile — school context + academic activity.

    Used by /students/<id>/ (admin/teacher view) and by the student's
    own /auth/profile/ page. Respects tenant + role isolation at the
    view layer; this serializer only shapes.
    """

    tenant_name = serializers.SerializerMethodField()
    current_enrollment = serializers.SerializerMethodField()
    attempts_summary = serializers.SerializerMethodField()
    recent_attempts = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "first_name",
            "last_name",
            "role",
            "tenant_name",
            "student_code", 
            "current_enrollment",
            "attempts_summary",
            "recent_attempts",
            "created_at",
        ]
        read_only_fields = fields

    def get_tenant_name(self, obj):
        return obj.tenant.name if obj.tenant_id else None

    def _enrollment(self, obj):
        if not hasattr(obj, "_current_enrollment_cache"):
            from apps.people.models import Enrollment

            obj._current_enrollment_cache = (
                Enrollment.objects.for_tenant(obj.tenant)
                .filter(student=obj, status="ACTIVE")
                .select_related("group", "group__grade", "group__grade__stage", "academic_year")
                .order_by("-academic_year__start_date")
                .first()
            )
        return obj._current_enrollment_cache

    def get_current_enrollment(self, obj):
        e = self._enrollment(obj)
        if e is None:
            return None
        return {
            "group_id": str(e.group.id),
            "group_name": e.group.name,
            "grade_name": e.group.grade.name,
            "stage_name": e.group.grade.stage.name,
            "academic_year_name": e.academic_year.name,
        }

    def get_attempts_summary(self, obj):
        from apps.exam_engine.models import ExamAttempt

        if hasattr(obj, "_attempts_summary_cache"):
            return obj._attempts_summary_cache

        qs = ExamAttempt.objects.for_tenant(obj.tenant).filter(student=obj)
        total = qs.filter(submitted_at__isnull=False).count()
        graded = qs.filter(status="GRADED")
        graded_count = graded.count()
        passed = graded.filter(is_passed=True).count()

        avg = 0.0
        if graded_count:
            pcts = [a.percentage for a in graded]
            avg = round(sum(pcts) / graded_count, 1) if pcts else 0.0

        obj._attempts_summary_cache = {
            "total_attempts": total,
            "graded_attempts": graded_count,
            "passed_attempts": passed,
            "average_percentage": avg,
        }
        return obj._attempts_summary_cache

    def get_recent_attempts(self, obj):
        from apps.exam_engine.models import ExamAttempt

        qs = (
            ExamAttempt.objects.for_tenant(obj.tenant)
            .filter(student=obj, submitted_at__isnull=False)
            .select_related("assessment")
            .order_by("-submitted_at")[:5]
        )
        return [
            {
                "attempt_id": str(a.id),
                "assessment_title": a.assessment.title,
                "assessment_id": str(a.assessment.id),
                "score": str(a.score) if a.score is not None else None,
                "max_score": str(a.max_score),
                "percentage": round(a.percentage, 1),
                "is_passed": a.is_passed,
                "status": a.status,
                "submitted_at": a.submitted_at,
            }
            for a in qs
        ]


class TeacherDetailSerializer(serializers.ModelSerializer):
    """Full teacher profile — assignments, students, activity."""

    tenant_name = serializers.SerializerMethodField()
    assignments = serializers.SerializerMethodField()
    students_summary = serializers.SerializerMethodField()
    assessments_summary = serializers.SerializerMethodField()
    recent_assessments = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "first_name",
            "last_name",
            "role",
            "tenant_name",
            "assignments",
            "students_summary",
            "assessments_summary",
            "recent_assessments",
            "created_at",
        ]
        read_only_fields = fields

    def get_tenant_name(self, obj):
        return obj.tenant.name if obj.tenant_id else None

    def get_assignments(self, obj):
        from apps.people.models import TeacherAssignment

        qs = (
            TeacherAssignment.objects.for_tenant(obj.tenant)
            .filter(teacher=obj)
            .select_related("course", "course__subject", "course__grade")
            .prefetch_related("groups")
        )
        return [
            {
                "id": str(a.id),
                "course_name": a.course.name,
                "subject_name": a.course.subject.name,
                "grade_name": a.course.grade.name,
                "group_names": [g.name for g in a.groups.all()],
                "scope_label": "الصف كامل" if not a.groups.exists() else f"{a.groups.count()} مجموعة",
            }
            for a in qs
        ]

    def get_students_summary(self, obj):
        from django.db.models import Q

        from apps.people.models import Enrollment, TeacherAssignment

        assignments = TeacherAssignment.objects.for_tenant(obj.tenant).filter(teacher=obj)
        narrowed_group_ids = list(
            assignments.filter(groups__isnull=False).values_list("groups__id", flat=True)
        )
        whole_grade_ids = list(
            assignments.filter(groups__isnull=True).values_list("course__grade_id", flat=True)
        )

        students_qs = (
            Enrollment.objects.for_tenant(obj.tenant)
            .filter(status="ACTIVE")
            .filter(
                Q(group_id__in=narrowed_group_ids) | Q(group__grade_id__in=whole_grade_ids)
            )
            .values("student_id")
            .distinct()
        )
        return {"total_students": students_qs.count()}

    def get_assessments_summary(self, obj):
        from apps.assessments.models import Assessment
        from apps.exam_engine.models import ExamAttempt

        my = Assessment.objects.for_tenant(obj.tenant).filter(created_by=obj)
        attempts = ExamAttempt.objects.for_tenant(obj.tenant).filter(assessment__in=my)
        return {
            "total_assessments": my.count(),
            "published": my.filter(status="PUBLISHED").count(),
            "drafts": my.filter(status="DRAFT").count(),
            "pending_grading": attempts.filter(status="SUBMITTED").count(),
        }

    def get_recent_assessments(self, obj):
        from apps.assessments.models import Assessment

        qs = (
            Assessment.objects.for_tenant(obj.tenant)
            .filter(created_by=obj)
            .order_by("-created_at")[:5]
        )
        return [
            {
                "id": str(a.id),
                "title": a.title,
                "assessment_type": a.assessment_type,
                "status": a.status,
                "created_at": a.created_at,
            }
            for a in qs
        ]