# Generated manually for Phase 1 — Billing foundation.

import django.db.models.deletion
import django.utils.timezone
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("tenants", "0003_tenant_settings_and_more"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Plan",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("key", models.SlugField(max_length=50, unique=True)),
                ("name", models.CharField(max_length=100)),
                ("description", models.TextField(blank=True, default="")),
                (
                    "price_monthly",
                    models.DecimalField(decimal_places=2, default=0, max_digits=10),
                ),
                (
                    "price_yearly",
                    models.DecimalField(decimal_places=2, default=0, max_digits=10),
                ),
                ("currency", models.CharField(default="EGP", max_length=3)),
                ("is_active", models.BooleanField(default=True)),
                ("is_public", models.BooleanField(default=True)),
                ("display_order", models.PositiveSmallIntegerField(default=0)),
                ("max_students", models.PositiveIntegerField(blank=True, null=True)),
                ("max_teachers", models.PositiveIntegerField(blank=True, null=True)),
                ("max_storage_mb", models.PositiveIntegerField(blank=True, null=True)),
                (
                    "max_assessments_per_month",
                    models.PositiveIntegerField(blank=True, null=True),
                ),
                ("features", models.JSONField(blank=True, default=dict)),
            ],
            options={
                "db_table": "billing_plan",
                "ordering": ["display_order", "price_monthly", "name"],
            },
        ),
        migrations.CreateModel(
            name="Subscription",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("TRIALING", "Trialing"),
                            ("ACTIVE", "Active"),
                            ("PAST_DUE", "Past due"),
                            ("CANCELED", "Canceled"),
                            ("PAUSED", "Paused"),
                        ],
                        db_index=True,
                        default="TRIALING",
                        max_length=20,
                    ),
                ),
                (
                    "current_period_start",
                    models.DateTimeField(default=django.utils.timezone.now),
                ),
                (
                    "current_period_end",
                    models.DateTimeField(blank=True, null=True),
                ),
                ("trial_start", models.DateTimeField(blank=True, null=True)),
                ("trial_end", models.DateTimeField(blank=True, null=True)),
                ("cancel_at_period_end", models.BooleanField(default=False)),
                ("canceled_at", models.DateTimeField(blank=True, null=True)),
                ("feature_overrides", models.JSONField(blank=True, default=dict)),
                ("limit_overrides", models.JSONField(blank=True, default=dict)),
                (
                    "plan",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="subscriptions",
                        to="billing.plan",
                    ),
                ),
                (
                    "tenant",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="subscription",
                        to="tenants.tenant",
                    ),
                ),
            ],
            options={
                "db_table": "billing_subscription",
            },
        ),
        migrations.CreateModel(
            name="SubscriptionEvent",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                (
                    "event_type",
                    models.CharField(
                        choices=[
                            ("CREATED", "Created"),
                            ("PLAN_CHANGED", "Plan changed"),
                            ("CANCELED", "Canceled"),
                            ("REACTIVATED", "Reactivated"),
                            ("RENEWED", "Renewed"),
                            ("TRIAL_ENDED", "Trial ended"),
                            ("PAST_DUE", "Marked past due"),
                        ],
                        max_length=30,
                    ),
                ),
                ("metadata", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "actor",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="+",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "from_plan",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="+",
                        to="billing.plan",
                    ),
                ),
                (
                    "subscription",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="events",
                        to="billing.subscription",
                    ),
                ),
                (
                    "to_plan",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="+",
                        to="billing.plan",
                    ),
                ),
            ],
            options={
                "db_table": "billing_subscription_event",
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="subscription",
            index=models.Index(
                fields=["status", "current_period_end"],
                name="billing_sub_status_period_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="subscriptionevent",
            index=models.Index(
                fields=["subscription", "-created_at"],
                name="billing_event_sub_date_idx",
            ),
        ),
    ]