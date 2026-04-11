from __future__ import annotations

from app.modules.common import ModuleResult, metric


PLACEMENT_GAIN = {
    "binpack": 1.08,
    "spread": 0.95,
    "balanced": 1.0,
}


def run(input_payload: dict, coefficients: dict, upstream: dict[str, dict]) -> ModuleResult:
    orchestration = input_payload["orchestration"]
    workload = input_payload["workload"]

    upstream_tps = upstream["tps"]["value"]
    upstream_concurrency = upstream["concurrency"]["value"]
    upstream_ttft = upstream["ttft_ms"]["value"]

    placement = orchestration["placement_strategy"].lower()
    placement_gain = PLACEMENT_GAIN.get(placement, 1.0)

    burst_qps = workload.get("traffic_profile", {}).get("burst_qps", workload.get("prompt_tokens", 128) / 16)
    saturation = min(2.0, max(0.1, burst_qps / max(1.0, upstream_concurrency)))

    # High saturation = system loaded = throughput near capacity.
    # Low saturation = system idle = throughput proportionally lower.
    tps = upstream_tps * placement_gain * coefficients["throughput_scale"] * min(1.0, saturation)
    concurrency = upstream_concurrency * placement_gain * coefficients["concurrency_scale"]
    ttft = upstream_ttft * saturation * coefficients["latency_scale"]

    autoscaling = str(orchestration.get("autoscaling_policy", "")).lower()
    autoscaling_bonus = 4.0 if "predictive" in autoscaling else (2.0 if "queue" in autoscaling else 0.0)
    placement_bonus = (placement_gain - 1.0) * 40.0
    saturation_penalty = abs(1.0 - saturation) * 24.0
    gpu_utilization = min(
        99.0,
        max(
            32.0,
            71.0 + placement_bonus + autoscaling_bonus - saturation_penalty,
        ),
    )

    return ModuleResult(
        status="success",
        metrics={
            "ttft_ms": metric(ttft, "ms"),
            "tps": metric(tps, "tokens_per_second"),
            "concurrency": metric(concurrency, "requests"),
            "gpu_utilization_pct": metric(gpu_utilization, "percent", spread=0.06),
        },
    )
