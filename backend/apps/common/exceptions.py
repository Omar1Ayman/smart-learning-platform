"""
Wraps every DRF error into one consistent {"error": {...}} shape and
guarantees a Python traceback never reaches an API response (SECURITY.md #4).
"""
from rest_framework.views import exception_handler as drf_exception_handler


def custom_exception_handler(exc, context):
    response = drf_exception_handler(exc, context)
    if response is not None:
        response.data = {"error": {"status": response.status_code, "detail": response.data}}
    return response
