"""Settings serializers — validating nested JSON policy structures."""

from rest_framework import serializers


class ExamPolicySerializer(serializers.Serializer):
    allow_retakes = serializers.BooleanField(default=True)
    max_attempts_default = serializers.IntegerField(min_value=1, max_value=20, default=2)
    force_fullscreen = serializers.BooleanField(default=False)
    auto_submit_after_tab_switches = serializers.IntegerField(
        min_value=0, max_value=20, default=0
    )
    show_correct_answers_after_submit = serializers.BooleanField(default=True)
    teachers_can_self_publish = serializers.BooleanField(default=False)
    shuffle_questions_default = serializers.BooleanField(default=False)
    shuffle_options_default = serializers.BooleanField(default=False)


class QuestionPolicySerializer(serializers.Serializer):
    require_review = serializers.BooleanField(default=True)
    owners_can_self_approve = serializers.BooleanField(default=True)


class ContentPolicySerializer(serializers.Serializer):
    teachers_can_edit_others_content = serializers.BooleanField(default=False)
    max_file_size_mb = serializers.IntegerField(min_value=1, max_value=500, default=50)


class NotificationPolicySerializer(serializers.Serializer):
    email_on_exam_publish = serializers.BooleanField(default=True)
    email_on_result = serializers.BooleanField(default=True)


class PermissionsSerializer(serializers.Serializer):
    """Wave 35 — Granular permission toggles per role."""
    # Teacher
    teachers_can_create_assessments = serializers.BooleanField(default=True)
    teachers_can_delete_own_assessments = serializers.BooleanField(default=True)
    teachers_can_view_all_student_results = serializers.BooleanField(default=False)
    teachers_can_create_questions = serializers.BooleanField(default=True)
    teachers_can_mark_attendance = serializers.BooleanField(default=True)
    teachers_can_import_students = serializers.BooleanField(default=False)
    teachers_can_export_data = serializers.BooleanField(default=False)
    teachers_can_manage_own_content = serializers.BooleanField(default=True)
    teachers_can_publish_content_directly = serializers.BooleanField(default=False)
    teachers_can_delete_others_content = serializers.BooleanField(default=False)

    # Admin
    admins_can_manage_teachers = serializers.BooleanField(default=True)
    admins_can_delete_assessments = serializers.BooleanField(default=True)
    admins_can_approve_questions = serializers.BooleanField(default=True)
    admins_can_export_data = serializers.BooleanField(default=False)
    admins_can_view_billing = serializers.BooleanField(default=False)
    admins_can_manage_settings = serializers.BooleanField(default=False)

    # Advanced
    enable_audit_log_for_teachers = serializers.BooleanField(default=False)
    enable_bulk_import = serializers.BooleanField(default=True)


class TenantSettingsSerializer(serializers.Serializer):
    """PATCH accepts any subset — missing keys keep their existing value."""

    exam_policy = ExamPolicySerializer(required=False)
    question_policy = QuestionPolicySerializer(required=False)
    content_policy = ContentPolicySerializer(required=False)
    notification_policy = NotificationPolicySerializer(required=False)
    permissions = PermissionsSerializer(required=False)  # 🆕

    def update(self, instance, validated_data):
        current = instance.get_settings()
        for section, values in validated_data.items():
            if section not in current:
                current[section] = {}
            current[section].update(values)

        instance.settings = current
        instance.save(update_fields=["settings", "updated_at"])
        return instance


class TenantBrandingSerializer(serializers.Serializer):
    # 🆕 Wave 35 — name is now editable
    name = serializers.CharField(max_length=255, required=False)
    primary_color = serializers.CharField(max_length=7, required=False)
    logo_url = serializers.URLField(required=False, allow_blank=True)
    contact_email = serializers.EmailField(required=False, allow_blank=True)

    def validate_primary_color(self, value):
        if value and not value.startswith("#"):
            raise serializers.ValidationError("اللون يجب أن يبدأ بـ #.")
        return value

    def validate_name(self, value):
        if value is not None:
            value = value.strip()
            if len(value) < 2:
                raise serializers.ValidationError("اسم المؤسسة قصير جداً.")
        return value