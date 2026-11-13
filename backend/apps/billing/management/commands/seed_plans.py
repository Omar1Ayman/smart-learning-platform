"""Idempotent seed command for the 4 canonical plans.

Usage:
    python manage.py seed_plans            # create missing, update pricing
    python manage.py seed_plans --reset    # also reset feature dicts to defaults

Safe to run multiple times.
"""

from decimal import Decimal

from django.core.management.base import BaseCommand

from apps.billing.models import Plan

PLAN_DEFINITIONS = [
    {
        "key": "free",
        "name": "مجاني",
        "description": "للمدرسين الأفراد — للتجربة والاستخدام الشخصي",
        "price_monthly": Decimal("0"),
        "price_yearly": Decimal("0"),
        "display_order": 1,
        "max_students": 30,
        "max_teachers": 2,
        "max_storage_mb": 500,
        "max_assessments_per_month": 20,
        "features": {
            "bulk_grading": False,
            "advanced_analytics": False,
            "parent_portal": True,
            "custom_branding": False,
            "bulk_import": False,
            "attendance": True,
            "api_access": False,
            "priority_support": False,
        },
    },
    {
        "key": "starter",
        "name": "البداية",
        "description": "لمراكز تعليمية صغيرة — حتى 100 طالب",
        "price_monthly": Decimal("500"),
        "price_yearly": Decimal("5000"),
        "display_order": 2,
        "max_students": 100,
        "max_teachers": 5,
        "max_storage_mb": 2000,
        "max_assessments_per_month": 100,
        "features": {
            "bulk_grading": True,
            "advanced_analytics": False,
            "parent_portal": True,
            "custom_branding": False,
            "bulk_import": True,
            "attendance": True,
            "api_access": False,
            "priority_support": False,
        },
    },
    {
        "key": "pro",
        "name": "الاحترافي",
        "description": "لمراكز متوسطة ومدارس صغيرة — حتى 300 طالب",
        "price_monthly": Decimal("1200"),
        "price_yearly": Decimal("12000"),
        "display_order": 3,
        "max_students": 300,
        "max_teachers": 20,
        "max_storage_mb": 5000,
        "max_assessments_per_month": 500,
        "features": {
            "bulk_grading": True,
            "advanced_analytics": True,
            "parent_portal": True,
            "custom_branding": True,
            "bulk_import": True,
            "attendance": True,
            "api_access": False,
            "priority_support": False,
        },
    },
    {
        "key": "enterprise",
        "name": "المؤسسي",
        "description": "للمدارس الكبيرة — حدود مخصصة ودعم أولوية",
        "price_monthly": Decimal("3000"),
        "price_yearly": Decimal("30000"),
        "display_order": 4,
        "max_students": None,
        "max_teachers": None,
        "max_storage_mb": 50000,
        "max_assessments_per_month": None,
        "features": {
            "bulk_grading": True,
            "advanced_analytics": True,
            "parent_portal": True,
            "custom_branding": True,
            "bulk_import": True,
            "attendance": True,
            "api_access": True,
            "priority_support": True,
        },
    },
]


class Command(BaseCommand):
    help = "Seed the 4 canonical plans (free, starter, pro, enterprise)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Also reset feature dicts and limits to defaults.",
        )

    def handle(self, *args, **options):
        reset = options["reset"]
        created = 0
        updated = 0

        for definition in PLAN_DEFINITIONS:
            key = definition["key"]
            defaults = {k: v for k, v in definition.items() if k != "key"}

            if reset:
                # Force full overwrite
                obj, was_created = Plan.objects.update_or_create(key=key, defaults=defaults)
            else:
                # Only create if missing; never overwrite existing
                obj, was_created = Plan.objects.get_or_create(key=key, defaults=defaults)

            if was_created:
                created += 1
                self.stdout.write(self.style.SUCCESS(f"  ✓ Created plan: {key} ({obj.name})"))
            elif reset:
                updated += 1
                self.stdout.write(self.style.WARNING(f"  ↻ Reset plan: {key} ({obj.name})"))
            else:
                self.stdout.write(f"  · Skipped existing: {key}")

        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(
                f"Done. Created: {created}, Updated: {updated}, Total plans: {Plan.objects.count()}"
            )
        )
