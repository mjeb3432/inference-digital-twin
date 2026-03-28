from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from app.errors import AppError

router = APIRouter(prefix="/api")


@router.get("/health")
def health(request: Request) -> dict:
    queue_depth = request.app.state.run_queue.depth
    return {
        "status": "ok",
        "queue_depth": queue_depth,
    }


@router.get("/runs")
def list_runs(request: Request) -> dict:
    return {"items": request.app.state.orchestrator.list_runs(limit=100)}


@router.post("/validate-scenario")
def validate_scenario(request: Request, payload: dict) -> JSONResponse:
    orchestrator = request.app.state.orchestrator
    try:
        response = orchestrator.validate_scenario(payload)
        return JSONResponse(response, status_code=200)
    except AppError as err:
        return JSONResponse(
            {
                "error_class": err.error_class,
                "message": err.message,
                "details": err.details or {},
            },
            status_code=400,
        )


@router.get("/presets")
def presets() -> dict:
    return {
        "items": [
            {
                "name": "Chat Baseline A100",
                "scenario": {
                    "contract": "ScenarioSpec.v1",
                    "scenario_id": "chat-a100-baseline",
                    "created_at": "2026-01-01T00:00:00Z",
                    "name": "Chat Baseline A100",
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
                            "burst_qps": 32,
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
                        "primary_source": "grid",
                        "renewable_share_pct": 30,
                        "onsite_generation_mw": 0,
                        "storage_mwh": 0,
                    },
                    "calibration": {
                        "artifact_id": "coefficients-core-2026-03",
                        "artifact_version": "v1",
                    },
                },
            },
            {
                "name": "Scale H200 Multi-node",
                "scenario": {
                    "contract": "ScenarioSpec.v1",
                    "scenario_id": "chat-h200-scale",
                    "created_at": "2026-01-01T00:00:00Z",
                    "name": "Scale H200 Multi-node",
                    "workload": {
                        "model_family": "llama-70b",
                        "workload_type": "chat",
                        "prompt_tokens": 1024,
                        "completion_tokens": 384,
                        "target_slo": {
                            "p95_ttft_ms_max": 900,
                            "p95_tpot_ms_max": 140,
                        },
                        "traffic_profile": {
                            "steady_qps": 24,
                            "burst_qps": 64,
                        },
                    },
                    "hardware": {
                        "gpu_sku": "H200",
                        "gpu_count": 8,
                        "node_count": 2,
                        "host_cpu_class": "x86_64-highfreq",
                        "memory_gb_per_gpu": 141,
                    },
                    "interconnect": {
                        "intra_node_fabric": "nvlink",
                        "inter_node_fabric": "infiniband",
                        "topology_profile": "leaf_spine",
                    },
                    "runtime": {
                        "serving_stack": "vllm",
                        "precision": "fp8",
                        "tensor_parallelism": 8,
                        "pipeline_parallelism": 2,
                        "batching_strategy": "dynamic",
                        "cuda_graphs_enabled": True,
                        "kernel_launch_mode": "fused",
                    },
                    "orchestration": {
                        "scheduler": "kubernetes",
                        "autoscaling_policy": "predictive",
                        "placement_strategy": "binpack",
                        "failure_policy": "retry-twice",
                    },
                    "environment": {
                        "region": "us-west-2",
                        "power_price_usd_per_kwh": 0.1,
                        "pue": 1.18,
                    },
                    "energy_system": {
                        "primary_source": "solar",
                        "renewable_share_pct": 76,
                        "onsite_generation_mw": 22,
                        "storage_mwh": 84,
                    },
                    "calibration": {
                        "artifact_id": "coefficients-core-2026-03",
                        "artifact_version": "v1",
                    },
                },
            },
        ]
    }


@router.post("/runs")
def submit_run(request: Request, payload: dict) -> JSONResponse:
    orchestrator = request.app.state.orchestrator
    try:
        response = orchestrator.submit_scenario(payload)
        return JSONResponse(response, status_code=202)
    except AppError as err:
        return JSONResponse(
            {
                "error_class": err.error_class,
                "message": err.message,
                "details": err.details or {},
            },
            status_code=400,
        )


@router.get("/runs/{run_id}")
def get_run(request: Request, run_id: str) -> dict:
    run = request.app.state.orchestrator.get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    return run


@router.get("/reports/{report_id}")
def get_report(request: Request, report_id: str) -> dict:
    report = request.app.state.orchestrator.get_report(report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    return report


@router.get("/reports")
def list_reports(request: Request) -> dict:
    return {"items": request.app.state.orchestrator.list_reports(limit=100)}


@router.get("/reports/{report_id}/provenance")
def get_provenance(request: Request, report_id: str) -> dict:
    report = request.app.state.orchestrator.get_report(report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    return {
        "report_id": report["report_id"],
        "run_id": report["run_id"],
        "provenance": report["provenance"],
        "limitations": report.get("limitations", []),
        "cache": report.get("cache", {}),
    }


@router.get("/reports/{report_id}/bundle")
def export_bundle(request: Request, report_id: str) -> dict:
    report = request.app.state.orchestrator.get_report(report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    run = request.app.state.orchestrator.get_run(report["run_id"])
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")

    return {
        "bundle_version": "v1",
        "scenario": run["scenario"],
        "report": report,
        "provenance": report["provenance"],
        "artifact_refs": report["provenance"]["artifact_ids"],
    }
