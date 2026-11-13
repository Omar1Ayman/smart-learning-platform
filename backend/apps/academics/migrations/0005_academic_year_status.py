"""AcademicYear State Machine — add status, activated_at, closed_at, closed_by.

Wave: Architecture v2.0 — Phase 1.1

هذا Migration يُضيف الحقول الأربعة الجديدة، ثم يُحوّل البيانات القديمة:
- is_active=True  → status="ACTIVE"  (السنة التي كانت تعمل)
- is_active=False → status="ARCHIVED" (السنوات القديمة)

قاعدة أمان: إذا كان لأي tenant أكثر من سنة is_active=True (خطأ منطقي موجود)،
نحتفظ بالأحدث فقط كـ ACTIVE ونحوّل الباقي إلى CLOSING.
"""

import django.db.models.deletion
from collections import defaultdict

from django.conf import settings
from django.db import migrations, models


# ---------------------------------------------------------------------------
# Data migration
# ---------------------------------------------------------------------------

def migrate_is_active_to_status(apps, schema_editor):
    """Convert legacy is_active boolean to new status field."""
    AcademicYear = apps.get_model("academics", "AcademicYear")

    # 1. جمع كل السنوات النشطة حسب tenant
    active_by_tenant = defaultdict(list)
    for year in AcademicYear.objects.filter(is_active=True):
        active_by_tenant[year.tenant_id].append(year)

    # 2. لكل tenant: احتفظ بالأحدث ACTIVE، والباقي CLOSING
    for tenant_id, years in active_by_tenant.items():
        if len(years) == 1:
            # الحالة الطبيعية: سنة نشطة واحدة
            years[0].status = "ACTIVE"
            years[0].save(update_fields=["status"])
        else:
            # الحالة الشاذة: أكثر من سنة نشطة
            # احتفظ بالأحدث start_date
            years.sort(key=lambda y: y.start_date, reverse=True)
            years[0].status = "ACTIVE"
            years[0].save(update_fields=["status"])
            for stale in years[1:]:
                stale.status = "CLOSING"
                stale.save(update_fields=["status"])

    # 3. كل ما هو is_active=False → ARCHIVED
    AcademicYear.objects.filter(is_active=False).update(status="ARCHIVED")


def reverse_status_to_is_active(apps, schema_editor):
    """Rollback: convert new status back to is_active boolean."""
    AcademicYear = apps.get_model("academics", "AcademicYear")
    AcademicYear.objects.filter(status="ACTIVE").update(is_active=True)
    AcademicYear.objects.exclude(status="ACTIVE").update(is_active=False)


# ---------------------------------------------------------------------------
# Migration
# ---------------------------------------------------------------------------

class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("academics", "0004_fix_course_year_only_constraint"),
    ]

    operations = [
        # 1. إضافة الحقول الجديدة
        migrations.AddField(
            model_name="academicyear",
            name="activated_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="academicyear",
            name="closed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="academicyear",
            name="closed_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="+",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="academicyear",
            name="status",
            field=models.CharField(
                choices=[
                    ("DRAFT", "إعداد"),
                    ("ACTIVE", "قيد التشغيل"),
                    ("CLOSING", "قيد الإغلاق"),
                    ("ARCHIVED", "مؤرشفة"),
                ],
                db_index=True,
                default="DRAFT",
                max_length=20,
            ),
        ),
        # 2. تحويل البيانات القديمة (is_active → status)
        migrations.RunPython(
            migrate_is_active_to_status,
            reverse_code=reverse_status_to_is_active,
        ),
    ]