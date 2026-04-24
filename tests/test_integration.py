from __future__ import annotations

import time
from pathlib import Path

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def valid_scenario() -> dict:
    return {
        "contract": "ScenarioSpec.v1",
        "scenario_id": "integration-scenario",
        "created_at": "2026-03-27T00:00:00Z",
        "workload": {
            "model_family": "llama-70b",
            "workload_type": "chat",
            "prompt_tokens": 640,
            "completion_tokens": 256,
            "target_slo": {
                "p95_ttft_ms_max": 1200,
                "p95_tpot_ms_max": 200,
            },
            "traffic_profile": {
                "steady_qps": 14,
                "burst_qps": 26,
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
        "calibration": {
            "artifact_id": "coefficients-core-2026-03",
            "artifact_version": "v1",
        },
    }


def test_run_pipeline_to_report(client) -> None:
    run_response = client.post("/api/runs", json=valid_scenario())
    assert run_response.status_code == 202
    run_id = run_response.json()["run_id"]

    run = client.get(f"/api/runs/{run_id}")
    assert run.status_code == 200
    payload = run.json()

    assert payload["status"] in {"completed", "running", "queued"}

    for _ in range(20):
        latest = client.get(f"/api/runs/{run_id}").json()
        if latest["status"] == "completed":
            break
        time.sleep(0.05)
    else:
        raise AssertionError("Run did not complete in expected time")

    report = latest["report"]
    assert report["contract"] == "PredictionReport.v1"
    assert report["provenance"]["scenario_hash"].startswith("sha256:")
    assert {
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
    }.issubset(set(report["metrics"].keys()))


def test_ui_routes_render(client) -> None:
    for path in ["/explorer", "/runs", "/artifacts"]:
        response = client.get(path)
        assert response.status_code == 200
        assert "Inference Digital Twin" in response.text


def test_forge_route_renders(client) -> None:
    response = client.get("/forge")
    assert response.status_code == 200
    assert "THE FORGE" in response.text


def test_validate_endpoint_does_not_enqueue_run(client) -> None:
    before = client.get("/api/runs")
    assert before.status_code == 200
    assert before.json()["items"] == []

    validation = client.post("/api/validate-scenario", json=valid_scenario())
    assert validation.status_code == 200
    assert validation.json()["valid"] is True
    assert validation.json()["scenario_hash"].startswith("sha256:")

    after = client.get("/api/runs")
    assert after.status_code == 200
    assert after.json()["items"] == []


def test_calibration_mismatch_rejected(client) -> None:
    scenario = valid_scenario()
    scenario["calibration"]["artifact_version"] = "v999"

    response = client.post("/api/runs", json=scenario)
    assert response.status_code == 400
    payload = response.json()
    assert payload["error_class"] == "validation"
    assert "incompatible" in payload["message"].lower()


def test_failed_stage_transitions_to_failed(client, monkeypatch) -> None:
    import app.orchestrator as orchestrator_module

    def explode_runtime(*_args, **_kwargs):
        raise RuntimeError("runtime exploded")

    monkeypatch.setitem(orchestrator_module.MODULE_RUNNERS, "runtime", explode_runtime)

    run_response = client.post("/api/runs", json=valid_scenario())
    assert run_response.status_code == 202
    run_id = run_response.json()["run_id"]

    run = client.get(f"/api/runs/{run_id}")
    assert run.status_code == 200
    payload = run.json()
    assert payload["status"] == "failed"

    stages = {stage["stage_name"]: stage for stage in payload["stages"]}
    assert stages["runtime"]["status"] == "failed"
    assert stages["runtime"]["error_class"] == "internal"
    assert stages["runtime"]["completed_at"] is not None
    assert stages["runtime"]["latency_ms"] is not None
    assert all(stage["status"] != "running" for stage in payload["stages"])


def test_cached_run_has_own_report_and_cache_stage(client) -> None:
    first = client.post("/api/runs", json=valid_scenario())
    assert first.status_code == 202
    first_run_id = first.json()["run_id"]

    second = client.post("/api/runs", json=valid_scenario())
    assert second.status_code == 202
    second_run_id = second.json()["run_id"]
    assert first_run_id != second_run_id

    second_run = client.get(f"/api/runs/{second_run_id}")
    assert second_run.status_code == 200
    payload = second_run.json()
    assert payload["status"] == "completed"
    assert payload["report"]["run_id"] == second_run_id
    assert payload["report"]["cache"]["cache_hit"] is True

    stages = {stage["stage_name"]: stage for stage in payload["stages"]}
    assert "cache_hit" in stages
    assert stages["cache_hit"]["status"] == "success"


def test_forge_route_stays_available_if_runtime_warmup_fails(tmp_path: Path, monkeypatch) -> None:
    def explode(_self):
        raise RuntimeError("warmup exploded")

    monkeypatch.setattr(create_app.__globals__["AppServices"], "_build_bundle", explode)

    settings = Settings(
        base_dir=Path.cwd(),
        database_path=tmp_path / "test.db",
        contracts_dir=Path.cwd() / "contracts" / "v1",
        artifacts_path=Path.cwd() / "artifacts" / "coefficients.v1.json",
        inline_execution=True,
        worker_poll_interval_seconds=0.01,
    )
    app = create_app(settings=settings)

    with TestClient(app) as test_client:
        forge = test_client.get("/forge")
        assert forge.status_code == 200
        assert "THE FORGE" in forge.text

        health = test_client.get("/api/health")
        assert health.status_code == 200
        assert health.json()["status"] == "error"

        runs = test_client.get("/api/runs")
        assert runs.status_code == 503
