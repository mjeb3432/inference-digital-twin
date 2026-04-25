"""Interconnect module — physics-based comms cost.

Models the cost of tensor-parallel all-reduce + pipeline-parallel send/recv
that dominate the wire-time of a sharded LLM inference run.

References:
  [Megatron]   Shoeybi et al., 2019 — TP all-reduce pattern (eq. 4).
                Two all-reduces per transformer layer (post-attention,
                post-MLP), each moves 2·(N-1)/N · activation_size bytes
                via the standard ring algorithm.
  [Patarasuk08] Patarasuk & Yuan, "Bandwidth Optimal All-reduce Algorithms
                for Clusters of Workstations", JPDC 2009 — derivation of
                the 2·(N-1)/N optimal-bandwidth formula for ring all-reduce.
  [NCCL]       NVIDIA Collective Communications Library docs — measured
                NVLink/IB latencies + bandwidth utilisation factors.
  [GPipe]      Huang et al., "GPipe: Efficient Training of Giant Neural
                Networks using Pipeline Parallelism", NeurIPS 2019 —
                bubble formula (eq. 1).
  [vLLM]       Kwon et al., 2023 — measured comm/compute overlap for
                inference on H100 NVLink (~70-80 % overlap typical).
"""

from __future__ import annotations

import re

from app.modules.common import ModuleResult, metric


# ---------------------------------------------------------------------------
# Per-link bandwidth (uni-directional GB/s) and per-hop latency (µs).
# Numbers from public switch/NIC datasheets.
# ---------------------------------------------------------------------------
# fmt: off
INTRA_NODE_BW_GBPS: dict[str, float] = {
    "nvlink":  450.0,    # NVLink 4 (Hopper) — 450 GB/s per direction
    "nvlink5": 900.0,    # NVLink 5 (Blackwell) — 900 GB/s per direction
    "pcie5":    64.0,    # PCIe Gen5 x16 per direction
    "pcie4":    32.0,
}
INTRA_NODE_LATENCY_US: dict[str, float] = {
    "nvlink":  1.0,
    "nvlink5": 0.8,
    "pcie5":   2.5,
    "pcie4":   3.0,
}
INTER_NODE_BW_GBPS: dict[str, float] = {
    "infiniband":     50.0,    # NDR 400 Gbps per port
    "infiniband_xdr":100.0,    # XDR 800 Gbps per port
    "ethernet":      12.5,     # 100 GbE
    "ethernet_400":  50.0,     # 400 GbE
    "rocev2":        25.0,     # 200 GbE RoCEv2 typical
}
INTER_NODE_LATENCY_US: dict[str, float] = {
    "infiniband":     1.5,
    "infiniband_xdr": 1.2,
    "ethernet":       8.0,
    "ethernet_400":   5.0,
    "rocev2":         3.0,
}
TOPOLOGY_HOP_FACTOR: dict[str, float] = {
    "single_node": 1.0,
    "leaf_spine":  1.5,
    "fat_tree":    2.0,
}
# fmt: on


# Comm/compute overlap factor [vLLM §6.3, NCCL]. Modern frameworks overlap
# the all-reduce of layer N with the matmul of layer N+1 via async kernels
# and CUDA streams. Typical overlap on H100 NVLink: 70-80 %. So the visible
# wall-time penalty is only `(1 - overlap)` of the raw comms cost.
COMM_COMPUTE_OVERLAP = 0.75


# Hidden-dim defaults by model size (parameter count), used when the
# upstream stages don't pass explicit architecture data.
HIDDEN_DIM_BY_PARAM_GB: dict[float, int] = {
    7.0:    4096,
    13.0:   5120,
    70.0:   8192,
    405.0:  16384,
}
DEFAULT_HIDDEN_DIM = 8192
PRECISION_BYTES = {"fp16": 2.0, "bf16": 2.0, "fp8": 1.0, "int8": 1.0, "int4": 0.5}


def _hidden_dim_for(workload: dict) -> int:
    fam = str(workload.get("model_family", "llama-70b")).lower()
    m = re.search(r"(\d+(?:\.\d+)?)\s*[bB]", fam)
    if not m:
        return DEFAULT_HIDDEN_DIM
    size_b = float(m.group(1))
    closest = min(HIDDEN_DIM_BY_PARAM_GB.keys(), key=lambda k: abs(k - size_b))
    return HIDDEN_DIM_BY_PARAM_GB[closest]


def _layers_for(workload: dict) -> int:
    fam = str(workload.get("model_family", "llama-70b")).lower()
    m = re.search(r"(\d+(?:\.\d+)?)\s*[bB]", fam)
    if not m:
        return 80
    size_b = float(m.group(1))
    if size_b < 10:
        return 32
    if size_b < 30:
        return 40
    if size_b < 100:
        return 80
    return 126


def run(input_payload: dict, coefficients: dict, upstream: dict[str, dict]) -> ModuleResult:
    interconnect = input_payload["interconnect"]
    workload = input_payload["workload"]
    runtime = input_payload["runtime"]
    hardware = input_payload["hardware"]

    upstream_ttft = upstream["ttft_ms"]["value"]
    upstream_tpot = upstream["tpot_ms"]["value"]
    upstream_tps = upstream["tps"]["value"]

    tp = max(1, int(runtime.get("tensor_parallelism", 1)))
    pp = max(1, int(runtime.get("pipeline_parallelism", 1)))
    precision = str(runtime.get("precision", "bf16")).lower()
    bytes_per_elem = PRECISION_BYTES.get(precision, 2.0)
    prompt_tokens = max(1, int(workload.get("prompt_tokens", 512)))
    gpu_count = max(1, int(hardware.get("gpu_count", 1)))

    intra_fabric = str(interconnect.get("intra_node_fabric", "nvlink")).lower()
    inter_fabric = str(interconnect.get("inter_node_fabric", "infiniband")).lower()
    topology = str(interconnect.get("topology_profile", "single_node")).lower()

    # Pick the bandwidth/latency that applies to the TP all-reduce. If the
    # TP group fits within a node (typically 8 GPUs in modern HGX/DGX), use
    # NVLink. Otherwise comms cross the inter-node fabric.
    gpus_per_node = 8
    crosses_nodes = tp > gpus_per_node
    bw_GBps = (
        INTER_NODE_BW_GBPS.get(inter_fabric, 12.5)
        if crosses_nodes
        else INTRA_NODE_BW_GBPS.get(intra_fabric, 32.0)
    )
    hop_lat_us = (
        INTER_NODE_LATENCY_US.get(inter_fabric, 8.0)
        if crosses_nodes
        else INTRA_NODE_LATENCY_US.get(intra_fabric, 2.5)
    )
    hop_factor = TOPOLOGY_HOP_FACTOR.get(topology, 1.0)

    # ----- TP all-reduce cost per layer ------------------------------------
    # Activation tensor moved per all-reduce (decode at batch=1):
    #   activation_bytes = hidden_dim × bytes_per_elem
    # Ring all-reduce moves 2·(N−1)/N × activation_bytes [Patarasuk08].
    # Two all-reduces per layer (after attention, after MLP) [Megatron eq. 4].
    hidden_dim = _hidden_dim_for(workload)
    layers = _layers_for(workload)
    activation_bytes_one_token = hidden_dim * bytes_per_elem
    if tp > 1:
        ring_factor = 2.0 * (tp - 1) / tp
        bytes_per_allreduce = ring_factor * activation_bytes_one_token
        bytes_per_layer = 2.0 * bytes_per_allreduce
        # Bandwidth-limited time component
        time_per_layer_bw_s = bytes_per_layer / (bw_GBps * 1e9)
        # Latency floor — every all-reduce pays one switch hop one-way
        # (× 2 for round trip × hop_factor for cross-tier hops)
        time_per_layer_lat_s = 2.0 * (hop_lat_us * 2.0 * hop_factor) * 1e-6
        time_per_layer_s = time_per_layer_bw_s + time_per_layer_lat_s
    else:
        time_per_layer_s = 0.0

    # Apply comm/compute overlap [vLLM §6.3, NCCL] — the visible wall-time
    # penalty is only the un-overlapped portion of comms.
    overlap_residual = 1.0 - COMM_COMPUTE_OVERLAP
    decode_comms_ms = time_per_layer_s * layers * overlap_residual * 1000.0

    # Prefill: linear scan of prompt tokens. The all-reduce per layer is
    # for a (prompt_tokens × hidden) activation tensor, so the cost scales
    # linearly with prompt length for the bandwidth term. Latency is fixed
    # per all-reduce (small).
    if tp > 1:
        prefill_bw_s = (
            bytes_per_layer * prompt_tokens / (bw_GBps * 1e9)
        )
        prefill_comms_ms = (
            (prefill_bw_s + time_per_layer_lat_s) * layers * overlap_residual * 1000.0
        )
    else:
        prefill_comms_ms = 0.0

    # ----- Pipeline-parallel send/recv hops --------------------------------
    # GPipe / Megatron-2: each token must traverse (PP − 1) stage boundaries.
    # Pipeline bubble for prefill: (PP − 1) × stage_compute_time / microbatches
    # — for inference workloads with continuous batching, microbatches are
    # large, so the bubble is mostly negligible. For decode, just the
    # send/recv latency between stages.
    if pp > 1:
        pp_hop_lat_us = hop_lat_us * hop_factor
        pp_decode_ms = (pp - 1) * pp_hop_lat_us * 1e-3
        # Conservative bubble estimate: 8 % of prefill per stage above 1
        pp_prefill_ms = upstream_ttft * 0.08 * (pp - 1)
    else:
        pp_decode_ms = 0.0
        pp_prefill_ms = 0.0

    # ----- Layer onto upstream metrics -------------------------------------
    ttft = upstream_ttft + prefill_comms_ms + pp_prefill_ms
    tpot = upstream_tpot + decode_comms_ms + pp_decode_ms

    # Throughput penalty: each request is now slower per token, so tps
    # scales by the ratio of old TPOT to new TPOT.
    tpot_ratio = upstream_tpot / max(1e-3, tpot)
    tps = upstream_tps * tpot_ratio

    # Calibration coefficients
    ttft *= float(coefficients.get("latency_scale", 1.0))
    tpot *= float(coefficients.get("latency_scale", 1.0))
    tps *= float(coefficients.get("throughput_scale", 1.0))

    return ModuleResult(
        status="success",
        metrics={
            "ttft_ms": metric(ttft, "ms"),
            "tpot_ms": metric(tpot, "ms"),
            "tps": metric(tps, "tokens_per_second"),
        },
    )
