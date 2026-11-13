"""
Seed realistic demo data for sales demos and QA.

Usage:
    # Fresh start (safest, recommended)
    python manage.py flush --no-input
    python manage.py seed_demo_data

    # Wipe ALL data across all tenants, then seed
    python manage.py seed_demo_data --wipe --confirm

    # Recreate only the demo tenant (keeps other tenants)
    python manage.py seed_demo_data --force

    # Skip creating exam attempts (cleaner for a fresh demo)
    python manage.py seed_demo_data --no-attempts

The command is idempotent by default: running it twice without --force
prints the existing demo tenant's credentials instead of creating
duplicates.
"""

from datetime import timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.academics.models import (
    AcademicYear,
    Chapter,
    Course,
    Grade,
    Group,
    Lesson,
    Stage,
    Subject,
    Term,
)
from apps.accounts.models import User
from apps.assessments.models import Assessment, AssessmentQuestion, AssessmentTarget
from apps.content.models import Content
from apps.exam_engine.models import AttemptAnswer, ExamAttempt
from apps.people.models import Enrollment, TeacherAssignment
from apps.questions.models import Question, QuestionBank, QuestionOption
from apps.tenants.models import Tenant

DEMO_TENANT_SLUG = "nile-international"
DEMO_TENANT_NAME = "مدرسة النيل الدولية"


class Command(BaseCommand):
    help = "Seed realistic demo data (15 students, 3 teachers, exam with attempts)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--force",
            action="store_true",
            help="Delete the existing demo tenant (keeping others) and recreate.",
        )
        parser.add_argument(
            "--wipe",
            action="store_true",
            help="DANGER: delete ALL tenants and ALL tenant-scoped data before seeding.",
        )
        parser.add_argument(
            "--confirm",
            action="store_true",
            help="Required with --wipe as a safety belt.",
        )
        parser.add_argument(
            "--no-attempts",
            action="store_true",
            help="Skip creating ExamAttempt rows (cleaner for a fresh demo).",
        )

    def handle(self, *args, **options):
        force = options["force"]
        wipe = options["wipe"]
        confirm = options["confirm"]
        no_attempts = options["no_attempts"]

        if wipe and not confirm:
            raise CommandError("--wipe requires --confirm (safety belt).")

        if wipe:
            self.stdout.write(self.style.WARNING("⚠️  Wiping ALL data..."))
            self._wipe_all()

        if force:
            self.stdout.write(self.style.WARNING("Deleting existing demo tenant..."))
            self._delete_demo_tenant()

        existing = Tenant.objects.filter(slug=DEMO_TENANT_SLUG).first()
        if existing is not None:
            self.stdout.write(
                self.style.WARNING(
                    f"Demo tenant '{existing.name}' already exists (slug: {DEMO_TENANT_SLUG})."
                )
            )
            self.stdout.write(
                self.style.WARNING(
                    "Use --force to delete and recreate, or --wipe --confirm for full reset."
                )
            )
            self._print_summary(existing)
            return

        with transaction.atomic():
            tenant = self._build_tenant()
            self._build_users(tenant)
            self._build_academic_structure(tenant)
            self._build_people(tenant)
            self._build_content(tenant)
            banks = self._build_question_banks(tenant)
            self._build_assessments(tenant, banks, no_attempts=no_attempts)

        self._print_summary(tenant)

    # ========================================================================
    # Deletion
    # ========================================================================

    def _wipe_all(self):
        """Delete everything in safe order to avoid RESTRICT errors.

        Order matters:
          - AttemptAnswer before Question (RESTRICT)
          - ExamAttempt before Assessment (RESTRICT)
          - AssessmentQuestion before Question (RESTRICT)
        """
        AttemptAnswer.objects.all().delete()
        ExamAttempt.objects.all().delete()
        AssessmentQuestion.objects.all().delete()
        AssessmentTarget.objects.all().delete()
        Assessment.objects.all().delete()
        QuestionOption.objects.all().delete()
        Question.objects.all().delete()
        QuestionBank.objects.all().delete()
        Content.objects.all().delete()
        Enrollment.objects.all().delete()
        TeacherAssignment.objects.all().delete()
        User.objects.filter(is_platform_admin=False).delete()
        # Tenant-scoped models cascade from tenant; delete last
        Tenant.objects.all().delete()

        self.stdout.write(self.style.SUCCESS("  ✓ All data wiped."))

    def _delete_demo_tenant(self):
        tenant = Tenant.objects.filter(slug=DEMO_TENANT_SLUG).first()
        if tenant is None:
            return

        AttemptAnswer.objects.filter(tenant=tenant).delete()
        ExamAttempt.objects.filter(tenant=tenant).delete()
        AssessmentQuestion.objects.filter(tenant=tenant).delete()
        AssessmentTarget.objects.filter(tenant=tenant).delete()
        Assessment.objects.filter(tenant=tenant).delete()
        QuestionOption.objects.filter(tenant=tenant).delete()
        Question.objects.filter(tenant=tenant).delete()
        QuestionBank.objects.filter(tenant=tenant).delete()
        Content.objects.filter(tenant=tenant).delete()
        Enrollment.objects.filter(tenant=tenant).delete()
        TeacherAssignment.objects.filter(tenant=tenant).delete()
        User.objects.filter(tenant=tenant).delete()
        tenant.delete()

        self.stdout.write(self.style.SUCCESS(f"  ✓ Deleted demo tenant '{DEMO_TENANT_NAME}'."))

    # ========================================================================
    # Builders
    # ========================================================================

    def _build_tenant(self):
        tenant = Tenant.objects.create(
            name=DEMO_TENANT_NAME,
            slug=DEMO_TENANT_SLUG,
            status=Tenant.Status.ACTIVE,
            contact_email="info@nile.school",
            primary_color="#1E40AF",
            internal_notes="Demo tenant — created by seed_demo_data command.",
            trial_ends_at=None,
        )
        self.stdout.write(self.style.SUCCESS(f"  ✓ Tenant: {tenant.name}"))
        return tenant

    def _build_users(self, tenant):
        # Owner
        self.owner = User.objects.create_user(
            email="owner@nile.school",
            password="OwnerPass123!",
            tenant=tenant,
            role=User.Role.OWNER,
            first_name="أحمد",
            last_name="محمود",
        )
        # Admin
        self.admin = User.objects.create_user(
            email="admin@nile.school",
            password="AdminPass123!",
            tenant=tenant,
            role=User.Role.ADMIN,
            first_name="سارة",
            last_name="علي",
        )
        # Teachers
        self.teacher_math = User.objects.create_user(
            email="teacher1@nile.school",
            password="TeacherPass123!",
            tenant=tenant,
            role=User.Role.TEACHER,
            first_name="محمد",
            last_name="حسن",
        )
        self.teacher_bio = User.objects.create_user(
            email="teacher2@nile.school",
            password="TeacherPass123!",
            tenant=tenant,
            role=User.Role.TEACHER,
            first_name="فاطمة",
            last_name="أحمد",
        )
        self.teacher_arabic = User.objects.create_user(
            email="teacher3@nile.school",
            password="TeacherPass123!",
            tenant=tenant,
            role=User.Role.TEACHER,
            first_name="خالد",
            last_name="سعيد",
        )
        # Students
        student_names = [
            ("يوسف", "إبراهيم"),
            ("مريم", "عبد الله"),
            ("عمر", "السيد"),
            ("نور", "حسين"),
            ("كريم", "فتحي"),
            ("ليلى", "مسعود"),
            ("زياد", "رجب"),
            ("هدى", "الشريف"),
            ("أمير", "كمال"),
            ("رنا", "سامي"),
            ("ياسمين", "طه"),
            ("بشار", "عمران"),
            ("دينا", "خالد"),
            ("حمزة", "منصور"),
            ("سلمى", "جابر"),
        ]
        self.students = []
        for i, (first, last) in enumerate(student_names, start=1):
            self.students.append(
                User.objects.create_user(
                    email=f"student{i}@nile.school",
                    password="StudentPass123!",
                    tenant=tenant,
                    role=User.Role.STUDENT,
                    first_name=first,
                    last_name=last,
                )
            )
        self.stdout.write(
            self.style.SUCCESS(
                f"  ✓ Users: 1 owner, 1 admin, 3 teachers, {len(self.students)} students"
            )
        )

    def _build_academic_structure(self, tenant):
        # Academic years
        self.year_current = AcademicYear.objects.create(
            tenant=tenant,
            name="2025/2026",
            start_date="2025-09-01",
            end_date="2026-06-30",
            is_active=True,
        )
        AcademicYear.objects.create(
            tenant=tenant,
            name="2026/2027",
            start_date="2026-09-01",
            end_date="2027-06-30",
            is_active=False,
        )

        # Terms
        Term.objects.create(
            tenant=tenant,
            academic_year=self.year_current,
            name="الفصل الأول",
            start_date="2025-09-01",
            end_date="2026-01-15",
            order=1,
        )
        Term.objects.create(
            tenant=tenant,
            academic_year=self.year_current,
            name="الفصل الثاني",
            start_date="2026-01-20",
            end_date="2026-06-15",
            order=2,
        )

        # Stages & Grades
        stage_prep = Stage.objects.create(tenant=tenant, name="المرحلة الإعدادية", order=1)
        stage_sec = Stage.objects.create(tenant=tenant, name="المرحلة الثانوية", order=2)

        Grade.objects.create(tenant=tenant, stage=stage_prep, name="الثالث الإعدادي", order=3)

        self.grade_1sec = Grade.objects.create(
            tenant=tenant, stage=stage_sec, name="الأول الثانوي", order=1
        )
        Grade.objects.create(tenant=tenant, stage=stage_sec, name="الثاني الثانوي", order=2)

        # Subjects
        self.math = Subject.objects.create(tenant=tenant, name="الرياضيات", code="MATH")
        self.bio = Subject.objects.create(tenant=tenant, name="الأحياء", code="BIO")
        self.arabic = Subject.objects.create(tenant=tenant, name="اللغة العربية", code="AR")
        self.physics = Subject.objects.create(tenant=tenant, name="الفيزياء", code="PHY")

        # Groups (all in first secondary)
        self.group_a = Group.objects.create(
            tenant=tenant,
            grade=self.grade_1sec,
            academic_year=self.year_current,
            name="1ث - أ",
            capacity=30,
        )
        self.group_b = Group.objects.create(
            tenant=tenant,
            grade=self.grade_1sec,
            academic_year=self.year_current,
            name="1ث - ب",
            capacity=30,
        )
        Group.objects.create(
            tenant=tenant,
            grade=self.grade_1sec,
            academic_year=self.year_current,
            name="1ث - ج",
            capacity=30,
        )

        # Courses
        self.course_math = Course.objects.create(
            tenant=tenant,
            subject=self.math,
            grade=self.grade_1sec,
            name="رياضيات — الأول الثانوي",
            description="مقرر الرياضيات للصف الأول الثانوي.",
        )
        self.course_bio = Course.objects.create(
            tenant=tenant,
            subject=self.bio,
            grade=self.grade_1sec,
            name="أحياء — الأول الثانوي",
            description="مقرر الأحياء للصف الأول الثانوي.",
        )
        self.course_arabic = Course.objects.create(
            tenant=tenant,
            subject=self.arabic,
            grade=self.grade_1sec,
            name="لغة عربية — الأول الثانوي",
        )
        Course.objects.create(
            tenant=tenant,
            subject=self.physics,
            grade=self.grade_1sec,
            name="فيزياء — الأول الثانوي",
        )

        # Chapters & Lessons for Math
        ch_algebra = Chapter.objects.create(
            tenant=tenant, course=self.course_math, name="الجبر", order=1
        )
        Lesson.objects.create(tenant=tenant, chapter=ch_algebra, name="المعادلات الخطية", order=1)
        Lesson.objects.create(tenant=tenant, chapter=ch_algebra, name="المتباينات", order=2)

        ch_geometry = Chapter.objects.create(
            tenant=tenant, course=self.course_math, name="الهندسة", order=2
        )
        Lesson.objects.create(tenant=tenant, chapter=ch_geometry, name="المثلثات", order=1)

        # Chapters for Bio
        ch_cell = Chapter.objects.create(
            tenant=tenant, course=self.course_bio, name="الخلية", order=1
        )
        Lesson.objects.create(tenant=tenant, chapter=ch_cell, name="تركيب الخلية", order=1)
        Lesson.objects.create(tenant=tenant, chapter=ch_cell, name="الانقسام الخلوي", order=2)

        self.stdout.write(
            self.style.SUCCESS(
                "  ✓ Academic: 2 years, 2 terms, 2 stages, 3 grades, 4 subjects, 3 groups, 4 courses"
            )
        )

    def _build_people(self, tenant):
        # Distribute 15 students: 8 in group A, 4 in group B, 3 in group C
        # (group C not stored as a field, only A and B — remaining in default group C)
        group_c = Group.objects.get(
            tenant=tenant, grade=self.grade_1sec, name="1ث - ج"
        )
        assignments = (
            [(self.students[i], self.group_a) for i in range(0, 8)]
            + [(self.students[i], self.group_b) for i in range(8, 12)]
            + [(self.students[i], group_c) for i in range(12, 15)]
        )
        for student, group in assignments:
            Enrollment.objects.create(
                tenant=tenant,
                student=student,
                group=group,
                academic_year=self.year_current,
                status=Enrollment.Status.ACTIVE,
            )

        # Teacher assignments
        ta_math = TeacherAssignment.objects.create(
            tenant=tenant, teacher=self.teacher_math, course=self.course_math
        )
        ta_math.groups.set([self.group_a, self.group_b])

        # Bio covers the whole grade (no groups)
        TeacherAssignment.objects.create(
            tenant=tenant, teacher=self.teacher_bio, course=self.course_bio
        )

        ta_arabic = TeacherAssignment.objects.create(
            tenant=tenant, teacher=self.teacher_arabic, course=self.course_arabic
        )
        ta_arabic.groups.set([self.group_a])

        self.stdout.write(self.style.SUCCESS("  ✓ People: 15 enrollments, 3 teacher assignments"))

    def _build_content(self, tenant):
        Content.objects.create(
            tenant=tenant,
            title="مذكرة الجبر — الفصل الأول",
            content_type=Content.ContentType.TEXT,
            text_body="تشمل هذه المذكرة شرحًا مبسطًا للمعادلات الخطية والمتباينات...",
            course=self.course_math,
            grade=self.grade_1sec,
            subject=self.math,
            academic_year=self.year_current,
            is_published=True,
        )
        Content.objects.create(
            tenant=tenant,
            title="شرح مرئي — المعادلات الخطية",
            content_type=Content.ContentType.EXTERNAL_LINK,
            external_url="https://www.khanacademy.org/math/algebra",
            course=self.course_math,
            is_published=True,
        )
        Content.objects.create(
            tenant=tenant,
            title="ملخص وحدة الخلية",
            content_type=Content.ContentType.SUMMARY,
            text_body="الخلية هي وحدة بناء الكائن الحي. تتكون من الغشاء البلازمي والسيتوبلازم والنواة...",
            course=self.course_bio,
            grade=self.grade_1sec,
            is_published=True,
        )
        Content.objects.create(
            tenant=tenant,
            title="مقدمة في النحو العربي",
            content_type=Content.ContentType.TEXT,
            text_body="الجملة الاسمية تبدأ بمبتدأ وخبر...",
            course=self.course_arabic,
            is_published=True,
        )
        self.stdout.write(self.style.SUCCESS("  ✓ Content: 4 items"))

    def _build_question_banks(self, tenant):
        math_bank = QuestionBank.objects.create(
            tenant=tenant,
            name="بنك أسئلة الرياضيات — الأول الثانوي",
            description="أسئلة معتمدة لمقرر الرياضيات.",
            subject=self.math,
            grade=self.grade_1sec,
            created_by=self.teacher_math,
        )
        bio_bank = QuestionBank.objects.create(
            tenant=tenant,
            name="بنك أسئلة الأحياء — الأول الثانوي",
            subject=self.bio,
            grade=self.grade_1sec,
            created_by=self.teacher_bio,
        )

        now = timezone.now()

        def approved_question(**kwargs):
            return Question.objects.create(
                tenant=tenant,
                review_status=Question.ReviewStatus.APPROVED,
                reviewed_by=self.owner,
                reviewed_at=now,
                **kwargs,
            )

        # Math questions
        self.q_math_mcq1 = approved_question(
            bank=math_bank,
            text="ما هو حل المعادلة 2x + 4 = 10؟",
            question_type=Question.QuestionType.MCQ,
            difficulty=Question.Difficulty.EASY,
            topic="المعادلات الخطية",
            points=Decimal("2.00"),
            created_by=self.teacher_math,
        )
        QuestionOption.objects.create(
            tenant=tenant, question=self.q_math_mcq1, text="x = 2", is_correct=False, order=1
        )
        QuestionOption.objects.create(
            tenant=tenant, question=self.q_math_mcq1, text="x = 3", is_correct=True, order=2
        )
        QuestionOption.objects.create(
            tenant=tenant, question=self.q_math_mcq1, text="x = 4", is_correct=False, order=3
        )
        QuestionOption.objects.create(
            tenant=tenant, question=self.q_math_mcq1, text="x = 5", is_correct=False, order=4
        )

        self.q_math_mcq2 = approved_question(
            bank=math_bank,
            text="ما هو ناتج 5² ؟",
            question_type=Question.QuestionType.MCQ,
            difficulty=Question.Difficulty.EASY,
            topic="الأسس",
            points=Decimal("2.00"),
            created_by=self.teacher_math,
        )
        QuestionOption.objects.create(
            tenant=tenant, question=self.q_math_mcq2, text="10", is_correct=False, order=1
        )
        QuestionOption.objects.create(
            tenant=tenant, question=self.q_math_mcq2, text="20", is_correct=False, order=2
        )
        QuestionOption.objects.create(
            tenant=tenant, question=self.q_math_mcq2, text="25", is_correct=True, order=3
        )
        QuestionOption.objects.create(
            tenant=tenant, question=self.q_math_mcq2, text="50", is_correct=False, order=4
        )

        self.q_math_tf = approved_question(
            bank=math_bank,
            text="المعادلة x + 3 = 5 لها حل وحيد هو x = 2.",
            question_type=Question.QuestionType.TRUE_FALSE,
            difficulty=Question.Difficulty.EASY,
            points=Decimal("2.00"),
            created_by=self.teacher_math,
        )
        QuestionOption.objects.create(
            tenant=tenant, question=self.q_math_tf, text="صح", is_correct=True, order=1
        )
        QuestionOption.objects.create(
            tenant=tenant, question=self.q_math_tf, text="خطأ", is_correct=False, order=2
        )

        self.q_math_short = approved_question(
            bank=math_bank,
            text="ما هو الجذر التربيعي لـ 16؟",
            question_type=Question.QuestionType.SHORT_ANSWER,
            difficulty=Question.Difficulty.EASY,
            points=Decimal("2.00"),
            accepted_answers=["4", "أربعة"],
            created_by=self.teacher_math,
        )

        self.q_math_essay = approved_question(
            bank=math_bank,
            text="اشرح خطوات حل المعادلة 3x - 7 = 11.",
            question_type=Question.QuestionType.ESSAY,
            difficulty=Question.Difficulty.MEDIUM,
            points=Decimal("2.00"),
            created_by=self.teacher_math,
        )

        # Bio questions
        self.q_bio_mcq = approved_question(
            bank=bio_bank,
            text="أيٌّ من التالي يوجد في الخلية النباتية ولا يوجد في الخلية الحيوانية؟",
            question_type=Question.QuestionType.MCQ,
            difficulty=Question.Difficulty.EASY,
            points=Decimal("2.00"),
            created_by=self.teacher_bio,
        )
        QuestionOption.objects.create(
            tenant=tenant, question=self.q_bio_mcq, text="النواة", is_correct=False, order=1
        )
        QuestionOption.objects.create(
            tenant=tenant,
            question=self.q_bio_mcq,
            text="البلاستيدات الخضراء",
            is_correct=True,
            order=2,
        )
        QuestionOption.objects.create(
            tenant=tenant, question=self.q_bio_mcq, text="الميتوكوندريا", is_correct=False, order=3
        )

        self.q_bio_tf = approved_question(
            bank=bio_bank,
            text="الميتوكوندريا هي مصنع الطاقة في الخلية.",
            question_type=Question.QuestionType.TRUE_FALSE,
            difficulty=Question.Difficulty.EASY,
            points=Decimal("2.00"),
            created_by=self.teacher_bio,
        )
        QuestionOption.objects.create(
            tenant=tenant, question=self.q_bio_tf, text="صح", is_correct=True, order=1
        )
        QuestionOption.objects.create(
            tenant=tenant, question=self.q_bio_tf, text="خطأ", is_correct=False, order=2
        )

        self.stdout.write(
            self.style.SUCCESS("  ✓ Question banks: 2 banks, 7 questions total")
        )
        return {"math": math_bank, "bio": bio_bank}

    def _build_assessments(self, tenant, banks, no_attempts=False):
        now = timezone.now()

        # 1. Math monthly exam — PUBLISHED with attempts
        math_exam = Assessment.objects.create(
            tenant=tenant,
            title="امتحان الرياضيات الشهري",
            description="امتحان شهري على وحدة الجبر — مدته 30 دقيقة.",
            assessment_type=Assessment.AssessmentType.MONTHLY_EXAM,
            status=Assessment.Status.PUBLISHED,
            duration_minutes=30,
            max_attempts=2,
            passing_score=Decimal("50.00"),
            randomize_question_order=False,
            randomize_option_order=False,
            starts_at=now - timedelta(days=5),
            ends_at=now + timedelta(days=30),
            published_at=now - timedelta(days=5),
            created_by=self.teacher_math,
        )
        math_questions = [
            self.q_math_mcq1,
            self.q_math_mcq2,
            self.q_math_tf,
            self.q_math_short,
            self.q_math_essay,
        ]
        for idx, q in enumerate(math_questions, start=1):
            AssessmentQuestion.objects.create(
                tenant=tenant, assessment=math_exam, question=q, order=idx
            )
        AssessmentTarget.objects.create(
            tenant=tenant,
            assessment=math_exam,
            target_type=AssessmentTarget.TargetType.GRADE,
            grade=self.grade_1sec,
        )

        # 2. Biology exam — DRAFT (no targets, not published yet)
        bio_exam = Assessment.objects.create(
            tenant=tenant,
            title="اختبار الأحياء الشهري",
            description="اختبار على وحدة الخلية — مسودة تحت الإنشاء.",
            assessment_type=Assessment.AssessmentType.QUIZ,
            status=Assessment.Status.DRAFT,
            duration_minutes=20,
            max_attempts=1,
            created_by=self.teacher_bio,
        )
        for idx, q in enumerate([self.q_bio_mcq, self.q_bio_tf], start=1):
            AssessmentQuestion.objects.create(
                tenant=tenant, assessment=bio_exam, question=q, order=idx
            )

        # 3. Practice quiz — PUBLISHED, no attempts yet
        practice_exam = Assessment.objects.create(
            tenant=tenant,
            title="اختبار تدريبي — الرياضيات",
            description="اختبار تدريبي مفتوح — بدون حد زمني.",
            assessment_type=Assessment.AssessmentType.PRACTICE,
            status=Assessment.Status.PUBLISHED,
            duration_minutes=None,
            max_attempts=5,
            randomize_question_order=True,
            randomize_option_order=True,
            published_at=now - timedelta(days=1),
            created_by=self.teacher_math,
        )
        for idx, q in enumerate([self.q_math_mcq1, self.q_math_mcq2], start=1):
            AssessmentQuestion.objects.create(
                tenant=tenant, assessment=practice_exam, question=q, order=idx
            )
        AssessmentTarget.objects.create(
            tenant=tenant,
            assessment=practice_exam,
            target_type=AssessmentTarget.TargetType.GRADE,
            grade=self.grade_1sec,
        )

        self.stdout.write(
            self.style.SUCCESS(
                "  ✓ Assessments: 1 published+attempts, 1 draft, 1 published (practice)"
            )
        )

        if no_attempts:
            return

        # Create attempts for the first 5 students on the math exam
        self._create_attempts(tenant, math_exam, math_questions)

    def _create_attempts(self, tenant, assessment, questions):
        """Create historical exam attempts for demo purposes.

        Note on `started_at`: the model uses `auto_now_add=True`, so any
        value passed at `create()` time is silently discarded and replaced
        with "now". The `attempt_expiry_after_start` CHECK requires
        `expires_at > started_at`, so a historical `expires_at` (which is
        in the past relative to "now") violates it.

        Workaround: create the row with `expires_at=NULL` (allowed by the
        same constraint), then a single UPDATE sets `started_at` and
        `expires_at` atomically. Postgres rechecks the constraint on
        UPDATE — both values are now historical and correctly ordered, so
        it passes.
        """
        now = timezone.now()
        question_ids = [str(q.id) for q in questions]
        max_score = Decimal("10.00")

        def make_attempt(
            student,
            *,
            status,
            started_at,
            expires_at,
            submitted_at=None,
            graded_at=None,
            score=None,
            is_passed=None,
        ):
            attempt = ExamAttempt.objects.create(
                tenant=tenant,
                assessment=assessment,
                student=student,
                attempt_number=1,
                status=status,
                question_order=question_ids,
                option_order={},
                max_score=max_score,
                score=score,
                is_passed=is_passed,
                submitted_at=submitted_at,
                graded_at=graded_at,
                expires_at=None,  # constraint-safe placeholder, updated below
            )
            ExamAttempt.objects.filter(pk=attempt.pk).update(
                started_at=started_at,
                expires_at=expires_at,
            )
            attempt.refresh_from_db()
            return attempt

        def make_answer(
            attempt, question, chosen=None, text="", is_correct=None, awarded=None
        ):
            AttemptAnswer.objects.create(
                tenant=tenant,
                attempt=attempt,
                question=question,
                chosen_option=chosen,
                text_answer=text,
                is_correct=is_correct,
                awarded_points=awarded,
            )

        # ------------------------------------------------------------------
        # Student 1 — GRADED (8/10)
        # ------------------------------------------------------------------
        attempt1 = make_attempt(
            self.students[0],
            status=ExamAttempt.Status.GRADED,
            score=Decimal("8.00"),
            is_passed=True,
            started_at=now - timedelta(days=3),
            expires_at=now - timedelta(days=3) + timedelta(minutes=30),
            submitted_at=now - timedelta(days=3) + timedelta(minutes=25),
            graded_at=now - timedelta(days=3),
        )
        make_answer(
            attempt1, self.q_math_mcq1,
            self.q_math_mcq1.options.get(is_correct=True),
            is_correct=True, awarded=Decimal("2.00"),
        )
        make_answer(
            attempt1, self.q_math_mcq2,
            self.q_math_mcq2.options.get(is_correct=True),
            is_correct=True, awarded=Decimal("2.00"),
        )
        make_answer(
            attempt1, self.q_math_tf,
            self.q_math_tf.options.get(is_correct=True),
            is_correct=True, awarded=Decimal("2.00"),
        )
        make_answer(
            attempt1, self.q_math_short,
            text="4", is_correct=True, awarded=Decimal("2.00"),
        )
        make_answer(
            attempt1, self.q_math_essay,
            text="ننقل -7 للطرف الآخر فتصبح 3x = 18 ثم نقسم على 3 فتصبح x = 6.",
            is_correct=True, awarded=Decimal("0.00"),
        )

        # ------------------------------------------------------------------
        # Student 2 — SUBMITTED (essay pending → 6/10 so far)
        # ------------------------------------------------------------------
        attempt2 = make_attempt(
            self.students[1],
            status=ExamAttempt.Status.SUBMITTED,
            score=Decimal("6.00"),
            is_passed=None,
            started_at=now - timedelta(days=2),
            expires_at=now - timedelta(days=2) + timedelta(minutes=30),
            submitted_at=now - timedelta(days=2) + timedelta(minutes=28),
        )
        make_answer(
            attempt2, self.q_math_mcq1,
            self.q_math_mcq1.options.get(is_correct=True),
            is_correct=True, awarded=Decimal("2.00"),
        )
        make_answer(
            attempt2, self.q_math_mcq2,
            self.q_math_mcq2.options.get(is_correct=False, order=1),
            is_correct=False, awarded=Decimal("0.00"),
        )
        make_answer(
            attempt2, self.q_math_tf,
            self.q_math_tf.options.get(is_correct=True),
            is_correct=True, awarded=Decimal("2.00"),
        )
        make_answer(
            attempt2, self.q_math_short,
            text="4", is_correct=True, awarded=Decimal("2.00"),
        )
        make_answer(
            attempt2, self.q_math_essay,
            text="الحل هو x = 6 بطريقة النقل والقسمة.",
        )

        # ------------------------------------------------------------------
        # Student 3 — IN_PROGRESS (10 minutes in, 20 left)
        # ------------------------------------------------------------------
        make_attempt(
            self.students[2],
            status=ExamAttempt.Status.IN_PROGRESS,
            started_at=now - timedelta(minutes=10),
            expires_at=now + timedelta(minutes=20),
        )

        # ------------------------------------------------------------------
        # Student 4 — EXPIRED (started 2h ago, never submitted)
        # ------------------------------------------------------------------
        make_attempt(
            self.students[3],
            status=ExamAttempt.Status.EXPIRED,
            started_at=now - timedelta(hours=2),
            expires_at=now - timedelta(hours=1, minutes=30),
        )

        # ------------------------------------------------------------------
        # Student 5 — GRADED (10/10)
        # ------------------------------------------------------------------
        attempt5 = make_attempt(
            self.students[4],
            status=ExamAttempt.Status.GRADED,
            score=Decimal("10.00"),
            is_passed=True,
            started_at=now - timedelta(days=1),
            expires_at=now - timedelta(days=1) + timedelta(minutes=30),
            submitted_at=now - timedelta(days=1) + timedelta(minutes=18),
            graded_at=now - timedelta(days=1),
        )
        make_answer(
            attempt5, self.q_math_mcq1,
            self.q_math_mcq1.options.get(is_correct=True),
            is_correct=True, awarded=Decimal("2.00"),
        )
        make_answer(
            attempt5, self.q_math_mcq2,
            self.q_math_mcq2.options.get(is_correct=True),
            is_correct=True, awarded=Decimal("2.00"),
        )
        make_answer(
            attempt5, self.q_math_tf,
            self.q_math_tf.options.get(is_correct=True),
            is_correct=True, awarded=Decimal("2.00"),
        )
        make_answer(
            attempt5, self.q_math_short,
            text="4", is_correct=True, awarded=Decimal("2.00"),
        )
        make_answer(
            attempt5, self.q_math_essay,
            text="3x - 7 = 11 => 3x = 18 => x = 6.",
            is_correct=True, awarded=Decimal("2.00"),
        )

        self.stdout.write(
            self.style.SUCCESS(
                "  ✓ Attempts: 5 (2 graded, 1 submitted, 1 in progress, 1 expired)"
            )
        )
    # ========================================================================
    # Summary
    # ========================================================================

    def _print_summary(self, tenant):
        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("=" * 68))
        self.stdout.write(self.style.SUCCESS("✅ Demo data ready"))
        self.stdout.write(self.style.SUCCESS("=" * 68))
        self.stdout.write("")
        self.stdout.write(self.style.HTTP_INFO(f"🏫 Tenant: {tenant.name}"))
        self.stdout.write(f"   slug:   {tenant.slug}")
        self.stdout.write(f"   status: {tenant.get_status_display()}")
        self.stdout.write("")

        # Get platform admin for summary
        platform_admin = User.objects.filter(is_platform_admin=True).first()

        self.stdout.write(self.style.HTTP_INFO("👑 Platform admin (for /platform):"))
        if platform_admin:
            self.stdout.write(f"   Email:    {platform_admin.email}")
            self.stdout.write(f"   Password: (as set when you created it)")
        else:
            self.stdout.write(self.style.WARNING("   (none — create with createsuperuser)"))
        self.stdout.write("")

        self.stdout.write(self.style.HTTP_INFO("🏫 School users (for /login):"))
        self.stdout.write("   Owner:    owner@nile.school    / OwnerPass123!")
        self.stdout.write("   Admin:    admin@nile.school    / AdminPass123!")
        self.stdout.write("   Teacher:  teacher1@nile.school / TeacherPass123!  (Math)")
        self.stdout.write("   Teacher:  teacher2@nile.school / TeacherPass123!  (Biology)")
        self.stdout.write("   Teacher:  teacher3@nile.school / TeacherPass123!  (Arabic)")
        self.stdout.write("   Student:  student1@nile.school / StudentPass123!  (has graded attempt)")
        self.stdout.write("   Student:  student2@nile.school / StudentPass123!  (pending grading)")
        self.stdout.write("   Student:  student3@nile.school / StudentPass123!  (in progress)")
        self.stdout.write("   ...students 4-15 share StudentPass123!")
        self.stdout.write("")

        self.stdout.write(self.style.HTTP_INFO("🎯 Demo flow suggestions:"))
        self.stdout.write("   1. Log in as teacher1 → /dashboard → see pending grading")
        self.stdout.write("   2. Navigate to /assessments/[id]/results → grade the essay")
        self.stdout.write("   3. Log in as student2 → /dashboard → see graded result")
        self.stdout.write("   4. Log in as owner → /settings/security → enable 2FA")
        self.stdout.write("   5. Log in as platform admin → /platform → see metrics + demo request")
        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("=" * 68))
        self.stdout.write("")