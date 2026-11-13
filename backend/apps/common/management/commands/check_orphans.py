"""Find and report any orphaned tenant-owned rows.

An orphan is a row whose *required* parent chain is broken — usually the
result of a bad bulk import or a manual SQL operation. Normal API writes
can't create orphans because serializers validate the chain. But data
that arrives some other way (imports, direct DB manipulation, a bug in a
future migration) could. This command makes the invariant testable.

Usage:
    python manage.py check_orphans            # report
    python manage.py check_orphans --fix      # not implemented — refuse
    python manage.py check_orphans --tenant=<slug>  # one tenant
"""

from django.core.management.base import BaseCommand

from apps.academics.models import Chapter, Course, Grade, Group, Lesson, Term
from apps.common.dependencies import MODEL_REQUIRES
from apps.people.models import Enrollment, TeacherAssignment
from apps.questions.models import Question

MODEL_MAP = {
    "Term": Term,
    "Grade": Grade,
    "Group": Group,
    "Course": Course,
    "Chapter": Chapter,
    "Lesson": Lesson,
    "Enrollment": Enrollment,
    "TeacherAssignment": TeacherAssignment,
    "Question": Question,
}


class Command(BaseCommand):
    help = "Report tenant-owned rows whose required parent chain is broken."

    def add_arguments(self, parser):
        parser.add_argument("--tenant", help="Restrict to a single tenant slug.")

    def handle(self, *args, **options):
        tenant_slug = options.get("tenant")
        tenant_filter = {}
        if tenant_slug:
            tenant_filter["tenant__slug"] = tenant_slug

        total_issues = 0
        for model_name, required_fields in MODEL_REQUIRES.items():
            model = MODEL_MAP.get(model_name)
            if model is None:
                continue  # informational entries without a concrete model

            qs = model.objects.all()
            if tenant_filter and hasattr(model, "tenant"):
                qs = qs.filter(**tenant_filter)

            # Build an OR query for "any required FK is NULL or points nowhere".
            # Since Django enforces FKs at the DB level, "points nowhere" can
            # only happen if a parent was deleted while a child's on_delete
            # was SET_NULL. Group/grade/etc use CASCADE, so an orphan is
            # practically always a NULL FK that the serializer *should*
            # have rejected but didn't (a bug we're catching).
            from django.db.models import Q

            q = Q()
            for field in required_fields:
                q |= Q(**{f"{field}__isnull": True})
            if not q:
                continue

            orphans = qs.filter(q)
            count = orphans.count()
            if count:
                total_issues += count
                self.stdout.write(
                    self.style.ERROR(
                        f"  [{model_name}] {count} orphan row(s) — missing one of: {', '.join(required_fields)}"
                    )
                )
                for row in orphans[:5]:
                    self.stdout.write(f"     {row.id}")

        if total_issues == 0:
            self.stdout.write(self.style.SUCCESS("✅ No orphans found — data integrity OK."))
        else:
            self.stdout.write(
                self.style.ERROR(
                    f"\n⚠️  {total_issues} orphan row(s) found. Investigate before shipping."
                )
            )
