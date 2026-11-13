"""
Attendance services — QR generation/verification, session lifecycle,
marking, and reporting helpers.
"""

import base64
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta
import logging
from django.db import transaction
from django.utils import timezone as dj_tz
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.academics.models import Group
from apps.people.models import Enrollment, TeacherAssignment

from .models import AttendanceRecord, AttendanceSession
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# QR — generation and verification
# ---------------------------------------------------------------------------


def generate_session_secret() -> str:
    """32 random bytes → 64 hex chars. Set once when a session opens."""
    return secrets.token_hex(32)


def _window_index(session: AttendanceSession, now: datetime | None = None) -> int:
    if session.opened_at is None:
        return -1
    now = now or dj_tz.now()
    elapsed = (now - session.opened_at).total_seconds()
    return int(elapsed // session.qr_window_seconds)


def _token_for_window(session: AttendanceSession, window_index: int) -> str:
    message = f"{session.id}:{window_index}".encode("utf-8")
    key = session.qr_secret.encode("utf-8")
    digest = hmac.new(key, message, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest[:9]).decode("ascii").rstrip("=")


def current_qr_payload(session: AttendanceSession) -> dict:
    from django.conf import settings

    if session.status != AttendanceSession.Status.OPEN:
        raise ValidationError("الجلسة غير مفتوحة — لا يوجد رمز QR صالح.")
    if not session.qr_secret:
        raise ValidationError("لم يُهيَّأ رمز الجلسة بعد.")

    now = dj_tz.now()
    window_index = _window_index(session, now)
    if window_index < 0:
        raise ValidationError("الجلسة لم تُفتح بعد.")

    token = _token_for_window(session, window_index)

    elapsed_in_window = (
        now - session.opened_at
    ).total_seconds() % session.qr_window_seconds
    remaining = session.qr_window_seconds - int(elapsed_in_window)

    frontend_url = settings.FRONTEND_URL.rstrip("/")
    qr_url = f"{frontend_url}/attendance/scan?session={session.id}&t={token}"

    return {
        "token": token,
        "window_index": window_index,
        "window_seconds": session.qr_window_seconds,
        "expires_in_seconds": max(0, remaining),
        "qr_url": qr_url,
    }


def verify_qr_token(session: AttendanceSession, token: str) -> bool:
    if not token or not session.qr_secret:
        return False
    if session.status != AttendanceSession.Status.OPEN:
        return False

    now = dj_tz.now()
    current = _window_index(session, now)
    if current < 0:
        return False

    for w in (current, current - 1):
        if w < 0:
            continue
        expected = _token_for_window(session, w)
        if hmac.compare_digest(expected, token.strip()):
            return True
    return False


# ---------------------------------------------------------------------------
# Permissions helpers
# ---------------------------------------------------------------------------


def teacher_can_manage_group(teacher, group: Group) -> bool:
    if teacher.role == "OWNER" or teacher.role == "ADMIN":
        return True
    if teacher.role != "TEACHER":
        return False

    qs = TeacherAssignment.objects.for_tenant(teacher.tenant).filter(teacher=teacher)
    return qs.filter(models_q_group_or_grade(group)).exists()


def models_q_group_or_grade(group: Group):
    from django.db.models import Q

    return Q(groups=group) | Q(groups__isnull=True, course__grade=group.grade)


# ---------------------------------------------------------------------------
# Session lifecycle
# ---------------------------------------------------------------------------


def _effective_late_boundary(session: AttendanceSession) -> datetime:
    local_tz = dj_tz.get_current_timezone()
    scheduled_start = dj_tz.make_aware(
        datetime.combine(session.date, session.start_time), local_tz
    )
    base = scheduled_start
    if session.opened_at and session.opened_at > base:
        base = session.opened_at
    return base + timedelta(minutes=session.late_threshold_minutes)


def _active_students_for_group(session: AttendanceSession):
    from apps.accounts.models import User

    student_ids = (
        Enrollment.objects.for_tenant(session.tenant)
        .filter(group=session.group, status=Enrollment.Status.ACTIVE)
        .values_list("student_id", flat=True)
        .distinct()
    )
    return User.objects.for_tenant(session.tenant).filter(
        role=User.Role.STUDENT, id__in=student_ids
    )


@transaction.atomic
def open_session(session: AttendanceSession, *, by_user) -> AttendanceSession:
    if session.status == AttendanceSession.Status.OPEN:
        return session
    if session.status not in (
        AttendanceSession.Status.SCHEDULED,
        AttendanceSession.Status.CANCELLED,
    ):
        raise ValidationError("لا يمكن فتح جلسة مغلقة — أعد فتحها أولًا.")

    session.status = AttendanceSession.Status.OPEN
    session.opened_at = dj_tz.now()
    session.closed_at = None
    if not session.qr_secret:
        session.qr_secret = generate_session_secret()
    session.save(
        update_fields=[
            "status",
            "opened_at",
            "closed_at",
            "qr_secret",
            "updated_at",
        ]
    )

    existing = set(
        AttendanceRecord.objects.for_tenant(session.tenant)
        .filter(session=session)
        .values_list("student_id", flat=True)
    )
    to_create = [
        AttendanceRecord(
            tenant=session.tenant,
            session=session,
            student=student,
            status=AttendanceRecord.Status.ABSENT,
            check_in_method=AttendanceRecord.Method.AUTO,
        )
        for student in _active_students_for_group(session)
        if student.id not in existing
    ]
    if to_create:
        AttendanceRecord.objects.bulk_create(to_create, ignore_conflicts=True)

    return session


@transaction.atomic
def close_session(session: AttendanceSession, *, by_user) -> AttendanceSession:
    """Close an OPEN session, then dispatch absence notifications.

    F-02 FIX (Milestone 0, Batch 3): `send_absence_notifications` used to
    be defined but never called — the entire absence-email feature was
    dead code. Now every close path (this service, the viewset action,
    Django admin's close action if any, future management commands)
    triggers the notification dispatch.

    Key design choices:
      - `transaction.on_commit(...)`: the email send happens AFTER the
        state transition commits. If SMTP is slow or fails, the session
        is still closed and the caller returns 200. Idempotency via
        `AttendanceRecord.notified_at` prevents duplicate sends.
      - The send itself runs in `_safe_send_absence_notifications` which
        swallows exceptions and logs them — a notification failure must
        never break a session close.
    """
    if session.status == AttendanceSession.Status.CLOSED:
        return session
    if session.status != AttendanceSession.Status.OPEN:
        raise ValidationError("لا يمكن إغلاق جلسة غير مفتوحة.")

    session.status = AttendanceSession.Status.CLOSED
    session.closed_at = dj_tz.now()
    session.save(update_fields=["status", "closed_at", "updated_at"])

    # F-02 — defer until after commit, then dispatch.
    session_id = session.id
    tenant_id = session.tenant_id

    def _dispatch():
        try:
            from apps.attendance.models import AttendanceSession as _S

            # Re-fetch to make sure we send for the committed state.
            committed = _S.objects.filter(id=session_id, tenant_id=tenant_id).first()
            if committed is not None:
                send_absence_notifications(committed, skip_already_notified=True)
        except Exception:  # noqa: BLE001 — never fail the close
            logger.exception(
                "send_absence_notifications failed for session %s", session_id
            )

    transaction.on_commit(_dispatch)
    return session
@transaction.atomic
def reopen_session(session: AttendanceSession, *, by_user) -> AttendanceSession:
    if session.status != AttendanceSession.Status.CLOSED:
        raise ValidationError("لا يمكن إعادة فتح جلسة غير مغلقة.")
    session.status = AttendanceSession.Status.OPEN
    session.closed_at = None
    session.save(update_fields=["status", "closed_at", "updated_at"])
    return session


# ---------------------------------------------------------------------------
# Marking
# ---------------------------------------------------------------------------


def _get_client_ip(request) -> str | None:
    if request is None:
        return None
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        return xff.split(",")[0].strip()
    return (
        request.META.get("HTTP_CF_CONNECTING_IP")
        or request.META.get("HTTP_X_REAL_IP")
        or request.META.get("REMOTE_ADDR")
    )


@transaction.atomic
def mark_via_qr(
    session: AttendanceSession,
    student,
    token: str,
    request=None,
) -> AttendanceRecord:
    if session.status != AttendanceSession.Status.OPEN:
        raise ValidationError("الجلسة غير مفتوحة للحضور.")

    if not verify_qr_token(session, token):
        raise ValidationError("رمز QR غير صالح أو منتهي الصلاحية.")

    enrolled = Enrollment.objects.for_tenant(session.tenant).filter(
        student=student,
        group=session.group,
        status=Enrollment.Status.ACTIVE,
    ).exists()
    if not enrolled:
        raise ValidationError("أنت غير مسجل في هذه المجموعة.")

    now = dj_tz.now()
    late_boundary = _effective_late_boundary(session)
    new_status = (
        AttendanceRecord.Status.PRESENT
        if now <= late_boundary
        else AttendanceRecord.Status.LATE
    )

    record = (
        AttendanceRecord.objects.for_tenant(session.tenant)
        .filter(session=session, student=student)
        .first()
    )

    if record is None:
        record = AttendanceRecord.objects.create(
            tenant=session.tenant,
            session=session,
            student=student,
            status=new_status,
            check_in_method=AttendanceRecord.Method.QR,
            check_in_at=now,
            check_in_ip=_get_client_ip(request),
        )
    else:
        if record.status in (
            AttendanceRecord.Status.PRESENT,
            AttendanceRecord.Status.LATE,
            AttendanceRecord.Status.EXCUSED,
        ):
            raise ValidationError("تم تسجيل حضورك بالفعل لهذه الحصة.")
        record.status = new_status
        record.check_in_method = AttendanceRecord.Method.QR
        record.check_in_at = now
        record.check_in_ip = _get_client_ip(request)
        record.marked_by = None
        record.save(
            update_fields=[
                "status",
                "check_in_method",
                "check_in_at",
                "check_in_ip",
                "marked_by",
                "updated_at",
            ]
        )

    return record


@transaction.atomic
def manual_mark(
    session: AttendanceSession,
    student,
    status: str,
    *,
    by_user,
    notes: str = "",
) -> AttendanceRecord:
    if status not in AttendanceRecord.Status.values:
        raise ValidationError("حالة حضور غير صالحة.")
    if session.status == AttendanceSession.Status.CANCELLED:
        raise ValidationError("لا يمكن تعديل حضور جلسة ملغاة.")

    record, created = AttendanceRecord.objects.get_or_create(
        tenant=session.tenant,
        session=session,
        student=student,
        defaults={
            "status": status,
            "check_in_method": AttendanceRecord.Method.MANUAL,
            "check_in_at": (
                dj_tz.now()
                if status != AttendanceRecord.Status.ABSENT
                else None
            ),
            "marked_by": by_user,
            "notes": notes,
        },
    )
    if not created:
        record.status = status
        record.check_in_method = AttendanceRecord.Method.MANUAL
        record.check_in_at = (
            dj_tz.now() if status != AttendanceRecord.Status.ABSENT else None
        )
        record.marked_by = by_user
        if notes:
            record.notes = notes
        record.save(
            update_fields=[
                "status",
                "check_in_method",
                "check_in_at",
                "marked_by",
                "notes",
                "updated_at",
            ]
        )
    return record


# ============================================================================
# Parent notifications (absence alerts)
# ============================================================================


def _consecutive_absences(student, tenant, limit: int = 10) -> int:
    """Count consecutive ABSENT records from most recent backwards.

    Stops at the first non-ABSENT record. EXCUSED breaks the streak (an
    excused absence is not the parent's fault). LATE also breaks it.
    """
    recent = list(
        AttendanceRecord.objects.for_tenant(tenant)
        .filter(student=student)
        .order_by("-session__date", "-session__start_time")
        .select_related("session")[:limit]
    )
    count = 0
    for r in recent:
        if r.status == AttendanceRecord.Status.ABSENT:
            count += 1
        else:
            break
    return count


def _send_absence_email(session, record, is_warning: bool = False) -> bool:
    """Send one absence email. Returns True if the email actually went out.

    Also creates an in-app Notification for every linked PARENT user so
    the alert is visible in the platform even if the email is missed.
    """
    from django.conf import settings
    from django.core.mail import EmailMultiAlternatives
    from django.template import TemplateDoesNotExist
    from django.template.loader import render_to_string
    from django.utils import timezone as dj_tz

    from apps.accounts.models import ParentChild
    from apps.notifications.services import notify

    student = record.student
    parent_email = (student.parent_email or "").strip().lower()
    if not parent_email:
        return False

    tenant = session.tenant
    parent_name = student.parent_name or "ولي الأمر"
    student_name = (
        f"{student.first_name} {student.last_name}".strip() or student.email
    )

    consecutive = _consecutive_absences(student, tenant) if is_warning else None

    context = {
        "parent_name": parent_name,
        "student_name": student_name,
        "tenant_name": tenant.name,
        "session_date": session.date,
        "session_start": session.start_time.strftime("%H:%M"),
        "session_end": session.end_time.strftime("%H:%M"),
        "group_name": session.group.name,
        "teacher_email": session.teacher.email if session.teacher else "",
        "consecutive": consecutive,
        "contact_email": tenant.contact_email or settings.DEFAULT_FROM_EMAIL,
        "frontend_url": settings.FRONTEND_URL.rstrip("/"),
    }

    subject = (
        f"⚠️ تنبيه: غياب متكرر — {student_name}"
        if is_warning
        else f"غياب: {student_name} — {session.date}"
    )

    # Fallback body if the templates haven't been created yet.
    fallback_body = (
        f"عزيزي/عزيزتي {parent_name}،\n\n"
        f"غاب الطالب/الطالبة {student_name} عن {session.group.name} "
        f"يوم {session.date} ({context['session_start']} - "
        f"{context['session_end']}).\n"
    )
    if is_warning and consecutive:
        fallback_body += (
            f"\n⚠️ هذه {consecutive} غيابات متتالية — نرجو التواصل.\n"
        )

    email_sent = False
    try:
        html_body = render_to_string(
            "attendance/emails/absence.html", context
        )
        text_body = render_to_string(
            "attendance/emails/absence.txt", context
        )
    except TemplateDoesNotExist:
        html_body = None
        text_body = fallback_body

    try:
        msg = EmailMultiAlternatives(
            subject=subject,
            body=text_body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[parent_email],
        )
        if html_body:
            msg.attach_alternative(html_body, "text/html")
        msg.send(fail_silently=False)
        email_sent = True
    except Exception:
        email_sent = False

    # In-app notification for every linked parent account.
    # NOTE: ParentChild extends models.Model (not TenantScopedModel), so
    # we filter by tenant explicitly instead of using .for_tenant().
    parent_links = (
        ParentChild.objects.filter(tenant=tenant, student=student)
        .select_related("parent")
    )
    for link in parent_links:
        try:
            notify(
                link.parent,
                notif_type="ABSENCE_ALERT",
                title=(
                    f"⚠️ غياب متكرر: {student_name}"
                    if is_warning
                    else f"غياب: {student_name}"
                ),
                message=(
                    f"غاب عن {session.group.name} يوم {session.date} "
                    f"({context['session_start']} - {context['session_end']})"
                    + (f" — {consecutive} غيابات متتالية" if consecutive else "")
                ),
                link=f"/parent/children/{student.id}",
            )
        except Exception:
            # Never let one notify failure block the rest.
            pass

    if email_sent:
        record.notified_at = dj_tz.now()
        record.save(update_fields=["notified_at", "updated_at"])
        return True
    return False


def send_absence_notifications(session, *, skip_already_notified: bool = True) -> dict:
    """Send absence emails + in-app notifications for a session's ABSENT students.

    Called:
      - On session close (automatic, honoring policy)
      - Via POST /attendance/sessions/{id}/notify-parents/ (manual)

    Returns counts: {"sent": N, "skipped": N, "no_email": N}
    """
    tenant = session.tenant
    policy = tenant.get_policy("attendance_policy")

    if not policy.get("notify_parent_on_absence", True):
        return {
            "sent": 0,
            "skipped": 0,
            "no_email": 0,
            "policy_disabled": True,
        }

    threshold = int(policy.get("consecutive_absence_threshold", 3) or 3)

    absents = session.records.filter(
        status=AttendanceRecord.Status.ABSENT
    ).select_related("student")

    sent = 0
    skipped = 0
    no_email = 0

    for record in absents:
        if skip_already_notified and record.notified_at is not None:
            skipped += 1
            continue
        if not (record.student.parent_email or "").strip():
            no_email += 1
            continue

        consecutive = _consecutive_absences(record.student, tenant)
        is_warning = consecutive >= threshold

        if _send_absence_email(session, record, is_warning=is_warning):
            sent += 1
        else:
            skipped += 1

    return {"sent": sent, "skipped": skipped, "no_email": no_email}