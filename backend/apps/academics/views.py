from apps.common.permissions import IsAdminForWriteActions
from apps.common.views import TenantScopedViewSet

from .models import AcademicYear, Grade, Group, Stage, Subject, Term
from .serializers import (
    AcademicYearSerializer,
    GradeSerializer,
    GroupSerializer,
    StageSerializer,
    SubjectSerializer,
    TermSerializer,
)


class AcademicYearViewSet(TenantScopedViewSet):
    queryset = AcademicYear.objects.all()
    serializer_class = AcademicYearSerializer
    permission_classes = TenantScopedViewSet.permission_classes + [IsAdminForWriteActions]
    filterset_fields = ["is_active"]


class TermViewSet(TenantScopedViewSet):
    queryset = Term.objects.all()
    serializer_class = TermSerializer
    permission_classes = TenantScopedViewSet.permission_classes + [IsAdminForWriteActions]
    filterset_fields = ["academic_year"]


class StageViewSet(TenantScopedViewSet):
    queryset = Stage.objects.all()
    serializer_class = StageSerializer
    permission_classes = TenantScopedViewSet.permission_classes + [IsAdminForWriteActions]


class GradeViewSet(TenantScopedViewSet):
    queryset = Grade.objects.all()
    serializer_class = GradeSerializer
    permission_classes = TenantScopedViewSet.permission_classes + [IsAdminForWriteActions]
    filterset_fields = ["stage"]


class GroupViewSet(TenantScopedViewSet):
    queryset = Group.objects.all()
    serializer_class = GroupSerializer
    permission_classes = TenantScopedViewSet.permission_classes + [IsAdminForWriteActions]
    filterset_fields = ["grade", "academic_year"]


class SubjectViewSet(TenantScopedViewSet):
    queryset = Subject.objects.all()
    serializer_class = SubjectSerializer
    permission_classes = TenantScopedViewSet.permission_classes + [IsAdminForWriteActions]
