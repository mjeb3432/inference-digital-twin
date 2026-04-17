# Forge Data Center Open source project

## Gstack First: Why V1 Has This Shape

The V1 system was built with a Gstack-style operating constraint: if a number influences a major infra decision, that number must be inspectable, reproducible, and tied to a declared assumption.

That pushed the project toward deterministic contracts and away from opaque simulation magic. Instead of a black-box optimizer, V1 is a transparent decision engine with explicit phase gates, bounded formulas, and provenance metadata attached to every run.

This matters because the target decisions are expensive and cross-functional. Infrastructure, platform, and finance teams need to inspect the same output and understand what changed, why it changed, and whether they can trust the movement.

## What V1 Actually Is

V1 is two connected products:

1. `Forge` (`/forge`): an article-style, phase-locked data center build simulation.
2. `Inference Digital Twin` (`/explorer` + API): a contract-driven run pipeline that produces deterministic prediction reports.

Forge is the guided narrative surface. The Digital Twin is the reproducibility engine. They share the same modeling philosophy: first-order, auditable formulas with explicit limits.

## Scenario Matrix V1: Decision Graph, Not a Questionnaire

Scenario Matrix V1 is implemented as eight gated phases, each with required decisions and validation constraints.

1. Site selection and permitting
2. Power procurement and resilience
3. Fiber and carrier strategy
4. Facility shell, cooling, and electrical architecture
5. Compute stack design
6. Scale-out interconnect and external bandwidth
7. DCIM and maintenance posture
8. Facility complete with benchmark + map/floor views

Phase completion is not cosmetic. The confirm action is blocked unless:

- Required decisions for that phase exist (`app/static/forge.js:1956-1963`)
- No validation errors remain (`app/static/forge.js:1132-1136`)

This lock behavior keeps the model from producing polished but structurally invalid outputs.

## Forge Formula Walkthrough (Detailed)

The central Forge recalculation path is `recalcAll()` in `app/static/forge.js:1402-1758`.

### Phase 1 assumptions: site envelope and permitting

Site power envelope is acreage-based and city-adjusted:

```text
mw_per_acre = city.maxMwPerAcre else 1.8
site_max_mw = acreage * mw_per_acre
```

Permit cost is bounded:

```text
permit_cost = clamp(
  acreage*5500 + permit_track_add + city_permit_add,
  50,000,
  2,000,000
)
```

(See `forge.js:1413-1424`.)

Decision implication for users: early land and jurisdiction choices are hard constraints, not presentation metadata.

### Phase 2 assumptions: power mix, reliability, and UPS economics

Power shares are normalized to 100% (`forge.js:1388-1400`), then blended rates and source CAPEX are weighted by share:

```text
blended_rate_mwh = sum(pct * source_rate_mwh)
power_capex_raw = sum(target_kw * pct * source_capex_kw)
power_capex = power_capex_raw * tier_multiplier + target_kw * ups_capex_kw
```

(See `forge.js:1449-1457`.)

Decision implication for users: reliability policy directly multiplies cost; redundancy is not a checkbox add-on.

### Phase 3 assumptions: network quality and latency

Carrier selection drives quality average and latency:

```text
latency_ms = clamp(ixp_latency + (1 - quality_avg)*8 + workload_demand_adjust, 1, 35)
```

(See `forge.js:1462-1474`.)

There is also a hard resiliency gate: at least two carriers from phase 3 onward (`forge.js:1467-1469`, `1959`).

Decision implication for users: low-cost single-carrier plans are intentionally blocked once network risk becomes operationally material.

### Phase 4 assumptions: cooling, architecture, and IT power after PUE

PUE is selected from cooling range midpoint and architecture adjustment:

```text
pue = clamp(cooling_midpoint - hvdc_credit, 1.05, 2.1)
it_kw = procured_kw / pue
```

(See `forge.js:1489-1493`.)

Decision implication for users: procured megawatts are not equivalent to usable compute megawatts.

### Phase 5 assumptions: rack density, physical/power limits, compute

Rack count is constrained by both power and footprint:

```text
power_limited_racks = floor((it_kw * 0.78) / rack_kw)
footprint_limited_racks = floor(acreage * 22)
rack_count = min(power_limited_racks, footprint_limited_racks)
```

(See `forge.js:1504-1507`.)

Total compute is then:

```text
total_tflops = rack_count * gpus_per_rack * gpu_pf * 1000
```

(See `forge.js:1512-1514`.)

Decision implication for users: a GPU selection can be financially attractive but physically impossible at the chosen cooling/power architecture.

### Phase 6 assumptions: scale-out topology and network penalty

Switch count and effective throughput scale with node count:

```text
switch_count = ceil(nodes/32)*2 + max(2, ceil(nodes/96))
aggregate_gbps = per_link_gbps * num_links * topology_factor
network_penalty = clamp((fabric_us/10) * log2(nodes), 0, 38)
```

(See `forge.js:1553-1561`.)

Decision implication for users: cluster growth has non-linear communication cost; a larger cluster can degrade effective throughput if fabric choices lag.

### Phase 7 assumptions: operations quality, health, uptime

Operational health score:

```text
health = clamp(
  38 + redundancy_bonus + monitoring_score + maintenance_score + telemetry_bonus
  - grid_stress*0.08 - network_penalty*0.3,
  0,
  100
)
```

Uptime projection:

```text
uptime = clamp(
  tier_uptime + maintenance_saved/1000 + telemetry_uplift,
  95,
  99.999
)
```

(See `forge.js:1573-1591`.)

Decision implication for users: operations choices are modeled as first-class performance inputs, not post-launch housekeeping.

### CAPEX/OPEX/TCO assembly

CAPEX and OPEX are built from explicit component ledgers (`forge.js:1644-1675`), then rolled up:

```text
total_capex = sum(capex_breakdown)
annual_opex = sum(opex_breakdown)
tco_3yr = total_capex + annual_opex*3
tco_5yr = total_capex + annual_opex*5
```

(See `forge.js:1677-1689`.)

Decision implication for users: users can inspect exactly which bucket moved instead of arguing over one blended total.

## Phase 8 Benchmark Model (TTFT, TPS, Concurrency, MFU)

Phase 8 unlocks a benchmark decomposition in `recalcBenchmarks()` (`forge.js:1829-1897`).

TTFT is additive:

```text
ttft = rtt_ms + queue_ms + prefill_ms + first_token_decode_ms
```

Where:

- `queue_ms` grows with concurrency pressure (`forge.js:1850`)
- `prefill_ms` scales with prompt tokens and model params (`forge.js:1853`)
- `first_token_decode_ms` scales with model size and GPU class (`forge.js:1854`)

Peak and achieved TPS:

```text
peak_tps = (flops * mfu) / (model_params * 2 * bytes_per_param)
achieved_tps = min(peak_tps, bottleneck_tps_after_output_concurrency_kv_penalties)
```

(See `forge.js:1858-1864`.)

Concurrency ceiling is memory-bound:

```text
max_concurrency = floor((effective_vram - model_memory) / kv_per_request)
```

(See `forge.js:1865-1869`.)

MFU can be model-derived or calibrated with an assumed observed TPS:

```text
mfu_pct = ((observed_tps * model_params * 2) / flops) * 100
```

(See `forge.js:1874-1877`.)

Decision implication for users: V1 separates latency decomposition from throughput decomposition, so teams can diagnose which knob attacks which bottleneck.

## Digital Twin V1: Deterministic Backend Mechanics

The backend enforces reproducible run semantics, not just approximate metrics.

### Contract gating and canonical hash

- Scenarios must satisfy `ScenarioSpec.v1` (`contracts/v1/scenario-spec.v1.schema.json:8-349`)
- Input is canonicalized by sorted keys before hashing (`app/hashing.py:8-23`)

```text
scenario_hash = sha256(canonical_json_bytes)
```

Decision implication for users: two JSON payloads with different key order are the same scenario.

### Artifact compatibility guardrail

Scenario calibration metadata must match loaded artifacts (`app/orchestrator.py:70-87`, `app/artifacts.py:23-40`).

Decision implication for users: no silent mixing of scenario files with incompatible coefficient packs.

### Fixed module order and stage contracts

Execution order is fixed in `app/modules/__init__.py:3-10`:

```text
hardware -> interconnect -> runtime -> orchestration -> energy
```

Each stage validates `ModuleInput.v1` and `ModuleOutput.v1` contracts (`app/orchestrator.py:163-233`).

Decision implication for users: every report follows the same computational path, which makes comparisons meaningful.

### Required report metrics and provenance

`PredictionReport.v1` requires core metrics and provenance (`contracts/v1/prediction-report.v1.schema.json:8-250`).

The orchestrator appends:

- artifact IDs
- module versions
- commit ID
- assumptions registry version
- declared limitations

(`app/orchestrator.py:271-307`)

Decision implication for users: every number has context, version identity, and reproducibility metadata attached.

### Content-addressed cache behavior

Cache key includes scenario hash + artifact version + module version fingerprint (`app/orchestrator.py:62-68`).

Decision implication for users: repeated runs are fast when scientifically identical, but provenance is still preserved per run.

## Digital Twin Module Formula Details

### Hardware (`app/modules/hardware.py:24-34`)

```text
ttft = max(12, base_ttft / (perf_factor * precision_factor))
tpot = max(4, base_tpot / (perf_factor * precision_factor))
tps = max(5, (1000/tpot) * gpu_count * throughput_scale)
concurrency = max(1, gpu_count * perf_factor * concurrency_scale)
```

### Interconnect (`app/modules/interconnect.py:25-35`)

```text
latency_multiplier = topology_penalty * fabric_penalty * intra_bonus
throughput_multiplier = max(0.65, 1/latency_multiplier)
```

### Runtime (`app/modules/runtime.py:27-50`)

```text
parallel_gain = max(1, tp*0.22 + pp*0.12)
memory_penalty = 1 + max(0, tp+pp-4)*0.03
```

Then TTFT/TPOT/TPS/concurrency and MFU utilization are adjusted by batching, kernel mode, precision, and CUDA graphs.

### Orchestration (`app/modules/orchestration.py:24-41`)

```text
saturation = clamp(burst_qps / upstream_concurrency, 0.7, 1.8)
tps = upstream_tps * placement_gain / saturation
ttft = upstream_ttft * saturation
```

### Energy (`app/modules/energy.py:35-50`)

```text
power_watts = gpu_watts * gpu_count * node_count * pue + platform_overhead
cost_usd_per_hour = power_component + infra_component
carbon_kg_per_hour = power_kwh * effective_carbon_factor
```

## Assumptions: Where They Come From and How They Were Set

V1 assumptions come from four channels:

1. Contracted constraints (schema-enforced)
2. Artifact coefficients (versioned calibration constants)
3. Code-level priors (first-order heuristics and clamps)
4. External market/energy references for economic baselines

### Assumption Source Matrix

| Assumption domain | Encoded in V1 | Source/provenance | Why it matters to users |
|---|---|---|---|
| 2024 U.S. commercial electricity baseline at `12.75 c/kWh` (`$127.5/MWh`) | `forge.js` `COST_BASIS.commercialGridUsdPerMWh` (`app/static/forge.js:295-300`) | [EIA 2024 Table 4](https://www.eia.gov/electricity/sales_revenue_price/pdf/table_4.pdf) (U.S. commercial value shown as 12.75) | Annual OPEX and TCO sensitivity are dominated by power price; this anchors economics in a public baseline. |
| Construction cost baseline `11.7M/MW` | `forge.js` `COST_BASIS.avgConstructionUsdPerMw` (`app/static/forge.js:295-300`) | [Cushman & Wakefield 2025 Development Cost Guide](https://cushwake.cld.bz/Data-Center-Development-Cost-Guide-2025) market MW cost bands + project baseline fit | Keeps CAPEX outputs in a realistic market envelope for comparative planning. |
| Power-source CAPEX/rate priors (grid, gas, solar, wind, SMR) | `POWER_SRC` constants (`app/static/forge.js:28-34`) | Internal mapping documented in cost basis comments (`app/static/forge.js:289-294`) referencing EIA generation-cost material | Lets users model generation-mix economics with explicit per-source assumptions. |
| Reliability tier multipliers and uptime priors | `REDUNDANCY` constants (`app/static/forge.js:36-41`) | Project assumption table (code-defined priors) | Changes both reliability projection and CAPEX multiplier; directly affects availability-vs-cost tradeoffs. |
| Cooling/PUE ranges | `COOLING` constants (`app/static/forge.js:81-86`) + PUE equation (`1489`) | Project assumption table (code-defined priors) | Governs IT power after facility overhead, which gates rack count and compute capacity. |
| Rack derate factor `0.78` | `recalcAll` (`app/static/forge.js:1504-1507`) | Modeling choice (first-order planning derate) | Prevents optimistic overcommit; users see realistic headroom instead of peak-nameplate fantasy. |
| Network penalty/log scaling | `recalcAll` (`app/static/forge.js:1553-1561`) | Modeling choice (first-order scaling proxy) | Captures non-linear comms overhead at cluster scale, helping avoid poor scale-out assumptions. |
| Benchmark decomposition (RTT/queue/prefill/decode) | `recalcBenchmarks` (`app/static/forge.js:1850-1856`) | Modeling choice plus stack/GPU priors | Shows users *why* TTFT changed, not only that it changed. |
| Digital Twin coefficient values (`base_ttft_ms`, precision factors, runtime scales, energy overhead) | `artifacts/coefficients.v1.json:12-41` | Versioned artifact `coefficients-core-2026-03/v1` (`artifacts.v1.json:2-4`) | Makes calibration explicit and versioned so teams can compare reports across releases safely. |
| First-order limits declaration | Prediction limitations (`app/orchestrator.py:299-302`) | Product-level scope choice | Prevents users from over-interpreting V1 as packet-level or full CFD simulation. |

### External references used for economic assumptions

- [EIA: 2024 Total Electric Industry - Average Retail Price (Table 4 PDF)](https://www.eia.gov/electricity/sales_revenue_price/pdf/table_4.pdf)
- [EIA: Capital Cost and Performance Characteristics for Utility-Scale Electric Power Generating Technologies (AEO2025)](https://www.eia.gov/analysis/studies/powerplants/capitalcost/pdf/capital_cost_AEO2025.pdf)
- [JLL: 2026 Global Data Center Outlook](https://www.jll.com/en-us/insights/market-outlook/global-data-centers)
- [Cushman & Wakefield: Data Center Development Cost Guide 2025](https://cushwake.cld.bz/Data-Center-Development-Cost-Guide-2025)

## Why This Matters to a User (Practical Outcomes)

### 1) It reduces expensive false confidence

Without explicit assumptions and constraints, users can easily produce plausible-looking outputs from invalid designs. V1 blocks that path with phase gates and validation.

### 2) It turns debate into measurable tradeoffs

When one team pushes lower TTFT and another pushes lower TCO, V1 exposes the exact equation paths and component deltas behind each option.

### 3) It supports reproducible collaboration

A report is not just a screenshot. It includes scenario hash, artifact identity, module versions, and commit ID, so another team can reproduce it.

### 4) It improves decision velocity with guardrails

Users can test alternatives quickly because formulas are lightweight, while still preserving enough constraints to avoid dangerous overreach.

### 5) It makes uncertainty visible instead of hidden

Module metrics include confidence intervals (`app/modules/common.py:13-23`), and the report explicitly states known limitations (`app/orchestrator.py:299-302`).

## Final Take

V1 is intentionally opinionated. It trades maximum physical fidelity for auditability, deterministic behavior, and fast comparative decision support.

That trade is deliberate and useful: users can inspect assumptions, run alternatives, challenge model priors, and make higher-quality infrastructure decisions before committing real capital.

If you want the shortest summary: V1 is not a perfect simulator of reality; it is a transparent and reproducible simulator of *decision consequences*.
