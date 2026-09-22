from django.db import models, transaction
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.models import User
from apps.audit.services import log_action
from apps.common.permissions import IsAdminForWriteActions
from apps.common.views import TenantScopedViewSet

from .models import Enrollment, TeacherAssignment
from .serializers import EnrollmentSerializer, PromotionRequestSerializer, TeacherAssignmentSerializer


class TeacherAssignmentViewSet(TenantScopedViewSet):
    queryset = TeacherAssignment.objects.all()
    serializer_class = TeacherAssignmentSerializer
    permission_classes = TenantScopedViewSet.permission_classes + [IsAdminForWriteActions]
    filterset_fields = ["teacher", "course"]


class EnrollmentViewSet(TenantScopedViewSet):
    """Read access is role-scoped (spec #12/#13), not just tenant-scoped:
    OWNER/ADMIN see every enrollment in the tenant; TEACHER sees only
    students in groups they're assigned to (directly, or via a
    whole-grade TeacherAssignment with no groups narrowed); STUDENT sees
    only their own. Write stays OWNER/ADMIN-only via IsAdminForWriteActions,
    same as the rest of the academic structure."""

    queryset = Enrollment.objects.all()
    serializer_class = EnrollmentSerializer
    permission_classes = TenantScopedViewSet.permission_classes + [IsAdminForWriteActions]
    filterset_fields = ["group", "academic_year", "status"]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user

        if user.role in (User.Role.OWNER, User.Role.ADMIN):
            return qs
        if user.role == User.Role.STUDENT:
            return qs.filter(student=user)
        if user.role == User.Role.TEACHER:
            assignments = TeacherAssignment.objects.for_tenant(self.request.tenant).filter(teacher=user)
            narrowed_group_ids = assignments.filter(groups__isnull=False).values_list("groups__id", flat=True)
            whole_grade_ids = assignments.filter(groups__isnull=True).values_list(
                "course__grade_id", flat=True
            )
            return qs.filter(
                models.Q(group_id__in=list(narrowed_group_ids))
                | models.Q(group__grade_id__in=list(whole_grade_ids))
            )
        return qs.none()

    @action(detail=False, methods=["post"])
    def promote(self, request):
        """POST /api/v1/enrollments/promote/ — spec #25: Preview ->
        Validation -> Confirmation -> Atomic Transaction, all in one
        endpoint: `dry_run: true` runs every validation and returns what
        *would* happen without writing anything (the "Preview" step);
        `dry_run: false` (default) does the same validation, then commits
        every item in a single transaction — one bad item fails the
        whole batch, nothing partially applied. OWNER/ADMIN-only, enforced
        the same way every other write is: IsAdminForWriteActions checks
        the HTTP method, and this is a POST like any other."""
        self.check_permissions(request)
        serializer = PromotionRequestSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)

        target_year = serializer.validated_data["target_academic_year"]
        dry_run = serializer.validated_data["dry_run"]
        items = serializer.validated_data["items"]

        def describe(item, new_enrollment=None):
            enrollment = item["enrollment"]
            target_group = item.get("target_group")
            return {
                "student": str(enrollment.student_id),
                "from_enrollment": str(enrollment.id),
                "action": item["action"],
                "to_group": str(target_group.id) if target_group else None,
                "to_academic_year": str(target_year.id) if item["action"] != "GRADUATE" else None,
                "new_enrollment": str(new_enrollment.id) if new_enrollment else None,
            }

        if dry_run:
            return Response({"dry_run": True, "results": [describe(item) for item in items]})

        results = []
        with transaction.atomic():
            for item in items:
                enrollment = item["enrollment"]
                action_name = item["action"]
                if action_name == "GRADUATE":
                    enrollment.status = Enrollment.Status.GRADUATED
                    enrollment.save(update_fields=["status"])
                    results.append(describe(item))
                    continue

                new_enrollment = Enrollment.objects.create(
                    tenant=enrollment.tenant,
                    student=enrollment.student,
                    group=item["target_group"],
                    academic_year=target_year,
                    status=Enrollment.Status.ACTIVE,
                )
                if action_name == "TRANSFER":
                    enrollment.status = Enrollment.Status.TRANSFERRED
                    enrollment.save(update_fields=["status"])
                results.append(describe(item, new_enrollment=new_enrollment))

        log_action(
            actor=request.user,
            tenant=request.tenant,
            action="enrollment.promoted",
            metadata={"target_academic_year": str(target_year.id), "count": len(results)},
        )
        return Response({"dry_run": False, "results": results}, status=status.HTTP_201_CREATED)
