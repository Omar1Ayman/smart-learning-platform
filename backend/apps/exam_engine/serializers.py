"""
Phase 9 Wave 9B — student-facing serializers.

QuestionForStudentSerializer MUST structurally omit correct-answer fields
(is_correct, accepted_answers, explanation, review_note). It does this by
declaring an explicit fields whitelist on a dedicated Serializer, not by
filtering a ModelSerializer — so a future field addition to the Question
model cannot accidentally leak.

Fix note (bug 8): `AttemptDetailSerializer.get_questions()` previously
used `Question.objects.filter(id__in=...)` — bypassing the tenant-scoped
manager. IDs come from the attempt's own question_order snapshot (so they
are safe by construction), but using `for_tenant` keeps the codebase
consistent: every read of a tenant-owned model goes through for_tenant.
"""

from decimal import Decimal

from rest_framework import serializers

from apps.questions.models import Question, QuestionOption

from .models import AttemptAnswer, AttemptEvent, ExamAttempt


class OptionForStudentSerializer(serializers.ModelSerializer):
    class Meta:
        model = QuestionOption
        fields = ["id", "text", "order"]
        read_only_fields = ["id", "text", "order"]


class QuestionForStudentSerializer(serializers.ModelSerializer):
    options = serializers.SerializerMethodField()

    class Meta:
        model = Question
        fields = ["id", "text", "question_type", "points", "options"]
        read_only_fields = fields

    def get_options(self, obj):
        attempt = self.context.get("attempt")
        ordered_ids = None
        if attempt is not None and attempt.option_order:
            ordered_ids = attempt.option_order.get(str(obj.id))

        options = list(obj.options.all())
        if ordered_ids:
            by_id = {str(o.id): o for o in options}
            ordered = [by_id[oid] for oid in ordered_ids if oid in by_id]
            seen = set(ordered_ids)
            ordered.extend(o for o in options if str(o.id) not in seen)
        else:
            ordered = options

        return OptionForStudentSerializer(ordered, many=True).data


class AttemptAnswerStateSerializer(serializers.ModelSerializer):
    class Meta:
        model = AttemptAnswer
        fields = ["question", "chosen_option", "text_answer"]
        read_only_fields = fields


class AttemptDetailSerializer(serializers.ModelSerializer):
    assessment_title = serializers.CharField(source="assessment.title", read_only=True)
    questions = serializers.SerializerMethodField()
    answers = serializers.SerializerMethodField()
    time_remaining_seconds = serializers.SerializerMethodField()
    tenant_policies = serializers.SerializerMethodField()

    class Meta:
        model = ExamAttempt
        fields = [
            "id",
            "assessment",
            "assessment_title",
            "attempt_number",
            "status",
            "started_at",
            "expires_at",
            "submitted_at",
            "max_score",
            "questions",
            "answers",
            "time_remaining_seconds",
            "tenant_policies",
        ]
        read_only_fields = fields

    def get_questions(self, obj):
        question_ids = obj.question_order or []
        if not question_ids:
            return []
        # FIX (bug 8): scope through for_tenant — consistency with the rest
        # of the codebase. Even though IDs come from the attempt snapshot,
        # every read of a tenant-owned model should go through the manager.
        by_id = {
            str(q.id): q
            for q in Question.objects.for_tenant(obj.tenant)
            .filter(id__in=question_ids)
            .prefetch_related("options")
        }
        ordered = [by_id[qid] for qid in question_ids if qid in by_id]
        return QuestionForStudentSerializer(
            ordered, many=True, context={"attempt": obj, **self.context}
        ).data

    def get_answers(self, obj):
        policy = obj.tenant.get_policy("exam_policy")
        show = obj.status in (
            ExamAttempt.Status.SUBMITTED,
            ExamAttempt.Status.GRADED,
        ) and policy.get("show_correct_answers_after_submit", True)
        return {
            str(a.question_id): {
                "chosen_option": str(a.chosen_option_id) if a.chosen_option_id else None,
                "text_answer": a.text_answer or "",
                "is_correct": a.is_correct if show else None,
                "awarded_points": (
                    str(a.awarded_points) if (a.awarded_points is not None and show) else None
                ),
                "explanation": a.question.explanation if show else None,
            }
            for a in obj.answers.all()
        }

    def get_tenant_policies(self, obj):
        policy = obj.tenant.get_policy("exam_policy")
        return {
            "force_fullscreen": policy.get("force_fullscreen", False),
            "auto_submit_after_tab_switches": policy.get("auto_submit_after_tab_switches", 0),
        }

    def get_time_remaining_seconds(self, obj):
        if obj.expires_at is None:
            return None
        from django.utils import timezone

        delta = (obj.expires_at - timezone.now()).total_seconds()
        return max(0, int(delta))


class AttemptResultSerializer(serializers.ModelSerializer):
    assessment_title = serializers.CharField(source="assessment.title", read_only=True)
    student = serializers.UUIDField(read_only=True)
    student_name = serializers.SerializerMethodField()
    student_email = serializers.EmailField(source="student.email", read_only=True)
    percentage = serializers.SerializerMethodField()
    answers = serializers.SerializerMethodField()
    tenant_policies = serializers.SerializerMethodField()
    # F-21 (Milestone 3, Batch 11): drives the Retry CTA on the results page.
    can_retry = serializers.SerializerMethodField()
    retry_reason = serializers.SerializerMethodField()

    class Meta:
        model = ExamAttempt
        fields = [
            "id",
            "assessment",
            "assessment_title",
            "student",
            "student_name",
            "student_email",
            "attempt_number",
            "status",
            "started_at",
            "submitted_at",
            "graded_at",
            "score",
            "max_score",
            "percentage",
            "is_passed",
            "tenant_policies",
            "answers",
            "can_retry",
            "retry_reason",
        ]
        read_only_fields = fields

    # ---- Original methods (must NOT be removed) ----

    def get_student_name(self, obj) -> str:
        full = f"{obj.student.first_name} {obj.student.last_name}".strip()
        return full or obj.student.email

    def get_percentage(self, obj):
        return round(obj.percentage, 2)

    def get_tenant_policies(self, obj):
        policy = obj.tenant.get_policy("exam_policy")
        return {
            "show_correct_answers_after_submit": policy.get(
                "show_correct_answers_after_submit", True
            ),
        }

    def get_answers(self, obj):
        policy = obj.tenant.get_policy("exam_policy")
        show = policy.get("show_correct_answers_after_submit", True)
        return [
            {
                "question": str(a.question_id),
                "question_text": a.question.text,
                "question_type": a.question.question_type,
                "chosen_option": (str(a.chosen_option_id) if a.chosen_option_id else None),
                "text_answer": a.text_answer or "",
                "is_correct": a.is_correct if show else None,
                "awarded_points": (str(a.awarded_points) if a.awarded_points is not None else None),
                "explanation": a.question.explanation if show else None,
            }
            for a in obj.answers.all().select_related("question")
        ]

    # ---- F-21 additions (Milestone 3, Batch 11) ----

    def get_can_retry(self, obj) -> bool:
        """True iff a fresh attempt is currently allowed for this student.

        Mirrors the eligibility rules in `exam_engine.services.start_attempt`
        so the UI never offers a Retry button that would 400 on click.
        """
        from django.utils import timezone

        assessment = obj.assessment
        tenant = obj.tenant

        if not tenant.get_policy("exam_policy").get("allow_retakes", True):
            return False

        now = timezone.now()
        if assessment.ends_at and now > assessment.ends_at:
            return False
        if assessment.starts_at and now < assessment.starts_at:
            return False

        from .models import ExamAttempt as _A

        consumed = (
            _A.objects.for_tenant(tenant)
            .filter(
                student=obj.student,
                assessment=assessment,
                status__in=[
                    _A.Status.SUBMITTED,
                    _A.Status.GRADED,
                    _A.Status.EXPIRED,
                ],
            )
            .count()
        )
        if assessment.max_attempts and consumed >= assessment.max_attempts:
            return False

        return True

    def get_retry_reason(self, obj) -> str | None:
        """Explains WHY can_retry is False. None when can_retry=True."""
        from django.utils import timezone

        assessment = obj.assessment
        tenant = obj.tenant
        now = timezone.now()

        if not tenant.get_policy("exam_policy").get("allow_retakes", True):
            return "المؤسسة لا تسمح بإعادة المحاولة لهذا النوع من الامتحانات."
        if assessment.ends_at and now > assessment.ends_at:
            return "انتهت فترة الامتحان."
        if assessment.starts_at and now < assessment.starts_at:
            return "لم تبدأ فترة الامتحان بعد."
        if assessment.max_attempts:
            from .models import ExamAttempt as _A

            consumed = (
                _A.objects.for_tenant(tenant)
                .filter(
                    student=obj.student,
                    assessment=assessment,
                    status__in=[
                        _A.Status.SUBMITTED,
                        _A.Status.GRADED,
                        _A.Status.EXPIRED,
                    ],
                )
                .count()
            )
            if consumed >= assessment.max_attempts:
                return f"لقد استخدمت كل المحاولات ({assessment.max_attempts})."
        return None


class SaveAnswerSerializer(serializers.Serializer):
    question = serializers.UUIDField()
    chosen_option = serializers.UUIDField(required=False, allow_null=True)
    text_answer = serializers.CharField(required=False, allow_blank=True, default="")


class EssayAnswerForGradingSerializer(serializers.ModelSerializer):
    question_text = serializers.CharField(source="question.text", read_only=True)
    question_type = serializers.CharField(source="question.question_type", read_only=True)
    max_points = serializers.DecimalField(
        source="question.points", max_digits=6, decimal_places=2, read_only=True
    )

    class Meta:
        model = AttemptAnswer
        fields = [
            "question",
            "question_text",
            "question_type",
            "text_answer",
            "max_points",
            "awarded_points",
            "is_correct",
            "graded_at",
        ]
        read_only_fields = fields


class GradeEssayInputSerializer(serializers.Serializer):
    question = serializers.UUIDField()
    awarded_points = serializers.DecimalField(
        max_digits=6, decimal_places=2, min_value=Decimal("0")
    )
    is_correct = serializers.BooleanField()


class AttemptEventSerializer(serializers.ModelSerializer):
    event_label = serializers.SerializerMethodField()

    class Meta:
        model = AttemptEvent
        fields = ["id", "event_type", "event_label", "metadata", "occurred_at"]
        read_only_fields = fields

    def get_event_label(self, obj) -> str:
        return {
            "TAB_HIDDEN": "خروج من نافذة الامتحان",
            "COPY_ATTEMPT": "محاولة نسخ",
            "PASTE_ATTEMPT": "محاولة لصق",
            "RIGHT_CLICK": "نقر بالزر الأيمن",
            "FULLSCREEN_EXIT": "الخروج من الشاشة الكاملة",
            "DEVTOOLS_OPEN": "فتح أدوات المطور",
        }.get(obj.event_type, obj.event_type)


class AttemptEventInputSerializer(serializers.Serializer):
    event_type = serializers.ChoiceField(
        choices=[
            "TAB_HIDDEN",
            "COPY_ATTEMPT",
            "PASTE_ATTEMPT",
            "RIGHT_CLICK",
            "FULLSCREEN_EXIT",
            "DEVTOOLS_OPEN",
        ]
    )
    metadata = serializers.JSONField(required=False, default=dict)
