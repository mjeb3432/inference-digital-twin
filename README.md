# Inference Digital Twin

**Simulate before you spend.** The Inference Digital Twin lets infrastructure teams model an AI data center end-to-end — site, power, cooling, compute, networking, and operations — then run inference benchmarks against it before a single rack ships.

A web app, built by [Watt-Bit Research](https://github.com/mjeb3432).

---

## Quick Start

**Requirements:** [Python 3.11+](https://www.python.org/downloads/) and [Git](https://git-scm.com/downloads).

```bash
git clone https://github.com/mjeb3432/inference-digital-twin.git
cd inference-digital-twin
pip install -e .
python run.py
```

The browser opens automatically. If it doesn't, go to **[http://127.0.0.1:8000/forge](http://127.0.0.1:8000/forge)**.

> **Web-only.** The Forge runs in your browser against the local FastAPI server — there is no native desktop build.

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

When you reach Phase 8 the facility goes online with a live 3D model — toggle between **3D MODEL** (orbit-camera Three.js scene with the building, outdoor power yard, fiber, IXP uplink, cooling, telemetry scan, and atmospheric polish) and **2D PLAN** (the legacy architectural blueprint).

---

## How the Simulation Works

The prediction engine is a five-stage module pipeline. Each stage takes the scenario inputs and the upstream stage's output, applies physics-based formulas grounded in the leading research, and passes metrics forward:

```
Hardware → Interconnect → Runtime → Orchestration → Energy
```

| Module | Predicts | Key references |
|--------|----------|----------------|
| **Hardware** | Prefill TTFT (compute-bound), decode TPOT (HBM-bandwidth-bound), KV-cache concurrency | Kaplan et al. 2020, Chinchilla, vLLM SOSP 2023, FlashAttention-2 |
| **Interconnect** | TP all-reduce cost (ring formula), pipeline send/recv hops, fabric bandwidth | Megatron-LM, Patarasuk08, GPipe |
| **Runtime** | TP/PP efficiency curves, continuous-batching gain, MFU | vLLM Fig. 7, TensorRT-LLM benchmarks, Roofline (Williams 2009) |
| **Orchestration** | M/M/c queue dynamics, Erlang-C wait time, GPU utilisation | Erlang 1917, Kleinrock 1975 |
| **Energy** | GPU power vs utilisation (sub-linear DVFS), PUE-vs-load curves, time-matched carbon | NVIDIA Hopper whitepaper, Uptime Institute 2023, Google 24/7 CFE |

All formulas are calibrated to published vLLM / TensorRT-LLM Llama-3 benchmarks. Coefficients live in `artifacts/coefficients.v1.json` and are versioned alongside the code. Reports include SHA-256 content hashes for reproducibility.

---

## Project Structure

```
app/               FastAPI backend
  api/             REST API endpoints (/api/runs, /api/reports, /api/health)
  modules/         Simulation pipeline (hardware, interconnect, runtime, orchestration, energy)
  services.py      Lazy-init service layer — UI loads instantly, backend warms in background
  templates/       Jinja2 HTML (Forge, Dashboard, Control Room, Explorer, Runs, Artifacts, Provenance)
  static/          CSS, JS, WebGL2 intro overlay, geographic data
contracts/v1/      Versioned JSON Schema contracts
artifacts/         Deterministic coefficient files
web/               Next.js web frontend (React + Tailwind, connects to FastAPI via CORS)
tests/             48 tests (contracts, modules, integration, frontend regressions)
run.py             Start the web server at http://localhost:8000
```

---

## Running Tests

```bash
pip install -e ".[dev]"
pytest
```

---

## Optional: Next.js client

A parallel Next.js client lives in `web/` for teams who want a richer SPA. It connects to the FastAPI backend via CORS — the FastAPI server must be running.

```bash
# Terminal 1
python run.py

# Terminal 2
cd web
npm install
npm run dev
```

Then open **[http://localhost:3000](http://localhost:3000)**.

The Jinja template served from `/forge` is the canonical UI; the Next.js client is for teams who want to extend it.

---

## License

See repository for license details.
