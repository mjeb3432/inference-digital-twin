from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app.api.routes import router as api_router
from app.config import Settings, load_settings
from app.services import AppServices, ServiceInitializationError, get_services


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or load_settings()
    services = AppServices(settings)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        services.warm_in_background()
        try:
            yield
        finally:
            services.shutdown()

    app = FastAPI(title="Inference Digital Twin", version="0.1.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000"],
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )

    app.state.settings = settings
    app.state.services = services

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

    # ----------------------------------------------------------------
    # /forge  — serves the React/Vite SPA from frontend/dist when
    # present, falls back to the legacy Jinja template otherwise.
    # ----------------------------------------------------------------
    spa_index = static_dir / "dist" / "index.html"

    @app.get("/forge", response_class=HTMLResponse)
    def forge(request: Request) -> HTMLResponse:
        # Preferred path: the Vite build output has been produced.
        if spa_index.is_file():
            return HTMLResponse(spa_index.read_text(encoding="utf-8"))
        # Fallback: legacy vanilla-JS template (keeps the app usable
        # before the first `npm run build`).
        return templates.TemplateResponse(
            request,
            "forge.html",
            {"title": "The Forge"},
        )

    @app.get("/runs/{run_id}", response_class=HTMLResponse)
    def run_details(request: Request, run_id: str) -> HTMLResponse:
        try:
            run = get_services(request.app).get().orchestrator.get_run(run_id)
        except ServiceInitializationError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
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
        try:
            report = get_services(request.app).get().orchestrator.get_report(report_id)
        except ServiceInitializationError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
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
