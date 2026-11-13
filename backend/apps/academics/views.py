from django.db import models
from django.http import HttpResponse
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from apps.assessments.models import Assessment
from apps.audit.services import log_action
from apps.common.permissions import IsAdminForWriteActions
from apps.common.views import TenantScopedViewSet, YearAwareViewSet
from apps.content.models import Content
from apps.people.models import Enrollment, TeacherAssignment

from .models import (
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
from .serializers import (
    AcademicYearSerializer,
    ChapterSerializer,
    CourseSerializer,
    GradeSerializer,
    GroupSerializer,
    LessonSerializer,
    PrepareNextYearSerializer,
    PromoteStudentsSerializer,
    StageSerializer,
    SubjectSerializer,
    TermSerializer,
)


class AcademicYearViewSet(TenantScopedViewSet):
    queryset = AcademicYear.objects.all()
    serializer_class = AcademicYearSerializer
    permission_classes = TenantScopedViewSet.permission_classes + [IsAdminForWriteActions]
    filterset_fields = ["is_active", "status"]

    @action(detail=True, methods=["get"], url_path="close-preflight")
    def close_preflight(self, request, pk=None):
        """GET /academic-years/<id>/close-preflight/ — readiness report."""
        year = self.get_object()
        from .services import close_preflight

        return Response(close_preflight(year))

    @action(detail=True, methods=["post"], url_path="prepare-next")
    def prepare_next(self, request, pk=None):
        """POST /academic-years/<id>/prepare-next/ — create new year."""
        year = self.get_object()
        serializer = PrepareNextYearSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        from .services import prepare_next_year

        try:
            result = prepare_next_year(
                year,
                serializer.validated_data,
                user=request.user,
            )
        except ValidationError as exc:
            detail = exc.detail if hasattr(exc, "detail") else str(exc)
            return Response(
                {"error": {"status": 400, "detail": detail}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        created = result.pop("_created", True)
        reused_existing = not created
        request_changed = result.pop("_request_changed", False)
        if reused_existing:
            result["reused_existing"] = True
        if request_changed:
            result["request_changed"] = True
        response_status = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return Response(result, status=response_status)

    @action(detail=True, methods=["post"], url_path="promote-students")
    def promote_students(self, request, pk=None):
        """POST /academic-years/<id>/promote-students/ — promote batch."""
        year = self.get_object()
        serializer = PromoteStudentsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        target_year_id = serializer.validated_data["target_year"]
        target_year = (
            AcademicYear.objects.for_tenant(request.tenant).filter(id=target_year_id).first()
        )
        if target_year is None:
            return Response(
                {"error": {"status": 404, "detail": "السنة الهدف غير موجودة."}},
                status=status.HTTP_404_NOT_FOUND,
            )

        from .services import promote_students

        try:
            result = promote_students(
                source_year=year,
                target_year=target_year,
                items=serializer.validated_data["items"],
                user=request.user,
            )
        except ValidationError as exc:
            detail = exc.detail if hasattr(exc, "detail") else str(exc)
            return Response(
                {"error": {"status": 400, "detail": detail}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(result)

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        """POST /academic-years/<id>/archive/ — archive a year."""
        year = self.get_object()

        from .services import archive_year

        try:
            archive_year(year, user=request.user)
        except ValidationError as exc:
            detail = exc.detail if hasattr(exc, "detail") else str(exc)
            return Response(
                {"error": {"status": 400, "detail": detail}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        year.refresh_from_db()
        return Response(AcademicYearSerializer(year).data)

    @action(detail=True, methods=["post"])
    def activate(self, request, pk=None):
        """POST /academic-years/<id>/activate/ — activate a DRAFT year."""
        year = self.get_object()
        try:
            year.activate()
        except Exception as exc:
            return Response(
                {"error": {"status": 400, "detail": str(exc)}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        year.refresh_from_db()
        return Response(AcademicYearSerializer(year).data)


class TermViewSet(YearAwareViewSet):
    queryset = Term.objects.all()
    serializer_class = TermSerializer
    draft_write_allowed = True
    permission_classes = TenantScopedViewSet.permission_classes + [IsAdminForWriteActions]
    filterset_fields = ["academic_year"]


class StageViewSet(TenantScopedViewSet):
    queryset = Stage.objects.all()
    serializer_class = StageSerializer
    permission_classes = TenantScopedViewSet.permission_classes + [IsAdminForWriteActions]

    @action(detail=True, methods=["get"], url_path="detail")
    def aggregated_detail(self, request, pk=None):
        """GET /stages/<id>/detail/ — everything about a stage."""
        stage = self.get_object()
        tenant = request.tenant

        grades = Grade.objects.for_tenant(tenant).filter(stage=stage).order_by("order")
        grades_data = []
        for g in grades:
            courses_count = Course.objects.for_tenant(tenant).filter(grade=g).count()
            groups_count = Group.objects.for_tenant(tenant).filter(grade=g).count()
            students_count = (
                Enrollment.objects.for_tenant(tenant)
                .filter(group__grade=g, status="ACTIVE")
                .values("student_id")
                .distinct()
                .count()
            )
            grades_data.append(
                {
                    "id": str(g.id),
                    "name": g.name,
                    "order": g.order,
                    "courses_count": courses_count,
                    "groups_count": groups_count,
                    "students_count": students_count,
                }
            )

        return Response(
            {
                "stage": StageSerializer(stage).data,
                "grades": grades_data,
                "summary": {
                    "grades_count": len(grades_data),
                    "total_students": sum(g["students_count"] for g in grades_data),
                },
            }
        )


class GradeViewSet(TenantScopedViewSet):
    queryset = Grade.objects.all()
    serializer_class = GradeSerializer
    permission_classes = TenantScopedViewSet.permission_classes + [IsAdminForWriteActions]
    filterset_fields = ["stage"]

    @action(detail=True, methods=["get"], url_path="detail")
    def aggregated_detail(self, request, pk=None):
        """GET /grades/<id>/detail/ — everything about a grade."""
        grade = self.get_object()
        tenant = request.tenant

        courses = Course.objects.for_tenant(tenant).filter(grade=grade)
        courses_data = [
            {
                "id": str(c.id),
                "name": c.name,
                "subject_name": c.subject.name,
                "academic_year_name": (c.academic_year.name if c.academic_year_id else None),
                "term_name": c.term.name if c.term_id else None,
            }
            for c in courses.select_related("subject", "academic_year", "term")
        ]

        groups_qs = (
            Group.objects.for_tenant(tenant)
            .filter(grade=grade)
            .annotate(
                student_count=models.Count(
                    "enrollments",
                    filter=models.Q(enrollments__status="ACTIVE"),
                )
            )
        )
        groups_data = [
            {
                "id": str(g.id),
                "name": g.name,
                "student_count": g.student_count,
                "academic_year": g.academic_year.name,
                "capacity": g.capacity,
            }
            for g in groups_qs
        ]

        assignments = (
            TeacherAssignment.objects.for_tenant(tenant)
            .filter(course__grade=grade)
            .select_related("teacher", "course")
            .distinct()
        )
        seen_teachers = {}
        for a in assignments:
            if str(a.teacher.id) not in seen_teachers:
                seen_teachers[str(a.teacher.id)] = {
                    "id": str(a.teacher.id),
                    "email": a.teacher.email,
                    "name": f"{a.teacher.first_name} {a.teacher.last_name}".strip()
                    or a.teacher.email,
                    "courses": [],
                }
            seen_teachers[str(a.teacher.id)]["courses"].append(a.course.name)

        return Response(
            {
                "grade": GradeSerializer(grade).data,
                "courses": courses_data,
                "groups": groups_data,
                "teachers": list(seen_teachers.values()),
                "summary": {
                    "courses_count": len(courses_data),
                    "groups_count": len(groups_data),
                    "teachers_count": len(seen_teachers),
                    "total_students": sum(g["student_count"] for g in groups_data),
                },
            }
        )


class GroupViewSet(YearAwareViewSet):
    queryset = Group.objects.all()
    serializer_class = GroupSerializer
    draft_write_allowed = True
    permission_classes = TenantScopedViewSet.permission_classes + [IsAdminForWriteActions]
    filterset_fields = ["grade", "academic_year"]

    @action(detail=True, methods=["get"], url_path="detail")
    def aggregated_detail(self, request, pk=None):
        """GET /groups/<id>/detail/ — group + students + assigned teachers."""
        group = self.get_object()
        tenant = request.tenant

        enrollments = (
            Enrollment.objects.for_tenant(tenant)
            .filter(group=group, status="ACTIVE")
            .select_related("student")
        )
        students_data = [
            {
                "id": str(e.student.id),
                "email": e.student.email,
                "name": f"{e.student.first_name} {e.student.last_name}".strip() or e.student.email,
                "status": e.status,
                "term_name": e.term.name if e.term_id else None,
            }
            for e in enrollments
        ]

        assignments = (
            TeacherAssignment.objects.for_tenant(tenant)
            .filter(groups=group)
            .select_related("teacher", "course")
        )
        teachers_data = [
            {
                "id": str(a.teacher.id),
                "email": a.teacher.email,
                "name": f"{a.teacher.first_name} {a.teacher.last_name}".strip() or a.teacher.email,
                "course_name": a.course.name,
            }
            for a in assignments
        ]

        return Response(
            {
                "group": {
                    "id": str(group.id),
                    "name": group.name,
                    "capacity": group.capacity,
                },
                "grade": {
                    "id": str(group.grade.id),
                    "name": group.grade.name,
                },
                "academic_year": {
                    "id": str(group.academic_year.id),
                    "name": group.academic_year.name,
                },
                "students": students_data,
                "teachers": teachers_data,
                "summary": {
                    "students_count": len(students_data),
                    "teachers_count": len(teachers_data),
                },
            }
        )


class SubjectViewSet(TenantScopedViewSet):
    queryset = Subject.objects.all()
    serializer_class = SubjectSerializer
    permission_classes = TenantScopedViewSet.permission_classes + [IsAdminForWriteActions]


class CourseViewSet(YearAwareViewSet):
    queryset = Course.objects.all()
    serializer_class = CourseSerializer
    draft_write_allowed = True
    permission_classes = TenantScopedViewSet.permission_classes + [IsAdminForWriteActions]
    filterset_fields = ["subject", "grade", "is_active", "academic_year", "term"]

    @action(detail=True, methods=["get"], url_path="detail")
    def aggregated_detail(self, request, pk=None):
        """GET /courses/<id>/detail/ — aggregated course view."""
        course = self.get_object()
        tenant = request.tenant

        chapters = []
        for ch in Chapter.objects.for_tenant(tenant).filter(course=course).order_by("order"):
            lessons = [
                {"id": str(l.id), "name": l.name, "order": l.order}
                for l in Lesson.objects.for_tenant(tenant).filter(chapter=ch).order_by("order")
            ]
            chapters.append(
                {"id": str(ch.id), "name": ch.name, "order": ch.order, "lessons": lessons}
            )

        assignments = (
            TeacherAssignment.objects.for_tenant(tenant)
            .filter(course=course)
            .select_related("teacher")
            .prefetch_related("groups")
        )
        teachers = [
            {
                "id": str(a.teacher.id),
                "email": a.teacher.email,
                "name": f"{a.teacher.first_name} {a.teacher.last_name}".strip() or a.teacher.email,
                "groups": [{"id": str(g.id), "name": g.name} for g in a.groups.all()],
                "scope_label": "الصف كامل"
                if not a.groups.exists()
                else f"{a.groups.count()} مجموعة",
            }
            for a in assignments
        ]

        groups = (
            Group.objects.for_tenant(tenant)
            .filter(grade=course.grade)
            .annotate(
                student_count=models.Count(
                    "enrollments",
                    filter=models.Q(enrollments__status="ACTIVE"),
                )
            )
        )
        groups_data = [
            {
                "id": str(g.id),
                "name": g.name,
                "student_count": g.student_count,
                "academic_year": g.academic_year.name,
            }
            for g in groups
        ]

        assessments_qs = (
            Assessment.objects.for_tenant(tenant)
            .filter(created_by__isnull=False)
            .filter(assessment_questions__question__bank__subject=course.subject)
            .distinct()
        )
        assessments = [
            {
                "id": str(a.id),
                "title": a.title,
                "assessment_type": a.assessment_type,
                "status": a.status,
                "created_at": a.created_at,
            }
            for a in assessments_qs[:20]
        ]

        content_qs = Content.objects.for_tenant(tenant).filter(course=course)
        content_count = content_qs.count()
        content_recent = [
            {
                "id": str(c.id),
                "title": c.title,
                "content_type": c.content_type,
                "created_at": c.created_at,
            }
            for c in content_qs.order_by("-created_at")[:5]
        ]

        return Response(
            {
                "course": CourseSerializer(course).data,
                "chapters": chapters,
                "teachers": teachers,
                "groups": groups_data,
                "assessments": assessments,
                "content": {
                    "count": content_count,
                    "recent": content_recent,
                },
            }
        )

    @action(detail=True, methods=["post"])
    def duplicate(self, request, pk=None):
        """POST /courses/<id>/duplicate/ — clone with full chapter+lesson tree."""
        from .services import duplicate_course

        source = self.get_object()
        copy = duplicate_course(source, actor=request.user)

        log_action(
            actor=request.user,
            tenant=request.tenant,
            action="course.duplicated",
            obj=copy,
            metadata={"source_id": str(source.id), "source_name": source.name},
        )

        return Response(
            CourseSerializer(copy).data,
            status=status.HTTP_201_CREATED,
        )

    # ====================================================================
    # Wave D1b — bulk curriculum import
    # ====================================================================

    @action(detail=False, methods=["get"], url_path="import_template")
    def import_template(self, request):
        """GET /courses/import_template/ — download XLSX curriculum template."""
        from .import_service import build_template_xlsx

        buf = build_template_xlsx()
        response = HttpResponse(
            buf.getvalue(),
            content_type=("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
        )
        response["Content-Disposition"] = 'attachment; filename="curriculum_template.xlsx"'
        return response

    @action(
        detail=False,
        methods=["post"],
        url_path="import",
        parser_classes=[MultiPartParser, FormParser],
    )
    def import_curriculum(self, request):
        """POST /courses/import/ — bulk import the academic structure."""
        from apps.billing.services import require_feature

        require_feature(request.tenant, "bulk_import")

        from apps.common.import_utils import MAX_IMPORT_BYTES, read_rows

        from .import_service import (
            REQUIRED_HEADERS,
            summarize_will_create,
            validate_curriculum_rows,
        )
        from .import_service import (
            import_curriculum as do_import,
        )

        upload = request.FILES.get("file")
        dry_run = str(request.data.get("dry_run", "false")).lower() in (
            "true",
            "1",
            "yes",
        )

        if upload is None:
            return Response(
                {"error": {"status": 400, "detail": "ملف Excel أو CSV مطلوب."}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if upload.size > MAX_IMPORT_BYTES:
            return Response(
                {
                    "error": {
                        "status": 400,
                        "detail": (
                            f"حجم الملف ({upload.size // (1024 * 1024)} ميجابايت) "
                            f"يتجاوز الحد المسموح "
                            f"({MAX_IMPORT_BYTES // (1024 * 1024)} ميجابايت)."
                        ),
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            rows = read_rows(upload.read())
        except Exception as exc:  # noqa: BLE001
            return Response(
                {
                    "error": {
                        "status": 400,
                        "detail": f"تعذّر قراءة الملف: {exc}",
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not rows:
            return Response(
                {
                    "error": {
                        "status": 400,
                        "detail": "الملف فارغ أو لا يحتوي على بيانات.",
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        sample = rows[0]
        missing = REQUIRED_HEADERS - set(sample.keys())
        if missing:
            return Response(
                {
                    "error": {
                        "status": 400,
                        "detail": f"الأعمدة الناقصة: {', '.join(sorted(missing))}",
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        analysis = validate_curriculum_rows(request.tenant, rows)

        summary = {
            "total": len(analysis),
            "valid": sum(1 for r in analysis if r.status == "valid"),
            "skip": sum(1 for r in analysis if r.status == "skip"),
            "errors": sum(1 for r in analysis if r.status == "error"),
        }
        will_create = summarize_will_create(analysis)

        rows_payload = [
            {
                "row": r.row,
                "academic_year": r.academic_year,
                "stage": r.stage,
                "grade": r.grade,
                "subject": r.subject,
                "course": r.course,
                "chapter": r.chapter,
                "lesson": r.lesson,
                "status": r.status,
                "errors": r.errors,
                "reason": r.reason,
                "will_create": r.will_create,
            }
            for r in analysis
        ]

        if dry_run:
            return Response(
                {
                    "dry_run": True,
                    "summary": summary,
                    "will_create": will_create,
                    "rows": rows_payload,
                }
            )

        if summary["errors"] > 0:
            return Response(
                {
                    "error": {
                        "status": 400,
                        "detail": (
                            f"لا يمكن الاستيراد — {summary['errors']} سطر به أخطاء. "
                            "صحّح الملف وأعد المحاولة."
                        ),
                    },
                    "summary": summary,
                    "rows": rows_payload,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        result = do_import(request.tenant, analysis, author=request.user)

        log_action(
            actor=request.user,
            tenant=request.tenant,
            action="curriculum.bulk_imported",
            metadata={**summary, **result},
        )

        return Response(
            {
                "dry_run": False,
                "summary": summary,
                "will_create": will_create,
                "result": result,
            },
            status=status.HTTP_201_CREATED,
        )


class ChapterViewSet(YearAwareViewSet):
    queryset = Chapter.objects.all()
    serializer_class = ChapterSerializer
    permission_classes = TenantScopedViewSet.permission_classes + [IsAdminForWriteActions]
    filterset_fields = ["course"]


class LessonViewSet(YearAwareViewSet):
    queryset = Lesson.objects.all()
    serializer_class = LessonSerializer
    permission_classes = TenantScopedViewSet.permission_classes + [IsAdminForWriteActions]
    filterset_fields = ["chapter"]

    @action(detail=True, methods=["get"], url_path="detail")
    def aggregated_detail(self, request, pk=None):
        """GET /lessons/<id>/detail/ — lesson + content + navigation context."""
        lesson = self.get_object()
        tenant = request.tenant

        content_qs = (
            Content.objects.for_tenant(tenant).filter(lesson=lesson).order_by("-created_at")
        )
        content_data = [
            {
                "id": str(c.id),
                "title": c.title,
                "content_type": c.content_type,
                "is_published": c.is_published,
                "created_at": c.created_at,
            }
            for c in content_qs
        ]

        siblings = list(
            Lesson.objects.for_tenant(tenant).filter(chapter=lesson.chapter).order_by("order")
        )
        idx = next((i for i, l in enumerate(siblings) if l.id == lesson.id), None)
        prev_lesson = (
            {"id": str(siblings[idx - 1].id), "name": siblings[idx - 1].name}
            if idx is not None and idx > 0
            else None
        )
        next_lesson = (
            {"id": str(siblings[idx + 1].id), "name": siblings[idx + 1].name}
            if idx is not None and idx < len(siblings) - 1
            else None
        )

        return Response(
            {
                "lesson": {
                    "id": str(lesson.id),
                    "name": lesson.name,
                    "order": lesson.order,
                },
                "chapter": {
                    "id": str(lesson.chapter.id),
                    "name": lesson.chapter.name,
                },
                "course": {
                    "id": str(lesson.chapter.course.id),
                    "name": lesson.chapter.course.name,
                    "subject_name": lesson.chapter.course.subject.name,
                    "grade_name": lesson.chapter.course.grade.name,
                },
                "content": content_data,
                "nav": {"prev": prev_lesson, "next": next_lesson},
            }
        )
