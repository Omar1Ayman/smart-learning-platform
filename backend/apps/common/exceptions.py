"""
Wraps every DRF error into one consistent {"error": {...}} shape and
guarantees a Python traceback never reaches an API response (SECURITY.md #4).

DRF itself already wraps string-only details in a {"detail": X} envelope.
Without unwrapping that first, we'd end up with {"error": {"detail": {"detail": X}}}
— ugly, and inconsistent with the field-error case (which is
{"error": {"detail": {"email": [...]}}} directly).

The unwrap below only fires when the inner dict is *exactly* {"detail": X}
— that is, the standard "plain string message" shape. Field errors, nested
serializers, and any explicit dict detail are left untouched.
"""

from rest_framework.views import exception_handler as drf_exception_handler


def custom_exception_handler(exc, context):
    response = drf_exception_handler(exc, context)
    if response is None:
        return response

    data = response.data

    # Unwrap DRF's default {"detail": X} envelope when it's the sole key.
    # After this, the API contract is stable:
    #   - 400 field errors   → {"error": {"status": 400, "detail": {"field": [...]}}}
    #   - 401/403 plain msg  → {"error": {"status": N,   "detail": "string"}}
    #   - 429 throttling     → {"error": {"status": 429, "detail": "string"}}
    if isinstance(data, dict) and set(data.keys()) == {"detail"}:
        data = data["detail"]

    response.data = {"error": {"status": response.status_code, "detail": data}}
    return response