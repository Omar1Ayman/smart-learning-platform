"""
TenantScopedViewSet — base for every domain ViewSet.

Wave A3 — added `bulk_delete` action inherited by every subclass.
Wave E1 — added `HealthCheckView` for platform health probes.
Wave M0 — restricted `SetupStatusView` to OWNER/ADMIN.
CRIT#3 fix — `bulk_delete` now enforces object-level permissions before
             any write; `permission_classes` override removed.
M3 fix — `HealthCheckView` no longer runs COUNT(*) on every hit.
"""

from django.db import connection, transaction
from django.db.models.deletion import ProtectedError, RestrictedError
from django.http import JsonResponse

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .mixins import TenantContextMixin
from .permissions import HasRole, IsSameTenantObject, IsTenantMember
from .setup import get_setup_status


class TenantScopedViewSet(TenantContextMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, IsTenantMember, IsSameTenantObject]

    BULK_DELETE_MAX = 200

    def get_queryset(self):
        qs = super().get_queryset()
        return qs.for_tenant(self.request.tenant)

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.tenant)

    def _attach_warnings(self, response, serializer):
        warnings = getattr(serializer, "get_warnings", lambda: {})()
        if warnings and isinstance(response.data, dict):
            response.data["_warnings"] = warnings
        return response

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        data = dict(serializer.data) if isinstance(serializer.data, dict) else serializer.data
        response = Response(data, status=status.HTTP_201_CREATED, headers=headers)
        return self._attach_warnings(response, serializer)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        data = dict(serializer.data) if isinstance(serializer.data, dict) else serializer.data
        response = Response(data)
        return self._attach_warnings(response, serializer)

    @action(detail=False, methods=["post"], url_path="bulk_delete")
    def bulk_delete(self, request):
        """POST /<resource>/bulk_delete/   body: {"ids": [...]}

        CRIT#3 fix (Wave Zero follow-up):
          The previous version overrode `permission_classes` to
          `[IsAuthenticated, IsTenantMember]`, silently dropping
          IsStaffForWriteActions, IsCreatorOrAdmin, and every other
          object-level check the ViewSet had configured. It then called
          `perform_destroy()` directly, which bypasses DRF's
          `check_object_permissions()` (that only runs inside
          `get_object()`). Net result: a TEACHER could bulk-delete
          another teacher's approved questions, published assessments,
          question banks, etc.

        Now:
          - No permission_classes override → inherits the full chain.
          - `check_object_permissions()` is invoked per object BEFORE any
            write. A single failure aborts the whole batch (atomic).
        """
        ids = request.data.get("ids")
        if not isinstance(ids, list) or not ids:
            return Response(
                {"error": {"status": 400, "detail": "يجب اختيار عنصر واحد على الأقل."}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(ids) > self.BULK_DELETE_MAX:
            return Response(
                {
                    "error": {
                        "status": 400,
                        "detail": f"الحد الأقصى {self.BULK_DELETE_MAX} عنصر في الدفعة الواحدة.",
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        qs = list(self.get_queryset().filter(id__in=ids))
        found_ids = {str(obj.id) for obj in qs}
        missing = [str(i) for i in ids if str(i) not in found_ids]

        # Pre-check ALL object permissions BEFORE any write.
        # Raises PermissionDenied(403) → nothing is touched.
        for obj in qs:
            self.check_object_permissions(request, obj)

        blocked: list[dict] = []
        try:
            with transaction.atomic():
                for obj in qs:
                    try:
                        self.perform_destroy(obj)
                    except (RestrictedError, ProtectedError):
                        blocked.append({"id": str(obj.id), "label": str(obj)})
                        raise
        except (RestrictedError, ProtectedError):
            return Response(
                {
                    "error": {
                        "status": 400,
                        "detail": (
                            f"لا يمكن حذف {len(blocked)} عنصر — توجد بيانات مرتبطة به. "
                            "لم يُحذف أي شيء من الدفعة."
                        ),
                        "blocked": blocked,
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {"deleted": sorted(found_ids), "missing": missing},
            status=status.HTTP_200_OK,
        )


class YearAwareViewSet(TenantScopedViewSet):
    """Apply academic-year write rules to tenant-scoped resources."""

    draft_write_allowed = False
    block_create_while_closing = False
    lifecycle_managed_actions = set()
    _standard_write_actions = {"create", "update", "partial_update", "destroy"}

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if (
            request.method not in ("GET", "HEAD", "OPTIONS")
            and getattr(self, "action", None) not in self._standard_write_actions
            and getattr(self, "action", None) not in self.lifecycle_managed_actions
        ):
            lookup_url_kwarg = self.lookup_url_kwarg or self.lookup_field
            lookup_value = self.kwargs.get(lookup_url_kwarg)
            instance = None
            if lookup_value is not None:
                instance = (
                    self.get_queryset()
                    .filter(**{self.lookup_field: lookup_value})
                    .first()
                )
            self._check_year_writable(instance=instance)

    def get_active_year(self):
        """Resolve the year this request operates within."""
        from apps.academics.models import AcademicYear

        tenant = getattr(self.request, "tenant", None)
        if tenant is None:
            return None

        year_id = self.request.query_params.get("academic_year")
        if year_id:
            return (
                AcademicYear.objects.for_tenant(tenant)
                .filter(id=year_id)
                .first()
            )

        body_year = getattr(self.request, "data", {}).get("academic_year")
        if body_year:
            return AcademicYear.objects.for_tenant(tenant).filter(id=body_year).first()

        return (
            AcademicYear.objects.for_tenant(tenant)
            .filter(status=AcademicYear.Status.ACTIVE)
            .first()
        )

    def _check_year_writable(self, *, instance=None, validated_data=None):
        """Check the year attached to the object before falling back to active."""
        from apps.academics.models import AcademicYear
        from rest_framework.exceptions import PermissionDenied

        instance_year = self._year_from_scope(instance)
        target_year = self._year_from_scope(validated_data)
        years = [year for year in (instance_year, target_year) if year]

        if not years:
            year = self._year_from_request() or self.get_active_year()
            if year is None:
                from apps.academics.models import AcademicYear

                tenant = getattr(self.request, "tenant", None)
                if tenant is not None:
                    for year_status in (
                        AcademicYear.Status.CLOSING,
                        AcademicYear.Status.DRAFT,
                        AcademicYear.Status.ARCHIVED,
                    ):
                        year = (
                            AcademicYear.objects.for_tenant(tenant)
                            .filter(status=year_status)
                            .order_by("-start_date")
                            .first()
                        )
                        if year is not None:
                            break
            if year:
                years.append(year)

        # Refuse writes if either the existing or target year is locked.
        unique_years = {str(year.pk): year for year in years}
        for year in unique_years.values():
            if year.status == AcademicYear.Status.ARCHIVED:
                raise PermissionDenied(
                    f"السنة الدراسية «{year.name}» مؤرشفة للقراءة فقط. "
                    "لا يمكن التعديل على بياناتها."
                )
            if (
                year.status == AcademicYear.Status.DRAFT
                and not self.draft_write_allowed
            ):
                raise PermissionDenied(
                    f"السنة الدراسية «{year.name}» قيد الإعداد. "
                    "العمليات التعليمية متاحة بعد تفعيل السنة."
                )
            if (
                year.status == AcademicYear.Status.CLOSING
                and self.block_create_while_closing
                and getattr(self, "action", None) == "create"
            ):
                raise PermissionDenied(
                    f"السنة الدراسية «{year.name}» قيد الإغلاق. "
                    "لا يمكن إنشاء تسجيلات جديدة."
                )

    def _year_from_scope(self, value):
        """Find a year through the direct academic-year relation or parent scope."""
        if value is None:
            return None

        if isinstance(value, dict):
            for key in (
                "academic_year",
                "group",
                "course",
                "term",
                "assessment",
                "chapter",
                "lesson",
            ):
                year = self._year_from_scope(value.get(key))
                if year is not None:
                    return year
            return None

        from apps.academics.models import AcademicYear

        if isinstance(value, AcademicYear):
            return value

        year = getattr(value, "academic_year", None)
        if isinstance(year, AcademicYear):
            return year

        for field in ("group", "course", "term", "assessment", "chapter", "lesson"):
            year = self._year_from_scope(getattr(value, field, None))
            if year is not None:
                return year
        return None

    def _year_from_request(self):
        """Resolve an explicitly selected year for unbound requests."""
        from apps.academics.models import AcademicYear

        tenant = getattr(self.request, "tenant", None)
        if tenant is None:
            return None
        year_id = self.request.query_params.get("academic_year")
        if not year_id:
            year_id = getattr(self.request, "data", {}).get("academic_year")
        if not year_id:
            return None
        return AcademicYear.objects.for_tenant(tenant).filter(pk=year_id).first()

    def perform_create(self, serializer):
        self._check_year_writable(validated_data=serializer.validated_data)
        super().perform_create(serializer)

    def perform_update(self, serializer):
        self._check_year_writable(
            instance=serializer.instance,
            validated_data=serializer.validated_data,
        )
        super().perform_update(serializer)

    def perform_destroy(self, instance):
        self._check_year_writable(instance=instance)
        super().perform_destroy(instance)


class SetupStatusView(TenantContextMixin, APIView):
    """GET /api/v1/setup-status/ — onboarding progress for the current tenant.

    F-07 FIX (Milestone 0): previously any authenticated tenant member
    could fetch this — which returns `counts.total_students`,
    `counts.total_teachers`, and full setup progress. Restricted to
    OWNER/ADMIN.
    """

    permission_classes = [IsAuthenticated, IsTenantMember, HasRole("OWNER", "ADMIN")]

    def get(self, request):
        return Response(get_setup_status(request.tenant))


class HealthCheckView(APIView):
    """GET /health/ — liveness & readiness probe for the platform.

    M3 fix: the previous version ran `SELECT COUNT(*) FROM django_migrations`
    on every hit, which is unnecessary IO on a public, unthrottled
    endpoint. Migrations presence is checked once at deploy time, not on
    every health probe. A simple `SELECT 1` proves DB reachability.
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        checks = {"db": False}

        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()
                checks["db"] = True
        except Exception:  # noqa: BLE001
            pass

        healthy = checks["db"]
        return JsonResponse(
            {"status": "ok" if healthy else "degraded", "checks": checks},
            status=200 if healthy else 503,
        )