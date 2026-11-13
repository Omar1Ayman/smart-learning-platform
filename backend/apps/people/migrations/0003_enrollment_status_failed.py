"""Phase 1.5 — Add FAILED status to Enrollment.

Separates "completed successfully" from "completed with failure".
Promotion logic uses this to distinguish promoted vs. repeated students.
"""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("people", "0002_remove_enrollment_uniq_enrollment_per_student_per_year_and_more"),
    ]

    operations = [
        migrations.AlterField(
            model_name="enrollment",
            name="status",
            field=models.CharField(
                choices=[
                    ("ACTIVE", "Active"),
                    ("COMPLETED", "Completed"),
                    ("FAILED", "Failed"),
                    ("INACTIVE", "Inactive"),
                    ("SUSPENDED", "Suspended"),
                    ("TRANSFERRED", "Transferred"),
                    ("GRADUATED", "Graduated"),
                    ("ARCHIVED", "Archived"),
                ],
                default="ACTIVE",
                max_length=20,
            ),
        ),
    ]