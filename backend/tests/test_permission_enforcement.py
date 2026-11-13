import pytest
from apps.assessments.models import AssessmentQuestion, AssessmentTarget
from apps.content.models import Content
from apps.exam_engine.services import start_attempt
from apps.questions.models import Question

from .conftest import login_as
from .factories import (
    AssessmentFactory,
    EnrollmentFactory,
    GroupFactory,
    QuestionBankFactory,
    QuestionFactory,
    StudentUserFactory,
    TeacherUserFactory,
    TenantFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db


def _set_permission(tenant, key, value):
    settings = tenant.get_settings()
    settings["permissions"][key] = value
    tenant.settings = settings
    tenant.save(update_fields=["settings"])


def test_admin_teacher_management_requires_owner_permission(api_client):
    tenant = TenantFactory()
    _set_permission(tenant, "admins_can_manage_teachers", False)
    admin = UserFactory(tenant=tenant, role="ADMIN")
    client = login_as(api_client, admin)
    payload = {
        "email": "new.teacher@example.test",
        "first_name": "New",
        "last_name": "Teacher",
        "role": "TEACHER",
    }

    denied = client.post("/api/v1/users/", payload, format="json")
    assert denied.status_code == 403

    _set_permission(tenant, "admins_can_manage_teachers", True)
    allowed = client.post("/api/v1/users/", payload, format="json")
    assert allowed.status_code == 201, allowed.data


def test_admin_question_approval_requires_owner_permission(api_client):
    tenant = TenantFactory()
    _set_permission(tenant, "admins_can_approve_questions", False)
    teacher = TeacherUserFactory(tenant=tenant)
    question = QuestionFactory(
        tenant=tenant,
        bank=QuestionBankFactory(tenant=tenant),
        created_by=teacher,
    )
    admin = UserFactory(tenant=tenant, role="ADMIN")
    client = login_as(api_client, admin)

    denied = client.post(f"/api/v1/questions/{question.id}/approve/")
    assert denied.status_code == 403

    _set_permission(tenant, "admins_can_approve_questions", True)
    allowed = client.post(f"/api/v1/questions/{question.id}/approve/")
    assert allowed.status_code == 200, allowed.data
    question.refresh_from_db()
    assert question.review_status == Question.ReviewStatus.APPROVED


def test_teacher_question_creation_paths_respect_permission(api_client):
    tenant = TenantFactory()
    _set_permission(tenant, "teachers_can_create_questions", False)
    teacher = TeacherUserFactory(tenant=tenant)
    bank = QuestionBankFactory(tenant=tenant)
    existing = QuestionFactory(
        tenant=tenant, bank=bank, created_by=teacher, approved=True
    )
    client = login_as(api_client, teacher)

    created = client.post(
        "/api/v1/questions/",
        {
            "bank": str(bank.id),
            "text": "New question",
            "question_type": "ESSAY",
        },
        format="json",
    )
    duplicated = client.post(f"/api/v1/questions/{existing.id}/duplicate/")

    assert created.status_code == 403
    assert duplicated.status_code == 403


def test_teacher_cannot_manage_own_content_when_disabled(api_client):
    tenant = TenantFactory()
    _set_permission(tenant, "teachers_can_manage_own_content", False)
    teacher = TeacherUserFactory(tenant=tenant)
    client = login_as(api_client, teacher)

    response = client.post(
        "/api/v1/content/",
        {
            "title": "Teacher notes",
            "content_type": "TEXT",
            "text_body": "Lesson notes",
        },
        format="json",
    )

    assert response.status_code == 403
    assert not Content.objects.filter(tenant=tenant).exists()


def test_teacher_cannot_delete_own_assessment_when_disabled(api_client):
    tenant = TenantFactory()
    _set_permission(tenant, "teachers_can_delete_own_assessments", False)
    teacher = TeacherUserFactory(tenant=tenant)
    assessment = AssessmentFactory(tenant=tenant, created_by=teacher)
    client = login_as(api_client, teacher)

    response = client.delete(f"/api/v1/assessments/{assessment.id}/")

    assert response.status_code == 403
    assert assessment.__class__.objects.filter(id=assessment.id).exists()


def test_teacher_attendance_and_student_import_require_permissions(api_client):
    group = GroupFactory()
    group.academic_year.status = "ACTIVE"
    group.academic_year.save(update_fields=["status"])
    tenant = group.tenant
    _set_permission(tenant, "teachers_can_mark_attendance", False)
    teacher = TeacherUserFactory(tenant=tenant)
    client = login_as(api_client, teacher)

    attendance = client.post(
        "/api/v1/attendance/sessions/quick-start/",
        {"group": str(group.id)},
        format="json",
    )
    import_template = client.get("/api/v1/tenant/import/template/")

    assert attendance.status_code == 403
    assert import_template.status_code == 403


def test_teacher_audit_navigation_capability_matches_policy(api_client):
    tenant = TenantFactory()
    teacher = TeacherUserFactory(tenant=tenant)
    client = login_as(api_client, teacher)

    denied = client.get("/api/v1/auth/me/")
    assert denied.status_code == 200
    assert denied.data["can_view_audit_log"] is False
    assert client.get("/api/v1/audit-logs/").status_code == 403

    _set_permission(tenant, "enable_audit_log_for_teachers", True)
    tenant.refresh_from_db()
    assert tenant.get_policy("permissions")["enable_audit_log_for_teachers"] is True
    assert teacher.tenant.get_policy("permissions")["enable_audit_log_for_teachers"] is True
    allowed = client.get("/api/v1/auth/me/")
    assert allowed.status_code == 200
    assert allowed.data["can_view_audit_log"] is True
    assert client.get("/api/v1/audit-logs/").status_code == 200


def test_assessment_result_export_requires_export_permission(api_client):
    tenant = TenantFactory()
    admin = UserFactory(tenant=tenant, role="ADMIN")
    assessment = AssessmentFactory(tenant=tenant)
    client = login_as(api_client, admin)

    response = client.get(
        f"/api/v1/assessments/{assessment.id}/export_results/"
    )

    assert response.status_code == 403


def test_teacher_results_scope_expands_only_when_enabled(api_client):
    group = GroupFactory()
    tenant = group.tenant
    student = StudentUserFactory(tenant=tenant)
    EnrollmentFactory(
        tenant=tenant,
        student=student,
        group=group,
        academic_year=group.academic_year,
    )
    assessment = AssessmentFactory(tenant=tenant, status="PUBLISHED")
    AssessmentTarget.objects.create(
        tenant=tenant,
        assessment=assessment,
        target_type="GRADE",
        grade=group.grade,
    )
    bank = QuestionBankFactory(tenant=tenant)
    question = QuestionFactory(
        tenant=tenant,
        bank=bank,
        approved=True,
        created_by=TeacherUserFactory(tenant=tenant),
    )
    AssessmentQuestion.objects.create(
        tenant=tenant, assessment=assessment, question=question, order=1
    )
    attempt = start_attempt(assessment, student, tenant)
    teacher = TeacherUserFactory(tenant=tenant)
    client = login_as(api_client, teacher)

    hidden = client.get(f"/api/v1/attempts/{attempt.id}/")
    assert hidden.status_code == 404

    _set_permission(tenant, "teachers_can_view_all_student_results", True)
    visible = client.get(f"/api/v1/attempts/{attempt.id}/")
    assert visible.status_code == 200, visible.data
