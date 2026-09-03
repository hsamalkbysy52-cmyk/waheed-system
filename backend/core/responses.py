"""The two response shapes of the API (plan §2, §4).

Success bodies are the legacy shapes, built explicitly by each view. Failure bodies carry the same
Arabic message under both ``error`` (what the frontend reads) and ``detail`` (what FastAPI's
``HTTPException`` used to emit), with a real status code; views raise DRF exceptions and the
handler in core.exceptions builds that body, so nothing else constructs it.
"""

from rest_framework.response import Response


def ok(data: dict, status: int = 200) -> Response:
    return Response(data, status=status)


def error_body(message: str) -> dict:
    return {"error": message, "detail": message}
