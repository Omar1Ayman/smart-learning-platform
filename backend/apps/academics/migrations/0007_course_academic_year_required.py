"""Phase 1.4 — Make Course.academic_year required.

Steps:
  1. Fill any null academic_year values:
     a. From course.term.academic_year if term exists
     b. Else from tenant's ACTIVE year
     c. Else from tenant's most recent non-DRAFT year
     d. Else RAISE (can't safely auto-fill)
  2. Drop the "generic" constraint (dead code once year is required)
  3. Recreate the "year-only" constraint with the new condition
  4. Alter the FK to NOT NULL + on_delete=PROTECT
"""

import django.db.models.deletion
from django.db import migrations, models


def fill_missing_years(apps, schema_editor):
    Course = apps.get_model("academics", "Course")
    AcademicYear = apps.get_model("academics", "AcademicYear")

    missing = Course.objects.filter(academic_year__isnull=True)
    if not missing.exists():
        return

    fixed = 0
    failed = []

    for course in missing.select_related("term"):
        # 1) From term
        if course.term_id and course.term.academic_year_id:
            course.academic_year_id = course.term.academic_year_id
            course.save(update_fields=["academic_year"])
            fixed += 1
            continue

        # 2) From ACTIVE year
        active = AcademicYear.objects.filter(
            tenant_id=course.tenant_id, status="ACTIVE"
        ).first()
        if active:
            course.academic_year_id = active.id
            course.save(update_fields=["academic_year"])
            fixed += 1
            continue

        # 3) From most recent non-DRAFT year
        fallback = (
            AcademicYear.objects.filter(tenant_id=course.tenant_id)
            .exclude(status="DRAFT")
            .order_by("-start_date")
            .first()
        )
        if fallback:
            course.academic_year_id = fallback.id
            course.save(update_fields=["academic_year"])
            fixed += 1
            continue

        failed.append(str(course.id))

    if failed:
        raise RuntimeError(
            f"Cannot auto-fill academic_year for {len(failed)} courses "
            f"(ids: {failed}). Their tenants have no ACTIVE or non-DRAFT year. "
            f"Create an AcademicYear for those tenants, then re-run migrate."
        )

    print(f"✅ Filled academic_year for {fixed} courses.")


def reverse_fill(apps, schema_editor):
    """No-op — we cannot restore nulls safely."""
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("academics", "0006_unique_active_year_per_tenant"),
    ]

    operations = [
        # 1. Fill any null years FIRST
        migrations.RunPython(fill_missing_years, reverse_code=reverse_fill),

        # 2. Drop generic constraint (dead once year is required)
        migrations.RemoveConstraint(
            model_name="course",
            name="uniq_generic_course_per_grade_subject_name",
        ),

        # 3. Recreate year-only constraint with new condition
        migrations.RemoveConstraint(
            model_name="course",
            name="uniq_year_course_per_grade_subject_name_year",
        ),
        migrations.AddConstraint(
            model_name="course",
            constraint=models.UniqueConstraint(
                fields=["grade", "subject", "name", "academic_year"],
                condition=models.Q(term__isnull=True),
                name="uniq_year_course_per_grade_subject_name_year",
            ),
        ),

        # 4. Make academic_year required
        migrations.AlterField(
            model_name="course",
            name="academic_year",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="courses",
                to="academics.academicyear",
            ),
        ),
    ]