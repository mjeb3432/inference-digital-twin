# Inference Digital Twin

**Simulate before you spend.** The Inference Digital Twin lets infrastructure teams model an AI data center end-to-end — site, power, cooling, compute, networking, and operations — then run inference benchmarks against it before a single rack ships.

Built by [Watt-Bit Research](https://github.com/mjeb3432).

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

## Who It's For

- ML infrastructure engineers evaluating deployment choices
- Platform / SRE teams sizing clusters before procurement
- FinOps teams forecasting cost and carbon at scale
- Anyone who wants to understand how hardware, network, and runtime decisions interact

---

## Installation

**Requirements:** [Python 3.11+](https://www.python.org/downloads/) and [Git](https://git-scm.com/downloads).

### 1. Clone and install

```bash
git clone https://github.com/mjeb3432/inference-digital-twin.git
cd inference-digital-twin
pip install -e ".[desktop]"
```

### 2. Launch

```bash
python -m desktop.desktop_main
```

The app opens with a cinematic Watt-Bit intro sequence, starts a local server in the background, and loads The Forge in a native desktop window. Nothing else to configure.

### Windows one-click

After the first install, double-click **`launch.bat`** in the project folder to start the app instantly.

### Build a portable .exe

```bash
pyinstaller desktop_main.spec
```

Produces `dist/InferenceDigitalTwin.exe` — a single file that runs on any Windows machine without Python installed.

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
desktop/           Desktop application (PyQt6 + QWebEngineView)
  screens/         Opening animation, logo reveal, main browser window
  assets/          Sprite sheets, backgrounds, Watt-Bit icons
app/               FastAPI backend
  modules/         Simulation pipeline (hardware, interconnect, runtime, orchestration, energy)
  api/             REST API endpoints
  templates/       Jinja2 HTML (Forge, Explorer, Runs, Artifacts, Provenance)
  static/          CSS, JS, geographic data
contracts/v1/      Versioned JSON Schema contracts
artifacts/         Deterministic coefficient files
docs/              Architecture plan, test plan, knowledge base
tests/             31 tests (contracts, modules, integration, frontend regressions)
```

## Running Tests

```bash
pip install -e ".[dev]"
pytest
```

## License

See repository for license details.
