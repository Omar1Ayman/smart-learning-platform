"""Wave M5 (Milestone 5) — audit action labels must be Arabic.

This is a data-quality regression. If it fails, a new log_action() call
was added without a matching ACTION_LABELS entry, or a label was
accidentally deleted.
"""

import pytest

from apps.audit.models import AuditLog
from apps.audit.serializers import ACTION_LABELS, AuditLogSerializer

pytestmark = pytest.mark.django_db


def test_known_actions_have_explicit_labels():
    """Every action we currently emit must have an explicit Arabic label."""
    # Maintained manually. Add new actions here when you add them.
    KNOWN_ACTIONS = [
        "user.logged_in",
        "user.logged_in_2fa",
        "user.logged_out",
        "user.created",
        "user.updated",
        "user.deleted",
        "user.password_changed",
        "user.twofa_enabled",
        "user.twofa_disabled",
        "user.profile_updated",
        "session.revoked",
        "session.revoked_all",
        "content.created",
        "content.updated",
        "content.deleted",
        "content.bulk_deleted",
        "question.created",
        "question.updated",
        "question.deleted",
        "question.approved",
        "question.rejected",
        "question.duplicated",
        "question_bank.created",
        "question_bank.updated",
        "question_bank.deleted",
        "questions.bulk_imported",
        "assessment.created",
        "assessment.updated",
        "assessment.deleted",
        "assessment.published",
        "assessment.duplicated",
        "assessment.results_exported",
        "attempt.reopened",
        "attempt.voided",
        "attempts.bulk_graded",
        "academic_year.created",
        "enrollment.promoted",
        "tenant.created",
        "tenant.settings_updated",
        "tenant.branding_updated",
        "tenant.exported",
        "curriculum.bulk_imported",
        "course.duplicated",
        "students.bulk_imported",
        "attendance_session.created",
        "attendance_session.opened",
        "attendance_session.closed",
        "attendance_session.reopened",
        "attendance_session.quick_started",
        "attendance_session.bulk_marked",
        "attendance_session.notify_parents_manual",
        "attendance_session.started_from_schedule",
        "group_schedule.created",
        "group_schedule.updated",
        "group_schedule.deleted",
        "platform.tenant_created",
        "platform.owner_password_reset",
        "platform.tenant_status_active",
        "platform.tenant_status_suspended",
        "platform.tenant_status_trial",
        "platform.tenant_status_churned",
    ]
    missing = [a for a in KNOWN_ACTIONS if a not in ACTION_LABELS]
    assert not missing, f"Missing Arabic labels for: {missing}"


def test_label_contains_no_english_for_known_actions():
    """No Arabic label should contain the raw snake_case action fragments."""
    for action, label in ACTION_LABELS.items():
        # Arabic labels legitimately contain no Latin letters
        has_latin = any("a" <= c.lower() <= "z" for c in label)
        assert not has_latin, f"Label for {action!r} contains Latin: {label!r}"


def test_unknown_action_falls_back_to_arabic_domain():
    """An unmapped action must still render with an Arabic prefix."""
    log = AuditLog.objects.create(
        action="something_new.not_defined",
        metadata={},
    )
    data = AuditLogSerializer(log).data
    # Falls back to raw action because 'something_new' isn't in the
    # domain map either — but at minimum it should not be a raw label
    # in the primary position.
    assert data["action_label"].startswith("حدث")


def test_known_domain_fallback():
    """An unmapped action within a KNOWN domain gets domain + verb."""
    log = AuditLog.objects.create(
        action="content.experimental_new_verb",
        metadata={},
    )
    data = AuditLogSerializer(log).data
    assert data["action_label"] == "محتوى: experimental_new_verb"
