from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.mixins import TenantContextMixin
from apps.common.permissions import HasRole, IsTenantMember

from .services import (
    admin_dashboard,
    admin_reports,
    normalize_days,
    student_dashboard,
    teacher_dashboard,
)


class AdminDashboardView(TenantContextMixin, APIView):
    permission_classes = [IsAuthenticated, IsTenantMember, HasRole("OWNER", "ADMIN")]

    def get(self, request):
        days = normalize_days(request.query_params.get("days"), default=7)
        return Response(admin_dashboard(request.tenant, days=days))


class TeacherDashboardView(TenantContextMixin, APIView):
    permission_classes = [IsAuthenticated, IsTenantMember, HasRole("TEACHER")]

    def get(self, request):
        days = normalize_days(request.query_params.get("days"), default=30)
        return Response(teacher_dashboard(request.tenant, request.user, days=days))


class StudentDashboardView(TenantContextMixin, APIView):
    permission_classes = [IsAuthenticated, IsTenantMember, HasRole("STUDENT")]

    def get(self, request):
        days = normalize_days(request.query_params.get("days"), default=30)
        return Response(student_dashboard(request.tenant, request.user, days=days))


class AdminReportsView(TenantContextMixin, APIView):
    """GET /dashboard/reports/ — operational reports for OWNER/ADMIN.

    Batch 18 (Milestone 5): aggregates attendance, exam, and teacher
    activity data over a configurable range. Admin-only — reports reveal
    cross-tenant-performer data (teacher activity, exam volumes) that a
    regular user shouldn't see.
    """

    permission_classes = [IsAuthenticated, IsTenantMember, HasRole("OWNER", "ADMIN")]

    def get(self, request):
        days = normalize_days(request.query_params.get("days"), default=7)
        return Response(admin_reports(request.tenant, days=days))
