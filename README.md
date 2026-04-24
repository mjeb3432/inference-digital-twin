# Inference Digital Twin

**Simulate before you spend.** The Inference Digital Twin lets infrastructure teams model an AI data center end-to-end — site, power, cooling, compute, networking, and operations — then run inference benchmarks against it before a single rack ships.

Built by [Watt-Bit Research](https://github.com/mjeb3432).

---

## Quick Start

**Requirements:** [Python 3.11+](https://www.python.org/downloads/) and [Git](https://git-scm.com/downloads).

### Option A — Browser (recommended)

```bash
git clone https://github.com/mjeb3432/inference-digital-twin.git
cd inference-digital-twin
pip install -e .
python run.py
```

Open **[http://localhost:8000/forge](http://localhost:8000/forge)** in your browser.

### Option B — Desktop app (Windows, macOS, Linux)

Runs The Forge in a native window with an opening intro sequence. Requires PyQt6.

```bash
pip install -e ".[desktop]"
python -m desktop.desktop_main
```

### Option C — Windows one-click

Double-click **`launch.bat`** in the project folder. It creates a virtual environment, installs everything, and launches the desktop app automatically. No terminal needed.

---

## What It Does

The core of the application is **The Forge**, an interactive 8-phase simulator where you make real infrastructure decisions and see their performance, cost, and carbon impact in real time:

1. **Site & Workload** — pick a city from the world map, choose your inference workload profile
2. **Power** — select energy source, PUE target, renewable mix
3. **Cooling** — air, liquid, immersion — each with different efficiency curves
4. **Compute** — GPU SKU (A100 → B200), count per node, node count
5. **Networking** — topology (leaf-spine / fat-tree), fabric (Ethernet / InfiniBand), intra-node (NVLink)
6. **Runtime** — tensor/pipeline parallelism, batching strategy, precision, CUDA graphs
7. **Orchestration** — placement strategy, autoscaling policy, traffic profile
8. **Results** — live benchmarks: TTFT, TPS, Concurrency, MFU, GPU utilization, power draw, cost/hour, carbon/hour

Every prediction is versioned, content-hashed, and traceable through a full provenance chain.

---

## How the Simulation Works

The prediction engine is a five-stage module pipeline. Each stage takes the scenario inputs and the upstream stage's output, applies physics-informed coefficients, and passes metrics forward:

```
Hardware → Interconnect → Runtime → Orchestration → Energy
```

| Module | Predicts |
|--------|----------|
| **Hardware** | Base TTFT, TPOT, TPS, and concurrency from GPU SKU, count, and precision |
| **Interconnect** | Latency and throughput impact of topology, fabric, and NVLink |
| **Runtime** | Parallelism gains, batching efficiency, MFU from TP/PP/precision/kernels |
| **Orchestration** | Placement efficiency, autoscaling impact, saturation-adjusted throughput |
| **Energy** | Total power draw, cost per hour, carbon emissions from energy mix and PUE |

All coefficients are stored in `artifacts/coefficients.v1.json` and versioned alongside the code. Reports include SHA-256 content hashes for reproducibility.

---

## Project Structure

```
app/               FastAPI backend
  api/             REST API endpoints (/api/runs, /api/reports, /api/health)
  modules/         Simulation pipeline (hardware, interconnect, runtime, orchestration, energy)
  services.py      Lazy-init service layer — UI loads instantly, backend warms in background
  templates/       Jinja2 HTML (Forge, Explorer, Runs, Artifacts, Provenance)
  static/          CSS, JS, intro overlay (intro.css / intro.js), geographic data
contracts/v1/      Versioned JSON Schema contracts
artifacts/         Deterministic coefficient files
desktop/           Native desktop wrapper (PyQt6 + QWebEngineView)
  screens/         Opening animation, logo reveal, main browser window
  assets/          Sprite sheets, Watt-Bit icons
web/               Next.js web frontend (React + Tailwind, connects to FastAPI via CORS)
tests/             34 tests (contracts, modules, integration, frontend regressions)
run.py             Start the web server at http://localhost:8000
launch.bat         Windows one-click launcher (auto-creates venv on first run)
```

---

## Running Tests

```bash
pip install -e ".[dev]"
pytest
```

---

## Web Frontend (Next.js)

A parallel Next.js client lives in `web/`. It connects to the FastAPI backend via CORS.

```bash
cd web
npm install
npm run dev
```

Open **[http://localhost:3000](http://localhost:3000)**. The FastAPI server must also be running (`python run.py` in the project root).

---

## License

See repository for license details.
