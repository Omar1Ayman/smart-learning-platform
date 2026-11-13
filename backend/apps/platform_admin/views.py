from django.core.cache import cache
from django.db import transaction
from django.db.models import Count, Prefetch, Q
from django.db.models.deletion import ProtectedError
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.audit.models import AuditLog
from apps.audit.services import log_action
from apps.billing.models import Plan, Subscription
from apps.tenants.models import DemoRequest, Tenant

from .permissions import IsPlatformAdmin
from .serializers import (
    CreateTenantSerializer,
    DemoRequestAdminSerializer,
    DemoRequestCreateSerializer,
    DemoRequestUpdateSerializer,
    PlatformAssignSubscriptionSerializer,
    PlatformAuditLogSerializer,
    PlatformBillingTenantSerializer,
    PlatformPlanSerializer,
    PlatformUserSerializer,
    PlatformUserStatusSerializer,
    ResetOwnerPasswordSerializer,
    TenantAdminDetailSerializer,
    TenantAdminListSerializer,
    UpdateTenantStatusSerializer,
)


class PlatformTenantViewSet(viewsets.ModelViewSet):
    """/platform/tenants/ — create + read tenants, platform admin only.

    NOT built on TenantScopedViewSet because that base assumes a
    single-tenant scope for the caller. This is the one place in the
    codebase that intentionally sees every tenant — enforced by
    IsPlatformAdmin.

    Writes are intentionally limited to:
      - POST /                    → create (via CreateTenantSerializer)
      - POST /<id>/update_status/ → lifecycle transitions
      - POST /<id>/reset_owner_password/ → password recovery

    No PUT/PATCH/DELETE:
      - C-12: `destroy` is disabled — a hard delete cascades every user,
        exam, attempt, answer, and content row for that school. The
        correct lifecycle is update_status → CHURNED (data retained for
        export per ToS) followed by an off-band retention process.
      - PATCH on a Tenant would silently bypass `activate()`/`close()`
        state-machine guards.
    """

    permission_classes = [IsAuthenticated, IsPlatformAdmin]
    queryset = Tenant.objects.all()
    http_method_names = ["get", "post", "head", "options"]

    def get_serializer_class(self):
        if self.action == "list":
            return TenantAdminListSerializer
        if self.action == "create":
            return CreateTenantSerializer
        return TenantAdminDetailSerializer

    def get_queryset(self):
        """M4 fix: prefetch OWNER users once, so `get_owner_email()` in
        the list serializer becomes O(1) instead of N+1."""
        qs = (
            super()
            .get_queryset()
            .annotate(user_count=Count("users"))
            .prefetch_related(
                Prefetch(
                    "users",
                    queryset=User.objects.filter(role=User.Role.OWNER).only(
                        "id", "email", "tenant_id"
                    ),
                    to_attr="_owners_cache",
                )
            )
        )
        status_filter = self.request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)
        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(slug__icontains=search))
        return qs.order_by("-created_at")

    def create(self, request, *args, **kwargs):
        serializer = CreateTenantSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        result = serializer.save()
        return Response(
            TenantAdminDetailSerializer(result["tenant"]).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"])
    def update_status(self, request, pk=None):
        """POST /platform/tenants/<id>/update_status/"""
        tenant = self.get_object()
        serializer = UpdateTenantStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        old_status = tenant.status
        tenant.status = serializer.validated_data["status"]
        if "internal_notes" in serializer.validated_data:
            tenant.internal_notes = serializer.validated_data["internal_notes"]
        tenant.save(update_fields=["status", "internal_notes", "updated_at"])

        log_action(
            actor=request.user,
            tenant=tenant,
            action=f"platform.tenant_status_{tenant.status.lower()}",
            obj=tenant,
            metadata={"from": old_status, "to": tenant.status},
        )
        return Response(TenantAdminDetailSerializer(tenant).data)

    @action(detail=True, methods=["post"])
    def reset_owner_password(self, request, pk=None):
        """POST /platform/tenants/<id>/reset_owner_password/"""
        tenant = self.get_object()

        owner = tenant.users.filter(role=User.Role.OWNER).first()
        if owner is None:
            return Response(
                {"error": {"status": 404, "detail": "لا يوجد مالك لهذه المؤسسة."}},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = ResetOwnerPasswordSerializer(
            data=request.data, context={"owner": owner}
        )
        serializer.is_valid(raise_exception=True)

        owner.set_password(serializer.validated_data["new_password"])
        owner.save(update_fields=["password"])
        log_action(
            actor=request.user,
            tenant=tenant,
            action="platform.owner_password_reset",
            obj=owner,
            metadata={"owner_email": owner.email},
        )
        return Response({"detail": "تمت إعادة تعيين كلمة المرور."})


class PlatformUserViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only cross-tenant account directory with limited status control."""

    permission_classes = [IsAuthenticated, IsPlatformAdmin]
    queryset = User.objects.none()
    serializer_class = PlatformUserSerializer
    filterset_fields = ["role", "is_active", "tenant"]
    search_fields = ["email", "first_name", "last_name", "tenant__name"]
    ordering_fields = ["email", "date_joined", "role"]
    ordering = ["tenant__name", "role", "email"]

    def get_queryset(self):
        return (
            User.objects.filter(tenant__isnull=False, is_platform_admin=False)
            .select_related("tenant")
            .order_by(*self.ordering)
        )

    @action(detail=True, methods=["patch"], url_path="status")
    def update_status(self, request, pk=None):
        user = self.get_object()
        if user.role == User.Role.OWNER:
            return Response(
                {"error": {"status": 400, "detail": "إيقاف مالك المؤسسة غير متاح من هذه الصفحة."}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = PlatformUserStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        is_active = serializer.validated_data["is_active"]
        if user.is_active != is_active:
            previous_status = user.is_active
            user.is_active = is_active
            user.save(update_fields=["is_active", "updated_at"])
            log_action(
                actor=request.user,
                tenant=user.tenant,
                action="platform.user_status_updated",
                obj=user,
                metadata={"from": previous_status, "to": is_active},
            )
        return Response(self.get_serializer(user).data)


class PlatformAuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    """Platform-operation audit trail; never returns tenant learning events."""

    permission_classes = [IsAuthenticated, IsPlatformAdmin]
    queryset = AuditLog.objects.all()
    serializer_class = PlatformAuditLogSerializer
    filterset_fields = ["action", "actor", "tenant", "object_type"]
    search_fields = ["action", "actor__email", "tenant__name"]
    ordering_fields = ["created_at", "action"]
    ordering = ["-created_at"]

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(Q(action__startswith="platform.") | Q(actor__is_platform_admin=True))
            .select_related("actor", "tenant")
            .order_by(*self.ordering)
        )


class PlatformPlanViewSet(viewsets.ModelViewSet):
    """Manage the platform's sellable plans without exposing tenant data."""

    permission_classes = [IsAuthenticated, IsPlatformAdmin]
    queryset = Plan.objects.all()
    serializer_class = PlatformPlanSerializer
    http_method_names = ["get", "post", "put", "patch", "delete", "head", "options"]

    def get_queryset(self):
        return super().get_queryset().order_by("display_order", "price_monthly")

    def perform_create(self, serializer):
        plan = serializer.save()
        log_action(
            actor=self.request.user,
            action="platform.plan_created",
            obj=plan,
            metadata={"plan_key": plan.key},
        )

    def perform_update(self, serializer):
        plan = serializer.save()
        log_action(
            actor=self.request.user,
            action="platform.plan_updated",
            obj=plan,
            metadata={"plan_key": plan.key},
        )

    def destroy(self, request, *args, **kwargs):
        plan = self.get_object()
        if plan.key == "free":
            return Response(
                {"detail": "لا يمكن حذف الباقة المجانية الافتراضية."},
                status=status.HTTP_409_CONFLICT,
            )

        plan_key = plan.key
        try:
            plan.delete()
        except ProtectedError:
            return Response(
                {
                    "detail": (
                        "لا يمكن حذف باقة مرتبطة باشتراكات قائمة. "
                        "أخفِها من صفحة الأسعار أو أوقف إتاحتها بدلًا من حذفها."
                    )
                },
                status=status.HTTP_409_CONFLICT,
            )

        log_action(
            actor=request.user,
            action="platform.plan_deleted",
            obj=plan,
            metadata={"plan_key": plan_key},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class PlatformBillingTenantViewSet(viewsets.ReadOnlyModelViewSet):
    """Platform-wide billing view; does not expose educational records."""

    permission_classes = [IsAuthenticated, IsPlatformAdmin]
    queryset = Tenant.objects.all()
    serializer_class = PlatformBillingTenantSerializer

    def get_queryset(self):
        queryset = super().get_queryset().select_related("subscription__plan")
        status_filter = self.request.query_params.get("status")
        search = self.request.query_params.get("search")
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search)
                | Q(slug__icontains=search)
                | Q(contact_email__icontains=search)
            )
        return queryset.order_by("name")

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["default_plan"] = Plan.objects.filter(key="free").first()
        return context

    @action(detail=True, methods=["patch"], url_path="subscription")
    def update_subscription(self, request, pk=None):
        tenant = self.get_object()
        serializer = PlatformAssignSubscriptionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        plan = values["plan_key"]

        from datetime import timedelta

        from apps.billing.services import assign_plan

        with transaction.atomic():
            try:
                previous_status = tenant.subscription.status
            except Subscription.DoesNotExist:
                previous_status = None
            subscription = assign_plan(
                tenant,
                plan.key,
                status=values["status"],
                actor=request.user,
                trial_days=values.get("trial_days"),
            )
            updated_fields = set()
            if "feature_overrides" in values:
                subscription.feature_overrides = values["feature_overrides"]
                updated_fields.add("feature_overrides")
            if "limit_overrides" in values:
                subscription.limit_overrides = values["limit_overrides"]
                updated_fields.add("limit_overrides")

            now = timezone.now()
            if values["status"] == Subscription.Status.TRIALING:
                if (
                    "trial_days" in values
                    or previous_status != Subscription.Status.TRIALING
                    or subscription.trial_end is None
                ):
                    subscription.trial_start = now
                    subscription.trial_end = now + timedelta(
                        days=values.get("trial_days", 14)
                    )
                    updated_fields.update({"trial_start", "trial_end"})
                subscription.canceled_at = None
                subscription.cancel_at_period_end = False
                updated_fields.update({"canceled_at", "cancel_at_period_end"})
            elif values["status"] == Subscription.Status.CANCELED:
                subscription.canceled_at = now
                subscription.cancel_at_period_end = False
                updated_fields.update({"canceled_at", "cancel_at_period_end"})
            elif values["status"] == Subscription.Status.ACTIVE:
                subscription.canceled_at = None
                subscription.cancel_at_period_end = False
                updated_fields.update({"canceled_at", "cancel_at_period_end"})

            if updated_fields:
                subscription.save(update_fields=[*updated_fields, "updated_at"])

        log_action(
            actor=request.user,
            tenant=tenant,
            action="platform.subscription_updated",
            obj=subscription,
            metadata={
                "plan_key": plan.key,
                "status": subscription.status,
                "feature_override_keys": sorted(subscription.feature_overrides),
                "limit_override_keys": sorted(subscription.limit_overrides),
            },
        )
        tenant.refresh_from_db()
        return Response(
            PlatformBillingTenantSerializer(
                tenant, context=self.get_serializer_context()
            ).data
        )


class PlatformMetricsView(APIView):
    """GET /platform/metrics/ — business metrics for the platform admin.

    Extended for an ONLINE EXAM product: alongside tenant counts, we
    surface exam activity — assessments published, live attempts right
    now, pending grading, and top tenants by exam usage.

    M5 fix: results are cached for 60s. This endpoint runs 10+ aggregate
    queries per call; the platform dashboard doesn't need sub-minute
    freshness.
    """

    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    CACHE_KEY = "platform_metrics_v1"
    CACHE_TTL = 60  # seconds

    def get(self, request):
        cached = cache.get(self.CACHE_KEY)
        if cached is not None:
            return Response(cached)

        from datetime import timedelta

        from django.db.models import Count, Q

        from apps.assessments.models import Assessment
        from apps.exam_engine.models import ExamAttempt

        # ---- Tenant counts ----
        tenant_counts = {
            row["status"]: row["count"]
            for row in Tenant.objects.values("status").annotate(count=Count("id"))
        }
        total_users = User.objects.filter(tenant__isnull=False).count()
        demo_requests_new = DemoRequest.objects.filter(
            status=DemoRequest.Status.NEW
        ).count()

        # ---- Exam-level metrics ----
        now = timezone.now()
        today = timezone.localdate()
        week_ago = now - timedelta(days=7)

        published_assessments = Assessment.objects.filter(
            status=Assessment.Status.PUBLISHED
        ).count()

        attempts_in_progress_now = ExamAttempt.objects.filter(
            status=ExamAttempt.Status.IN_PROGRESS,
            expires_at__gt=now,
        ).count()

        pending_grading = ExamAttempt.objects.filter(
            status=ExamAttempt.Status.SUBMITTED
        ).count()

        submissions_this_week = ExamAttempt.objects.filter(
            submitted_at__gte=week_ago,
        ).count()

        submissions_today = ExamAttempt.objects.filter(
            submitted_at__date=today,
        ).count()

        suspicious_attempts_week = (
            ExamAttempt.objects.filter(
                submitted_at__gte=week_ago,
                events__isnull=False,
            )
            .distinct()
            .count()
        )

        # ---- Per-tenant exam usage (top 10 by submissions) ----
        top_tenants = (
            Tenant.objects.annotate(
                published_exams=Count(
                    "assessments",
                    filter=Q(assessments__status=Assessment.Status.PUBLISHED),
                    distinct=True,
                ),
                attempts=Count("assessments__attempts", distinct=True),
                submissions=Count(
                    "assessments__attempts",
                    filter=Q(assessments__attempts__submitted_at__isnull=False),
                    distinct=True,
                ),
            )
            .filter(attempts__gt=0)
            .order_by("-submissions")[:10]
        )

        top_tenants_data = [
            {
                "id": str(t.id),
                "name": t.name,
                "status": t.status,
                "published_exams": t.published_exams,
                "attempts": t.attempts,
                "submissions": t.submissions,
            }
            for t in top_tenants
        ]

        data = {
            "tenants": {
                "total": sum(tenant_counts.values()),
                "lead": tenant_counts.get("LEAD", 0),
                "pending": tenant_counts.get("PENDING", 0),
                "trial": tenant_counts.get("TRIAL", 0),
                "active": tenant_counts.get("ACTIVE", 0),
                "suspended": tenant_counts.get("SUSPENDED", 0),
                "churned": tenant_counts.get("CHURNED", 0),
            },
            "total_users": total_users,
            "demo_requests_new": demo_requests_new,
            "exams": {
                "published_total": published_assessments,
                "in_progress_now": attempts_in_progress_now,
                "pending_grading": pending_grading,
                "submissions_today": submissions_today,
                "submissions_this_week": submissions_this_week,
                "suspicious_attempts_week": suspicious_attempts_week,
            },
            "top_tenants": top_tenants_data,
            "generated_at": now,
        }
        cache.set(self.CACHE_KEY, data, self.CACHE_TTL)
        return Response(data)


class PlatformDemoRequestViewSet(viewsets.ModelViewSet):
    """/platform/demo-requests/ — review inbound leads.

    M6 fix: removed `patch` from `http_method_names`. The serializer is
    fully read-only, so PATCH used to return 200 with no changes — a
    silent no-op endpoint. Status updates go through `update_status`
    (POST) instead.
    """

    permission_classes = [IsAuthenticated, IsPlatformAdmin]
    queryset = DemoRequest.objects.all()
    serializer_class = DemoRequestAdminSerializer
    http_method_names = ["get", "post"]

    def get_queryset(self):
        qs = super().get_queryset()
        status_filter = self.request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)
        return qs

    @action(detail=True, methods=["post"])
    def update_status(self, request, pk=None):
        demo = self.get_object()
        serializer = DemoRequestUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        demo.status = serializer.validated_data["status"]
        if "notes" in serializer.validated_data:
            demo.notes = serializer.validated_data["notes"]
        demo.reviewed_by = request.user
        demo.reviewed_at = timezone.now()
        demo.save(
            update_fields=[
                "status",
                "notes",
                "reviewed_by",
                "reviewed_at",
                "updated_at",
            ]
        )
        return Response(DemoRequestAdminSerializer(demo).data)


class PublicDemoRequestView(APIView):
    """POST /api/v1/demo-requests/ — public, no auth."""

    permission_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "demo_request"

    def post(self, request):
        serializer = DemoRequestCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        demo = serializer.save()
        return Response(
            {
                "id": str(demo.id),
                "detail": "تم استلام طلبك. سنتواصل معك خلال 24-48 ساعة.",
            },
            status=status.HTTP_201_CREATED,
        )
