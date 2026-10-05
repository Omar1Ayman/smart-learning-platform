from django.db import models as django_models
from django.db.models.deletion import RestrictedError
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.models import User
from apps.audit.services import log_action
from apps.common.permissions import HasRole, IsCreatorOrAdmin, IsStaffForWriteActions, IsStaffMember
from apps.common.views import TenantScopedViewSet

from .models import Question, QuestionBank
from .serializers import QuestionBankSerializer, QuestionSerializer


class QuestionBankViewSet(TenantScopedViewSet):
    queryset = QuestionBank.objects.all()
    serializer_class = QuestionBankSerializer
    permission_classes = TenantScopedViewSet.permission_classes + [
        IsStaffMember,
        IsStaffForWriteActions,
        IsCreatorOrAdmin,
    ]
    filterset_fields = ["subject", "grade", "is_archived"]

    def destroy(self, request, *args, **kwargs):
        # Question.bank uses on_delete=RESTRICT on purpose (models.py
        # docstring) — a bank with questions in it must not vanish by
        # accident. Turn Django's RestrictedError into a clean 400
        # instead of an unhandled 500 (same principle as Enrollment's
        # duplicate check in Phase 5 — a real DB guarantee still needs a
        # serializer/view-level catch to surface as a normal API error).
        try:
            return super().destroy(request, *args, **kwargs)
        except RestrictedError:
            return Response(
                {
                    "error": {
                        "status": 400,
                        "detail": "لا يمكن حذف بنك أسئلة يحتوي على أسئلة. أرشفه بدلًا من ذلك.",
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )


class QuestionViewSet(TenantScopedViewSet):
    """Read is staff-only and, for TEACHER, further narrowed to "my own
    questions (any status) plus every APPROVED question tenant-wide" —
    a teacher building an assessment later (Phase 8) should be able to
    browse the shared, vetted bank, but not other teachers' unreviewed
    drafts. OWNER/ADMIN see everything, same as the rest of the app."""

    queryset = Question.objects.all()
    serializer_class = QuestionSerializer
    filterset_fields = ["bank", "question_type", "difficulty", "review_status", "is_archived"]

    def get_permissions(self):
        if self.action in ("approve", "reject"):
            permission_classes = [
                p() for p in TenantScopedViewSet.permission_classes + [HasRole("OWNER", "ADMIN")]
            ]
        else:
            permission_classes = [
                p()
                for p in TenantScopedViewSet.permission_classes
                + [IsStaffMember, IsStaffForWriteActions, IsCreatorOrAdmin]
            ]
        return permission_classes

    def get_queryset(self):
        qs = super().get_queryset().prefetch_related("options")
        user = self.request.user
        if user.role in (User.Role.OWNER, User.Role.ADMIN):
            return qs
        # TEACHER only reaches here — STUDENT is already blocked by IsStaffMember.
        return qs.filter(
            django_models.Q(created_by=user) | django_models.Q(review_status=Question.ReviewStatus.APPROVED)
        )

    def _review(self, request, pk, new_status):
        question = self.get_object()
        # Nobody approves their own work — stricter than spec #29's literal
        # wording ("a Teacher can't approve their own"), applied regardless
        # of role, on purpose (see PROJECT_MEMORY.md's Phase 7 notes).
        if question.created_by_id == request.user.id:
            return Response(
                {"error": {"status": 403, "detail": "لا يمكنك مراجعة سؤال أنشأته بنفسك."}},
                status=status.HTTP_403_FORBIDDEN,
            )
        question.review_status = new_status
        question.reviewed_by = request.user
        question.reviewed_at = timezone.now()
        question.review_note = request.data.get("review_note", "")
        question.save(
            update_fields=["review_status", "reviewed_by", "reviewed_at", "review_note", "updated_at"]
        )
        log_action(
            actor=request.user,
            tenant=request.tenant,
            action=f"question.{new_status.lower()}",
            obj=question,
            metadata={"review_note": question.review_note},
        )
        return Response(self.get_serializer(question).data)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        return self._review(request, pk, Question.ReviewStatus.APPROVED)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        return self._review(request, pk, Question.ReviewStatus.REJECTED)
