"""The legacy golden corpus: every fixture is well formed, covers its route and matches itself.

tests/goldens/README.md explains how they were captured and which routes are compared loosely.
"""

import json

import pytest

from tests.golden import (
    FIXTURE_KEYS,
    LEGACY_GOLDEN_DIR,
    LEGACY_ROUTES,
    assert_matches_golden,
    fixture_name,
    legacy_golden,
    load_legacy_goldens,
    route_pattern,
)

HTTP_METHODS = {"GET", "POST", "PUT", "DELETE"}
FIXTURE_FILES = sorted(LEGACY_GOLDEN_DIR.glob("*.json"))


def test_every_legacy_route_has_a_success_fixture():
    covered = {golden.route for golden in load_legacy_goldens() if golden.case == "success"}

    assert len(LEGACY_ROUTES) == 42
    assert covered == set(LEGACY_ROUTES)


@pytest.mark.parametrize("file", FIXTURE_FILES, ids=lambda f: f.stem)
def test_fixture_is_well_formed(file):
    raw = json.loads(file.read_text(encoding="utf-8"))

    assert set(raw) == FIXTURE_KEYS
    assert raw["method"] in HTTP_METHODS
    assert raw["route"] in LEGACY_ROUTES
    assert raw["route"].startswith(raw["method"] + " ")
    assert route_pattern(raw["route"]).match(raw["path"].split("?")[0])
    assert raw["case"].split(":")[0] in {"success", "failure"}
    assert file.name == fixture_name(raw["route"], raw["case"])
    assert all(isinstance(k, str) and isinstance(v, str) for k, v in raw["headers"].items())
    assert raw["headers"].get("Authorization", "Bearer <").startswith("Bearer <"), "redact tokens"
    assert raw["body"] is None or isinstance(raw["body"], dict)
    assert isinstance(raw["status"], int) and 100 <= raw["status"] <= 599
    assert isinstance(raw["response"], dict)
    assert raw["response"].get("token", "<jwt>") == "<jwt>", "redact tokens"


@pytest.mark.parametrize("golden", load_legacy_goldens(), ids=lambda g: g.name)
def test_fixture_response_matches_its_own_shape(golden):
    """A faithful reimplementation returning exactly the recorded body must pass the comparison."""
    assert_matches_golden(golden.response, golden.response)


def test_root_golden_is_the_legacy_health_body():
    golden = legacy_golden("GET /")

    assert golden.status == 200
    assert golden.response == {"message": "Waheed System Running!", "status": "ok"}
