from __future__ import annotations

import json
from pathlib import Path

from app.validation import SchemaRegistry


def base_scenario() -> dict:
    return {
        "contract": "ScenarioSpec.v1",
        "scenario_id": "test-scenario",
        "created_at": "2026-03-27T00:00:00Z",
        "workload": {
            "model_family": "llama-70b",
            "workload_type": "chat",
            "prompt_tokens": 512,
            "completion_tokens": 256,
            "target_slo": {
                "p95_ttft_ms_max": 1000,
                "p95_tpot_ms_max": 180,
            },
            "traffic_profile": {
                "steady_qps": 10,
                "burst_qps": 20,
            },
        },
        "hardware": {
            "gpu_sku": "A100",
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
            "cuda_graphs_enabled": True,
            "kernel_launch_mode": "balanced",
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
        "energy_system": {
            "primary_source": "solar",
            "renewable_share_pct": 60,
            "onsite_generation_mw": 10,
            "storage_mwh": 30,
        },
        "calibration": {
            "artifact_id": "coefficients-core-2026-03",
            "artifact_version": "v1",
        },
    }


def test_scenario_contract_validates() -> None:
    registry = SchemaRegistry(Path.cwd() / "contracts" / "v1")
    registry.validate("scenario", base_scenario())


def test_error_taxonomy_is_locked() -> None:
    path = Path.cwd() / "contracts" / "v1" / "error-taxonomy.v1.json"
    payload = json.loads(path.read_text(encoding="utf-8-sig"))
    classes = payload["properties"]["error_classes"]["items"]["enum"]
    assert classes == [
        "validation",
        "data_missing",
        "calibration_out_of_range",
        "compute_timeout",
        "internal",
    ]

