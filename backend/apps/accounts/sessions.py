"""Session tracking services.

Design notes:
- `jti` is the JWT ID claim. It changes on every refresh rotation.
  We treat `jti` as "the current token for this session row" — when
  it rotates, we update the row in place rather than creating a new
  session. That preserves the user-facing identity ("this is my
  Chrome-on-Windows session") across the token's 7-day lifetime.
- `device_label` is a human-readable guess from the User-Agent. It is
  cosmetic only — never used for security decisions.
- `revoke_session` also blacklists the underlying refresh token, so
  a stolen cookie becomes useless immediately.
"""

import re

from django.utils import timezone
from rest_framework_simplejwt.token_blacklist.models import (
    BlacklistedToken,
    OutstandingToken,
)
from rest_framework_simplejwt.tokens import RefreshToken

from .models import UserSession

_BROWSER_PATTERNS = [
    (r"edg/", "Edge"),
    (r"opr/|opera", "Opera"),
    (r"chrome/", "Chrome"),
    (r"firefox/", "Firefox"),
    (r"safari/", "Safari"),
]

_OS_PATTERNS = [
    (r"windows nt", "Windows"),
    (r"macintosh|mac os x", "macOS"),
    (r"android", "Android"),
    (r"iphone|ipad|ipod", "iOS"),
    (r"linux", "Linux"),
]


def _parse_device_label(ua: str) -> str:
    if not ua:
        return "جهاز غير معروف"
    ua_l = ua.lower()
    browser = next((name for pat, name in _BROWSER_PATTERNS if re.search(pat, ua_l)), None)
    os_name = next((name for pat, name in _OS_PATTERNS if re.search(pat, ua_l)), None)
    if browser and os_name:
        return f"{browser} على {os_name}"
    if browser:
        return browser
    if os_name:
        return os_name
    return "جهاز غير معروف"


def get_client_ip(request) -> str | None:
    """Extract the real client IP, honouring reverse-proxy headers.

    Trust order (first hit wins):
    1. X-Forwarded-For (Railway, generic proxies) — first value is the client
    2. CF-Connecting-IP (Cloudflare)
    3. X-Real-IP (nginx)
    4. REMOTE_ADDR (direct connection)
    """
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        return xff.split(",")[0].strip()
    return (
        request.META.get("HTTP_CF_CONNECTING_IP")
        or request.META.get("HTTP_X_REAL_IP")
        or request.META.get("REMOTE_ADDR")
    )


def create_session(user, refresh_token_str: str, request) -> UserSession:
    """Create a new session row for a freshly-issued refresh token."""
    jti = RefreshToken(refresh_token_str)["jti"]
    ua = (request.META.get("HTTP_USER_AGENT") or "")[:500]
    return UserSession.objects.create(
        user=user,
        jti=jti,
        ip_address=get_client_ip(request),
        user_agent=ua,
        device_label=_parse_device_label(ua),
    )


def rotate_session(user, old_jti: str, new_refresh_token_str: str, request) -> UserSession:
    """Update the existing session row when the refresh token rotates.

    Returns the touched session. If the old jti is unknown (shouldn't
    happen in normal flow — means the cookie outlived its session row,
    e.g. after a data wipe), we fall back to creating a fresh session.
    """
    new_jti = RefreshToken(new_refresh_token_str)["jti"]
    session = UserSession.objects.filter(user=user, jti=old_jti, revoked_at__isnull=True).first()
    if session is None:
        return create_session(user, new_refresh_token_str, request)
    session.jti = new_jti
    session.save(update_fields=["jti", "last_seen_at"])
    return session


def revoke_session(session: UserSession, reason: str = "user_requested") -> None:
    """Mark a session revoked AND blacklist its refresh token."""
    if session.revoked_at is not None:
        return
    session.revoked_at = timezone.now()
    session.revoked_reason = reason
    session.save(update_fields=["revoked_at", "revoked_reason"])

    try:
        outstanding = OutstandingToken.objects.get(jti=session.jti)
        BlacklistedToken.objects.get_or_create(token=outstanding)
    except OutstandingToken.DoesNotExist:
        # Token was already expired/blacklisted — nothing to do.
        pass


def revoke_all_sessions(user, except_jti: str | None = None, reason: str = "user_requested") -> int:
    """Revoke every active session. Optionally keep one (the current)."""
    qs = UserSession.objects.filter(user=user, revoked_at__isnull=True)
    if except_jti:
        qs = qs.exclude(jti=except_jti)
    sessions = list(qs)
    for s in sessions:
        revoke_session(s, reason=reason)
    return len(sessions)


def get_session_from_jti(user, jti: str) -> UserSession | None:
    """Look up a session by (User instance, jti)."""
    if not jti:
        return None
    return UserSession.objects.filter(user=user, jti=jti).first()


def get_session_from_jti_id(user_id, jti: str) -> UserSession | None:
    """Look up a session by (user_id, jti) without needing a full User instance."""
    if not jti or not user_id:
        return None
    return UserSession.objects.filter(user_id=user_id, jti=jti).first()
