# Inference Digital Twin

Research platform for data center inference engineering decisions across hardware, runtime, orchestration, interconnect, and operational outcomes.

## What This v1 Ships
- Versioned contracts in `contracts/v1`:
  - `ScenarioSpec.v1`
  - `ModuleInput.v1` / `ModuleOutput.v1`
  - `PredictionReport.v1`
- Deterministic scenario canonicalization + SHA-256 content hash.
- Async run architecture:
  - API enqueue
  - worker pipeline
  - persisted report by run id
- Content-addressed report cache.
- Canonical error taxonomy:
  - `validation`, `data_missing`, `calibration_out_of_range`, `compute_timeout`, `internal`
- Web routes:
  - `/explorer`
  - `/runs/:id`
  - `/reports/:id/provenance`
  - plus index routes `/runs` and `/artifacts`

## Tech Stack
- Python 3.11+
- FastAPI
- SQLite
- JSON Schema validation
- Vanilla JS + server-rendered templates

## Project Layout
- `app/main.py` - app factory and route mounting
- `app/api/routes.py` - API endpoints
- `app/orchestrator.py` - queue/work orchestration and report assembly
- `app/run_queue.py` - background job queue
- `app/db.py` - persistence layer
- `app/modules/` - hardware/interconnect/runtime/orchestration/energy estimators
- `app/static/` + `app/templates/` - UI
- `artifacts/coefficients.v1.json` - deterministic coefficient artifact
- `contracts/v1/` - versioned contract schemas
- `tests/` - contract/module/integration tests

## Run Locally
1. Create a venv and install dependencies.
2. Start the app.

```bash
python -m venv .venv
. .venv/Scripts/activate
pip install -e .[dev]
python run.py
```

Then open [http://127.0.0.1:8000/explorer](http://127.0.0.1:8000/explorer).

## API Summary
- `GET /api/health`
- `GET /api/presets`
- `POST /api/validate-scenario`
- `POST /api/runs`
- `GET /api/runs`
- `GET /api/runs/{run_id}`
- `GET /api/reports`
- `GET /api/reports/{report_id}`
- `GET /api/reports/{report_id}/provenance`
- `GET /api/reports/{report_id}/bundle`

## Running Tests
```bash
pytest
```

## Included Planning Artifacts
- `docs/PLAN.md` - approved architecture and design plan
- `docs/TEST_PLAN.md` - eng-review test plan
- `TODOS.md` - roadmap and deferred work
