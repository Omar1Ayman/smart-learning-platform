# Generated manually — adds ABSENCE_ALERT notification type.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("notifications", "0002_alter_notification_type"),
    ]

    operations = [
        migrations.AlterField(
            model_name="notification",
            name="type",
            field=models.CharField(
                choices=[
                    ("EXAM_PUBLISHED", "امتحان جديد"),
                    ("EXAM_SUBMITTED", "محاولة جديدة"),
                    ("EXAM_GRADED", "نتيجة جديدة"),
                    ("QUESTION_APPROVED", "سؤال معتمد"),
                    ("QUESTION_REJECTED", "سؤال مرفوض"),
                    ("QUESTION_PENDING", "سؤال بانتظار المراجعة"),
                    ("ENROLLMENT_CREATED", "تسجيل جديد"),
                    ("SYSTEM", "نظام"),
                    ("EXAM_REOPENED", "إعادة فتح محاولة"),
                    ("ABSENCE_ALERT", "غياب"),
                ],
                max_length=40,
            ),
        ),
    ]