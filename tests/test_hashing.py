from __future__ import annotations

from app.hashing import scenario_hash


def test_scenario_hash_is_stable_across_key_order() -> None:
    a = {
        "b": 2,
        "a": {
            "z": [3, 2, 1],
            "x": "ok",
        },
    }
    b = {
        "a": {
            "x": "ok",
            "z": [3, 2, 1],
        },
        "b": 2,
    }
    assert scenario_hash(a) == scenario_hash(b)
