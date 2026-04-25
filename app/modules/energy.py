"""Energy module — physics-based power, cost, and carbon.

Replaces the prior `tdp × count × pue` with a calculation that respects:

  * GPU power scales with utilisation, not TDP. An idle H100 draws ~80 W;
    at 100 % util it draws TDP. We use a published linear-with-floor curve.
  * PUE is itself a function of load. Real data centres have PUE close to
    2.0 at low load (cooling overhead is fixed) and PUE ≈ 1.15-1.30 at
    full load. We blend the configured PUE between an idle-PUE floor and
    the rated PUE.
  * Platform overhead (CPU host, NIC, disk, NVMe, PSU loss) lives in the
    coefficients file so that calibration can move it.
  * Carbon intensity respects the renewable share AND the time-matched
    portion (i.e. a 30 % renewable share doesn't reduce coal-grid carbon
    in the same proportion if the renewables aren't 24/7 matched).
"""

from __future__ import annotations

import math

from app.modules.common import ModuleResult, metric


# ---------------------------------------------------------------------------
# Per-GPU power model: idle floor (W), TDP (W).
# ---------------------------------------------------------------------------
# fmt: off
GPU_POWER: dict[str, dict[str, float]] = {
    "a100": {"idle_w":  60.0,  "tdp_w":  400.0},
    "h100": {"idle_w":  85.0,  "tdp_w":  700.0},
    "h200": {"idle_w":  85.0,  "tdp_w":  700.0},
    "b200": {"idle_w": 120.0,  "tdp_w": 1000.0},
}
# fmt: on


# Carbon intensity by primary energy source (kg CO2e / kWh, well-to-wire).
# Sources: IEA Electricity Data (2024), EPA eGRID 2023.
CARBON_INTENSITY_KG_PER_KWH: dict[str, float] = {
    "grid":          0.41,   # average US grid mix
    "natural_gas":   0.49,   # combined-cycle peaker
    "coal":          0.96,
    "solar":         0.045,
    "wind":          0.011,
    "hydro":         0.024,
    "nuclear":       0.012,
    "battery_hybrid":0.18,
    "smr":           0.012,  # nuclear small modular reactor
}


def _gpu_power_at_util(gpu_sku: str, utilisation_pct: float) -> float:
    """Linear interp from idle floor at 0 % to TDP at 100 %, clamped."""
    spec = GPU_POWER.get(gpu_sku.lower(), GPU_POWER["a100"])
    u = max(0.0, min(100.0, utilisation_pct)) / 100.0
    return spec["idle_w"] + (spec["tdp_w"] - spec["idle_w"]) * u


def _effective_pue(rated_pue: float, utilisation_pct: float) -> float:
    """Blend rated PUE (at full load) with an idle-PUE floor.

    Cooling and lighting are largely fixed-overhead. So at low IT load
    the PUE is much worse than the design point. We model:
      PUE(u) = rated_pue + (1 - u) × pue_overhead_idle_bonus
    With pue_overhead_idle_bonus = 0.6 (so idle PUE is rated + 0.6).
    """
    u = max(0.0, min(100.0, utilisation_pct)) / 100.0
    return rated_pue + (1.0 - u) * 0.6


def run(input_payload: dict, coefficients: dict, upstream: dict[str, dict]) -> ModuleResult:
    hardware = input_payload["hardware"]
    environment = input_payload.get("environment", {})
    energy_system = input_payload.get("energy_system", {})

    gpu_sku = str(hardware.get("gpu_sku", "a100")).lower()
    gpu_count = int(hardware.get("gpu_count", 1))
    node_count = int(hardware.get("node_count", 1))
    total_gpus = max(1, gpu_count * node_count)

    # Utilisation drives both per-GPU power and PUE
    util_pct = float(upstream.get("gpu_utilization_pct", {}).get("value", 70.0))
    rated_pue = float(environment.get("pue", 1.2))
    power_price = float(environment.get("power_price_usd_per_kwh", 0.13))

    # GPU draw at utilisation
    per_gpu_w = _gpu_power_at_util(gpu_sku, util_pct)
    gpu_cluster_w = per_gpu_w * total_gpus

    # Platform overhead (CPU host, NICs, NVMe, PSU loss). Coefficient lets
    # calibration tune this. Default ~220 W per node for a 8-GPU server.
    platform_overhead_w = float(coefficients.get("platform_overhead_watts", 220.0)) * node_count

    it_load_w = gpu_cluster_w + platform_overhead_w
    eff_pue = _effective_pue(rated_pue, util_pct)
    facility_load_w = it_load_w * eff_pue

    # Cost per hour
    cost_power_usd_per_hr = (facility_load_w / 1000.0) * power_price
    infra_cost_usd_per_hr = float(coefficients.get("infrastructure_usd_per_hour_per_gpu", 0.32)) * total_gpus
    cost_total_usd_per_hr = cost_power_usd_per_hr + infra_cost_usd_per_hr

    # Carbon
    primary_source = str(energy_system.get("primary_source", "grid")).lower()
    renewable_share_pct = float(energy_system.get("renewable_share_pct", 18.0))
    renewable_share_pct = max(0.0, min(100.0, renewable_share_pct))
    onsite_battery_h = float(energy_system.get("onsite_storage_hours", 0.0))

    base_carbon = CARBON_INTENSITY_KG_PER_KWH.get(primary_source, CARBON_INTENSITY_KG_PER_KWH["grid"])
    # Time-matched renewable share is more impactful than book-and-claim.
    # Battery hours close the gap; without storage, max night-time match is
    # ~50 % of nameplate. We model effective offset as:
    #   eff_offset = renewable_share × (0.5 + 0.5 × min(1, onsite_battery_h / 4))
    storage_factor = 0.5 + 0.5 * min(1.0, onsite_battery_h / 4.0)
    effective_offset = (renewable_share_pct / 100.0) * storage_factor
    effective_carbon_kg_per_kwh = max(0.005, base_carbon * (1.0 - effective_offset))

    carbon_kg_per_hour = (facility_load_w / 1000.0) * effective_carbon_kg_per_kwh

    return ModuleResult(
        status="success",
        metrics={
            "power_watts": metric(facility_load_w, "watts", spread=0.08),
            "cost_usd_per_hour": metric(cost_total_usd_per_hr, "usd_per_hour", spread=0.08),
            "carbon_kg_per_hour": metric(carbon_kg_per_hour, "kg_per_hour", spread=0.10),
            "renewable_share_pct": metric(renewable_share_pct, "percent", spread=0.04),
        },
    )
