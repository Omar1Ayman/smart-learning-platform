"""Wave D1a — bulk question import regression tests."""

import io

import pytest

from apps.questions.models import Question, QuestionBank

from .conftest import enable_pro_features, login_as
from .factories import (
    TenantFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db


HEADER = (
    "bank_name,text,question_type,difficulty,topic,points,"
    "options,accepted_answers,explanation\n"
)


def _csv(*rows: str) -> bytes:
    return ("\ufeff" + HEADER + "\n".join(rows)).encode("utf-8")


def _upload(client, content: bytes, dry_run: bool = True, name: str = "q.csv"):
    return client.post(
        "/api/v1/questions/import/",
        {
            "file": io.BytesIO(content),
            "dry_run": "true" if dry_run else "false",
        },
        format="multipart",
    )


# ---------------------------------------------------------------------------
# Template
# ---------------------------------------------------------------------------


def test_template_downloads_xlsx(api_client):
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    client = login_as(api_client, owner)

    r = client.get("/api/v1/questions/import_template/")
    assert r.status_code == 200
    assert "spreadsheetml" in r["Content-Type"]
    assert r.content[:4] == b"PK\x03\x04"


# ---------------------------------------------------------------------------
# Dry-run
# ---------------------------------------------------------------------------


def test_dry_run_previews_valid_rows(api_client):
    tenant = TenantFactory()
    enable_pro_features(tenant)
    owner = UserFactory(tenant=tenant, role="OWNER")
    client = login_as(api_client, owner)

    # NOTE on the last row: the value "القاهرة,Cairo" contains a comma,
    # so it MUST be wrapped in double quotes per RFC 4180. Writing
    # "القاهرة\,Cairo" (backslash-comma) is NOT valid CSV — the parser
    # would split it into two fields. This is exactly what Excel does
    # automatically when exporting, so replicating it here matches the
    # real upload path.
    csv = _csv(
        "Bank A,ما هو 2+2؟,MCQ,EASY,رياضيات,2,3|4*|5|6,,الجواب 4",
        "Bank A,الشمس تشرق من الشرق.,TRUE_FALSE,EASY,,1,صح*|خطأ,,",
        'Bank A,ما عاصمة مصر؟,SHORT_ANSWER,EASY,,1,,"القاهرة,Cairo",',
    )
    r = _upload(client, csv, dry_run=True)
    assert r.status_code == 200, r.data
    assert r.data["summary"]["valid"] == 3
    assert r.data["summary"]["errors"] == 0
    # Nothing created yet.
    assert Question.objects.count() == 0
    assert QuestionBank.objects.count() == 0


def test_dry_run_reports_per_row_errors(api_client):
    tenant = TenantFactory()
    enable_pro_features(tenant)
    owner = UserFactory(tenant=tenant, role="OWNER")
    client = login_as(api_client, owner)

    csv = _csv(
        "Bank A,valid Q,MCQ,EASY,,1,A*|B,,ok",
        "Bank A,invalid type,BOGUS,EASY,,1,A*|B,,bad type",
        "Bank A,missing options,MCQ,EASY,,1,,,no opts",
        "Bank A,TF wrong texts,TRUE_FALSE,EASY,,1,True*|False,,not arabic",
    )
    r = _upload(client, csv, dry_run=True)
    assert r.status_code == 200
    assert r.data["summary"]["valid"] == 1
    assert r.data["summary"]["errors"] == 3


# ---------------------------------------------------------------------------
# Commit
# ---------------------------------------------------------------------------


def test_commit_creates_questions_and_banks(api_client):
    tenant = TenantFactory()
    enable_pro_features(tenant)
    owner = UserFactory(tenant=tenant, role="OWNER")
    client = login_as(api_client, owner)

    csv = _csv(
        "Bank A,Q1,MCQ,EASY,,2,x=1|x=2*,,explanation 1",
        "Bank B,Q2,TRUE_FALSE,MEDIUM,,1,صح|خطأ*,,explanation 2",
    )
    r = _upload(client, csv, dry_run=False)
    assert r.status_code == 201, r.data
    assert r.data["result"]["created_questions"] == 2
    assert r.data["result"]["created_banks"] == 2
    assert Question.objects.count() == 2
    assert QuestionBank.objects.count() == 2


def test_commit_reuses_existing_bank_case_insensitive(api_client):
    tenant = TenantFactory()
    enable_pro_features(tenant)
    owner = UserFactory(tenant=tenant, role="OWNER")
    QuestionBank.objects.create(tenant=tenant, name="Bank A")
    client = login_as(api_client, owner)

    csv = _csv("bank a,Q1,MCQ,EASY,,1,A*|B,,")
    r = _upload(client, csv, dry_run=False)
    assert r.status_code == 201
    assert r.data["result"]["created_questions"] == 1
    assert r.data["result"]["created_banks"] == 0
    assert QuestionBank.objects.filter(tenant=tenant).count() == 1


def test_commit_rejects_when_any_row_has_error(api_client):
    tenant = TenantFactory()
    enable_pro_features(tenant)
    owner = UserFactory(tenant=tenant, role="OWNER")
    client = login_as(api_client, owner)

    csv = _csv(
        "Bank A,valid Q,MCQ,EASY,,1,A*|B,,",
        "Bank A,invalid Q,BOGUS,EASY,,1,A*|B,,",
    )
    r = _upload(client, csv, dry_run=False)
    assert r.status_code == 400
    assert Question.objects.count() == 0


# ---------------------------------------------------------------------------
# Access control
# ---------------------------------------------------------------------------


def test_student_cannot_import(api_client):
    tenant = TenantFactory()
    student = UserFactory(tenant=tenant, role="STUDENT")
    client = login_as(api_client, student)

    csv = _csv("Bank A,Q1,MCQ,EASY,,1,A*|B,,")
    r = _upload(client, csv, dry_run=True)
    assert r.status_code == 403


def test_teacher_can_import(api_client):
    from .factories import TeacherUserFactory

    tenant = TenantFactory()
    enable_pro_features(tenant)
    teacher = TeacherUserFactory(tenant=tenant)
    client = login_as(api_client, teacher)

    csv = _csv("Bank A,Q1,MCQ,EASY,,1,A*|B,,")
    r = _upload(client, csv, dry_run=True)
    assert r.status_code == 200


# ---------------------------------------------------------------------------
# File validation
# ---------------------------------------------------------------------------


def test_empty_file_rejected(api_client):
    tenant = TenantFactory()
    enable_pro_features(tenant)
    owner = UserFactory(tenant=tenant, role="OWNER")
    client = login_as(api_client, owner)

    r = _upload(client, b"", dry_run=True)
    assert r.status_code == 400


def test_missing_headers_rejected(api_client):
    tenant = TenantFactory()
    enable_pro_features(tenant)
    owner = UserFactory(tenant=tenant, role="OWNER")
    client = login_as(api_client, owner)

    bad = "\ufefftext,question_type\nfoo,MCQ\n".encode("utf-8")
    r = _upload(client, bad, dry_run=True)
    assert r.status_code == 400
    assert "الأعمدة الناقصة" in str(r.data)