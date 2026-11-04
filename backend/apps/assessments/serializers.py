from rest_framework import serializers

from apps.academics.models import Grade, Group, Stage
from apps.accounts.models import User
from apps.common.serializers import TenantScopedModelSerializer
from apps.questions.models import Question

from .models import Assessment, AssessmentQuestion, AssessmentTarget


class AssessmentSerializer(TenantScopedModelSerializer):
    """Staff shape — full read/write access to every builder field. See
    AssessmentForStudentSerializer below for what a STUDENT receives."""

    class Meta:
        model = Assessment
        fields = [
            "id",
            "title",
            "description",
            "assessment_type",
            "status",
            "starts_at",
            "ends_at",
            "duration_minutes",
            "max_attempts",
            "passing_score",
            "published_at",
            "randomize_question_order",
            "randomize_option_order",
            "question_count",
            "created_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "status", "published_at", "created_by", "created_at", "updated_at"]

    def create(self, validated_data):
        validated_data["created_by"] = self.context["request"].user
        return super().create(validated_data)


class AssessmentForStudentSerializer(serializers.ModelSerializer):
    """What a targeted student sees in Phase 8: enough to recognize and
    plan for the assessment, nothing that belongs to the exam-taking
    experience. No question list at all yet — Phase 9 introduces a
    sanitized, no-correct-answer question shape for an active attempt."""

    class Meta:
        model = Assessment
        fields = [
            "id",
            "title",
            "description",
            "assessment_type",
            "starts_at",
            "ends_at",
            "duration_minutes",
            "max_attempts",
            "passing_score",
        ]
        read_only_fields = fields


class AssessmentQuestionSerializer(TenantScopedModelSerializer):
    tenant_scoped_fields = {"assessment": Assessment, "question": Question}

    class Meta:
        model = AssessmentQuestion
        fields = ["id", "assessment", "question", "order", "points_override", "created_at"]
        read_only_fields = ["id", "created_at"]

    def validate_question(self, question):
        # Spec #29's review gate still holds once an exam is built from
        # the bank — only APPROVED questions belong in an assessment.
        if question.review_status != Question.ReviewStatus.APPROVED:
            raise serializers.ValidationError("لا يمكن إضافة سؤال غير معتمد إلى امتحان.")
        return question


class AssessmentTargetSerializer(TenantScopedModelSerializer):
    tenant_scoped_fields = {
        "assessment": Assessment,
        "stage": Stage,
        "grade": Grade,
        "group": Group,
        "student": lambda tenant: User.objects.for_tenant(tenant).filter(role=User.Role.STUDENT),
    }

    class Meta:
        model = AssessmentTarget
        fields = ["id", "assessment", "target_type", "stage", "grade", "group", "student", "created_at"]
        read_only_fields = ["id", "created_at"]

    def validate(self, attrs):
        target_type = attrs.get("target_type")
        field_by_type = {
            AssessmentTarget.TargetType.STAGE: "stage",
            AssessmentTarget.TargetType.GRADE: "grade",
            AssessmentTarget.TargetType.GROUP: "group",
            AssessmentTarget.TargetType.STUDENT: "student",
        }
        required_field = field_by_type.get(target_type)
        other_fields = {"stage", "grade", "group", "student"} - (
            {required_field} if required_field else set()
        )

        if required_field and not attrs.get(required_field):
            raise serializers.ValidationError(
                {required_field: f"مطلوب عندما يكون target_type = {target_type}."}
            )
        for field in other_fields:
            if attrs.get(field):
                raise serializers.ValidationError(
                    {field: f"لا يُحدَّد عندما يكون target_type = {target_type}."}
                )
        return attrs
