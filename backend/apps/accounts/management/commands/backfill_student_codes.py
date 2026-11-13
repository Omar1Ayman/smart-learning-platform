"""One-off command: backfill `student_code` for any STUDENT row that lacks one.

Run after applying the model change (Fix 1) if any students were created
BEFORE the save() override was in place:

    python manage.py backfill_student_codes

Safe to run multiple times — skips students that already have a code.
"""

import secrets

from django.core.management.base import BaseCommand

from apps.accounts.models import User


class Command(BaseCommand):
    help = "Backfill student_code for STUDENT rows that lack one."

    def handle(self, *args, **options):
        missing = User.objects.filter(role=User.Role.STUDENT).filter(
            student_code__isnull=True
        ) | User.objects.filter(role=User.Role.STUDENT, student_code="")
        total = missing.count()
        if total == 0:
            self.stdout.write(self.style.SUCCESS("✅ All students already have a code."))
            return

        self.stdout.write(f"Backfilling {total} student(s)...")

        # Pre-load existing codes to avoid unique-collision retries.
        existing = set(
            User.objects.exclude(student_code__isnull=True)
            .exclude(student_code="")
            .values_list("student_code", flat=True)
        )

        fixed = 0
        for user in missing.iterator():
            for _ in range(3):
                candidate = f"STU-{secrets.token_hex(5).upper()}"
                if candidate not in existing:
                    user.student_code = candidate
                    user.save(update_fields=["student_code"])
                    existing.add(candidate)
                    fixed += 1
                    break
            else:
                self.stdout.write(
                    self.style.WARNING(
                        f"  Skipped {user.email} — 3 collisions in a row (extremely unusual)."
                    )
                )

        self.stdout.write(self.style.SUCCESS(f"✅ Backfilled {fixed} of {total} student(s)."))
