from django.db import models as django_models
from django.db.models.deletion import RestrictedError
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from apps.accounts.models import User
from apps.audit.services import log_action
from apps.common.permissions import (
    IsCreatorOrAdmin,
    IsStaffForWriteActions,
    IsStaffMember,
)
from apps.common.views import TenantScopedViewSet, YearAwareViewSet
from apps.notifications.services import notify
from apps.tenants.permissions import CanApproveQuestions, user_can

from .filters import QuestionFilter
from .models import Question, QuestionBank
from .serializers import QuestionBankSerializer, QuestionSerializer


class QuestionBankViewSet(YearAwareViewSet):
    queryset = QuestionBank.objects.all()
    serializer_class = QuestionBankSerializer
    permission_classes = TenantScopedViewSet.permission_classes + [
        IsStaffMember,
        IsStaffForWriteActions,
        IsCreatorOrAdmin,
    ]
    filterset_fields = ["subject", "grade", "is_archived"]

    def perform_create(self, serializer):
        super().perform_create(serializer)
        log_action(
            actor=self.request.user,
            tenant=self.request.tenant,
            action="question_bank.created",
            obj=serializer.instance,
            metadata={"name": serializer.instance.name},
        )

    def perform_update(self, serializer):
        super().perform_update(serializer)
        log_action(
            actor=self.request.user,
            tenant=self.request.tenant,
            action="question_bank.updated",
            obj=serializer.instance,
        )

    def perform_destroy(self, instance):
        log_action(
            actor=self.request.user,
            tenant=self.request.tenant,
            action="question_bank.deleted",
            obj=instance,
        )
        super().perform_destroy(instance)

    def destroy(self, request, *args, **kwargs):
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

    @action(detail=True, methods=["post"], url_path="move-questions")
    def move_questions(self, request, pk=None):
        """Move all questions from this bank to another bank."""
        source_bank = self.get_object()
        target_bank_id = request.data.get("target_bank")

        if not target_bank_id:
            return Response(
                {"error": {"detail": "يجب تحديد بنك الهدف."}}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            target_bank = QuestionBank.objects.for_tenant(request.tenant).get(id=target_bank_id)
        except QuestionBank.DoesNotExist:
            return Response(
                {"error": {"detail": "بنك الهدف غير موجود."}}, status=status.HTTP_404_NOT_FOUND
            )

        if source_bank.id == target_bank.id:
            return Response(
                {"error": {"detail": "لا يمكن النقل لنفس البنك."}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Perform the move
        moved_count = Question.objects.filter(bank=source_bank).update(bank=target_bank)

        return Response(
            {
                "message": f"تم نقل {moved_count} سؤال بنجاح.",
                "moved_count": moved_count,
                "target_bank": target_bank.name,
            }
        )


class QuestionViewSet(YearAwareViewSet):
    """Read is staff-only and, for TEACHER, further narrowed to "my own
    questions (any status) plus every APPROVED question tenant-wide".

    Wave D0c-1 — server-side search + filters + ordering + stats action.
    Wave D1a — bulk import (template + import actions).
    """

    queryset = Question.objects.all()
    serializer_class = QuestionSerializer
    filterset_class = QuestionFilter
    search_fields = ["text", "topic", "explanation"]
    ordering_fields = ["created_at", "updated_at", "points", "text"]
    ordering = ["-created_at"]

    def perform_create(self, serializer):
        self._ensure_can_create_questions()
        super().perform_create(serializer)
        log_action(
            actor=self.request.user,
            tenant=self.request.tenant,
            action="question.created",
            obj=serializer.instance,
            metadata={"question_type": serializer.instance.question_type},
        )

    def perform_update(self, serializer):
        super().perform_update(serializer)
        log_action(
            actor=self.request.user,
            tenant=self.request.tenant,
            action="question.updated",
            obj=serializer.instance,
        )

    def perform_destroy(self, instance):
        log_action(
            actor=self.request.user,
            tenant=self.request.tenant,
            action="question.deleted",
            obj=instance,
        )
        super().perform_destroy(instance)

    def destroy(self, request, *args, **kwargs):
        """L-5: a Question linked to any AssessmentQuestion has
        on_delete=RESTRICT. Convert raw 500 → clean 400."""
        try:
            return super().destroy(request, *args, **kwargs)
        except RestrictedError:
            return Response(
                {
                    "error": {
                        "status": 400,
                        "detail": (
                            "لا يمكن حذف سؤال مرتبط بامتحان. احذفه من الامتحان "
                            "أولًا، أو أرشفه (is_archived)."
                        ),
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

    def get_permissions(self):
        if self.action in ("approve", "reject"):
            permission_classes = [
                p() for p in TenantScopedViewSet.permission_classes + [CanApproveQuestions]
            ]
        elif self.action in ("import_template", "import_questions"):
            permission_classes = [
                p()
                for p in TenantScopedViewSet.permission_classes
                + [IsStaffMember, IsStaffForWriteActions]
            ]
        elif self.action == "duplicate":
            # Duplicate creates a NEW object owned by the caller — it's not an
            # edit of the source. get_object() already applies visibility
            # (teacher sees own drafts + all approved), so we deliberately do
            # NOT add IsCreatorOrAdmin here.
            permission_classes = [
                p()
                for p in TenantScopedViewSet.permission_classes
                + [IsStaffMember, IsStaffForWriteActions]
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
        return qs.filter(
            django_models.Q(created_by=user)
            | django_models.Q(review_status=Question.ReviewStatus.APPROVED)
        )

    def _ensure_can_create_questions(self):
        if self.request.user.role == User.Role.TEACHER and not user_can(
            self.request.user, "teachers_can_create_questions"
        ):
            raise PermissionDenied("إنشاء الأسئلة غير مسموح لك حسب إعدادات المؤسسة.")

    @action(detail=False, methods=["get"])
    def stats(self, request):
        """GET /questions/stats/ — counts per review status + per type."""
        qs = self.get_queryset()
        return Response(
            {
                "total": qs.count(),
                "pending": qs.filter(review_status=Question.ReviewStatus.PENDING).count(),
                "approved": qs.filter(review_status=Question.ReviewStatus.APPROVED).count(),
                "rejected": qs.filter(review_status=Question.ReviewStatus.REJECTED).count(),
                "by_type": {
                    "MCQ": qs.filter(question_type=Question.QuestionType.MCQ).count(),
                    "TRUE_FALSE": qs.filter(question_type=Question.QuestionType.TRUE_FALSE).count(),
                    "SHORT_ANSWER": qs.filter(
                        question_type=Question.QuestionType.SHORT_ANSWER
                    ).count(),
                    "ESSAY": qs.filter(question_type=Question.QuestionType.ESSAY).count(),
                },
            }
        )

    # ====================================================================
    # Wave D1a — bulk import
    # ====================================================================

    @action(detail=False, methods=["get"], url_path="import_template")
    def import_template(self, request):
        """GET /questions/import_template/ — download an XLSX template."""
        from .import_service import build_template_xlsx

        buf = build_template_xlsx()
        response = HttpResponse(
            buf.getvalue(),
            content_type=("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
        )
        response["Content-Disposition"] = 'attachment; filename="questions_template.xlsx"'
        return response

    @action(
        detail=False,
        methods=["post"],
        url_path="import",
        parser_classes=[MultiPartParser, FormParser],
    )
    def import_questions(self, request):
        """POST /questions/import/ — bulk create questions from CSV/XLSX.

        Form fields:
          - file: CSV or XLSX
          - dry_run: 'true' for preview, otherwise commit
        """
        from apps.billing.services import require_feature

        self._ensure_can_create_questions()
        if request.user.role == User.Role.ADMIN and not user_can(
            request.user, "enable_bulk_import"
        ):
            raise PermissionDenied("الاستيراد الجماعي غير مسموح للمسؤول حسب إعدادات المؤسسة.")
        require_feature(request.tenant, "bulk_import")

        from .import_service import (
            MAX_IMPORT_BYTES,
            REQUIRED_HEADERS,
            validate_rows,
        )
        from .import_service import (
            import_questions as do_import,
        )

        upload = request.FILES.get("file")
        dry_run = str(request.data.get("dry_run", "false")).lower() in (
            "true",
            "1",
            "yes",
        )

        if upload is None:
            return Response(
                {"error": {"status": 400, "detail": "ملف Excel أو CSV مطلوب."}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if upload.size > MAX_IMPORT_BYTES:
            return Response(
                {
                    "error": {
                        "status": 400,
                        "detail": (
                            f"حجم الملف ({upload.size // (1024 * 1024)} ميجابايت) "
                            f"يتجاوز الحد المسموح "
                            f"({MAX_IMPORT_BYTES // (1024 * 1024)} ميجابايت)."
                        ),
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            from .import_service import _read_rows

            rows = _read_rows(upload.read())
        except Exception as exc:  # noqa: BLE001 — user-facing parse error
            return Response(
                {
                    "error": {
                        "status": 400,
                        "detail": f"تعذّر قراءة الملف: {exc}",
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not rows:
            return Response(
                {
                    "error": {
                        "status": 400,
                        "detail": "الملف فارغ أو لا يحتوي على بيانات.",
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        sample = rows[0]
        missing = REQUIRED_HEADERS - set(sample.keys())
        if missing:
            return Response(
                {
                    "error": {
                        "status": 400,
                        "detail": f"الأعمدة الناقصة: {', '.join(sorted(missing))}",
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        analysis = validate_rows(request.tenant, rows)

        summary = {
            "total": len(analysis),
            "valid": sum(1 for r in analysis if r.status == "valid"),
            "errors": sum(1 for r in analysis if r.status == "error"),
        }

        rows_payload = [
            {
                "row": r.row,
                "bank_name": r.bank_name,
                "text": r.text,
                "question_type": r.question_type,
                "difficulty": r.difficulty,
                "points": r.points,
                "status": r.status,
                "errors": r.errors,
            }
            for r in analysis
        ]

        if dry_run:
            return Response({"dry_run": True, "summary": summary, "rows": rows_payload})

        if summary["errors"] > 0:
            return Response(
                {
                    "error": {
                        "status": 400,
                        "detail": (
                            f"لا يمكن الاستيراد — {summary['errors']} سطر به أخطاء. "
                            "صحّح الملف وأعد المحاولة."
                        ),
                    },
                    "summary": summary,
                    "rows": rows_payload,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        result = do_import(request.tenant, analysis, author=request.user)

        log_action(
            actor=request.user,
            tenant=request.tenant,
            action="questions.bulk_imported",
            metadata={
                "total_rows": summary["total"],
                **{k: v for k, v in result.items() if k != "new_bank_names"},
            },
        )

        return Response(
            {"dry_run": False, "summary": summary, "result": result},
            status=status.HTTP_201_CREATED,
        )

    # ====================================================================
    # Review actions
    # ====================================================================

    def _review(self, request, pk, new_status):
        question = self.get_object()
        if question.created_by_id == request.user.id:
            return Response(
                {
                    "error": {
                        "status": 403,
                        "detail": "لا يمكنك مراجعة سؤال أنشأته بنفسك.",
                    }
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        question.review_status = new_status
        question.reviewed_by = request.user
        question.reviewed_at = timezone.now()
        question.review_note = request.data.get("review_note", "")
        question.save(
            update_fields=[
                "review_status",
                "reviewed_by",
                "reviewed_at",
                "review_note",
                "updated_at",
            ]
        )
        log_action(
            actor=request.user,
            tenant=request.tenant,
            action=f"question.{new_status.lower()}",
            obj=question,
            metadata={"review_note": question.review_note},
        )
        if question.created_by_id and question.created_by_id != request.user.id:
            action_arabic = "اعتُمد" if new_status == "APPROVED" else "رُفض"
            notify(
                question.created_by,
                notif_type=(
                    "QUESTION_APPROVED" if new_status == "APPROVED" else "QUESTION_REJECTED"
                ),
                title=f"تمت مراجعة سؤالك — {action_arabic}",
                message=(
                    question.review_note if question.review_note else f"سؤالك: {question.text[:80]}"
                ),
                link="/questions",
            )
        return Response(self.get_serializer(question).data)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        return self._review(request, pk, Question.ReviewStatus.APPROVED)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        return self._review(request, pk, Question.ReviewStatus.REJECTED)

    @action(detail=True, methods=["post"])
    def duplicate(self, request, pk=None):
        """POST /questions/{id}/duplicate/ — clone into a new PENDING question.

        Uses `get_object()` so the same permission checks that gate
        editing apply here: a TEACHER can only duplicate questions they
        can already see (own drafts + all approved). OWNER/ADMIN can
        duplicate anything in the tenant.

        The duplicate lands in the caller's name, resets to PENDING, and
        drops from the reviewer's queue — see `duplicate_question()` for
        the full policy.
        """
        from .services import duplicate_question

        self._ensure_can_create_questions()
        source = self.get_object()
        copy = duplicate_question(source, actor=request.user)

        log_action(
            actor=request.user,
            tenant=request.tenant,
            action="question.duplicated",
            obj=copy,
            metadata={
                "source_id": str(source.id),
                "source_text": source.text[:80],
            },
        )

        return Response(
            self.get_serializer(copy).data,
            status=status.HTTP_201_CREATED,
        )
