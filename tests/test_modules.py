from __future__ import annotations

import json
from pathlib import Path

from app.modules import energy, hardware, interconnect, orchestration, runtime


def scenario(gpu_sku: str = "A100") -> dict:
    return {
        "workload": {
            "model_family": "llama-70b",
            "workload_type": "chat",
            "prompt_tokens": 768,
            "completion_tokens": 256,
            "target_slo": {
                "p95_ttft_ms_max": 1200,
                "p95_tpot_ms_max": 180,
            },
            "traffic_profile": {
                "steady_qps": 12,
                "burst_qps": 24,
            },
        },
        "hardware": {
            "gpu_sku": gpu_sku,
            "gpu_count": 8,
            "node_count": 1,
            "host_cpu_class": "x86_64-highfreq",
            "memory_gb_per_gpu": 80,
        },
        "interconnect": {
            "intra_node_fabric": "nvlink",
            "inter_node_fabric": "infiniband",
            "topology_profile": "single_node",
        },
        "runtime": {
            "serving_stack": "vllm",
            "precision": "bf16",
            "tensor_parallelism": 4,
            "pipeline_parallelism": 1,
            "batching_strategy": "dynamic",
        },
        "orchestration": {
            "scheduler": "kubernetes",
            "autoscaling_policy": "hpa-latency",
            "placement_strategy": "balanced",
            "failure_policy": "retry-once",
        },
        "environment": {
            "region": "us-east-1",
            "power_price_usd_per_kwh": 0.12,
            "pue": 1.2,
        },
    }


def coeffs() -> dict:
    payload = json.loads((Path.cwd() / "artifacts" / "coefficients.v1.json").read_text(encoding="utf-8-sig"))
    return payload["coefficients"]


def test_hardware_is_deterministic() -> None:
    c = coeffs()
    s = scenario()
    first = hardware.run(s, c["hardware"])
    second = hardware.run(s, c["hardware"])
    assert first.metrics == second.metrics


def test_h200_has_higher_tps_than_a100() -> None:
    c = coeffs()
    a100 = hardware.run(scenario("A100"), c["hardware"])
    h200 = hardware.run(scenario("H200"), c["hardware"])
    assert h200.metrics["tps"]["value"] > a100.metrics["tps"]["value"]


def test_module_chain_produces_required_metrics() -> None:
    c = coeffs()
    s = scenario("H100")

    h = hardware.run(s, c["hardware"]).metrics
    i = interconnect.run(s, c["interconnect"], h).metrics
    merged_1 = dict(h)
    merged_1.update(i)

    r = runtime.run(s, c["runtime"], merged_1).metrics
    merged_2 = dict(merged_1)
    merged_2.update(r)

    o = orchestration.run(s, c["orchestration"], merged_2).metrics
    merged_3 = dict(merged_2)
    merged_3.update(o)

    e = energy.run(s, c["energy"], merged_3).metrics
    merged_3.update(e)

    for key in [
        "ttft_ms",
        "tpot_ms",
        "tps",
        "concurrency",
        "mfu_utilization_pct",
        "gpu_utilization_pct",
        "cost_usd_per_hour",
        "power_watts",
        "carbon_kg_per_hour",
        "renewable_share_pct",
    ]:
        assert key in merged_3

