"""
Reset the database and seed TWO complete demo schools.

Usage:
    # Safe — wipes everything and re-seeds both schools
    python manage.py reset_and_seed --wipe --confirm

    # Keep existing data, only (re)create the demo schools
    python manage.py reset_and_seed --force

What gets created:

    Platform admin:  admin@platform.test / AdminPass123!

    School 1: مدرسة النيل الدولية (nile.school) — 20 students, 4 teachers
    School 2: مركز المستقبل (future.edu)        — 12 students, 3 teachers

    Per school:
      - 1 OWNER + 1 ADMIN
      - 3–4 TEACHERS
      - 12–20 STUDENTS (with codes + barcodes)
      - 1 PARENT account linked to 2 students
      - 2 academic years + terms
      - 2 stages + 3 grades + 4 groups
      - 5 subjects + 6 courses + chapters + lessons
      - 2 question banks + ~10 questions
      - 2 assessments (1 published with attempts, 1 draft)
      - 1 closed attendance session + 1 open
      - weekly group schedules
      - content items (text/link/PDF)
"""

import secrets
from datetime import date, datetime, time, timedelta
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
from apps.accounts.models import ParentChild, User
from apps.assessments.models import (
    Assessment,
    AssessmentQuestion,
    AssessmentTarget,
)
from apps.attendance.models import (
    AttendanceRecord,
    AttendanceSession,
    GroupSchedule,
)
from apps.content.models import Content
from apps.exam_engine.models import AttemptAnswer, ExamAttempt
from apps.people.models import Enrollment, TeacherAssignment
from apps.questions.models import Question, QuestionBank, QuestionOption
from apps.tenants.models import Tenant


SCHOOLS = [
    {
        "slug": "nile-international",
        "name": "مدرسة النيل الدولية",
        "contact_email": "info@nile.school",
        "color": "#1E40AF",
        "owner_email": "owner@nile.school",
        "owner_password": "OwnerPass123!",
        "owner_first": "أحمد",
        "owner_last": "محمود",
        "admin_email": "admin@nile.school",
        "admin_password": "AdminPass123!",
        "admin_first": "سارة",
        "admin_last": "علي",
        "teachers": [
            ("teacher1@nile.school", "محمد", "حسن", "MATH"),
            ("teacher2@nile.school", "فاطمة", "أحمد", "BIO"),
            ("teacher3@nile.school", "خالد", "سعيد", "AR"),
            ("teacher4@nile.school", "نورا", "سمير", "PHY"),
        ],
        "students_count": 20,
        "subjects": [
            ("الرياضيات", "MATH"),
            ("الأحياء", "BIO"),
            ("اللغة العربية", "AR"),
            ("الفيزياء", "PHY"),
            ("اللغة الإنجليزية", "EN"),
        ],
        "stages": [("المرحلة الإعدادية", 1), ("المرحلة الثانوية", 2)],
        "grades": [
            ("الثالث الإعدادي", 1, "المرحلة الإعدادية"),
            ("الأول الثانوي", 1, "المرحلة الثانوية"),
            ("الثاني الثانوي", 2, "المرحلة الثانوية"),
        ],
        "groups_per_grade": 2,
        "parent_email": "parent@nile.school",
        "parent_password": "ParentPass123!",
        "parent_first": "عمر",
        "parent_last": "إبراهيم",
        "parent_children_indices": [0, 1],
    },
    {
        "slug": "future-center",
        "name": "مركز المستقبل التعليمي",
        "contact_email": "info@future.edu",
        "color": "#059669",
        "owner_email": "owner@future.edu",
        "owner_password": "OwnerPass123!",
        "owner_first": "هدى",
        "owner_last": "فتحي",
        "admin_email": "admin@future.edu",
        "admin_password": "AdminPass123!",
        "admin_first": "هاني",
        "admin_last": "مصطفى",
        "teachers": [
            ("teacher1@future.edu", "منى", "خليل", "MATH"),
            ("teacher2@future.edu", "أيمن", "راضي", "BIO"),
            ("teacher3@future.edu", "رانيا", "جميل", "AR"),
        ],
        "students_count": 12,
        "subjects": [
            ("الرياضيات", "MATH"),
            ("الأحياء", "BIO"),
            ("اللغة العربية", "AR"),
        ],
        "stages": [("المرحلة الثانوية", 1)],
        "grades": [
            ("الأول الثانوي", 1, "المرحلة الثانوية"),
            ("الثاني الثانوي", 2, "المرحلة الثانوية"),
        ],
        "groups_per_grade": 2,
        "parent_email": "parent@future.edu",
        "parent_password": "ParentPass123!",
        "parent_first": "منى",
        "parent_last": "عبد الله",
        "parent_children_indices": [0, 1],
    },
]


class Command(BaseCommand):
    help = "Reset DB and seed two complete demo schools."

    def add_arguments(self, parser):
        parser.add_argument("--wipe", action="store_true", help="Delete ALL tenants.")
        parser.add_argument("--confirm", action="store_true", help="Required with --wipe.")
        parser.add_argument("--force", action="store_true", help="Recreate demo schools.")

    def handle(self, *args, **opts):
        if opts["wipe"] and not opts["confirm"]:
            raise CommandError("--wipe requires --confirm")

        if opts["wipe"]:
            self.stdout.write(self.style.WARNING("⚠️  Wiping all data..."))
            self._wipe()
            self.stdout.write(self.style.SUCCESS("✅ Database wiped."))

        # Platform admin
        admin_email = "admin@platform.test"
        if not User.objects.filter(email=admin_email).exists():
            User.objects.create_user(
                email=admin_email,
                password="AdminPass123!",
                is_platform_admin=True,
                is_staff=True,
                is_superuser=True,
            )
            self.stdout.write(self.style.SUCCESS(f"✅ Platform admin: {admin_email} / AdminPass123!"))
        else:
            self.stdout.write(self.style.WARNING(f"⚠️  Platform admin exists: {admin_email}"))

        for school in SCHOOLS:
            if opts["force"]:
                existing = Tenant.objects.filter(slug=school["slug"]).first()
                if existing:
                    self._delete_tenant(existing)
            if Tenant.objects.filter(slug=school["slug"]).exists():
                self.stdout.write(
                    self.style.WARNING(f"⚠️  {school['name']} already exists — skipping.")
                )
                continue
            self._create_school(school)
            self.stdout.write(self.style.SUCCESS(f"✅ {school['name']} created."))

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("=" * 60))
        self.stdout.write(self.style.SUCCESS("🎉 Done — login details:"))
        self.stdout.write(self.style.SUCCESS("=" * 60))
        self.stdout.write("")
        self.stdout.write("Platform admin:  admin@platform.test / AdminPass123!")
        for school in SCHOOLS:
            self.stdout.write("")
            self.stdout.write(self.style.HTTP_INFO(f"🏫 {school['name']}"))
            self.stdout.write(f"   Owner:    {school['owner_email']} / {school['owner_password']}")
            self.stdout.write(f"   Admin:    {school['admin_email']} / {school['admin_password']}")
            self.stdout.write(f"   Teacher:  {school['teachers'][0][0]} / TeacherPass123!")
            self.stdout.write(f"   Parent:   {school['parent_email']} / {school['parent_password']}")

    # =====================================================================
    # Wipe
    # =====================================================================

    def _wipe(self):
        AttemptAnswer.objects.all().delete()
        ExamAttempt.objects.all().delete()
        AssessmentQuestion.objects.all().delete()
        AssessmentTarget.objects.all().delete()
        Assessment.objects.all().delete()
        QuestionOption.objects.all().delete()
        Question.objects.all().delete()
        QuestionBank.objects.all().delete()
        Content.objects.all().delete()
        AttendanceRecord.objects.all().delete()
        AttendanceSession.objects.all().delete()
        GroupSchedule.objects.all().delete()
        Enrollment.objects.all().delete()
        TeacherAssignment.objects.all().delete()
        ParentChild.objects.all().delete()
        User.objects.filter(is_platform_admin=False).delete()
        Tenant.objects.all().delete()

    def _delete_tenant(self, tenant):
        AttemptAnswer.objects.filter(tenant=tenant).delete()
        ExamAttempt.objects.filter(tenant=tenant).delete()
        AssessmentQuestion.objects.filter(tenant=tenant).delete()
        AssessmentTarget.objects.filter(tenant=tenant).delete()
        Assessment.objects.filter(tenant=tenant).delete()
        QuestionOption.objects.filter(tenant=tenant).delete()
        Question.objects.filter(tenant=tenant).delete()
        QuestionBank.objects.filter(tenant=tenant).delete()
        Content.objects.filter(tenant=tenant).delete()
        AttendanceRecord.objects.filter(tenant=tenant).delete()
        AttendanceSession.objects.filter(tenant=tenant).delete()
        GroupSchedule.objects.filter(tenant=tenant).delete()
        Enrollment.objects.filter(tenant=tenant).delete()
        TeacherAssignment.objects.filter(tenant=tenant).delete()
        ParentChild.objects.filter(tenant=tenant).delete()
        User.objects.filter(tenant=tenant).delete()
        tenant.delete()

    # =====================================================================
    # Create school
    # =====================================================================

    @transaction.atomic
    def _create_school(self, school):
        tenant = Tenant.objects.create(
            name=school["name"],
            slug=school["slug"],
            status=Tenant.Status.ACTIVE,
            contact_email=school["contact_email"],
            primary_color=school["color"],
        )

        # ----- Users -----
        owner = User.objects.create_user(
            email=school["owner_email"],
            password=school["owner_password"],
            tenant=tenant,
            role=User.Role.OWNER,
            first_name=school["owner_first"],
            last_name=school["owner_last"],
        )
        admin = User.objects.create_user(
            email=school["admin_email"],
            password=school["admin_password"],
            tenant=tenant,
            role=User.Role.ADMIN,
            first_name=school["admin_first"],
            last_name=school["admin_last"],
        )

        teachers = []
        for email, first, last, _code in school["teachers"]:
            teachers.append(
                User.objects.create_user(
                    email=email,
                    password="TeacherPass123!",
                    tenant=tenant,
                    role=User.Role.TEACHER,
                    first_name=first,
                    last_name=last,
                )
            )

        # Students with parent info on the first two (for parent portal demo)
        student_names = [
            ("يوسف", "إبراهيم"), ("مريم", "عبد الله"), ("عمر", "السيد"),
            ("نور", "حسين"), ("كريم", "فتحي"), ("ليلى", "مسعود"),
            ("زياد", "رجب"), ("هدى", "الشريف"), ("أمير", "كمال"),
            ("رنا", "سامي"), ("ياسمين", "طه"), ("بشار", "عمران"),
            ("دينا", "خالد"), ("حمزة", "منصور"), ("سلمى", "جابر"),
            ("أنس", "شوقي"), ("ميار", "عبد العزيز"), ("رامي", "شعبان"),
            ("جنى", "أيمن"), ("سيف", "عثمان"),
        ][: school["students_count"]]

        students = []
        for idx, (first, last) in enumerate(student_names):
            student_email = f"student{idx + 1}@{school['slug'].split('-')[0]}.school"
            parent_info = {}
            if idx < 2:
                parent_info = {
                    "parent_name": f"{school['parent_first']} {school['parent_last']}",
                    "parent_email": school["parent_email"],
                    "parent_phone": "+201001234567",
                }
            students.append(
                User.objects.create_user(
                    email=student_email,
                    password="StudentPass123!",
                    tenant=tenant,
                    role=User.Role.STUDENT,
                    first_name=first,
                    last_name=last,
                    **parent_info,
                )
            )

        # Parent account
        parent_user = User.objects.create_user(
            email=school["parent_email"],
            password=school["parent_password"],
            tenant=tenant,
            role=User.Role.PARENT,
            first_name=school["parent_first"],
            last_name=school["parent_last"],
        )
        for i, child_idx in enumerate(school["parent_children_indices"]):
            ParentChild.objects.create(
                tenant=tenant,
                parent=parent_user,
                student=students[child_idx],
                relationship=ParentChild.Relationship.FATHER if i == 0 else ParentChild.Relationship.MOTHER,
                is_primary=(i == 0),
            )

        # ----- Academic structure -----
        year_current = AcademicYear.objects.create(
            tenant=tenant,
            name="2025/2026",
            start_date=date(2025, 9, 1),
            end_date=date(2026, 6, 30),
            is_active=True,
        )
        AcademicYear.objects.create(
            tenant=tenant,
            name="2026/2027",
            start_date=date(2026, 9, 1),
            end_date=date(2027, 6, 30),
            is_active=False,
        )

        Term.objects.create(
            tenant=tenant, academic_year=year_current,
            name="الفصل الأول",
            start_date=date(2025, 9, 1), end_date=date(2026, 1, 15), order=1,
        )
        Term.objects.create(
            tenant=tenant, academic_year=year_current,
            name="الفصل الثاني",
            start_date=date(2026, 1, 20), end_date=date(2026, 6, 15), order=2,
        )

        stages = {}
        for name, order in school["stages"]:
            stages[name] = Stage.objects.create(tenant=tenant, name=name, order=order)

        grades = {}
        for g_name, g_order, s_name in school["grades"]:
            grades[g_name] = Grade.objects.create(
                tenant=tenant, stage=stages[s_name], name=g_name, order=g_order,
            )

        subjects = {}
        for s_name, s_code in school["subjects"]:
            subjects[s_code] = Subject.objects.create(
                tenant=tenant, name=s_name, code=s_code,
            )

        # Groups
        groups = {}
        for g_name, grade in grades.items():
            for i in range(school["groups_per_grade"]):
                letter = ["أ", "ب"][i]
                groups[(g_name, letter)] = Group.objects.create(
                    tenant=tenant,
                    grade=grade,
                    academic_year=year_current,
                    name=f"{g_name} - {letter}",
                    capacity=30,
                )

        # Courses
        courses = {}
        for g_name, grade in grades.items():
            for code, subject in subjects.items():
                course_name = f"{subject.name} — {g_name}"
                courses[(g_name, code)] = Course.objects.create(
                    tenant=tenant, subject=subject, grade=grade,
                    academic_year=year_current, name=course_name,
                )

        # Chapters + Lessons for first course
        for key, course in list(courses.items())[:3]:
            for ch_idx in range(1, 3):
                chapter = Chapter.objects.create(
                    tenant=tenant, course=course,
                    name=f"الوحدة {ch_idx}", order=ch_idx,
                )
                for l_idx in range(1, 3):
                    Lesson.objects.create(
                        tenant=tenant, chapter=chapter,
                        name=f"الدرس {ch_idx}.{l_idx}", order=l_idx,
                    )

        # ----- Enrollments -----
        all_groups = list(groups.values())
        enrollments = []
        for idx, student in enumerate(students):
            group = all_groups[idx % len(all_groups)]
            enrollments.append(
                Enrollment.objects.create(
                    tenant=tenant, student=student, group=group,
                    academic_year=year_current, status=Enrollment.Status.ACTIVE,
                )
            )

        # ----- Teacher assignments -----
        all_courses = list(courses.values())
        for idx, teacher in enumerate(teachers):
            if idx < len(all_courses):
                course = all_courses[idx]
                ta = TeacherAssignment.objects.create(
                    tenant=tenant, teacher=teacher, course=course,
                )
                grade_groups = [g for g in all_groups if g.grade_id == course.grade_id]
                if grade_groups:
                    ta.groups.set(grade_groups[:1])

        # ----- Group schedules (for Today's Sessions widget) -----
        weekday = (timezone.localdate().weekday() + 1) % 7
        for group in all_groups[:2]:
            GroupSchedule.objects.create(
                tenant=tenant, group=group, weekday=weekday,
                start_time=time(9, 0), end_time=time(10, 0),
                teacher=teachers[0], is_active=True,
            )

        # ----- Content -----
        Content.objects.create(
            tenant=tenant,
            title="مذكرة الوحدة الأولى",
            content_type=Content.ContentType.TEXT,
            text_body="شرح مبسط للمعادلات الخطية والمتباينات...",
            grade=list(grades.values())[0],
            subject=list(subjects.values())[0],
            academic_year=year_current,
            is_published=True,
            created_by=teachers[0],
        )
        Content.objects.create(
            tenant=tenant,
            title="شرح مرئي — Khan Academy",
            content_type=Content.ContentType.EXTERNAL_LINK,
            external_url="https://www.khanacademy.org/math/algebra",
            is_published=True,
            created_by=teachers[0],
        )

        # ----- Question banks + questions -----
        bank = QuestionBank.objects.create(
            tenant=tenant, name=f"بنك أسئلة — {school['name']}",
            subject=list(subjects.values())[0],
            grade=list(grades.values())[0],
            created_by=teachers[0],
        )

        approved_qs = []

        # MCQ 1
        q1 = Question.objects.create(
            tenant=tenant, bank=bank,
            text="ما هو حل المعادلة 2x + 4 = 10؟",
            question_type=Question.QuestionType.MCQ,
            difficulty=Question.Difficulty.EASY,
            points=Decimal("2.00"),
            review_status=Question.ReviewStatus.APPROVED,
            reviewed_by=owner, reviewed_at=timezone.now(),
            created_by=teachers[0],
        )
        for i, (t, c) in enumerate([("x=2", False), ("x=3", True), ("x=4", False), ("x=5", False)], 1):
            QuestionOption.objects.create(
                tenant=tenant, question=q1, text=t, is_correct=c, order=i,
            )
        approved_qs.append(q1)

        # MCQ 2
        q2 = Question.objects.create(
            tenant=tenant, bank=bank,
            text="ما هو ناتج 5² ؟",
            question_type=Question.QuestionType.MCQ,
            difficulty=Question.Difficulty.EASY,
            points=Decimal("2.00"),
            review_status=Question.ReviewStatus.APPROVED,
            reviewed_by=owner, reviewed_at=timezone.now(),
            created_by=teachers[0],
        )
        for i, (t, c) in enumerate([("10", False), ("20", False), ("25", True), ("50", False)], 1):
            QuestionOption.objects.create(
                tenant=tenant, question=q2, text=t, is_correct=c, order=i,
            )
        approved_qs.append(q2)

        # TRUE_FALSE
        q3 = Question.objects.create(
            tenant=tenant, bank=bank,
            text="المعادلة x + 3 = 5 لها حل وحيد هو x = 2.",
            question_type=Question.QuestionType.TRUE_FALSE,
            difficulty=Question.Difficulty.EASY,
            points=Decimal("2.00"),
            review_status=Question.ReviewStatus.APPROVED,
            reviewed_by=owner, reviewed_at=timezone.now(),
            created_by=teachers[0],
        )
        QuestionOption.objects.create(tenant=tenant, question=q3, text="صح", is_correct=True, order=1)
        QuestionOption.objects.create(tenant=tenant, question=q3, text="خطأ", is_correct=False, order=2)
        approved_qs.append(q3)

        # SHORT_ANSWER
        q4 = Question.objects.create(
            tenant=tenant, bank=bank,
            text="ما هو الجذر التربيعي لـ 16؟",
            question_type=Question.QuestionType.SHORT_ANSWER,
            difficulty=Question.Difficulty.EASY,
            points=Decimal("2.00"),
            accepted_answers=["4", "أربعة"],
            review_status=Question.ReviewStatus.APPROVED,
            reviewed_by=owner, reviewed_at=timezone.now(),
            created_by=teachers[0],
        )
        approved_qs.append(q4)

        # ----- Published assessment with attempts -----
        assessment = Assessment.objects.create(
            tenant=tenant,
            title="امتحان الرياضيات الشهري",
            description="امتحان شهري على الوحدة الأولى",
            assessment_type=Assessment.AssessmentType.MONTHLY_EXAM,
            status=Assessment.Status.PUBLISHED,
            duration_minutes=30, max_attempts=2, passing_score=Decimal("50.00"),
            starts_at=timezone.now() - timedelta(days=3),
            ends_at=timezone.now() + timedelta(days=30),
            published_at=timezone.now() - timedelta(days=3),
            created_by=teachers[0],
        )
        for i, q in enumerate(approved_qs, 1):
            AssessmentQuestion.objects.create(
                tenant=tenant, assessment=assessment, question=q, order=i,
            )
        AssessmentTarget.objects.create(
            tenant=tenant, assessment=assessment,
            target_type=AssessmentTarget.TargetType.GRADE,
            grade=list(grades.values())[0],
        )

        # Draft assessment
        Assessment.objects.create(
            tenant=tenant,
            title="اختبار تدريبي — الرياضيات",
            assessment_type=Assessment.AssessmentType.PRACTICE,
            status=Assessment.Status.DRAFT,
            duration_minutes=None, max_attempts=5,
            created_by=teachers[0],
        )

        # Attempts for first 5 students
        now = timezone.now()
        for i, student in enumerate(students[:5]):
            is_graded = i % 2 == 0
            started_at = now - timedelta(hours=i + 5)
            expires_at = started_at + timedelta(hours=1)
            submitted_at = started_at + timedelta(minutes=45)

            attempt = ExamAttempt.objects.create(
                tenant=tenant,
                assessment=assessment,
                student=student,
                attempt_number=1,
                status=(
                    ExamAttempt.Status.GRADED
                    if is_graded
                    else ExamAttempt.Status.SUBMITTED
                ),
                question_order=[str(q.id) for q in approved_qs],
                max_score=Decimal("8.00"),
                score=Decimal("6.00") if is_graded else None,
                is_passed=is_graded,
                expires_at=None,  # set via UPDATE below
                submitted_at=submitted_at,
                graded_at=submitted_at if is_graded else None,
            )
            ExamAttempt.objects.filter(pk=attempt.pk).update(
                started_at=started_at,
                expires_at=expires_at,
            )
            attempt.refresh_from_db()

            for q in approved_qs:
                if q.question_type in (
                    Question.QuestionType.MCQ,
                    Question.QuestionType.TRUE_FALSE,
                ):
                    correct_option = q.options.filter(is_correct=True).first()
                    AttemptAnswer.objects.create(
                        tenant=tenant,
                        attempt=attempt,
                        question=q,
                        chosen_option=correct_option,
                        is_correct=True if is_graded else None,
                        awarded_points=Decimal("2.00") if is_graded else None,
                        graded_at=submitted_at if is_graded else None,
                        graded_by=teachers[0] if is_graded else None,
                    )
                else:
                    AttemptAnswer.objects.create(
                        tenant=tenant,
                        attempt=attempt,
                        question=q,
                        text_answer="إجابة الطالب",
                        is_correct=True if is_graded else None,
                        awarded_points=Decimal("2.00") if is_graded else None,
                        graded_at=submitted_at if is_graded else None,
                        graded_by=teachers[0] if is_graded else None,
                    )
        # ----- Attendance: one closed session with mixed statuses -----
        group_for_attendance = all_groups[0]
        att_session = AttendanceSession.objects.create(
            tenant=tenant,
            group=group_for_attendance,
            teacher=teachers[0],
            date=timezone.localdate() - timedelta(days=1),
            start_time=time(9, 0), end_time=time(10, 0),
            status=AttendanceSession.Status.CLOSED,
            mode=AttendanceSession.Mode.HYBRID,
            opened_at=timezone.now() - timedelta(days=1, hours=1),
            closed_at=timezone.now() - timedelta(days=1),
            created_by=owner,
        )
        group_enrollments = [
            e for e in enrollments if e.group_id == group_for_attendance.id
        ]
        for i, e in enumerate(group_enrollments):
            status = (
                AttendanceRecord.Status.PRESENT if i % 3 == 0
                else AttendanceRecord.Status.LATE if i % 3 == 1
                else AttendanceRecord.Status.ABSENT
            )
            AttendanceRecord.objects.create(
                tenant=tenant, session=att_session, student=e.student,
                status=status,
                check_in_method=AttendanceRecord.Method.QR if status != AttendanceRecord.Status.ABSENT else AttendanceRecord.Method.AUTO,
                check_in_at=timezone.now() - timedelta(days=1, hours=1) if status != AttendanceRecord.Status.ABSENT else None,
            )