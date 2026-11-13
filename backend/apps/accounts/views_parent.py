"""Parent portal endpoints — read-only aggregations + admin linking."""

from django.db.models import Count, Q
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.attendance.models import AttendanceRecord
from apps.common.mixins import TenantContextMixin
from apps.common.permissions import IsTenantMember
from apps.exam_engine.models import ExamAttempt
from apps.people.models import Enrollment

from .models import ParentChild, User
from .permissions_parent import IsParent
from .serializers_parent import (
    ChildDetailSerializer,
    ChildSummarySerializer,
    ParentChildLinkSerializer,
)


def _build_child_summary(student, link):
    """Aggregate one child's high-level stats."""
    enrollment = (
        Enrollment.objects.for_tenant(student.tenant)
        .filter(student=student, status=Enrollment.Status.ACTIVE)
        .select_related("group__grade__stage", "academic_year")
        .order_by("-academic_year__start_date")
        .first()
    )

    attendance = (
        AttendanceRecord.objects.for_tenant(student.tenant)
        .filter(student=student)
        .aggregate(
            total=Count("id"),
            present=Count("id", filter=Q(status="PRESENT")),
            late=Count("id", filter=Q(status="LATE")),
        )
    )
    total_att = attendance["total"] or 0
    attendance_pct = (
        round(((attendance["present"] + attendance["late"]) / total_att) * 100, 1)
        if total_att > 0
        else None
    )

    attempts = ExamAttempt.objects.for_tenant(student.tenant).filter(
        student=student, status__in=["GRADED", "SUBMITTED"]
    )
    graded = [a for a in attempts if a.status == "GRADED" and a.score is not None]
    avg_pct = (
        round(sum(float(a.percentage) for a in graded) / len(graded), 1)
        if graded
        else None
    )

    return {
        "id": student.id,
        "first_name": student.first_name,
        "last_name": student.last_name,
        "email": student.email,
        "student_code": student.student_code,
        "_relationship": link.relationship,
        "_is_primary": link.is_primary,
        "group_name": enrollment.group.name if enrollment else None,
        "grade_name": enrollment.group.grade.name if enrollment else None,
        "stage_name": enrollment.group.grade.stage.name if enrollment else None,
        "academic_year_name": (
            enrollment.academic_year.name if enrollment else None
        ),
        "attendance_pct": attendance_pct,
        "avg_percentage": avg_pct,
        "total_attempts": len(graded),
    }


class ParentChildrenView(TenantContextMixin, APIView):
    """GET /api/v1/parent/children/ — the parent's list of children."""

    permission_classes = [IsAuthenticated, IsTenantMember, IsParent]

    def get(self, request):
        links = (
            ParentChild.objects.filter(tenant=request.tenant, parent=request.user)
            .select_related("student")
            .order_by("-is_primary", "student__first_name")
        )
        if not links:
            return Response([])
        data = [_build_child_summary(link.student, link) for link in links]
        return Response(ChildSummarySerializer(data, many=True).data)


class ParentChildDetailView(TenantContextMixin, APIView):
    """GET /api/v1/parent/children/{student_id}/ — child profile."""

    permission_classes = [IsAuthenticated, IsTenantMember, IsParent]

    def get(self, request, student_id):
        link = (
            ParentChild.objects.filter(
                tenant=request.tenant,
                parent=request.user,
                student_id=student_id,
            )
            .select_related("student")
            .first()
        )
        if link is None:
            return Response(
                {"error": {"status": 404, "detail": "الطالب غير موجود."}},
                status=status.HTTP_404_NOT_FOUND,
            )

        student = link.student
        summary = _build_child_summary(student, link)

        recent_att = (
            AttendanceRecord.objects.for_tenant(request.tenant)
            .filter(student=student)
            .select_related("session__group")
            .order_by("-session__date", "-session__start_time")[:20]
        )
        recent_attendance = [
            {
                "date": r.session.date.isoformat(),
                "start_time": r.session.start_time.strftime("%H:%M"),
                "end_time": r.session.end_time.strftime("%H:%M"),
                "group_name": r.session.group.name,
                "status": r.status,
                "check_in_at": r.check_in_at.isoformat() if r.check_in_at else None,
            }
            for r in recent_att
        ]

        recent_attempts_qs = (
            ExamAttempt.objects.for_tenant(request.tenant)
            .filter(
                student=student,
                status__in=["GRADED", "SUBMITTED", "EXPIRED"],
            )
            .select_related("assessment")
            .order_by("-submitted_at")[:10]
        )
        recent_attempts = [
            {
                "attempt_id": str(a.id),
                "assessment_title": a.assessment.title,
                "attempt_number": a.attempt_number,
                "status": a.status,
                "score": str(a.score) if a.score is not None else None,
                "max_score": str(a.max_score),
                "percentage": round(a.percentage, 1),
                "is_passed": a.is_passed,
                "submitted_at": a.submitted_at.isoformat() if a.submitted_at else None,
            }
            for a in recent_attempts_qs
        ]

        detail = {
            **summary,
            "current_enrollment": (
                {
                    "group_name": summary["group_name"],
                    "grade_name": summary["grade_name"],
                    "stage_name": summary["stage_name"],
                    "academic_year_name": summary["academic_year_name"],
                }
                if summary["group_name"]
                else None
            ),
            "attendance": {
                "total_sessions": len(recent_attendance),
                "percentage": summary["attendance_pct"],
            },
            "exams": {
                "total_graded": summary["total_attempts"],
                "average_percentage": summary["avg_percentage"],
            },
            "recent_attendance": recent_attendance,
            "recent_attempts": recent_attempts,
        }
        return Response(ChildDetailSerializer(detail).data)


class AdminParentLinkViewSet(TenantContextMixin, APIView):
    """Admin-side parent-child linking. Mounted at /api/v1/admin/parent-links/."""

    permission_classes = [IsAuthenticated, IsTenantMember]

    def _check_admin(self, request):
        if request.user.role not in ("OWNER", "ADMIN"):
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("هذا الإجراء متاح لمالك أو مسؤول المؤسسة.")

    def get(self, request):
        """GET ?student=<id> — all parents linked to a student."""
        self._check_admin(request)
        student_id = request.query_params.get("student")
        if not student_id:
            return Response(
                {"error": {"status": 400, "detail": "student مطلوب."}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        links = (
            ParentChild.objects.filter(
                tenant=request.tenant, student_id=student_id
            )
            .select_related("parent")
            .order_by("-is_primary", "relationship")
        )
        return Response(
            [
                {
                    "id": str(link.id),
                    "parent_id": str(link.parent.id),
                    "parent_email": link.parent.email,
                    "parent_name": f"{link.parent.first_name} {link.parent.last_name}".strip()
                    or link.parent.email,
                    "relationship": link.relationship,
                    "is_primary": link.is_primary,
                }
                for link in links
            ]
        )

    def post(self, request):
        """POST {parent, student, relationship?, is_primary?}"""
        self._check_admin(request)
        serializer = ParentChildLinkSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        v = serializer.validated_data

        link = ParentChild.objects.create(
            tenant=request.tenant,
            parent=v["parent_obj"],
            student=v["student_obj"],
            relationship=v["relationship"],
            is_primary=v["is_primary"],
        )
        return Response(
            {
                "id": str(link.id),
                "parent_id": str(link.parent.id),
                "student_id": str(link.student.id),
            },
            status=status.HTTP_201_CREATED,
        )

    def delete(self, request, link_id=None):
        """DELETE /api/v1/admin/parent-links/{link_id}/"""
        self._check_admin(request)
        link = ParentChild.objects.filter(
            tenant=request.tenant, id=link_id
        ).first()
        if link is None:
            return Response(
                {"error": {"status": 404, "detail": "الرابط غير موجود."}},
                status=status.HTTP_404_NOT_FOUND,
            )
        link.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)