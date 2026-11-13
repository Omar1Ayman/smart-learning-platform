from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from apps.academics.models import Grade, Subject
from apps.accounts.models import User
from apps.common.serializers import TenantScopedModelSerializer

from .models import Question, QuestionBank, QuestionOption

MCQ_LIKE_TYPES = {Question.QuestionType.MCQ, Question.QuestionType.TRUE_FALSE}

# The two canonical texts of a TRUE_FALSE question. Text is FIXED — only
# `is_correct` can vary (the student picks which of "صح"/"خطأ" is right
# for the given question text). Enforced at BOTH create and update.
TRUE_FALSE_TEXTS = {"صح", "خطأ"}


class QuestionBankSerializer(TenantScopedModelSerializer):
    tenant_scoped_fields = {"subject": Subject, "grade": Grade}
    questions_count = serializers.IntegerField(source="questions.count", read_only=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = QuestionBank
        fields = [
            "id",
            "name",
            "description",
            "subject",
            "grade",
            "is_archived",
            "created_by",
            "created_by_name",
            "questions_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "created_by",
            "created_by_name",
            "questions_count",
            "created_at",
            "updated_at",
        ]

    def get_created_by_name(self, obj):
        if not obj.created_by:
            return "غير معروف"
        return obj.created_by.get_full_name() or obj.created_by.email.split("@")[0]

    def create(self, validated_data):
        validated_data["created_by"] = self.context["request"].user
        return super().create(validated_data)


class QuestionOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = QuestionOption
        fields = ["id", "text", "is_correct", "order"]
        read_only_fields = ["id"]


class QuestionSerializer(TenantScopedModelSerializer):
    """Staff-only shape. See module docstring for policy details."""

    tenant_scoped_fields = {"bank": QuestionBank}
    options = QuestionOptionSerializer(many=True, required=False)

    class Meta:
        model = Question
        fields = [
            "id",
            "bank",
            "text",
            "question_type",
            "difficulty",
            "topic",
            "points",
            "accepted_answers",
            "explanation",
            "options",
            "review_status",
            "reviewed_by",
            "reviewed_at",
            "review_note",
            "is_archived",
            "created_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "review_status",
            "reviewed_by",
            "reviewed_at",
            "review_note",
            "created_by",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        question_type = attrs.get("question_type") or getattr(self.instance, "question_type", None)
        options = attrs.get("options")
        options_submitted = "options" in self.initial_data
        accepted_answers = (
            attrs["accepted_answers"]
            if "accepted_answers" in attrs
            else getattr(self.instance, "accepted_answers", None)
        )

        if question_type in MCQ_LIKE_TYPES:
            effective_options = options if options_submitted else self._existing_options()
            if effective_options is None:
                raise serializers.ValidationError(
                    {"options": "options مطلوبة لهذا النوع من الأسئلة."}
                )
            if len(effective_options) < 2:
                raise serializers.ValidationError({"options": "مطلوب اختياران على الأقل."})
            correct_count = sum(1 for opt in effective_options if opt.get("is_correct"))
            if correct_count != 1:
                raise serializers.ValidationError(
                    {"options": "يجب أن تكون هناك إجابة صحيحة واحدة بالضبط."}
                )

            # TRUE_FALSE — the TEXTS are fixed. Only which one is correct
            # can vary (both cases are legitimate: "الشمس تشرق من الشرق"
            # → صح صحيحة، "الشمس تشرق من الغرب" → خطأ صحيحة).
            if question_type == Question.QuestionType.TRUE_FALSE:
                texts = {(opt.get("text") or "").strip() for opt in effective_options}
                if texts != TRUE_FALSE_TEXTS:
                    raise serializers.ValidationError(
                        {
                            "options": (
                                "سؤال صح/خطأ يجب أن يكون خياراه بالضبط: "
                                "'صح' و 'خطأ' — النص ثابت، والإجابة الصحيحة هي "
                                "ما تختاره من الاثنين."
                            )
                        }
                    )
        elif question_type == Question.QuestionType.SHORT_ANSWER:
            if not accepted_answers:
                raise serializers.ValidationError(
                    {"accepted_answers": ("مطلوبة (قائمة إجابات مقبولة) لهذا النوع من الأسئلة.")}
                )
        # ESSAY: no options, no accepted_answers required — graded manually.
        return attrs

    def _existing_options(self):
        if self.instance is None:
            return None
        return [
            {"text": o.text, "is_correct": o.is_correct, "order": o.order}
            for o in self.instance.options.all()
        ]

    @transaction.atomic
    def create(self, validated_data):
        options_data = validated_data.pop("options", [])
        request = self.context["request"]
        author = request.user
        tenant = request.tenant

        question_policy = tenant.get_policy("question_policy")
        require_review = question_policy.get("require_review", True)
        owners_can_self_approve = question_policy.get("owners_can_self_approve", True)

        auto_approve = False
        if not require_review:
            auto_approve = True
        elif author.role in (User.Role.OWNER, User.Role.ADMIN) and owners_can_self_approve:
            auto_approve = True

        validated_data["created_by"] = author
        if auto_approve:
            validated_data["review_status"] = Question.ReviewStatus.APPROVED
            validated_data["reviewed_by"] = author
            validated_data["reviewed_at"] = timezone.now()
            validated_data["review_note"] = "اعتماد تلقائي (سياسة المؤسسة)"
        else:
            validated_data["review_status"] = Question.ReviewStatus.PENDING
            validated_data["reviewed_by"] = None
            validated_data["reviewed_at"] = None
            validated_data["review_note"] = ""

        question = super().create(validated_data)
        for option in options_data:
            QuestionOption.objects.create(tenant=question.tenant, question=question, **option)

        if question.review_status == Question.ReviewStatus.PENDING:
            from apps.notifications.services import notify_many

            tenant = question.tenant
            admins = User.objects.filter(
                tenant=tenant, role__in=[User.Role.OWNER, User.Role.ADMIN], is_active=True
            ).exclude(id=author.id)
            notify_many(
                admins,
                notif_type="QUESTION_PENDING",
                title="سؤال بانتظار المراجعة",
                message=f"سؤال جديد من {author.email}: {question.text[:80]}",
                link="/questions",
            )

        return question

    @transaction.atomic
    def update(self, instance, validated_data):
        used_in_published_exam = instance.assessment_links.filter(
            assessment__status="PUBLISHED"
        ).exists()
        has_attempt_history = instance.assessment_links.filter(
            assessment__attempts__isnull=False
        ).exists()
        if used_in_published_exam or has_attempt_history:
            raise serializers.ValidationError(
                {
                    "detail": (
                        "لا يمكن تعديل سؤال مرتبط بامتحان منشور أو بمحاولات سابقة. "
                        "انسخه إلى سؤال جديد لإجراء التعديلات."
                    )
                }
            )

        # Question type is fixed at creation.
        new_type = validated_data.get("question_type")
        if new_type and new_type != instance.question_type:
            raise serializers.ValidationError(
                {"question_type": "لا يمكن تغيير نوع السؤال بعد إنشائه."}
            )

        options_data = validated_data.pop("options", None)

        # TRUE_FALSE — texts stay canonical, but the correct one can flip
        # (a typo fix in question text often flips صح↔خطأ). The check in
        # validate() already guarantees both texts are present; this
        # block is redundant but explicit for future readers.
        if instance.question_type == Question.QuestionType.TRUE_FALSE and options_data is not None:
            texts = {(o.get("text") or "").strip() for o in options_data}
            if texts != TRUE_FALSE_TEXTS:
                raise serializers.ValidationError(
                    {"options": ("خيارات سؤال صح/خطأ ثابتة: 'صح' و 'خطأ' — لا يتغيّر النص.")}
                )

        # Editing an approved question sends it back for re-review.
        if instance.review_status == Question.ReviewStatus.APPROVED:
            validated_data["review_status"] = Question.ReviewStatus.PENDING
            validated_data["reviewed_by"] = None
            validated_data["reviewed_at"] = None
            validated_data["review_note"] = ""

        question = super().update(instance, validated_data)
        if options_data is not None:
            question.options.all().delete()
            for option in options_data:
                QuestionOption.objects.create(tenant=question.tenant, question=question, **option)
        return question
