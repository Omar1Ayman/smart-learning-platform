"""Notification service. Every write goes through here so a future
Telegram/email side-effect is a one-line change, not a codebase-wide
search for `Notification.objects.create` calls.

H-5 FIX (Wave Zero): `notify_many` used to call `bulk_create` on the whole
list in one INSERT. A tenant with 5000+ students (common for a school
publishing a term-end exam) would generate a single INSERT with 5000 × 6
parameters = 30,000 params — dangerously close to PostgreSQL's
`max_query_parameters` of 65,535, and worse once columns grow. Now chunked
at 500 per INSERT, which keeps parameter count in a safe envelope and
avoids "packet too large" errors from the DB driver.
"""

from .models import Notification

# H-5: chunk size chosen to keep per-INSERT parameter count <3000 (500 rows ×
# 6 columns), well under PostgreSQL's 65535 parameter limit even if the
# Notification model grows a few fields later.
_BULK_CHUNK_SIZE = 500


def notify(user, notif_type: str, title: str, message: str = "", link: str = "") -> Notification:
    """Create one notification for one user. Safe to call from any trigger."""
    n = Notification.objects.create(
        user=user,
        tenant_id=user.tenant_id,
        type=notif_type,
        title=title,
        message=message,
        link=link,
    )
    _maybe_telegram(user, title, message, link)
    return n


def notify_many(users, notif_type: str, title: str, message: str = "", link: str = ""):
    """Bulk create for many users, chunked for database safety.

    Safe for 5000+ students — each chunk is a single INSERT, and chunks
    are processed sequentially so a mid-flight failure leaves only the
    already-inserted chunks behind (acceptable for notifications, which
    are inherently best-effort delivery).
    """
    users = list(users)
    if not users:
        return

    for start in range(0, len(users), _BULK_CHUNK_SIZE):
        chunk = users[start : start + _BULK_CHUNK_SIZE]
        notifications = [
            Notification(
                user=u,
                tenant_id=u.tenant_id,
                type=notif_type,
                title=title,
                message=message,
                link=link,
            )
            for u in chunk
        ]
        Notification.objects.bulk_create(notifications)
        for u in chunk:
            _maybe_telegram(u, title, message, link)


def _maybe_telegram(user, title: str, message: str, link: str):
    """Wave 30C hook — implemented when the Telegram bot lands.

    Deliberately a no-op today so callers don't have to care whether
    Telegram is wired up yet. When it is, only this function changes.
    """
    # from .telegram import send_async
    # if user.telegram_chat_id:
    #     send_async(user.telegram_chat_id, f"{title}\n{message}")
    return