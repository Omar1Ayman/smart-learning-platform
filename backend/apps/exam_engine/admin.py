from django.contrib import admin

from .models import AttemptAnswer, ExamAttempt


class AttemptAnswerInline(admin.TabularInline):
    model = AttemptAnswer
    extra = 0
    readonly_fields = [
        "question",
        "chosen_option",
        "text_answer",
        "is_correct",
        "awarded_points",
        "graded_at",
        "graded_by",
        "created_at",
        "updated_at",
    ]
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(ExamAttempt)
class ExamAttemptAdmin(admin.ModelAdmin):
    list_display = [
        "student",
        "assessment",
        "attempt_number",
        "status",
        "score",
        "max_score",
        "started_at",
        "submitted_at",
    ]
    list_filter = ["status", "assessment"]
    search_fields = ["student__email", "assessment__title"]
    readonly_fields = [f.name for f in ExamAttempt._meta.fields]
    inlines = [AttemptAnswerInline]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
