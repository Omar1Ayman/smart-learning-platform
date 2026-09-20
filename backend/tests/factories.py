import factory
from factory.django import DjangoModelFactory

from apps.academics.models import AcademicYear
from apps.accounts.models import User
from apps.tenants.models import Tenant

DEFAULT_TEST_PASSWORD = "TestPass123!"


class TenantFactory(DjangoModelFactory):
    class Meta:
        model = Tenant

    name = factory.Sequence(lambda n: f"Tenant {n}")
    slug = factory.Sequence(lambda n: f"tenant-{n}")


class UserFactory(DjangoModelFactory):
    class Meta:
        model = User
        skip_postgeneration_save = True

    email = factory.Sequence(lambda n: f"user{n}@example.test")
    tenant = factory.SubFactory(TenantFactory)
    role = User.Role.TEACHER
    is_active = True

    @factory.post_generation
    def password(self, create, extracted, **kwargs):
        self.set_password(extracted or DEFAULT_TEST_PASSWORD)
        if create:
            self.save()


class AcademicYearFactory(DjangoModelFactory):
    class Meta:
        model = AcademicYear

    tenant = factory.SubFactory(TenantFactory)
    name = factory.Sequence(lambda n: f"202{n % 9}/202{n % 9 + 1}")
    start_date = "2026-09-01"
    end_date = "2027-06-30"
