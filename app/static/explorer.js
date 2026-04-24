const INTRO_STORAGE_KEY = "idt.sandboxIntroHidden";

const STAGE_FLOW = [
  {
    id: "gpu",
    title: "GPU Silicon",
    helper: "Pick the accelerator family for the entire build.",
  },
  {
    id: "rack",
    title: "Rack Density",
    helper: "Define GPU density and host profile per node.",
  },
  {
    id: "fabric",
    title: "Interconnect",
    helper: "Choose how chips and nodes communicate.",
  },
  {
    id: "power",
    title: "Power Source",
    helper: "Set your primary energy strategy.",
  },
  {
    id: "runtime",
    title: "Runtime Layer",
    helper: "Select serving stack, precision, and CUDA launch strategy.",
  },
  {
    id: "orchestration",
    title: "Control Plane",
    helper: "Pick scheduling, autoscaling, and failure policy.",
  },
  {
    id: "workload",
    title: "Workload Profile",
    helper: "Target the workload shape this cluster should satisfy.",
  },
];

const BLOCK_CATALOG = [
  {
    id: "gpu_a100",
    stage: "gpu",
    label: "A100 80GB",
    detail: "Mature baseline architecture",
    patch: {
      hardware: {
        gpu_sku: "A100",
        memory_gb_per_gpu: 80,
      },
    },
  },
  {
    id: "gpu_h100",
    stage: "gpu",
    label: "H100 80GB",
    detail: "Higher throughput for latency-sensitive serving",
    patch: {
      hardware: {
        gpu_sku: "H100",
        memory_gb_per_gpu: 80,
      },
    },
  },
  {
    id: "gpu_h200",
    stage: "gpu",
    label: "H200 141GB",
    detail: "Large-memory Hopper deployment",
    patch: {
      hardware: {
        gpu_sku: "H200",
        memory_gb_per_gpu: 141,
      },
    },
  },
  {
    id: "gpu_b200",
    stage: "gpu",
    label: "B200 192GB",
    detail: "Latest high-density Blackwell profile",
    patch: {
      hardware: {
        gpu_sku: "B200",
        memory_gb_per_gpu: 192,
      },
    },
  },
  {
    id: "rack_pcie4",
    stage: "rack",
    label: "4x PCIe Node",
    detail: "Balanced host, lower rack thermal density",
    patch: {
      hardware: {
        gpu_count: 4,
        host_cpu_class: "x86_64-balanced",
      },
    },
  },
  {
    id: "rack_hgx8",
    stage: "rack",
    label: "8x HGX Node",
    detail: "Common hyperscale training + inference pod",
    patch: {
      hardware: {
        gpu_count: 8,
        host_cpu_class: "x86_64-highfreq",
      },
    },
  },
  {
    id: "rack_dense16",
    stage: "rack",
    label: "16x Dense Node",
    detail: "Extreme density for max throughput cells",
    patch: {
      hardware: {
        gpu_count: 16,
        host_cpu_class: "x86_64-dense",
      },
    },
  },
  {
    id: "fabric_nvlink_ib",
    stage: "fabric",
    label: "NVLink + InfiniBand",
    detail: "Low-latency intra-node and high-throughput east-west",
    patch: {
      interconnect: {
        intra_node_fabric: "nvlink",
        inter_node_fabric: "infiniband",
        topology_profile: "leaf_spine",
      },
    },
  },
  {
    id: "fabric_nvlink_fattree",
    stage: "fabric",
    label: "NVLink + Fat Tree",
    detail: "Resilient fabric for larger multi-node scale",
    patch: {
      interconnect: {
        intra_node_fabric: "nvlink",
        inter_node_fabric: "infiniband",
        topology_profile: "fat_tree",
      },
    },
  },
  {
    id: "fabric_pcie_eth",
    stage: "fabric",
    label: "PCIe + Ethernet",
    detail: "Cost-first profile with commodity networking",
    patch: {
      interconnect: {
        intra_node_fabric: "pcie",
        inter_node_fabric: "ethernet",
        topology_profile: "leaf_spine",
      },
    },
  },
  {
    id: "power_gas_turbine",
    stage: "power",
    label: "Natural Gas Turbine",
    detail: "Dispatchable onsite generation",
    patch: {
      environment: {
        region: "us-south-1",
        power_price_usd_per_kwh: 0.09,
        pue: 1.28,
      },
      energy_system: {
        primary_source: "natural_gas",
        renewable_share_pct: 8,
        onsite_generation_mw: 18,
        storage_mwh: 0,
      },
    },
  },
  {
    id: "power_solar_bess",
    stage: "power",
    label: "Solar + BESS",
    detail: "High renewables with storage smoothing",
    patch: {
      environment: {
        region: "us-southwest-1",
        power_price_usd_per_kwh: 0.06,
        pue: 1.16,
      },
      energy_system: {
        primary_source: "solar",
        renewable_share_pct: 82,
        onsite_generation_mw: 36,
        storage_mwh: 120,
      },
    },
  },
  {
    id: "power_grid_hydro",
    stage: "power",
    label: "Grid + Hydro Mix",
    detail: "Grid-backed deployment in a low-carbon region",
    patch: {
      environment: {
        region: "us-northwest-1",
        power_price_usd_per_kwh: 0.08,
        pue: 1.14,
      },
      energy_system: {
        primary_source: "hydro",
        renewable_share_pct: 74,
        onsite_generation_mw: 4,
        storage_mwh: 40,
      },
    },
  },
  {
    id: "runtime_vllm_fp8",
    stage: "runtime",
    label: "vLLM FP8",
    detail: "Aggressive throughput with CUDA graphs enabled",
    patch: {
      runtime: {
        serving_stack: "vllm",
        precision: "fp8",
        tensor_parallelism: 8,
        pipeline_parallelism: 2,
        batching_strategy: "dynamic",
        cuda_graphs_enabled: true,
        kernel_launch_mode: "fused",
      },
    },
  },
  {
    id: "runtime_triton_bf16",
    stage: "runtime",
    label: "Triton BF16",
    detail: "Balanced latency profile for mixed workloads",
    patch: {
      runtime: {
        serving_stack: "triton",
        precision: "bf16",
        tensor_parallelism: 4,
        pipeline_parallelism: 1,
        batching_strategy: "dynamic",
        cuda_graphs_enabled: true,
        kernel_launch_mode: "balanced",
      },
    },
  },
  {
    id: "runtime_tensorrt_int8",
    stage: "runtime",
    label: "TensorRT INT8",
    detail: "Latency-focused serving with static batches",
    patch: {
      runtime: {
        serving_stack: "tensorrt-llm",
        precision: "int8",
        tensor_parallelism: 8,
        pipeline_parallelism: 1,
        batching_strategy: "static",
        cuda_graphs_enabled: true,
        kernel_launch_mode: "aggressive",
      },
    },
  },
  {
    id: "orchestration_predictive",
    stage: "orchestration",
    label: "Kubernetes Predictive",
    detail: "Forecast-led autoscaling with binpack placement",
    patch: {
      orchestration: {
        scheduler: "kubernetes",
        autoscaling_policy: "predictive",
        placement_strategy: "binpack",
        failure_policy: "retry-twice",
      },
    },
  },
  {
    id: "orchestration_latency",
    stage: "orchestration",
    label: "Kubernetes Latency HPA",
    detail: "Latency policy with conservative balancing",
    patch: {
      orchestration: {
        scheduler: "kubernetes",
        autoscaling_policy: "hpa-latency",
        placement_strategy: "balanced",
        failure_policy: "retry-once",
      },
    },
  },
  {
    id: "orchestration_ray",
    stage: "orchestration",
    label: "Ray Queue-Aware",
    detail: "Queue-sensitive spread placement",
    patch: {
      orchestration: {
        scheduler: "ray",
        autoscaling_policy: "queue-aware",
        placement_strategy: "spread",
        failure_policy: "checkpoint-restart",
      },
    },
  },
  {
    id: "workload_chat",
    stage: "workload",
    label: "Realtime Chat",
    detail: "Balanced prompt/response interactive workload",
    patch: {
      workload: {
        model_family: "llama-70b",
        workload_type: "chat",
        prompt_tokens: 1024,
        completion_tokens: 384,
        target_slo: {
          p95_ttft_ms_max: 1000,
          p95_tpot_ms_max: 150,
        },
        traffic_profile: {
          steady_qps: 24,
          burst_qps: 64,
        },
      },
    },
  },
  {
    id: "workload_code",
    stage: "workload",
    label: "Code Assistant",
    detail: "Longer context coding sessions",
    patch: {
      workload: {
        model_family: "llama-70b-code",
        workload_type: "code",
        prompt_tokens: 1536,
        completion_tokens: 512,
        target_slo: {
          p95_ttft_ms_max: 1100,
          p95_tpot_ms_max: 170,
        },
        traffic_profile: {
          steady_qps: 18,
          burst_qps: 52,
        },
      },
    },
  },
  {
    id: "workload_summary",
    stage: "workload",
    label: "Long Summarization",
    detail: "Long-context summarization bursts",
    patch: {
      workload: {
        model_family: "mixtral-8x22b",
        workload_type: "summarization",
        prompt_tokens: 3072,
        completion_tokens: 768,
        target_slo: {
          p95_ttft_ms_max: 1500,
          p95_tpot_ms_max: 230,
        },
        traffic_profile: {
          steady_qps: 10,
          burst_qps: 28,
        },
      },
    },
  },
];

const BLOCK_INDEX = Object.fromEntries(BLOCK_CATALOG.map((block) => [block.id, block]));

const DEFAULT_SCENARIO = {
  contract: "ScenarioSpec.v1",
  scenario_id: "sandbox-scenario",
  created_at: "",
  name: "Sandbox Scenario",
  workload: {
    model_family: "llama-70b",
    workload_type: "chat",
    prompt_tokens: 1024,
    completion_tokens: 384,
    target_slo: {
      p95_ttft_ms_max: 1000,
      p95_tpot_ms_max: 150,
    },
    traffic_profile: {
      steady_qps: 24,
      burst_qps: 64,
    },
  },
  hardware: {
    gpu_sku: "H200",
    gpu_count: 8,
    node_count: 2,
    host_cpu_class: "x86_64-highfreq",
    memory_gb_per_gpu: 141,
  },
  interconnect: {
    intra_node_fabric: "nvlink",
    inter_node_fabric: "infiniband",
    topology_profile: "leaf_spine",
  },
  runtime: {
    serving_stack: "vllm",
    precision: "fp8",
    tensor_parallelism: 8,
    pipeline_parallelism: 2,
    batching_strategy: "dynamic",
    cuda_graphs_enabled: true,
    kernel_launch_mode: "fused",
  },
  orchestration: {
    scheduler: "kubernetes",
    autoscaling_policy: "predictive",
    placement_strategy: "binpack",
    failure_policy: "retry-twice",
  },
  environment: {
    region: "us-west-2",
    power_price_usd_per_kwh: 0.1,
    pue: 1.18,
  },
  energy_system: {
    primary_source: "solar",
    renewable_share_pct: 62,
    onsite_generation_mw: 12,
    storage_mwh: 40,
  },
  calibration: {
    artifact_id: "coefficients-core-2026-03",
    artifact_version: "v1",
  },
};

const RACK_LAYOUT = [
  { id: "rack-a", label: "RACK-A", stages: ["gpu", "rack"], cablePath: "cable-a-b" },
  { id: "rack-b", label: "RACK-B", stages: ["fabric", "power"], cablePath: "cable-b-c" },
  { id: "rack-c", label: "RACK-C", stages: ["runtime"], cablePath: "cable-c-d" },
  { id: "rack-d", label: "RACK-D", stages: ["orchestration"], cablePath: "cable-d-e" },
  { id: "rack-e", label: "RACK-E", stages: ["workload"], cablePath: null },
  { id: "rack-f", label: "RACK-F", stages: [], cablePath: null },
];

const state = {
  activeCablePath: null,
  activeStageOverride: null,
  calibration: {
    artifact_id: "coefficients-core-2026-03",
    artifact_version: "v1",
  },
  clockTimer: null,
  lastMetrics: null,
  opsLog: [],
  presets: [],
  selectedByStage: {},
  selectedRackId: "rack-a",
  selectedStageId: null,
};

function clamp(value, min, max) {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function nowIso() {
  return new Date().toISOString();
}

function nowClock() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function isIntroVisible() {
  const intro = document.getElementById("sandboxIntro");
  return !!intro && !intro.classList.contains("is-hidden");
}

function isConsoleModalOpen() {
  const modal = document.getElementById("consoleModal");
  return !!modal && !modal.hidden;
}

function findRackByStage(stageId) {
  return RACK_LAYOUT.find((rack) => rack.stages.includes(stageId)) || null;
}

function stageSignal(stageId) {
  if (state.selectedByStage[stageId]) {
    return "healthy";
  }
  if (activeStage() === stageId) {
    return "warning";
  }
  return "critical";
}

function buildHostname(stageId, rackId, unitOffset = 0) {
  const rackToken = rackId.replace("rack-", "r");
  const stageToken = stageId.replace(/[^a-z]/g, "").slice(0, 4) || "node";
  return `tor-${rackToken}-${stageToken}-${String(unitOffset + 1).padStart(2, "0")}`;
}

function buildIp(stageId, rackId) {
  const stageIdx = Math.max(0, stageIndex(stageId));
  const rackIdx = Math.max(0, RACK_LAYOUT.findIndex((rack) => rack.id === rackId));
  return `10.${20 + rackIdx}.${40 + stageIdx}.${100 + rackIdx + stageIdx}`;
}

function renderNocClock() {
  const clock = document.getElementById("nocClock");
  if (!clock) return;
  clock.textContent = new Date().toLocaleTimeString([], { hour12: false });
}

function startNocClock() {
  renderNocClock();
  if (state.clockTimer) {
    clearInterval(state.clockTimer);
  }
  state.clockTimer = window.setInterval(renderNocClock, 1000);
}

function deepMerge(target, patch) {
  const output = target;
  Object.entries(patch).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      output[key] = value.slice();
      return;
    }
    if (value && typeof value === "object") {
      if (!output[key] || typeof output[key] !== "object") {
        output[key] = {};
      }
      deepMerge(output[key], value);
      return;
    }
    output[key] = value;
  });
  return output;
}

function fetchJson(url, options = {}) {
  return fetch(url, options).then(async (response) => {
    const payload = await response.json();
    if (!response.ok) {
      const message = payload.message || payload.detail || response.statusText;
      throw new Error(message);
    }
    return payload;
  });
}

function stageIndex(stageId) {
  return STAGE_FLOW.findIndex((stage) => stage.id === stageId);
}

function firstIncompleteIndex() {
  const first = STAGE_FLOW.findIndex((stage) => !state.selectedByStage[stage.id]);
  return first === -1 ? STAGE_FLOW.length : first;
}

function activeStage() {
  if (state.activeStageOverride) {
    return state.activeStageOverride;
  }
  const cursor = firstIncompleteIndex();
  if (cursor >= STAGE_FLOW.length) {
    return STAGE_FLOW[STAGE_FLOW.length - 1].id;
  }
  return STAGE_FLOW[cursor].id;
}

function clearDownstream(fromStageId) {
  const fromIndex = stageIndex(fromStageId);
  STAGE_FLOW.forEach((stage, index) => {
    if (index > fromIndex) {
      delete state.selectedByStage[stage.id];
    }
  });
}

function setStatusLine(message, id = "builderMessage") {
  const target = document.getElementById(id);
  if (target) {
    target.textContent = message;
  }
}

function renderAlertFeed() {
  const feed = document.getElementById("alertFeed");
  if (!feed) return;

  const alerts = [];
  const missing = missingStages();
  if (missing.length) {
    alerts.push({
      level: missing.length > 3 ? "critical" : "warning",
      message: `Provisioning incomplete: ${missing.join(", ")}`,
      time: nowClock(),
    });
  }

  state.opsLog
    .filter((item) => item.level === "warn" || item.level === "error")
    .slice(-6)
    .forEach((item) => {
      alerts.push({
        level: item.level === "error" ? "critical" : "warning",
        message: item.message,
        time: item.time,
      });
    });

  if (!alerts.length) {
    alerts.push({ level: "healthy", message: "All monitored systems nominal.", time: nowClock() });
  }

  feed.innerHTML = alerts
    .slice(0, 8)
    .map(
      (alert) => `
        <article class="alert-line ${alert.level}">
          <span class="mono">[${alert.time}]</span>
          <span>${alert.message}</span>
        </article>
      `,
    )
    .join("");
}

function renderTelemetryPanel() {
  const healthStroke = document.getElementById("healthRingStroke");
  const healthValue = document.getElementById("healthRingValue");
  const powerFill = document.getElementById("powerGaugeFill");
  const powerLabel = document.getElementById("powerGaugeLabel");
  const tempFill = document.getElementById("tempGaugeFill");
  const tempLabel = document.getElementById("tempGaugeLabel");
  const statusPill = document.getElementById("globalStatusPill");

  const completedStages = STAGE_FLOW.filter((stage) => !!state.selectedByStage[stage.id]).length;
  const completionPct = Math.round((completedStages / STAGE_FLOW.length) * 100);

  if (healthStroke) {
    const radius = 56;
    const circumference = 2 * Math.PI * radius;
    healthStroke.style.strokeDasharray = `${circumference}`;
    healthStroke.style.strokeDashoffset = `${circumference * (1 - completionPct / 100)}`;
  }
  if (healthValue) {
    healthValue.textContent = `${completionPct}%`;
  }

  const scenario = scenarioFromState();
  const estimatedWatts = scenario.hardware.node_count * scenario.hardware.gpu_count * 520 * scenario.environment.pue;
  const powerWatts = Number(state.lastMetrics?.power_watts?.value ?? estimatedWatts);
  const powerKw = powerWatts / 1000;
  const powerPct = clamp((powerKw / 160) * 100, 4, 100);

  if (powerFill) {
    powerFill.style.width = `${powerPct}%`;
  }
  if (powerLabel) {
    powerLabel.textContent = `${powerKw.toFixed(2)} kW`;
  }

  const missingCount = missingStages().length;
  const thermalC = 19 + (powerPct * 0.15) + (missingCount * 0.6);
  const thermalPct = clamp(((thermalC - 16) / 20) * 100, 4, 100);

  if (tempFill) {
    tempFill.style.height = `${thermalPct}%`;
  }
  if (tempLabel) {
    tempLabel.textContent = `${thermalC.toFixed(1)} C`;
  }

  if (statusPill) {
    const editorMessage = (document.getElementById("editorMessage")?.textContent || "").toLowerCase();
    const hasError = state.opsLog.some((item) => item.level === "error") || editorMessage.includes("failed") || editorMessage.includes("error");
    const isDegraded = !hasError && (missingCount > 0 || state.opsLog.some((item) => item.level === "warn"));

    statusPill.classList.remove("status-operational", "status-degraded", "status-critical");
    if (hasError) {
      statusPill.textContent = "CRITICAL";
      statusPill.classList.add("status-critical");
    } else if (isDegraded) {
      statusPill.textContent = "DEGRADED";
      statusPill.classList.add("status-degraded");
    } else {
      statusPill.textContent = "OPERATIONAL";
      statusPill.classList.add("status-operational");
    }
  }
}

function renderOpsLog() {
  const log = document.getElementById("opsLog");
  if (!log) return;

  if (!state.opsLog.length) {
    log.innerHTML = '<p class="ops-empty">No events yet. Provision a rack unit to begin telemetry.</p>';
    return;
  }

  log.innerHTML = state.opsLog
    .map(
      (item) => `
        <p class="ops-line ${item.level}">
          <span class="mono">[${item.time}]</span>
          <span>${item.message}</span>
        </p>
      `,
    )
    .join("");
  log.scrollTop = log.scrollHeight;
}

function pushOpsLog(message, level = "info") {
  state.opsLog.push({ time: nowClock(), message, level });
  state.opsLog = state.opsLog.slice(-24);
  renderOpsLog();
  renderAlertFeed();
  renderTelemetryPanel();
}

function selectBlock(blockId, source = "click") {
  const block = BLOCK_INDEX[blockId];
  if (!block) return;

  const active = activeStage();
  const activeIndex = stageIndex(active);
  const blockIndex = stageIndex(block.stage);

  if (blockIndex > activeIndex) {
    setStatusLine(`Complete ${STAGE_FLOW[activeIndex].title} before placing ${block.label}.`);
    pushOpsLog(`Rejected block ${block.label}; waiting on ${STAGE_FLOW[activeIndex].title}.`, "warn");
    return;
  }

  if (blockIndex < activeIndex) {
    clearDownstream(block.stage);
  }

  state.selectedByStage[block.stage] = blockId;
  state.activeStageOverride = null;
  state.selectedStageId = block.stage;
  const rack = findRackByStage(block.stage);
  if (rack) {
    state.selectedRackId = rack.id;
  }

  const sourceText = source === "drop" ? "dropped" : "placed";
  setStatusLine(`${block.label} ${sourceText}. Continue to ${STAGE_FLOW[Math.min(blockIndex + 1, STAGE_FLOW.length - 1)].title}.`);
  pushOpsLog(`${block.label} ${sourceText} in ${STAGE_FLOW[blockIndex].title}.`, "ok");

  renderAll();
}

function rewindStage(stageId) {
  const current = state.selectedByStage[stageId];
  if (!current) return;
  delete state.selectedByStage[stageId];
  clearDownstream(stageId);
  state.activeStageOverride = stageId;
  state.selectedStageId = stageId;
  const rack = findRackByStage(stageId);
  if (rack) {
    state.selectedRackId = rack.id;
  }
  setStatusLine(`Editing ${STAGE_FLOW[stageIndex(stageId)].title}. Pick a replacement block.`);
  pushOpsLog(`Reopened stage ${STAGE_FLOW[stageIndex(stageId)].title} for edits.`, "warn");
  renderAll();
}

function renderPresets() {
  const container = document.getElementById("presetCards");
  if (!container) return;

  if (!state.presets.length) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = state.presets
    .map(
      (item, index) => `
        <button type="button" class="preset-card" data-preset-index="${index}">
          <span>${item.name}</span>
        </button>
      `,
    )
    .join("");

  container.querySelectorAll("[data-preset-index]").forEach((button) => {
    button.addEventListener("click", () => {
      const idx = Number(button.getAttribute("data-preset-index"));
      if (Number.isNaN(idx) || !state.presets[idx]) return;
      applyPreset(state.presets[idx]);
    });
  });
}

function renderPalette() {
  const container = document.getElementById("blockPalette");
  const hint = document.getElementById("activeStageHint");
  if (!container || !hint) return;

  const active = activeStage();
  const activeMeta = STAGE_FLOW[stageIndex(active)];
  const stageBlocks = BLOCK_CATALOG.filter((block) => block.stage === active);

  hint.textContent = `${activeMeta.title}: ${activeMeta.helper}`;

  container.innerHTML = stageBlocks
    .map(
      (block) => `
        <article class="block-card" draggable="true" data-block-id="${block.id}">
          <strong>${block.label}</strong>
          <p>${block.detail}</p>
          <button type="button" class="ghost place-block" data-block-id="${block.id}">Install Unit</button>
        </article>
      `,
    )
    .join("");

  container.querySelectorAll(".block-card").forEach((card) => {
    card.addEventListener("dragstart", (event) => {
      const blockId = card.getAttribute("data-block-id") || "";
      event.dataTransfer?.setData("text/plain", blockId);
      event.dataTransfer?.setData("application/x-idt-stage", active);

      const ghost = document.createElement("div");
      ghost.className = "drag-ghost-unit";
      ghost.textContent = `SLIDE ${blockId.toUpperCase()}`;
      document.body.appendChild(ghost);
      event.dataTransfer?.setDragImage(ghost, 22, 14);
      window.setTimeout(() => ghost.remove(), 0);

      card.classList.add("dragging");
      document.body.classList.add("dragging-unit");
    });
    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
      document.body.classList.remove("dragging-unit");
    });
  });

  container.querySelectorAll(".place-block").forEach((button) => {
    button.addEventListener("click", () => {
      const blockId = button.getAttribute("data-block-id");
      if (blockId) selectBlock(blockId, "click");
    });
  });
}

function renderBuildStack() {
  const stack = document.getElementById("buildStack");
  if (!stack) return;

  const selectedRackId = state.selectedRackId || "rack-a";

  stack.innerHTML = RACK_LAYOUT.map((rack, rackIdx) => {
    const selectedRackClass = rack.id === selectedRackId ? "selected" : "";
    const rackHealth = rackSignal(rack);

    const units = rack.stages
      .map((stageId, stageOffset) => {
        const selectedId = state.selectedByStage[stageId];
        const block = selectedId ? BLOCK_INDEX[selectedId] : null;
        const signal = stageSignal(stageId);
        const activeClass = state.selectedStageId === stageId ? "unit-selected" : "";
        const host = buildHostname(stageId, rack.id, stageOffset);
        const tooltip = `${host} | ${signal.toUpperCase()}`;
        const unitNumber = Math.max(1, 42 - ((rackIdx * 7) + stageOffset + 2));
        const ioSeed = ((rackIdx + 1) * (stageOffset + 3)) % 9;

        return `
          <article class="rack-unit ${signal} ${activeClass}" data-stage-id="${stageId}" data-rack-id="${rack.id}" data-tooltip="${tooltip}">
            <span class="unit-u mono">${unitNumber}U</span>
            <span class="unit-main">
              <span class="unit-host mono">${host}</span>
              <span class="unit-role">${block ? block.label : STAGE_FLOW[stageIndex(stageId)].title}</span>
            </span>
            <span class="led-cluster">
              <span class="led status-led ${signal}"></span>
              <span class="led io-led" style="--io-delay:${ioSeed * 0.14}s"></span>
            </span>
          </article>
        `;
      })
      .join("");

    const filler = Array.from({ length: Math.max(0, 9 - rack.stages.length) }, (_, idx) => {
      const unitNumber = Math.max(1, 42 - ((rackIdx * 6) + idx + rack.stages.length + 8));
      return `<div class="rack-slot"><span class="mono">${unitNumber}U</span></div>`;
    }).join("");

    const uScale = Array.from({ length: 42 }, (_, idx) => `<span>${42 - idx}U</span>`).join("");

    return `
      <article class="rack-column ${selectedRackClass}" data-rack-id="${rack.id}">
        <header class="rack-head">
          <h3>${rack.label}</h3>
          <span class="rack-health ${rackHealth}">${rackHealth.toUpperCase()}</span>
        </header>
        <div class="rack-shell">
          <div class="u-scale mono">${uScale}</div>
          <div class="rack-unit-grid">${units}${filler}</div>
        </div>
        <div class="rack-ports">
          <button type="button" class="network-port" data-rack-id="${rack.id}" data-cable-path="${rack.cablePath || ""}" aria-label="Trace network cable for ${rack.label}"></button>
          <span class="mono">NET</span>
        </div>
      </article>
    `;
  }).join("");

  stack.querySelectorAll(".rack-column").forEach((rackNode) => {
    rackNode.addEventListener("click", () => {
      const rackId = rackNode.getAttribute("data-rack-id");
      if (!rackId) return;
      state.selectedRackId = rackId;
      const rack = RACK_LAYOUT.find((entry) => entry.id === rackId);
      state.selectedStageId = rack?.stages[0] || null;
      renderAll();
    });

    rackNode.addEventListener("dragover", (event) => {
      const active = activeStage();
      const rackForActive = findRackByStage(active);
      if (rackForActive && rackNode.getAttribute("data-rack-id") === rackForActive.id) {
        event.preventDefault();
        rackNode.classList.add("drop-ready");
      }
    });

    rackNode.addEventListener("dragleave", () => {
      rackNode.classList.remove("drop-ready");
    });

    rackNode.addEventListener("drop", (event) => {
      rackNode.classList.remove("drop-ready");
      const blockId = event.dataTransfer?.getData("text/plain");
      if (blockId) {
        event.preventDefault();
        selectBlock(blockId, "drop");
      }
    });
  });

  stack.querySelectorAll(".rack-unit").forEach((unitNode) => {
    unitNode.addEventListener("click", (event) => {
      event.stopPropagation();
      const stageId = unitNode.getAttribute("data-stage-id");
      const rackId = unitNode.getAttribute("data-rack-id");
      if (!stageId || !rackId) return;
      state.selectedStageId = stageId;
      state.selectedRackId = rackId;
      renderAll();
    });
  });

  stack.querySelectorAll(".network-port").forEach((port) => {
    port.addEventListener("click", (event) => {
      event.stopPropagation();
      const cablePath = port.getAttribute("data-cable-path") || null;
      state.activeCablePath = cablePath;
      renderCableTrace();
      if (cablePath) {
        pushOpsLog(`Tracing cable path ${cablePath.toUpperCase()}.`, "info");
      }
    });
  });
}

function rackSignal(rack) {
  if (!rack.stages.length) {
    return "healthy";
  }
  const signals = rack.stages.map((stageId) => stageSignal(stageId));
  if (signals.includes("critical")) return "critical";
  if (signals.includes("warning")) return "warning";
  return "healthy";
}

function renderCableTrace() {
  const cableSvg = document.getElementById("cableSvg");
  if (!cableSvg) return;

  cableSvg.querySelectorAll(".cable-path").forEach((path) => {
    const isPowerBus = path.id === "power-bus";
    const isActive = path.id === state.activeCablePath || (isPowerBus && !!state.activeCablePath);
    path.classList.toggle("active", isActive);
  });
}

function currentInspectorStage() {
  if (state.selectedStageId) {
    return state.selectedStageId;
  }
  const rack = RACK_LAYOUT.find((entry) => entry.id === state.selectedRackId);
  if (rack?.stages.length) {
    return rack.stages[0];
  }
  return STAGE_FLOW[0].id;
}

function renderInspector() {
  const panel = document.getElementById("inspectorPanel");
  const title = document.getElementById("inspectorTitle");
  const subtitle = document.getElementById("inspectorSubtitle");
  if (!panel || !title || !subtitle) return;

  const rack = RACK_LAYOUT.find((entry) => entry.id === state.selectedRackId) || RACK_LAYOUT[0];
  const stageId = currentInspectorStage();
  const stageMeta = STAGE_FLOW[stageIndex(stageId)] || STAGE_FLOW[0];
  const scenario = scenarioFromState();

  const rackHealth = rackSignal(rack);
  panel.classList.toggle("is-open", true);
  panel.dataset.health = rackHealth;

  title.textContent = `${rack.label} Inspector`;
  subtitle.textContent = `${stageMeta.title} | ${stageSignal(stageId).toUpperCase()} LINK`;

  const rackIndex = Math.max(0, RACK_LAYOUT.findIndex((entry) => entry.id === rack.id));
  const stageIdx = Math.max(0, stageIndex(stageId));
  const cpuEstimate = clamp((Number(state.lastMetrics?.gpu_utilization_pct?.value || 38) + stageIdx * 3.1), 8, 99);
  const ramEstimate = clamp((26 + (scenario.hardware.gpu_count * 1.8) + (stageIdx * 4.5)), 16, 99);
  const uptimeHours = (scenario.hardware.node_count * 36) + (stageIdx * 17) + 128;

  IDTUI.text.set("inspectorHostname", buildHostname(stageId, rack.id, stageIdx));
  IDTUI.text.set("inspectorIp", buildIp(stageId, rack.id));
  IDTUI.text.set("inspectorOs", scenario.runtime.serving_stack === "tensorrt-llm" ? "Ubuntu 24.04 + TRT" : "Ubuntu 24.04 LTS");
  IDTUI.text.set("inspectorCpu", `${cpuEstimate.toFixed(1)}%`);
  IDTUI.text.set("inspectorRam", `${ramEstimate.toFixed(1)}%`);
  IDTUI.text.set("inspectorUptime", `${uptimeHours}h 12m`);
  IDTUI.text.set("inspectorPing", `${nowClock()} (${6 + rackIndex + stageIdx} ms)`);
}

function renderStageRail() {
  const rail = document.getElementById("stageRail");
  if (!rail) return;

  const active = activeStage();
  const activeIndex = stageIndex(active);
  const completeCount = STAGE_FLOW.filter((stage) => state.selectedByStage[stage.id]).length;
  const progress = Math.round((completeCount / STAGE_FLOW.length) * 100);

  rail.innerHTML = `
    <div class="rail-track">
      ${STAGE_FLOW.map((stage, index) => {
        const selected = !!state.selectedByStage[stage.id];
        const status = selected ? "done" : index === activeIndex ? "active" : "pending";
        return `<span class="rail-node ${status}" title="${stage.title}">${index + 1}</span>`;
      }).join("")}
    </div>
    <p class="rail-label"><span class="mono">${progress}%</span> stack assembled</p>
  `;
}

function bindSyncedInputs(sliderId, valueId) {
  const slider = document.getElementById(sliderId);
  const value = document.getElementById(valueId);
  if (!slider || !value) return;

  const syncFromSlider = () => {
    value.value = slider.value;
    updateScenarioPreview();
    renderTelemetryPanel();
    renderInspector();
  };

  const syncFromValue = () => {
    const min = Number(value.min || slider.min || "0");
    const max = Number(value.max || slider.max || "999999");
    const next = clamp(Number(value.value), min, max);
    value.value = String(next);
    slider.value = String(next);
    updateScenarioPreview();
    renderTelemetryPanel();
    renderInspector();
  };

  slider.addEventListener("input", syncFromSlider);
  value.addEventListener("input", syncFromValue);
}

function readNumeric(id) {
  const input = document.getElementById(id);
  if (!input) return 0;
  return Number(input.value);
}

function scenarioFromState() {
  const scenario = structuredClone(DEFAULT_SCENARIO);
  scenario.created_at = nowIso();
  scenario.scenario_id = `sandbox-${Date.now()}`;

  STAGE_FLOW.forEach((stage) => {
    const blockId = state.selectedByStage[stage.id];
    if (!blockId) return;
    const block = BLOCK_INDEX[blockId];
    deepMerge(scenario, block.patch);
  });

  const nodeCount = clamp(readNumeric("nodeCountValue"), 1, 64);
  const promptTokens = clamp(readNumeric("promptTokensValue"), 128, 8192);
  const completionTokens = clamp(readNumeric("completionTokensValue"), 64, 4096);
  const steadyQps = clamp(readNumeric("steadyQpsValue"), 1, 256);
  const burstQps = clamp(readNumeric("burstQpsValue"), steadyQps, 512);

  scenario.hardware.node_count = nodeCount;
  scenario.workload.prompt_tokens = promptTokens;
  scenario.workload.completion_tokens = completionTokens;
  scenario.workload.traffic_profile.steady_qps = steadyQps;
  scenario.workload.traffic_profile.burst_qps = burstQps;

  scenario.calibration = {
    artifact_id: state.calibration.artifact_id,
    artifact_version: state.calibration.artifact_version,
  };

  const selectedTitles = STAGE_FLOW.map((stage) => {
    const blockId = state.selectedByStage[stage.id];
    return blockId ? BLOCK_INDEX[blockId].label : "Unspecified";
  });

  scenario.name = `${scenario.hardware.gpu_sku} Sandbox Build`;
  scenario.description = `Stack: ${selectedTitles.join(" -> ")}`;

  return scenario;
}

function missingStages() {
  return STAGE_FLOW.filter((stage) => !state.selectedByStage[stage.id]).map((stage) => stage.title);
}

function updateScenarioPreview() {
  const preview = document.getElementById("scenarioPreview");
  if (!preview) return;
  preview.textContent = JSON.stringify(scenarioFromState(), null, 2);
}

function inferSelectionsFromScenario(scenario) {
  const picks = {};

  if (scenario.hardware?.gpu_sku) {
    const gpuSku = String(scenario.hardware.gpu_sku).toLowerCase();
    const gpuBlock = BLOCK_CATALOG.find(
      (block) => block.stage === "gpu" && block.patch.hardware?.gpu_sku?.toLowerCase() === gpuSku,
    );
    if (gpuBlock) picks.gpu = gpuBlock.id;
  }

  if (scenario.hardware?.gpu_count) {
    const rackBlock = BLOCK_CATALOG.find(
      (block) => block.stage === "rack" && block.patch.hardware?.gpu_count === scenario.hardware.gpu_count,
    );
    if (rackBlock) picks.rack = rackBlock.id;
  }

  if (scenario.interconnect) {
    const fabricBlock = BLOCK_CATALOG.find((block) => {
      if (block.stage !== "fabric") return false;
      const target = block.patch.interconnect;
      return (
        target?.intra_node_fabric === scenario.interconnect.intra_node_fabric
        && target?.inter_node_fabric === scenario.interconnect.inter_node_fabric
        && target?.topology_profile === scenario.interconnect.topology_profile
      );
    });
    if (fabricBlock) picks.fabric = fabricBlock.id;
  }

  if (scenario.energy_system?.primary_source) {
    const source = String(scenario.energy_system.primary_source).toLowerCase();
    const powerBlock = BLOCK_CATALOG.find(
      (block) => block.stage === "power" && block.patch.energy_system?.primary_source?.toLowerCase() === source,
    );
    if (powerBlock) picks.power = powerBlock.id;
  }

  if (scenario.runtime) {
    const runtimeBlock = BLOCK_CATALOG.find((block) => {
      if (block.stage !== "runtime") return false;
      const target = block.patch.runtime;
      return target?.serving_stack === scenario.runtime.serving_stack && target?.precision === scenario.runtime.precision;
    });
    if (runtimeBlock) picks.runtime = runtimeBlock.id;
  }

  if (scenario.orchestration) {
    const orchestratorBlock = BLOCK_CATALOG.find((block) => {
      if (block.stage !== "orchestration") return false;
      const target = block.patch.orchestration;
      return (
        target?.scheduler === scenario.orchestration.scheduler
        && target?.autoscaling_policy === scenario.orchestration.autoscaling_policy
        && target?.placement_strategy === scenario.orchestration.placement_strategy
      );
    });
    if (orchestratorBlock) picks.orchestration = orchestratorBlock.id;
  }

  if (scenario.workload?.workload_type) {
    const workloadType = String(scenario.workload.workload_type).toLowerCase();
    const workloadBlock = BLOCK_CATALOG.find(
      (block) => block.stage === "workload" && block.patch.workload?.workload_type?.toLowerCase() === workloadType,
    );
    if (workloadBlock) picks.workload = workloadBlock.id;
  }

  return picks;
}

function applyPreset(preset) {
  const scenario = preset.scenario || {};
  const inferred = inferSelectionsFromScenario(scenario);

  state.selectedByStage = {
    ...state.selectedByStage,
    ...inferred,
  };
  state.activeStageOverride = null;
  state.selectedStageId = "workload";
  state.selectedRackId = "rack-e";

  if (scenario.calibration?.artifact_id && scenario.calibration?.artifact_version) {
    state.calibration = {
      artifact_id: scenario.calibration.artifact_id,
      artifact_version: scenario.calibration.artifact_version,
    };
  }

  if (scenario.hardware?.node_count) {
    const value = clamp(Number(scenario.hardware.node_count), 1, 64);
    document.getElementById("nodeCount").value = String(value);
    document.getElementById("nodeCountValue").value = String(value);
  }

  if (scenario.workload?.prompt_tokens) {
    const value = clamp(Number(scenario.workload.prompt_tokens), 128, 8192);
    document.getElementById("promptTokens").value = String(value);
    document.getElementById("promptTokensValue").value = String(value);
  }

  if (scenario.workload?.completion_tokens) {
    const value = clamp(Number(scenario.workload.completion_tokens), 64, 4096);
    document.getElementById("completionTokens").value = String(value);
    document.getElementById("completionTokensValue").value = String(value);
  }

  if (scenario.workload?.traffic_profile?.steady_qps) {
    const value = clamp(Number(scenario.workload.traffic_profile.steady_qps), 1, 256);
    document.getElementById("steadyQps").value = String(value);
    document.getElementById("steadyQpsValue").value = String(value);
  }

  if (scenario.workload?.traffic_profile?.burst_qps) {
    const value = clamp(Number(scenario.workload.traffic_profile.burst_qps), 1, 512);
    document.getElementById("burstQps").value = String(value);
    document.getElementById("burstQpsValue").value = String(value);
  }

  setStatusLine(`Preset loaded: ${preset.name}`);
  pushOpsLog(`Preset applied: ${preset.name}.`, "ok");
  renderAll();
}

function renderAll() {
  renderPresets();
  renderPalette();
  renderStageRail();
  renderBuildStack();
  renderIsoView();
  renderCableTrace();
  renderInspector();
  renderTelemetryPanel();
  renderAlertFeed();
  updateScenarioPreview();
  renderOpsLog();
}

const WORLD_CITIES = [
  { name: "New York",   x: 298, y: 178 },
  { name: "London",     x: 487, y: 137 },
  { name: "Frankfurt",  x: 510, y: 131 },
  { name: "Tokyo",      x: 944, y: 172 },
  { name: "Singapore",  x: 855, y: 308 },
  { name: "São Paulo",  x: 322, y: 392 },
  { name: "Sydney",     x: 967, y: 430 },
  { name: "Dubai",      x: 650, y: 228 },
  { name: "Mumbai",     x: 718, y: 255 },
  { name: "Seoul",      x: 936, y: 168 },
];

const DC_COORDS = { x: 245, y: 168 };

function setupViewTabs() {
  const tabs = document.querySelectorAll(".view-tab");
  const views = {
    floor: document.getElementById("buildStack"),
    iso:   document.getElementById("isoView"),
    world: document.getElementById("worldMapView"),
  };

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.getAttribute("data-view");
      tabs.forEach((t) => {
        t.classList.remove("active");
        t.setAttribute("aria-selected", "false");
      });
      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");

      Object.entries(views).forEach(([key, el]) => {
        if (!el) return;
        el.hidden = key !== target;
      });

      if (target === "iso") {
        renderIsoView();
      }
    });
  });
}

function renderIsoView() {
  const grid = document.getElementById("isoGrid");
  if (!grid) return;

  grid.innerHTML = RACK_LAYOUT.map((rack) => {
    const health = rackSignal(rack);
    const isSelected = rack.id === state.selectedRackId ? "iso-selected" : "";
    const stageNames = rack.stages.map((s) => {
      const blockId = state.selectedByStage[s];
      return blockId ? BLOCK_INDEX[blockId].label : STAGE_FLOW[stageIndex(s)].title;
    }).join(" / ") || "EMPTY";

    return `
      <div class="iso-rack-block ${health} ${isSelected}" data-rack-id="${rack.id}" title="${rack.label}: ${stageNames}">
        <div class="iso-top"></div>
        <div class="iso-front">
          <span class="iso-led"></span>
          <span class="iso-label">${rack.label}</span>
        </div>
        <div class="iso-side"></div>
      </div>
    `;
  }).join("");

  grid.querySelectorAll(".iso-rack-block").forEach((block) => {
    block.addEventListener("click", () => {
      const rackId = block.getAttribute("data-rack-id");
      if (!rackId) return;
      state.selectedRackId = rackId;
      const rack = RACK_LAYOUT.find((r) => r.id === rackId);
      state.selectedStageId = rack?.stages[0] || null;
      renderAll();
      pushOpsLog(`Selected ${rackId.toUpperCase()} from ISO view.`, "info");
    });
  });
}

let worldMapLoaded = false;

async function initWorldMap() {
  if (worldMapLoaded) return;
  worldMapLoaded = true;

  const landmassGroup = document.getElementById("worldLandmass");
  const arcsGroup = document.getElementById("worldArcs");
  const citiesGroup = document.getElementById("worldCities");
  const dcGroup = document.getElementById("worldDc");
  if (!landmassGroup || !arcsGroup || !citiesGroup || !dcGroup) return;

  try {
    const paths = await fetchJson("/static/world_paths.json");

    const svgNS = "http://www.w3.org/2000/svg";

    paths.forEach((d) => {
      const path = document.createElementNS(svgNS, "path");
      path.setAttribute("d", d);
      landmassGroup.appendChild(path);
    });

    const dcX = DC_COORDS.x;
    const dcY = DC_COORDS.y;

    WORLD_CITIES.forEach((city, idx) => {
      const delay = idx * 0.3;
      const midX = (dcX + city.x) / 2;
      const midY = Math.min(dcY, city.y) - 80 - (Math.abs(city.x - dcX) * 0.08);
      const d = `M ${dcX},${dcY} Q ${midX},${midY} ${city.x},${city.y}`;

      const arc = document.createElementNS(svgNS, "path");
      arc.setAttribute("d", d);
      arc.setAttribute("class", "world-arc");
      arc.style.animationDelay = `${delay}s`;
      arcsGroup.appendChild(arc);

      const dot = document.createElementNS(svgNS, "circle");
      dot.setAttribute("cx", String(city.x));
      dot.setAttribute("cy", String(city.y));
      dot.setAttribute("r", "3");
      dot.setAttribute("class", "city-dot");
      citiesGroup.appendChild(dot);

      const label = document.createElementNS(svgNS, "text");
      label.setAttribute("x", String(city.x + 5));
      label.setAttribute("y", String(city.y - 4));
      label.setAttribute("class", "city-label");
      label.textContent = city.name;
      citiesGroup.appendChild(label);
    });

    const dcRing = document.createElementNS(svgNS, "circle");
    dcRing.setAttribute("cx", String(dcX));
    dcRing.setAttribute("cy", String(dcY));
    dcRing.setAttribute("r", "6");
    dcRing.setAttribute("class", "dc-ring");
    dcGroup.appendChild(dcRing);

    const dcDot = document.createElementNS(svgNS, "circle");
    dcDot.setAttribute("cx", String(dcX));
    dcDot.setAttribute("cy", String(dcY));
    dcDot.setAttribute("r", "5");
    dcDot.setAttribute("class", "dc-dot");
    dcGroup.appendChild(dcDot);

    const dcLabel = document.createElementNS(svgNS, "text");
    dcLabel.setAttribute("x", String(dcX + 8));
    dcLabel.setAttribute("y", String(dcY - 8));
    dcLabel.setAttribute("class", "dc-label");
    dcLabel.textContent = "TOR-DC-01";
    dcGroup.appendChild(dcLabel);

    const arcCountEl = document.getElementById("worldArcCount");
    const regionCountEl = document.getElementById("worldRegionCount");
    if (arcCountEl) arcCountEl.textContent = String(WORLD_CITIES.length);
    if (regionCountEl) regionCountEl.textContent = "6";

    pushOpsLog(`World map loaded: ${WORLD_CITIES.length} active arcs from TOR-DC-01.`, "info");
  } catch (err) {
    pushOpsLog(`World map load failed: ${err.message}`, "warn");
  }
}

async function loadPresets() {
  try {
    const payload = await fetchJson("/api/presets");
    state.presets = payload.items || [];
    if (state.presets[0]?.scenario?.calibration) {
      state.calibration = {
        artifact_id: state.presets[0].scenario.calibration.artifact_id,
        artifact_version: state.presets[0].scenario.calibration.artifact_version,
      };
    }
    pushOpsLog(`Loaded ${state.presets.length} scenario presets.`, "info");
    renderPresets();
  } catch (error) {
    setStatusLine(`Preset load failed: ${error.message}`);
    pushOpsLog(`Preset load failed: ${error.message}`, "error");
  }
}

async function refreshHealth() {
  try {
    const health = await fetchJson("/api/health");
    IDTUI.text.set("ctxQueue", String(health.queue_depth));
  } catch {
    IDTUI.text.set("ctxQueue", "unavailable");
  }
}

async function validateScenario() {
  const missing = missingStages();
  if (missing.length) {
    IDTUI.text.set("editorMessage", `Complete all stages first: ${missing.join(", ")}.`);
    pushOpsLog(`Validation blocked. Missing stages: ${missing.join(", ")}.`, "warn");
    return;
  }

  try {
    const scenario = scenarioFromState();
    const response = await fetchJson("/api/validate-scenario", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(scenario),
    });

    IDTUI.text.set("editorMessage", `Scenario valid. Hash: ${response.scenario_hash}`);
    IDTUI.text.set("ctxArtifact", `${response.artifact_id} (${response.artifact_version})`);
    IDTUI.text.set("ctxHash", response.scenario_hash);
    pushOpsLog(`Scenario validated successfully (${response.scenario_hash.slice(0, 18)}...).`, "ok");
  } catch (error) {
    IDTUI.text.set("editorMessage", `Validation error: ${error.message}`);
    pushOpsLog(`Validation failed: ${error.message}`, "error");
  }
}

async function submitScenario() {
  const missing = missingStages();
  if (missing.length) {
    IDTUI.text.set("editorMessage", `Complete all stages first: ${missing.join(", ")}.`);
    pushOpsLog(`Run blocked. Missing stages: ${missing.join(", ")}.`, "warn");
    return;
  }

  IDTUI.text.set("editorMessage", "Submitting benchmark run...");
  pushOpsLog("Submitting benchmark run to orchestrator.", "info");

  try {
    const scenario = scenarioFromState();
    const response = await fetchJson("/api/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(scenario),
    });

    const runId = response.run_id;
    let run = await fetchJson(`/api/runs/${runId}`);

    IDTUI.text.set(
      "editorMessage",
      response.cached ? "Cache hit: benchmark completed immediately." : "Benchmark queued.",
    );
    pushOpsLog(response.cached ? `Run ${runId} finished via cache.` : `Run ${runId} queued for execution.`, "ok");
    IDTUI.text.html("runLink", `<a href="/runs/${runId}">Open run ${runId}</a>`);

    if (!run.report && !response.cached) {
      pushOpsLog(`Waiting for run ${runId} completion...`, "info");
      run = await pollRunUntilSettled(runId, 16, 450);
    }

    if (run.report && run.report.metrics) {
      IDTUI.text.set("editorMessage", response.cached ? "Cache hit: benchmark completed immediately." : "Benchmark completed.");
      IDTUI.renderMetricCards("metricCards", run.report.metrics);
      IDTUI.text.set("ctxArtifact", run.report.provenance.artifact_ids.join(", "));
      IDTUI.text.set("ctxHash", run.report.provenance.scenario_hash);
      state.lastMetrics = run.report.metrics;
      pushOpsLog(`Run ${runId} report materialized in explorer.`, "ok");
    } else {
      IDTUI.renderMetricCards("metricCards", null);
      IDTUI.text.set("ctxArtifact", "pending");
      IDTUI.text.set("ctxHash", run.scenario_hash);
      pushOpsLog(`Run ${runId} still pending. Open run detail for live stage progress.`, "warn");
    }

    renderTelemetryPanel();
    renderInspector();
    await refreshHealth();
  } catch (error) {
    IDTUI.text.set("editorMessage", `Submit failed: ${error.message}`);
    pushOpsLog(`Run submission failed: ${error.message}`, "error");
  }
}

async function pollRunUntilSettled(runId, maxAttempts = 12, intervalMs = 500) {
  let latest = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    latest = await fetchJson(`/api/runs/${runId}`);
    if (latest.report && latest.report.metrics) {
      return latest;
    }
    if (latest.status === "failed") {
      return latest;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return latest;
}

function openConsoleModal() {
  const modal = document.getElementById("consoleModal");
  const body = document.getElementById("consoleModalBody");
  if (!modal || !body) return;

  const scenario = scenarioFromState();
  const logLines = state.opsLog.map((item) => `[${item.time}] ${item.level.toUpperCase()} :: ${item.message}`).join("\n");

  body.textContent = [
    ">>> REMOTE CONSOLE SESSION",
    `TIMESTAMP: ${nowIso()}`,
    "",
    "# CURRENT SCENARIO SNAPSHOT",
    JSON.stringify(scenario, null, 2),
    "",
    "# EVENT STREAM",
    logLines || "NO EVENTS",
  ].join("\n");

  modal.hidden = false;
  modal.setAttribute("aria-hidden", "false");
}

function closeConsoleModal() {
  const modal = document.getElementById("consoleModal");
  if (!modal) return;
  if (modal.contains(document.activeElement)) {
    document.activeElement.blur();
  }
  modal.hidden = true;
  modal.setAttribute("aria-hidden", "true");
}

function setupConsoleModal() {
  const openButton = document.getElementById("openConsoleButton");
  const closeButton = document.getElementById("closeConsoleModal");
  const modal = document.getElementById("consoleModal");

  openButton?.addEventListener("click", openConsoleModal);
  closeButton?.addEventListener("click", closeConsoleModal);
  modal?.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeConsoleModal();
    }
  });
}

function setupIntro() {
  const intro = document.getElementById("sandboxIntro");
  const startButton = document.getElementById("introStartButton");
  const skipButton = document.getElementById("introSkipButton");
  if (!intro || !startButton || !skipButton) return;

  let skipIntro = false;
  try {
    skipIntro = localStorage.getItem(INTRO_STORAGE_KEY) === "1";
  } catch {
    skipIntro = false;
  }

  if (skipIntro) {
    intro.classList.add("is-hidden");
  }

  startButton.addEventListener("click", () => {
    intro.classList.add("is-hidden");
    pushOpsLog("Entered sandbox.", "info");
  });

  skipButton.addEventListener("click", () => {
    intro.classList.add("is-hidden");
    pushOpsLog("Intro hidden for future visits.", "info");
    try {
      localStorage.setItem(INTRO_STORAGE_KEY, "1");
    } catch {
      // Ignore localStorage errors.
    }
  });
}

function showIntro() {
  const intro = document.getElementById("sandboxIntro");
  if (!intro) return;
  intro.classList.remove("is-hidden");
}

function bindKeyboardShortcuts() {
  document.addEventListener("keydown", (event) => {
    const target = event.target;
    if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
      return;
    }

    if (isConsoleModalOpen()) {
      if (event.key === "Escape") {
        closeConsoleModal();
      }
      return;
    }

    if (event.key === "Escape") {
      showIntro();
      pushOpsLog("Re-opened intro overlay.", "info");
      return;
    }

    if (isIntroVisible()) {
      if (event.key === "Enter") {
        event.preventDefault();
        document.getElementById("introStartButton")?.click();
      }
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      submitScenario();
      return;
    }

    if (event.key.toLowerCase() === "v") {
      event.preventDefault();
      validateScenario();
      return;
    }

    if (/^[1-7]$/.test(event.key)) {
      const idx = Number(event.key) - 1;
      const stage = STAGE_FLOW[idx];
      if (!stage) return;
      state.activeStageOverride = stage.id;
      state.selectedStageId = stage.id;
      const rack = findRackByStage(stage.id);
      if (rack) {
        state.selectedRackId = rack.id;
      }
      setStatusLine(`Focused ${stage.title}. Place a block to continue.`);
      pushOpsLog(`Focused stage ${idx + 1}: ${stage.title}.`, "info");
      renderAll();
    }
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  setupIntro();
  setupConsoleModal();
  setupViewTabs();
  startNocClock();
  bindKeyboardShortcuts();
  bindSyncedInputs("nodeCount", "nodeCountValue");
  bindSyncedInputs("promptTokens", "promptTokensValue");
  bindSyncedInputs("completionTokens", "completionTokensValue");
  bindSyncedInputs("steadyQps", "steadyQpsValue");
  bindSyncedInputs("burstQps", "burstQpsValue");

  document.getElementById("validateButton")?.addEventListener("click", validateScenario);
  document.getElementById("runButton")?.addEventListener("click", submitScenario);
  document.getElementById("clearOpsLogButton")?.addEventListener("click", () => {
    state.opsLog = [];
    renderOpsLog();
    renderAlertFeed();
    pushOpsLog("NOC event log cleared.", "info");
  });
  document.getElementById("logoutGhostButton")?.addEventListener("click", () => {
    pushOpsLog("Logout control pressed (auth flow unchanged).", "warn");
  });

  document.querySelector('[data-view="world"]')?.addEventListener("click", initWorldMap);

  await loadPresets();
  renderAll();
  setStatusLine("Install a GPU unit in RACK-A to start provisioning.");
  pushOpsLog("Control room online. Stage 1 unlocked: GPU Silicon.", "info");
  IDTUI.renderMetricCards("metricCards", null);
  await refreshHealth();
  renderTelemetryPanel();
});
