# Inference Digital Twin

Research platform for data center inference engineering decisions across hardware, runtime, orchestration, interconnect, and operational outcomes. Available as both a web app and a standalone desktop application.

## The Forge

The Forge is the flagship interactive simulator. Users build an AI data center from the ground up — selecting site, power, cooling, compute, networking, and DCIM — then run live inference benchmarks (TTFT, TPS, Concurrency, MFU) in an interactive floor/map view with real-time geographic visualization.

## What This Ships

- **The Forge** — interactive data center construction simulator with 8-phase decision timeline, real-time metrics, and world-map site selection.
- **Explorer** — scenario explorer for browsing and filtering prediction reports.
- **Runs & Artifacts** — async run architecture with content-addressed report cache.
- **Provenance** — full audit trail for every prediction report (inputs, hashes, coefficients).
- **Desktop App** — standalone PyQt6 desktop wrapper with a cinematic Watt-Bit branded opening sequence.
- Versioned contracts in `contracts/v1` (ScenarioSpec, ModuleInput/Output, PredictionReport).
- Deterministic scenario canonicalization + SHA-256 content hashing.
- Canonical error taxonomy: `validation`, `data_missing`, `calibration_out_of_range`, `compute_timeout`, `internal`.

## Tech Stack

- Python 3.11+
- FastAPI + Uvicorn
- SQLite
- JSON Schema validation
- Vanilla JS + Jinja2 server-rendered templates
- PyQt6 + QWebEngineView (desktop app)
- PyInstaller (desktop packaging)

## Project Layout

```
app/
  main.py              App factory and route mounting
  api/routes.py        REST API endpoints
  orchestrator.py      Queue/work orchestration and report assembly
  run_queue.py         Background job queue
  db.py                SQLite persistence layer
  config.py            Settings (env-var configurable, PyInstaller aware)
  modules/             Hardware, interconnect, runtime, orchestration, energy estimators
  static/              CSS, JS, favicon, world_paths.json
  templates/           Jinja2 HTML templates (base, explorer, forge, runs, artifacts, provenance)
desktop/
  desktop_main.py      Desktop app entry point
  app_manager.py       Lifecycle manager (server, screens, cleanup)
  server_thread.py     Background Uvicorn thread with free-port discovery
  screens/
    space_title_screen.py   Opening animation: stars + earth + Calgary zoom
    wbr_title_screen.py     Watt-Bit Research logo reveal
    main_app_window.py      QWebEngineView wrapper for The Forge
  utils/resource.py    Path resolver for dev + PyInstaller modes
  assets/              Sprite sheets, backgrounds, logos, Watt-Bit chip icon
artifacts/             Deterministic coefficient files
contracts/v1/          Versioned JSON Schema contracts
docs/                  Architecture plan, test plan, Notion workspace export
tests/                 Contract, module, integration, and frontend regression tests
run.py                 Web-only entry point (uvicorn on port 8000)
desktop_main.spec      PyInstaller packaging spec
```

## Quick Start

### Option A: Web App (browser)

```bash
python -m venv .venv
.venv/Scripts/activate        # Windows
# source .venv/bin/activate   # macOS/Linux
pip install -e .[dev]
python run.py
```

Then open [http://127.0.0.1:8000/forge](http://127.0.0.1:8000/forge).

### Option B: Desktop App (standalone)

```bash
python -m venv .venv
.venv/Scripts/activate
pip install -e ".[desktop]"
python -m desktop.desktop_main
```

The desktop app launches a cinematic opening sequence (space → earth → Calgary zoom → Watt-Bit logo), then loads The Forge in an embedded browser. The FastAPI server runs automatically in the background on a random available port.

### Option C: Build Distributable .exe

```bash
pip install -e ".[desktop]"
pyinstaller desktop_main.spec
```

The output `dist/InferenceDigitalTwin.exe` is a self-contained executable. The SQLite database is created next to the .exe on first run.

## Web Routes

| Route | Description |
|-------|-------------|
| `/forge` | The Forge — interactive data center simulator |
| `/explorer` | Scenario explorer and prediction browser |
| `/runs` | List of all simulation runs |
| `/runs/{run_id}` | Run detail view |
| `/reports/{report_id}/provenance` | Provenance audit trail |
| `/artifacts` | Artifact list |

## API Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/presets` | Available scenario presets |
| `POST` | `/api/validate-scenario` | Validate a scenario spec |
| `POST` | `/api/runs` | Enqueue a new simulation run |
| `GET` | `/api/runs` | List all runs |
| `GET` | `/api/runs/{run_id}` | Get run status and results |
| `GET` | `/api/reports` | List all reports |
| `GET` | `/api/reports/{report_id}` | Get a prediction report |
| `GET` | `/api/reports/{report_id}/provenance` | Report provenance data |
| `GET` | `/api/reports/{report_id}/bundle` | Download report bundle |

## Running Tests

```bash
pip install -e .[dev]
pytest
```

## Configuration

The app is configured via environment variables (all optional):

| Variable | Default | Description |
|----------|---------|-------------|
| `IDT_DATABASE_PATH` | `./inference_digital_twin.db` | SQLite database file |
| `IDT_CONTRACTS_DIR` | `./contracts/v1/` | Contract schema directory |
| `IDT_ARTIFACTS_PATH` | `./artifacts/coefficients.v1.json` | Coefficients file |
| `IDT_INLINE_EXECUTION` | `0` | Run jobs synchronously (set `1` for debugging) |
| `IDT_WORKER_POLL_SECONDS` | `0.2` | Job queue polling interval |

## Documentation

- `docs/PLAN.md` — approved architecture and design plan
- `docs/TEST_PLAN.md` — eng-review test plan
- `docs/notion_workspace/` — full project knowledge base (deep dives, formulas, risk register)
- `DESIGN.md` — design system (typography, colors, spacing, motion)
- `TODOS.md` — roadmap and deferred work
- `CHANGELOG.md` — version history
