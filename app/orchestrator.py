from __future__ import annotations

import os
import subprocess
import time
import uuid
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any

from app.artifacts import ArtifactRegistry
from app.db import Database
from app.errors import AppError, InternalError, ValidationError
from app.hashing import canonicalize, scenario_hash
from app.modules import MODULE_ORDER, MODULE_RUNNERS
from app.run_queue import QueueJob, RunQueue
from app.validation import SchemaRegistry


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def repo_commit_id() -> str:
    env_sha = os.getenv("GIT_COMMIT_SHA")
    if env_sha:
        return env_sha[:40]
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            check=True,
            capture_output=True,
            text=True,
        )
        return result.stdout.strip()[:40]
    except Exception:
        return "0000000"


class Orchestrator:
    def __init__(
        self,
        db: Database,
        schemas: SchemaRegistry,
        artifacts: ArtifactRegistry,
        run_queue: RunQueue,
        inline_execution: bool = False,
    ) -> None:
        self.db = db
        self.schemas = schemas
        self.artifacts = artifacts
        self.run_queue = run_queue
        self.inline_execution = inline_execution

    def start_worker(self) -> None:
        if not self.inline_execution:
            self.run_queue.start(self.process_job)

    def stop_worker(self) -> None:
        self.run_queue.stop()

    def _cache_key(self, scenario_hash_value: str) -> str:
        module_versions = self.artifacts.module_versions
        module_version_fingerprint = "|".join(f"{k}:{module_versions[k]}" for k in sorted(module_versions.keys()))
        return (
            f"{scenario_hash_value}|{self.artifacts.artifact_id}|{self.artifacts.artifact_version}|"
            f"{module_version_fingerprint}"
        )

    def _validate_calibration_compatibility(self, scenario: dict[str, Any]) -> None:
        calibration = scenario.get("calibration")
        if not isinstance(calibration, dict):
            raise ValidationError("Scenario is missing required calibration block")

        declared_id = calibration.get("artifact_id")
        declared_version = calibration.get("artifact_version")

        if declared_id != self.artifacts.artifact_id or declared_version != self.artifacts.artifact_version:
            raise ValidationError(
                "Scenario calibration is incompatible with loaded artifacts",
                details={
                    "declared_artifact_id": declared_id,
                    "declared_artifact_version": declared_version,
                    "loaded_artifact_id": self.artifacts.artifact_id,
                    "loaded_artifact_version": self.artifacts.artifact_version,
                },
            )

    def validate_scenario(self, scenario_payload: dict[str, Any]) -> dict[str, Any]:
        canonical_scenario = canonicalize(scenario_payload)
        self.schemas.validate("scenario", canonical_scenario)
        self._validate_calibration_compatibility(canonical_scenario)

        hash_value = scenario_hash(canonical_scenario)
        return {
            "valid": True,
            "scenario_hash": hash_value,
            "artifact_id": self.artifacts.artifact_id,
            "artifact_version": self.artifacts.artifact_version,
        }

    def submit_scenario(self, scenario_payload: dict[str, Any]) -> dict[str, Any]:
        canonical_scenario = canonicalize(scenario_payload)
        self.schemas.validate("scenario", canonical_scenario)
        self._validate_calibration_compatibility(canonical_scenario)

        hash_value = scenario_hash(canonical_scenario)
        cache_key = self._cache_key(hash_value)
        run_id = f"run_{uuid.uuid4().hex[:12]}"

        cached_report = self.db.get_cached_report(cache_key)
        if cached_report is not None:
            report_id = f"report_{uuid.uuid4().hex[:12]}"
            cached_report_for_run = deepcopy(cached_report)
            cached_report_for_run["report_id"] = report_id
            cached_report_for_run["run_id"] = run_id
            cached_report_for_run["created_at"] = utc_now_iso()
            cached_report_for_run.setdefault("cache", {})
            cached_report_for_run["cache"]["cache_key"] = cache_key
            cached_report_for_run["cache"]["cache_hit"] = True
            self.schemas.validate("prediction", cached_report_for_run)

            self.db.insert_run(run_id, canonical_scenario, hash_value, "completed")
            self.db.upsert_stage(run_id, "cache_hit", "running", started=True)
            self.db.complete_stage(run_id, "cache_hit", "success", 0.0)
            self.db.insert_report(report_id, run_id, cached_report_for_run)
            self.db.set_run_completed(
                run_id=run_id,
                status="completed",
                report_id=report_id,
                queue_wait_ms=0.0,
                total_ms=0.0,
            )
            return {"run_id": run_id, "cached": True}

        self.db.insert_run(run_id, canonical_scenario, hash_value, "queued")
        job = QueueJob(run_id=run_id, scenario=canonical_scenario, scenario_hash=hash_value, enqueued_at=time.time())

        if self.inline_execution:
            self.process_job(job)
        else:
            self.run_queue.enqueue(job)

        return {"run_id": run_id, "cached": False}

    def process_job(self, job: QueueJob) -> None:
        started_monotonic = time.time()
        queue_wait_ms = max(0.0, (started_monotonic - job.enqueued_at) * 1000)
        self.db.set_run_started(job.run_id)

        module_results: list[dict[str, Any]] = []
        aggregate_metrics: dict[str, dict[str, Any]] = {}
        active_stage_name: str | None = None
        active_stage_started_at: float | None = None

        try:
            for module_name in MODULE_ORDER:
                stage_started = time.time()
                active_stage_name = module_name
                active_stage_started_at = stage_started
                self.db.upsert_stage(job.run_id, module_name, "running", started=True)

                module_input = {
                    "contract": "ModuleInput.v1",
                    "module_name": module_name,
                    "module_version": self.artifacts.module_versions[module_name],
                    "scenario_hash": job.scenario_hash,
                    "artifact_ids": [self.artifacts.artifact_id],
                    "requested_metrics": [
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
                    ],
                    "payload": job.scenario,
                    "upstream_outputs": [
                        {
                            "module_name": prior["module_name"],
                            "module_version": prior["module_version"],
                            "output_hash": prior["output_hash"],
                        }
                        for prior in module_results
                    ],
                    "trace": {
                        "run_id": job.run_id,
                        "stage_id": f"{job.run_id}:{module_name}",
                    },
                    "created_at": utc_now_iso(),
                }
                self.schemas.validate("module_io", module_input)

                runner = MODULE_RUNNERS[module_name]
                if module_name == "hardware":
                    result = runner(job.scenario, self.artifacts.coefficients[module_name])
                else:
                    result = runner(job.scenario, self.artifacts.coefficients[module_name], aggregate_metrics)

                output_metrics = dict(result.metrics)
                aggregate_metrics.update(output_metrics)

                stage_latency_ms = max(0.0, (time.time() - stage_started) * 1000)
                output_hash = scenario_hash(output_metrics)

                module_output = {
                    "contract": "ModuleOutput.v1",
                    "module_name": module_name,
                    "module_version": self.artifacts.module_versions[module_name],
                    "scenario_hash": job.scenario_hash,
                    "artifact_ids": [self.artifacts.artifact_id],
                    "status": result.status,
                    "metrics": output_metrics,
                    "timings": {
                        "queue_wait_ms": queue_wait_ms,
                        "compute_ms": stage_latency_ms,
                        "total_ms": stage_latency_ms,
                    },
                    "trace": {
                        "run_id": job.run_id,
                        "stage_id": f"{job.run_id}:{module_name}",
                    },
                    "created_at": utc_now_iso(),
                }
                if result.error is not None:
                    module_output["error"] = result.error

                self.schemas.validate("module_io", module_output)

                module_results.append(
                    {
                        "module_name": module_name,
                        "module_version": self.artifacts.module_versions[module_name],
                        "status": result.status,
                        "artifact_ids": [self.artifacts.artifact_id],
                        "latency_ms": round(stage_latency_ms, 4),
                        "output_hash": output_hash,
                    }
                )
                self.db.complete_stage(job.run_id, module_name, "success", stage_latency_ms)
                active_stage_name = None
                active_stage_started_at = None

            required_metrics = [
                "ttft_ms",
                "tpot_ms",
                "tps",
                "concurrency",
                "cost_usd_per_hour",
                "power_watts",
            ]
            optional_metrics = [
                "mfu_utilization_pct",
                "gpu_utilization_pct",
                "carbon_kg_per_hour",
                "renewable_share_pct",
            ]
            missing = [name for name in required_metrics if name not in aggregate_metrics]
            if missing:
                raise InternalError("Final metrics incomplete", {"missing": missing})

            report_metrics = {name: aggregate_metrics[name] for name in required_metrics}
            for metric_name in optional_metrics:
                if metric_name in aggregate_metrics:
                    report_metrics[metric_name] = aggregate_metrics[metric_name]

            report_id = f"report_{uuid.uuid4().hex[:12]}"
            report = {
                "contract": "PredictionReport.v1",
                "report_id": report_id,
                "run_id": job.run_id,
                "status": "success",
                "scenario_hash": job.scenario_hash,
                "created_at": utc_now_iso(),
                "metrics": report_metrics,
                "module_results": [
                    {
                        "module_name": row["module_name"],
                        "module_version": row["module_version"],
                        "status": row["status"],
                        "artifact_ids": row["artifact_ids"],
                        "latency_ms": row["latency_ms"],
                    }
                    for row in module_results
                ],
                "provenance": {
                    "scenario_hash": job.scenario_hash,
                    "artifact_ids": [self.artifacts.artifact_id],
                    "module_versions": self.artifacts.module_versions,
                    "timestamp": utc_now_iso(),
                    "commit_id": repo_commit_id(),
                    "assumptions_registry_version": self.artifacts.assumptions_registry_version,
                },
                "errors": [],
                "limitations": [
                    "Interconnect fidelity is first-order in v1 and not a packet-level simulation.",
                    "Calibration coefficients are deterministic but currently seeded from synthetic baselines.",
                ],
                "cache": {
                    "cache_key": self._cache_key(job.scenario_hash),
                    "cache_hit": False,
                },
            }

            self.schemas.validate("prediction", report)
            self.db.insert_report(report_id, job.run_id, report)
            self.db.put_cache_entry(self._cache_key(job.scenario_hash), report_id)

            total_ms = max(0.0, (time.time() - started_monotonic) * 1000)
            self.db.set_run_completed(
                run_id=job.run_id,
                status="completed",
                report_id=report_id,
                queue_wait_ms=queue_wait_ms,
                total_ms=total_ms,
            )
        except AppError as app_error:
            if active_stage_name is not None:
                stage_latency_ms = max(0.0, (time.time() - (active_stage_started_at or started_monotonic)) * 1000)
                self.db.complete_stage(
                    job.run_id,
                    active_stage_name,
                    "failed",
                    stage_latency_ms,
                    error_class=app_error.error_class,
                    error_message=app_error.message,
                )
            total_ms = max(0.0, (time.time() - started_monotonic) * 1000)
            self.db.set_run_completed(
                run_id=job.run_id,
                status="failed",
                report_id=None,
                queue_wait_ms=queue_wait_ms,
                total_ms=total_ms,
                error_class=app_error.error_class,
                error_message=app_error.message,
            )
        except Exception as unknown_error:
            if active_stage_name is not None:
                stage_latency_ms = max(0.0, (time.time() - (active_stage_started_at or started_monotonic)) * 1000)
                self.db.complete_stage(
                    job.run_id,
                    active_stage_name,
                    "failed",
                    stage_latency_ms,
                    error_class="internal",
                    error_message=str(unknown_error),
                )
            total_ms = max(0.0, (time.time() - started_monotonic) * 1000)
            self.db.set_run_completed(
                run_id=job.run_id,
                status="failed",
                report_id=None,
                queue_wait_ms=queue_wait_ms,
                total_ms=total_ms,
                error_class="internal",
                error_message=str(unknown_error),
            )

    def get_run(self, run_id: str) -> dict[str, Any] | None:
        run = self.db.get_run(run_id)
        if run is None:
            return None
        run["stages"] = self.db.get_run_stages(run_id)
        if run.get("report_id"):
            run["report"] = self.db.get_report(run["report_id"])
        else:
            run["report"] = None
        return run

    def get_report(self, report_id: str) -> dict[str, Any] | None:
        return self.db.get_report(report_id)

    def list_runs(self, limit: int = 50) -> list[dict[str, Any]]:
        return self.db.list_runs(limit=limit)

    def list_reports(self, limit: int = 50) -> list[dict[str, Any]]:
        return self.db.list_reports(limit=limit)
