"""Billing admin — Plan catalog + Subscription management.

Subscriptions are managed EXCLUSIVELY via the Django admin (not the API)
for now. This is intentional: billing changes are sensitive, low-frequency,
and require careful review. The customer-facing API only reads them.
"""

from django.contrib import admin, messages
from django.utils import timezone
from django.utils.html import format_html

from .models import Plan, Subscription, SubscriptionEvent


@admin.register(Plan)
class PlanAdmin(admin.ModelAdmin):
    list_display = [
        "name",
        "key",
        "price_monthly_display",
        "price_yearly_display",
        "status_badge",
        "display_order",
    ]
    list_filter = ["is_active", "is_public", "currency"]
    search_fields = ["name", "key", "description"]
    ordering = ["display_order", "price_monthly"]
    readonly_fields = ["id", "created_at", "updated_at"]

    fieldsets = (
        ("Identity", {"fields": ("id", "key", "name", "description")}),
        (
            "Pricing",
            {"fields": ("price_monthly", "price_yearly", "currency")},
        ),
        ("Visibility", {"fields": ("is_active", "is_public", "display_order")}),
        (
            "Limits (empty = unlimited)",
            {
                "fields": (
                    "max_students",
                    "max_teachers",
                    "max_storage_mb",
                    "max_assessments_per_month",
                )
            },
        ),
        (
            "Features",
            {
                "fields": ("features",),
                "description": (
                    'JSON: {"bulk_grading": true, "advanced_analytics": false}. '
                    "Missing key = disabled."
                ),
            },
        ),
        ("Metadata", {"fields": ("created_at", "updated_at"), "classes": ("collapse",)}),
    )

    def price_monthly_display(self, obj):
        return f"{obj.price_monthly} {obj.currency}"

    price_monthly_display.short_description = "Monthly"

    def price_yearly_display(self, obj):
        return f"{obj.price_yearly} {obj.currency}"

    price_yearly_display.short_description = "Yearly"

    def status_badge(self, obj):
        color = "#10B981" if obj.is_active else "#6B7280"
        label = "Active" if obj.is_active else "Inactive"
        return format_html(
            '<span style="background:{};color:white;padding:2px 8px;'
            'border-radius:10px;font-size:11px;">{}</span>',
            color,
            label,
        )

    status_badge.short_description = "Status"


class SubscriptionEventInline(admin.TabularInline):
    model = SubscriptionEvent
    extra = 0
    can_delete = False
    readonly_fields = [
        "event_type",
        "from_plan",
        "to_plan",
        "actor",
        "metadata",
        "created_at",
    ]

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = [
        "tenant",
        "plan",
        "status_badge",
        "current_period_end",
        "trial_end",
        "cancel_at_period_end",
    ]
    list_filter = ["status", "plan", "cancel_at_period_end"]
    search_fields = ["tenant__name", "tenant__slug", "plan__key"]
    readonly_fields = ["id", "created_at", "updated_at"]
    inlines = [SubscriptionEventInline]
    autocomplete_fields = ["tenant", "plan"]

    fieldsets = (
        ("Identity", {"fields": ("id", "tenant", "plan", "status")}),
        (
            "Billing period",
            {"fields": ("current_period_start", "current_period_end")},
        ),
        ("Trial", {"fields": ("trial_start", "trial_end")}),
        (
            "Cancellation",
            {"fields": ("cancel_at_period_end", "canceled_at")},
        ),
        (
            "Per-tenant overrides",
            {
                "fields": ("feature_overrides", "limit_overrides"),
                "description": (
                    "Advanced: override specific features/limits for this tenant, "
                    "regardless of plan. Leave empty unless you know what you're doing."
                ),
                "classes": ("collapse",),
            },
        ),
        ("Metadata", {"fields": ("created_at", "updated_at"), "classes": ("collapse",)}),
    )

    def status_badge(self, obj):
        colors = {
            "TRIALING": "#3B82F6",
            "ACTIVE": "#10B981",
            "PAST_DUE": "#F59E0B",
            "CANCELED": "#6B7280",
            "PAUSED": "#6B7280",
        }
        color = colors.get(obj.status, "#6B7280")
        return format_html(
            '<span style="background:{};color:white;padding:2px 8px;'
            'border-radius:10px;font-size:11px;">{}</span>',
            color,
            obj.get_status_display(),
        )

    status_badge.short_description = "Status"

    actions = ["mark_active", "mark_canceled"]

    @admin.action(description="Mark selected as ACTIVE")
    def mark_active(self, request, queryset):
        count = queryset.update(status=Subscription.Status.ACTIVE)
        self.message_user(request, f"{count} subscription(s) marked ACTIVE.", messages.SUCCESS)

    @admin.action(description="Mark selected as CANCELED")
    def mark_canceled(self, request, queryset):
        count = queryset.update(
            status=Subscription.Status.CANCELED,
            canceled_at=timezone.now(),
        )
        self.message_user(request, f"{count} subscription(s) marked CANCELED.", messages.SUCCESS)


@admin.register(SubscriptionEvent)
class SubscriptionEventAdmin(admin.ModelAdmin):
    list_display = ["subscription", "event_type", "from_plan", "to_plan", "created_at"]
    list_filter = ["event_type", "created_at"]
    search_fields = ["subscription__tenant__name", "subscription__tenant__slug"]
    readonly_fields = [f.name for f in SubscriptionEvent._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False