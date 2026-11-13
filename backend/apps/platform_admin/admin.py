"""Platform admin registrations.

Two models live under this app's purview:
- Tenant — re-registered here (in addition to apps/tenants/admin.py)
  with lifecycle actions so a platform admin can suspend/activate from
  the Django admin without leaving the browser.
- DemoRequest — the sales inbox. Reviewable, status-changeable.

Both are strictly read/write-from-platform-admin — regular tenant admins
never reach these models through the API or a normal admin login."""

from django.contrib import admin, messages
from django.utils import timezone
from django.utils.html import format_html

from apps.tenants.models import DemoRequest, Tenant


@admin.register(DemoRequest)
class DemoRequestAdmin(admin.ModelAdmin):
    list_display = [
        "school_name",
        "contact_name",
        "email",
        "phone",
        "num_students",
        "status",
        "created_at",
    ]
    list_filter = ["status", "created_at"]
    search_fields = ["school_name", "contact_name", "email", "phone"]
    readonly_fields = ["id", "created_at", "updated_at", "reviewed_at", "reviewed_by"]
    fieldsets = (
        (
            "البيانات الأساسية",
            {
                "fields": (
                    "school_name",
                    "contact_name",
                    "email",
                    "phone",
                    "num_students",
                    "message",
                )
            },
        ),
        (
            "حالة المراجعة",
            {"fields": ("status", "notes", "reviewed_by", "reviewed_at", "converted_tenant")},
        ),
        ("Metadata", {"fields": ("id", "created_at", "updated_at"), "classes": ("collapse",)}),
    )
    actions = ["mark_contacted", "mark_declined"]

    @admin.action(description="تحديد كـ 'تم التواصل'")
    def mark_contacted(self, request, queryset):
        updated = queryset.update(
            status=DemoRequest.Status.CONTACTED,
            reviewed_by=request.user,
            reviewed_at=timezone.now(),
        )
        self.message_user(request, f"تم تحديث {updated} طلب.", messages.SUCCESS)

    @admin.action(description="تحديد كـ 'مرفوض'")
    def mark_declined(self, request, queryset):
        updated = queryset.update(
            status=DemoRequest.Status.DECLINED,
            reviewed_by=request.user,
            reviewed_at=timezone.now(),
        )
        self.message_user(request, f"تم رفض {updated} طلب.", messages.SUCCESS)


# ---- Re-register Tenant (overrides apps/tenants/admin.py) ----
# Django allows only one ModelAdmin per model. The one here is the more
# capable version — a platform admin sees lifecycle actions and the
# internal notes field that a regular tenant admin never touches.
admin.site.unregister(Tenant) if Tenant in admin.site._registry else None


@admin.register(Tenant)
class TenantPlatformAdmin(admin.ModelAdmin):
    list_display = [
        "name",
        "slug",
        "status_badge",
        "trial_ends_at",
        "user_count",
        "created_at",
    ]
    list_filter = ["status", "created_at"]
    search_fields = ["name", "slug", "contact_email"]
    readonly_fields = [
        "id",
        "created_at",
        "updated_at",
        "created_by_platform_admin",
    ]
    fieldsets = (
        ("معلومات أساسية", {"fields": ("name", "slug", "status", "contact_email")}),
        ("العلامة التجارية", {"fields": ("primary_color", "logo_url")}),
        (
            "دورة حياة الاشتراك",
            {"fields": ("trial_ends_at", "created_by_platform_admin", "internal_notes")},
        ),
        ("Metadata", {"fields": ("id", "created_at", "updated_at"), "classes": ("collapse",)}),
    )
    actions = ["suspend_tenants", "activate_tenants", "mark_trial"]

    def status_badge(self, obj):
        colors = {
            "LEAD": "#6B7280",
            "PENDING": "#F59E0B",
            "TRIAL": "#3B82F6",
            "ACTIVE": "#10B981",
            "SUSPENDED": "#EF4444",
            "CHURNED": "#6B7280",
        }
        color = colors.get(obj.status, "#6B7280")
        return format_html(
            '<span style="background:{};color:white;padding:2px 8px;border-radius:10px;font-size:11px;">{}</span>',
            color,
            obj.get_status_display(),
        )

    status_badge.short_description = "الحالة"

    def user_count(self, obj):
        return obj.users.count()

    user_count.short_description = "المستخدمون"

    @admin.action(description="تعليق المؤسسات المحددة")
    def suspend_tenants(self, request, queryset):
        count = queryset.update(status=Tenant.Status.SUSPENDED)
        self.message_user(request, f"تم تعليق {count} مؤسسة.", messages.SUCCESS)

    @admin.action(description="تفعيل المؤسسات المحددة")
    def activate_tenants(self, request, queryset):
        count = queryset.update(status=Tenant.Status.ACTIVE)
        self.message_user(request, f"تم تفعيل {count} مؤسسة.", messages.SUCCESS)

    @admin.action(description="تحويل إلى فترة تجريبية")
    def mark_trial(self, request, queryset):
        count = queryset.update(
            status=Tenant.Status.TRIAL,
            trial_ends_at=timezone.now() + timezone.timedelta(days=14),
        )
        self.message_user(request, f"تم تحويل {count} مؤسسة إلى trial.", messages.SUCCESS)
