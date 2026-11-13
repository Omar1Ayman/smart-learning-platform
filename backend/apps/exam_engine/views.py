from django.db.models import Q
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.assessments.models import Assessment
from apps.audit.services import log_action
from apps.common.mixins import TenantContextMixin
from apps.common.permissions import HasRole, IsStaffMember, IsTenantMember
from apps.common.views import TenantScopedViewSet
from apps.people.models import TeacherAssignment
from apps.questions.models import Question
from apps.tenants.permissions import user_can

from .models import ExamAttempt
from .serializers import (
    AttemptDetailSerializer,
    AttemptEventInputSerializer,
    AttemptEventSerializer,
    AttemptResultSerializer,
    EssayAnswerForGradingSerializer,
    GradeEssayInputSerializer,
    SaveAnswerSerializer,
)
from .services import (
    finalize_attempt,
    grade_essay_answer,
    recalculate_attempt_score,
    record_attempt_event,
    reopen_attempt,
    save_answer,
    start_attempt,
    submit_attempt,
    void_attempt,
)


class StartAttemptView(TenantContextMixin, APIView):
    """POST /api/v1/assessments/<id>/start/ — student-only."""

    permission_classes = [IsAuthenticated, IsTenantMember, HasRole("STUDENT")]

    def post(self, request, assessment_id):
        assessment = Assessment.objects.for_tenant(request.tenant).filter(id=assessment_id).first()
        if assessment is None:
            return Response(
                {"error": {"status": 404, "detail": "الامتحان غير موجود."}},
                status=status.HTTP_404_NOT_FOUND,
            )
        attempt = start_attempt(assessment=assessment, student=request.user, tenant=request.tenant)
        return Response(
            AttemptDetailSerializer(attempt, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class AttemptViewSet(TenantScopedViewSet):
    """Attempt history with staff reopen/void actions.

    Read access (S-6):
    - STUDENT: their own attempts only.
    - TEACHER: attempts on assessments they created OR whose linked
      questions come from a bank matching their TeacherAssignment
      (subject, grade).
    - OWNER/ADMIN: every attempt in the tenant.
    """

    queryset = ExamAttempt.objects.all()
    permission_classes = [IsAuthenticated, IsTenantMember]
    http_method_names = ["get", "post"]
    filterset_fields = ["assessment", "student", "status"]
    throttle_scope = None

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user

        if user.role == "STUDENT":
            return qs.filter(student=user)

        if user.role in ("OWNER", "ADMIN"):
            return qs

        if user_can(user, "teachers_can_view_all_student_results"):
            return qs

        # CRIT#2 fix: iterating over TeacherAssignment objects and trying
        # to unpack each one as (subject_id, grade_id) raised
        # TypeError: cannot unpack non-iterable TeacherAssignment.
        # `values_list` yields the two FK ids as a tuple directly, and
        # avoids N+1 (single JOIN query).
        tenant = self.request.tenant
        pairs = (
            TeacherAssignment.objects.for_tenant(tenant)
            .filter(teacher=user)
            .values_list("course__subject_id", "course__grade_id")
        )

        scope_q = Q(assessment__created_by=user)
        subject_grade_pairs = [
            Q(
                assessment__assessment_questions__question__bank__subject_id=subj,
                assessment__assessment_questions__question__bank__grade_id=grade,
            )
            for subj, grade in pairs
            if subj and grade
        ]

        if subject_grade_pairs:
            combined_q = subject_grade_pairs[0]
            for q in subject_grade_pairs[1:]:
                combined_q |= q
            scope_q |= combined_q

        return qs.filter(scope_q).distinct()

    def get_serializer_class(self):
        if self.request.user.role == "STUDENT":
            return AttemptDetailSerializer
        return AttemptResultSerializer

    def _ensure_owner_for_write(self, attempt):
        if self.request.user.role != "STUDENT":
            raise PermissionDenied("هذا الإجراء متاح للطالب فقط.")
        if attempt.student_id != self.request.user.id:
            raise PermissionDenied("لا يمكنك تعديل محاولة طالب آخر.")

    def _teacher_can_grade_question(self, teacher, question):
        if not question.bank_id:
            return False
        if not question.bank.subject_id or not question.bank.grade_id:
            return False
        return (
            TeacherAssignment.objects.for_tenant(self.request.tenant)
            .filter(
                teacher=teacher,
                course__subject_id=question.bank.subject_id,
                course__grade_id=question.bank.grade_id,
            )
            .exists()
        )

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.status == ExamAttempt.Status.IN_PROGRESS and instance.is_expired():
            submit_attempt(instance, expired_notification=True)
            instance.refresh_from_db()
        return super().retrieve(request, *args, **kwargs)

    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        attempt = self.get_object()
        self._ensure_owner_for_write(attempt)
        submit_attempt(attempt)
        attempt.refresh_from_db()
        return Response(AttemptResultSerializer(attempt).data)

    @action(detail=True, methods=["post"])
    def answer(self, request, pk=None):
        attempt = self.get_object()
        self._ensure_owner_for_write(attempt)
        serializer = SaveAnswerSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        question_id = str(serializer.validated_data["question"])
        if question_id not in (attempt.question_order or []):
            return Response(
                {
                    "error": {
                        "status": 403,
                        "detail": "هذا السؤال لا ينتمي لهذه المحاولة.",
                    }
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        save_answer(
            attempt=attempt,
            question_id=str(serializer.validated_data["question"]),
            chosen_option_id=serializer.validated_data.get("chosen_option"),
            text_answer=serializer.validated_data.get("text_answer", ""),
        )
        attempt.refresh_from_db()
        return Response(AttemptDetailSerializer(attempt, context={"request": request}).data)

    @action(detail=True, methods=["get"])
    def result(self, request, pk=None):
        attempt = self.get_object()
        if attempt.status == ExamAttempt.Status.IN_PROGRESS:
            return Response(
                {
                    "error": {
                        "status": 400,
                        "detail": "لم يتم تسليم هذه المحاولة بعد.",
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(AttemptResultSerializer(attempt).data)

    @action(
        detail=True,
        methods=["post"],
        throttle_classes=[ScopedRateThrottle],
        throttle_scope="attempt_event",
    )
    def event(self, request, pk=None):
        """POST /attempts/<id>/event/ — record a suspicious event.

        HIGH#6 fix: throttle_classes and throttle_scope were previously
        assigned as *local variables* inside the method body, which DRF
        never reads (it inspects the bound method's attributes before the
        body runs). They are now passed to the @action decorator where
        DRF actually looks for them. The corresponding rate is defined
        in settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["attempt_event"].
        """
        attempt = self.get_object()
        if attempt.student_id != request.user.id:
            raise PermissionDenied("لا يمكنك تسجيل أحداث على محاولة أخرى.")
        if attempt.status != ExamAttempt.Status.IN_PROGRESS:
            return Response({"detail": "ok"}, status=200)

        serializer = AttemptEventInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        event_type = serializer.validated_data["event_type"]
        record_attempt_event(attempt, event_type, serializer.validated_data.get("metadata", {}))

        auto_submit_after = int(
            attempt.tenant.get_policy("exam_policy").get("auto_submit_after_tab_switches", 0) or 0
        )
        if auto_submit_after > 0 and event_type == "TAB_HIDDEN":
            from .models import AttemptEvent

            count = AttemptEvent.objects.filter(attempt=attempt, event_type="TAB_HIDDEN").count()
            if count >= auto_submit_after:
                submit_attempt(attempt, expired_notification=False)
                attempt.refresh_from_db()
                return Response(
                    {
                        "detail": "auto_submitted",
                        "reason": f"tab_switch_threshold ({auto_submit_after})",
                    },
                    status=200,
                )

        return Response({"detail": "ok"}, status=201)

    @action(
        detail=True,
        methods=["get"],
        permission_classes=[IsAuthenticated, IsTenantMember, IsStaffMember],
    )
    def grading(self, request, pk=None):
        from .models import AttemptEvent
        from .services import compute_suspicion

        attempt = self.get_object()
        all_answers = attempt.answers.select_related("question", "chosen_option").all()

        essay_answers = [
            a for a in all_answers if a.question.question_type == Question.QuestionType.ESSAY
        ]
        pending_essays = sum(1 for a in essay_answers if a.awarded_points is None)

        events = AttemptEvent.objects.filter(attempt=attempt)[:200]
        suspicion = compute_suspicion(attempt)

        return Response(
            {
                "attempt": AttemptResultSerializer(attempt).data,
                "essay_answers": EssayAnswerForGradingSerializer(essay_answers, many=True).data,
                "pending_essays": pending_essays,
                "events": AttemptEventSerializer(events, many=True).data,
                "suspicion": suspicion,
            }
        )

    @action(
        detail=True,
        methods=["post"],
        permission_classes=[IsAuthenticated, IsTenantMember, IsStaffMember],
    )
    def grade_essay(self, request, pk=None):
        attempt = self.get_object()
        serializer = GradeEssayInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if request.user.role == "TEACHER":
            question_id = serializer.validated_data["question"]
            question = (
                Question.objects.for_tenant(request.tenant)
                .select_related("bank")
                .filter(id=question_id)
                .first()
            )
            if question is None:
                return Response(
                    {"error": {"status": 404, "detail": "السؤال غير موجود."}},
                    status=status.HTTP_404_NOT_FOUND,
                )
            if attempt.assessment.created_by_id != request.user.id:
                if not self._teacher_can_grade_question(request.user, question):
                    raise PermissionDenied("لا يمكنك تصحيح سؤال خارج نطاق موادك.")

        grade_essay_answer(
            attempt=attempt,
            question_id=str(serializer.validated_data["question"]),
            awarded_points=serializer.validated_data["awarded_points"],
            is_correct=serializer.validated_data["is_correct"],
            graded_by=request.user,
        )
        recalculate_attempt_score(attempt)
        attempt.refresh_from_db()
        return Response(AttemptResultSerializer(attempt).data)

    @action(
        detail=True,
        methods=["post"],
        permission_classes=[IsAuthenticated, IsTenantMember, IsStaffMember],
    )
    def finalize(self, request, pk=None):
        attempt = self.get_object()
        finalize_attempt(attempt)
        attempt.refresh_from_db()
        return Response(AttemptResultSerializer(attempt).data)

    @action(
        detail=True,
        methods=["post"],
        permission_classes=[IsAuthenticated, IsTenantMember, IsStaffMember],
    )
    def reopen(self, request, pk=None):
        """POST /attempts/<id>/reopen/ — reopen a closed attempt."""
        attempt = self.get_object()

        if attempt.status == ExamAttempt.Status.IN_PROGRESS:
            return Response(
                {"error": {"status": 400, "detail": "المحاولة قيد التنفيذ بالفعل."}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        conflict = (
            ExamAttempt.objects.for_tenant(request.tenant)
            .filter(
                student=attempt.student,
                assessment=attempt.assessment,
                status=ExamAttempt.Status.IN_PROGRESS,
            )
            .exclude(id=attempt.id)
            .exists()
        )
        if conflict:
            return Response(
                {
                    "error": {
                        "status": 400,
                        "detail": (
                            "لدى الطالب محاولة أخرى قيد التنفيذ على نفس الامتحان. "
                            "أنهِها أولاً قبل إعادة فتح هذه."
                        ),
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        extended = request.data.get("extended_minutes")
        if extended is not None:
            try:
                extended = int(extended)
                if extended < 1 or extended > 600:
                    raise ValueError
            except (TypeError, ValueError):
                return Response(
                    {
                        "error": {
                            "status": 400,
                            "detail": "قيمة extended_minutes يجب أن تكون بين 1 و 600.",
                        }
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        reopen_attempt(attempt, extended_minutes=extended)
        attempt.refresh_from_db()

        log_action(
            actor=request.user,
            tenant=request.tenant,
            action="attempt.reopened",
            obj=attempt,
            metadata={
                "extended_minutes": extended,
                "student_email": attempt.student.email,
            },
        )

        return Response(AttemptResultSerializer(attempt).data)

    @action(
        detail=True,
        methods=["post"],
        permission_classes=[IsAuthenticated, IsTenantMember, IsStaffMember],
    )
    def void(self, request, pk=None):
        """POST /attempts/<id>/void/ — mark an attempt as VOIDED."""
        attempt = self.get_object()

        if attempt.status == ExamAttempt.Status.VOIDED:
            return Response({"detail": "المحاولة ملغاة بالفعل."})

        reason = request.data.get("reason", "")
        void_attempt(attempt, reason=reason)
        attempt.refresh_from_db()

        log_action(
            actor=request.user,
            tenant=request.tenant,
            action="attempt.voided",
            obj=attempt,
            metadata={
                "reason": reason,
                "student_email": attempt.student.email,
            },
        )

        return Response(AttemptResultSerializer(attempt).data)

    @action(
        detail=False,
        methods=["post"],
        permission_classes=[IsAuthenticated, IsTenantMember, IsStaffMember],
    )
    def bulk_grade(self, request):
        """POST /api/v1/attempts/bulk_grade/ — grade multiple attempts in
        one request. Each attempt is its own transaction on the server, so
        a failure on one does NOT roll back the others.

        F-16 FIX (Milestone 0, Batch 2): two bugs made every call return 500:
          1. `attempts_data` was referenced BEFORE it was assigned.
          2. `visible_ids` was assigned TWICE (the second assignment was dead).
        Both fixed. Behavior now matches the frontend's
        `bulkGradeAttempts()` contract: per-item results, no rollback.
        """
        from apps.billing.services import require_feature

        from .services import bulk_grade_and_finalize

        require_feature(request.tenant, "bulk_grading")

        attempts_data = request.data.get("attempts")
        if not isinstance(attempts_data, list) or not attempts_data:
            return Response(
                {
                    "error": {
                        "status": 400,
                        "detail": "يجب اختيار محاولة واحدة على الأقل.",
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(attempts_data) > 100:
            return Response(
                {
                    "error": {
                        "status": 400,
                        "detail": "الحد الأقصى 100 محاولة في الدفعة الواحدة.",
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        requested_ids = [str(a.get("attempt_id")) for a in attempts_data if a.get("attempt_id")]
        visible_ids = set(
            str(i)
            for i in self.get_queryset().filter(id__in=requested_ids).values_list("id", flat=True)
        )

        results = []
        for entry in attempts_data:
            attempt_id = entry.get("attempt_id")
            grades = entry.get("grades", [])
            finalize = bool(entry.get("finalize", False))

            if not attempt_id:
                results.append({"attempt_id": None, "error": "attempt_id مطلوب."})
                continue

            if str(attempt_id) not in visible_ids:
                results.append(
                    {
                        "attempt_id": str(attempt_id),
                        "error": "ليس لديك صلاحية تصحيح هذه المحاولة.",
                    }
                )
                continue

            results.append(
                bulk_grade_and_finalize(
                    attempt_id=attempt_id,
                    grades=grades,
                    finalize=finalize,
                    graded_by=request.user,
                    tenant=request.tenant,
                )
            )

        log_action(
            actor=request.user,
            tenant=request.tenant,
            action="attempts.bulk_graded",
            metadata={"count": len(results)},
        )

        return Response({"results": results}, status=status.HTTP_200_OK)
