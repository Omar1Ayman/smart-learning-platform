from django.contrib import admin

from .models import Assessment, AssessmentQuestion, AssessmentTarget


class AssessmentQuestionInline(admin.TabularInline):
    model = AssessmentQuestion
    extra = 0


class AssessmentTargetInline(admin.TabularInline):
    model = AssessmentTarget
    extra = 0


@admin.register(Assessment)
class AssessmentAdmin(admin.ModelAdmin):
    list_display = ["title", "assessment_type", "status", "starts_at", "created_by"]
    list_filter = ["assessment_type", "status"]
    inlines = [AssessmentQuestionInline, AssessmentTargetInline]
