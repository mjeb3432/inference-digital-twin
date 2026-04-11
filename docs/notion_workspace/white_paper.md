# White Paper: Forge Data Center Open Source Project (V1)

Back to workspace landing: https://www.notion.so/Forge-Data-Center-Open-Source-Public-Workspace-3324a1784e5980bc87b8fc9c32645c96

## Executive Summary

Forge Data Center Open Source Project is a decision and simulation workspace for planning modern AI inference data centers. It combines a phase-based planning surface (Forge) with a deterministic digital twin engine (Inference Digital Twin) so users can test infrastructure, serving, and operations tradeoffs before committing real spend.

V1 is intentionally transparent. It does not hide assumptions in a black-box model. Instead, it uses explicit formulas, bounded constraints, and provenance metadata so each output can be audited and reproduced.

The system is built to answer one practical question: if we change a specific input (power mix, cooling method, GPU class, interconnect strategy, runtime mode, orchestration policy), what happens to user-facing latency, throughput, concurrency, and total cost?

## Why This Project Exists

AI infrastructure teams are frequently split across multiple tools and ownership boundaries:

- Real estate and permitting teams optimize location and timeline.
- Power and facilities teams optimize reliability and PUE.
- Platform teams optimize runtime and orchestration.
- Product teams optimize user latency and unit economics.

Most planning workflows treat these as separate tracks and connect them late. That leads to surprises: capacity targets fail under real cooling/power constraints, network topology erodes expected throughput, or cost models diverge from operating reality.

Forge exists to move these cross-layer interactions forward in the planning process.

## Product Surfaces in V1

### 1) Forge Build Simulation (`/forge`)

A phase-gated planning experience that models the data center lifecycle from site and permitting to full facility benchmark outcomes.

Primary capabilities:

- Eight decision phases with completion gates
- Continuous recalculation of economic and performance outputs
- Hard validation checks for infeasible states
- Export/import scenario and event logs

### 2) Inference Digital Twin (`/explorer` + API)

A deterministic backend run system that accepts versioned scenario contracts and emits versioned prediction reports.

Primary capabilities:

- Contract validation (`ScenarioSpec.v1`)
- Canonical hashing for reproducible run identity
- Fixed module execution order
- Content-addressed cache
- Provenance-rich `PredictionReport.v1` responses

## Modeling Philosophy

V1 follows four principles:

1. Directional correctness over false precision.
2. Deterministic execution over stochastic convenience.
3. Inspectable assumptions over hidden priors.
4. Reproducible outputs over one-off dashboard snapshots.

The system is first-order by design. It is not a packet-level network simulator, CFD model, or hardware vendor benchmark oracle.

## The Core System: Scenario Matrix V1

The phase matrix is a dependency graph, not a form.

1. Site selection and permitting
2. Power procurement and resilience
3. Fiber and carrier strategy
4. Facility shell, cooling, and electrical architecture
5. Compute stack design
6. Scale-out interconnect and external bandwidth
7. DCIM and maintenance posture
8. Facility complete with live benchmark and visual modes

A phase cannot be confirmed unless required decisions are complete and constraints pass. This prevents invalid scenario states from being treated as legitimate plans.

## Formula Architecture (High-Level)

V1 uses explicit equations for each domain.

- Site: acreage-driven capacity envelope and permit cost/time estimates
- Power: weighted blend rate and source CAPEX under redundancy and UPS policy
- Facility: PUE-constrained IT load
- Compute: rack limits from both power and footprint
- Network: topology-driven switch count and scale penalty
- Operations: health and uptime projections from monitoring/maintenance posture
- Benchmarks: TTFT decomposition + TPS + concurrency + MFU

These formulas are intentionally exposed so users can inspect causality.

## Determinism and Provenance

Every digital twin run includes:

- Scenario hash
- Artifact IDs and versions
- Module versions
- Timestamp
- Commit ID
- Assumptions registry version

This is central to project trust. A decision can be traced back to a specific model state, not only a UI state.

## Why This Matters to End Users

### For operators and infrastructure leads

- Quickly test feasibility before committing procurement paths
- Identify where reliability policy changes materially alter cost
- Compare cluster scale options with explicit network penalty effects

### For platform and serving teams

- Understand which runtime/orchestration choices shift TTFT vs TPS
- Evaluate concurrency ceilings against memory constraints
- Calibrate MFU assumptions instead of treating utilization as fixed

### For product and finance stakeholders

- Translate infra choices into user-visible performance consequences
- Inspect TCO impact over 3-year and 5-year windows
- Run documented scenario comparisons for planning meetings

### For researchers and external collaborators

- Reproduce results from exported scenario + provenance bundles
- Challenge assumptions openly using versioned artifacts
- Compare model behavior across releases without losing traceability

## What V1 Is Not

V1 does not claim to replace production telemetry or detailed engineering tools. It is a planning and decision scaffold.

Specifically, V1 is not:

- A packet-level network simulator
- A CFD thermal model
- A complete market-coverage hardware catalog
- A substitute for final detailed engineering design reviews

## What Success Looks Like

A strong V1 usage pattern is comparative:

- Define 2-4 realistic scenario candidates
- Hold shared assumptions constant
- Vary one strategic dimension at a time
- Compare TTFT, TPS, concurrency, CAPEX, OPEX, and risk posture
- Capture decision rationale in reusable artifacts

If teams leave a review with a clear choice, an explicit assumption set, and a reproducible report, V1 did its job.

## Roadmap Direction

Post-V1 work focuses on:

- Higher interconnect fidelity
- Expanded calibration data quality and coverage
- Stronger scenario pack compatibility tooling
- Deeper reproducibility and publication workflows

The long-term goal is an open, inspectable research-grade planning platform for AI inference infrastructure.

## Source Notes

External context used for V1 economic framing and market assumptions includes EIA, JLL, and Cushman & Wakefield references already linked in the project documentation.
