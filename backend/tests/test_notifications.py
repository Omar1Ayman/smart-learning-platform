"""Wave 30A — notification service + triggers."""

import pytest

from apps.assessments.models import AssessmentQuestion, AssessmentTarget
from apps.assessments.services import get_targeted_students
from apps.exam_engine.services import save_answer, start_attempt, submit_attempt
from apps.notifications.models import Notification
from apps.notifications.services import notify, notify_many
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


# ---------- Service primitives ----------

def test_notify_creates_a_row():
    user = UserFactory()
    n = notify(user, "SYSTEM", "Hello", "Body", "/link")
    assert n.id is not None
    assert n.user == user
    assert n.tenant_id == user.tenant_id
    assert n.is_read is False


def test_notify_many_creates_one_per_user():
    tenant = TenantFactory()
    users = [UserFactory(tenant=tenant) for _ in range(5)]
    notify_many(users, "SYSTEM", "Batch", "Body")
    assert Notification.objects.filter(title="Batch").count() == 5


# ---------- API ----------

def test_user_sees_only_their_own_notifications(api_client):
    user_a = UserFactory()
    user_b = UserFactory()
    notify(user_a, "SYSTEM", "For A")
    notify(user_b, "SYSTEM", "For B")

    client = login_as(api_client, user_a)
    r = client.get("/api/v1/notifications/")
    assert r.status_code == 200
    assert r.data["count"] == 1
    assert r.data["results"][0]["title"] == "For A"


def test_mark_single_read(api_client):
    user = UserFactory()
    n = notify(user, "SYSTEM", "x")
    client = login_as(api_client, user)
    r = client.post(f"/api/v1/notifications/{n.id}/read/")
    assert r.status_code == 200
    n.refresh_from_db()
    assert n.is_read is True


def test_mark_all_read(api_client):
    user = UserFactory()
    notify(user, "SYSTEM", "1")
    notify(user, "SYSTEM", "2")
    notify(user, "SYSTEM", "3")
    client = login_as(api_client, user)
    r = client.post("/api/v1/notifications/mark_all_read/")
    assert r.status_code == 200
    assert r.data["marked_read"] == 3
    assert Notification.objects.filter(user=user, is_read=False).count() == 0


def test_unread_count(api_client):
    user = UserFactory()
    notify(user, "SYSTEM", "1")
    notify(user, "SYSTEM", "2")
    read_one = notify(user, "SYSTEM", "3")
    read_one.is_read = True
    read_one.save()

    client = login_as(api_client, user)
    r = client.get("/api/v1/notifications/unread_count/")
    assert r.status_code == 200
    assert r.data["count"] == 2


def test_cross_user_isolation_via_id(api_client):
    user_a = UserFactory()
    user_b = UserFactory()
    notif_a = notify(user_a, "SYSTEM", "Private")

    client = login_as(api_client, user_b)
    r = client.get(f"/api/v1/notifications/{notif_a.id}/")
    assert r.status_code == 404  # not in queryset, not 403


# ---------- get_targeted_students ----------

def test_get_targeted_students_by_grade():
    group = GroupFactory()
    student = StudentUserFactory(tenant=group.tenant)
    EnrollmentFactory(
        tenant=group.tenant, student=student, group=group, academic_year=group.academic_year
    )
    assessment = AssessmentFactory(tenant=group.tenant)
    AssessmentTarget.objects.create(
        tenant=group.tenant, assessment=assessment, target_type="GRADE", grade=group.grade
    )

    targets = get_targeted_students(assessment)
    assert student in targets


# ---------- Trigger: publish ----------

def test_publish_creates_notification_for_targeted_students(api_client):
    group = GroupFactory()
    group.academic_year.activate()
    student = StudentUserFactory(tenant=group.tenant)
    EnrollmentFactory(
        tenant=group.tenant, student=student, group=group, academic_year=group.academic_year
    )
    owner = UserFactory(tenant=group.tenant, role="OWNER")
    assessment = AssessmentFactory(tenant=group.tenant)
    AssessmentTarget.objects.create(
        tenant=group.tenant, assessment=assessment, target_type="GRADE", grade=group.grade
    )
    bank = QuestionBankFactory(tenant=group.tenant)
    q = QuestionFactory(
        bank=bank, tenant=group.tenant, approved=True,
        created_by=TeacherUserFactory(tenant=group.tenant),
    )
    AssessmentQuestion.objects.create(
        tenant=group.tenant, assessment=assessment, question=q, order=1
    )

    client = login_as(api_client, owner)
    r = client.post(f"/api/v1/assessments/{assessment.id}/publish/")
    assert r.status_code == 200

    assert Notification.objects.filter(
        user=student, type="EXAM_PUBLISHED"
    ).exists()


# ---------- Trigger: submit ----------

def test_submit_notifies_teacher_and_student(api_client):
    group = GroupFactory()
    teacher = TeacherUserFactory(tenant=group.tenant)
    student = StudentUserFactory(tenant=group.tenant)
    EnrollmentFactory(
        tenant=group.tenant, student=student, group=group, academic_year=group.academic_year
    )
    assessment = AssessmentFactory(tenant=group.tenant, status="PUBLISHED", created_by=teacher)
    AssessmentTarget.objects.create(
        tenant=group.tenant, assessment=assessment, target_type="GRADE", grade=group.grade
    )
    bank = QuestionBankFactory(tenant=group.tenant)
    q = QuestionFactory(
        bank=bank, tenant=group.tenant, question_type="MCQ", approved=True, created_by=teacher,
    )
    correct = q.options.create(tenant=group.tenant, text="A", is_correct=True, order=1)
    q.options.create(tenant=group.tenant, text="B", is_correct=False, order=2)
    AssessmentQuestion.objects.create(
        tenant=group.tenant, assessment=assessment, question=q, order=1
    )

    attempt = start_attempt(assessment, student, group.tenant)
    save_answer(attempt, q.id, chosen_option_id=correct.id)
    submit_attempt(attempt)

    # Teacher notified of submission
    assert Notification.objects.filter(user=teacher, type="EXAM_SUBMITTED").exists()
    # Student notified of result (attempt graded because all MCQ)
    assert Notification.objects.filter(user=student, type="EXAM_GRADED").exists()


# ---------- Trigger: question approve/reject ----------

def test_question_approve_notifies_author(api_client):
    teacher = TeacherUserFactory()
    owner = UserFactory(tenant=teacher.tenant, role="OWNER")
    bank = QuestionBankFactory(tenant=teacher.tenant)
    question = QuestionFactory(
        bank=bank, tenant=teacher.tenant, created_by=teacher
    )

    client = login_as(api_client, owner)
    r = client.post(f"/api/v1/questions/{question.id}/approve/")
    assert r.status_code == 200

    assert Notification.objects.filter(
        user=teacher, type="QUESTION_APPROVED"
    ).exists()


# ---------- Trigger: pending question notifies admin ----------

def test_teacher_pending_question_notifies_admin(api_client):
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    teacher = TeacherUserFactory(tenant=tenant)
    bank = QuestionBankFactory(tenant=tenant)

    client = login_as(api_client, teacher)
    r = client.post(
        "/api/v1/questions/",
        {"bank": str(bank.id), "text": "سؤال جديد", "question_type": "ESSAY"},
        format="json",
    )
    assert r.status_code == 201
    assert Notification.objects.filter(
        user=owner, type="QUESTION_PENDING"
    ).exists()