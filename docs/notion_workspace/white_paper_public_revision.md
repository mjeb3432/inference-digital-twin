# White Paper - Forge Data Center v1 (Public Revision)

Back to workspace landing: https://www.notion.so/Forge-Data-Center-Open-Source-Public-Workspace-3324a1784e5980bc87b8fc9c32645c96

## 1) Gstack First: Why V1 Looks the Way It Does

This project was built with a Gstack-style constraint: if a number can change a major infrastructure decision, that number must be inspectable, reproducible, and tied to a declared assumption.

That single rule shaped the entire architecture. Instead of an opaque optimizer, V1 is a deterministic decision engine with:

- hard phase gates in the Forge build surface
- strict contract validation in the Digital Twin
- content-addressed caching based on scenario identity
- provenance attached to every report

The practical outcome is trust under pressure. Infra, platform, and finance can review the same run, inspect exactly what changed, and understand whether the output is safe to act on.

## 2) What V1 Actually Is

V1 is two connected products:

1. Forge (`/forge`) - an article-style, phase-locked data center build simulator
2. Inference Digital Twin (`/explorer` + API) - a contract-driven run pipeline that produces deterministic prediction reports

Forge is the planning narrative and decision interface. The Digital Twin is the reproducibility and model execution engine. They share one philosophy: first-order equations, explicit constraints, and transparent assumptions.

## 3) Scenario Matrix v1: Structured Decisions, Not a Form

The scenario matrix is encoded as an eight-phase dependency graph:

1. Site selection and permitting
2. Power procurement and resilience
3. Fiber and carrier strategy
4. Facility shell, cooling, and electrical architecture
5. Compute stack design
6. Scale-out interconnect and external bandwidth
7. DCIM and maintenance posture
8. Facility complete with benchmark + map/floor views

A phase can only be confirmed when required decisions are present (`isPhaseComplete`) and validation errors are clear (`confirm` is disabled when blocked). This is deliberate: V1 refuses to present invalid plans as polished outputs.

## 4) How the Core Formulas Work

### 4.1 Forge economics and facility formulas

Forge continuously recalculates cross-domain outcomes in `recalcAll()`.

Site envelope and permitting:

- `site_max_mw = acreage * city.maxMwPerAcre` (bounded by city profile)
- permit cost is clamped with permit-track and city adders

Power mix and resilience:

- power shares must sum to 100%
- blended power rate is weighted by source mix
- power CAPEX is weighted by source share, then multiplied by redundancy tier and UPS policy

Cooling, PUE, and usable IT load:

- PUE is computed from selected cooling range midpoint plus architecture adjustment
- IT kW is `procured_kW / PUE`

Rack and compute envelope:

- rack count is bounded by both power and footprint
- compute capacity scales from rack count, GPUs per rack, and GPU performance factor

Network scale penalty:

- switch count and aggregate bandwidth scale with node count and fabric profile
- network penalty grows logarithmically with node scale and fabric latency

Operations health and uptime:

- health score combines redundancy, monitoring, maintenance, telemetry, grid stress, and network pressure
- uptime is bounded and adjusted by tier, maintenance posture, and telemetry

Cost rollups:

- total CAPEX and annual OPEX are built from explicit component ledgers
- `tco_3yr = capex + 3 * annual_opex`
- `tco_5yr = capex + 5 * annual_opex`

### 4.2 Forge benchmark formulas (Phase 8)

`recalcBenchmarks()` decomposes user-facing latency and throughput:

- `ttft = rtt + queue + prefill + first_token_decode`
- peak TPS derives from FLOPs, MFU, model parameters, and precision bytes
- achieved TPS is bounded by output-length, concurrency, and KV pressure penalties
- concurrency ceiling is VRAM-bounded from model memory and KV cache per request
- MFU can be model-derived or calibrated from assumed observed TPS

This separation is important for users: it shows whether a slowdown comes from transport, queueing, model prefill, decode, or memory pressure.

### 4.3 Digital Twin module pipeline formulas

The backend executes a fixed module sequence:

`hardware -> interconnect -> runtime -> orchestration -> energy`

Hardware module:

- TTFT and TPOT start from base coefficients, adjusted by GPU performance factor and precision factor
- TPS and concurrency scale with GPU count and calibrated coefficient multipliers

Interconnect module:

- latency multiplier from topology profile, inter-node fabric, and intra-node fabric
- throughput multiplier is inverse latency-bounded

Runtime module:

- tensor/pipeline parallelism create gain and memory penalty terms
- batching strategy and runtime coefficients scale TPS and concurrency
- MFU utilization estimate includes precision, kernel mode, and CUDA graphs effects

Orchestration module:

- saturation is driven by burst QPS vs upstream concurrency
- throughput de-rates with saturation; TTFT rises with saturation
- placement and autoscaling policies influence utilization outcome

Energy module:

- power uses GPU watts, GPU count, node count, PUE, and platform overhead
- hourly cost combines power price and infra hourly cost per GPU
- carbon rate derives from primary energy source and renewable share adjustment

## 5) Determinism, Contracts, and Provenance by Design

The Digital Twin is intentionally strict:

- scenarios must validate against `ScenarioSpec.v1`
- module envelopes validate against `ModuleInput.v1` and `ModuleOutput.v1`
- reports validate against `PredictionReport.v1`
- all contracts are strict (`additionalProperties: false`)

Scenario hashing is canonicalized and SHA-256 based, so semantically identical scenarios produce identical hashes regardless of field order. Cache keys include scenario hash plus artifact and module version fingerprints, which prevents stale cross-version cache collisions.

Each report includes provenance fields for:

- scenario hash
- artifact IDs and versions
- module versions
- timestamp
- commit ID
- assumptions registry version

Why this matters: users can rerun, audit, and defend decisions with exact model identity.

## 6) Design and Implementation Decisions We Made (And Why)

### Decision A: First-order formulas over black-box models

Why: V1 is a planning and tradeoff engine, not a production telemetry replacement. First-order formulas are faster to inspect, challenge, and iterate.

User impact: stakeholders can trace movement in outputs to specific levers instead of accepting unexplained model behavior.

### Decision B: Hard phase gating

Why: invalid combinations create false confidence. Gating keeps the planning state structurally coherent.

User impact: fewer expensive downstream reversals from impossible or under-specified plans.

### Decision C: Versioned calibration artifacts

Why: assumptions drift over time; coefficients must be explicit and versioned.

User impact: cross-run comparison stays meaningful because changes in artifact/version are visible.

### Decision D: Deterministic cache keyed by scenario + model identity

Why: repeated identical runs should be fast, but never ambiguous.

User impact: faster iteration loops without sacrificing reproducibility.

### Decision E: Provenance and limitations in every report

Why: planning outputs are often consumed out of context.

User impact: teams can see what the model does not claim, reducing over-interpretation risk.

## 7) Assumptions and Source Matrix (Where Assumptions Come From)

V1 assumptions come from four channels:

1. Contract constraints (schema-defined boundaries)
2. Artifact coefficients (versioned calibration values)
3. Code-level priors and clamps (first-order modeling choices)
4. External cost/market references captured in source comments

### Internal source anchors

- Forge equations and phase logic: `app/static/forge.js`
- Digital Twin orchestration and report assembly: `app/orchestrator.py`
- Module equations: `app/modules/hardware.py`, `interconnect.py`, `runtime.py`, `orchestration.py`, `energy.py`
- Coefficient artifact: `artifacts/coefficients.v1.json`
- Contracts and strict schema bounds: `contracts/v1/*.json`
- Canonical hashing: `app/hashing.py`

### External references captured in project assumptions

The Forge source comments document the economic reference set (captured March 28, 2026):

- EIA utility-scale generator costs: https://www.eia.gov/electricity/annual/table.php?t=epa_08_04
- EIA commercial electricity price: https://www.eia.gov/electricity/sales_revenue_price/pdf/table_13.pdf
- JLL data center and AI infrastructure report: https://www.jll.com/en-us/insights/data-centers-and-ai-infrastructure-report
- Cushman & Wakefield development cost guide: https://cushwake.cld.bz/Data-Center-Development-Cost-Guide-2025

These references are used as cost-basis anchors and then expressed as explicit constants in code.

## 8) Why This Matters to Users

### Infra and facilities teams

- identify feasibility issues early (power, cooling, floor, resilience)
- compare reliability posture against cost impact with explicit equations

### Platform and serving teams

- separate TTFT vs TPS bottlenecks and test runtime/orchestration strategies
- reason about memory and concurrency constraints before deployment planning

### Finance and strategy stakeholders

- inspect CAPEX/OPEX/TCO sensitivity to power mix and architecture choices
- evaluate tradeoffs with transparent assumptions rather than hidden estimates

### External collaborators and open-source contributors

- reproduce results from scenario + provenance bundles
- challenge assumptions with evidence and propose artifact updates cleanly

## 9) What V1 Is and Is Not

V1 is:

- deterministic
- auditable
- first-order
- optimized for comparative planning decisions

V1 is not:

- a packet-level network simulator
- a full CFD thermal model
- a replacement for production observability
- a final engineering sign-off tool

That boundary is intentional. The product is designed to reduce decision risk early, not pretend to eliminate uncertainty.

## 10) Practical Reading and Usage Path

For a new user:

1. Start with `Project Overview and Functionality`
2. Read this white paper end-to-end
3. Use `Scenario Matrix v1 Guide`
4. Review `Formula and Assumptions Reference`
5. Use `How To Build a Data Center - Deep Dive` and domain deep dives
6. Adopt templates from `Artifacts and Tools Workspace` before major decisions

When used this way, V1 becomes a high-clarity decision system: teams can move fast, compare options rigorously, and keep their assumptions inspectable.
