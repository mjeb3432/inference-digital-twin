from __future__ import annotations

from app.modules.common import ModuleResult, metric


GPU_WATTS = {
    "a100": 300,
    "h100": 425,
    "h200": 520,
    "b200": 700,
}

CARBON_INTENSITY_KG_PER_KWH = {
    "grid": 0.41,
    "natural_gas": 0.49,
    "solar": 0.06,
    "wind": 0.02,
    "hydro": 0.03,
    "battery_hybrid": 0.17,
}


def run(input_payload: dict, coefficients: dict, upstream: dict[str, dict]) -> ModuleResult:
    hardware = input_payload["hardware"]
    environment = input_payload.get("environment", {})
    energy_system = input_payload.get("energy_system", {})

    gpu_sku = hardware["gpu_sku"].lower()
    gpu_count = hardware["gpu_count"]
    node_count = hardware["node_count"]

    pue = float(environment.get("pue", 1.2))
    power_price = float(environment.get("power_price_usd_per_kwh", 0.13))

    base_gpu_watts = GPU_WATTS.get(gpu_sku, 350)
    cluster_watts = base_gpu_watts * gpu_count * node_count * pue
    platform_overhead = coefficients["platform_overhead_watts"] * node_count
    power_watts = cluster_watts + platform_overhead

    cost_power = (power_watts / 1000) * power_price
    infra_cost = coefficients["infrastructure_usd_per_hour_per_gpu"] * gpu_count * node_count
    cost_total = cost_power + infra_cost

    primary_source = str(energy_system.get("primary_source", "grid")).lower()
    renewable_share = float(energy_system.get("renewable_share_pct", 18.0))
    renewable_share = min(100.0, max(0.0, renewable_share))
    carbon_factor = CARBON_INTENSITY_KG_PER_KWH.get(primary_source, CARBON_INTENSITY_KG_PER_KWH["grid"])
    effective_carbon_factor = max(0.01, carbon_factor * (1 - renewable_share / 135.0))
    carbon_kg_per_hour = (power_watts / 1000) * effective_carbon_factor

    return ModuleResult(
        status="success",
        metrics={
            "power_watts": metric(power_watts, "watts", spread=0.1),
            "cost_usd_per_hour": metric(cost_total, "usd_per_hour", spread=0.1),
            "carbon_kg_per_hour": metric(carbon_kg_per_hour, "kg_per_hour", spread=0.12),
            "renewable_share_pct": metric(renewable_share, "percent", spread=0.04),
        },
    )
