from rest_framework import serializers

from apps.academics.models import Grade, Group, Stage
from apps.accounts.models import User
from apps.common.serializers import TenantScopedModelSerializer
from apps.questions.models import Question

from .models import Assessment, AssessmentQuestion, AssessmentTarget


class AssessmentSerializer(TenantScopedModelSerializer):
    """Staff shape — full builder fields PLUS the computed context that
    makes the assessments list meaningful at a glance:
      - targets_summary: human-readable list of who this exam is for
      - questions_count: how many questions are linked
      - attempts_count / submissions_count: activity signals
      - created_by_email: who built it
    """

    created_by_email = serializers.SerializerMethodField()
    targets_summary = serializers.SerializerMethodField()
    questions_count = serializers.SerializerMethodField()
    attempts_count = serializers.SerializerMethodField()
    submissions_count = serializers.SerializerMethodField()
    
    class Meta:
        model = Assessment
        fields = [
            "id", "title", "description", "assessment_type", "status",
            "starts_at", "ends_at", "duration_minutes", "max_attempts",
            "passing_score", "published_at",
            "randomize_question_order", "randomize_option_order",
            "question_count",
            "late_entry_minutes",
            "entry_cutoff_minutes",
            "created_by", "created_by_email", "targets_summary",
            "questions_count", "attempts_count", "submissions_count",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id",
            "status",
            "published_at",
            "created_by",
            "created_by_email",
            "targets_summary",
            "questions_count",
            "attempts_count",
            "submissions_count",
            "created_at",
            "updated_at",
        ]
    
    def validate_late_entry_minutes(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError("يجب أن يكون 0 أو أكثر.")
        return value

    def validate_entry_cutoff_minutes(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError("يجب أن يكون 0 أو أكثر.")
        return value
    def validate_duration_minutes(self, value):
        """M12 fix: reject `duration_minutes=0`.

        A 0 value is ambiguous — the frontend could mean "no time limit"
        (should be null) or "0-minute exam" (nonsensical). _compute_expires_at
        silently treats 0 as "no expiry", but the serializer accepting it
        creates confusion. Force the explicit choice: null (no limit) or
        a positive number.
        """
        if value is not None and value <= 0:
            raise serializers.ValidationError(
                "المدة يجب أن تكون أكبر من صفر، أو اتركها فارغة لامتحان بلا حد زمني."
            )
        return value
    def get_created_by_email(self, obj):
        return obj.created_by.email if obj.created_by_id else None

    def get_targets_summary(self, obj):
        """Human-readable labels — one per target row.

        Returns e.g. ["كل المؤسسة"] or ["صف: الأول الثانوي", "مجموعة: 1ث-أ"].
        Empty list = no targets (which means the exam can't be published
        meaningfully anyway — the publish endpoint enforces that).
        """
        targets = list(obj.targets.all())
        if not targets:
            return []
        summaries = []
        for t in targets:
            if t.target_type == AssessmentTarget.TargetType.TENANT:
                summaries.append("كل المؤسسة")
            elif t.target_type == AssessmentTarget.TargetType.STAGE and t.stage:
                summaries.append(f"مرحلة: {t.stage.name}")
            elif t.target_type == AssessmentTarget.TargetType.GRADE and t.grade:
                summaries.append(f"صف: {t.grade.name}")
            elif t.target_type == AssessmentTarget.TargetType.GROUP and t.group:
                summaries.append(f"مجموعة: {t.group.name}")
            elif t.target_type == AssessmentTarget.TargetType.STUDENT and t.student:
                name = (
                    f"{t.student.first_name} {t.student.last_name}".strip()
                    or t.student.email
                )
                summaries.append(f"طالب: {name}")
        return summaries

    def get_questions_count(self, obj):
        return obj.assessment_questions.count()

    def get_attempts_count(self, obj):
        return obj.attempts.count()

    def get_submissions_count(self, obj):
        return obj.attempts.exclude(submitted_at__isnull=True).count()

    def create(self, validated_data):
        validated_data["created_by"] = self.context["request"].user
        return super().create(validated_data)
class AssessmentForStudentSerializer(serializers.ModelSerializer):
    """What a targeted student sees in the assessments list.

    Wave B1.1 — exposes the tenant's `force_fullscreen` policy so the
    frontend can request fullscreen synchronously inside the "start
    exam" click (browsers reject requestFullscreen outside a user
    gesture; the exam page alone can't do it once mounted).
    """

    my_attempts_used = serializers.SerializerMethodField()
    has_in_progress_attempt = serializers.SerializerMethodField()
    force_fullscreen = serializers.SerializerMethodField()
    window = serializers.SerializerMethodField()
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
            "late_entry_minutes",      
            "entry_cutoff_minutes",    
            "max_attempts",
            "passing_score",
            "my_attempts_used",
            "has_in_progress_attempt",
            "force_fullscreen",
            "window",
        ]
        read_only_fields = fields
    def get_window(self, obj):
        from .services import resolve_effective_window

        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return None
        w = resolve_effective_window(obj, request.user)
        return {
            "state": w["state"],
            "can_start": w["can_start"],
            "reason": w["reason"],
            "opens_at": w["opens_at"].isoformat() if w["opens_at"] else None,
            "closes_at": w["closes_at"].isoformat() if w["closes_at"] else None,
            "latest_entry_at": (
                w["latest_entry_at"].isoformat() if w["latest_entry_at"] else None
            ),
            "max_duration_if_started_now": w["max_duration_if_started_now"],
        }
    def _attempts(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return None
        from apps.exam_engine.models import ExamAttempt

        return ExamAttempt.objects.filter(student=request.user, assessment=obj)

    def get_my_attempts_used(self, obj) -> int:
        qs = self._attempts(obj)
        if qs is None:
            return 0
        return qs.filter(status__in=["SUBMITTED", "GRADED", "EXPIRED"]).count()

    def get_has_in_progress_attempt(self, obj) -> bool:
        qs = self._attempts(obj)
        if qs is None:
            return False
        return qs.filter(status="IN_PROGRESS").exists()

    def get_force_fullscreen(self, obj) -> bool:
        return bool(obj.tenant.get_policy("exam_policy").get("force_fullscreen", False)) 
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
        fields = ["id","assessment", "target_type", "stage", "grade", "group", "student", "opens_at","closes_at","created_at"]
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
