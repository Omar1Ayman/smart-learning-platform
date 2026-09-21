import factory
from factory.django import DjangoModelFactory

from apps.academics.models import AcademicYear, Chapter, Course, Grade, Stage, Subject
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


class SubjectFactory(DjangoModelFactory):
    class Meta:
        model = Subject

    tenant = factory.SubFactory(TenantFactory)
    name = factory.Sequence(lambda n: f"Subject {n}")


class StageFactory(DjangoModelFactory):
    class Meta:
        model = Stage

    tenant = factory.SubFactory(TenantFactory)
    name = factory.Sequence(lambda n: f"Stage {n}")


class GradeFactory(DjangoModelFactory):
    class Meta:
        model = Grade

    stage = factory.SubFactory(StageFactory)
    tenant = factory.SelfAttribute("stage.tenant")
    name = factory.Sequence(lambda n: f"Grade {n}")


class CourseFactory(DjangoModelFactory):
    """subject is built explicitly against grade.tenant (not an
    independent SubFactory) so a plain CourseFactory() always produces
    internally-consistent tenant data — every FK actually belongs to the
    same tenant, the way the real app enforces it."""

    class Meta:
        model = Course

    grade = factory.SubFactory(GradeFactory)
    tenant = factory.SelfAttribute("grade.tenant")
    subject = factory.LazyAttribute(lambda o: SubjectFactory(tenant=o.grade.tenant))
    name = factory.Sequence(lambda n: f"Course {n}")


class ChapterFactory(DjangoModelFactory):
    class Meta:
        model = Chapter

    tenant = factory.SelfAttribute("course.tenant")
    course = factory.SubFactory(CourseFactory)
    name = factory.Sequence(lambda n: f"Chapter {n}")
    order = factory.Sequence(lambda n: n + 1)
