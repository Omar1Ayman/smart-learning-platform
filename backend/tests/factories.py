import factory
from factory.django import DjangoModelFactory

from apps.academics.models import AcademicYear, Chapter, Course, Grade, Group, Stage, Subject, Term
from apps.accounts.models import User
from apps.people.models import Enrollment, TeacherAssignment
from apps.questions.models import Question, QuestionBank
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


class TeacherUserFactory(DjangoModelFactory):
    class Meta:
        model = User
        skip_postgeneration_save = True

    email = factory.Sequence(lambda n: f"teacher{n}@example.test")
    tenant = factory.SubFactory(TenantFactory)
    role = User.Role.TEACHER
    is_active = True

    @factory.post_generation
    def password(self, create, extracted, **kwargs):
        self.set_password(extracted or DEFAULT_TEST_PASSWORD)
        if create:
            self.save()


class StudentUserFactory(DjangoModelFactory):
    class Meta:
        model = User
        skip_postgeneration_save = True

    email = factory.Sequence(lambda n: f"student{n}@example.test")
    tenant = factory.SubFactory(TenantFactory)
    role = User.Role.STUDENT
    is_active = True

    @factory.post_generation
    def password(self, create, extracted, **kwargs):
        self.set_password(extracted or DEFAULT_TEST_PASSWORD)
        if create:
            self.save()


class GroupFactory(DjangoModelFactory):
    class Meta:
        model = Group

    grade = factory.SubFactory(GradeFactory)
    tenant = factory.SelfAttribute("grade.tenant")
    academic_year = factory.LazyAttribute(lambda o: AcademicYearFactory(tenant=o.grade.tenant))
    name = factory.Sequence(lambda n: f"Group {n}")


class TeacherAssignmentFactory(DjangoModelFactory):
    class Meta:
        model = TeacherAssignment
        skip_postgeneration_save = True

    course = factory.SubFactory(CourseFactory)
    tenant = factory.SelfAttribute("course.tenant")
    teacher = factory.LazyAttribute(lambda o: TeacherUserFactory(tenant=o.course.tenant))


class EnrollmentFactory(DjangoModelFactory):
    class Meta:
        model = Enrollment

    group = factory.SubFactory(GroupFactory)
    tenant = factory.SelfAttribute("group.tenant")
    academic_year = factory.SelfAttribute("group.academic_year")
    student = factory.LazyAttribute(lambda o: StudentUserFactory(tenant=o.group.tenant))


class TermFactory(DjangoModelFactory):
    class Meta:
        model = Term

    academic_year = factory.SubFactory(AcademicYearFactory)
    tenant = factory.SelfAttribute("academic_year.tenant")
    name = factory.Sequence(lambda n: f"Term {n}")
    start_date = "2026-09-01"
    end_date = "2027-01-31"
    order = 1


class QuestionBankFactory(DjangoModelFactory):
    class Meta:
        model = QuestionBank

    tenant = factory.SubFactory(TenantFactory)
    name = factory.Sequence(lambda n: f"Question Bank {n}")


class QuestionFactory(DjangoModelFactory):
    class Meta:
        model = Question
        skip_postgeneration_save = True

    bank = factory.SubFactory(QuestionBankFactory)
    tenant = factory.SelfAttribute("bank.tenant")
    text = factory.Sequence(lambda n: f"Question text {n}?")
    question_type = Question.QuestionType.SHORT_ANSWER
    accepted_answers = factory.LazyFunction(lambda: ["42"])
    created_by = factory.LazyAttribute(lambda o: TeacherUserFactory(tenant=o.tenant))

    @factory.post_generation
    def approved(self, create, extracted, **kwargs):
        if extracted and create:
            self.review_status = Question.ReviewStatus.APPROVED
            self.save(update_fields=["review_status"])
