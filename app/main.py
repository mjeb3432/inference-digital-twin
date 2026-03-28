from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app.api.routes import router as api_router
from app.artifacts import ArtifactRegistry
from app.config import Settings, load_settings
from app.db import Database
from app.orchestrator import Orchestrator
from app.run_queue import RunQueue
from app.validation import SchemaRegistry


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or load_settings()

    db = Database(settings.database_path)
    db.init_schema()

    schemas = SchemaRegistry(settings.contracts_dir)
    artifacts = ArtifactRegistry(settings.artifacts_path)
    run_queue = RunQueue(settings.worker_poll_interval_seconds)
    orchestrator = Orchestrator(
        db=db,
        schemas=schemas,
        artifacts=artifacts,
        run_queue=run_queue,
        inline_execution=settings.inline_execution,
    )

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        orchestrator.start_worker()
        try:
            yield
        finally:
            orchestrator.stop_worker()
            db.close()

    app = FastAPI(title="Inference Digital Twin", version="0.1.0", lifespan=lifespan)

    app.state.settings = settings
    app.state.db = db
    app.state.schemas = schemas
    app.state.artifacts = artifacts
    app.state.run_queue = run_queue
    app.state.orchestrator = orchestrator

    static_dir = Path(__file__).resolve().parent / "static"
    template_dir = Path(__file__).resolve().parent / "templates"

    app.mount("/static", StaticFiles(directory=static_dir), name="static")
    templates = Jinja2Templates(directory=str(template_dir))

    @app.get("/", response_class=HTMLResponse)
    def root() -> RedirectResponse:
        return RedirectResponse(url="/forge")

    @app.get("/favicon.ico", include_in_schema=False)
    def favicon() -> RedirectResponse:
        return RedirectResponse(url="/static/favicon.svg")

    @app.get("/explorer", response_class=HTMLResponse)
    def explorer(request: Request) -> HTMLResponse:
        return templates.TemplateResponse(
            request,
            "explorer.html",
            {
                "active_nav": "explorer",
                "body_class": "explorer-page",
                "page_shell_class": "page-shell--full",
                "title": "Explorer",
            },
        )

    @app.get("/forge", response_class=HTMLResponse)
    def forge(request: Request) -> HTMLResponse:
        return templates.TemplateResponse(
            request,
            "forge.html",
            {
                "title": "The Forge",
            },
        )

    @app.get("/runs/{run_id}", response_class=HTMLResponse)
    def run_details(request: Request, run_id: str) -> HTMLResponse:
        run = app.state.orchestrator.get_run(run_id)
        if run is None:
            raise HTTPException(status_code=404, detail="Run not found")
        return templates.TemplateResponse(
            request,
            "run_detail.html",
            {
                "active_nav": "runs",
                "title": f"Run {run_id}",
                "run_id": run_id,
            },
        )

    @app.get("/runs", response_class=HTMLResponse)
    def runs_index(request: Request) -> HTMLResponse:
        return templates.TemplateResponse(
            request,
            "runs_list.html",
            {
                "active_nav": "runs",
                "title": "Runs",
            },
        )

    @app.get("/reports/{report_id}/provenance", response_class=HTMLResponse)
    def report_provenance(request: Request, report_id: str) -> HTMLResponse:
        report = app.state.orchestrator.get_report(report_id)
        if report is None:
            raise HTTPException(status_code=404, detail="Report not found")
        return templates.TemplateResponse(
            request,
            "provenance.html",
            {
                "active_nav": "artifacts",
                "title": f"Provenance {report_id}",
                "report_id": report_id,
            },
        )

    @app.get("/artifacts", response_class=HTMLResponse)
    def artifacts_index(request: Request) -> HTMLResponse:
        return templates.TemplateResponse(
            request,
            "artifacts_list.html",
            {
                "active_nav": "artifacts",
                "title": "Artifacts",
            },
        )

    app.include_router(api_router)
    return app


app = create_app()
