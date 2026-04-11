# Inference Digital Twin

A desktop application for simulating AI data center infrastructure decisions — from site selection and power through cooling, compute, networking, and DCIM — with live inference benchmarks in an interactive world-map view.

Built by [Watt-Bit Research](https://github.com/mjeb3432).

## Getting Started

**Requirements:** Python 3.11 or higher. [Download Python](https://www.python.org/downloads/)

### Install & Run

```bash
git clone https://github.com/mjeb3432/inference-digital-twin.git
cd inference-digital-twin
pip install -e ".[desktop]"
python -m desktop.desktop_main
```

That's it. The app handles everything else — a local server starts in the background automatically and The Forge opens in a native window.

> **Already installed?** Just run `python -m desktop.desktop_main` from the project directory.

### One-Click Launch (Windows)

Double-click `launch.bat` in the project root. It activates the virtual environment and starts the app.

### Build a Standalone .exe

```bash
pyinstaller desktop_main.spec
```

The output is `dist/InferenceDigitalTwin.exe` — a single file you can share with anyone. No Python install required on their machine.

## What's Inside

**The Forge** is the main experience — an 8-phase interactive simulator where you design an AI data center from scratch and benchmark its inference performance (TTFT, TPS, Concurrency, MFU) in real time.

The app also includes:

- **Explorer** — browse and filter prediction reports across scenarios
- **Runs & Artifacts** — async simulation pipeline with content-addressed caching
- **Provenance** — full audit trail for every prediction (inputs, hashes, coefficients)

## Tech Stack

Python 3.11+ / FastAPI / SQLite / PyQt6 / Vanilla JS / PyInstaller

## Project Layout

```
desktop/              Desktop app (entry point, screens, assets)
app/                  FastAPI backend (API, modules, templates, static)
contracts/v1/         Versioned JSON Schema contracts
artifacts/            Deterministic coefficient files
docs/                 Architecture plans, deep dives, knowledge base
tests/                Contract, module, integration, and frontend tests
```

## Running Tests

```bash
pip install -e ".[dev]"
pytest
```

## Documentation

| Document | What it covers |
|----------|---------------|
| `docs/PLAN.md` | Architecture and design plan |
| `docs/TEST_PLAN.md` | Test strategy |
| `docs/notion_workspace/` | Deep dives, formulas, risk register |
| `DESIGN.md` | Design system (typography, colors, spacing) |
| `CHANGELOG.md` | Version history |
