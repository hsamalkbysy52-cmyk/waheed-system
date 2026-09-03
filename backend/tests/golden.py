"""Golden fixtures recorded from the legacy FastAPI API, and the comparison that contract tests use.

A fixture is one JSON file under tests/goldens/legacy/ named ``NN-<method>-<path>[--<case>].json``
(see ``fixture_name``), where NN is the route's position in the plan's endpoint table (§1.3) and in
LEGACY_ROUTES. tests/goldens/capture_legacy.py recorded them; tests/goldens/README.md explains the
routes whose comparison is relaxed on purpose.
"""

import json
import re
from dataclasses import asdict, dataclass, field, fields
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

# The frontend shows these strings to people, so they are compared by value, not just by kind.
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

    def to_fixture(self) -> dict:
        """The JSON document stored on disk: every field except the name, which is the file name."""
        document = asdict(self)
        document.pop("name")
        return document


FIXTURE_KEYS = frozenset(f.name for f in fields(Golden)) - {"name"}


def split_route(route: str) -> tuple:
    """'PUT /menu/{item_id}' -> ('PUT', '/menu/{item_id}')."""
    method, template = route.split(" ", 1)
    return method, template


def fixture_name(route: str, case: str) -> str:
    method, template = split_route(route)
    slug = template.strip("/").replace("/", "-").replace("{", "").replace("}", "") or "root"
    suffix = "" if case == "success" else "--" + case.split(":", 1)[1]
    return f"{LEGACY_ROUTES.index(route) + 1:02d}-{method.lower()}-{slug}{suffix}.json"


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


def golden_error(golden: Golden) -> dict:
    """The body the rebuilt API answers for a legacy failure fixture (tests/goldens/README.md).

    The legacy API answered ``{"error": m}`` with 200 or ``{"detail": m}`` with a real code; the
    rebuild answers both keys with the same message and a real code, which each test asserts.
    """
    return refusal(golden.response.get("error") or golden.response["detail"])


def refusal(message: str) -> dict:
    """The body of every refusal the rebuilt API gives: one message under both keys."""
    return {"error": message, "detail": message}


def route_pattern(route: str) -> "re.Pattern[str]":
    """Regex that matches only the concrete paths of a route template like 'PUT /menu/{item_id}'."""
    literal_parts = re.split(r"\{[^/}]+\}", split_route(route)[1])
    return re.compile("^" + "[^/]+".join(re.escape(part) for part in literal_parts) + "$")


@dataclass
class Shape:
    """What a golden shows at one position: the kinds seen there and their structure."""

    kinds: set = field(
        default_factory=set
    )  # from {"null", "bool", "number", "str", "object", "list"}
    keys: dict = field(default_factory=dict)  # objects: key -> Shape
    optional_keys: set = field(default_factory=set)  # keys some observed objects lack
    element: Optional["Shape"] = None  # lists: merged shape of every observed element
    texts: set = field(default_factory=set)  # user-facing strings seen here, compared by value


def shape_of(value: Any, user_facing: bool = False) -> Shape:
    kind = _kind(value)
    shape = Shape(kinds={kind})
    if kind == "object":
        shape.keys = {
            key: shape_of(child, key in USER_FACING_TEXT_KEYS) for key, child in value.items()
        }
    elif kind == "list":
        for element in value:
            shape.element = merge_shapes(shape.element, shape_of(element))
    elif kind == "str" and user_facing:
        shape.texts = {value}
    return shape


def merge_shapes(first: Optional[Shape], second: Shape) -> Shape:
    """Union of two shapes seen at the same position, e.g. two elements of one golden list."""
    if first is None:
        return second
    merged = Shape(kinds=first.kinds | second.kinds, texts=first.texts | second.texts)
    both_objects = "object" in first.kinds and "object" in second.kinds
    for key in first.keys.keys() | second.keys.keys():
        if key in first.keys and key in second.keys:
            merged.keys[key] = merge_shapes(first.keys[key], second.keys[key])
        else:
            merged.keys[key] = first.keys.get(key) or second.keys[key]
            if both_objects:
                merged.optional_keys.add(key)
    merged.optional_keys |= first.optional_keys | second.optional_keys
    if first.element and second.element:
        merged.element = merge_shapes(first.element, second.element)
    else:
        merged.element = first.element or second.element
    return merged


def assert_matches_golden(actual: Any, golden: Any, path: str = "$") -> None:
    """Assert that ``actual`` has the golden's shape.

    Same keys at every level, same value kinds (bool, number, string, object, list) and identical
    user-facing text. Everything else may differ: ids, totals, timestamps, tokens. A value may be
    null only where the golden shows null at that position (in any element of the same list);
    where the golden only ever shows null, any value is accepted. Every list element is compared to
    the merged shape of the golden's elements. A list that is not inside another list's element must
    have elements when the golden's does, so an empty response never passes for a populated fixture;
    lists inside elements (an item's modifiers, a group's options) may be empty, as the recorded
    data has such elements too.
    """
    _check(actual, shape_of(golden), path)


def _check(actual: Any, shape: Shape, path: str) -> None:
    if shape.kinds == {"null"}:
        return  # the golden only ever showed null here; there is no kind to hold actual to
    kind = _kind(actual)
    if kind not in shape.kinds:
        raise AssertionError(f"{path}: expected {'/'.join(sorted(shape.kinds))}, got {kind}")
    if kind == "object":
        _check_object(actual, shape, path)
    elif kind == "list":
        _check_list(actual, shape, path)


def _check_object(actual: dict, shape: Shape, path: str) -> None:
    missing = {key for key in shape.keys if key not in actual and key not in shape.optional_keys}
    extra = set(actual) - set(shape.keys)
    if missing or extra:
        raise AssertionError(
            f"{path}: missing keys {sorted(missing)}, unexpected keys {sorted(extra)}"
        )
    for key, value in actual.items():
        child, child_path = shape.keys[key], f"{path}.{key}"
        if child.texts and value not in child.texts:
            raise AssertionError(f"{child_path}: {value!r} is not the recorded text {child.texts}")
        _check(value, child, child_path)


def _check_list(actual: list, shape: Shape, path: str) -> None:
    if shape.element is None:
        return  # every golden list at this position was empty; nothing to compare elements against
    if not actual and "[" not in path:
        raise AssertionError(f"{path}: golden has elements, actual list is empty")
    for index, element in enumerate(actual):
        _check(element, shape.element, f"{path}[{index}]")


def _kind(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "bool"
    if isinstance(value, (int, float)):
        return "number"
    if isinstance(value, dict):
        return "object"
    if isinstance(value, list):
        return "list"
    return type(value).__name__
