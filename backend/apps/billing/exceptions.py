"""Billing-specific exceptions with distinct HTTP status codes."""

from rest_framework.exceptions import APIException


class LimitReached(APIException):
    """Raised when a tenant hits a plan limit (e.g. max_students).

    Uses 402 Payment Required — distinct from 400 (validation) and 403
    (permission denied). The frontend can catch 402 specifically and
    surface an "Upgrade" dialog instead of a generic error toast.
    """

    status_code = 402
    default_detail = "وصلت للحد الأقصى المسموح في باقتك الحالية. قم بالترقية لإضافة المزيد."
    default_code = "limit_reached"
