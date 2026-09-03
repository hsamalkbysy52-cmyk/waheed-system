"""Golden fixtures recorded from the legacy FastAPI API, and the comparison contract tests use.

A fixture is one JSON file under tests/goldens/legacy/ named ``NN-<method>-<path>[--<case>].json``,
where NN is the route's position in the plan's endpoint table (§1.3) and LEGACY_ROUTES below.
tests/goldens/capture_legacy.py recorded them; tests/goldens/README.md explains the relaxations.
"""

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

LEGACY_GOLDEN_DIR = Path(__file__).resolve().parent / "goldens" / "legacy"

# Plan §1.3 in table order. A fixture's two-digit prefix is its route's 1-based position here.
LEGACY_ROUTES = (
    "GET /",
    "GET /menu",
    "POST /menu/add",
    "PUT /menu/{item_id}",
    "DELETE /menu/{item_id}",
    "GET /menu/{item_id}/modifiers/groups",
    "POST /menu/{item_id}/modifiers/groups",
    "DELETE /modifiers/groups/{group_id}",
    "POST /modifiers/groups/{group_id}/options",
    "DELETE /modifiers/options/{option_id}",
    "PUT /modifiers/groups/{group_id}",
    "PUT /modifiers/options/{option_id}",
    "PUT /menu/{item_id}/modifiers/groups/reorder",
    "PUT /modifiers/groups/{group_id}/options/reorder",
    "PUT /menu/{item_id}/toggle",
    "GET /orders",
    "POST /orders/create",
    "POST /heartbeat",
    "GET /restaurant/status",
    "POST /orders/qr-create",
    "PUT /orders/{order_id}/ready",
    "PUT /orders/{order_id}/preparing",
    "PUT /orders/{order_id}",
    "DELETE /orders/{order_id}",
    "PUT /orders/{order_id}/served",
    "PUT /orders/{order_id}/pay",
    "PUT /orders/{order_id}/done",
    "POST /orders/{order_id}/cancel",
    "GET /inventory",
    "POST /inventory/add",
    "PUT /inventory/{item_id}",
    "DELETE /inventory/{item_id}",
    "GET /inventory/recipe/{menu_item_id}",
    "POST /inventory/recipe/{menu_item_id}",
    "POST /inventory/deduct/{order_id}",
    "GET /table-layout",
    "POST /table-layout/save",
    "POST /login",
    "POST /register",
    "GET /admin/restaurants",
    "POST /admin/restaurants/{restaurant_id}/status",
    "POST /agent/ask",
)

# The frontend shows these strings to people, so they are compared by value, not just by type.
USER_FACING_TEXT_KEYS = frozenset({"message", "error", "detail"})


@dataclass(frozen=True)
class Golden:
    name: str
    route: str
    case: str
    method: str
    path: str
    headers: dict
    body: Optional[dict]
    status: int
    response: dict


def load_legacy_goldens() -> list[Golden]:
    return [
        Golden(name=file.stem, **json.loads(file.read_text(encoding="utf-8")))
        for file in sorted(LEGACY_GOLDEN_DIR.glob("*.json"))
    ]


def legacy_golden(route: str, case: str = "success") -> Golden:
    for golden in load_legacy_goldens():
        if golden.route == route and golden.case == case:
            return golden
    raise KeyError(f"no legacy golden for {route!r} with case {case!r}")


def route_pattern(route: str) -> "re.Pattern[str]":
    """Regex that matches only the concrete paths of a route template like 'PUT /menu/{item_id}'."""
    template = route.split(" ", 1)[1]
    literal_parts = re.split(r"\{[^/}]+\}", template)
    return re.compile("^" + "[^/]+".join(re.escape(part) for part in literal_parts) + "$")


def assert_matches_golden(actual: Any, golden: Any, path: str = "$") -> None:
    """Assert that ``actual`` has the golden's shape.

    Same keys at every level, same value kinds (bool, number, string, object, list) and identical
    user-facing text. Everything else may differ: ids, totals, timestamps, tokens. ``None`` on
    either side is accepted for any value because the legacy API returns null for optional
    fields. Every list element is compared to the golden's first element, and a golden with
    elements requires actual elements, so an empty response never passes for a populated fixture.
    """
    if actual is None or golden is None:
        return
    if isinstance(golden, dict):
        _assert_same_object_shape(actual, golden, path)
    elif isinstance(golden, list):
        _assert_same_list_shape(actual, golden, path)
    elif _kind(actual) != _kind(golden):
        raise AssertionError(f"{path}: expected {_kind(golden)}, got {_kind(actual)}")


def _assert_same_object_shape(actual: Any, golden: dict, path: str) -> None:
    if not isinstance(actual, dict):
        raise AssertionError(f"{path}: expected object, got {_kind(actual)}")
    missing, extra = set(golden) - set(actual), set(actual) - set(golden)
    if missing or extra:
        raise AssertionError(
            f"{path}: missing keys {sorted(missing)}, unexpected keys {sorted(extra)}"
        )
    for key, golden_value in golden.items():
        child = f"{path}.{key}"
        if key in USER_FACING_TEXT_KEYS and isinstance(golden_value, str):
            if actual[key] != golden_value:
                raise AssertionError(f"{child}: {actual[key]!r} != {golden_value!r}")
        else:
            assert_matches_golden(actual[key], golden_value, child)


def _assert_same_list_shape(actual: Any, golden: list, path: str) -> None:
    if not isinstance(actual, list):
        raise AssertionError(f"{path}: expected list, got {_kind(actual)}")
    if golden and not actual:
        raise AssertionError(f"{path}: golden has elements, actual list is empty")
    for index, element in enumerate(actual):
        assert_matches_golden(element, golden[0] if golden else None, f"{path}[{index}]")


def _kind(value: Any) -> str:
    if isinstance(value, bool):
        return "bool"
    if isinstance(value, (int, float)):
        return "number"
    return type(value).__name__
