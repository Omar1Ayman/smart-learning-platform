from django.db import IntegrityError, models, transaction
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.response import Response

from apps.accounts.models import User
from apps.audit.services import log_action
from apps.common.permissions import IsAdminForWriteActions
from apps.common.views import TenantScopedViewSet, YearAwareViewSet
from apps.tenants.permissions import CanManageTeachers

from .models import Enrollment, TeacherAssignment
from .serializers import (
    EnrollmentSerializer,
    PromotionRequestSerializer,
    TeacherAssignmentSerializer,
    TermTransitionSerializer,
)
from .services import transition_term


class TeacherAssignmentViewSet(YearAwareViewSet):
    """Wave D0c-2c — server-side search + ordering."""

    queryset = TeacherAssignment.objects.all()
    serializer_class = TeacherAssignmentSerializer
    permission_classes = TenantScopedViewSet.permission_classes + [
        IsAdminForWriteActions,
        CanManageTeachers,
    ]
    filterset_fields = ["teacher", "course"]
    search_fields = [
        "teacher__email",
        "teacher__first_name",
        "teacher__last_name",
        "course__name",
        "course__subject__name",
    ]
    ordering_fields = [
        "created_at",
        "teacher__email",
        "teacher__first_name",
        "course__name",
    ]
    ordering = ["-created_at"]


class EnrollmentViewSet(YearAwareViewSet):
    """Read access is role-scoped (spec #12/#13), not just tenant-scoped:
    OWNER/ADMIN see every enrollment in the tenant; TEACHER sees only
    students in groups they're assigned to; STUDENT sees only their own.

    Write stays OWNER/ADMIN-only via IsAdminForWriteActions.

    Wave D0c-2b — server-side search + ordering added so the frontend
    can search by student name/email and sort by enrolled_at/student
    without loading every row client-side.
    """

    queryset = Enrollment.objects.all()
    serializer_class = EnrollmentSerializer
    block_create_while_closing = True
    lifecycle_managed_actions = {"promote"}
    permission_classes = TenantScopedViewSet.permission_classes + [IsAdminForWriteActions]
    filterset_fields = ["group", "academic_year", "status", "term", "group__grade"]
    search_fields = [
        "student__email",
        "student__first_name",
        "student__last_name",
        "group__name",
    ]
    ordering_fields = [
        "enrolled_at",
        "student__first_name",
        "student__email",
        "academic_year__start_date",
        "status",
    ]
    ordering = ["-enrolled_at"]

    def get_queryset(self):
        """CRIT#1 fix (Wave Zero follow-up):

        The previous version returned `qs` immediately after applying the
        `?grade=` filter, making every subsequent role check dead code.
        A STUDENT calling `GET /api/v1/enrollments/` received the *entire*
        tenant's enrollment list — a full IDOR.

        Current shape: each role branch applies the appropriate scope
        first, then (where relevant) narrows by `?grade=`. The
        `?grade=` param narrows the caller's allowed scope; it never
        widens it. Unknown roles fall through to `qs.none()` (fail-closed).
        """
        qs = super().get_queryset()
        user = self.request.user
        grade_id = self.request.query_params.get("grade")

        # OWNER / ADMIN — full tenant scope, optionally narrowed by grade.
        if user.role in (User.Role.OWNER, User.Role.ADMIN):
            if grade_id:
                qs = qs.filter(group__grade_id=grade_id)
            return qs

        # STUDENT — own enrollments only. `?grade=` is ignored (their
        # scope is already the narrowest possible).
        if user.role == User.Role.STUDENT:
            return qs.filter(student=user)

        # TEACHER — narrowed to their assignment scope, then optionally
        # further narrowed by grade.
        if user.role == User.Role.TEACHER:
            assignments = TeacherAssignment.objects.for_tenant(self.request.tenant).filter(
                teacher=user
            )
            narrowed_group_ids = list(
                assignments.filter(groups__isnull=False).values_list("groups__id", flat=True)
            )
            whole_grade_ids = list(
                assignments.filter(groups__isnull=True).values_list("course__grade_id", flat=True)
            )
            scoped = qs.filter(
                models.Q(group_id__in=narrowed_group_ids)
                | models.Q(group__grade_id__in=whole_grade_ids)
            )
            if grade_id:
                scoped = scoped.filter(group__grade_id=grade_id)
            return scoped.distinct()

        # Fail-closed for any future role (e.g. PARENT) that isn't
        # explicitly handled above.
        return qs.none()

    def perform_create(self, serializer):
        super().perform_create(serializer)
        enrollment = serializer.instance

        from apps.notifications.services import notify

        notify(
            enrollment.student,
            notif_type="ENROLLMENT_CREATED",
            title="مرحبًا بك في المنصة",
            message=f"تم تسجيلك في المجموعة: {enrollment.group.name}.",
            link="/dashboard",
        )

    @action(detail=False, methods=["post"])
    def promote(self, request):
        """POST /api/v1/enrollments/promote/ — spec #25:
        Preview -> Validation -> Confirmation -> Atomic Transaction."""
        self.check_permissions(request)
        serializer = PromotionRequestSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)

        target_year = serializer.validated_data["target_academic_year"]
        dry_run = serializer.validated_data["dry_run"]
        items = serializer.validated_data["items"]

        if not dry_run:
            from apps.academics.models import AcademicYear

            if target_year.status != AcademicYear.Status.ACTIVE:
                raise PermissionDenied("يجب تفعيل السنة الهدف قبل تنفيذ ترقية أو نقل الطلاب.")
            for item in items:
                source_year = item["enrollment"].academic_year
                if source_year.status in (
                    AcademicYear.Status.DRAFT,
                    AcademicYear.Status.ARCHIVED,
                ):
                    raise PermissionDenied(
                        f"لا يمكن تعديل تسجيلات السنة «{source_year.name}» في حالتها الحالية."
                    )

        def describe(item, new_enrollment=None):
            enrollment = item["enrollment"]
            target_group = item.get("target_group")
            return {
                "student": str(enrollment.student_id),
                "from_enrollment": str(enrollment.id),
                "action": item["action"],
                "to_group": str(target_group.id) if target_group else None,
                "to_academic_year": (str(target_year.id) if item["action"] != "GRADUATE" else None),
                "new_enrollment": (str(new_enrollment.id) if new_enrollment else None),
            }

        if dry_run:
            return Response({"dry_run": True, "results": [describe(item) for item in items]})

        results = []
        try:
            with transaction.atomic():
                enrollment_ids = [item["enrollment"].id for item in items]
                locked = {
                    str(e.id): e
                    for e in Enrollment.objects.for_tenant(request.tenant)
                    .select_for_update()
                    .filter(id__in=enrollment_ids)
                }

                for item in items:
                    # M9 fix: `.get()` + None check converts a race-condition
                    # KeyError (500) into a clean 400 with a clear message.
                    enrollment = locked.get(str(item["enrollment"].id))
                    if enrollment is None:
                        raise DRFValidationError(
                            f"التسجيل {item['enrollment'].id} غير موجود "
                            "أو خارج مؤسستك. أعد تحميل الصفحة."
                        )

                    action_name = item["action"]

                    if action_name == "GRADUATE":
                        enrollment.status = Enrollment.Status.GRADUATED
                        enrollment.save(update_fields=["status"])
                        results.append(describe(item))
                        continue

                    new_enrollment = Enrollment(
                        tenant=request.tenant,
                        student=enrollment.student,
                        group=item["target_group"],
                        academic_year=target_year,
                        status=Enrollment.Status.ACTIVE,
                    )
                    new_enrollment.full_clean()
                    new_enrollment.save()

                    if action_name in ("PROMOTE", "REPEAT"):
                        enrollment.status = Enrollment.Status.COMPLETED
                    elif action_name == "TRANSFER":
                        enrollment.status = Enrollment.Status.TRANSFERRED
                    enrollment.save(update_fields=["status"])

                    results.append(describe(item, new_enrollment=new_enrollment))

        except IntegrityError:
            return Response(
                {
                    "error": {
                        "status": 400,
                        "detail": (
                            "تعارض: أحد الطلاب تم تسجيله في السنة الهدف "
                            "بالفعل أثناء تنفيذ العملية. أعد تحميل الصفحة "
                            "وراجع القائمة."
                        ),
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        log_action(
            actor=request.user,
            tenant=request.tenant,
            action="enrollment.promoted",
            metadata={
                "target_academic_year": str(target_year.id),
                "count": len(results),
            },
        )
        return Response(
            {"dry_run": False, "results": results},
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], url_path="transition-term")
    def transition_term(self, request, pk=None):
        """POST /enrollments/<id>/transition-term/

        Move a student from their current term enrollment to a new term.
        Same grade, different group (mid-year rebalancing).

        Body: {"target_term": "<uuid>", "target_group": "<uuid>"}
        """
        from rest_framework import status as drf_status

        enrollment = self.get_object()

        serializer = TermTransitionSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)

        try:
            new_enrollment = transition_term(
                enrollment=enrollment,
                target_term=serializer.validated_data["_term_obj"],
                target_group=serializer.validated_data["_group_obj"],
                user=request.user,
            )
        except DRFValidationError as exc:
            detail = exc.detail if hasattr(exc, "detail") else str(exc)
            return Response(
                {"error": {"status": 400, "detail": detail}},
                status=drf_status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            EnrollmentSerializer(new_enrollment, context={"request": request}).data,
            status=drf_status.HTTP_201_CREATED,
        )
