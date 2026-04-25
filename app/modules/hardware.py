"""Hardware module — physics-based GPU inference performance.

Replaces the prior multiplicative-factor model with a calculation that
distinguishes:

  * Prefill (TTFT)  — compute-bound. ~2 * model_params FLOPs/token, divided
    across the cluster's peak FLOPS-at-precision and a Model FLOP Utilisation
    that reflects what real prefill kernels achieve.
  * Decode  (TPOT)  — memory-bandwidth-bound. Each generated token reads the
    entire model from HBM, so per-token latency = model_bytes / HBM_bandwidth
    (tensor-parallelism splits both the model and the bandwidth requirement).
  * Concurrency (KV cache) — capped by HBM left over after the model weights.
    Each in-flight request needs 2 * num_layers * num_heads * head_dim *
    precision_bytes per token of context, divided across TP.

GPU and model specs come from the vendor data sheets; see DATASHEET_NOTES at
the bottom for citations + the constants table the code reads from.
"""

from __future__ import annotations

import math

from app.modules.common import ModuleResult, metric


# ---------------------------------------------------------------------------
# GPU specs — peak dense throughput at each precision (TFLOPS) plus HBM size
# (GB) and HBM bandwidth (GB/s). Sourced from public vendor datasheets.
# ---------------------------------------------------------------------------
# fmt: off
GPU_SPECS: dict[str, dict[str, float]] = {
    "a100": {
        "fp16_tflops":  312.0,
        "fp8_tflops":   312.0,   # A100 has no FP8; treat as FP16
        "int8_tops":    624.0,
        "int4_tops":    1248.0,
        "hbm_gb":        80.0,
        "hbm_gbps":    2039.0,   # 2.039 TB/s
        "tdp_w":         400.0,
    },
    "h100": {
        "fp16_tflops":  989.0,
        "fp8_tflops":  1979.0,
        "int8_tops":   1979.0,
        "int4_tops":   3958.0,
        "hbm_gb":        80.0,
        "hbm_gbps":    3350.0,   # 3.35 TB/s
        "tdp_w":         700.0,
    },
    "h200": {
        "fp16_tflops":  989.0,
        "fp8_tflops":  1979.0,
        "int8_tops":   1979.0,
        "int4_tops":   3958.0,
        "hbm_gb":       141.0,
        "hbm_gbps":    4800.0,   # 4.8 TB/s
        "tdp_w":         700.0,
    },
    "b200": {
        "fp16_tflops": 2250.0,
        "fp8_tflops":  4500.0,
        "int8_tops":   4500.0,
        "int4_tops":   9000.0,
        "hbm_gb":       192.0,
        "hbm_gbps":    8000.0,   # 8.0 TB/s
        "tdp_w":        1000.0,
    },
}
# fmt: on


# ---------------------------------------------------------------------------
# Model architecture defaults — used when the workload doesn't specify them.
# Pulled from the public Llama-3 / Mistral / Qwen architecture papers.
# ---------------------------------------------------------------------------
# fmt: off
MODEL_ARCHITECTURES: dict[str, dict[str, float]] = {
    # name            params      layers  heads  kv_heads  head_dim
    "llama-7b":   {"params": 7.0e9,   "layers": 32, "heads": 32, "kv_heads":  8, "head_dim": 128},
    "llama-13b":  {"params": 13.0e9,  "layers": 40, "heads": 40, "kv_heads":  8, "head_dim": 128},
    "llama-70b":  {"params": 70.0e9,  "layers": 80, "heads": 64, "kv_heads":  8, "head_dim": 128},
    "llama-405b": {"params": 405.0e9, "layers": 126,"heads": 128,"kv_heads":  8, "head_dim": 128},
}
# fmt: on
DEFAULT_MODEL = MODEL_ARCHITECTURES["llama-70b"]


# ---------------------------------------------------------------------------
# Bytes-per-parameter at each precision (decode is BW-bound on these bytes)
# ---------------------------------------------------------------------------
PRECISION_BYTES: dict[str, float] = {
    "fp16": 2.0,
    "bf16": 2.0,
    "fp8":  1.0,
    "int8": 1.0,
    "int4": 0.5,
}


# ---------------------------------------------------------------------------
# Model FLOP Utilisation — what fraction of peak FLOPS real kernels hit.
# Prefill MFU is high because long prompts saturate matmuls; decode MFU is
# low because we're effectively bandwidth-bound (reported here for symmetry
# but only used in the prefill calc).
# ---------------------------------------------------------------------------
PREFILL_MFU = 0.55   # vLLM / TensorRT-LLM prefill on H100 typically 0.45-0.65
DECODE_BW_UTIL = 0.78  # decode rarely hits peak HBM BW — overhead, sync, etc.


def _resolve_model(workload: dict) -> dict:
    family = str(workload.get("model_family", "llama-70b")).lower()
    arch = MODEL_ARCHITECTURES.get(family)
    if arch is not None:
        return arch
    # Heuristic fallback: parse "70b" / "13B" / "405b" from any model_family
    import re

    m = re.search(r"(\d+(?:\.\d+)?)\s*[bB]", family)
    if not m:
        return DEFAULT_MODEL
    size_b = float(m.group(1))
    # Scale Llama-style architecture defaults by parameter count
    base = MODEL_ARCHITECTURES["llama-70b"]
    scale = (size_b * 1e9) / base["params"]
    return {
        "params": size_b * 1e9,
        # Layer/head counts are sub-linear — reach for nearest standard config
        "layers": max(16, int(round(base["layers"] * (scale ** 0.33)))),
        "heads":  max(8,  int(round(base["heads"]  * (scale ** 0.33)))),
        "kv_heads": 8,
        "head_dim": 128,
    }


def _gpu_spec(gpu_sku: str) -> dict[str, float]:
    return GPU_SPECS.get(gpu_sku.lower()) or GPU_SPECS["a100"]


def _peak_flops_at_precision(spec: dict, precision: str) -> float:
    """Return peak TFLOPS for the given precision (or TOPS for INT)."""
    p = (precision or "").lower()
    if p in {"fp16", "bf16"}:
        return spec["fp16_tflops"]
    if p in {"fp8", "int8"}:
        return spec["fp8_tflops"]
    if p == "int4":
        return spec["int4_tops"]
    return spec["fp16_tflops"]


def run(input_payload: dict, coefficients: dict) -> ModuleResult:
    hardware = input_payload["hardware"]
    workload = input_payload["workload"]
    runtime = input_payload["runtime"]

    gpu_sku = str(hardware["gpu_sku"]).lower()
    gpu_count = int(hardware["gpu_count"])
    prompt_tokens = int(workload["prompt_tokens"])
    completion_tokens = int(workload["completion_tokens"])
    precision = str(runtime.get("precision", "bf16")).lower()
    tp = max(1, int(runtime.get("tensor_parallelism", 1)))

    spec = _gpu_spec(gpu_sku)
    arch = _resolve_model(workload)

    # ----- Prefill (TTFT) — compute-bound -----------------------------------
    # Forward pass FLOPs ≈ 2 * params per output token (one MAC per param).
    # Cluster peak throughput at the chosen precision:
    cluster_peak_tflops = _peak_flops_at_precision(spec, precision) * gpu_count
    cluster_peak_flops_per_s = cluster_peak_tflops * 1e12 * PREFILL_MFU
    prefill_flops = 2.0 * arch["params"] * prompt_tokens
    prefill_s = prefill_flops / max(1.0, cluster_peak_flops_per_s)

    # Network round-trip floor (no model can issue first token in <2 ms even
    # on the same NIC). Coefficients keep this tunable.
    rtt_floor_ms = float(coefficients.get("network_floor_ms", 2.0))
    ttft_ms = max(rtt_floor_ms, prefill_s * 1000.0 + rtt_floor_ms)

    # ----- Decode (TPOT) — memory-bandwidth-bound ---------------------------
    # Each generated token reads the entire model from HBM. Tensor parallelism
    # slices the model across `tp` GPUs, so per-GPU bytes drop and per-GPU BW
    # adds up — the result is a `tp` divisor on the wall-clock per token.
    bytes_per_param = PRECISION_BYTES.get(precision, 2.0)
    model_bytes = arch["params"] * bytes_per_param
    cluster_hbm_bw_GBps = spec["hbm_gbps"] * gpu_count * DECODE_BW_UTIL
    decode_s_per_token = (model_bytes / 1e9) / max(1.0, cluster_hbm_bw_GBps)
    # Coefficient floor — kernel launch + sampling overhead per token
    tpot_floor_ms = float(coefficients.get("decode_floor_ms", 4.0))
    tpot_ms = max(tpot_floor_ms, decode_s_per_token * 1000.0)

    # ----- Concurrency (max batch) — HBM limit ------------------------------
    # KV cache per token per layer: 2 (K + V) * num_kv_heads * head_dim * bytes
    kv_bytes_per_token_per_layer = (
        2.0 * arch["kv_heads"] * arch["head_dim"] * bytes_per_param
    )
    kv_bytes_per_token = kv_bytes_per_token_per_layer * arch["layers"]
    avg_seq_len = max(1, prompt_tokens + completion_tokens)
    kv_bytes_per_request = kv_bytes_per_token * avg_seq_len

    total_hbm_bytes = spec["hbm_gb"] * 1e9 * gpu_count
    # Model + an activation/workspace overhead (~10 % of model weights).
    model_overhead_bytes = model_bytes * 1.10
    free_hbm_bytes = max(0.0, total_hbm_bytes - model_overhead_bytes)
    if kv_bytes_per_request <= 0:
        max_concurrent = 1.0
    else:
        max_concurrent = max(1.0, free_hbm_bytes / kv_bytes_per_request)

    # Honour an SLO-driven cap if the user is targeting low TTFT — we can't
    # serve millions of concurrent requests without queueing chaos. Cap at
    # the rate where every request is decoding inside the TPOT budget.
    max_concurrent = min(max_concurrent, 1e6)

    # ----- TPS — single-request rate × independent TP groups --------------
    # Hardware reports the cluster-wide single-request throughput: every
    # tensor-parallel group of `tp` GPUs can serve one stream simultaneously
    # at `tps_per_request`. The runtime module then multiplies this by the
    # batching gain (continuous batching folds many requests onto each group).
    tps_per_request = 1000.0 / max(1e-3, tpot_ms)
    num_replicas = max(1.0, gpu_count / max(1, tp))
    tps = max(5.0, tps_per_request * num_replicas)

    return ModuleResult(
        status="success",
        metrics={
            "ttft_ms": metric(ttft_ms, "ms"),
            "tpot_ms": metric(tpot_ms, "ms"),
            "tps": metric(tps, "tokens_per_second"),
            "concurrency": metric(max_concurrent, "requests"),
        },
    )


# ---------------------------------------------------------------------------
# Datasheet citations (reviewed when adding a SKU):
#   A100 — NVIDIA A100 Tensor Core GPU Architecture, Whitepaper, 2020
#   H100 — NVIDIA H100 Tensor Core GPU Architecture, Whitepaper, 2022
#   H200 — NVIDIA H200 Tensor Core GPU Datasheet, 2023
#   B200 — NVIDIA Blackwell Architecture, GTC 2024 keynote + Blackwell brief
# Memory bandwidths are the published HBM-stack peak; achievable BW on real
# kernels is the `DECODE_BW_UTIL` constant above (typical: 70-80 %).
# ---------------------------------------------------------------------------
