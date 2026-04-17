from __future__ import annotations

import threading
from dataclasses import dataclass
from typing import Any

from fastapi import FastAPI

from app.config import Settings


class ServiceInitializationError(RuntimeError):
    """Raised when the application runtime fails to initialize."""


@dataclass(slots=True)
class ServiceBundle:
    db: Any
    schemas: Any
    artifacts: Any
    run_queue: Any
    orchestrator: Any


class AppServices:
    """Lazily initializes heavy runtime services so the UI can boot first."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._bundle: ServiceBundle | None = None
        self._lock = threading.Lock()
        self._warm_thread: threading.Thread | None = None
        self._error: Exception | None = None

    @property
    def ready(self) -> bool:
        return self._bundle is not None

    @property
    def failed(self) -> bool:
        return self._error is not None

    @property
    def error_message(self) -> str | None:
        return str(self._error) if self._error is not None else None

    def warm_in_background(self) -> None:
        if self.ready or self.failed:
            return
        if self._warm_thread and self._warm_thread.is_alive():
            return

        def _warm() -> None:
            try:
                self._initialize()
            except ServiceInitializationError:
                return

        self._warm_thread = threading.Thread(target=_warm, daemon=True, name="idt-service-warmup")
        self._warm_thread.start()

    def get(self) -> ServiceBundle:
        self._initialize()
        if self._bundle is None:
            raise ServiceInitializationError("Inference runtime is unavailable.")
        return self._bundle

    def shutdown(self) -> None:
        bundle = self._bundle
        if bundle is None:
            if self._warm_thread and self._warm_thread.is_alive():
                self._warm_thread.join(timeout=2.0)
            return

        bundle.orchestrator.stop_worker()
        bundle.db.close()
        self._bundle = None

    def _initialize(self) -> None:
        if self._bundle is not None:
            return
        if self._error is not None:
            raise ServiceInitializationError("Inference runtime failed to initialize.") from self._error

        with self._lock:
            if self._bundle is not None:
                return
            if self._error is not None:
                raise ServiceInitializationError("Inference runtime failed to initialize.") from self._error
            try:
                self._bundle = self._build_bundle()
            except Exception as exc:  # pragma: no cover - surfaced via callers/tests
                self._error = exc
                raise ServiceInitializationError("Inference runtime failed to initialize.") from exc

    def _build_bundle(self) -> ServiceBundle:
        from app.artifacts import ArtifactRegistry
        from app.db import Database
        from app.orchestrator import Orchestrator
        from app.run_queue import RunQueue
        from app.validation import SchemaRegistry

        db = Database(self._settings.database_path)
        try:
            db.init_schema()
            schemas = SchemaRegistry(self._settings.contracts_dir)
            artifacts = ArtifactRegistry(self._settings.artifacts_path)
            run_queue = RunQueue(self._settings.worker_poll_interval_seconds)
            orchestrator = Orchestrator(
                db=db,
                schemas=schemas,
                artifacts=artifacts,
                run_queue=run_queue,
                inline_execution=self._settings.inline_execution,
            )
            orchestrator.start_worker()
            return ServiceBundle(
                db=db,
                schemas=schemas,
                artifacts=artifacts,
                run_queue=run_queue,
                orchestrator=orchestrator,
            )
        except Exception:
            db.close()
            raise


def get_services(app: FastAPI) -> AppServices:
    return app.state.services
