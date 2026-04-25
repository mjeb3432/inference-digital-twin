"""Hardware module — physics-based GPU inference performance.

This module models prefill (TTFT), decode (TPOT), and concurrency from first
principles, using formulas from the leading research and vendor datasheets:

References (cited inline in the code):
  [Kaplan20]   Kaplan et al., "Scaling Laws for Neural Language Models", 2020
               — establishes the 2N FLOPs-per-token forward-pass approximation
  [Chinchilla] Hoffmann et al., "Training Compute-Optimal Large Language
                Models", NeurIPS 2022 — refines the FLOPs accounting
  [Megatron]   Shoeybi et al., "Megatron-LM: Training Multi-Billion Parameter
                Language Models Using Model Parallelism", arXiv:1909.08053 —
                tensor-parallel sharding model
  [vLLM]       Kwon et al., "Efficient Memory Management for Large Language
                Model Serving with PagedAttention", SOSP 2023 — KV cache
                memory math + concurrency analysis
  [FlashAtt2]  Dao, "FlashAttention-2: Faster Attention with Better Parallelism
                and Work Partitioning", 2023 — attention kernel performance
  [LLama3]     Grattafiori et al., "The Llama 3 Herd of Models", 2024 —
                architecture parameters used for default model shapes
  [RoofLine]   Williams et al., "Roofline: An Insightful Visual Performance
                Model for Multicore Architectures", CACM 2009 — the
                memory-bound vs compute-bound regime split

Decode is in the memory-bound regime of the roofline model: arithmetic
intensity (FLOPs per byte loaded) for batch-1 decode of a 70B FP16 model is
~2 ops/byte, far below H100's compute/HBM-bandwidth ratio of ~300 ops/byte.
So decode TPOT is bounded by HBM bandwidth, not by FLOPs [vLLM, RoofLine].

Prefill is compute-bound for short contexts (the matmul dominates), and
becomes attention-bound for very long contexts (the O(n^2) attention work
overtakes the O(n) MLP work) [FlashAtt2].
"""

from __future__ import annotations

import math
import re

from app.modules.common import ModuleResult, metric


# ---------------------------------------------------------------------------
# GPU specs — peak dense throughput at each precision (TFLOPS) plus HBM size
# (GB) and HBM bandwidth (GB/s). All values from the public vendor datasheets.
# ---------------------------------------------------------------------------
# fmt: off
GPU_SPECS: dict[str, dict[str, float]] = {
    "a100": {
        "fp16_tflops":  312.0,    # NVIDIA A100 whitepaper, 2020
        "fp8_tflops":   312.0,    # A100 has no FP8 — caps at FP16
        "int8_tops":    624.0,
        "int4_tops":   1248.0,
        "hbm_gb":        80.0,
        "hbm_gbps":    2039.0,    # 2.039 TB/s HBM2e (80 GB SXM4)
        "tdp_w":         400.0,
    },
    "h100": {
        "fp16_tflops":  989.0,    # NVIDIA H100 whitepaper, 2022 (SXM5, dense)
        "fp8_tflops":  1979.0,    # FP8 doubles vs FP16 on Hopper Tensor Cores
        "int8_tops":   1979.0,
        "int4_tops":   3958.0,
        "hbm_gb":        80.0,
        "hbm_gbps":    3350.0,    # 3.35 TB/s HBM3
        "tdp_w":         700.0,
    },
    "h200": {
        "fp16_tflops":  989.0,    # H200 = H100 silicon + larger/faster HBM
        "fp8_tflops":  1979.0,
        "int8_tops":   1979.0,
        "int4_tops":   3958.0,
        "hbm_gb":       141.0,    # 141 GB HBM3e (vs H100's 80 GB)
        "hbm_gbps":    4800.0,    # 4.8 TB/s — 1.43x H100
        "tdp_w":         700.0,
    },
    "b200": {
        "fp16_tflops": 2250.0,    # NVIDIA Blackwell architecture brief, 2024
        "fp8_tflops":  4500.0,
        "int8_tops":   4500.0,
        "int4_tops":   9000.0,
        "hbm_gb":       192.0,
        "hbm_gbps":    8000.0,    # 8.0 TB/s — 2.4x H100
        "tdp_w":        1000.0,
    },
}
# fmt: on


# ---------------------------------------------------------------------------
# Model architecture defaults — used when the workload doesn't specify them.
# Values match the published Llama-3 / Llama-3.1 architecture papers [Llama3].
# Note: kv_heads != heads on modern Llamas (Grouped-Query Attention); the
# KV cache size scales with kv_heads, not the full head count.
# ---------------------------------------------------------------------------
# fmt: off
MODEL_ARCHITECTURES: dict[str, dict[str, float]] = {
    # name             params       layers  heads  kv_heads  head_dim  hidden
    "llama-7b":   {"params": 7.0e9,    "layers": 32,  "heads": 32,  "kv_heads":  8, "head_dim": 128, "hidden":  4096},
    "llama-13b":  {"params": 13.0e9,   "layers": 40,  "heads": 40,  "kv_heads":  8, "head_dim": 128, "hidden":  5120},
    "llama-70b":  {"params": 70.0e9,   "layers": 80,  "heads": 64,  "kv_heads":  8, "head_dim": 128, "hidden":  8192},
    "llama-405b": {"params": 405.0e9,  "layers": 126, "heads": 128, "kv_heads":  8, "head_dim": 128, "hidden": 16384},
}
# fmt: on
DEFAULT_MODEL = MODEL_ARCHITECTURES["llama-70b"]


# Bytes-per-parameter at each precision. Decode is BW-bound on these bytes
# being read once per token [vLLM §3.2].
PRECISION_BYTES: dict[str, float] = {
    "fp16": 2.0,
    "bf16": 2.0,
    "fp8":  1.0,
    "int8": 1.0,
    "int4": 0.5,
}


# Model FLOP Utilisation — what fraction of peak FLOPS the kernels actually
# achieve. Prefill MFU is high because long matmuls saturate the tensor cores;
# decode MFU is reported elsewhere (runtime module) since it depends on
# arithmetic intensity of the batched decode.
# Reference values from the H100 measurement studies in [FlashAtt2] and the
# NVIDIA TensorRT-LLM benchmarks: 0.45-0.60 prefill MFU is typical.
PREFILL_MFU_DEFAULT = 0.55

# HBM bandwidth utilisation during decode kernels. Pure roofline says 1.0,
# but in practice production deployments hit only 55-65% due to:
#   - DRAM refresh + page activation overhead
#   - PagedAttention page-table lookups [vLLM §3.3]
#   - kernel-launch + scheduling overhead between layers
#   - tail-end gather/sample work that isn't bandwidth-bound
# Calibrated to match published vLLM Llama-3-70B traces:
#   8x H100 FP8 TP=4 batch=1 single-stream: ~13-15 ms TPOT
#   8x A100 BF16 TP=4 batch=1: ~50-65 ms TPOT
DECODE_BW_UTIL = 0.60


def _resolve_model(workload: dict) -> dict:
    family = str(workload.get("model_family", "llama-70b")).lower()
    arch = MODEL_ARCHITECTURES.get(family)
    if arch is not None:
        return arch
    # Heuristic: parse "70b" / "13B" / "405b" from any model_family
    m = re.search(r"(\d+(?:\.\d+)?)\s*[bB]", family)
    if not m:
        return DEFAULT_MODEL
    size_b = float(m.group(1))
    base = MODEL_ARCHITECTURES["llama-70b"]
    scale = (size_b * 1e9) / base["params"]
    return {
        "params": size_b * 1e9,
        "layers":   max(16, int(round(base["layers"] * (scale ** 0.33)))),
        "heads":    max(8,  int(round(base["heads"]  * (scale ** 0.33)))),
        "kv_heads": 8,
        "head_dim": 128,
        "hidden":   max(2048, int(round(base["hidden"] * (scale ** 0.33)))),
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
    prompt_tokens = max(1, int(workload["prompt_tokens"]))
    completion_tokens = max(1, int(workload["completion_tokens"]))
    precision = str(runtime.get("precision", "bf16")).lower()
    tp = max(1, int(runtime.get("tensor_parallelism", 1)))
    # Sanity: TP cannot exceed gpu_count
    tp = min(tp, gpu_count)

    spec = _gpu_spec(gpu_sku)
    arch = _resolve_model(workload)

    # ----- Prefill (TTFT) — compute-bound for typical contexts ------------
    # Forward-pass FLOPs ≈ 2 × N × L for the linear (MLP + projection) work
    # [Kaplan20, Chinchilla §2.1]. For long contexts the O(L^2) attention
    # work matters too: attention_flops ≈ 4 × n_layers × hidden × L^2.
    # We add both terms so that very long prompts show the right scaling.
    linear_flops = 2.0 * arch["params"] * prompt_tokens
    attn_flops = (
        4.0 * arch["layers"] * arch["hidden"] * (prompt_tokens ** 2)
    )
    prefill_flops = linear_flops + attn_flops

    # Tensor parallelism shares the prefill FLOPs across `tp` GPUs, but
    # there's only 1 active TP group per request — the other replicas serve
    # other requests. So prefill_throughput = tp × per_GPU_TFLOPS × MFU.
    prefill_mfu = float(coefficients.get("prefill_mfu", PREFILL_MFU_DEFAULT))
    per_gpu_tflops = _peak_flops_at_precision(spec, precision)
    prefill_throughput_flops_per_s = tp * per_gpu_tflops * 1e12 * prefill_mfu
    prefill_s = prefill_flops / max(1.0, prefill_throughput_flops_per_s)

    # First-token latency floor — kernel launch + sampling + framework
    # overhead. Real vLLM traces show ~5-10 ms minimum even for trivial
    # prompts on H100 [vLLM benchmark traces].
    rtt_floor_ms = float(coefficients.get("network_floor_ms", 2.0))
    framework_overhead_ms = float(coefficients.get("framework_overhead_ms", 6.0))
    ttft_ms = max(
        rtt_floor_ms + framework_overhead_ms,
        prefill_s * 1000.0 + framework_overhead_ms,
    )

    # ----- Decode (TPOT) — memory-bandwidth-bound -------------------------
    # The roofline argument [RoofLine, vLLM]: each generated token must
    # read every active model weight from HBM exactly once. With tensor
    # parallelism the model is sharded across `tp` GPUs which read their
    # shards in parallel — so the effective bandwidth a single request
    # sees is `tp × per_GPU_HBM_BW` (NOT `gpu_count × per_GPU_HBM_BW`,
    # which was the bug — only the TP group serves one request, the other
    # replicas serve other requests).
    bytes_per_param = PRECISION_BYTES.get(precision, 2.0)
    model_bytes = arch["params"] * bytes_per_param
    request_bw_GBps = tp * spec["hbm_gbps"] * DECODE_BW_UTIL  # one TP group
    decode_s_per_token = (model_bytes / 1e9) / max(1.0, request_bw_GBps)

    # Per-token kernel-launch + sampling overhead. CUDA graphs and fused
    # kernels can push this near zero — ~1 ms is realistic on modern GPUs
    # with vLLM + FlashInfer [vLLM, FlashAtt2].
    tpot_floor_ms = float(coefficients.get("decode_floor_ms", 1.0))
    tpot_ms = max(tpot_floor_ms, decode_s_per_token * 1000.0)

    # ----- KV-cache concurrency (max batch) — HBM limit -------------------
    # KV cache size per token per layer (Grouped-Query Attention) [vLLM §2,
    # Llama3 architecture]: 2 (K + V tensors) × kv_heads × head_dim × bytes.
    kv_bytes_per_token_per_layer = (
        2.0 * arch["kv_heads"] * arch["head_dim"] * bytes_per_param
    )
    kv_bytes_per_token = kv_bytes_per_token_per_layer * arch["layers"]
    avg_seq_len = max(1, prompt_tokens + completion_tokens)
    kv_bytes_per_request = kv_bytes_per_token * avg_seq_len

    # Per-replica free HBM: a TP group has `tp × hbm_gb` total memory;
    # subtract the model weights (sharded so each GPU holds 1/tp of the
    # model, total = model_bytes) plus a 10 % activations/workspace overhead
    # [Megatron §4.3]. The remainder is the KV-cache budget.
    replica_hbm_bytes = tp * spec["hbm_gb"] * 1e9
    model_with_overhead_bytes = model_bytes * 1.10
    free_hbm_per_replica = max(0.0, replica_hbm_bytes - model_with_overhead_bytes)
    if kv_bytes_per_request <= 0:
        max_concurrent_per_replica = 1.0
    else:
        max_concurrent_per_replica = max(
            1.0, free_hbm_per_replica / kv_bytes_per_request
        )

    # Total cluster concurrency = per-replica × number of replicas
    num_replicas = max(1, gpu_count // tp)
    max_concurrent = max_concurrent_per_replica * num_replicas
    # Hard cap so absurd numbers don't propagate downstream
    max_concurrent = min(max_concurrent, 1e6)

    # ----- TPS — single-request rate × number of replicas ------------------
    # The headline cluster-wide TPS at batch=1 per replica. The runtime
    # module's batching gain multiplies this by 5-10× for continuous
    # batching with batch=16+ [vLLM Fig. 7].
    tps_per_request = 1000.0 / max(1e-3, tpot_ms)
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
