"""TOTP-based 2FA services.

Design decisions:
- Secret is stored as base32 (32 chars) — standard, no extra encoding.
- Recovery codes are SHA-256 hashed; plaintext is shown once at setup
  and never persisted. Single-use: consumed on verify.
- `twofa_token` (the pre-auth token for the second login step) is a
  Django TimestampSigner payload, NOT a JWT. 5-min window. On expiry or
  tampering it just returns None — callers treat that as "start over".
- TOTP verification allows ±1 window (30s) for clock drift — matches
  what Google Authenticator / Authy do.
"""

import hashlib
import secrets

import pyotp
from django.core.signing import BadSignature, SignatureExpired, TimestampSigner

RECOVERY_CODE_COUNT = 8
TWOFA_TOKEN_MAX_AGE = 300  # 5 minutes


def generate_secret():
    return pyotp.random_base32()


def generate_provisioning_uri(secret: str, email: str, issuer: str = "Smart Learning") -> str:
    return pyotp.totp.TOTP(secret).provisioning_uri(name=email, issuer_name=issuer)


def verify_totp_code(secret: str, code: str, valid_window: int = 1) -> bool:
    if not secret or not code:
        return False
    try:
        return pyotp.totp.TOTP(secret).verify(code.strip(), valid_window=valid_window)
    except Exception:
        return False


def generate_recovery_codes() -> list[str]:
    """8 codes, ~32 bits each. Format: 'A1B2-C3D4' for readability."""
    codes = []
    for _ in range(RECOVERY_CODE_COUNT):
        raw = secrets.token_hex(4).upper()
        codes.append(f"{raw[:4]}-{raw[4:]}")
    return codes


def _hash_recovery_code(code: str) -> str:
    return hashlib.sha256(code.strip().upper().encode()).hexdigest()


def hash_recovery_codes(codes: list[str]) -> list[str]:
    return [_hash_recovery_code(c) for c in codes]


def verify_recovery_code(user, code: str) -> bool:
    """Verify and consume a recovery code. Returns True on match."""
    if not code:
        return False
    code_hash = _hash_recovery_code(code)
    hashes = list(user.two_factor_recovery_codes or [])
    if code_hash not in hashes:
        return False
    hashes.remove(code_hash)
    user.two_factor_recovery_codes = hashes
    user.save(update_fields=["two_factor_recovery_codes"])
    return True


def generate_twofa_token(user) -> str:
    signer = TimestampSigner()
    return signer.sign(f"2fa:{user.id}")


def verify_twofa_token(token: str) -> str | None:
    """Returns user_id (str) if valid, None otherwise."""
    if not token:
        return None
    signer = TimestampSigner()
    try:
        payload = signer.unsign(token, max_age=TWOFA_TOKEN_MAX_AGE)
    except (BadSignature, SignatureExpired):
        return None
    if not payload.startswith("2fa:"):
        return None
    return payload[4:]
