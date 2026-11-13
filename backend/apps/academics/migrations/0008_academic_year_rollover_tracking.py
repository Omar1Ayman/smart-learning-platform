from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("academics", "0007_course_academic_year_required"),
    ]

    operations = [
        migrations.AddField(
            model_name="academicyear",
            name="rollover_source",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="rollover_targets",
                to="academics.academicyear",
            ),
        ),
        migrations.AddField(
            model_name="academicyear",
            name="rollover_options",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="academicyear",
            name="rollover_copied",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddConstraint(
            model_name="academicyear",
            constraint=models.UniqueConstraint(
                condition=models.Q(("rollover_source__isnull", False)),
                fields=("rollover_source",),
                name="uniq_academic_rollover_source",
            ),
        ),
    ]
