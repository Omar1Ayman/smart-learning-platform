import logging

from django.db import models as django_models
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.models import User
from apps.assessments.services import get_targeted_students
from apps.audit.services import log_action
from apps.common.permissions import (
    IsCreatorOrAdmin,
    IsStaffForWriteActions,
    IsStaffMember,
    IsTenantMember,
)
from apps.common.views import TenantScopedViewSet, YearAwareViewSet
from apps.notifications.services import notify_many
from apps.people.models import TeacherAssignment
from apps.tenants.permissions import CanExportTenant, user_can

from .models import Assessment, AssessmentQuestion, AssessmentTarget
from .serializers import (
    AssessmentForStudentSerializer,
    AssessmentQuestionSerializer,
    AssessmentSerializer,
    AssessmentTargetSerializer,
)
from .services import estimate_reach, visible_assessments_for_student

logger = logging.getLogger(__name__)


class AssessmentViewSet(YearAwareViewSet):
    """Unchanged from Phase 8 — visibility mirrors Question's shape."""

    queryset = Assessment.objects.all()
    permission_classes = TenantScopedViewSet.permission_classes + [
        IsStaffForWriteActions,
        IsCreatorOrAdmin,
    ]
    filterset_fields = ["assessment_type", "status"]
    search_fields = ["title", "description"]
    ordering_fields = [
        "created_at",
        "updated_at",
        "title",
        "starts_at",
        "ends_at",
        "status",
    ]
    ordering = ["-created_at"]

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

    def perform_create(self, serializer):
        if self.request.user.role == User.Role.TEACHER and not user_can(
            self.request.user, "teachers_can_create_assessments"
        ):
            raise PermissionDenied("إنشاء الامتحانات غير مسموح لك حسب إعدادات المؤسسة.")
        super().perform_create(serializer)
        log_action(
            actor=self.request.user,
            tenant=self.request.tenant,
            action="assessment.created",
            obj=serializer.instance,
            metadata={"assessment_type": serializer.instance.assessment_type},
        )

    def perform_update(self, serializer):
        super().perform_update(serializer)
        log_action(
            actor=self.request.user,
            tenant=self.request.tenant,
            action="assessment.updated",
            obj=serializer.instance,
        )

    def perform_destroy(self, instance):
        if self.request.user.role == User.Role.ADMIN and not user_can(
            self.request.user, "admins_can_delete_assessments"
        ):
            raise PermissionDenied("حذف الامتحانات غير مسموح للمسؤول حسب إعدادات المؤسسة.")
        if self.request.user.role == User.Role.TEACHER and not user_can(
            self.request.user, "teachers_can_delete_own_assessments"
        ):
            raise PermissionDenied("حذف الامتحانات غير مسموح لك حسب إعدادات المؤسسة.")
        log_action(
            actor=self.request.user,
            tenant=self.request.tenant,
            action="assessment.deleted",
            obj=instance,
        )
        super().perform_destroy(instance)

    def destroy(self, request, *args, **kwargs):
        """L-6 fix (Wave Zero follow-up): an Assessment with ExamAttempt
        rows has `on_delete=RESTRICT` on that FK. Without this catch, DELETE
        would surface as a raw 500 "ProtectedError: Cannot delete...".
        Convert to a clean 400 with a clear "archive instead" recommendation
        (matches the pattern used by QuestionBankViewSet + QuestionViewSet)."""
        from django.db.models.deletion import RestrictedError

        try:
            return super().destroy(request, *args, **kwargs)
        except RestrictedError:
            return Response(
                {
                    "error": {
                        "status": 400,
                        "detail": (
                            "لا يمكن حذف امتحان له محاولات مسجّلة. "
                            "أرشفه (ARCHIVED) بدلاً من ذلك للحفاظ على سجلات الطلاب."
                        ),
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        """POST /assessments/<id>/publish/ — DRAFT → PUBLISHED.

        M2 fix: the notification dispatch is wrapped in try/except so a
        delivery failure (SMTP down, bulk_create chunked insert error)
        cannot undo a successful publish. Otherwise the user would see a
        500, retry, and get "not a draft" — stuck with a published exam
        and no notifications delivered.
        """
        import logging

        logger = logging.getLogger(__name__)

        assessment = self.get_object()
        if request.user.role == User.Role.TEACHER and not request.tenant.get_policy(
            "exam_policy"
        ).get("teachers_can_self_publish", False):
            raise PermissionDenied("نشر الامتحانات مباشرة غير مسموح لك حسب إعدادات المؤسسة.")
        if assessment.status != Assessment.Status.DRAFT:
            return Response(
                {
                    "error": {
                        "status": 400,
                        "detail": "لا يمكن نشر امتحان ليس في حالة مسودة.",
                    }
                },
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
            return Response(
                {"error": {"status": 400, "detail": errors}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        assessment.status = Assessment.Status.PUBLISHED
        assessment.published_at = timezone.now()
        assessment.save(update_fields=["status", "published_at", "updated_at"])
        log_action(
            actor=request.user,
            tenant=request.tenant,
            action="assessment.published",
            obj=assessment,
        )

        # M2: notification failures must not undo a successful publish.
        try:
            students = get_targeted_students(assessment)
            notify_many(
                students,
                notif_type="EXAM_PUBLISHED",
                title=f"امتحان جديد: {assessment.title}",
                message=(
                    f"تم نشر امتحان جديد ({assessment.get_assessment_type_display()}). ابدأ الآن."
                ),
                link="/assessments",
            )
        except Exception:
            logger.exception(
                "Publish succeeded for assessment %s but notifications failed.",
                assessment.id,
            )

        return Response(AssessmentSerializer(assessment).data)

    @action(detail=True, methods=["get"])
    def reach(self, request, pk=None):
        """GET /assessments/<id>/reach/ — how many students this assessment
        reaches, for the wizard's targeting step. Staff-only by virtue of
        the viewset's permissions; a student would not call this."""
        assessment = self.get_object()
        return Response({"students": estimate_reach(assessment)})

    def _check_teacher_results_access(self, assessment):
        user = self.request.user
        if user.role != User.Role.TEACHER or assessment.created_by_id == user.id:
            return
        if user_can(user, "teachers_can_view_all_student_results"):
            return

        subject_grade_pairs = assessment.assessment_questions.filter(
            question__bank__subject__isnull=False,
            question__bank__grade__isnull=False,
        ).values_list("question__bank__subject_id", "question__bank__grade_id")
        assignment_scope = django_models.Q()
        for subject_id, grade_id in subject_grade_pairs:
            assignment_scope |= django_models.Q(
                course__subject_id=subject_id,
                course__grade_id=grade_id,
            )
        has_assignment = (
            bool(subject_grade_pairs)
            and TeacherAssignment.objects.for_tenant(self.request.tenant)
            .filter(teacher=user)
            .filter(assignment_scope)
            .exists()
        )
        if not has_assignment:
            raise PermissionDenied("عرض نتائج هذا الامتحان غير مسموح لك.")

    @action(detail=True, methods=["get"])
    def preview(self, request, pk=None):
        """GET /assessments/<id>/preview/ — what a student WOULD see.

        Returns the full question list as the STUDENT would receive it:
        - Questions in authored order (deterministic — no random shuffle,
          so a teacher can review the whole set in one pass).
        - Options WITHOUT is_correct (uses QuestionForStudentSerializer,
          same shape the exam engine serves).
        - NO explanation, NO accepted_answers.

        Notes shown to the caller:
        - `effective_question_count` tells the teacher how many questions
          a student will ACTUALLY see (matters when question_count is set
          and/or randomization is on — the preview shows the full pool,
          not the truncated sample).
        - `reach` = how many students the assessment currently targets.

        Allowed for DRAFT and PUBLISHED only — a CLOSED/ARCHIVED assessment
        isn't meaningful to preview.
        """
        from decimal import Decimal

        from apps.exam_engine.serializers import QuestionForStudentSerializer

        assessment = self.get_object()

        if assessment.status not in (
            Assessment.Status.DRAFT,
            Assessment.Status.PUBLISHED,
        ):
            return Response(
                {
                    "error": {
                        "status": 400,
                        "detail": "لا يمكن معاينة امتحان مغلق أو مؤرشف.",
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        links = list(assessment.assessment_questions.select_related("question").order_by("order"))
        if not links:
            return Response(
                {
                    "error": {
                        "status": 400,
                        "detail": "أضف سؤالًا واحدًا على الأقل قبل المعاينة.",
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        questions = [link.question for link in links]
        max_score = sum(
            (link.points_override if link.points_override is not None else link.question.points)
            for link in links
        ) or Decimal("0")

        # What the student will actually see (honors question_count, but
        # the preview itself always shows the full pool).
        effective_count = (
            assessment.question_count
            if assessment.question_count and assessment.question_count < len(questions)
            else len(questions)
        )

        return Response(
            {
                "assessment": AssessmentSerializer(assessment).data,
                "questions": QuestionForStudentSerializer(questions, many=True).data,
                "max_score": str(max_score),
                "effective_question_count": effective_count,
                "total_question_count": len(questions),
                "reach": estimate_reach(assessment),
            }
        )

    @action(detail=True, methods=["post"])
    def duplicate(self, request, pk=None):
        """POST /assessments/<id>/duplicate/ — clone into a new DRAFT.

        Uses `get_object()` so the same permission checks that gate
        editing apply here: a TEACHER can only duplicate assessments
        they created (or PUBLISHED ones they can see؟ no — IsCreatorOrAdmin
        restricts to own). OWNER/ADMIN can duplicate anything in the tenant.
        """
        from .services import duplicate_assessment

        if request.user.role == User.Role.TEACHER and not user_can(
            request.user, "teachers_can_create_assessments"
        ):
            raise PermissionDenied("إنشاء الامتحانات غير مسموح لك حسب إعدادات المؤسسة.")
        source = self.get_object()
        copy = duplicate_assessment(source, actor=request.user)

        log_action(
            actor=request.user,
            tenant=request.tenant,
            action="assessment.duplicated",
            obj=copy,
            metadata={"source_id": str(source.id), "source_title": source.title},
        )

        return Response(
            AssessmentSerializer(copy).data,
            status=status.HTTP_201_CREATED,
        )

    @action(
        detail=True,
        methods=["get"],
        url_path="export_results",
        permission_classes=[
            IsAuthenticated,
            IsTenantMember,
            IsStaffMember,
            CanExportTenant,
        ],
    )
    def export_results(self, request, pk=None):
        """GET /assessments/<id>/export_results/ — download all results as .xlsx.

        Columns: student, email, attempt #, status (Arabic), score, max,
        percentage, pass/fail, timestamps. Right-to-left sheet view, frozen
        header row, colored header fill, auto-sized columns.

        Staff-only (server-side enforced). Every row an attempt the caller
        can see (respects S-6 teacher scope if we ever add per-teacher
        narrowing to this table — currently OWNER/ADMIN/TEACHER can see
        every attempt on the assessment they're scoped to, same as the
        results page itself).
        """
        from io import BytesIO

        from django.http import HttpResponse
        from openpyxl import Workbook
        from openpyxl.styles import Alignment, Font, PatternFill
        from openpyxl.utils import get_column_letter

        from apps.exam_engine.models import ExamAttempt

        assessment = self.get_object()
        self._check_teacher_results_access(assessment)

        attempts = (
            ExamAttempt.objects.for_tenant(request.tenant)
            .filter(assessment=assessment)
            .select_related("student")
            .order_by("-submitted_at", "student__email")
        )

        wb = Workbook()
        ws = wb.active
        ws.title = "النتائج"
        ws.sheet_view.rightToLeft = True

        headers = [
            "الطالب",
            "البريد الإلكتروني",
            "المحاولة",
            "الحالة",
            "الدرجة",
            "من",
            "النسبة %",
            "النتيجة",
            "البدء",
            "التسليم",
            "التصحيح",
        ]

        header_font = Font(bold=True, color="FFFFFF", size=11)
        header_fill = PatternFill(start_color="2B3A67", end_color="2B3A67", fill_type="solid")
        center = Alignment(horizontal="center", vertical="center")

        for col_idx, header in enumerate(headers, start=1):
            cell = ws.cell(row=1, column=col_idx, value=header)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = center

        status_ar = {
            "IN_PROGRESS": "قيد التنفيذ",
            "SUBMITTED": "بانتظار التصحيح",
            "GRADED": "مصححة",
            "EXPIRED": "منتهية",
            "VOIDED": "ملغاة",
        }

        def fmt(dt):
            return dt.strftime("%Y-%m-%d %H:%M") if dt else ""

        for row_idx, attempt in enumerate(attempts, start=2):
            name = f"{attempt.student.first_name} {attempt.student.last_name}".strip() or "—"
            passed_ar = (
                "ناجح"
                if attempt.is_passed is True
                else "راسب"
                if attempt.is_passed is False
                else "—"
            )
            ws.cell(row=row_idx, column=1, value=name)
            ws.cell(row=row_idx, column=2, value=attempt.student.email)
            ws.cell(row=row_idx, column=3, value=attempt.attempt_number)
            ws.cell(
                row=row_idx,
                column=4,
                value=status_ar.get(attempt.status, attempt.status),
            )
            ws.cell(
                row=row_idx,
                column=5,
                value=float(attempt.score) if attempt.score is not None else "",
            )
            ws.cell(row=row_idx, column=6, value=float(attempt.max_score))
            ws.cell(row=row_idx, column=7, value=round(attempt.percentage, 2))
            ws.cell(row=row_idx, column=8, value=passed_ar)
            ws.cell(row=row_idx, column=9, value=fmt(attempt.started_at))
            ws.cell(row=row_idx, column=10, value=fmt(attempt.submitted_at))
            ws.cell(row=row_idx, column=11, value=fmt(attempt.graded_at))

        for col_idx, width in enumerate([24, 32, 10, 18, 10, 10, 12, 12, 18, 18, 18], start=1):
            ws.column_dimensions[get_column_letter(col_idx)].width = width

        ws.freeze_panes = "A2"

        buf = BytesIO()
        wb.save(buf)
        buf.seek(0)

        # ASCII filename — Django's Content-Disposition parser handles
        # UTF-8 poorly on some clients. Use the assessment id slice for
        # uniqueness.
        filename = f"results-{str(assessment.id)[:8]}.xlsx"

        response = HttpResponse(
            buf.getvalue(),
            content_type=("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
        )
        response["Content-Disposition"] = f'attachment; filename="{filename}"'

        log_action(
            actor=request.user,
            tenant=request.tenant,
            action="assessment.results_exported",
            obj=assessment,
        )

        return response

    @action(
        detail=True,
        methods=["get"],
        permission_classes=[IsAuthenticated, IsTenantMember, IsStaffMember],
    )
    def analytics(self, request, pk=None):
        """GET /assessments/<id>/analytics/ — class-level analytics.

        Aggregations over SUBMITTED + GRADED attempts only. IN_PROGRESS,
        EXPIRED, VOIDED are excluded — they don't represent real
        completions and would distort the numbers.

        Per-question stats (correct%, avg points) come from AttemptAnswer
        rows for questions linked to this assessment — one aggregation
        query covers all questions (no N+1).

        Hardest/easiest = sorted by correct% across graded answers only
        (a question with 0 graded answers isn't rankable).
        """
        from apps.billing.services import require_feature

        require_feature(request.tenant, "advanced_analytics")
        from django.db.models import Avg, Count, Q

        from apps.exam_engine.models import AttemptAnswer, ExamAttempt

        assessment = self.get_object()
        self._check_teacher_results_access(assessment)

        # ---- Attempts in "done" states ----
        done_attempts = ExamAttempt.objects.for_tenant(request.tenant).filter(
            assessment=assessment,
            status__in=["SUBMITTED", "GRADED"],
        )
        total_attempts = done_attempts.count()
        graded = done_attempts.filter(status="GRADED")
        graded_count = graded.count()
        pending_count = total_attempts - graded_count

        passed_count = graded.filter(is_passed=True).count()
        failed_count = graded.filter(is_passed=False).count()
        pass_rate = round(passed_count / graded_count * 100, 1) if graded_count > 0 else None

        # ---- Score aggregation ----
        scores = list(graded.values_list("score", "max_score"))
        percentages = [float(s) / float(m) * 100 if m and float(m) > 0 else 0.0 for s, m in scores]
        avg_pct = round(sum(percentages) / len(percentages), 1) if percentages else None
        highest_score = graded.order_by("-score").values_list("score", flat=True).first()
        lowest_score = graded.order_by("score").values_list("score", flat=True).first()

        # ---- Distribution: 10 buckets of 10% each ----
        buckets = [0] * 10
        for pct in percentages:
            idx = min(int(pct // 10), 9)
            buckets[idx] += 1
        distribution = [
            {"bucket": f"{i * 10}-{(i + 1) * 10}", "count": buckets[i]} for i in range(10)
        ]

        # ---- Per-question stats — ONE aggregation query ----
        base_answers = AttemptAnswer.objects.filter(
            attempt__assessment=assessment,
            attempt__status__in=["SUBMITTED", "GRADED"],
        )
        stats_by_q = base_answers.values("question_id").annotate(
            total=Count("id"),
            correct=Count("id", filter=Q(is_correct=True)),
            wrong=Count("id", filter=Q(is_correct=False)),
            pending=Count("id", filter=Q(is_correct__isnull=True)),
            avg_pts=Avg("awarded_points"),
        )
        stats_map = {}
        for row in stats_by_q:
            graded_ans = (row["correct"] or 0) + (row["wrong"] or 0)
            pct = (row["correct"] / graded_ans * 100) if graded_ans > 0 else None
            stats_map[str(row["question_id"])] = {
                "total": row["total"],
                "correct": row["correct"],
                "wrong": row["wrong"],
                "pending": row["pending"],
                "graded": graded_ans,
                "correct_pct": pct,
                "avg_pts": row["avg_pts"],
            }

        links = list(assessment.assessment_questions.select_related("question").order_by("order"))
        question_stats = []
        for link in links:
            q = link.question
            s = stats_map.get(str(q.id), {})
            correct_pct = s.get("correct_pct")
            avg_pts = s.get("avg_pts")
            question_stats.append(
                {
                    "question_id": str(q.id),
                    "question_text": q.text,
                    "question_type": q.question_type,
                    "order": link.order,
                    "points": str(link.points_override or q.points),
                    "total_answers": s.get("total", 0),
                    "correct_count": s.get("correct", 0),
                    "wrong_count": s.get("wrong", 0),
                    "pending_count": s.get("pending", 0),
                    "graded_count": s.get("graded", 0),
                    "correct_percentage": (
                        round(correct_pct, 1) if correct_pct is not None else None
                    ),
                    "avg_awarded_points": (
                        str(round(float(avg_pts), 2)) if avg_pts is not None else None
                    ),
                }
            )

        # ---- Hardest / easiest (only rankable — has graded answers) ----
        rankable = [q for q in question_stats if q["correct_percentage"] is not None]
        hardest = sorted(rankable, key=lambda x: x["correct_percentage"])[:5]
        easiest = sorted(rankable, key=lambda x: x["correct_percentage"], reverse=True)[:5]

        # ---- Reach: how many students the assessment targets ----
        from .services import estimate_reach

        return Response(
            {
                "assessment": {
                    "id": str(assessment.id),
                    "title": assessment.title,
                    "assessment_type": assessment.assessment_type,
                    "status": assessment.status,
                    "max_attempts": assessment.max_attempts,
                    "passing_score": (
                        str(assessment.passing_score)
                        if assessment.passing_score is not None
                        else None
                    ),
                },
                "summary": {
                    "total_attempts": total_attempts,
                    "graded_attempts": graded_count,
                    "pending_attempts": pending_count,
                    "passed": passed_count,
                    "failed": failed_count,
                    "pass_rate": pass_rate,
                    "avg_percentage": avg_pct,
                    "highest_score": (str(highest_score) if highest_score is not None else None),
                    "lowest_score": (str(lowest_score) if lowest_score is not None else None),
                    "targeted_students": estimate_reach(assessment),
                },
                "distribution": distribution,
                "hardest_questions": hardest,
                "easiest_questions": easiest,
                "all_questions": question_stats,
                "has_data": total_attempts > 0,
            }
        )


class AssessmentQuestionViewSet(TenantScopedViewSet):
    """Read visibility: staff-only. A STUDENT never touches this endpoint."""

    queryset = AssessmentQuestion.objects.all()
    serializer_class = AssessmentQuestionSerializer
    permission_classes = TenantScopedViewSet.permission_classes + [
        IsStaffMember,
        IsStaffForWriteActions,
    ]
    filterset_fields = ["assessment", "question"]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.role in (User.Role.OWNER, User.Role.ADMIN):
            return qs
        return qs.filter(assessment__created_by=user)

    def _check_can_edit(self, assessment):
        user = self.request.user
        if user.role == User.Role.TEACHER and assessment.created_by_id != user.id:
            raise PermissionDenied("لا يمكنك تعديل امتحان أنشأه معلم آخر.")
        if assessment.status != Assessment.Status.DRAFT:
            raise PermissionDenied("لا يمكن تعديل أسئلة امتحان منشور أو مغلق.")

    def perform_create(self, serializer):
        self._check_can_edit(serializer.validated_data["assessment"])
        super().perform_create(serializer)

    def perform_update(self, serializer):
        self._check_can_edit(serializer.instance.assessment)
        super().perform_update(serializer)

    def perform_destroy(self, instance):
        self._check_can_edit(instance.assessment)
        super().perform_destroy(instance)


class AssessmentTargetViewSet(TenantScopedViewSet):
    """Same rules as AssessmentQuestionViewSet — student UUID leak prevention."""

    queryset = AssessmentTarget.objects.all()
    serializer_class = AssessmentTargetSerializer
    permission_classes = TenantScopedViewSet.permission_classes + [
        IsStaffMember,
        IsStaffForWriteActions,
    ]
    filterset_fields = ["assessment", "target_type"]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.role in (User.Role.OWNER, User.Role.ADMIN):
            return qs
        return qs.filter(assessment__created_by=user)

    def _check_can_edit(self, assessment):
        user = self.request.user
        if user.role == User.Role.TEACHER and assessment.created_by_id != user.id:
            raise PermissionDenied("لا يمكنك تعديل امتحان أنشأه معلم آخر.")
        if assessment.status != Assessment.Status.DRAFT:
            raise PermissionDenied("لا يمكن تعديل فئات امتحان منشور أو مغلق.")

    def perform_create(self, serializer):
        self._check_can_edit(serializer.validated_data["assessment"])
        super().perform_create(serializer)

    def perform_update(self, serializer):
        self._check_can_edit(serializer.instance.assessment)
        super().perform_update(serializer)

    def perform_destroy(self, instance):
        self._check_can_edit(instance.assessment)
        super().perform_destroy(instance)
