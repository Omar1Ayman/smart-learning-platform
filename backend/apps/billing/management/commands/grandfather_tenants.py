"""One-off command: create subscriptions for existing tenants.

For tenants WITHOUT a Subscription (pre-billing data), this creates one
on the `free` plan. If their CURRENT usage exceeds the free plan's
limits, we add `limit_overrides` so they don't lose functionality on
deploy day.

Run this ONCE after applying billing migrations, before enabling
enforcement in production.

Usage:
    python manage.py grandfather_tenants --dry-run    # preview
    python manage.py grandfather_tenants              # apply
"""

from django.core.management.base import BaseCommand

from apps.accounts.models import User
from apps.billing.models import Plan, Subscription
from apps.tenants.models import Tenant


class Command(BaseCommand):
    help = "Create free-plan subscriptions for existing tenants; grandfather limits."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Print planned changes without writing.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]

        free = Plan.objects.filter(key="free", is_active=True).first()
        if free is None:
            self.stderr.write(
                self.style.ERROR(
                    "No free plan found. Run `python manage.py seed_plans` first."
                )
            )
            return

        tenants = Tenant.objects.all().order_by("name")
        created = 0
        grandfathered = 0

        for tenant in tenants:
            # Skip if already has a subscription.
            try:
                tenant.subscription
                self.stdout.write(f"  · {tenant.name}: already has subscription")
                continue
            except Subscription.DoesNotExist:
                pass

            students = (
                User.objects.for_tenant(tenant)
                .filter(role=User.Role.STUDENT)
                .count()
            )
            teachers = (
                User.objects.for_tenant(tenant)
                .filter(role=User.Role.TEACHER)
                .count()
            )

            overrides: dict = {}
            if free.max_students is not None and students >= free.max_students:
                overrides["max_students"] = students + 10
            if free.max_teachers is not None and teachers >= free.max_teachers:
                overrides["max_teachers"] = teachers + 10

            if dry_run:
                self.stdout.write(
                    f"  [DRY] {tenant.name}: students={students}, "
                    f"teachers={teachers}, overrides={overrides}"
                )
                continue

            Subscription.objects.create(
                tenant=tenant,
                plan=free,
                status=Subscription.Status.ACTIVE,
                limit_overrides=overrides,
            )
            created += 1

            if overrides:
                grandfathered += 1
                self.stdout.write(
                    self.style.WARNING(
                        f"  ⚠️  {tenant.name}: grandfathered "
                        f"{list(overrides.keys())} (students={students}, "
                        f"teachers={teachers})"
                    )
                )
            else:
                self.stdout.write(
                    f"  ✓ {tenant.name}: on free plan (within limits)"
                )

        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(
                f"Done. Created: {created}, Grandfathered: {grandfathered}"
            )
        )