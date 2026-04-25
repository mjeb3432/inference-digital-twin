"""Orchestration module — physics-based queue dynamics + GPU utilisation.

Replaces the prior `saturation = burst / concurrency` heuristic with the
M/M/c queueing model. For a system with `c` parallel servers (replicas)
each serving at rate µ, offered load λ, and arrival rate scaled to QPS:

  ρ = λ / (c × µ)                    (utilisation per server)
  P0 = (sum_{n=0..c-1} (cρ)^n / n! + (cρ)^c / (c! × (1-ρ)))^-1
  Lq = P0 × (cρ)^c × ρ / (c! × (1-ρ)^2)
  Wq = Lq / λ                        (queue wait, seconds)

Wq is the time a request spends in the queue before getting served. We add
this to the upstream TTFT to give the realistic latency under load. As ρ
approaches 1 the queue blows up — exactly what happens in production when
you let GPUs run hot.

Placement strategies and autoscaling policies adjust the effective `c`
(replicas) and µ (per-replica rate) before the M/M/c is evaluated.
"""

from __future__ import annotations

import math

from app.modules.common import ModuleResult, metric


# Placement strategy → effective server multiplier. Bin-packing makes more
# servers visible to schedulers (they can be filled to capacity), spread
# leaves replicas idle. Balanced sits in between.
PLACEMENT_GAIN: dict[str, float] = {
    "binpack":  1.10,
    "balanced": 1.00,
    "spread":   0.92,
}


def _mmc_queue_wait_seconds(arrival_rate: float, service_rate: float, servers: int) -> float:
    """Mean queue wait Wq for M/M/c in seconds. Returns +inf if unstable."""
    if servers <= 0 or service_rate <= 0:
        return math.inf
    rho = arrival_rate / (servers * service_rate)
    if rho >= 1.0:
        # Queue grows without bound — return a large but finite number so
        # downstream consumers can render "saturated" without dividing by
        # zero. 60s wait → clearly an SLO violation in any chat workload.
        return 60.0
    if rho <= 0:
        return 0.0

    c = servers
    # Erlang C formula (probability of waiting).
    cr = c * rho
    sum_terms = sum((cr ** n) / math.factorial(n) for n in range(c))
    last_term = (cr ** c) / (math.factorial(c) * (1 - rho))
    p0 = 1.0 / (sum_terms + last_term)
    erlang_c = last_term * p0
    wq = erlang_c / (servers * service_rate * (1 - rho))
    return wq


def run(input_payload: dict, coefficients: dict, upstream: dict[str, dict]) -> ModuleResult:
    orchestration = input_payload["orchestration"]
    workload = input_payload["workload"]
    runtime = input_payload["runtime"]
    hardware = input_payload["hardware"]

    upstream_tps = upstream["tps"]["value"]
    upstream_concurrency = upstream["concurrency"]["value"]
    upstream_ttft = upstream["ttft_ms"]["value"]
    upstream_tpot = upstream["tpot_ms"]["value"]

    placement = str(orchestration.get("placement_strategy", "balanced")).lower()
    placement_gain = PLACEMENT_GAIN.get(placement, 1.0)
    autoscaling = str(orchestration.get("autoscaling_policy", "")).lower()

    tp = max(1, int(runtime.get("tensor_parallelism", 1)))
    gpu_count = max(1, int(hardware.get("gpu_count", 1)))
    completion_tokens = max(1, int(workload.get("completion_tokens", 256)))

    # Each replica is a TP group. With placement_gain we model schedulers
    # that pack better having effectively more usable replicas.
    raw_replicas = max(1, gpu_count // tp)
    effective_servers = max(1, int(round(raw_replicas * placement_gain)))

    # Service rate per replica (requests per second). One request takes the
    # average chat duration (TTFT + n × TPOT) seconds. Continuous batching
    # would make this rate go higher per replica because they multiplex —
    # we capture that in upstream_concurrency, which the runtime module
    # already amplified for batching strategies.
    avg_request_seconds = (upstream_ttft + completion_tokens * upstream_tpot) / 1000.0
    if avg_request_seconds <= 0:
        per_replica_rps = 1.0
    else:
        per_replica_rps = 1.0 / avg_request_seconds

    # Continuous batching multiplies effective concurrency per replica. Use
    # the upstream concurrency (HBM-cap-derived) as the multiplexing factor.
    multiplex_factor = max(1.0, upstream_concurrency / max(1, effective_servers))
    # But cap multiplexing at 64 — beyond that, scheduling overhead dominates.
    multiplex_factor = min(64.0, multiplex_factor)
    service_rate = per_replica_rps * multiplex_factor

    # Offered load — burst QPS is the worst-case arrival; steady QPS is the
    # ideal. We score on burst because that's what trips SLOs.
    burst_qps = float(workload.get("traffic_profile", {}).get("burst_qps", 16))
    steady_qps = float(workload.get("traffic_profile", {}).get("steady_qps", burst_qps * 0.5))
    arrival_rate = max(steady_qps, burst_qps)

    # Predictive autoscaling reduces effective arrival rate by absorbing
    # bursts via warmed-up replicas; queue-aware autoscaling does the same
    # less aggressively.
    if "predict" in autoscaling:
        arrival_rate *= 0.80
    elif "queue" in autoscaling:
        arrival_rate *= 0.90

    # Queue wait under offered load
    wq_s = _mmc_queue_wait_seconds(arrival_rate, service_rate, effective_servers)
    wq_ms = min(60_000.0, wq_s * 1000.0)

    # ----- Layer onto upstream metrics ------------------------------------
    ttft = upstream_ttft + wq_ms
    rho = arrival_rate / max(1e-6, effective_servers * service_rate)
    rho = min(2.0, max(0.0, rho))

    # TPS is bounded by min(offered demand, capacity).
    capacity_tps = upstream_tps * placement_gain
    if rho >= 1.0:
        # Saturated — emit at capacity, queue absorbs the rest
        tps = capacity_tps
    else:
        # Below saturation — emit proportional to demand
        tps = capacity_tps * rho

    concurrency = upstream_concurrency * placement_gain

    # ----- GPU utilisation = ρ on average, with a placement bonus ---------
    util_pct = min(99.0, max(8.0, rho * 100.0 + (placement_gain - 1.0) * 8.0))

    # Calibration coefficients
    tps *= float(coefficients.get("throughput_scale", 1.0))
    concurrency *= float(coefficients.get("concurrency_scale", 1.0))
    ttft *= float(coefficients.get("latency_scale", 1.0))

    return ModuleResult(
        status="success",
        metrics={
            "ttft_ms": metric(ttft, "ms"),
            "tps": metric(tps, "tokens_per_second"),
            "concurrency": metric(concurrency, "requests"),
            "gpu_utilization_pct": metric(util_pct, "percent", spread=0.06),
        },
    )
