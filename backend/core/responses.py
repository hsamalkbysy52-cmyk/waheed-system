"""The two response shapes of the API (plan §2, §4).

Success bodies are the legacy shapes, built explicitly by each view. Failure bodies carry the same
Arabic message under both ``error`` (what the frontend reads) and ``detail`` (what FastAPI's
``HTTPException`` used to emit), with a real status code.
"""

from rest_framework.response import Response


def ok(data: dict, status: int = 200) -> Response:
    return Response(data, status=status)


def fail(message: str, status: int) -> Response:
    return Response(error_body(message), status=status)


def error_body(message: str) -> dict:
    return {"error": message, "detail": message}
