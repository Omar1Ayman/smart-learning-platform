from django.contrib import admin

from .models import Question, QuestionBank, QuestionOption


class QuestionOptionInline(admin.TabularInline):
    model = QuestionOption
    extra = 0


@admin.register(Question)
class QuestionAdmin(admin.ModelAdmin):
    list_display = ["__str__", "bank", "question_type", "review_status", "created_by", "created_at"]
    list_filter = ["question_type", "review_status", "difficulty"]
    inlines = [QuestionOptionInline]


admin.site.register(QuestionBank)
