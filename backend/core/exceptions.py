"""DRF exception handler: every handled failure answers ``{"error": m, "detail": m}`` with a real
status code (plan §4). DRF and Django already map the classes to codes (ValidationError 400,
NotAuthenticated 401, PermissionDenied 403, Http404 404); this handler only shapes the body.

Validation errors carry the first failed check only, as the legacy API stopped at the first, and
the frontend shows ``error`` as one line. Token failures raised by Simple JWT, including a token
whose user is gone or deactivated, all become the legacy "invalid token" message.
"""

from typing import Any, Optional

from rest_framework.exceptions import AuthenticationFailed, NotAuthenticated
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler
from rest_framework_simplejwt import exceptions as jwt_exceptions

from core import messages
from core.responses import error_body


def exception_handler(exc: Exception, context: dict) -> Optional[Response]:
    response = drf_exception_handler(exc, context)
    if response is None:
        return None  # not an API exception: Django answers 500, which the frontend retries
    response.data = error_body(_message(exc))
    return response


def _message(exc: Exception) -> str:
    if isinstance(exc, NotAuthenticated):
        return messages.MISSING_TOKEN
    if _is_token_failure(exc):
        return messages.INVALID_TOKEN
    return _first_text(exc.detail)


def _is_token_failure(exc: Exception) -> bool:
    """Raised by Simple JWT: a bad or expired token, or a token whose user is gone or inactive.

    Its authentication path raises its own ``AuthenticationFailed`` subclass; its refresh
    serializer raises DRF's with the ``no_active_account`` code.
    """
    if isinstance(exc, jwt_exceptions.AuthenticationFailed):
        return True
    return isinstance(exc, AuthenticationFailed) and exc.get_codes() == "no_active_account"


def _first_text(detail: Any) -> str:
    """The first message in DRF's nested error detail (field dict, list or single string)."""
    if isinstance(detail, dict):
        return _first_text(next(iter(detail.values())))
    if isinstance(detail, list):
        return _first_text(detail[0])
    return str(detail)
