from django.db import models as django_models
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.models import User
from apps.audit.services import log_action
from apps.common.permissions import IsCreatorOrAdmin, IsStaffForWriteActions
from apps.common.views import TenantScopedViewSet

from .models import Assessment, AssessmentQuestion, AssessmentTarget
from .serializers import (
    AssessmentForStudentSerializer,
    AssessmentQuestionSerializer,
    AssessmentSerializer,
    AssessmentTargetSerializer,
)
from .services import visible_assessments_for_student


class AssessmentViewSet(TenantScopedViewSet):
    """Visibility mirrors Question's shape (Phase 7): OWNER/ADMIN see
    everything; TEACHER sees their own (any status) plus every PUBLISHED
    assessment tenant-wide; STUDENT sees only PUBLISHED assessments that
    target them and gets the lean AssessmentForStudentSerializer shape."""

    queryset = Assessment.objects.all()
    permission_classes = TenantScopedViewSet.permission_classes + [IsStaffForWriteActions, IsCreatorOrAdmin]
    filterset_fields = ["assessment_type", "status"]

    def get_serializer_class(self):
        if self.request.user.role == User.Role.STUDENT:
            return AssessmentForStudentSerializer
        return AssessmentSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.role in (User.Role.OWNER, User.Role.ADMIN):
            return qs
        if user.role == User.Role.STUDENT:
            return visible_assessments_for_student(self.request.tenant, user)
        return qs.filter(
            django_models.Q(created_by=user) | django_models.Q(status=Assessment.Status.PUBLISHED)
        )

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        """DRAFT -> PUBLISHED only once complete (spec #34's 'Review &
        Publish'): >=1 question, >=1 target, every linked question still
        APPROVED (re-checked — it may have been rejected since linking)."""
        assessment = self.get_object()
        if assessment.status != Assessment.Status.DRAFT:
            return Response(
                {"error": {"status": 400, "detail": "لا يمكن نشر امتحان ليس في حالة مسودة."}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        errors = {}
        links = assessment.assessment_questions.select_related("question")
        if not links.exists():
            errors["questions"] = "يجب إضافة سؤال واحد على الأقل قبل النشر."
        else:
            unapproved = [
                str(link.question_id) for link in links if link.question.review_status != "APPROVED"
            ]
            if unapproved:
                errors["questions"] = f"بعض الأسئلة لم تعد معتمدة: {', '.join(unapproved)}"
        if not assessment.targets.exists():
            errors["targets"] = "يجب تحديد فئة مستهدفة واحدة على الأقل قبل النشر."
        if errors:
            return Response({"error": {"status": 400, "detail": errors}}, status=status.HTTP_400_BAD_REQUEST)

        assessment.status = Assessment.Status.PUBLISHED
        assessment.published_at = timezone.now()
        assessment.save(update_fields=["status", "published_at", "updated_at"])
        log_action(actor=request.user, tenant=request.tenant, action="assessment.published", obj=assessment)
        return Response(AssessmentSerializer(assessment).data)


class AssessmentQuestionViewSet(TenantScopedViewSet):
    """Its own endpoint filtered by ?assessment=<id>, same pattern as
    Term/Group. `assessment` and `question` are tenant-scoped fields, so a
    foreign-tenant object is never even a valid choice."""

    queryset = AssessmentQuestion.objects.all()
    serializer_class = AssessmentQuestionSerializer
    permission_classes = TenantScopedViewSet.permission_classes + [IsStaffForWriteActions]
    filterset_fields = ["assessment", "question"]


class AssessmentTargetViewSet(TenantScopedViewSet):
    queryset = AssessmentTarget.objects.all()
    serializer_class = AssessmentTargetSerializer
    permission_classes = TenantScopedViewSet.permission_classes + [IsStaffForWriteActions]
    filterset_fields = ["assessment", "target_type"]
