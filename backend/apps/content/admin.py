from django.contrib import admin

from .models import Content


@admin.register(Content)
class ContentAdmin(admin.ModelAdmin):
    list_display = ["title", "content_type", "is_published", "scan_status", "created_by", "created_at"]
    list_filter = ["content_type", "is_published", "scan_status"]
    search_fields = ["title"]
