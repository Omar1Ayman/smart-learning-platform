from django.contrib import admin

from .models import AttendanceRecord, AttendanceSession


class AttendanceRecordInline(admin.TabularInline):
    model = AttendanceRecord
    extra = 0
    readonly_fields = ["check_in_at", "check_in_ip", "marked_by"]


@admin.register(AttendanceSession)
class AttendanceSessionAdmin(admin.ModelAdmin):
    list_display = ["group", "date", "start_time", "status", "teacher"]
    list_filter = ["status", "date", "mode"]
    search_fields = ["group__name", "teacher__email"]
    inlines = [AttendanceRecordInline]


admin.site.register(AttendanceRecord)