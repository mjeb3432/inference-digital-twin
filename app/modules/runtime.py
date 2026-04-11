from __future__ import annotations

from app.modules.common import ModuleResult, metric


BATCHING_GAIN = {
    "static": 1.0,
    "dynamic": 1.12,
}


def run(input_payload: dict, coefficients: dict, upstream: dict[str, dict]) -> ModuleResult:
    runtime = input_payload["runtime"]

    upstream_ttft = upstream["ttft_ms"]["value"]
    upstream_tpot = upstream["tpot_ms"]["value"]
    upstream_tps = upstream["tps"]["value"]
    upstream_concurrency = upstream["concurrency"]["value"]

    tp = runtime["tensor_parallelism"]
    pp = runtime["pipeline_parallelism"]
    batching_gain = BATCHING_GAIN[runtime["batching_strategy"]]
    precision = str(runtime.get("precision", "bf16")).lower()
    kernel_mode = str(runtime.get("kernel_launch_mode", "balanced")).lower()
    cuda_graphs_enabled = bool(runtime.get("cuda_graphs_enabled", False))

    parallel_gain = max(1.0, (tp * 0.22) + (pp * 0.12))
    memory_penalty = 1 + max(0, (tp + pp - 4)) * 0.03

    ttft = upstream_ttft * memory_penalty / (1 + parallel_gain * 0.3)
    tpot = upstream_tpot * memory_penalty / (1 + parallel_gain * 0.55)
    tps = upstream_tps * (1 + parallel_gain * 0.5) * batching_gain * coefficients["throughput_scale"]
    concurrency = upstream_concurrency * batching_gain * coefficients["concurrency_scale"]

    precision_bonus = 8.0 if precision in {"fp8", "int8"} else 3.0
    kernel_bonus = {"balanced": 0.0, "fused": 5.0, "aggressive": 8.0}.get(kernel_mode, 0.0)
    graphs_bonus = 4.0 if cuda_graphs_enabled else 0.0
    mfu_utilization = min(
        95.0,
        max(
            15.0,
            42.0
            + (parallel_gain * 9.0)
            + (batching_gain * 14.0)
            + precision_bonus
            + kernel_bonus
            + graphs_bonus
            - (memory_penalty * 6.0),
        ),
    )

    return ModuleResult(
        status="success",
        metrics={
            "ttft_ms": metric(ttft, "ms"),
            "tpot_ms": metric(tpot, "ms"),
            "tps": metric(tps, "tokens_per_second"),
            "concurrency": metric(concurrency, "requests"),
            "mfu_utilization_pct": metric(mfu_utilization, "percent", spread=0.05),
        },
    )
