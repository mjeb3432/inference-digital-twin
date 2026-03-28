(() => {
  "use strict";

  const PHASES = [
    "SITE SELECTION & PERMITTING",
    "POWER PROCUREMENT",
    "CONNECTIVITY (FIBER)",
    "FACILITY CONSTRUCTION",
    "COMPUTE STACK",
    "NETWORKING (INTERCONNECT)",
    "DCIM & MONITORING",
    "FACILITY COMPLETE",
  ];

  const LOCATION = {
    rural: { label: "GREENFIELD RURAL", landPerAcre: 45000, permitMonths: [4, 10], nimby: "LOW", nimbyScore: 22, fiberMiles: 8, gridMiles: 5, map: [560, 310] },
    urban: { label: "URBAN EDGE", landPerAcre: 290000, permitMonths: [6, 14], nimby: "HIGH", nimbyScore: 74, fiberMiles: 2, gridMiles: 3, map: [710, 290] },
    repurpose: { label: "REPURPOSED INDUSTRIAL", landPerAcre: 120000, permitMonths: [4, 9], nimby: "MED", nimbyScore: 48, fiberMiles: 4, gridMiles: 6, map: [640, 275] },
    campus: { label: "CAMPUS ADJACENT", landPerAcre: 215000, permitMonths: [5, 11], nimby: "MED", nimbyScore: 40, fiberMiles: 1, gridMiles: 2, map: [470, 285] },
  };

  const PERMIT = {
    standard: { label: "STANDARD MUNICIPAL", months: [3, 12], landMult: 1, costAdd: 0 },
    epc: { label: "EXPEDITED WITH EPC PARTNER", months: [6, 9], landMult: 1.08, costAdd: 350000 },
    pre: { label: "PRE-PERMITTED SITE", months: [1, 3], landMult: 1.3, costAdd: 750000 },
  };

  const POWER_SRC = {
    fom: { label: "FRONT-OF-METER GRID", lead: "6-24 MO / 2-5 YR", capexKw: 220, rateMwh: 82 },
    gas: { label: "NATURAL GAS GENSETS", lead: "2-5 YEARS", capexKw: 1190, rateMwh: 109 },
    solar: { label: "SOLAR + BESS", lead: "1-3 YEARS", capexKw: 1660, rateMwh: 58 },
    wind: { label: "WIND", lead: "3-5 YEARS", capexKw: 1617, rateMwh: 64 },
    smr: { label: "SMALL MODULAR REACTOR", lead: "POST-2027", capexKw: 5000, rateMwh: 91 },
  };

  const REDUNDANCY = {
    t1: { label: "TIER I", uptime: 99.671, downtime: 28.8, mult: 1.0 },
    t2: { label: "TIER II", uptime: 99.741, downtime: 22, mult: 1.12 },
    t3: { label: "TIER III", uptime: 99.982, downtime: 1.6, mult: 1.28 },
    t4: { label: "TIER IV", uptime: 99.995, downtime: 0.4, mult: 1.5 },
  };

  const UPS = {
    vrla: { label: "LEGACY VRLA UPS", response: "4-8 MS", cycles: 500, kwh: 240, kwCapex: 140, supercap: false },
    liion: { label: "LI-ION UPS", response: "2-4 MS", cycles: 4500, kwh: 420, kwCapex: 220, supercap: false },
    supercap: { label: "SUPERCAPACITORS + BESS", response: "<100 US", cycles: 1000000, kwh: 620, kwCapex: 380, supercap: true },
  };

  const TARGET_MW = [10, 25, 50, 100, 250, 500, 1000];

  const FIBER_ACCESS = {
    lit: { label: "ON-ROUTE LIT FIBER", capex: 150000, mrc: 55000 },
    dark: { label: "DARK FIBER LEASE", capex: 320000, mrc: 84000 },
    build: { label: "BUILD-TO-PREMISES", capex: 900000, mrc: 38000 },
    microwave: { label: "MICROWAVE BACKUP", capex: 210000, mrc: 14000 },
  };

  const CARRIER = {
    lumen: { label: "LUMEN", tier: "TIER 1", mrc: 36000, quality: 1.0 },
    att: { label: "AT&T", tier: "TIER 1", mrc: 41000, quality: 0.95 },
    verizon: { label: "VERIZON", tier: "TIER 1", mrc: 43000, quality: 0.96 },
    zayo: { label: "ZAYO", tier: "TIER 2", mrc: 32000, quality: 0.9 },
    crown: { label: "CROWN CASTLE", tier: "TIER 2", mrc: 28500, quality: 0.86 },
    lightpath: { label: "LIGHTPATH", tier: "TIER 3", mrc: 22000, quality: 0.78 },
  };

  const IXP = {
    va: { label: "NORTHERN VA", miles: 4, latency: 2.1, subsea: true },
    dallas: { label: "DALLAS", miles: 9, latency: 5.6, subsea: false },
    chicago: { label: "CHICAGO", miles: 11, latency: 7.8, subsea: false },
    sv: { label: "SILICON VALLEY", miles: 26, latency: 18.4, subsea: true },
  };

  const DEVELOPER = {
    t3: { label: "LARGE-SCALE DEVELOPER (TIER 3)", cost: [8_000_000, 12_000_000], months: [14, 22], factor: 1 },
    t4: { label: "LARGE-SCALE DEVELOPER (TIER 4)", cost: [11_000_000, 15_000_000], months: [16, 24], factor: 1.08 },
    modular: { label: "MODULAR / PREFAB", cost: [9_000_000, 13_000_000], months: [6, 12], factor: 0.62 },
    self: { label: "SELF-BUILD WITH EPC", cost: [7_000_000, 10_000_000], months: [12, 22], factor: 1.15 },
  };

  const COOLING = {
    air: { label: "AIR-COOLED ONLY", density: 20, perMw: 950000, pue: [1.55, 2.0], supports: ["h100"] },
    rear: { label: "REAR-DOOR HEAT EXCHANGE", density: 60, perMw: 1400000, pue: [1.35, 1.55], supports: ["h100", "h200"] },
    d2c: { label: "DIRECT-TO-CHIP LIQUID", density: 220, perMw: 1850000, pue: [1.15, 1.32], supports: ["h100", "h200", "b200", "b300", "rubin"] },
    immersion: { label: "IMMERSION COOLING", density: 300, perMw: 2200000, pue: [1.08, 1.25], supports: ["h100", "h200", "b200", "b300", "rubin"] },
  };

  const ARCH = {
    ac: { label: "TRADITIONAL AC (480V 3-PHASE)", loss: 14, copper: 0, perMw: 160000 },
    dc400: { label: "400V DC", loss: 7, copper: 22, perMw: 240000 },
    hvdc: { label: "800V HVDC", loss: 2, copper: 45, perMw: 420000, supercap: true },
  };

  const GPU = {
    h100: { label: "H100 SXM5", kw: 0.7, vram: 80, pf: 3.35, cost: 25000, series: "H", cooling: ["air", "rear", "d2c", "immersion"] },
    h200: { label: "H200 SXM5", kw: 0.7, vram: 141, pf: 3.95, cost: 30000, series: "H", cooling: ["rear", "d2c", "immersion"] },
    b200: { label: "B200 SXM5", kw: 1.35, vram: 192, pf: 9, cost: 40000, series: "B", cooling: ["d2c", "immersion"] },
    b300: { label: "B300 HGX", kw: 1.35, vram: 288, pf: 10, cost: 50000, series: "B", cooling: ["d2c", "immersion"] },
    rubin: { label: "RUBIN ULTRA (2027)", kw: 3.6, vram: 384, pf: 20, cost: 95000, series: "R", cooling: ["d2c", "immersion"], needsHvdc: true, needsSupercap: true, rackKw: 900 },
  };

  const STACK = {
    ollama: { label: "OLLAMA", best: "LOCAL/SIMPLE", mfu: [0.2, 0.35], seedTps: 0.62, seedTtft: 1.3 },
    vllm: { label: "VLLM", best: "PRODUCTION", mfu: [0.35, 0.55], seedTps: 0.92, seedTtft: 0.92 },
    triton: { label: "NVIDIA TRITON", best: "MULTI-MODEL", mfu: [0.32, 0.5], seedTps: 0.86, seedTtft: 0.97 },
    trt: { label: "TENSORRT-LLM", best: "MAX TPS", mfu: [0.45, 0.7], seedTps: 1.0, seedTtft: 0.78, needsHbr: true },
    tgi: { label: "TGI BY HUGGINGFACE", best: "MULTI-TENANT", mfu: [0.3, 0.48], seedTps: 0.81, seedTtft: 1.05 },
  };

  const SERVING = {
    serverless: { label: "SERVERLESS API", util: 0.34, mfuAdj: -0.1 },
    dedicated: { label: "DEDICATED CLUSTER", util: 0.62, mfuAdj: 0.05 },
    hybrid: { label: "HYBRID", util: 0.51, mfuAdj: 0 },
  };

  const FABRIC = {
    ib: { label: "INFINIBAND (NDR 400GB/S)", bw: 400, us: 1.5, premium: 1.35, mfuAdj: 0.07, swCost: 37000 },
    eth: { label: "ETHERNET (ROCE 400GB/S)", bw: 400, us: 3.8, premium: 1, mfuAdj: 0, swCost: 26000 },
    nv: { label: "NVLINK (WITHIN-NODE)", bw: 900, us: 0.6, premium: 1.8, mfuAdj: 0.09, swCost: 42000 },
  };

  const EXTERNAL = {
    g10: { label: "10GBE", users: 1800, ttft: 62, annual: 110000 },
    g100: { label: "100GBE", users: 15000, ttft: 18, annual: 480000 },
    g400: { label: "400GBE", users: 62000, ttft: 6, annual: 1600000 },
    g800: { label: "800GBE", users: 115000, ttft: 2.6, annual: 2900000 },
  };

  const MONITORING = {
    legacy: { label: "LEGACY SNMP + SPREADSHEETS", opex: 180000, score: 6, mttd: 45 },
    oss: { label: "OPEN SOURCE (PROMETHEUS + GRAFANA)", opex: 280000, score: 15, mttd: 8 },
    gpu: { label: "MODERN GPU-NATIVE DCIM", opex: 460000, score: 23, mttd: 1.2 },
    ai: { label: "FULL STACK + AI ANOMALY DETECTION", opex: 720000, score: 28, mttd: 0.4 },
  };

  const MAINT = {
    breakfix: { label: "BREAK-FIX", saved: -6, crew: 12, opex: 140000, score: 4 },
    preventive: { label: "SCHEDULED PREVENTIVE", saved: 14, crew: 9, opex: 260000, score: 13 },
    predictive: { label: "PREDICTIVE (ML)", saved: 44, crew: 7, opex: 380000, score: 21 },
  };

  const MODEL = {
    "7B": { p: 7e9, fp16: 14, fp8: 7, int4: 3.5 },
    "13B": { p: 13e9, fp16: 26, fp8: 13, int4: 6.5 },
    "70B": { p: 70e9, fp16: 140, fp8: 70, int4: 35 },
    "405B": { p: 405e9, fp16: 810, fp8: 405, int4: 202.5 },
  };

  const PRECISION_BYTES = { FP16: 2, FP8: 1, INT4: 0.5 };

  const CITIES = [
    { label: "NYC", x: 760, y: 248 },
    { label: "LONDON", x: 540, y: 198 },
    { label: "TOKYO", x: 1020, y: 236 },
    { label: "SAO PAULO", x: 830, y: 426 },
    { label: "SINGAPORE", x: 975, y: 346 },
    { label: "SYDNEY", x: 1080, y: 462 },
    { label: "MUMBAI", x: 885, y: 274 },
    { label: "TORONTO", x: 728, y: 220 },
    { label: "PARIS", x: 566, y: 216 },
    { label: "MEXICO CITY", x: 676, y: 316 },
  ];

  const facilityState = {
    phase: 1,
    completed: [],
    site: { locationType: null, acreage: 25, permittingTrack: null, estimatedPermitCost: 0, permittingMonths: 0 },
    power: { sources: { fom: 100, gas: 0, solar: 0, wind: 0, smr: 0 }, targetMW: null, redundancyTier: null, upsType: null },
    fiber: { accessType: null, carriers: [], ixpRegion: null, latencyMs: 0, monthlyCost: 0 },
    facility: { developerType: null, buildMonths: 0, coolingType: null, powerArchitecture: null, pue: 2 },
    compute: { gpuModel: null, gpusPerRack: 8, rackCount: 0, totalTFLOPS: 0, inferenceStack: null, servingArch: null },
    networking: { fabric: null, nodeCount: 1, externalBandwidth: null, networkingCapex: 0 },
    dcim: { monitoringApproach: null, maintenanceModel: null, coolingTelemetry: null },
    economics: { totalCapex: 0, annualOpex: 0, tco3yr: 0, tco5yr: 0 },
    benchmarks: { ttft: null, tps: null, concurrency: null, mfu: null },
  };

  const ui = {
    derived: {},
    hoverInspect: null,
    selectedInspect: null,
    mode: "floor",
    immersivePhase8: false,
    deploying: { active: false, progress: 0, message: "READY" },
    logs: [],
    tickerCapex: 0,
    benchmarkCollapsed: false,
    benchmarkUserOverride: false,
    bench: { model: "70B", prompt: 512, batch: 8, output: 256, conc: 16, precision: "FP8", observedTps: 0 },
    rackCache: [],
    mapStats: { req: 0, tps: 0, users: 0, ttft: 0, util: 0 },
    animFrame: null,
    animItems: [],
    mapTicker: null,
  };

  const $ = (id) => document.getElementById(id);
  const el = {};

  const CURRENCY0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const INTEGER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

  window.addEventListener("DOMContentLoaded", init);

  function init() {
    cacheElements();
    bindEvents();
    recalcAll();
    applyAutoBenchmarkCollapse();
    renderAll();
    pushLog("SESSION STARTED — THE FORGE ONLINE", "muted");
    startTickers();
  }

  function cacheElements() {
    [
      "forgeRoot",
      "phaseTimeline",
      "leftPhaseTitle",
      "leftDecisionBody",
      "confirmPhaseButton",
      "capexTicker",
      "annualOpex",
      "targetPue",
      "uptimeProjection",
      "buildLog",
      "canvasTitle",
      "siteStatusTag",
      "viewToggleButton",
      "fullScreenToggleButton",
      "constructionCanvas",
      "benchmarkSuite",
      "benchmarkToggle",
      "benchmarkBody",
      "deployStatus",
      "deployProgress",
      "inspectorTitle",
      "inspectorSubtitle",
      "inspectorDetails",
      "inspectorMetrics",
      "inspectorViz",
    ].forEach((id) => {
      el[id] = $(id);
    });
  }

  function bindEvents() {
    el.phaseTimeline.addEventListener("click", onTimelineClick);
    el.leftDecisionBody.addEventListener("click", onDecisionClick);
    el.leftDecisionBody.addEventListener("input", onDecisionInput);
    el.leftDecisionBody.addEventListener("change", onDecisionInput);
    el.confirmPhaseButton.addEventListener("click", onConfirmPhase);

    el.benchmarkToggle.addEventListener("click", () => {
      ui.benchmarkUserOverride = true;
      ui.benchmarkCollapsed = !ui.benchmarkCollapsed;
      renderBenchmarks();
    });
    el.benchmarkBody.addEventListener("input", onBenchmarkInput);
    el.benchmarkBody.addEventListener("change", onBenchmarkInput);

    el.viewToggleButton.addEventListener("click", onToggleView);
    el.fullScreenToggleButton.addEventListener("click", onToggleImmersive);
    el.constructionCanvas.addEventListener("click", onCanvasClick);
    document.addEventListener("keydown", onGlobalKeydown);
    window.addEventListener("resize", onViewportResize);

    document.body.addEventListener("mouseover", onInspectHover);
    document.body.addEventListener("mouseout", onInspectOut);
    document.body.addEventListener("click", onInspectSelect);
  }

  function onViewportResize() {
    if (applyAutoBenchmarkCollapse()) {
      renderBenchmarks();
    }
  }

  function startTickers() {
    window.setInterval(() => {
      ui.tickerCapex += (facilityState.economics.totalCapex - ui.tickerCapex) * 0.16;
      if (Math.abs(ui.tickerCapex - facilityState.economics.totalCapex) < 10) {
        ui.tickerCapex = facilityState.economics.totalCapex;
      }
      el.capexTicker.textContent = compactMoney(ui.tickerCapex);
    }, 45);

    window.setInterval(() => {
      if (facilityState.phase >= 5 && ui.rackCache.length) {
        ui.rackCache.forEach((rack) => {
          rack.temp = clamp(rack.temp + (Math.random() - 0.5) * 0.7, rack.baseTemp - 2, rack.baseTemp + 2);
          rack.status = rack.temp > 34 ? "critical" : rack.temp > 30 ? "warning" : "healthy";
        });
        if (facilityState.phase === 8 && ui.mode === "map") {
          walkMapStats();
          updateMapOverlayValues();
        }
        if (facilityState.phase >= 5 && (facilityState.phase < 8 || ui.mode === "floor")) {
          renderCenterCanvas();
          renderInspector();
        }
      }
    }, 1400);
  }

  function onTimelineClick(event) {
    const row = event.target.closest("li[data-phase]");
    if (!row) return;
    const phase = Number(row.dataset.phase);
    if (!isPhaseUnlocked(phase)) return;
    facilityState.phase = phase;
    if (phase < 8) {
      ui.mode = "floor";
      setImmersivePhase8(false);
    } else {
      applyPhase8Immersive();
    }
    recalcAll();
    renderAll();
  }

  function onDecisionClick(event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    if (button.dataset.locked === "true") return;

    const action = button.dataset.action;
    const value = button.dataset.value;

    switch (action) {
      case "set-location":
        facilityState.site.locationType = value;
        break;
      case "set-permit":
        facilityState.site.permittingTrack = value;
        break;
      case "set-tier":
        facilityState.power.redundancyTier = value;
        break;
      case "set-ups":
        facilityState.power.upsType = value;
        break;
      case "set-fiber-access":
        facilityState.fiber.accessType = value;
        break;
      case "toggle-carrier":
        toggleCarrier(value);
        break;
      case "set-ixp":
        facilityState.fiber.ixpRegion = value;
        break;
      case "set-developer":
        facilityState.facility.developerType = value;
        break;
      case "set-cooling":
        facilityState.facility.coolingType = value;
        break;
      case "set-arch":
        facilityState.facility.powerArchitecture = value;
        break;
      case "set-gpu":
        facilityState.compute.gpuModel = value;
        break;
      case "set-stack":
        facilityState.compute.inferenceStack = value;
        break;
      case "set-serving":
        facilityState.compute.servingArch = value;
        break;
      case "set-fabric":
        facilityState.networking.fabric = value;
        break;
      case "set-external":
        facilityState.networking.externalBandwidth = value;
        break;
      case "set-monitoring":
        facilityState.dcim.monitoringApproach = value;
        break;
      case "set-maint":
        facilityState.dcim.maintenanceModel = value;
        break;
      case "set-telemetry":
        facilityState.dcim.coolingTelemetry = value === "on";
        break;
      default:
        return;
    }

    recalcAll();
    renderAll();
  }

  function onDecisionInput(event) {
    const t = event.target;
    const action = t.dataset.action;
    if (!action) return;

    switch (action) {
      case "set-acreage": {
        const n = Number(t.value);
        if (!Number.isFinite(n)) return;
        facilityState.site.acreage = Math.round(clamp(n, 5, 500));
        break;
      }
      case "set-source": {
        const n = Number(t.value);
        if (!Number.isFinite(n)) return;
        setPowerShare(t.dataset.key, Math.round(clamp(n, 0, 100)));
        break;
      }
      case "set-target-mw": {
        const n = Number(t.value);
        facilityState.power.targetMW = Number.isFinite(n) && n > 0 ? n : null;
        break;
      }
      case "set-gpr": {
        const n = Number(t.value);
        if (!Number.isFinite(n)) return;
        facilityState.compute.gpusPerRack = clamp(Math.round(n), 4, 16);
        break;
      }
      case "set-nodes": {
        const n = Number(t.value);
        if (!Number.isFinite(n)) return;
        facilityState.networking.nodeCount = Math.round(clamp(n, 1, 1024));
        break;
      }
      default:
        return;
    }

    recalcAll();
    renderAll();
  }

  function onBenchmarkInput(event) {
    const t = event.target;
    const action = t.dataset.action;
    if (!action) return;

    if (action === "bench-model") ui.bench.model = t.value;
    if (action === "bench-prompt") {
      const n = Number(t.value);
      if (!Number.isFinite(n)) return;
      ui.bench.prompt = n;
    }
    if (action === "bench-batch") {
      const n = Number(t.value);
      if (!Number.isFinite(n)) return;
      ui.bench.batch = Math.round(clamp(n, 1, 256));
    }
    if (action === "bench-output") {
      const n = Number(t.value);
      if (!Number.isFinite(n)) return;
      ui.bench.output = Math.round(clamp(n, 16, 8192));
    }
    if (action === "bench-conc") {
      const n = Number(t.value);
      if (!Number.isFinite(n)) return;
      ui.bench.conc = Math.round(clamp(n, 1, 4096));
    }
    if (action === "bench-precision") ui.bench.precision = t.value;
    if (action === "bench-observed") {
      const n = Number(t.value);
      if (!Number.isFinite(n)) return;
      ui.bench.observedTps = Math.round(clamp(n, 1, 1e7));
    }

    recalcBenchmarks();
    renderBenchmarks();
    renderInspector();
  }

  function onToggleView() {
    if (facilityState.phase !== 8) return;
    ui.mode = ui.mode === "map" ? "floor" : "map";
    renderCenterCanvas(true);
  }

  function onToggleImmersive() {
    if (facilityState.phase !== 8) return;
    setImmersivePhase8(!ui.immersivePhase8);
    applyAutoBenchmarkCollapse();
    renderBenchmarks();
    renderCenterCanvas();
  }

  function onGlobalKeydown(event) {
    if (event.key === "Escape" && ui.immersivePhase8) {
      setImmersivePhase8(false);
      renderCenterCanvas();
    }
  }

  function onCanvasClick(event) {
    const dc = event.target.closest("[data-action='jump-floor']");
    if (dc && facilityState.phase === 8) {
      ui.mode = "floor";
      renderCenterCanvas(true);
    }
  }

  function onInspectHover(event) {
    const target = event.target.closest("[data-inspect-kind]");
    if (!target) return;
    ui.hoverInspect = { kind: target.dataset.inspectKind, key: target.dataset.inspectKey };
    renderInspector();
  }

  function onInspectOut(event) {
    const target = event.target.closest("[data-inspect-kind]");
    if (!target) return;
    if (event.relatedTarget && target.contains(event.relatedTarget)) return;
    ui.hoverInspect = null;
    renderInspector();
  }

  function onInspectSelect(event) {
    const target = event.target.closest("[data-inspect-kind]");
    if (!target) return;
    ui.selectedInspect = { kind: target.dataset.inspectKind, key: target.dataset.inspectKey };
    renderInspector();
  }

  function onConfirmPhase() {
    if (ui.deploying.active) return;

    if (!isPhaseComplete(facilityState.phase)) {
      setDeployState("DECISIONS INCOMPLETE", 0, false);
      pushLog(`PHASE ${facilityState.phase} BLOCKED — REQUIRED DECISIONS MISSING`, "warn");
      return;
    }

    setDeployState("DEPLOYING...", 0, true);

    let progress = 0;
    const timer = window.setInterval(() => {
      progress = Math.min(100, progress + 5);
      setDeployState("DEPLOYING...", progress, true);
      if (progress >= 100) {
        window.clearInterval(timer);
        completePhaseTransition();
      }
    }, 40);
  }

  function completePhaseTransition() {
    const phase = facilityState.phase;

    if (!facilityState.completed.includes(phase)) {
      facilityState.completed.push(phase);
      facilityState.completed.sort((a, b) => a - b);
    }

    const summary = phaseSummaryLine(phase);
    pushLog(`PHASE ${phase} COMPLETE — ${summary}`, "good");
    pushLog(`CAPEX UPDATED: ${compactMoney(facilityState.economics.totalCapex)}`, "good");

    if (phase < 8) {
      const next = phase + 1;
      pushLog(`UNLOCKING PHASE ${next}: ${PHASES[next - 1]}`, "muted");
      facilityState.phase = next;
      if (next === 8) {
        ui.mode = "map";
        setImmersivePhase8(false);
      }
    }

    recalcAll();
    renderAll();
    setDeployState("READY", 0, false);
  }

  function setDeployState(message, progress, active) {
    ui.deploying.message = message;
    ui.deploying.progress = progress;
    ui.deploying.active = active;
    el.deployStatus.textContent = message;
    el.deployProgress.style.width = `${progress}%`;
  }

  function toggleCarrier(key) {
    const idx = facilityState.fiber.carriers.indexOf(key);
    if (idx >= 0) facilityState.fiber.carriers.splice(idx, 1);
    else facilityState.fiber.carriers.push(key);
  }

  function setPowerShare(sourceKey, value) {
    const next = clamp(Math.round(value), 0, 100);
    const prev = facilityState.power.sources[sourceKey] || 0;
    let delta = next - prev;
    facilityState.power.sources[sourceKey] = next;

    const otherKeys = Object.keys(facilityState.power.sources).filter((k) => k !== sourceKey);

    if (delta > 0) {
      const total = otherKeys.reduce((sum, k) => sum + facilityState.power.sources[k], 0);
      if (total <= 0) {
        otherKeys.forEach((k) => { facilityState.power.sources[k] = 0; });
      } else {
        otherKeys.forEach((k) => {
          const share = facilityState.power.sources[k];
          facilityState.power.sources[k] = clamp(share - (share / total) * delta, 0, 100);
        });
      }
    }

    if (delta < 0) {
      delta = Math.abs(delta);
      const add = delta / Math.max(1, otherKeys.length);
      otherKeys.forEach((k) => {
        facilityState.power.sources[k] = clamp(facilityState.power.sources[k] + add, 0, 100);
      });
    }

    normalizePowerShares();
  }

  function normalizePowerShares() {
    const keys = Object.keys(facilityState.power.sources);
    let total = 0;
    keys.forEach((k) => {
      facilityState.power.sources[k] = clamp(Math.round(facilityState.power.sources[k]), 0, 100);
      total += facilityState.power.sources[k];
    });

    if (total === 100) return;

    const biggest = keys.reduce((a, b) => (facilityState.power.sources[b] > facilityState.power.sources[a] ? b : a), keys[0]);
    facilityState.power.sources[biggest] = clamp(facilityState.power.sources[biggest] + (100 - total), 0, 100);
  }

  function recalcAll() {
    enforceLocks();

    const loc = LOCATION[facilityState.site.locationType];
    const permit = PERMIT[facilityState.site.permittingTrack];
    const targetMw = facilityState.power.targetMW || 0;

    facilityState.site.estimatedPermitCost = clamp((loc ? facilityState.site.acreage * 5500 : 50000) + (permit ? permit.costAdd : 0), 50000, 2000000);
    facilityState.site.permittingMonths = permit ? Math.round((permit.months[0] + permit.months[1]) / 2) : 0;

    normalizePowerShares();

    const tier = REDUNDANCY[facilityState.power.redundancyTier];
    const ups = UPS[facilityState.power.upsType];

    let blendedRate = 0;
    let powerCapex = 0;
    Object.entries(facilityState.power.sources).forEach(([key, pct]) => {
      blendedRate += (pct / 100) * POWER_SRC[key].rateMwh;
      powerCapex += targetMw * 1000 * (pct / 100) * POWER_SRC[key].capexKw;
    });

    powerCapex = powerCapex * (tier ? tier.mult : 1) + (ups ? targetMw * 1000 * ups.kwCapex : 0);
    const annualPowerOpex = targetMw * 8760 * blendedRate;
    const gridStress = clamp((facilityState.power.sources.fom || 0) * 1.2 + (targetMw >= 250 ? 12 : 0), 0, 100);

    const access = FIBER_ACCESS[facilityState.fiber.accessType];
    const ixp = IXP[facilityState.fiber.ixpRegion];

    const carrierMrc = facilityState.fiber.carriers.reduce((sum, key) => sum + CARRIER[key].mrc, 0);
    const quality = facilityState.fiber.carriers.length
      ? facilityState.fiber.carriers.reduce((sum, key) => sum + CARRIER[key].quality, 0) / facilityState.fiber.carriers.length
      : 0.7;

    const latency = ixp ? clamp(ixp.latency + (1 - quality) * 8, 1, 35) : 0;
    const fiberCapex = access
      ? access.capex + (facilityState.fiber.accessType === "build" ? Math.max(0, (loc ? loc.fiberMiles : 8) - 5) * 250000 : 0)
      : 0;

    facilityState.fiber.latencyMs = latency;
    facilityState.fiber.monthlyCost = (access ? access.mrc : 0) + carrierMrc;

    const dev = DEVELOPER[facilityState.facility.developerType];
    const cooling = COOLING[facilityState.facility.coolingType];
    const arch = ARCH[facilityState.facility.powerArchitecture];

    const devCostMid = dev ? (dev.cost[0] + dev.cost[1]) / 2 : 0;
    const facilityCapex = devCostMid + (cooling ? targetMw * cooling.perMw : 0) + (arch ? targetMw * arch.perMw : 0);

    facilityState.facility.buildMonths = dev ? Math.round((dev.months[0] + dev.months[1]) / 2) : 0;
    facilityState.facility.pue = clamp((cooling ? (cooling.pue[0] + cooling.pue[1]) / 2 : 2) - (facilityState.facility.powerArchitecture === "hvdc" ? 0.04 : 0), 1.05, 2.1);

    const gpu = GPU[facilityState.compute.gpuModel];
    const gpr = facilityState.compute.gpusPerRack || 8;

    const rackKw = gpu
      ? (gpu.rackKw ? gpu.rackKw : Math.max(20, gpu.kw * gpr * 2.8 + (["d2c", "immersion"].includes(facilityState.facility.coolingType) ? 9 : 6)))
      : 0;

    const powerLimitedRacks = rackKw > 0 ? Math.floor((targetMw * 1000 * 0.78) / rackKw) : 0;
    const footprintLimitedRacks = Math.max(0, Math.floor((facilityState.site.acreage || 5) * 22));
    const rackCount = Math.max(0, Math.min(powerLimitedRacks, footprintLimitedRacks || powerLimitedRacks));

    facilityState.compute.rackCount = rackCount;
    facilityState.compute.totalTFLOPS = gpu ? rackCount * gpr * gpu.pf * 1000 : 0;
    const totalGpus = gpu ? rackCount * gpr : 0;
    const computeCapex = gpu ? totalGpus * gpu.cost : 0;

    const stack = STACK[facilityState.compute.inferenceStack];
    const serving = SERVING[facilityState.compute.servingArch];
    const fabric = FABRIC[facilityState.networking.fabric];
    const external = EXTERNAL[facilityState.networking.externalBandwidth];

    const estimatedMfu = clamp(
      (gpu ? 0.32 : 0) +
      (stack ? (stack.mfu[0] + stack.mfu[1]) / 2 - 0.3 : 0) +
      (serving ? serving.mfuAdj : -0.06) +
      (fabric ? fabric.mfuAdj : -0.04) -
      (latency > 20 ? 0.08 : latency > 5 ? 0.04 : 0),
      0.16,
      0.86,
    );

    const nodes = facilityState.networking.nodeCount || 1;
    const switchCount = fabric ? Math.ceil(nodes / 32) * 2 + Math.max(2, Math.ceil(nodes / 96)) : 0;
    const allReduce = fabric ? (fabric.bw * nodes) / Math.max(1, Math.log2(nodes + 1)) : 0;
    const networkPenalty = clamp(nodes > 1 ? (fabric ? (fabric.us / 10) * Math.log2(nodes) : 12) : 0, 0, 38);

    facilityState.networking.networkingCapex =
      (fabric ? switchCount * fabric.swCost * fabric.premium : 0) +
      nodes * 1200 +
      (external ? external.annual * 0.45 : 0);

    const monitoring = MONITORING[facilityState.dcim.monitoringApproach];
    const maintenance = MAINT[facilityState.dcim.maintenanceModel];

    const telemetryBonus = facilityState.dcim.coolingTelemetry ? 9 : facilityState.dcim.coolingTelemetry === false ? -2 : 0;
    const redundancyBonus = tier ? (tier === REDUNDANCY.t1 ? 8 : tier === REDUNDANCY.t2 ? 12 : tier === REDUNDANCY.t3 ? 24 : 30) : 0;

    const health = clamp(
      38 +
      redundancyBonus +
      (monitoring ? monitoring.score : 0) +
      (maintenance ? maintenance.score : 0) +
      telemetryBonus -
      gridStress * 0.08 -
      networkPenalty * 0.3,
      0,
      100,
    );

    const uptime = clamp(
      (tier ? tier.uptime : 97.5) +
      (maintenance ? maintenance.saved / 1000 : 0) +
      (facilityState.dcim.coolingTelemetry ? 0.012 : 0),
      95,
      99.999,
    );

    const dcimOpex = (monitoring ? monitoring.opex : 0) + (maintenance ? maintenance.opex : 0) + (facilityState.dcim.coolingTelemetry ? 125000 : 0);
    const networkOpex = external ? external.annual : 0;

    const landCost = loc ? facilityState.site.acreage * loc.landPerAcre * (permit ? permit.landMult : 1) : 0;

    facilityState.economics.totalCapex =
      landCost +
      facilityState.site.estimatedPermitCost +
      powerCapex +
      fiberCapex +
      facilityCapex +
      computeCapex +
      facilityState.networking.networkingCapex;

    facilityState.economics.annualOpex = annualPowerOpex + facilityState.fiber.monthlyCost * 12 + dcimOpex + networkOpex + targetMw * 12000;
    facilityState.economics.tco3yr = facilityState.economics.totalCapex + facilityState.economics.annualOpex * 3;
    facilityState.economics.tco5yr = facilityState.economics.totalCapex + facilityState.economics.annualOpex * 5;

    ui.derived = {
      targetMw,
      rackKw,
      totalGpus,
      computeCapex,
      blendedRate,
      powerCapex,
      annualPowerOpex,
      fiberCapex,
      facilityCapex,
      estimatedMfu,
      switchCount,
      allReduce,
      networkPenalty,
      health,
      uptime,
      gridStress,
      interconnectQueue: targetMw >= 500 ? "DEEP (>48 MO)" : targetMw >= 100 ? "CONGESTED (24-48 MO)" : "MODERATE (6-24 MO)",
      mwLive: clamp(targetMw * (serving ? serving.util : 0.35), 0, targetMw || 1),
      redundancyScore: clamp(facilityState.fiber.carriers.length * 2 + quality * 4, 1, 10),
      networkRisk: networkPenalty > 24 ? "RED" : networkPenalty > 10 ? "AMBER" : "GREEN",
      rackDensity: cooling ? cooling.density : 0,
      latency,
      carrierMrc,
      externalUsers: external ? external.users : 0,
      extTtft: external ? external.ttft : 0,
      extAnnual: external ? external.annual : 0,
      ixpLabel: ixp ? ixp.label : "UNSET",
    };

    recalcBenchmarks();
    hydrateRackCache();
    syncMapStats();
  }

  function enforceLocks() {
    if (facilityState.facility.powerArchitecture === "hvdc" && facilityState.power.upsType !== "supercap") {
      facilityState.facility.powerArchitecture = null;
    }

    if (facilityState.compute.gpuModel && getGpuLockReason(facilityState.compute.gpuModel)) {
      facilityState.compute.gpuModel = null;
    }

    if (facilityState.compute.inferenceStack === "trt" && getStackLockReason("trt")) {
      facilityState.compute.inferenceStack = null;
    }
  }

  function getGpuLockReason(key) {
    const gpu = GPU[key];
    if (!gpu) return "";

    const cooling = facilityState.facility.coolingType;

    if (["b200", "b300", "rubin"].includes(key) && (!cooling || !["d2c", "immersion"].includes(cooling))) {
      return "REQUIRES D2C OR IMMERSION COOLING";
    }

    if (key === "h200" && cooling && !["rear", "d2c", "immersion"].includes(cooling)) {
      return "H200 REQUIRES LIQUID COOLING";
    }

    if (gpu.needsHvdc && facilityState.facility.powerArchitecture !== "hvdc") {
      return "RUBIN REQUIRES 800V HVDC + SST";
    }

    if (gpu.needsSupercap && facilityState.power.upsType !== "supercap") {
      return "RUBIN REQUIRES SUPERCAP + BESS";
    }

    return "";
  }

  function getArchLockReason(key) {
    if (key === "hvdc" && facilityState.power.upsType !== "supercap") {
      return "800V HVDC REQUIRES SUPERCAP/BESS";
    }
    return "";
  }

  function getStackLockReason(key) {
    if (key !== "trt") return "";
    const gpu = GPU[facilityState.compute.gpuModel];
    if (!gpu) return "TENSORRT-LLM REQUIRES H/B/R GPU";
    return ["H", "B", "R"].includes(gpu.series) ? "" : "TENSORRT-LLM REQUIRES H/B/R GPU";
  }

  function recalcBenchmarks() {
    const gpu = GPU[facilityState.compute.gpuModel];
    const stack = STACK[facilityState.compute.inferenceStack];

    if (!gpu || !stack || !facilityState.compute.rackCount || !ui.derived.totalGpus) {
      facilityState.benchmarks.ttft = null;
      facilityState.benchmarks.tps = null;
      facilityState.benchmarks.concurrency = null;
      facilityState.benchmarks.mfu = null;
      ui.derived.bench = { ttft: 0, peak: 0, tps: 0, max: 0, mfu: 0, range: "N/A" };
      return;
    }

    const model = MODEL[ui.bench.model];
    const bytes = PRECISION_BYTES[ui.bench.precision] || 1;

    const activeSlice = Math.min(Math.max(1, ui.derived.totalGpus), 64);
    const flops = gpu.pf * 1e15 * activeSlice;
    const mfu = clamp(ui.derived.estimatedMfu, 0.16, 0.9);

    const batchScale = Math.max(1, Math.log2(ui.bench.batch + 1));

    const ttft = clamp(
      ((ui.bench.prompt * model.p * 2) / (flops * mfu * batchScale)) * 1000 * stack.seedTtft + (ui.derived.extTtft || 0),
      5,
      3000,
    );

    const peak = clamp((flops * mfu) / (model.p * 2 * bytes), 0.1, 50_000_000);
    const outputPenalty = clamp(1 - ui.bench.output / 18000, 0.55, 1);
    const concPenalty = clamp(1 - Math.max(0, ui.bench.conc - 32) / 1200, 0.35, 1);
    const tps = peak * stack.seedTps * outputPenalty * concPenalty;

    const totalVram = ui.derived.totalGpus * gpu.vram * 0.78;
    const modelMem = ui.bench.precision === "FP16" ? model.fp16 : ui.bench.precision === "FP8" ? model.fp8 : model.int4;
    const kvPerReq = clamp((ui.bench.prompt / 512) * (model.p / 1e9) * 0.045, 0.5, 420);
    const max = Math.max(1, Math.floor(Math.max(0, totalVram - modelMem) / kvPerReq));

    if (!ui.bench.observedTps || ui.bench.observedTps <= 0) {
      ui.bench.observedTps = clamp(tps * 0.92, 1, tps);
    }

    const observed = clamp(ui.bench.observedTps, 1, peak * 1.4);
    const mfuPct = clamp(((observed * model.p * 2) / flops) * 100, 0, 100);

    facilityState.benchmarks.ttft = ttft;
    facilityState.benchmarks.tps = tps;
    facilityState.benchmarks.concurrency = max;
    facilityState.benchmarks.mfu = mfuPct;

    ui.derived.bench = {
      ttft,
      peak,
      tps,
      max,
      mfu: mfuPct,
      range: `${Math.round(stack.mfu[0] * 100)}-${Math.round(stack.mfu[1] * 100)}%`,
    };
  }

  function hydrateRackCache() {
    const count = facilityState.compute.rackCount || 0;
    const gpu = GPU[facilityState.compute.gpuModel];
    if (!gpu || count <= 0) {
      ui.rackCache = [];
      return;
    }

    const sig = `${facilityState.compute.gpuModel}|${facilityState.compute.gpusPerRack}|${count}|${facilityState.power.targetMW || 0}|${facilityState.compute.inferenceStack || "none"}`;
    if (ui.rackCache.length === count && ui.rackCache[0]?.sig === sig) return;

    const baseTemp = clamp((facilityState.facility.pue || 1.7) * 16 + 8, 18, 34);

    ui.rackCache = Array.from({ length: count }, (_, idx) => {
      const seed = seeded(idx + 1, sig);
      return {
        id: idx + 1,
        sig,
        temp: clamp(baseTemp + (seed - 0.5) * 3.2, baseTemp - 2, baseTemp + 2),
        baseTemp,
        powerKw: (ui.derived.rackKw || 24) * (0.86 + seed * 0.28),
        util: clamp((ui.derived.estimatedMfu || 0.3) * 100 * (0.78 + seed * 0.4), 8, 99),
        uptime: clamp(ui.derived.uptime - seed * 0.015, 95, 99.999),
        status: "healthy",
      };
    });
  }

  function syncMapStats() {
    const b = ui.derived.bench || { tps: 0, ttft: 0 };
    ui.mapStats.req = Math.max(1, Math.round((facilityState.networking.nodeCount || 1) * 6.4));
    ui.mapStats.tps = Math.max(1, Math.round(b.tps || 0));
    ui.mapStats.users = Math.max(1, Math.round((facilityState.networking.nodeCount || 1) * 2.2));
    ui.mapStats.ttft = Math.max(1, Math.round(b.ttft || 120));
    ui.mapStats.util = Math.round((ui.derived.estimatedMfu || 0.32) * 100);
  }

  function walkMapStats() {
    const walk = (value) => Math.max(1, Math.round(value * (1 + (Math.random() - 0.5) * 0.1)));
    ui.mapStats.req = walk(ui.mapStats.req);
    ui.mapStats.tps = walk(ui.mapStats.tps);
    ui.mapStats.users = walk(ui.mapStats.users);
    ui.mapStats.ttft = walk(ui.mapStats.ttft);
    ui.mapStats.util = clamp(Math.round(ui.mapStats.util * (1 + (Math.random() - 0.5) * 0.1)), 1, 100);
  }

  function seeded(i, sig) {
    let h = 0;
    for (let c = 0; c < sig.length; c += 1) {
      h = (h << 5) - h + sig.charCodeAt(c);
      h |= 0;
    }
    const val = Math.sin(i * 999 + h * 0.01) * 10000;
    return val - Math.floor(val);
  }

  function isPhaseComplete(phase) {
    if (phase === 1) return !!(facilityState.site.locationType && facilityState.site.acreage && facilityState.site.permittingTrack);
    if (phase === 2) return !!(facilityState.power.targetMW && facilityState.power.redundancyTier && facilityState.power.upsType) && powerTotal() === 100;
    if (phase === 3) return !!(facilityState.fiber.accessType && facilityState.fiber.ixpRegion && facilityState.fiber.carriers.length >= 2);
    if (phase === 4) return !!(facilityState.facility.developerType && facilityState.facility.coolingType && facilityState.facility.powerArchitecture);
    if (phase === 5) return !!(facilityState.compute.gpuModel && facilityState.compute.gpusPerRack && facilityState.compute.inferenceStack && facilityState.compute.servingArch);
    if (phase === 6) return !!(facilityState.networking.fabric && facilityState.networking.nodeCount && facilityState.networking.externalBandwidth);
    if (phase === 7) return !!(facilityState.dcim.monitoringApproach && facilityState.dcim.maintenanceModel && facilityState.dcim.coolingTelemetry !== null);
    return true;
  }

  function isPhaseUnlocked(phase) {
    if (phase <= 1) return true;
    return facilityState.completed.includes(phase - 1) || phase <= facilityState.phase;
  }

  function powerTotal() {
    return Math.round(Object.values(facilityState.power.sources).reduce((sum, v) => sum + v, 0));
  }

  function renderAll() {
    applyAutoBenchmarkCollapse();
    renderTimeline();
    renderLeftDecision();
    renderLeftMetrics();
    renderCenterCanvas();
    renderBenchmarks();
    renderBuildLog();
    renderInspector();
  }

  function applyAutoBenchmarkCollapse() {
    if (ui.benchmarkUserOverride) return false;
    const shouldCollapse = facilityState.phase === 8 && !ui.immersivePhase8 && window.innerHeight <= 860;
    const changed = ui.benchmarkCollapsed !== shouldCollapse;
    ui.benchmarkCollapsed = shouldCollapse;
    return changed;
  }

  function renderTimeline() {
    el.phaseTimeline.innerHTML = PHASES.map((name, idx) => {
      const p = idx + 1;
      const active = facilityState.phase === p;
      const complete = facilityState.completed.includes(p);
      const locked = !isPhaseUnlocked(p);
      const state = complete ? "COMPLETE" : active ? "ACTIVE" : locked ? "LOCKED" : "READY";
      return `<li class="${active ? "active" : ""} ${complete ? "complete" : ""} ${locked ? "locked" : ""}" data-phase="${p}"><span class="num">${complete ? "✓" : p}</span><span>${name}</span><span>${state}</span></li>`;
    }).join("");
  }

  function renderLeftDecision() {
    el.leftPhaseTitle.textContent = `PHASE ${facilityState.phase}: ${PHASES[facilityState.phase - 1]}`;
    el.leftDecisionBody.innerHTML = decisionHtmlForPhase(facilityState.phase);
    el.confirmPhaseButton.disabled = ui.deploying.active || facilityState.phase === 8 || !isPhaseComplete(facilityState.phase);
    el.confirmPhaseButton.textContent = facilityState.phase === 8 ? "FACILITY ONLINE" : ui.deploying.active ? "DEPLOYING..." : "CONFIRM";
  }

  function renderLeftMetrics() {
    el.annualOpex.textContent = compactMoney(facilityState.economics.annualOpex);
    el.targetPue.textContent = (facilityState.facility.pue || 2).toFixed(2);
    el.uptimeProjection.textContent = `${(ui.derived.uptime || 0).toFixed(3)}%`;
  }

  function decisionHtmlForPhase(phase) {
    if (phase === 1) return decisionPhase1();
    if (phase === 2) return decisionPhase2();
    if (phase === 3) return decisionPhase3();
    if (phase === 4) return decisionPhase4();
    if (phase === 5) return decisionPhase5();
    if (phase === 6) return decisionPhase6();
    if (phase === 7) return decisionPhase7();
    return `<div class="info-callout">ALL PHASES COMPLETE. SWITCH BETWEEN MAP/FLOOR VIEW OR ENABLE FULL SCREEN FROM THE CENTER CONTROLS.</div>`;
  }

  function decisionCard({ action, value, title, lines, selected = false, locked = false, lock = "", inspectKind, inspectKey }) {
    return `
      <button
        type="button"
        class="decision-card ${selected ? "selected" : ""} ${locked ? "locked" : ""}"
        data-action="${action}"
        data-value="${value}"
        data-inspect-kind="${inspectKind || "summary"}"
        data-inspect-key="${inspectKey || value || ""}"
        ${locked ? "data-locked=\"true\"" : ""}
        title="${esc(lock)}">
        <strong>${esc(title)}</strong>
        ${lines.map((line) => `<span class="small">${esc(line)}</span>`).join("")}
        ${locked ? `<span class="option-lock">LOCKED: ${esc(lock)}</span>` : ""}
      </button>
    `;
  }

  function decisionPhase1() {
    const locCards = Object.entries(LOCATION).map(([key, item]) => decisionCard({
      action: "set-location",
      value: key,
      title: item.label,
      lines: [
        `LAND: ${CURRENCY0.format(item.landPerAcre)} / ACRE`,
        `PERMIT: ${item.permitMonths[0]}-${item.permitMonths[1]} MO`,
        `NIMBY: ${item.nimby}`,
        `FIBER: ${item.fiberMiles} MI | GRID: ${item.gridMiles} MI`,
      ],
      selected: facilityState.site.locationType === key,
      inspectKind: "location",
      inspectKey: key,
    })).join("");

    const permitCards = Object.entries(PERMIT).map(([key, item]) => decisionCard({
      action: "set-permit",
      value: key,
      title: item.label,
      lines: [
        `TIMELINE: ${item.months[0]}-${item.months[1]} MO`,
        `LAND MULTIPLIER: ${item.landMult.toFixed(2)}X`,
        `COST ADDER: ${CURRENCY0.format(item.costAdd)}`,
      ],
      selected: facilityState.site.permittingTrack === key,
      inspectKind: "permit",
      inspectKey: key,
    })).join("");

    const acreage = facilityState.site.acreage;
    const maxMw = acreage * 1.8;
    const util = clamp((ui.derived.targetMw ? (ui.derived.targetMw / maxMw) * 100 : 18 + acreage * 0.12), 5, 98);
    const room = clamp(100 - util, 2, 95);

    return `
      <div class="decision-block">
        <h3>DECISION 1 — LOCATION TYPE</h3>
        <div class="option-grid">${locCards}</div>
      </div>
      <div class="decision-block">
        <h3>DECISION 2 — ACREAGE</h3>
        <div class="slider-line" data-inspect-kind="acreage" data-inspect-key="value">
          <div class="top"><span>SITE SIZE</span><strong>${INTEGER.format(acreage)} ACRES</strong></div>
          <div class="range-control">
            <input type="range" min="5" max="500" step="1" value="${acreage}" data-action="set-acreage" />
            <input class="range-number" type="number" min="5" max="500" step="1" value="${acreage}" data-action="set-acreage" inputmode="numeric" />
          </div>
        </div>
        <div class="info-callout">MAX MW: ${maxMw.toFixed(1)} | UTILIZATION: ${util.toFixed(1)}% | EXPANSION ROOM: ${room.toFixed(1)}%</div>
      </div>
      <div class="decision-block">
        <h3>DECISION 3 — PERMITTING TRACK</h3>
        <div class="option-grid cols-3">${permitCards}</div>
      </div>
    `;
  }

  function decisionPhase2() {
    const sourceSliders = Object.entries(POWER_SRC).map(([key, src]) => `
      <div class="slider-line" data-inspect-kind="power-source" data-inspect-key="${key}">
        <div class="top"><span>${src.label}</span><strong>${facilityState.power.sources[key].toFixed(1)}%</strong></div>
        <div class="range-control">
          <input type="range" min="0" max="100" step="1" value="${facilityState.power.sources[key]}" data-action="set-source" data-key="${key}" />
          <input class="range-number" type="number" min="0" max="100" step="1" value="${Math.round(facilityState.power.sources[key])}" data-action="set-source" data-key="${key}" inputmode="numeric" />
        </div>
      </div>
    `).join("");

    const tierCards = Object.entries(REDUNDANCY).map(([key, tier]) => decisionCard({
      action: "set-tier",
      value: key,
      title: `${tier.label} (${tier.uptime}%)`,
      lines: [`DOWNTIME: ${tier.downtime.toFixed(1)} HRS/YR`, `CAPEX MULTIPLIER: ${tier.mult.toFixed(2)}X`],
      selected: facilityState.power.redundancyTier === key,
      inspectKind: "tier",
      inspectKey: key,
    })).join("");

    const upsCards = Object.entries(UPS).map(([key, item]) => decisionCard({
      action: "set-ups",
      value: key,
      title: item.label,
      lines: [`RESPONSE: ${item.response}`, `CYCLE LIFE: ${INTEGER.format(item.cycles)}`, `COST: ${CURRENCY0.format(item.kwh)}/KWH`, item.supercap ? "UNLOCKS 800V HVDC + RUBIN" : "RUBIN LOCKED"],
      selected: facilityState.power.upsType === key,
      inspectKind: "ups",
      inspectKey: key,
    })).join("");

    return `
      <div class="decision-block">
        <h3>DECISION 1 — POWER SOURCE MIX (TOTAL 100%)</h3>
        ${sourceSliders}
        ${powerTotal() !== 100 ? `<div class="warning-callout">POWER MIX MUST EQUAL 100%. CURRENT: ${powerTotal()}%</div>` : ""}
      </div>
      <div class="decision-block">
        <h3>DECISION 2 — TARGET MW CAPACITY</h3>
        <select data-action="set-target-mw" data-inspect-kind="target-mw" data-inspect-key="value">
          <option value="">SELECT TARGET CAPACITY</option>
          ${TARGET_MW.map((mw) => `<option value="${mw}" ${facilityState.power.targetMW === mw ? "selected" : ""}>${mw >= 1000 ? "1 GW+" : `${mw} MW`}</option>`).join("")}
        </select>
        <div class="info-callout">POWER CAPEX: ${compactMoney(ui.derived.powerCapex || 0)} | QUEUE: ${ui.derived.interconnectQueue}</div>
      </div>
      <div class="decision-block">
        <h3>DECISION 3 — REDUNDANCY TIER</h3>
        <div class="option-grid cols-4">${tierCards}</div>
      </div>
      <div class="decision-block">
        <h3>DECISION 4 — UPS + STORAGE STACK</h3>
        <div class="option-grid cols-3">${upsCards}</div>
      </div>
    `;
  }

  function decisionPhase3() {
    const accessCards = Object.entries(FIBER_ACCESS).map(([key, item]) => decisionCard({
      action: "set-fiber-access",
      value: key,
      title: item.label,
      lines: [`CAPEX: ${CURRENCY0.format(item.capex)}`, `MONTHLY: ${CURRENCY0.format(item.mrc)}`],
      selected: facilityState.fiber.accessType === key,
      inspectKind: "fiber-access",
      inspectKey: key,
    })).join("");

    const carrierCards = Object.entries(CARRIER).map(([key, item]) => decisionCard({
      action: "toggle-carrier",
      value: key,
      title: item.label,
      lines: [item.tier, `MRC: ${CURRENCY0.format(item.mrc)}`],
      selected: facilityState.fiber.carriers.includes(key),
      inspectKind: "carrier",
      inspectKey: key,
    })).join("");

    const ixpCards = Object.entries(IXP).map(([key, item]) => decisionCard({
      action: "set-ixp",
      value: key,
      title: item.label,
      lines: [`DISTANCE: ${item.miles} MI`, `LATENCY: ${item.latency.toFixed(1)} MS`, `SUBSEA: ${item.subsea ? "Y" : "N"}`],
      selected: facilityState.fiber.ixpRegion === key,
      inspectKind: "ixp",
      inspectKey: key,
    })).join("");

    return `
      <div class="decision-block"><h3>DECISION 1 — FIBER ACCESS</h3><div class="option-grid">${accessCards}</div></div>
      <div class="decision-block"><h3>DECISION 2 — CARRIERS (MINIMUM 2)</h3><div class="option-grid cols-3">${carrierCards}</div>${facilityState.fiber.carriers.length < 2 ? `<div class="warning-callout">SELECT AT LEAST TWO CARRIERS.</div>` : ""}</div>
      <div class="decision-block"><h3>DECISION 3 — IXP PROXIMITY</h3><div class="option-grid cols-4">${ixpCards}</div></div>
    `;
  }

  function decisionPhase4() {
    const devCards = Object.entries(DEVELOPER).map(([key, item]) => decisionCard({
      action: "set-developer",
      value: key,
      title: item.label,
      lines: [`SHELL: ${compactMoney((item.cost[0] + item.cost[1]) / 2)}`, `BUILD: ${item.months[0]}-${item.months[1]} MO`],
      selected: facilityState.facility.developerType === key,
      inspectKind: "developer",
      inspectKey: key,
    })).join("");

    const coolingCards = Object.entries(COOLING).map(([key, item]) => decisionCard({
      action: "set-cooling",
      value: key,
      title: item.label,
      lines: [`DENSITY: ${INTEGER.format(item.density)} KW/RACK`, `INSTALL: ${compactMoney(item.perMw)} / MW`, `PUE: ${item.pue[0]}-${item.pue[1]}`],
      selected: facilityState.facility.coolingType === key,
      inspectKind: "cooling",
      inspectKey: key,
    })).join("");

    const archCards = Object.entries(ARCH).map(([key, item]) => {
      const lock = getArchLockReason(key);
      return decisionCard({
        action: "set-arch",
        value: key,
        title: item.label,
        lines: [`LOSSES: ${item.loss}%`, `COPPER SAVINGS: ${item.copper}%`],
        selected: facilityState.facility.powerArchitecture === key,
        locked: !!lock,
        lock,
        inspectKind: "arch",
        inspectKey: key,
      });
    }).join("");

    return `
      <div class="decision-block"><h3>DECISION 1 — DEVELOPER TYPE</h3><div class="option-grid">${devCards}</div></div>
      <div class="decision-block"><h3>DECISION 3 — COOLING INFRASTRUCTURE</h3><div class="option-grid">${coolingCards}</div>${facilityState.facility.coolingType === "immersion" ? `<div class="warning-callout">IMMERSION MAY LIMIT COLLATERAL FINANCING.</div>` : ""}</div>
      <div class="decision-block"><h3>DECISION 4 — POWER ARCHITECTURE</h3><div class="option-grid cols-3">${archCards}</div></div>
    `;
  }

  function decisionPhase5() {
    const gpuCards = Object.entries(GPU).map(([key, item]) => {
      const lock = getGpuLockReason(key);
      return decisionCard({
        action: "set-gpu",
        value: key,
        title: item.label,
        lines: [`TDP: ${(item.kw * 1000).toFixed(1)}W`, `VRAM: ${INTEGER.format(item.vram)}GB`, `FP8: ${item.pf.toFixed(2)} PFLOPS`, `COST: ${CURRENCY0.format(item.cost)}`],
        selected: facilityState.compute.gpuModel === key,
        locked: !!lock,
        lock,
        inspectKind: "gpu",
        inspectKey: key,
      });
    }).join("");

    const stackCards = Object.entries(STACK).map(([key, item]) => {
      const lock = getStackLockReason(key);
      return decisionCard({
        action: "set-stack",
        value: key,
        title: item.label,
        lines: [`BEST FOR: ${item.best}`, `MFU: ${Math.round(item.mfu[0] * 100)}-${Math.round(item.mfu[1] * 100)}%`],
        selected: facilityState.compute.inferenceStack === key,
        locked: !!lock,
        lock,
        inspectKind: "stack",
        inspectKey: key,
      });
    }).join("");

    const servingCards = Object.entries(SERVING).map(([key, item]) => decisionCard({
      action: "set-serving",
      value: key,
      title: item.label,
      lines: [`UTIL TARGET: ${Math.round(item.util * 100)}%`, `MFU IMPACT: ${item.mfuAdj >= 0 ? "+" : ""}${Math.round(item.mfuAdj * 100)}%`],
      selected: facilityState.compute.servingArch === key,
      inspectKind: "serving",
      inspectKey: key,
    })).join("");

    return `
      <div class="decision-block"><h3>DECISION 1 — GPU GENERATION</h3><div class="option-grid">${gpuCards}</div></div>
      <div class="decision-block"><h3>DECISION 2 — GPUS PER RACK</h3><select data-action="set-gpr" data-inspect-kind="gpr" data-inspect-key="value">${[4, 8, 16].map((v) => `<option value="${v}" ${facilityState.compute.gpusPerRack === v ? "selected" : ""}>${v} GPUS / RACK ${v === 8 ? "(OCP STANDARD)" : ""}</option>`).join("")}</select><div class="info-callout">RACK POWER: ${(ui.derived.rackKw || 0).toFixed(1)} KW | RACKS: ${INTEGER.format(facilityState.compute.rackCount || 0)}</div></div>
      <div class="decision-block"><h3>DECISION 3 — INFERENCE STACK</h3><div class="option-grid">${stackCards}</div></div>
      <div class="decision-block"><h3>DECISION 4 — SERVING ARCHITECTURE</h3><div class="option-grid cols-3">${servingCards}</div></div>
    `;
  }

  function decisionPhase6() {
    const fabricCards = Object.entries(FABRIC).map(([key, item]) => decisionCard({
      action: "set-fabric",
      value: key,
      title: item.label,
      lines: [`BW: ${item.bw} GB/S`, `LATENCY: ${item.us.toFixed(1)} US`, `PREMIUM: ${Math.round((item.premium - 1) * 100)}%`],
      selected: facilityState.networking.fabric === key,
      inspectKind: "fabric",
      inspectKey: key,
    })).join("");

    const extCards = Object.entries(EXTERNAL).map(([key, item]) => decisionCard({
      action: "set-external",
      value: key,
      title: item.label,
      lines: [`USERS: ${INTEGER.format(item.users)}`, `TTFT +${item.ttft.toFixed(1)}MS`, `ANNUAL: ${compactMoney(item.annual)}`],
      selected: facilityState.networking.externalBandwidth === key,
      inspectKind: "external",
      inspectKey: key,
    })).join("");

    return `
      <div class="decision-block"><h3>DECISION 1 — INTRA-CLUSTER FABRIC</h3><div class="option-grid cols-3">${fabricCards}</div></div>
      <div class="decision-block"><h3>DECISION 2 — SCALE</h3><div class="slider-line" data-inspect-kind="nodes" data-inspect-key="value"><div class="top"><span>NODES</span><strong>${INTEGER.format(facilityState.networking.nodeCount)}</strong></div><div class="range-control"><input type="range" min="1" max="1024" step="1" value="${facilityState.networking.nodeCount}" data-action="set-nodes" /><input class="range-number" type="number" min="1" max="1024" step="1" value="${facilityState.networking.nodeCount}" data-action="set-nodes" inputmode="numeric" /></div></div><div class="info-callout">SPINE/LEAF: ${INTEGER.format(ui.derived.switchCount || 0)} | ALL-REDUCE: ${(ui.derived.allReduce || 0).toFixed(1)} GB/S</div></div>
      <div class="decision-block"><h3>DECISION 3 — EXTERNAL CONNECTIVITY</h3><div class="option-grid cols-4">${extCards}</div></div>
    `;
  }

  function decisionPhase7() {
    const monCards = Object.entries(MONITORING).map(([key, item]) => decisionCard({
      action: "set-monitoring",
      value: key,
      title: item.label,
      lines: [`MTTD: ${item.mttd} MIN`, `OPEX: ${compactMoney(item.opex)}`, `HEALTH +${item.score}`],
      selected: facilityState.dcim.monitoringApproach === key,
      inspectKind: "monitoring",
      inspectKey: key,
    })).join("");

    const maintCards = Object.entries(MAINT).map(([key, item]) => decisionCard({
      action: "set-maint",
      value: key,
      title: item.label,
      lines: [`SAVED: ${item.saved >= 0 ? "+" : ""}${item.saved} HRS/YR`, `CREW: ${item.crew}`, `OPEX: ${compactMoney(item.opex)}`],
      selected: facilityState.dcim.maintenanceModel === key,
      inspectKind: "maintenance",
      inspectKey: key,
    })).join("");

    return `
      <div class="decision-block"><h3>DECISION 1 — MONITORING APPROACH</h3><div class="option-grid">${monCards}</div></div>
      <div class="decision-block"><h3>DECISION 2 — MAINTENANCE MODEL</h3><div class="option-grid cols-3">${maintCards}</div></div>
      <div class="decision-block"><h3>DECISION 3 — COOLING TELEMETRY</h3><div class="option-grid cols-2">
        ${decisionCard({ action: "set-telemetry", value: "on", title: "TELEMETRY ON", lines: ["FAILURE RISK: 13% -> <3%", "COOLANT TEMP / FLOW / PH / CONDUCTIVITY"], selected: facilityState.dcim.coolingTelemetry === true, inspectKind: "telemetry", inspectKey: "on" })}
        ${decisionCard({ action: "set-telemetry", value: "off", title: "TELEMETRY OFF", lines: ["BASELINE FAILURE RISK: 13%", "LIMITED COOLING SIGNALS"], selected: facilityState.dcim.coolingTelemetry === false, inspectKind: "telemetry", inspectKey: "off" })}
      </div>${facilityState.power.redundancyTier && ["t1", "t2"].includes(facilityState.power.redundancyTier) ? `<div class="warning-callout">&lt;TIER 3 REDUNDANCY. UPTIME RISK ELEVATED.</div>` : ""}</div>
    `;
  }

  function setImmersivePhase8(active) {
    ui.immersivePhase8 = facilityState.phase === 8 ? !!active : false;
    applyPhase8Immersive();
  }

  function applyPhase8Immersive() {
    const active = facilityState.phase === 8 && ui.immersivePhase8;
    el.forgeRoot.classList.toggle("phase8-fullscreen", active);
    el.benchmarkSuite.hidden = active;
  }

  function renderCenterCanvas(withTransition = false) {
    const phase8 = facilityState.phase === 8;
    const mapMode = phase8 && ui.mode === "map";

    if (!phase8 && ui.immersivePhase8) {
      ui.immersivePhase8 = false;
    }
    applyPhase8Immersive();

    el.canvasTitle.textContent = mapMode ? "LIVE — GLOBAL MAP VIEW" : "LIVE CONSTRUCTION VIEW";
    el.siteStatusTag.style.visibility = facilityState.phase >= 1 && facilityState.site.locationType ? "visible" : "hidden";

    el.viewToggleButton.hidden = !phase8;
    el.fullScreenToggleButton.hidden = !phase8;
    if (phase8) {
      el.viewToggleButton.textContent = ui.mode === "map" ? "[⊞ FLOOR VIEW]" : "[⊕ MAP VIEW]";
      el.fullScreenToggleButton.textContent = ui.immersivePhase8 ? "[EXIT FULL SCREEN]" : "[FULL SCREEN]";
    }

    if (mapMode) {
      el.constructionCanvas.innerHTML = renderMapView(withTransition);
    } else {
      el.constructionCanvas.innerHTML = renderFloorView(withTransition);
    }

    setupTravelAnimations(mapMode ? "map" : "floor");
  }

  function renderFloorView(withTransition) {
    const g = geometryFromAcreage(facilityState.site.acreage);
    const p = facilityState.phase;

    const location = LOCATION[facilityState.site.locationType];
    const showSite = p >= 1 || !!location;
    const showPower = p >= 2;
    const showFiber = p >= 3;
    const showFacility = p >= 4;
    const showCompute = p >= 5;
    const showNetwork = p >= 6;
    const showDcim = p >= 7;

    const racks = buildRackRects(g, facilityState.compute.rackCount || 0);
    const gpuKey = facilityState.compute.gpuModel || "h100";
    const rackClass = gpuKey === "rubin" ? "rubin" : gpuKey === "h100" ? "h100" : gpuKey === "h200" ? "h200" : gpuKey === "b200" ? "b200" : "b300";

    const solarCount = Math.ceil((facilityState.power.sources.solar || 0) / 8);
    const gasCount = Math.ceil((facilityState.power.sources.gas || 0) / 12);

    const solarRects = Array.from({ length: Math.max(0, solarCount) }, (_, i) => {
      const col = i % 8;
      const row = Math.floor(i / 8);
      return `<rect class="solar" x="${g.x + 10 + col * 18}" y="${g.y + 12 + row * 14}" width="14" height="8" data-inspect-kind="power-source" data-inspect-key="solar"></rect>`;
    }).join("");

    const genRects = Array.from({ length: Math.max(0, gasCount) }, (_, i) => {
      const col = i % 6;
      const row = Math.floor(i / 6);
      return `<rect class="generator" x="${g.x + g.w - 18 - col * 14}" y="${g.y + 10 + row * 11}" width="10" height="8" data-inspect-kind="power-source" data-inspect-key="gas"></rect>`;
    }).join("");

    const rackNodes = racks.map((rack, i) => {
      const style = `animation-delay:${i * 40}ms;`;
      const telemetry = ui.rackCache[i];
      const t = telemetry ? telemetry.temp.toFixed(1) : "--";
      const pwr = telemetry ? telemetry.powerKw.toFixed(1) : "--";
      return `
        <g data-inspect-kind="rack" data-inspect-key="${i + 1}">
          <rect class="rack powered" style="${style}" x="${rack.x}" y="${rack.y}" width="${rack.w}" height="${rack.h}"></rect>
          <rect class="rack-led ${rackClass} ${showDcim ? "live" : ""}" x="${rack.x + Math.max(1, rack.w * 0.12)}" y="${rack.y + 1}" width="${Math.max(1, rack.w * 0.18)}" height="${Math.max(2, rack.h - 2)}"></rect>
          ${showDcim ? `<circle class="sensor" cx="${rack.x + rack.w * 0.76}" cy="${rack.y + rack.h * 0.28}" r="${Math.max(1, rack.w * 0.16)}"></circle>` : ""}
          ${showCompute && rack.w > 6 ? `<text x="${rack.x + rack.w * 0.52}" y="${rack.y + rack.h + 6}" font-size="4" text-anchor="middle" fill="#8fb0cd">${pwr}KW | ${t}C</text>` : ""}
        </g>
      `;
    }).join("");

    const networkRows = showNetwork ? rackRowPaths(g, racks) : { paths: "", leafs: "", spine: "", markers: "" };

    const stageClass = withTransition ? "floor-stage" : "";

    return `
      <div class="canvas-shell ${stageClass}">
        <svg viewBox="0 0 1200 700" role="img" aria-label="Construction site view">
          <defs>
            <pattern id="groundPattern" width="12" height="12" patternUnits="userSpaceOnUse">
              <rect width="12" height="12" fill="#0f1814"></rect>
              <path d="M0 0H12M0 12H12M0 0V12M12 0V12" stroke="#173027" stroke-width="0.5"></path>
            </pattern>
          </defs>
          <rect x="0" y="0" width="1200" height="700" fill="#0b1018"></rect>
          ${Array.from({ length: 24 }, (_, i) => `<line class="ground-line" x1="0" y1="${40 + i * 28}" x2="1200" y2="${40 + i * 28}"></line>`).join("")}

          ${showSite ? `<rect class="plot-ground" x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" data-inspect-kind="acreage" data-inspect-key="value"></rect>` : ""}
          ${showSite ? `<path class="fence fence-trace" d="M${g.x} ${g.y}H${g.x + g.w}V${g.y + g.h}H${g.x}Z"></path>` : ""}
          ${showSite ? `<path class="road-path" d="M0 ${g.y + g.h - 26} C180 ${g.y + g.h - 18}, 240 ${g.y + g.h - 16}, ${g.x + 26} ${g.y + g.h - 16}"></path>` : ""}

          ${showPower ? `<g>
            ${(facilityState.power.sources.fom || 0) > 0 ? `<g data-inspect-kind="power-source" data-inspect-key="fom"><rect x="${g.x + g.w * 0.72}" y="${g.y - 72}" width="16" height="30" fill="#38465e"></rect><path d="M${g.x + g.w * 0.72} ${g.y - 42}L${g.x + g.w * 0.72 + 8} ${g.y}" class="power-line"></path></g>` : ""}
            ${genRects}
            ${solarRects}
            ${(facilityState.power.sources.smr || 0) > 0 ? `<g data-inspect-kind="power-source" data-inspect-key="smr"><path class="reactor" d="M${g.x + g.w - 90} ${g.y + g.h - 32}Q${g.x + g.w - 72} ${g.y + g.h - 62} ${g.x + g.w - 54} ${g.y + g.h - 32}Z"></path><text x="${g.x + g.w - 122}" y="${g.y + g.h - 38}" fill="#f59e0b" font-size="8">PENDING 2027</text></g>` : ""}
            <rect class="substation" x="${g.x + 20}" y="${g.y + g.h - 52}" width="38" height="26" data-inspect-kind="power-substation" data-inspect-key="main"></rect>
            <path class="power-line" d="M${g.x + 58} ${g.y + g.h - 38}H${g.x + 120}"></path>
            ${facilityState.power.upsType ? `<rect class="ups-box" x="${g.x + 64}" y="${g.y + g.h - 50}" width="18" height="18" data-inspect-kind="ups" data-inspect-key="${facilityState.power.upsType}"></rect>` : ""}
          </g>` : ""}

          ${showFiber ? `<g>
            <path class="${facilityState.fiber.accessType === "dark" ? "power-line" : "power-line"}" stroke-width="${facilityState.fiber.accessType === "dark" ? 4 : 2}" d="M${g.x + g.w} ${g.y + g.h * 0.5} C${g.x + g.w + 90} ${g.y + g.h * 0.35}, 1060 120, 1180 88" data-inspect-kind="fiber-access" data-inspect-key="${facilityState.fiber.accessType || "lit"}"></path>
            <text x="1020" y="82" fill="#9cd8ff" font-size="8">${facilityState.fiber.accessType === "dark" ? "DARK FIBER — PRIVATE" : "LIT FIBER"}</text>
            <text x="1018" y="96" fill="#7f98b2" font-size="7">${facilityState.fiber.carriers.map((k) => CARRIER[k]?.label || "").filter(Boolean).join(" / ")}</text>
            <rect class="pop-box" x="${g.x + g.w + 8}" y="${g.y + g.h * 0.5 - 8}" width="12" height="12" data-inspect-kind="pop" data-inspect-key="boundary"></rect>
          </g>` : ""}

          ${showFacility ? `<g>
            <rect class="facility-shell" x="${g.bx}" y="${g.by}" width="${g.bw}" height="${g.bh}" data-inspect-kind="facility" data-inspect-key="shell"></rect>
            ${Array.from({ length: 10 }, (_, i) => `<rect class="${i % 2 === 0 ? "aisle-cold" : "aisle-hot"}" x="${g.bx + 8}" y="${g.by + 8 + i * ((g.bh - 16) / 10)}" width="${g.bw - 16}" height="${(g.bh - 16) / 10 - 1}"></rect>`).join("")}
            <rect class="cdu-box" x="${g.bx - 22}" y="${g.by + 20}" width="16" height="28" data-inspect-kind="cooling" data-inspect-key="cdu"></rect>
            <rect class="cdu-box" x="${g.bx + g.bw + 6}" y="${g.by + g.bh - 48}" width="16" height="28" data-inspect-kind="cooling" data-inspect-key="cdu"></rect>
            <path class="pipe ${showDcim && facilityState.dcim.coolingTelemetry ? "flow" : ""}" d="M${g.bx - 6} ${g.by + 34}H${g.bx + g.bw + 6}"></path>
            <path class="pipe ${showDcim && facilityState.dcim.coolingTelemetry ? "flow" : ""}" d="M${g.bx - 6} ${g.by + g.bh - 34}H${g.bx + g.bw + 6}"></path>
            <path class="${facilityState.facility.powerArchitecture === "hvdc" ? "busbar-dc" : "busbar-ac"}" d="M${g.bx + 8} ${g.by + 6}H${g.bx + g.bw - 8}"></path>
            <text x="${g.bx + 8}" y="${g.by - 10}" fill="#8cb7d8" font-size="8">${(facilityState.site.locationType ? LOCATION[facilityState.site.locationType].label : "SITE")} — PHASE 4 COMPLETE</text>
          </g>` : ""}

          ${showCompute ? `<g>${rackNodes}</g>` : ""}
          ${showNetwork ? `<g>${networkRows.spine}${networkRows.leafs}${networkRows.paths}</g>` : ""}
          ${showDcim ? `<g>
            <rect class="monitor-box" x="${g.x + 18}" y="${g.y + 22}" width="20" height="14" data-inspect-kind="monitoring" data-inspect-key="station"></rect>
            <text x="${g.x + 44}" y="${g.y + 32}" fill="#7fd0ff" font-size="7">MONITOR STATION</text>
          </g>` : ""}

          <g id="travelDots"></g>
        </svg>

        <div class="canvas-overlay">
          <span class="overlay-pill">SITE ACQUIRED</span>
          <span class="overlay-pill">${facilityState.compute.rackCount ? `${INTEGER.format(facilityState.compute.rackCount)} RACKS` : "RACKS PENDING"}</span>
        </div>
      </div>
    `;
  }

  function renderMapView(withTransition) {
    const stageClass = withTransition ? "map-stage" : "";
    const loc = LOCATION[facilityState.site.locationType] || LOCATION.rural;
    const dcx = loc.map[0];
    const dcy = loc.map[1];
    const facilityLabel = `${INTEGER.format(ui.derived.totalGpus || 0)} GPUS | ${(ui.derived.targetMw || 0)} MW | ${(facilityState.compute.totalTFLOPS / 1000 || 0).toFixed(1)} PFLOPS`;

    const reqPaths = CITIES.map((city, idx) => {
      const ctrl = arcControl(city.x, city.y, dcx, dcy);
      return `<path id="req-${idx}" class="req-arc" d="M${city.x} ${city.y} Q${ctrl.cx} ${ctrl.cy} ${dcx} ${dcy}" data-speed="${0.04 + ctrl.dist * 0.000015}" data-city="${idx}"></path>`;
    }).join("");

    const resPaths = CITIES.map((city, idx) => {
      const ctrl = arcControl(dcx, dcy, city.x, city.y);
      return `<path id="res-${idx}" class="res-arc" d="M${dcx} ${dcy} Q${ctrl.cx} ${ctrl.cy} ${city.x} ${city.y}" data-speed="${0.035 + ctrl.dist * 0.000012}" data-city="${idx}"></path>`;
    }).join("");

    const cityNodes = CITIES.map((city, idx) => `
      <g data-inspect-kind="city" data-inspect-key="${idx}">
        <circle id="city-dot-${idx}" class="city-dot" cx="${city.x}" cy="${city.y}" r="3"></circle>
        <text x="${city.x + 5}" y="${city.y - 6}" fill="#7fa6c4" font-size="7">${city.label}</text>
      </g>
    `).join("");

    return `
      <div class="canvas-shell ${stageClass}">
        <svg viewBox="0 0 1200 700" role="img" aria-label="Global map routing view">
          <defs>
            <linearGradient id="reqGrad" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#00e5ff"/><stop offset="100%" stop-color="#7c3aed"/></linearGradient>
            <linearGradient id="resGrad" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#7c3aed"/><stop offset="100%" stop-color="#10b981"/></linearGradient>
          </defs>

          <rect x="0" y="0" width="1200" height="700" fill="#090e16"></rect>
          <path class="world-outline" d="M110 220L220 190L350 200L410 230L500 218L610 230L690 205L780 228L840 260L960 252L1050 300L1040 352L920 360L850 402L730 390L620 418L510 398L430 420L330 392L230 398L160 352L110 300Z"></path>
          <path class="world-outline" d="M355 468L420 450L470 470L450 520L390 542L340 520Z"></path>

          ${reqPaths}
          ${resPaths}
          ${cityNodes}

          <g data-action="jump-floor" data-inspect-kind="dc" data-inspect-key="core">
            <circle class="dc-dot" cx="${dcx}" cy="${dcy}" r="7"></circle>
            <circle cx="${dcx}" cy="${dcy}" r="16" fill="none" stroke="#00e5ff" stroke-width="1.5" opacity="0.6"></circle>
          </g>
          <text x="${dcx + 14}" y="${dcy - 8}" fill="#bfeaff" font-size="8">${facilityLabel}</text>

          <g id="travelDots"></g>
        </svg>

        <div class="map-overlay" id="mapOverlay">
          <div class="map-row"><span>REQUESTS/SEC</span><strong id="mapReq">${INTEGER.format(ui.mapStats.req)}</strong><div class="map-bar"><span id="mapReqBar" style="width:${clamp(ui.mapStats.req / 1200 * 100, 4, 100)}%"></span></div></div>
          <div class="map-row"><span>TOKENS/SEC</span><strong id="mapTps">${INTEGER.format(ui.mapStats.tps)}</strong><div class="map-bar"><span id="mapTpsBar" style="width:${clamp(ui.mapStats.tps / Math.max(1, (ui.derived.bench?.peak || 1)) * 100, 4, 100)}%"></span></div></div>
          <div class="map-row"><span>ACTIVE USERS</span><strong id="mapUsers">${INTEGER.format(ui.mapStats.users)}</strong></div>
          <div class="map-row"><span>AVG TTFT</span><strong id="mapTtft">${ui.mapStats.ttft}MS</strong></div>
          <div class="map-row"><span>CLUSTER UTIL</span><strong id="mapUtil">${ui.mapStats.util}%</strong></div>
        </div>
      </div>
    `;
  }

  function geometryFromAcreage(acreage) {
    const scale = clamp((acreage - 5) / 495, 0, 1);
    const w = 340 + scale * 460;
    const h = 220 + scale * 180;
    const x = 600 - w / 2;
    const y = 190;

    const bw = w * 0.62;
    const bh = h * 0.62;
    const bx = x + (w - bw) / 2;
    const by = y + (h - bh) / 2;

    return { x, y, w, h, bx, by, bw, bh };
  }

  function buildRackRects(geo, count) {
    if (!count || count <= 0) return [];

    const usableW = geo.bw - 24;
    const usableH = geo.bh - 24;
    const cols = Math.max(4, Math.ceil(Math.sqrt(count * 1.6)));
    const rows = Math.max(1, Math.ceil(count / cols));

    const rackW = Math.max(1.8, (usableW / cols) - 0.8);
    const rackH = Math.max(1.8, (usableH / rows) - 0.8);

    const list = [];
    for (let i = 0; i < count; i += 1) {
      const row = Math.floor(i / cols);
      const col = i % cols;
      list.push({
        x: geo.bx + 12 + col * (rackW + 0.8),
        y: geo.by + 12 + row * (rackH + 0.8),
        w: rackW,
        h: rackH,
        row,
      });
    }
    return list;
  }

  function rackRowPaths(geo, racks) {
    if (!racks.length) return { paths: "", leafs: "", spine: "", markers: "" };

    const rows = [...new Set(racks.map((r) => r.row))];
    const spineY = geo.by - 10;
    const spine = `<rect class="net-spine" x="${geo.bx + geo.bw * 0.35}" y="${spineY - 8}" width="${geo.bw * 0.3}" height="8" data-inspect-kind="fabric" data-inspect-key="spine"></rect>`;

    const leafs = rows.map((row) => {
      const rowRacks = racks.filter((r) => r.row === row);
      const y = rowRacks[0].y + rowRacks[0].h / 2 - 2;
      return `<rect class="net-leaf" x="${geo.bx - 8}" y="${y}" width="6" height="4"></rect><rect class="net-leaf" x="${geo.bx + geo.bw + 2}" y="${y}" width="6" height="4"></rect>`;
    }).join("");

    const paths = rows.map((row, idx) => {
      const rowRacks = racks.filter((r) => r.row === row);
      const y = rowRacks[0].y + rowRacks[0].h / 2;
      const x0 = geo.bx + geo.bw * 0.5;
      const left = geo.bx - 2;
      const right = geo.bx + geo.bw + 2;
      return `<path id="net-${idx}" class="net-line net-path" d="M${x0} ${spineY}V${y}H${left}M${x0} ${spineY}V${y}H${right}" data-speed="${0.06 + idx * 0.002}" data-inspect-kind="fabric" data-inspect-key="cabling"></path>`;
    }).join("");

    return { paths, leafs, spine, markers: "" };
  }

  function arcControl(x1, y1, x2, y2) {
    const dist = Math.hypot(x2 - x1, y2 - y1);
    return {
      cx: (x1 + x2) / 2,
      cy: Math.min(y1, y2) - dist * 0.22,
      dist,
    };
  }

  function setupTravelAnimations(mode) {
    if (ui.animFrame) cancelAnimationFrame(ui.animFrame);
    ui.animItems = [];

    const svg = el.constructionCanvas.querySelector("svg");
    const layer = el.constructionCanvas.querySelector("#travelDots");
    if (!svg || !layer) return;

    if (mode === "floor") {
      const paths = [...svg.querySelectorAll(".net-path")];
      paths.forEach((path, idx) => {
        const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        dot.setAttribute("r", "2.1");
        dot.setAttribute("class", "travel-dot");
        layer.appendChild(dot);
        ui.animItems.push({ type: "network", path, dot, speed: Number(path.dataset.speed || 0.06), offset: idx * 0.15, cityId: null, prev: 0 });
      });
    }

    if (mode === "map") {
      const ttftDelay = Math.max(60, Math.round(facilityState.benchmarks.ttft || 120));
      [...svg.querySelectorAll(".req-arc")].forEach((path, idx) => {
        const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        dot.setAttribute("r", "2.4");
        dot.setAttribute("class", "travel-dot");
        layer.appendChild(dot);
        ui.animItems.push({ type: "request", path, dot, speed: Number(path.dataset.speed || 0.05), offset: idx * 0.21, cityId: Number(path.dataset.city), prev: 0, delay: 0 });
      });

      [...svg.querySelectorAll(".res-arc")].forEach((path, idx) => {
        const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        dot.setAttribute("r", "2.4");
        dot.setAttribute("class", "travel-dot response");
        layer.appendChild(dot);
        ui.animItems.push({ type: "response", path, dot, speed: Number(path.dataset.speed || 0.045), offset: idx * 0.17, cityId: Number(path.dataset.city), prev: 0, delay: ttftDelay });
      });
    }

    const start = performance.now();
    const animate = (time) => {
      const elapsed = time - start;
      ui.animItems.forEach((item) => {
        const len = item.path.getTotalLength();
        if (!len) return;

        let progress = (elapsed * item.speed / 1000 + item.offset) % 1;
        if (item.type === "response") {
          if (elapsed < item.delay) {
            item.dot.setAttribute("opacity", "0");
            return;
          }
          progress = ((elapsed - item.delay) * item.speed / 1000 + item.offset) % 1;
          item.dot.setAttribute("opacity", "1");
        }

        const p = item.path.getPointAtLength(progress * len);
        item.dot.setAttribute("cx", String(p.x));
        item.dot.setAttribute("cy", String(p.y));

        if (item.type === "response" && progress < item.prev) {
          pulseCity(item.cityId);
        }

        item.prev = progress;
      });

      ui.animFrame = requestAnimationFrame(animate);
    };

    ui.animFrame = requestAnimationFrame(animate);
  }

  function pulseCity(cityId) {
    const node = el.constructionCanvas.querySelector(`#city-dot-${cityId}`);
    if (!node) return;
    node.classList.remove("pulse");
    void node.getBoundingClientRect();
    node.classList.add("pulse");
  }

  function updateMapOverlayValues() {
    const req = $("mapReq");
    if (!req) return;

    req.textContent = INTEGER.format(ui.mapStats.req);
    $("mapTps").textContent = INTEGER.format(ui.mapStats.tps);
    $("mapUsers").textContent = INTEGER.format(ui.mapStats.users);
    $("mapTtft").textContent = `${ui.mapStats.ttft}MS`;
    $("mapUtil").textContent = `${ui.mapStats.util}%`;

    $("mapReqBar").style.width = `${clamp((ui.mapStats.req / 1200) * 100, 4, 100)}%`;
    const peak = Math.max(1, ui.derived.bench?.peak || 1);
    $("mapTpsBar").style.width = `${clamp((ui.mapStats.tps / peak) * 100, 4, 100)}%`;
  }

  function renderBenchmarks() {
    if (ui.benchmarkCollapsed) {
      el.benchmarkToggle.textContent = "EXPAND";
      el.benchmarkToggle.setAttribute("aria-expanded", "false");
      el.benchmarkBody.hidden = true;
      return;
    }

    el.benchmarkToggle.textContent = "COLLAPSE";
    el.benchmarkToggle.setAttribute("aria-expanded", "true");
    el.benchmarkBody.hidden = false;

    if (facilityState.phase < 8) {
      el.benchmarkBody.innerHTML = `<div class="info-callout">COMPLETE PHASES 1-7 TO UNLOCK LIVE BENCHMARKS (TTFT, TPS, CONCURRENCY, MFU).</div>`;
      return;
    }

    const b = ui.derived.bench || { ttft: 0, peak: 0, tps: 0, max: 0, mfu: 0, range: "N/A" };
    const ttftClass = b.ttft > 500 ? "red" : b.ttft >= 100 ? "amber" : "green";
    const ratio = b.peak > 0 ? clamp((b.tps / b.peak) * 100, 0, 100) : 0;
    const pressure = b.max > 0 ? clamp((ui.bench.conc / b.max) * 100, 0, 100) : 0;

    const mfuColor = b.mfu >= 70 ? "#00e5ff" : b.mfu >= 50 ? "#10b981" : b.mfu >= 30 ? "#f59e0b" : "#ef4444";
    const ring = 2 * Math.PI * 52;
    const ringOffset = ring * (1 - clamp(b.mfu / 100, 0, 1));

    const slots = Math.min(Math.max(b.max, 1), 72);
    const activeSlots = Math.min(slots, ui.bench.conc);
    const slotHtml = Array.from({ length: slots }, (_, i) => `<span class="slot ${i < activeSlots ? "active" : ""} ${pressure >= 80 && i < activeSlots ? "warn" : ""}"></span>`).join("");

    const maxObserved = Math.max(Math.ceil((b.peak || 10) * 1.2), 10);

    el.benchmarkBody.innerHTML = `
      <div class="benchmark-grid">
        <article class="bench-card">
          <h4>TTFT (TIME TO FIRST TOKEN)</h4>
          <div class="inline-controls">
            <label>MODEL SIZE<select data-action="bench-model">${Object.keys(MODEL).map((m) => `<option value="${m}" ${ui.bench.model === m ? "selected" : ""}>${m}</option>`).join("")}</select></label>
            <label>PROMPT TOKENS<select data-action="bench-prompt">${[128, 512, 2048].map((n) => `<option value="${n}" ${ui.bench.prompt === n ? "selected" : ""}>${n}</option>`).join("")}</select></label>
            <label>BATCH SIZE<input type="number" min="1" max="256" value="${ui.bench.batch}" data-action="bench-batch" /></label>
          </div>
          <div class="value-line"><span>SIMULATED TTFT</span><strong>${b.ttft.toFixed(1)} MS</strong></div>
          <div class="gauge-bar"><span class="gauge-fill ${ttftClass}" style="width:${clamp((b.ttft / 1000) * 100, 2, 100)}%"></span></div>
          <div class="muted">GREEN <100MS | AMBER 100-500MS | RED >500MS</div>
        </article>

        <article class="bench-card">
          <h4>TPS (TOKENS PER SECOND)</h4>
          <div class="inline-controls two">
            <label>OUTPUT LENGTH<input type="number" min="16" max="8192" value="${ui.bench.output}" data-action="bench-output" /></label>
            <label>CONCURRENCY<input type="number" min="1" max="4096" value="${ui.bench.conc}" data-action="bench-conc" /></label>
          </div>
          <div class="value-line"><span>THEORETICAL PEAK</span><strong>${b.peak.toFixed(1)}</strong></div>
          <div class="value-line"><span>ACHIEVED TPS</span><strong>${b.tps.toFixed(1)}</strong></div>
          <div class="value-line"><span>EFFICIENCY</span><strong>${ratio.toFixed(1)}%</strong></div>
          <div class="gauge-bar"><span class="gauge-fill" style="width:${ratio}%"></span></div>
        </article>

        <article class="bench-card ${pressure >= 80 ? "warning-callout" : ""}">
          <h4>CONCURRENCY</h4>
          <div class="inline-controls two">
            <label>PRECISION<select data-action="bench-precision">${Object.keys(PRECISION_BYTES).map((p) => `<option value="${p}" ${ui.bench.precision === p ? "selected" : ""}>${p}</option>`).join("")}</select></label>
            <label>MODEL SIZE<select data-action="bench-model">${Object.keys(MODEL).map((m) => `<option value="${m}" ${ui.bench.model === m ? "selected" : ""}>${m}</option>`).join("")}</select></label>
          </div>
          <div class="value-line"><span>MAX CONCURRENT REQUESTS</span><strong>${INTEGER.format(b.max)}</strong></div>
          <div class="value-line"><span>KV CACHE PRESSURE</span><strong>${pressure.toFixed(1)}%</strong></div>
          <div class="slot-grid">${slotHtml}</div>
          <div class="muted">${pressure >= 80 ? "WARNING: KV CACHE EXCEEDS 80% VRAM" : "KV CACHE PRESSURE WITHIN SAFE RANGE"}</div>
        </article>

        <article class="bench-card">
          <h4>MFU (MODEL FLOP UTILIZATION)</h4>
          <label class="inline-controls one"><span class="muted">OBSERVED TPS</span>
            <div class="range-control">
              <input type="range" min="1" max="${maxObserved}" step="1" value="${Math.max(1, Math.round(ui.bench.observedTps || 1))}" data-action="bench-observed" />
              <input class="range-number" type="number" min="1" max="${maxObserved}" step="1" value="${Math.max(1, Math.round(ui.bench.observedTps || 1))}" data-action="bench-observed" inputmode="numeric" />
            </div>
          </label>
          <svg class="mfu-ring" viewBox="0 0 124 124">
            <circle class="base" cx="62" cy="62" r="52"></circle>
            <circle class="val" cx="62" cy="62" r="52" stroke="${mfuColor}" style="stroke-dasharray:${ring};stroke-dashoffset:${ringOffset};"></circle>
            <text x="62" y="67" text-anchor="middle" fill="#d9ecff" font-size="14">${b.mfu.toFixed(1)}%</text>
          </svg>
          <div class="value-line"><span>INFERENCE STACK</span><strong>${esc(STACK[facilityState.compute.inferenceStack]?.label || "N/A")}</strong></div>
          <div class="value-line"><span>TYPICAL RANGE</span><strong>${b.range}</strong></div>
        </article>
      </div>
    `;
  }

  function renderBuildLog() {
    if (!ui.logs.length) {
      el.buildLog.innerHTML = `<p class="log-line muted">[${clock()}] WAITING FOR FIRST PHASE CONFIRM...</p>`;
      return;
    }
    el.buildLog.innerHTML = ui.logs.map((entry) => `<p class="log-line ${entry.kind}">[${entry.time}] ${esc(entry.text)}</p>`).join("");
    el.buildLog.scrollTop = el.buildLog.scrollHeight;
  }

  function pushLog(text, kind = "muted") {
    ui.logs.push({ time: clock(), text, kind });
    if (ui.logs.length > 240) ui.logs.shift();
    renderBuildLog();
  }

  function phaseSummaryLine(phase) {
    if (phase === 1) return `${LOCATION[facilityState.site.locationType]?.label || "SITE"} / ${facilityState.site.acreage} ACRES / ${PERMIT[facilityState.site.permittingTrack]?.label || "PERMIT TRACK"}`;
    if (phase === 2) {
      const top = Object.entries(facilityState.power.sources)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .filter(([, pct]) => pct > 0)
        .map(([k]) => POWER_SRC[k].label.replace("FRONT-OF-METER ", "").replace("SMALL MODULAR ", ""));
      return `${facilityState.power.targetMW || 0}MW ${top.join(" + ") || "POWER MIX"}`;
    }
    if (phase === 3) return `${FIBER_ACCESS[facilityState.fiber.accessType]?.label || "FIBER"} / ${facilityState.fiber.carriers.length} CARRIERS / ${IXP[facilityState.fiber.ixpRegion]?.label || "IXP"}`;
    if (phase === 4) return `${DEVELOPER[facilityState.facility.developerType]?.label || "DEVELOPER"} / ${COOLING[facilityState.facility.coolingType]?.label || "COOLING"}`;
    if (phase === 5) return `${GPU[facilityState.compute.gpuModel]?.label || "GPU"} / ${facilityState.compute.gpusPerRack} GPUS PER RACK / ${STACK[facilityState.compute.inferenceStack]?.label || "STACK"}`;
    if (phase === 6) return `${FABRIC[facilityState.networking.fabric]?.label || "FABRIC"} / ${facilityState.networking.nodeCount} NODES / ${EXTERNAL[facilityState.networking.externalBandwidth]?.label || "EXTERNAL"}`;
    if (phase === 7) return `${MONITORING[facilityState.dcim.monitoringApproach]?.label || "MONITORING"} / ${MAINT[facilityState.dcim.maintenanceModel]?.label || "MAINTENANCE"}`;
    return "FACILITY COMPLETE";
  }

  function renderInspector() {
    const source = ui.hoverInspect || ui.selectedInspect;
    const details = source ? inspectFor(source.kind, source.key) : phaseSummaryInspect();

    el.inspectorTitle.textContent = details.title;
    el.inspectorSubtitle.textContent = details.subtitle;

    el.inspectorDetails.innerHTML = details.rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("");
    el.inspectorMetrics.innerHTML = details.metrics.map(([k, v]) => `<div class="metric-chip"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join("");
    el.inspectorViz.innerHTML = details.viz;
  }

  function phaseSummaryInspect() {
    return {
      title: `PHASE ${facilityState.phase} OVERVIEW`,
      subtitle: "LIVE COST / TIMELINE INSPECTOR",
      rows: [
        ["TOTAL CAPEX", compactMoney(facilityState.economics.totalCapex)],
        ["ANNUAL OPEX", compactMoney(facilityState.economics.annualOpex)],
        ["TARGET PUE", (facilityState.facility.pue || 2).toFixed(2)],
        ["UPTIME PROJECTION", `${(ui.derived.uptime || 0).toFixed(3)}%`],
        ["LATENCY", `${(facilityState.fiber.latencyMs || 0).toFixed(1)} MS`],
      ],
      metrics: [
        ["POWER CAPEX", compactMoney(ui.derived.powerCapex || 0)],
        ["FIBER CAPEX", compactMoney(ui.derived.fiberCapex || 0)],
        ["FACILITY CAPEX", compactMoney(ui.derived.facilityCapex || 0)],
        ["COMPUTE CAPEX", compactMoney(ui.derived.computeCapex || 0)],
      ],
      viz: `<div class="viz-card">${facilityState.phase < 8 ? "UNDER CONSTRUCTION MODE ACTIVE" : ui.mode === "map" ? "GLOBAL TOKEN ROUTING MAP ACTIVE" : "FLOOR VIEW ACTIVE"}</div>`,
    };
  }

  function inspectFor(kind, key) {
    if (kind === "rack") {
      const idx = Math.max(0, Number(key) - 1);
      const rack = ui.rackCache[idx];
      if (rack) {
        return {
          title: `RACK ${String(rack.id).padStart(3, "0")}`,
          subtitle: "LIVE RACK TELEMETRY",
          rows: [
            ["GPU MODEL", GPU[facilityState.compute.gpuModel]?.label || "N/A"],
            ["TEMP", `${rack.temp.toFixed(1)} C`],
            ["POWER", `${rack.powerKw.toFixed(1)} KW`],
            ["UTIL", `${rack.util.toFixed(1)}%`],
            ["UPTIME", `${rack.uptime.toFixed(4)}%`],
            ["ENGINE", STACK[facilityState.compute.inferenceStack]?.label || "N/A"],
          ],
          metrics: [["STATUS", rack.status.toUpperCase()], ["RACK ID", String(rack.id)]],
          viz: `<div class="viz-card">RACK LED + SENSOR STREAM IS LIVE.</div>`,
        };
      }
    }

    if (kind === "city") {
      const city = CITIES[Number(key)];
      return {
        title: city ? city.label : "USER NODE",
        subtitle: "TOKEN ROUTING NODE",
        rows: [["REQUEST FLOW", "CYAN -> VIOLET ARC"], ["RESPONSE FLOW", "VIOLET -> GREEN ARC"], ["LATENCY CLASS", latencyClass(facilityState.fiber.latencyMs || 0)]],
        metrics: [["AVG TTFT", `${Math.round(facilityState.benchmarks.ttft || 0)}MS`], ["ACTIVE USERS", INTEGER.format(ui.mapStats.users)]],
        viz: `<div class="viz-card">RESPONSE DOT PULSE TRIGGERS WHEN TOKENS ARRIVE.</div>`,
      };
    }

    if (kind === "dc") {
      return {
        title: "PRIMARY DATA CENTER",
        subtitle: "GLOBAL ENTRY POINT",
        rows: [["GPU COUNT", INTEGER.format(ui.derived.totalGpus || 0)], ["FACILITY LOAD", `${(ui.derived.targetMw || 0).toFixed(1)} MW`], ["COMPUTE", `${(facilityState.compute.totalTFLOPS / 1000 || 0).toFixed(1)} PFLOPS`]],
        metrics: [["TOKENS/SEC", INTEGER.format(ui.mapStats.tps)], ["REQUESTS/SEC", INTEGER.format(ui.mapStats.req)]],
        viz: `<div class="viz-card">CLICK THE DC DOT TO FLY BACK TO FLOOR VIEW.</div>`,
      };
    }

    return phaseSummaryInspect();
  }

  function latencyClass(latency) {
    if (latency < 5) return "GREEN";
    if (latency <= 20) return "AMBER";
    return "RED";
  }

  function compactMoney(value) {
    const abs = Math.abs(value);
    if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
    if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
    if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
    return CURRENCY0.format(value);
  }

  function esc(v) {
    return String(v)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function clock() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
  }
})();
