from __future__ import annotations

import hashlib
import json
from typing import Any


def canonicalize(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: canonicalize(value[k]) for k in sorted(value.keys())}
    if isinstance(value, list):
        return [canonicalize(item) for item in value]
    return value


def canonical_json_bytes(value: Any) -> bytes:
    canonical = canonicalize(value)
    return json.dumps(canonical, separators=(",", ":"), ensure_ascii=True).encode("utf-8")


def scenario_hash(value: Any) -> str:
    digest = hashlib.sha256(canonical_json_bytes(value)).hexdigest()
    return f"sha256:{digest}"
