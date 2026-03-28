from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.errors import DataMissingError


class ArtifactRegistry:
    def __init__(self, path: Path) -> None:
        self._path = path
        self._payload = self._load(path)

    @staticmethod
    def _load(path: Path) -> dict[str, Any]:
        if not path.exists():
            raise DataMissingError("Coefficient artifact file not found", {"path": str(path)})
        with path.open("r", encoding="utf-8-sig") as handle:
            return json.load(handle)

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
