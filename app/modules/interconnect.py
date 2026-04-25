"""Interconnect module — physics-based comms cost.

Replaces the prior topology+fabric multiplier table with calculations rooted
in the actual messages tensor-parallel (TP) and pipeline-parallel (PP)
inference runs send across the fabric:

  * TP all-reduce per matmul  — every transformer layer issues a ring
    all-reduce on the activations after MLP/attention, so the steady-state
    cost is `2 * (tp - 1) / tp * activation_bytes / fabric_bw_per_link`
    (the standard ring-allreduce formula).
  * PP send/recv between stages — adds `(pp - 1)` activation hops and
    creates a pipeline bubble that scales with stage count.
  * Fabric latency  — RTT for the physical link (NVLink ≈ 1 µs, IB NDR
    ≈ 1.5 µs, RoCE/Ethernet ≈ 3 µs at the switch).

The result is layered onto the upstream TTFT/TPOT/TPS so the cost shows up
exactly where it manifests on a real cluster: small effect on TTFT (one
allreduce per layer × prompt depth), measurable effect on TPOT (one
allreduce per layer × per token), and a throughput tax on TPS.
"""

from __future__ import annotations

from app.modules.common import ModuleResult, metric


# ---------------------------------------------------------------------------
# Per-link bandwidth (bidirectional, GB/s) and per-hop latency (µs).
# Values are from published switch + NIC datasheets.
# ---------------------------------------------------------------------------
# fmt: off
INTRA_NODE_BW_GBPS: dict[str, float] = {
    "nvlink":  900.0,   # NVLink 4 / NVSwitch on H100/H200 (450 GB/s × 2 dir)
    "nvlink5": 1800.0,  # Blackwell NVLink 5
    "pcie5":    128.0,  # PCIe Gen5 x16 bidirectional
    "pcie4":     64.0,
}

INTRA_NODE_LATENCY_US: dict[str, float] = {
    "nvlink":  1.0,
    "nvlink5": 0.8,
    "pcie5":   2.5,
    "pcie4":   3.0,
}

INTER_NODE_BW_GBPS: dict[str, float] = {
    "infiniband":     50.0,    # NDR 400 Gbps single port = 50 GB/s
    "infiniband_xdr":100.0,    # XDR 800 Gbps single port = 100 GB/s
    "ethernet":      12.5,     # 100 GbE = 12.5 GB/s
    "ethernet_400":  50.0,     # 400 GbE = 50 GB/s
    "rocev2":        25.0,     # 200 GbE RoCE common in cloud DCs
}

INTER_NODE_LATENCY_US: dict[str, float] = {
    "infiniband":     1.5,
    "infiniband_xdr": 1.2,
    "ethernet":       8.0,    # standard L2 switch hop
    "ethernet_400":   5.0,
    "rocev2":         3.0,
}

TOPOLOGY_HOP_FACTOR: dict[str, float] = {
    "single_node": 1.0,   # no inter-node hops at all
    "leaf_spine":  1.5,   # 1.5 hops average (some intra-leaf, some via spine)
    "fat_tree":    2.0,   # multi-tier — every cross-pod hop is ~2 switches
}
# fmt: on

# Default model-shape constants used to estimate activation tensor sizes.
# These come straight from the hardware module so the modules agree.
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
    import re

    m = re.search(r"(\d+(?:\.\d+)?)\s*[bB]", fam)
    if not m:
        return DEFAULT_HIDDEN_DIM
    size_b = float(m.group(1))
    # Pick the closest published config
    closest = min(HIDDEN_DIM_BY_PARAM_GB.keys(), key=lambda k: abs(k - size_b))
    return HIDDEN_DIM_BY_PARAM_GB[closest]


def _layers_for(workload: dict) -> int:
    fam = str(workload.get("model_family", "llama-70b")).lower()
    import re

    m = re.search(r"(\d+(?:\.\d+)?)\s*[bB]", fam)
    if not m:
        return 80
    size_b = float(m.group(1))
    if size_b < 10:   return 32
    if size_b < 30:   return 40
    if size_b < 100:  return 80
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

    # Pick the bandwidth/latency that actually applies to TP all-reduce.
    # If TP fits within a node (8 GPUs), use intra-node fabric. Otherwise the
    # comms cross node boundaries and we pay inter-node bandwidth.
    gpus_per_node = 8
    crosses_nodes = tp > gpus_per_node
    bw_GBps = (
        INTER_NODE_BW_GBPS.get(inter_fabric, 12.5)
        if crosses_nodes
        else INTRA_NODE_BW_GBPS.get(intra_fabric, 64.0)
    )
    hop_lat_us = (
        INTER_NODE_LATENCY_US.get(inter_fabric, 8.0)
        if crosses_nodes
        else INTRA_NODE_LATENCY_US.get(intra_fabric, 2.5)
    )
    hop_factor = TOPOLOGY_HOP_FACTOR.get(topology, 1.0)

    # ----- TP all-reduce cost per layer ------------------------------------
    # Activation tensor in a transformer layer ≈ batch * seq_len * hidden_dim
    # bytes. For one token's decode, batch=1, seq=1, so the tensor is
    # `hidden_dim * bytes_per_elem`. Ring all-reduce moves
    # 2 * (n-1)/n * size, and we do this twice per layer (after attention,
    # after MLP) — so the multiplier is roughly 4 * (n-1)/n.
    hidden_dim = _hidden_dim_for(workload)
    layers = _layers_for(workload)
    activation_bytes_one_token = hidden_dim * bytes_per_elem
    if tp > 1:
        ring_factor = 2.0 * (tp - 1) / tp           # ring all-reduce traffic
        bytes_per_allreduce = ring_factor * activation_bytes_one_token
        # Two all-reduces per layer (attention output, MLP output)
        bytes_per_layer = 2.0 * bytes_per_allreduce
        time_per_layer_s = bytes_per_layer / (bw_GBps * 1e9)
        # Latency floor: every all-reduce pays one switch hop one-way RTT.
        # Multiply by 2 for round-trip and `hop_factor` for tier crossings.
        latency_per_allreduce_s = (hop_lat_us * 2 * hop_factor) * 1e-6
        time_per_layer_s += 2.0 * latency_per_allreduce_s
    else:
        time_per_layer_s = 0.0

    # Per-token decode cost from comms:
    decode_comms_ms = time_per_layer_s * layers * 1000.0
    # Prefill comms cost: same allreduces × prompt depth (matmuls fan out
    # over the prompt). For a length-N prompt this scales linearly.
    prefill_comms_ms = decode_comms_ms * prompt_tokens

    # ----- Pipeline-parallel send/recv hops --------------------------------
    if pp > 1:
        # Each token traverses (pp-1) stage boundaries. For decode, this is
        # one hop per stage per token.
        pp_hop_lat_us = hop_lat_us * hop_factor
        pp_decode_ms = (pp - 1) * pp_hop_lat_us * 1e-3
        # Pipeline "bubble" only matters for prefill (filling the pipe). The
        # bubble's wall-clock is roughly (pp-1) * stage_compute_time, but
        # we approximate it as a 5 % tax on prefill per stage above 1.
        pp_prefill_ms = upstream_ttft * 0.05 * (pp - 1)
    else:
        pp_decode_ms = 0.0
        pp_prefill_ms = 0.0

    # ----- Layer onto upstream metrics -------------------------------------
    ttft = upstream_ttft + prefill_comms_ms + pp_prefill_ms
    tpot = upstream_tpot + decode_comms_ms + pp_decode_ms

    # Throughput penalty: each request is now slower per token by the comms
    # ratio. tps scales by (old_tpot / new_tpot).
    tpot_ratio = upstream_tpot / max(1e-3, tpot)
    tps = upstream_tps * tpot_ratio

    # The latency_scale / throughput_scale coefficients let calibration nudge
    # the numbers without us editing the formula.
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
