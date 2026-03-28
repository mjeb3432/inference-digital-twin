from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


@pytest.fixture()
def client(tmp_path: Path) -> TestClient:
    settings = Settings(
        base_dir=Path.cwd(),
        database_path=tmp_path / "test.db",
        contracts_dir=Path.cwd() / "contracts" / "v1",
        artifacts_path=Path.cwd() / "artifacts" / "coefficients.v1.json",
        inline_execution=True,
        worker_poll_interval_seconds=0.01,
    )
    app = create_app(settings=settings)
    with TestClient(app) as test_client:
        yield test_client
