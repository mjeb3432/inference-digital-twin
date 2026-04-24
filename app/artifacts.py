from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

from app.errors import DataMissingError, ValidationError

_ARTIFACT_SCHEMA_PATH = Path(__file__).parent.parent / "contracts" / "v1" / "artifact-coefficients.v1.schema.json"


class ArtifactRegistry:
    def __init__(self, path: Path) -> None:
        self._path = path
        self._payload = self._load(path)
        self._validate_schema(self._payload)

    @staticmethod
    def _load(path: Path) -> dict[str, Any]:
        if not path.exists():
            raise DataMissingError("Coefficient artifact file not found", {"path": str(path)})
        with path.open("r", encoding="utf-8-sig") as handle:
            return json.load(handle)

    @staticmethod
    def _validate_schema(payload: dict[str, Any]) -> None:
        schema = json.loads(_ARTIFACT_SCHEMA_PATH.read_text(encoding="utf-8-sig"))
        validator = Draft202012Validator(schema)
        errors = list(validator.iter_errors(payload))
        if errors:
            first = errors[0]
            path = ".".join(str(p) for p in first.path)
            where = path if path else "<root>"
            raise ValidationError(
                f"Artifact file failed schema validation: {first.message}",
                {"path": where},
            )

    @property
    def artifact_id(self) -> str:
        return self._payload["artifact_id"]

    @property
    def artifact_version(self) -> str:
        return self._payload["artifact_version"]

    @property
    def assumptions_registry_version(self) -> str:
        return self._payload.get("assumptions_registry_version", "v1")

    @property
    def module_versions(self) -> dict[str, str]:
        return dict(self._payload["module_versions"])

    @property
    def coefficients(self) -> dict[str, Any]:
        return self._payload["coefficients"]
