from django.db import transaction
from rest_framework import serializers

from apps.academics.models import Grade, Subject
from apps.common.serializers import TenantScopedModelSerializer

from .models import Question, QuestionBank, QuestionOption

MCQ_LIKE_TYPES = {Question.QuestionType.MCQ, Question.QuestionType.TRUE_FALSE}


class QuestionBankSerializer(TenantScopedModelSerializer):
    tenant_scoped_fields = {"subject": Subject, "grade": Grade}

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
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_by", "created_at", "updated_at"]

    def create(self, validated_data):
        validated_data["created_by"] = self.context["request"].user
        return super().create(validated_data)


class QuestionOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = QuestionOption
        fields = ["id", "text", "is_correct", "order"]
        read_only_fields = ["id"]


class QuestionSerializer(TenantScopedModelSerializer):
    """Staff-only shape (gated by IsStaffMember at the view level, never
    reached by a STUDENT) — this is deliberately *not* the shape Phase 8/9
    will serve to a student mid-attempt. See module docstring in models.py,
    rule 2, and PROJECT_MEMORY.md's Phase 8 notes for what that shape
    must leave out."""

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
        # Partial-update-aware, the same way ContentSerializer learned to
        # be (PROJECT_MEMORY.md's Phase 6 note): a field absent from this
        # specific request means "unchanged," not "empty."
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
                raise serializers.ValidationError({"options": "options مطلوبة لهذا النوع من الأسئلة."})
            if len(effective_options) < 2:
                raise serializers.ValidationError({"options": "مطلوب اختياران على الأقل."})
            correct_count = sum(1 for opt in effective_options if opt.get("is_correct"))
            if correct_count != 1:
                raise serializers.ValidationError({"options": "يجب أن تكون هناك إجابة صحيحة واحدة بالضبط."})
        elif question_type == Question.QuestionType.SHORT_ANSWER:
            if not accepted_answers:
                raise serializers.ValidationError(
                    {"accepted_answers": "مطلوبة (قائمة إجابات مقبولة) لهذا النوع من الأسئلة."}
                )
        # ESSAY: no options, no accepted_answers required — graded manually later (Phase 9).
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
        validated_data["created_by"] = request.user
        validated_data["review_status"] = Question.ReviewStatus.PENDING
        validated_data["reviewed_by"] = None
        validated_data["reviewed_at"] = None
        question = super().create(validated_data)
        for option in options_data:
            QuestionOption.objects.create(tenant=question.tenant, question=question, **option)
        return question

    @transaction.atomic
    def update(self, instance, validated_data):
        options_data = validated_data.pop("options", None)
        # Any content edit on a previously-approved question sends it
        # back for re-review — an approval shouldn't silently keep
        # covering content that changed after the fact (spec #29's
        # workflow implies the review is *of the content*, not a
        # permanent stamp on the row).
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
