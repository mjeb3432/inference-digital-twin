from __future__ import annotations

from app.modules.common import ModuleResult, metric


GPU_PERF_FACTOR = {
    "a100": 1.0,
    "h100": 1.55,
    "h200": 1.78,
    "b200": 2.2,
}


def run(input_payload: dict, coefficients: dict) -> ModuleResult:
    hardware = input_payload["hardware"]
    workload = input_payload["workload"]
    runtime = input_payload["runtime"]

    gpu_sku = str(hardware["gpu_sku"]).lower()
    gpu_count = hardware["gpu_count"]
    prompt_tokens = workload["prompt_tokens"]
    completion_tokens = workload["completion_tokens"]

    perf_factor = GPU_PERF_FACTOR.get(gpu_sku, 0.9)
    precision_factor = coefficients["precision_factors"].get(runtime["precision"], 1.0)

    base_ttft = coefficients["base_ttft_ms"] * (prompt_tokens / 512)
    base_tpot = coefficients["base_tpot_ms"] * (completion_tokens / 256)

    ttft = max(12.0, base_ttft / (perf_factor * precision_factor))
    tpot = max(4.0, base_tpot / (perf_factor * precision_factor))
    tps = max(5.0, (1000 / tpot) * gpu_count * coefficients["throughput_scale"])
    concurrency = max(1.0, gpu_count * perf_factor * coefficients["concurrency_scale"])

    return ModuleResult(
        status="success",
        metrics={
            "ttft_ms": metric(ttft, "ms"),
            "tpot_ms": metric(tpot, "ms"),
            "tps": metric(tps, "tokens_per_second"),
            "concurrency": metric(concurrency, "requests"),
        },
    )
