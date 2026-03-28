from __future__ import annotations

from app.modules.common import ModuleResult, metric


TOPOLOGY_PENALTY = {
    "single_node": 1.0,
    "leaf_spine": 1.12,
    "fat_tree": 1.08,
}

FABRIC_PENALTY = {
    "ethernet": 1.18,
    "infiniband": 1.03,
}


def run(input_payload: dict, coefficients: dict, upstream: dict[str, dict]) -> ModuleResult:
    interconnect = input_payload["interconnect"]

    upstream_ttft = upstream["ttft_ms"]["value"]
    upstream_tpot = upstream["tpot_ms"]["value"]
    upstream_tps = upstream["tps"]["value"]

    topology_penalty = TOPOLOGY_PENALTY[interconnect["topology_profile"]]
    fabric_penalty = FABRIC_PENALTY[interconnect["inter_node_fabric"]]
    intra_bonus = 0.94 if interconnect["intra_node_fabric"] == "nvlink" else 1.0

    latency_multiplier = topology_penalty * fabric_penalty * intra_bonus
    throughput_multiplier = max(0.65, 1 / latency_multiplier)

    ttft = upstream_ttft * latency_multiplier * coefficients["latency_scale"]
    tpot = upstream_tpot * latency_multiplier * coefficients["latency_scale"]
    tps = upstream_tps * throughput_multiplier * coefficients["throughput_scale"]

    return ModuleResult(
        status="success",
        metrics={
            "ttft_ms": metric(ttft, "ms"),
            "tpot_ms": metric(tpot, "ms"),
            "tps": metric(tps, "tokens_per_second"),
        },
    )
