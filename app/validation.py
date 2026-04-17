from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

from app.errors import ValidationError


class SchemaRegistry:
    def __init__(self, contracts_dir: Path) -> None:
        self._schemas: dict[str, dict[str, Any]] = {}
        self._validators: dict[str, Draft202012Validator] = {}
        self._load_contracts(contracts_dir)

    def _load_contracts(self, contracts_dir: Path) -> None:
        mapping = {
            "scenario": "scenario-spec.v1.schema.json",
            "module_io": "module-io.v1.schema.json",
            "prediction": "prediction-report.v1.schema.json",
            "error_taxonomy": "error-taxonomy.v1.json",
        }
        for key, filename in mapping.items():
            file_path = contracts_dir / filename
            with file_path.open("r", encoding="utf-8-sig") as handle:
                self._schemas[key] = json.load(handle)
            self._validators[key] = Draft202012Validator(self._schemas[key])

    def validate(self, key: str, payload: Any) -> None:
        validator = self._validators[key]
        # Sort by a tuple of stringified path components. jsonschema's err.path
        # is a deque that can mix str and int (e.g. ["items", 0, "field"]),
        # and comparing two deques element-wise raises TypeError when two errors
        # differ in type at the same position. Coercing to str makes ordering
        # deterministic and comparison-safe regardless of schema shape.
        errors = sorted(
            validator.iter_errors(payload),
            key=lambda err: tuple(str(p) for p in err.path),
        )
        if errors:
            first = errors[0]
            path = ".".join(str(p) for p in first.path)
            where = path if path else "<root>"
            raise ValidationError(
                message=f"Schema validation failed for {key}: {first.message}",
                details={"path": where},
            )

    def schema(self, key: str) -> dict[str, Any]:
        return self._schemas[key]
