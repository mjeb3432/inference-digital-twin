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
    rural: { label: "GREENFIELD RURAL", landPerAcre: 95000, permitMonths: [4, 10], nimby: "LOW", nimbyScore: 22, fiberMiles: 8, gridMiles: 5, geo: { lon: -93.62, lat: 42.03 } },
    urban: { label: "URBAN EDGE", landPerAcre: 420000, permitMonths: [6, 14], nimby: "HIGH", nimbyScore: 74, fiberMiles: 2, gridMiles: 3, geo: { lon: -77.47, lat: 39.04 } },
    repurpose: { label: "REPURPOSED INDUSTRIAL", landPerAcre: 210000, permitMonths: [4, 9], nimby: "MED", nimbyScore: 48, fiberMiles: 4, gridMiles: 6, geo: { lon: -95.36, lat: 29.76 } },
    campus: { label: "CAMPUS ADJACENT", landPerAcre: 260000, permitMonths: [5, 11], nimby: "MED", nimbyScore: 40, fiberMiles: 1, gridMiles: 2, geo: { lon: -111.89, lat: 40.76 } },
  };

  const PERMIT = {
    standard: { label: "STANDARD MUNICIPAL", months: [3, 12], landMult: 1, costAdd: 0 },
    epc: { label: "EXPEDITED WITH EPC PARTNER", months: [6, 9], landMult: 1.08, costAdd: 350000 },
    pre: { label: "PRE-PERMITTED SITE", months: [1, 3], landMult: 1.3, costAdd: 750000 },
  };

  const POWER_SRC = {
    fom: { label: "FRONT-OF-METER GRID", lead: "6-24 MO / 2-5 YR", capexKw: 250, rateMwh: 127.5 },
    gas: { label: "NATURAL GAS GENSETS", lead: "2-5 YEARS", capexKw: 900, rateMwh: 98 },
    solar: { label: "SOLAR + BESS", lead: "1-3 YEARS", capexKw: 1617, rateMwh: 61 },
    wind: { label: "WIND", lead: "3-5 YEARS", capexKw: 1738, rateMwh: 66 },
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
    t3: { label: "LARGE-SCALE DEVELOPER (TIER 3)", cost: [10_800_000, 12_600_000], perMw: 11_700_000, months: [14, 22], factor: 1 },
    t4: { label: "LARGE-SCALE DEVELOPER (TIER 4)", cost: [12_400_000, 15_000_000], perMw: 13_600_000, months: [16, 24], factor: 1.08 },
    modular: { label: "MODULAR / PREFAB", cost: [9_900_000, 11_800_000], perMw: 10_900_000, months: [6, 12], factor: 0.62 },
    self: { label: "SELF-BUILD WITH EPC", cost: [9_300_000, 10_800_000], perMw: 9_900_000, months: [12, 22], factor: 1.15 },
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

  const INTRA_NODE = {
    nv: { label: "NVLINK", bwGbps: 900, us: 0.6, mfuAdj: 0.09 },
    pcie: { label: "PCIE GEN5", bwGbps: 256, us: 1.8, mfuAdj: 0.01 },
  };

  const FABRIC = {
    ib: { label: "INFINIBAND (NDR 400Gbps)", perLinkGbps: 400, us: 1.5, premium: 1.35, mfuAdj: 0.07, swCost: 37000, encodingEfficiency: 0.96 },
    eth: { label: "ETHERNET (ROCE 400Gbps)", perLinkGbps: 400, us: 3.8, premium: 1, mfuAdj: 0, swCost: 26000, encodingEfficiency: 0.94 },
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
    { label: "NYC", lon: -74.01, lat: 40.71 },
    { label: "LONDON", lon: -0.13, lat: 51.51 },
    { label: "TOKYO", lon: 139.69, lat: 35.68 },
    { label: "SAO PAULO", lon: -46.63, lat: -23.55 },
    { label: "SINGAPORE", lon: 103.82, lat: 1.35 },
    { label: "SYDNEY", lon: 151.21, lat: -33.87 },
    { label: "MUMBAI", lon: 72.88, lat: 19.08 },
    { label: "TORONTO", lon: -79.38, lat: 43.65 },
    { label: "PARIS", lon: 2.35, lat: 48.86 },
    { label: "MEXICO CITY", lon: -99.13, lat: 19.43 },
  ];

  const MAP_VIEWBOX = Object.freeze({
    w: 1200,
    h: 700,
    padX: 34,
    padY: 40,
  });
  const LEFT_RAIL_WIDTH = Object.freeze({
    min: 280,
    max: 520,
    step: 24,
    default: 320,
    storageKey: "forge:leftRailWidth",
  });
  const WORLD_PATHS_ASSET = "/static/world_paths.json?v=20260328l";

  const WORLD_LANDMASSES = Object.freeze([
    {
      key: "north-america",
      points: [
        [-168, 72], [-154, 70], [-145, 64], [-136, 58], [-128, 53], [-123, 48], [-123, 42], [-118, 34], [-110, 30],
        [-102, 24], [-95, 19], [-88, 19], [-82, 23], [-79, 26], [-75, 34], [-67, 43], [-60, 47], [-56, 54], [-63, 61],
        [-74, 66], [-91, 71], [-116, 73], [-142, 74], [-160, 73], [-168, 72],
      ],
    },
    {
      key: "greenland",
      points: [
        [-73, 59], [-63, 61], [-51, 66], [-43, 74], [-48, 81], [-59, 82], [-69, 78], [-73, 69], [-73, 59],
      ],
    },
    {
      key: "south-america",
      points: [
        [-81, 12], [-74, 8], [-67, 7], [-60, 5], [-52, -1], [-47, -11], [-44, -22], [-49, -33], [-55, -43],
        [-62, -54], [-71, -53], [-78, -39], [-81, -24], [-81, 12],
      ],
    },
    {
      key: "eurasia",
      points: [
        [-11, 36], [-5, 43], [3, 49], [15, 55], [28, 58], [43, 58], [59, 54], [76, 56], [92, 59], [108, 56], [121, 51],
        [133, 45], [145, 47], [157, 58], [170, 62], [178, 56], [173, 48], [159, 43], [145, 38], [132, 35], [120, 31],
        [110, 24], [98, 18], [88, 21], [78, 25], [70, 22], [60, 23], [50, 28], [40, 30], [30, 35], [20, 40], [11, 45],
        [2, 45], [-5, 41], [-11, 36],
      ],
    },
    {
      key: "africa",
      points: [
        [-18, 37], [-8, 36], [2, 35], [12, 32], [24, 30], [34, 27], [41, 17], [47, 6], [48, -8], [43, -19], [35, -29],
        [24, -34], [13, -35], [3, -31], [-6, -21], [-11, -9], [-15, 7], [-18, 21], [-18, 37],
      ],
    },
    {
      key: "australia",
      points: [
        [112, -11], [125, -11], [137, -16], [147, -25], [152, -34], [148, -40], [137, -43], [124, -40], [114, -30], [112, -11],
      ],
    },
    {
      key: "madagascar",
      points: [
        [47, -13], [50, -17], [50, -24], [47, -26], [44, -20], [47, -13],
      ],
    },
    {
      key: "japan",
      points: [
        [130, 31], [136, 34], [141, 39], [145, 44], [142, 35], [137, 32], [130, 31],
      ],
    },
    {
      key: "new-zealand",
      points: [
        [166, -35], [174, -38], [177, -44], [170, -47], [166, -42], [166, -35],
      ],
    },
  ]);

  const SITE_CITIES = {
    ashburn: { label: "ASHBURN, VA", region: "US EAST", geo: { lon: -77.49, lat: 39.04 }, fiberMiles: 1, gridMiles: 2, permitDelta: 2, permitCostAdd: 220000, landMult: 1.22, maxMwPerAcre: 2.4 },
    dallas: { label: "DALLAS, TX", region: "US SOUTH", geo: { lon: -96.8, lat: 32.78 }, fiberMiles: 2, gridMiles: 3, permitDelta: 1, permitCostAdd: 160000, landMult: 1.06, maxMwPerAcre: 2.2 },
    phoenix: { label: "PHOENIX, AZ", region: "US WEST", geo: { lon: -112.07, lat: 33.45 }, fiberMiles: 3, gridMiles: 4, permitDelta: 1, permitCostAdd: 180000, landMult: 1.04, maxMwPerAcre: 2.1 },
    chicago: { label: "CHICAGO, IL", region: "US MIDWEST", geo: { lon: -87.62, lat: 41.88 }, fiberMiles: 2, gridMiles: 3, permitDelta: 2, permitCostAdd: 190000, landMult: 1.14, maxMwPerAcre: 2.3 },
    silicon: { label: "SILICON VALLEY, CA", region: "US WEST", geo: { lon: -121.89, lat: 37.33 }, fiberMiles: 1, gridMiles: 2, permitDelta: 3, permitCostAdd: 340000, landMult: 1.45, maxMwPerAcre: 2.0 },
    atlanta: { label: "ATLANTA, GA", region: "US EAST", geo: { lon: -84.39, lat: 33.75 }, fiberMiles: 3, gridMiles: 4, permitDelta: 1, permitCostAdd: 140000, landMult: 0.98, maxMwPerAcre: 2.0 },
    montreal: { label: "MONTREAL, QC", region: "CANADA EAST", geo: { lon: -73.57, lat: 45.5 }, fiberMiles: 4, gridMiles: 3, permitDelta: 2, permitCostAdd: 170000, landMult: 1.0, maxMwPerAcre: 1.9 },
    seattle: { label: "SEATTLE, WA", region: "US WEST", geo: { lon: -122.33, lat: 47.61 }, fiberMiles: 2, gridMiles: 4, permitDelta: 2, permitCostAdd: 210000, landMult: 1.18, maxMwPerAcre: 2.05 },
  };

  const WORKLOAD_PROFILES = {
    chat: { label: "REAL-TIME CHAT", objective: "LOW TTFT", notes: "LATENCY-FIRST USER FACING QUERIES", demandFactor: 1.18, queueMult: 1.12, decodeMult: 0.92, tpsMult: 0.95, mfuBias: -0.03 },
    copilot: { label: "CODE COPILOT", objective: "BALANCED TTFT/TPS", notes: "MID-LATENCY INTERACTIVE AUTOCOMPLETE", demandFactor: 1.08, queueMult: 1.0, decodeMult: 0.95, tpsMult: 1.0, mfuBias: 0.0 },
    batch: { label: "BATCH DOCUMENT INFERENCE", objective: "MAX TPS", notes: "THROUGHPUT-HEAVY, LATENCY TOLERANT", demandFactor: 0.86, queueMult: 0.78, decodeMult: 1.15, tpsMult: 1.18, mfuBias: 0.06 },
    multimodal: { label: "MULTIMODAL GEN", objective: "HIGH VRAM + STEADY TPS", notes: "IMAGE/VIDEO FLOWS WITH BURSTY LOAD", demandFactor: 1.02, queueMult: 1.08, decodeMult: 1.06, tpsMult: 0.9, mfuBias: -0.01 },
    agentic: { label: "AGENT ORCHESTRATION", objective: "HIGH CONCURRENCY", notes: "MANY SMALL REQUESTS, TOOL CALL OVERHEAD", demandFactor: 1.26, queueMult: 1.25, decodeMult: 0.88, tpsMult: 0.84, mfuBias: -0.05 },
  };
  const LEGACY_DEFAULT_SITE_CITY = Object.prototype.hasOwnProperty.call(SITE_CITIES, "ashburn")
    ? "ashburn"
    : (Object.keys(SITE_CITIES)[0] || null);
  const LEGACY_DEFAULT_WORKLOAD_PROFILE = Object.prototype.hasOwnProperty.call(WORKLOAD_PROFILES, "copilot")
    ? "copilot"
    : (Object.keys(WORKLOAD_PROFILES)[0] || null);

  const VIEW_MODE = Object.freeze({
    MAP: "map",
    FLOOR: "floor",
  });

  const FLOOR_VIEWBOX = Object.freeze({
    w: 1800,
    h: 1100,
  });

  const FLOOR_LAYERS = Object.freeze({
    site: "SITE",
    building: "BUILDING",
    rooms: "ROOMS",
    racks: "RACKS",
    power: "POWER",
    cooling: "COOLING",
    annotations: "ANNOTATIONS",
    overlay: "OVERLAY",
  });

  const SCALE_PRESETS = Object.freeze({
    fit: 1,
    "1:200": 0.85,
    "1:100": 1.15,
    "1:50": 1.8,
  });

  const SCHEMA_VERSION = "2.0.0";

  // Cost basis references (captured March 28, 2026):
  // - Flight Deck model formulas: Inputs! rows 240-330 in "Flight Deck Simply Silicon Foundation Model vComplete.xlsx"
  // - EIA utility-scale generator costs (2023): https://www.eia.gov/electricity/annual/table.php?t=epa_08_04
  // - EIA commercial electricity price (2024): https://www.eia.gov/electricity/sales_revenue_price/pdf/table_13.pdf
  // - JLL Data Center Outlook 2026 construction per MW: https://www.jll.com/en-us/insights/data-centers-and-ai-infrastructure-report
  // - Cushman & Wakefield Data Center Development Cost Guide 2025: https://cushwake.cld.bz/Data-Center-Development-Cost-Guide-2025
  const COST_BASIS = {
    schemaVersion: "2026-Q1",
    commercialGridUsdPerMWh: 127.5,
    avgConstructionUsdPerMw: 11_700_000,
    weightedLandUsdPerAcre: 244_000,
  };

  const FLIGHT_DECK_PROFILES = {
    pilot: {
      label: "SIMPLY PILOT",
      sitePrepCost: 150_000,
      gasUnitCapexPerMw: 500_000,
      gasOverbuildPct: 1.25,
      gasAncillary: 500_000,
      batteryUnitCapexPerMWh: 350_000,
      batteryOverbuildPct: 0,
      batteryAncillary: 0,
      dieselUnitCapex: 500_000,
      dieselOverbuildPct: 1.5,
      coolingPctOfItCapex: 0.075,
      internalPowerPctOfItCapex: 0.03,
      spareInventoryPct: 0.01,
      constructionContingencyPct: 0.02,
      mmraPct: 0.01,
      eicDesign: 50_000,
      eicShipping: 15_000,
      eicInstall: 50_000,
      serverCost: 100_000,
      baselineNetworkMonthly: 5_000,
      gasOpCostPerMWh: 3,
      osCostPerGpuYear: 25,
      opsMaintPerGpuHour: 0.02,
      miscOpexPct: 0.05,
    },
    foundation1: {
      label: "SIMPLY FOUNDATION PH 1",
      sitePrepCost: 1_500_000,
      gasUnitCapexPerMw: 1_000_000,
      gasOverbuildPct: 2,
      gasAncillary: 500_000,
      batteryUnitCapexPerMWh: 350_000,
      batteryOverbuildPct: 0,
      batteryAncillary: 0,
      dieselUnitCapex: 500_000,
      dieselOverbuildPct: 0,
      coolingPctOfItCapex: 0.1,
      internalPowerPctOfItCapex: 0.03,
      spareInventoryPct: 0.01,
      constructionContingencyPct: 0.02,
      mmraPct: 0.01,
      eicDesign: 333_333,
      eicShipping: 333_333,
      eicInstall: 333_334,
      serverCost: 75_000,
      baselineNetworkMonthly: 15_000,
      gasOpCostPerMWh: 2,
      osCostPerGpuYear: 25,
      opsMaintPerGpuHour: 0.02,
      miscOpexPct: 0.05,
    },
    foundation2: {
      label: "SIMPLY FOUNDATION PH 2",
      sitePrepCost: 5_000_000,
      gasUnitCapexPerMw: 1_000_000,
      gasOverbuildPct: 2,
      gasAncillary: 500_000,
      batteryUnitCapexPerMWh: 350_000,
      batteryOverbuildPct: 0.5,
      batteryAncillary: 0,
      dieselUnitCapex: 500_000,
      dieselOverbuildPct: 0,
      coolingPctOfItCapex: 0.08,
      internalPowerPctOfItCapex: 0.03,
      spareInventoryPct: 0.01,
      constructionContingencyPct: 0.01,
      mmraPct: 0.01,
      eicDesign: 666_667,
      eicShipping: 666_667,
      eicInstall: 666_666,
      serverCost: 75_000,
      baselineNetworkMonthly: 40_000,
      gasOpCostPerMWh: 3,
      osCostPerGpuYear: 10,
      opsMaintPerGpuHour: 0.02,
      miscOpexPct: 0.03,
    },
    growth: {
      label: "SIMPLY GROWTH",
      sitePrepCost: 15_000_000,
      gasUnitCapexPerMw: 1_000_000,
      gasOverbuildPct: 2,
      gasAncillary: 500_000,
      batteryUnitCapexPerMWh: 350_000,
      batteryOverbuildPct: 0.5,
      batteryAncillary: 0,
      dieselUnitCapex: 500_000,
      dieselOverbuildPct: 0.1,
      coolingPctOfItCapex: 0.175,
      internalPowerPctOfItCapex: 0.03,
      spareInventoryPct: 0.01,
      constructionContingencyPct: 0.01,
      mmraPct: 0.01,
      eicDesign: 1_000_000,
      eicShipping: 1_000_000,
      eicInstall: 1_000_000,
      serverCost: 75_000,
      baselineNetworkMonthly: 100_000,
      gasOpCostPerMWh: 3,
      osCostPerGpuYear: 10,
      opsMaintPerGpuHour: 0.02,
      miscOpexPct: 0.05,
    },
  };

  const facilityState = {
    scenario: { id: cryptoRandomId(), name: "FORGE SCENARIO", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), schemaVersion: SCHEMA_VERSION },
    runId: cryptoRandomId(),
    events: [],
    phase: 1,
    completed: [],
    site: { locationType: null, cityKey: null, workloadProfile: null, acreage: 25, permittingTrack: null, estimatedPermitCost: 0, permittingMonths: 0, utilityExpansionApproved: false },
    power: { sources: { fom: 100, gas: 0, solar: 0, wind: 0, smr: 0 }, targetMW: null, redundancyTier: null, upsType: null },
    fiber: { accessType: null, carriers: [], ixpRegion: null, latencyMs: 0, monthlyCost: 0 },
    facility: { developerType: null, buildMonths: 0, coolingType: null, powerArchitecture: null, pue: 2 },
    compute: { gpuModel: null, gpusPerRack: 8, rackCount: 0, totalTFLOPS: 0, inferenceStack: null, servingArch: null },
    networking: { intraNode: "nv", fabric: null, nodeCount: 1, externalBandwidth: null, networkingCapex: 0 },
    dcim: { monitoringApproach: null, maintenanceModel: null, coolingTelemetry: null },
    economics: { totalCapex: 0, annualOpex: 0, tco3yr: 0, tco5yr: 0, capexBreakdown: {}, opexBreakdown: {} },
    benchmarks: { ttft: null, tps: null, concurrency: null, mfu: null },
    validation: { errors: [], warnings: [] },
  };

  const ui = {
    derived: {},
    hoverInspect: null,
    selectedInspect: null,
    mode: VIEW_MODE.FLOOR,
    immersivePhase8: false,
    deploying: { active: false, progress: 0, message: "READY" },
    logs: [],
    tickerCapex: 0,
    benchmarkCollapsed: false,
    benchmarkUserOverride: false,
    bench: { model: "70B", prompt: 512, batch: 8, output: 256, conc: 16, precision: "FP8", assumedObservedTps: 0, calibrationMode: false },
    rackCache: [],
    mapStats: { req: 0, tps: 0, users: 0, ttft: 0, util: 0 },
    animFrame: null,
    animItems: [],
    mapTicker: null,
    lastValidationSig: "",
    pendingCanvasTransition: false,
    worldPaths: null,
    openHelpKey: null,
    openHelpAnchorEl: null,
    layoutCache: { signature: "", value: null },
    leftRailWidth: LEFT_RAIL_WIDTH.default,
    canvas: {
      zoom: SCALE_PRESETS.fit,
      panX: 0,
      panY: 0,
      panRaf: null,
      dragging: false,
      dragStartX: 0,
      dragStartY: 0,
      layerPanelOpen: false,
      scalePreset: "fit",
      layers: {
        site: true,
        building: true,
        rooms: true,
        racks: true,
        power: true,
        cooling: true,
        annotations: true,
        overlay: true,
      },
    },
  };

  const $ = (id) => document.getElementById(id);
  const el = {};
  const EMPTY_NETWORK_ROWS = Object.freeze({ paths: "", leafs: "", spine: "", mda: "", hdas: "", taps: "", zones: "" });

  const CURRENCY0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const INTEGER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

  window.addEventListener("DOMContentLoaded", init);

  function init() {
    cacheElements();
    bindEvents();
    hydrateLeftRailWidth();
    recalcAll();
    applyAutoBenchmarkCollapse();
    renderBootShell();
    scheduleInitialHydration();
    pushLog("SESSION STARTED — THE FORGE ONLINE", "muted");
    emitEvent("SESSION_STARTED", { phase: facilityState.phase, schemaVersion: facilityState.scenario.schemaVersion }, "INFO");
    startTickers();
  }

  function renderBootShell() {
    renderTimeline();
    renderLeftDecision();
    renderLeftMetrics();
    renderBuildLog();
    renderInspector();
    el.constructionCanvas.innerHTML = `
      <div class="canvas-shell canvas-boot-shell">
        <div class="canvas-boot-copy">
          <span class="led live"></span>
          <strong>INITIALIZING LIVE FACILITY VIEW...</strong>
        </div>
      </div>
    `;
    renderBenchmarks();
  }

  function scheduleInitialHydration() {
    const hydrate = () => {
      renderCenterCanvas();
      loadWorldPaths();
    };

    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(hydrate);
      return;
    }

    window.setTimeout(hydrate, 0);
  }

  async function loadWorldPaths() {
    try {
      const response = await fetch(WORLD_PATHS_ASSET, { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json();
      if (!Array.isArray(payload)) return;
      const safe = payload.filter((item) => typeof item === "string" && item.length > 10 && item.length < 4000 && item.startsWith("M") && /^[ML0-9 .\-Z]+$/.test(item));
      if (!safe.length) return;
      ui.worldPaths = safe;
      if (facilityState.phase === 8 && ui.mode === VIEW_MODE.MAP) {
        renderCenterCanvas();
      }
    } catch (_) {
      // Fall back to built-in coarse landmass geometry if asset is unavailable.
    }
  }

  function cacheElements() {
    [
      "forgeRoot",
      "forgeLeftRail",
      "phaseTimeline",
      "leftPhaseTitle",
      "leftDecisionBody",
      "confirmPhaseButton",
      "capexTicker",
      "annualOpex",
      "targetPue",
      "uptimeProjection",
      "leftRailNarrowButton",
      "leftRailWideButton",
      "buildLog",
      "exportScenarioButton",
      "importScenarioButton",
      "exportEventLogButton",
      "importScenarioInput",
      "helpPopoverLayer",
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
    el.leftRailNarrowButton.addEventListener("click", () => bumpLeftRailWidth(-LEFT_RAIL_WIDTH.step));
    el.leftRailWideButton.addEventListener("click", () => bumpLeftRailWidth(LEFT_RAIL_WIDTH.step));

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
    el.constructionCanvas.addEventListener("input", onCanvasControlInput);
    el.constructionCanvas.addEventListener("wheel", onCanvasWheel, { passive: false });
    el.constructionCanvas.addEventListener("pointerdown", onCanvasPointerDown);
    document.addEventListener("keydown", onGlobalKeydown);
    window.addEventListener("pointermove", onCanvasPointerMove);
    window.addEventListener("pointerup", onCanvasPointerUp);
    window.addEventListener("resize", onViewportResize);
    el.exportScenarioButton.addEventListener("click", onExportScenario);
    el.importScenarioButton.addEventListener("click", () => el.importScenarioInput.click());
    el.importScenarioInput.addEventListener("change", onImportScenarioFile);
    el.exportEventLogButton.addEventListener("click", onExportEventLog);
    el.helpPopoverLayer.addEventListener("click", onHelpLayerClick);

    document.addEventListener("click", onDocumentClick);
    document.body.addEventListener("mouseover", onInspectHover);
    document.body.addEventListener("mouseout", onInspectOut);
    document.body.addEventListener("click", onInspectSelect);
    el.forgeLeftRail.addEventListener("scroll", onHelpAnchorViewportChange, { passive: true });
  }

  function onViewportResize() {
    onHelpAnchorViewportChange();
    if (applyAutoBenchmarkCollapse()) {
      renderBenchmarks();
    }
  }

  function hydrateLeftRailWidth() {
    let stored = null;
    try {
      const raw = window.localStorage.getItem(LEFT_RAIL_WIDTH.storageKey);
      stored = raw === null ? null : Number(raw);
    } catch (_) {
      stored = null;
    }
    ui.leftRailWidth = clamp(
      Number.isFinite(stored) ? stored : LEFT_RAIL_WIDTH.default,
      LEFT_RAIL_WIDTH.min,
      LEFT_RAIL_WIDTH.max,
    );
    applyLeftRailWidth();
  }

  function applyLeftRailWidth() {
    if (!el.forgeRoot) return;
    el.forgeRoot.style.setProperty("--left-rail-width", `${Math.round(ui.leftRailWidth)}px`);
    if (el.leftRailNarrowButton) {
      el.leftRailNarrowButton.disabled = ui.leftRailWidth <= LEFT_RAIL_WIDTH.min;
    }
    if (el.leftRailWideButton) {
      el.leftRailWideButton.disabled = ui.leftRailWidth >= LEFT_RAIL_WIDTH.max;
    }
  }

  function bumpLeftRailWidth(delta) {
    ui.leftRailWidth = clamp(ui.leftRailWidth + delta, LEFT_RAIL_WIDTH.min, LEFT_RAIL_WIDTH.max);
    applyLeftRailWidth();
    try {
      window.localStorage.setItem(LEFT_RAIL_WIDTH.storageKey, String(Math.round(ui.leftRailWidth)));
    } catch (_) {
      // ignore local storage failures
    }
  }

  function withLeftRailScrollPreserved(work) {
    const node = el.forgeLeftRail;
    const prev = node ? node.scrollTop : 0;
    work();
    if (node) node.scrollTop = prev;
  }

  function setHelpButtonState(activeButton) {
    el.leftDecisionBody.querySelectorAll(".inline-help-btn[data-help-key]").forEach((button) => {
      const open = !!activeButton && button === activeButton;
      button.classList.toggle("is-open", open);
      button.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  function findHelpButton(helpKey) {
    if (!helpKey) return null;
    const buttons = el.leftDecisionBody.querySelectorAll(".inline-help-btn[data-help-key]");
    for (const button of buttons) {
      if (button.dataset.helpKey === helpKey) return button;
    }
    return null;
  }

  function renderHelpPopoverLayer(button, text) {
    if (!button || !el.helpPopoverLayer) return;
    el.helpPopoverLayer.innerHTML = `
      <div class="help-popover-card" role="dialog" aria-live="polite" aria-label="Definition">
        <header class="help-popover-head">
          <strong>DEFINITION</strong>
          <button type="button" class="help-popover-close" data-action="close-help-popover" aria-label="Close help">×</button>
        </header>
        <p>${esc(text || "NO DEFINITION AVAILABLE.")}</p>
      </div>
    `;
    el.helpPopoverLayer.hidden = false;
    ui.openHelpAnchorEl = button;
    setHelpButtonState(button);
    positionHelpPopoverLayer();
  }

  function positionHelpPopoverLayer() {
    if (el.helpPopoverLayer.hidden) return;
    const card = el.helpPopoverLayer.querySelector(".help-popover-card");
    const anchor = ui.openHelpAnchorEl;
    if (!card || !anchor) return;

    const anchorRect = anchor.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const gap = 10;
    const viewportPad = 12;
    let left = anchorRect.right + gap;
    let top = anchorRect.top - 4;

    if (left + cardRect.width > window.innerWidth - viewportPad) {
      left = Math.max(viewportPad, anchorRect.left - cardRect.width - gap);
    }
    if (top + cardRect.height > window.innerHeight - viewportPad) {
      top = Math.max(viewportPad, window.innerHeight - cardRect.height - viewportPad);
    }
    if (top < viewportPad) top = viewportPad;

    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
  }

  function closeHelpPopover(clearKey = true) {
    if (clearKey) {
      ui.openHelpKey = null;
    }
    ui.openHelpAnchorEl = null;
    if (el.helpPopoverLayer) {
      el.helpPopoverLayer.hidden = true;
      el.helpPopoverLayer.innerHTML = "";
    }
    setHelpButtonState(null);
  }

  function syncOpenHelpPopover() {
    if (!ui.openHelpKey) {
      closeHelpPopover(false);
      return;
    }
    const button = findHelpButton(ui.openHelpKey);
    if (!button) {
      closeHelpPopover();
      return;
    }
    renderHelpPopoverLayer(button, button.dataset.helpText || "");
  }

  function toggleHelpPopover(button) {
    const helpKey = button.dataset.helpKey || "";
    if (!helpKey) return;
    if (ui.openHelpKey === helpKey && !el.helpPopoverLayer.hidden) {
      closeHelpPopover();
      return;
    }
    ui.openHelpKey = helpKey;
    renderHelpPopoverLayer(button, button.dataset.helpText || "");
  }

  function onHelpLayerClick(event) {
    const closeBtn = event.target.closest("[data-action='close-help-popover']");
    if (closeBtn) {
      closeHelpPopover();
    }
  }

  function onDocumentClick(event) {
    if (event.target.closest(".inline-help-btn[data-help-key]")) return;
    if (event.target.closest(".help-popover-card")) return;
    if (!el.helpPopoverLayer.hidden) {
      closeHelpPopover();
    }
  }

  function onHelpAnchorViewportChange() {
    if (!ui.openHelpKey) return;
    const button = findHelpButton(ui.openHelpKey);
    if (!button) {
      closeHelpPopover();
      return;
    }
    ui.openHelpAnchorEl = button;
    positionHelpPopoverLayer();
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
        if (facilityState.phase === 8 && ui.mode === VIEW_MODE.MAP) {
          walkMapStats();
          updateMapOverlayValues();
        }
        if (facilityState.phase >= 5 && (facilityState.phase < 8 || ui.mode === VIEW_MODE.FLOOR)) {
          const refreshed = updateFloorTelemetryOverlay();
          if (!refreshed) {
            renderCenterCanvas();
          }
          if (inspectorNeedsTelemetryRefresh()) {
            renderInspector();
          }
        }
      }
    }, 1400);
  }

  function inspectorNeedsTelemetryRefresh() {
    const source = ui.hoverInspect || ui.selectedInspect;
    return !!(source && source.kind === "rack");
  }

  function updateFloorTelemetryOverlay() {
    if (!(facilityState.phase >= 5 && (facilityState.phase < 8 || ui.mode === VIEW_MODE.FLOOR))) return false;
    const svg = el.constructionCanvas.querySelector(".floor-svg-viewport");
    if (!svg) return false;

    const labels = svg.querySelectorAll(".cad-rack-meta[data-rack-id]");
    const leds = svg.querySelectorAll(".cad-rack-led[data-rack-id]");
    if (!labels.length && !leds.length) return false;

    labels.forEach((node) => {
      const idx = Number(node.dataset.rackId);
      const rack = ui.rackCache[idx];
      if (!rack) return;
      const next = `${rack.powerKw.toFixed(1)} KW | ${rack.temp.toFixed(1)} C`;
      if (node.textContent !== next) {
        node.textContent = next;
      }
    });

    leds.forEach((node) => {
      const idx = Number(node.dataset.rackId);
      const rack = ui.rackCache[idx];
      if (!rack) return;
      node.classList.toggle("status-healthy", rack.status === "healthy");
      node.classList.toggle("status-warning", rack.status === "warning");
      node.classList.toggle("status-critical", rack.status === "critical");
    });

    return true;
  }

  function onTimelineClick(event) {
    const row = event.target.closest("li[data-phase]");
    if (!row) return;
    const phase = Number(row.dataset.phase);
    if (!isPhaseUnlocked(phase)) return;
    facilityState.phase = phase;
    closeHelpPopover();
    if (phase < 8) {
      ui.mode = VIEW_MODE.FLOOR;
      setImmersivePhase8(false);
    } else {
      applyPhase8Immersive();
    }
    recalcAll();
    renderAll();
    emitEvent("PHASE_NAVIGATED", { phase }, "INFO");
  }

  function onDecisionClick(event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    if (button.dataset.locked === "true") return;

    const action = button.dataset.action;
    const value = button.dataset.value;
    let lightweightRender = false;

    if (action === "toggle-help") {
      toggleHelpPopover(button);
      return;
    }

    switch (action) {
      case "set-location":
        facilityState.site.locationType = value;
        break;
      case "set-site-city":
        facilityState.site.cityKey = value;
        break;
      case "set-workload":
        facilityState.site.workloadProfile = value;
        break;
      case "set-permit":
        facilityState.site.permittingTrack = value;
        break;
      case "range-bump": {
        const targetAction = button.dataset.targetAction;
        const key = button.dataset.key || undefined;
        const delta = parseBoundedNumber(button.dataset.delta, -1000000, 1000000);
        if (!targetAction || delta === null) return;
        applyRangeDelta(targetAction, key, delta);
        lightweightRender = true;
        break;
      }
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
      case "set-intra":
        facilityState.networking.intraNode = value;
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
    if (lightweightRender) {
      withLeftRailScrollPreserved(() => {
        renderTimeline();
        renderLeftDecision();
        renderLeftMetrics();
        renderCenterCanvas();
        renderInspector();
      });
      return;
    }
    withLeftRailScrollPreserved(() => renderAll());
  }

  function onDecisionInput(event) {
    const t = event.target;
    const action = t.dataset.action;
    if (!action) return;

    switch (action) {
      case "set-site-city": {
        facilityState.site.cityKey = safeEnum(t.value, Object.keys(SITE_CITIES));
        break;
      }
      case "set-acreage": {
        const n = parseBoundedNumber(t.value, 5, 500);
        if (n === null) {
          emitEvent("ERROR_PARSE_INPUT", { field: "acreage", value: t.value }, "ERROR");
          return;
        }
        facilityState.site.acreage = Math.round(n);
        break;
      }
      case "set-source": {
        const n = parseBoundedNumber(t.value, 0, 100);
        if (n === null) {
          emitEvent("ERROR_PARSE_INPUT", { field: `power.sources.${t.dataset.key}`, value: t.value }, "ERROR");
          return;
        }
        setPowerShare(t.dataset.key, Math.round(n));
        break;
      }
      case "set-target-mw": {
        const n = parseBoundedNumber(t.value, 10, 1000);
        if (n === null) {
          facilityState.power.targetMW = null;
          emitEvent("ERROR_PARSE_INPUT", { field: "targetMW", value: t.value }, "ERROR");
        } else {
          facilityState.power.targetMW = TARGET_MW.includes(Math.round(n)) ? Math.round(n) : null;
        }
        break;
      }
      case "set-gpr": {
        const n = parseBoundedNumber(t.value, 4, 16);
        if (n === null) {
          emitEvent("ERROR_PARSE_INPUT", { field: "gpusPerRack", value: t.value }, "ERROR");
          return;
        }
        facilityState.compute.gpusPerRack = clamp(Math.round(n), 4, 16);
        break;
      }
      case "set-nodes": {
        const n = parseBoundedNumber(t.value, 1, 1024);
        if (n === null) {
          emitEvent("ERROR_PARSE_INPUT", { field: "nodeCount", value: t.value }, "ERROR");
          return;
        }
        facilityState.networking.nodeCount = Math.round(n);
        break;
      }
      case "set-utility-expansion": {
        facilityState.site.utilityExpansionApproved = !!t.checked;
        break;
      }
      default:
        return;
    }

    recalcAll();

    const continuous =
      event.type === "input" &&
      (action === "set-acreage" || action === "set-source" || action === "set-nodes");

    if (continuous) {
      renderTimeline();
      renderLeftDecisionStatus();
      renderLeftMetrics();
      renderCenterCanvas();
      renderInspector();
      return;
    }

    withLeftRailScrollPreserved(() => renderAll());
  }

  function applyRangeDelta(action, key, delta) {
    if (action === "set-acreage") {
      facilityState.site.acreage = clamp(Math.round((facilityState.site.acreage || 25) + delta), 5, 500);
      return;
    }
    if (action === "set-source" && key && Object.prototype.hasOwnProperty.call(facilityState.power.sources, key)) {
      setPowerShare(key, (facilityState.power.sources[key] || 0) + delta);
      return;
    }
    if (action === "set-nodes") {
      facilityState.networking.nodeCount = clamp(Math.round((facilityState.networking.nodeCount || 1) + delta), 1, 1024);
    }
  }

  function rangeControl({ action, value, min, max, step = 1, key = null }) {
    const shared = key ? `data-key="${key}"` : "";
    return `
      <div class="range-control">
        <button type="button" class="range-nudge" data-action="range-bump" data-target-action="${action}" data-delta="-${step}" ${shared} aria-label="Decrease">−</button>
        <input class="range-number" type="number" min="${min}" max="${max}" step="${step}" value="${Math.round(value)}" data-action="${action}" ${shared} inputmode="numeric" />
        <button type="button" class="range-nudge" data-action="range-bump" data-target-action="${action}" data-delta="${step}" ${shared} aria-label="Increase">+</button>
      </div>
    `;
  }

  function helpPopover(text, key = "") {
    const normalizedKey = (key || text || "help")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    const isOpen = ui.openHelpKey === normalizedKey;
    return `
      <span class="inline-help">
        <button
          type="button"
          class="inline-help-btn ${isOpen ? "is-open" : ""}"
          data-action="toggle-help"
          data-help-key="${normalizedKey}"
          data-help-text="${esc(text)}"
          aria-label="Open explanation"
          aria-haspopup="dialog"
          aria-expanded="${isOpen ? "true" : "false"}">?</button>
      </span>
    `;
  }

  function onBenchmarkInput(event) {
    const t = event.target;
    const action = t.dataset.action;
    if (!action) return;

    if (action === "bench-model") ui.bench.model = t.value;
    if (action === "bench-prompt") {
      const n = parseBoundedNumber(t.value, 1, 262144);
      if (n === null) {
        emitEvent("ERROR_PARSE_INPUT", { field: "bench.prompt", value: t.value }, "ERROR");
        return;
      }
      ui.bench.prompt = Math.round(n);
    }
    if (action === "bench-batch") {
      const n = parseBoundedNumber(t.value, 1, 16384);
      if (n === null) {
        emitEvent("ERROR_PARSE_INPUT", { field: "bench.batch", value: t.value }, "ERROR");
        return;
      }
      ui.bench.batch = Math.round(n);
    }
    if (action === "bench-output") {
      const n = parseBoundedNumber(t.value, 1, 262144);
      if (n === null) {
        emitEvent("ERROR_PARSE_INPUT", { field: "bench.output", value: t.value }, "ERROR");
        return;
      }
      ui.bench.output = Math.round(n);
    }
    if (action === "bench-conc") {
      const n = parseBoundedNumber(t.value, 1, 100000);
      if (n === null) {
        emitEvent("ERROR_PARSE_INPUT", { field: "bench.conc", value: t.value }, "ERROR");
        return;
      }
      ui.bench.conc = Math.round(n);
    }
    if (action === "bench-precision") ui.bench.precision = t.value;
    if (action === "bench-calibration-mode") {
      ui.bench.calibrationMode = !!t.checked;
    }
    if (action === "bench-assumed-observed") {
      const n = parseBoundedNumber(t.value, 1, 100000000);
      if (n === null) {
        emitEvent("ERROR_PARSE_INPUT", { field: "bench.assumedObservedTps", value: t.value }, "ERROR");
        return;
      }
      ui.bench.assumedObservedTps = Math.round(n);
    }

    recalcBenchmarks();
    renderBenchmarks();
    renderInspector();
  }

  function onToggleView() {
    if (facilityState.phase !== 8) return;
    ui.mode = ui.mode === VIEW_MODE.MAP ? VIEW_MODE.FLOOR : VIEW_MODE.MAP;
    ui.selectedInspect = null;
    ui.hoverInspect = null;
    renderCenterCanvas(true);
    renderInspector();
  }

  function onToggleImmersive() {
    if (facilityState.phase !== 8) return;
    setImmersivePhase8(!ui.immersivePhase8);
    applyAutoBenchmarkCollapse();
    renderBenchmarks();
    renderCenterCanvas();
  }

  function onGlobalKeydown(event) {
    if (event.key === "Escape" && el.helpPopoverLayer && !el.helpPopoverLayer.hidden) {
      closeHelpPopover();
      return;
    }
    if (event.key === "Escape" && ui.immersivePhase8) {
      setImmersivePhase8(false);
      renderCenterCanvas();
    }
  }

  function onCanvasClick(event) {
    const dc = event.target.closest("[data-action='jump-floor']");
    if (dc && facilityState.phase === 8) {
      ui.mode = VIEW_MODE.FLOOR;
      renderCenterCanvas(true);
      renderInspector();
      return;
    }

    const actionNode = event.target.closest("[data-canvas-action]");
    if (!actionNode || ui.mode !== VIEW_MODE.FLOOR) return;

    const action = actionNode.dataset.canvasAction;
    if (action === "toggle-layers") {
      ui.canvas.layerPanelOpen = !ui.canvas.layerPanelOpen;
      renderCenterCanvas();
      return;
    }
    if (action === "zoom-in") {
      setCanvasZoom(ui.canvas.zoom * 1.15, "custom");
      renderCenterCanvas();
      return;
    }
    if (action === "zoom-out") {
      setCanvasZoom(ui.canvas.zoom / 1.15, "custom");
      renderCenterCanvas();
      return;
    }
    if (action === "fit") {
      ui.canvas.panX = 0;
      ui.canvas.panY = 0;
      setCanvasZoom(SCALE_PRESETS.fit, "fit");
      renderCenterCanvas();
      return;
    }
    if (action === "toggle-layer") {
      const key = actionNode.dataset.layerKey;
      if (key && Object.prototype.hasOwnProperty.call(ui.canvas.layers, key)) {
        ui.canvas.layers[key] = !ui.canvas.layers[key];
        renderCenterCanvas();
      }
      return;
    }
    if (action === "preset-view") {
      applyCanvasLayerPreset(actionNode.dataset.presetKey);
      renderCenterCanvas();
      return;
    }
    if (action === "fullscreen") {
      onToggleImmersive();
      return;
    }
    if (action === "export-drawing") {
      exportActiveDrawing();
      return;
    }
  }

  function onCanvasControlInput(event) {
    const target = event.target;
    const action = target.dataset.canvasAction;
    if (!action) return;

    if (action === "scale-select") {
      const val = target.value;
      if (Object.prototype.hasOwnProperty.call(SCALE_PRESETS, val)) {
        setCanvasZoom(SCALE_PRESETS[val], val);
        if (val === "fit") {
          ui.canvas.panX = 0;
          ui.canvas.panY = 0;
        }
        renderCenterCanvas();
      }
    }
  }

  function onCanvasWheel(event) {
    if (ui.mode !== VIEW_MODE.FLOOR) return;
    const viewport = event.target.closest(".floor-svg-viewport");
    if (!viewport) return;
    event.preventDefault();

    const factor = event.deltaY < 0 ? 1.08 : 0.92;
    setCanvasZoom(ui.canvas.zoom * factor, "custom");
    renderCenterCanvas();
  }

  function onCanvasPointerDown(event) {
    if (ui.mode !== VIEW_MODE.FLOOR) return;
    if (event.button !== 0) return;
    if (event.target.closest(".floor-toolbar")) return;
    if (!event.target.closest(".floor-svg-viewport")) return;

    ui.canvas.dragging = true;
    ui.canvas.dragStartX = event.clientX - ui.canvas.panX;
    ui.canvas.dragStartY = event.clientY - ui.canvas.panY;
    el.constructionCanvas.classList.add("is-panning");
  }

  function onCanvasPointerMove(event) {
    if (!ui.canvas.dragging || ui.mode !== VIEW_MODE.FLOOR) return;
    ui.canvas.panX = event.clientX - ui.canvas.dragStartX;
    ui.canvas.panY = event.clientY - ui.canvas.dragStartY;
    requestFloorPanTransform();
  }

  function onCanvasPointerUp() {
    if (!ui.canvas.dragging) return;
    ui.canvas.dragging = false;
    el.constructionCanvas.classList.remove("is-panning");
    if (ui.canvas.panRaf) {
      cancelAnimationFrame(ui.canvas.panRaf);
      ui.canvas.panRaf = null;
      applyFloorPanZoomTransform();
    }
  }

  function requestFloorPanTransform() {
    if (ui.canvas.panRaf || ui.mode !== VIEW_MODE.FLOOR) return;
    ui.canvas.panRaf = requestAnimationFrame(() => {
      ui.canvas.panRaf = null;
      applyFloorPanZoomTransform();
    });
  }

  function applyFloorPanZoomTransform() {
    const panZoom = el.constructionCanvas.querySelector("#floor-pan-zoom");
    if (!panZoom) return false;
    panZoom.setAttribute("transform", `translate(${ui.canvas.panX.toFixed(2)} ${ui.canvas.panY.toFixed(2)}) scale(${ui.canvas.zoom.toFixed(4)})`);
    return true;
  }

  function setCanvasZoom(value, preset = "custom") {
    ui.canvas.zoom = clamp(value, 0.45, 4.25);
    ui.canvas.scalePreset = preset;
  }

  function applyCanvasLayerPreset(key) {
    const base = {
      site: true,
      building: true,
      rooms: true,
      racks: true,
      power: true,
      cooling: true,
      annotations: true,
      overlay: true,
    };
    if (key === "site") {
      base.racks = false;
      base.cooling = false;
    } else if (key === "electrical") {
      base.rooms = false;
      base.cooling = false;
      base.racks = false;
    } else if (key === "cooling") {
      base.power = false;
      base.racks = false;
    } else if (key === "network") {
      base.power = false;
      base.cooling = false;
    }
    ui.canvas.layers = base;
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
      emitEvent("PHASE_BLOCKED_VALIDATION", { phase: facilityState.phase, reason: "incomplete_decisions" }, "WARN");
      return;
    }

    if (facilityState.validation.errors.length) {
      setDeployState("BLOCKED — FIX ERRORS", 0, false);
      pushLog(`PHASE ${facilityState.phase} BLOCKED — ${facilityState.validation.errors[0]}`, "warn");
      emitEvent("PHASE_BLOCKED_VALIDATION", { phase: facilityState.phase, reason: facilityState.validation.errors[0] }, "WARN");
      return;
    }

    setDeployState("DEPLOYING...", 0, true);
    emitEvent("PHASE_DEPLOYING", { phase: facilityState.phase }, "INFO");

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
        ui.mode = VIEW_MODE.MAP;
        setImmersivePhase8(false);
      }
    }

    closeHelpPopover();
    ui.pendingCanvasTransition = true;
    setDeployState("READY", 0, false);
    recalcAll();
    renderAll();
    emitEvent("PHASE_CONFIRMED", { phase }, "INFO");
  }

  function setDeployState(message, progress, active) {
    ui.deploying.message = message;
    ui.deploying.progress = progress;
    ui.deploying.active = active;
    el.deployStatus.textContent = message;
    el.deployProgress.style.width = `${progress}%`;
  }

  function onExportScenario() {
    const payload = buildExportPayload();
    const json = stableStringify(payload);
    downloadTextFile(`forge-scenario-${facilityState.scenario.id}.json`, json);
    emitEvent("SCENARIO_EXPORTED", { bytes: json.length, schemaVersion: SCHEMA_VERSION }, "INFO");
    pushLog(`SCENARIO EXPORTED (${INTEGER.format(json.length)} BYTES)`, "good");
  }

  async function onImportScenarioFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 2_000_000) {
      pushLog("IMPORT BLOCKED — FILE TOO LARGE (>2MB)", "warn");
      emitEvent("ERROR_PARSE_INPUT", { field: "importScenario", reason: "file_too_large", bytes: file.size }, "ERROR");
      return;
    }
    try {
      const text = await file.text();
      const raw = JSON.parse(text);
      const migrated = migrateScenario(raw);
      applyImportedScenario(migrated);
      recalcAll();
      renderAll();
      emitEvent("SCENARIO_IMPORTED", { bytes: file.size, schemaVersion: migrated.schemaVersion }, "INFO");
      pushLog(`SCENARIO IMPORTED — ${migrated.scenario?.name || "UNTITLED"}`, "good");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "UNKNOWN IMPORT ERROR";
      pushLog(`IMPORT FAILED — ${msg.toUpperCase()}`, "warn");
      emitEvent("ERROR_PARSE_INPUT", { field: "importScenario", reason: msg }, "ERROR");
    }
  }

  function onExportEventLog() {
    const lines = facilityState.events.map((entry) => JSON.stringify(sortDeep(entry))).join("\n");
    downloadTextFile(`forge-events-${facilityState.scenario.id}.ndjson`, `${lines}\n`);
    emitEvent("EVENT_LOG_EXPORTED", { entries: facilityState.events.length }, "INFO");
    pushLog(`EVENT LOG EXPORTED (${facilityState.events.length} ENTRIES)`, "good");
  }

  function buildExportPayload() {
    return {
      schemaVersion: SCHEMA_VERSION,
      scenario: {
        ...facilityState.scenario,
        updatedAt: new Date().toISOString(),
      },
      phase: facilityState.phase,
      completed: [...facilityState.completed],
      site: { ...facilityState.site },
      power: { ...facilityState.power, sources: { ...facilityState.power.sources } },
      fiber: { ...facilityState.fiber, carriers: [...facilityState.fiber.carriers] },
      facility: { ...facilityState.facility },
      compute: { ...facilityState.compute },
      networking: { ...facilityState.networking },
      dcim: { ...facilityState.dcim },
      benchmarkInput: { ...ui.bench },
      viewMode: ui.mode,
    };
  }

  function migrateScenario(raw) {
    if (!raw || typeof raw !== "object") {
      throw new Error("INVALID JSON PAYLOAD");
    }

    const migrated = {
      schemaVersion: SCHEMA_VERSION,
      scenario: {
        id: raw.scenario?.id || cryptoRandomId(),
        name: raw.scenario?.name || "IMPORTED FORGE SCENARIO",
        createdAt: raw.scenario?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        schemaVersion: SCHEMA_VERSION,
      },
      phase: clamp(Math.round(Number(raw.phase || 1)), 1, 8),
      completed: Array.isArray(raw.completed) ? raw.completed.filter((n) => Number.isInteger(n) && n >= 1 && n <= 8) : [],
      site: {
        locationType: safeEnum(raw.site?.locationType, Object.keys(LOCATION)),
        cityKey: safeEnum(raw.site?.cityKey, Object.keys(SITE_CITIES)) || LEGACY_DEFAULT_SITE_CITY,
        workloadProfile: safeEnum(raw.site?.workloadProfile, Object.keys(WORKLOAD_PROFILES)) || LEGACY_DEFAULT_WORKLOAD_PROFILE,
        acreage: parseBoundedNumber(raw.site?.acreage, 5, 500) || 25,
        permittingTrack: safeEnum(raw.site?.permittingTrack, Object.keys(PERMIT)),
        estimatedPermitCost: 0,
        permittingMonths: 0,
        utilityExpansionApproved: !!raw.site?.utilityExpansionApproved,
      },
      power: {
        sources: normalizeSourceMap(raw.power?.sources),
        targetMW: parseBoundedNumber(raw.power?.targetMW, 10, 1000) || null,
        redundancyTier: safeEnum(raw.power?.redundancyTier, Object.keys(REDUNDANCY)),
        upsType: safeEnum(raw.power?.upsType, Object.keys(UPS)),
      },
      fiber: {
        accessType: safeEnum(raw.fiber?.accessType, Object.keys(FIBER_ACCESS)),
        carriers: normalizeCarrierList(raw.fiber?.carriers),
        ixpRegion: safeEnum(raw.fiber?.ixpRegion, Object.keys(IXP)),
        latencyMs: 0,
        monthlyCost: 0,
      },
      facility: {
        developerType: safeEnum(raw.facility?.developerType, Object.keys(DEVELOPER)),
        buildMonths: 0,
        coolingType: safeEnum(raw.facility?.coolingType, Object.keys(COOLING)),
        powerArchitecture: safeEnum(raw.facility?.powerArchitecture, Object.keys(ARCH)),
        pue: 2,
      },
      compute: {
        gpuModel: safeEnum(raw.compute?.gpuModel, Object.keys(GPU)),
        gpusPerRack: parseBoundedNumber(raw.compute?.gpusPerRack, 4, 16) || 8,
        rackCount: 0,
        totalTFLOPS: 0,
        inferenceStack: safeEnum(raw.compute?.inferenceStack, Object.keys(STACK)),
        servingArch: safeEnum(raw.compute?.servingArch, Object.keys(SERVING)),
      },
      networking: {
        intraNode: safeEnum(raw.networking?.intraNode, Object.keys(INTRA_NODE)) || "nv",
        fabric: safeEnum(raw.networking?.fabric, Object.keys(FABRIC)),
        nodeCount: parseBoundedNumber(raw.networking?.nodeCount, 1, 1024) || 1,
        externalBandwidth: safeEnum(raw.networking?.externalBandwidth, Object.keys(EXTERNAL)),
        networkingCapex: 0,
      },
      dcim: {
        monitoringApproach: safeEnum(raw.dcim?.monitoringApproach, Object.keys(MONITORING)),
        maintenanceModel: safeEnum(raw.dcim?.maintenanceModel, Object.keys(MAINT)),
        coolingTelemetry: typeof raw.dcim?.coolingTelemetry === "boolean" ? raw.dcim.coolingTelemetry : null,
      },
      benchmarkInput: {
        model: safeEnum(raw.benchmarkInput?.model, Object.keys(MODEL)) || "70B",
        prompt: parseBoundedNumber(raw.benchmarkInput?.prompt, 1, 262144) || 512,
        batch: parseBoundedNumber(raw.benchmarkInput?.batch, 1, 16384) || 8,
        output: parseBoundedNumber(raw.benchmarkInput?.output, 1, 262144) || 256,
        conc: parseBoundedNumber(raw.benchmarkInput?.conc, 1, 100000) || 16,
        precision: safeEnum(raw.benchmarkInput?.precision, Object.keys(PRECISION_BYTES)) || "FP8",
        assumedObservedTps: parseBoundedNumber(raw.benchmarkInput?.assumedObservedTps, 1, 100000000) || 0,
        calibrationMode: !!raw.benchmarkInput?.calibrationMode,
      },
      viewMode: safeEnum(raw.viewMode, Object.values(VIEW_MODE)) || VIEW_MODE.FLOOR,
    };
    return migrated;
  }

  function applyImportedScenario(payload) {
    facilityState.runId = cryptoRandomId();
    facilityState.events = [];
    facilityState.scenario = payload.scenario;
    facilityState.phase = payload.phase;
    facilityState.completed = [...payload.completed];
    facilityState.site = payload.site;
    facilityState.power = payload.power;
    facilityState.fiber = payload.fiber;
    facilityState.facility = payload.facility;
    facilityState.compute = payload.compute;
    facilityState.networking = payload.networking;
    facilityState.dcim = payload.dcim;
    ui.bench = payload.benchmarkInput;
    closeHelpPopover();
    ui.mode = facilityState.phase === 8 ? (safeEnum(payload.viewMode, Object.values(VIEW_MODE)) || VIEW_MODE.FLOOR) : VIEW_MODE.FLOOR;
    ui.logs = [];
  }

  function toggleCarrier(key) {
    const next = new Set(facilityState.fiber.carriers.filter((k) => !!CARRIER[k]));
    if (next.has(key)) next.delete(key);
    else next.add(key);
    facilityState.fiber.carriers = [...next].sort();
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
    const errors = [];
    const warnings = [];

    const loc = LOCATION[facilityState.site.locationType];
    const city = SITE_CITIES[facilityState.site.cityKey];
    const workload = WORKLOAD_PROFILES[facilityState.site.workloadProfile];
    const permit = PERMIT[facilityState.site.permittingTrack];
    const targetMw = facilityState.power.targetMW || 0;
    const targetKw = mwToKw(targetMw);
    const mwPerAcre = city ? city.maxMwPerAcre : 1.8;
    const siteMaxMw = Math.max(0, (facilityState.site.acreage || 0) * mwPerAcre);
    const siteMaxKw = mwToKw(siteMaxMw);

    facilityState.site.estimatedPermitCost = clamp(
      (loc ? facilityState.site.acreage * 5500 : 50000) +
      (permit ? permit.costAdd : 0) +
      (city ? city.permitCostAdd : 0),
      50000,
      2000000,
    );
    facilityState.site.permittingMonths = permit ? Math.round((permit.months[0] + permit.months[1]) / 2) + (city ? city.permitDelta : 0) : 0;

    if (facilityState.phase >= 1 && !facilityState.site.cityKey) {
      errors.push("SELECT A DEPLOYMENT CITY FOR THE SITE.");
    }
    if (facilityState.phase >= 1 && !facilityState.site.workloadProfile) {
      errors.push("SELECT A PRIMARY WORKLOAD PROFILE.");
    }

    normalizePowerShares();

    if (powerTotal() !== 100) {
      errors.push(`POWER MIX MUST EQUAL 100% (CURRENT ${powerTotal()}%)`);
    }

    if (targetMw > siteMaxMw && !facilityState.site.utilityExpansionApproved) {
      errors.push(`TARGET ${targetMw} MW EXCEEDS SITE LIMIT ${siteMaxMw.toFixed(1)} MW. ENABLE UTILITY EXPANSION OR LOWER TARGET MW.`);
    }
    if (targetMw > siteMaxMw && facilityState.site.utilityExpansionApproved) {
      warnings.push(`UTILITY EXPANSION ENABLED: ${siteMaxMw.toFixed(1)} MW -> ${targetMw} MW OVERRIDE.`);
    }

    const tier = REDUNDANCY[facilityState.power.redundancyTier];
    const ups = UPS[facilityState.power.upsType];

    let blendedRate = 0;
    let powerCapex = 0;
    Object.entries(facilityState.power.sources).forEach(([key, pct]) => {
      blendedRate += (pct / 100) * POWER_SRC[key].rateMwh;
      powerCapex += targetKw * (pct / 100) * POWER_SRC[key].capexKw;
    });

    powerCapex = powerCapex * (tier ? tier.mult : 1) + (ups ? targetKw * ups.kwCapex : 0);
    const gridStress = clamp((facilityState.power.sources.fom || 0) * 1.2 + (targetMw >= 250 ? 12 : 0), 0, 100);

    const access = FIBER_ACCESS[facilityState.fiber.accessType];
    const ixp = IXP[facilityState.fiber.ixpRegion];

    const carrierMrc = facilityState.fiber.carriers.reduce((sum, key) => sum + (CARRIER[key]?.mrc || 0), 0);
    const quality = facilityState.fiber.carriers.length
      ? facilityState.fiber.carriers.reduce((sum, key) => sum + (CARRIER[key]?.quality || 0), 0) / facilityState.fiber.carriers.length
      : 0.7;

    if (facilityState.phase >= 3 && facilityState.fiber.carriers.length < 2) {
      errors.push(`SELECT AT LEAST TWO CARRIERS (SELECTED ${facilityState.fiber.carriers.length}/2)`);
    }

    const latency = ixp ? clamp(ixp.latency + (1 - quality) * 8 + (workload ? (workload.demandFactor - 1) * 3.5 : 0), 1, 35) : 0;
    const cityFiberMiles = city ? city.fiberMiles : (loc ? loc.fiberMiles : 8);
    const fiberCapex = access
      ? access.capex + (facilityState.fiber.accessType === "build" ? Math.max(0, cityFiberMiles - 5) * 250000 : 0)
      : 0;

    facilityState.fiber.latencyMs = latency;
    facilityState.fiber.monthlyCost = (access ? access.mrc : 0) + carrierMrc;

    const dev = DEVELOPER[facilityState.facility.developerType];
    const cooling = COOLING[facilityState.facility.coolingType];
    const arch = ARCH[facilityState.facility.powerArchitecture];
    const costProfile = selectFlightDeckProfile(targetMw);

    const devCostMid = dev ? (dev.cost[0] + dev.cost[1]) / 2 : 0;
    const facilityShellCapex = targetMw > 0 && dev ? targetMw * dev.perMw : devCostMid;

    facilityState.facility.buildMonths = dev ? Math.round((dev.months[0] + dev.months[1]) / 2) : 0;
    facilityState.facility.pue = clamp((cooling ? (cooling.pue[0] + cooling.pue[1]) / 2 : 2) - (facilityState.facility.powerArchitecture === "hvdc" ? 0.04 : 0), 1.05, 2.1);

    const procuredKw = targetKw;
    const itKw = procuredKw > 0 ? procuredKw / facilityState.facility.pue : 0;
    if (itKw > procuredKw + 1e-6) {
      errors.push("IT LOAD EXCEEDS PROCURED CAPACITY.");
    }

    const gpu = GPU[facilityState.compute.gpuModel];
    const gpr = facilityState.compute.gpusPerRack || 8;

    const rackKw = gpu
      ? (gpu.rackKw ? gpu.rackKw : Math.max(20, gpu.kw * gpr * 2.8 + (["d2c", "immersion"].includes(facilityState.facility.coolingType) ? 9 : 6)))
      : 0;

    const powerLimitedRacks = rackKw > 0 ? Math.floor((itKw * 0.78) / rackKw) : 0;
    const footprintLimitedRacks = Math.max(0, Math.floor((facilityState.site.acreage || 5) * 22));
    const rackCount = Math.max(0, Math.min(powerLimitedRacks, footprintLimitedRacks || powerLimitedRacks));
    const plannedItKw = rackCount * rackKw / 0.78;
    if (plannedItKw > itKw + 1e-3) {
      errors.push("RACK PLAN EXCEEDS IT CAPACITY AFTER PUE CONSTRAINTS.");
    }

    facilityState.compute.rackCount = rackCount;
    facilityState.compute.totalTFLOPS = gpu ? rackCount * gpr * gpu.pf * 1000 : 0;
    const totalGpus = gpu ? rackCount * gpr : 0;
    const cardCapex = gpu ? totalGpus * gpu.cost : 0;
    const approxServers = Math.ceil(totalGpus / 8);
    const serverOverheadCapex = approxServers * costProfile.serverCost;
    const itInfrastructureCapex = cardCapex + serverOverheadCapex;
    const coolingCapex = capexFromPctOfBase(itInfrastructureCapex, costProfile.coolingPctOfItCapex);
    const internalPowerCapex = capexFromPctOfBase(itInfrastructureCapex, costProfile.internalPowerPctOfItCapex);
    const archCapex = arch ? targetMw * arch.perMw : 0;
    const otherFacilityCapex = targetMw * 110_000;
    const coreFacilityCapex = facilityShellCapex + coolingCapex + internalPowerCapex + archCapex + otherFacilityCapex;

    const batteryCapacityMWh = Math.max(0, targetMw * costProfile.batteryOverbuildPct);
    const batteryCapex = batteryCapacityMWh * costProfile.batteryUnitCapexPerMWh + costProfile.batteryAncillary;
    const backupGenCount = roundToHalf(targetMw * costProfile.dieselOverbuildPct);
    const backupGenCapex = backupGenCount * costProfile.dieselUnitCapex;
    const powerGenerationStorageCapex = powerCapex + batteryCapex + backupGenCapex;

    const sitePreparationCapex = costProfile.sitePrepCost;
    const eicCapex = costProfile.eicDesign + costProfile.eicShipping + costProfile.eicInstall;

    const stack = STACK[facilityState.compute.inferenceStack];
    const serving = SERVING[facilityState.compute.servingArch];
    const intra = INTRA_NODE[facilityState.networking.intraNode];
    const fabric = FABRIC[facilityState.networking.fabric];
    const external = EXTERNAL[facilityState.networking.externalBandwidth];

    const estimatedMfu = clamp(
      (gpu ? 0.32 : 0) +
      (stack ? (stack.mfu[0] + stack.mfu[1]) / 2 - 0.3 : 0) +
      (serving ? serving.mfuAdj : -0.06) +
      (intra ? intra.mfuAdj : 0) +
      (fabric ? fabric.mfuAdj : -0.04) -
      (latency > 20 ? 0.08 : latency > 5 ? 0.04 : 0) +
      (workload ? workload.mfuBias : 0),
      0.16,
      0.86,
    );

    const nodes = facilityState.networking.nodeCount || 1;
    const switchCount = fabric ? Math.ceil(nodes / 32) * 2 + Math.max(2, Math.ceil(nodes / 96)) : 0;
    const numLinks = Math.max(1, Math.ceil(nodes / 8));
    const perLinkGbps = fabric ? fabric.perLinkGbps * fabric.encodingEfficiency : 0;
    const perLinkGBps = gbpsToGBps(perLinkGbps);
    const topologyFactor = 1 / Math.max(1, Math.log2(nodes + 1) / 2);
    const aggregateGbps = perLinkGbps * numLinks * topologyFactor;
    const allReduceGBps = gbpsToGBps(aggregateGbps);
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

    if (facilityState.power.redundancyTier && ["t1", "t2"].includes(facilityState.power.redundancyTier)) {
      warnings.push("REDUNDANCY BELOW TIER III. CONCURRENT MAINTENANCE REQUIREMENTS NOT MET.");
    }
    if (facilityState.power.redundancyTier === "t4" && !facilityState.dcim.coolingTelemetry) {
      warnings.push("TIER IV REQUIRES FAULT-TOLERANT CONTINUOUS COOLING TELEMETRY.");
    }
    if (facilityState.facility.coolingType === "immersion") {
      warnings.push("IMMERSION COOLING MAY LIMIT FINANCING COLLATERAL ELIGIBILITY.");
    }

    const dcimOpex = (monitoring ? monitoring.opex : 0) + (maintenance ? maintenance.opex : 0) + (facilityState.dcim.coolingTelemetry ? 125000 : 0);
    const baselineNetworkFloorOpex = Math.max(0, costProfile.baselineNetworkMonthly * 12 - facilityState.fiber.monthlyCost * 12);
    const networkOpex = (external ? external.annual : 0) + baselineNetworkFloorOpex;
    const laborOpex = targetMw * 12000;
    const modeledGpuHours = totalGpus * 8760 * (serving ? serving.util : 0.35);
    const softwareOpex = totalGpus * costProfile.osCostPerGpuYear;
    const opsMaintOpex = modeledGpuHours * costProfile.opsMaintPerGpuHour;

    const totalFacilityMWh = targetMw * 8760;
    const selfGenPct = clamp((100 - (facilityState.power.sources.fom || 0)) / 100, 0, 1);
    const contractMWh = totalFacilityMWh * (1 - selfGenPct);
    const selfGenMWh = totalFacilityMWh * selfGenPct;
    const nonGridMix = Math.max(1, (facilityState.power.sources.gas || 0) + (facilityState.power.sources.solar || 0) + (facilityState.power.sources.wind || 0) + (facilityState.power.sources.smr || 0));
    const selfGenRateMwh = (
      (facilityState.power.sources.gas || 0) * POWER_SRC.gas.rateMwh +
      (facilityState.power.sources.solar || 0) * POWER_SRC.solar.rateMwh +
      (facilityState.power.sources.wind || 0) * POWER_SRC.wind.rateMwh +
      (facilityState.power.sources.smr || 0) * POWER_SRC.smr.rateMwh
    ) / nonGridMix;
    const annualPowerOpex =
      contractMWh * COST_BASIS.commercialGridUsdPerMWh +
      selfGenMWh * selfGenRateMwh +
      selfGenMWh * ((facilityState.power.sources.gas || 0) / 100) * costProfile.gasOpCostPerMWh;

    const landCost = loc ? facilityState.site.acreage * loc.landPerAcre * (permit ? permit.landMult : 1) * (city ? city.landMult : 1) : 0;
    const permitCost = facilityState.site.estimatedPermitCost;
    const baseContingencyPool =
      landCost +
      permitCost +
      sitePreparationCapex +
      powerGenerationStorageCapex +
      fiberCapex +
      coreFacilityCapex +
      itInfrastructureCapex +
      facilityState.networking.networkingCapex +
      eicCapex;
    const spareInventoryCapex = baseContingencyPool * costProfile.spareInventoryPct;
    const constructionContingencyCapex = (baseContingencyPool + spareInventoryCapex) * costProfile.constructionContingencyPct;
    const mmraCapex = baseContingencyPool * costProfile.mmraPct;
    const contingencyCapex = spareInventoryCapex + constructionContingencyCapex + mmraCapex;

    const capexBreakdown = {
      land: landCost,
      permitting: permitCost,
      sitePreparation: sitePreparationCapex,
      powerGenerationStorage: powerGenerationStorageCapex,
      fiber: fiberCapex,
      coreFacility: coreFacilityCapex,
      itInfrastructure: itInfrastructureCapex,
      networking: facilityState.networking.networkingCapex,
      eic: eicCapex,
      contingency: contingencyCapex,
    };

    const opexCore =
      annualPowerOpex +
      networkOpex +
      dcimOpex +
      laborOpex +
      softwareOpex +
      opsMaintOpex;
    const miscOpex = opexCore * costProfile.miscOpexPct;

    const opexBreakdown = {
      power: annualPowerOpex,
      fiber: facilityState.fiber.monthlyCost * 12,
      dcim: dcimOpex,
      networking: networkOpex,
      labor: laborOpex,
      software: softwareOpex,
      operationsMaintenance: opsMaintOpex,
      misc: miscOpex,
    };

    const totalCapex = sumObjectValues(capexBreakdown);
    const annualOpex = sumObjectValues(opexBreakdown);

    if (Math.abs(totalCapex - sumObjectValues(capexBreakdown)) > 0.01) {
      errors.push("CAPEX INVARIANT FAILED.");
    }

    facilityState.economics.capexBreakdown = capexBreakdown;
    facilityState.economics.opexBreakdown = opexBreakdown;
    facilityState.economics.totalCapex = totalCapex;
    facilityState.economics.annualOpex = annualOpex;
    facilityState.economics.tco3yr = totalCapex + annualOpex * 3;
    facilityState.economics.tco5yr = totalCapex + annualOpex * 5;

    facilityState.validation.errors = errors;
    facilityState.validation.warnings = warnings;
    const validationSig = `${errors.join("|")}::${warnings.join("|")}`;
    if (validationSig !== ui.lastValidationSig) {
      ui.lastValidationSig = validationSig;
      if (errors.length) {
        emitEvent("ERROR_CONSTRAINT_VIOLATION", { errors: [...errors] }, "ERROR");
      } else if (warnings.length) {
        emitEvent("VALIDATION_WARNINGS", { warnings: [...warnings] }, "WARN");
      } else {
        emitEvent("RECALC_COMPLETED", { status: "ok" }, "INFO");
      }
    }

    ui.derived = {
      targetMw,
      targetKw,
      siteMaxMw,
      siteMaxKw,
      itKw,
      facilityKw: procuredKw,
      rackKw,
      totalGpus,
      computeCapex: itInfrastructureCapex,
      blendedRate,
      powerCapex: powerGenerationStorageCapex,
      annualPowerOpex,
      fiberCapex,
      facilityCapex: coreFacilityCapex,
      estimatedMfu,
      switchCount,
      allReduceGBps,
      aggregateGbps,
      perLinkGbps,
      perLinkGBps,
      networkPenalty,
      health,
      uptime,
      gridStress,
      cityGeo: city ? city.geo : (loc ? loc.geo : LOCATION.rural.geo),
      cityLabel: city ? city.label : "UNSET",
      workloadLabel: workload ? workload.label : "UNSET",
      workloadDemandFactor: workload ? workload.demandFactor : 1,
      workloadQueueMult: workload ? workload.queueMult : 1,
      workloadDecodeMult: workload ? workload.decodeMult : 1,
      workloadTpsMult: workload ? workload.tpsMult : 1,
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
      costBasis: "EIA/JLL/C&W",
      costProfileKey: costProfile.label,
      validationErrors: errors,
      validationWarnings: warnings,
    };

    recalcBenchmarks();
    hydrateRackCache();
    syncMapStats();
    facilityState.scenario.updatedAt = new Date().toISOString();
  }

  function enforceLocks() {
    if (!SITE_CITIES[facilityState.site.cityKey]) {
      facilityState.site.cityKey = null;
    }
    if (!WORKLOAD_PROFILES[facilityState.site.workloadProfile]) {
      facilityState.site.workloadProfile = null;
    }

    facilityState.fiber.carriers = [...new Set(facilityState.fiber.carriers.filter((k) => !!CARRIER[k]))].sort();

    if (!FABRIC[facilityState.networking.fabric]) {
      facilityState.networking.fabric = null;
    }
    if (!INTRA_NODE[facilityState.networking.intraNode]) {
      facilityState.networking.intraNode = "nv";
    }

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
    const workload = WORKLOAD_PROFILES[facilityState.site.workloadProfile];

    if (!gpu || !stack || !facilityState.compute.rackCount || !ui.derived.totalGpus) {
      facilityState.benchmarks.ttft = null;
      facilityState.benchmarks.tps = null;
      facilityState.benchmarks.concurrency = null;
      facilityState.benchmarks.mfu = null;
      ui.derived.bench = { ttft: 0, peak: 0, tps: 0, max: 0, mfu: 0, range: "N/A", source: "MODEL", queueMs: 0, rttMs: 0, prefillMs: 0, firstTokenDecodeMs: 0 };
      return;
    }

    const model = MODEL[ui.bench.model];
    const bytes = PRECISION_BYTES[ui.bench.precision] || 1;

    const activeSlice = Math.min(Math.max(1, ui.derived.totalGpus), 256);
    const flops = gpu.pf * 1e15 * activeSlice;
    const mfu = clamp(ui.derived.estimatedMfu, 0.16, 0.9);

    const queueMs = clamp(Math.max(0, ui.bench.conc - 24) * 0.85 * (workload ? workload.queueMult : 1), 0, 3000);
    const rttMs = clamp((ui.derived.extTtft || 8) + (facilityState.fiber.latencyMs || 0), 2, 600);
    const batchScale = Math.max(1, Math.log2(ui.bench.batch + 1));
    const prefillMs = ((ui.bench.prompt * model.p * 2) / (flops * mfu * batchScale)) * 1000 * stack.seedTtft;
    const firstTokenDecodeMs = clamp((model.p / 1e9) * (7.8 / (gpu.pf || 1)) * (1 / Math.max(0.35, stack.seedTps)) * (workload ? workload.decodeMult : 1), 8, 1800);

    const ttft = clamp(rttMs + queueMs + prefillMs + firstTokenDecodeMs, 20, 12000);

    const peak = clamp((flops * mfu) / (model.p * 2 * bytes), 0.1, 50_000_000);
    const outputPenalty = clamp(1 - ui.bench.output / 22000, 0.3, 1);
    const concPenalty = clamp(1 - Math.max(0, ui.bench.conc - 48) / 1600, 0.2, 1);
    const kvPenalty = clamp(Math.max(0, ui.bench.conc - 0.72 * (ui.bench.batch + 1)) / 2200, 0, 0.72);
    const bottleneckTps = peak * stack.seedTps * outputPenalty * concPenalty * (1 - kvPenalty) * (workload ? workload.tpsMult : 1);
    const tps = clamp(Math.min(peak, bottleneckTps), 0.01, peak);

    const totalVram = ui.derived.totalGpus * gpu.vram * 0.78;
    const modelMem = ui.bench.precision === "FP16" ? model.fp16 : ui.bench.precision === "FP8" ? model.fp8 : model.int4;
    const kvPerReq = clamp((ui.bench.prompt / 512) * (model.p / 1e9) * 0.045, 0.5, 420);
    const max = Math.max(1, Math.floor(Math.max(0, totalVram - modelMem) / kvPerReq));

    if (!ui.bench.assumedObservedTps || ui.bench.assumedObservedTps <= 0) {
      ui.bench.assumedObservedTps = clamp(tps * 0.92, 1, tps);
    }

    const observed = ui.bench.calibrationMode
      ? clamp(ui.bench.assumedObservedTps, 1, peak * 1.4)
      : tps;
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
      source: ui.bench.calibrationMode ? "CALIBRATED ASSUMPTION" : "MODEL",
      queueMs,
      rttMs,
      prefillMs,
      firstTokenDecodeMs,
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
    const demand = ui.derived.workloadDemandFactor || 1;
    ui.mapStats.req = Math.max(1, Math.round((facilityState.networking.nodeCount || 1) * 6.4 * demand));
    ui.mapStats.tps = Math.max(1, Math.round((b.tps || 0) * demand * 0.92));
    ui.mapStats.users = Math.max(1, Math.round((facilityState.networking.nodeCount || 1) * 2.2 * demand));
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
    if (phase === 1) return !!(facilityState.site.locationType && facilityState.site.cityKey && facilityState.site.workloadProfile && facilityState.site.acreage && facilityState.site.permittingTrack);
    if (phase === 2) return !!(facilityState.power.targetMW && facilityState.power.redundancyTier && facilityState.power.upsType) && powerTotal() === 100;
    if (phase === 3) return !!(facilityState.fiber.accessType && facilityState.fiber.ixpRegion && facilityState.fiber.carriers.length >= 2);
    if (phase === 4) return !!(facilityState.facility.developerType && facilityState.facility.coolingType && facilityState.facility.powerArchitecture);
    if (phase === 5) return !!(facilityState.compute.gpuModel && facilityState.compute.gpusPerRack && facilityState.compute.inferenceStack && facilityState.compute.servingArch);
    if (phase === 6) return !!(facilityState.networking.intraNode && facilityState.networking.fabric && facilityState.networking.nodeCount && facilityState.networking.externalBandwidth);
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
    el.leftDecisionBody.innerHTML = decisionHtmlForPhase(facilityState.phase);
    renderLeftDecisionStatus();
    syncOpenHelpPopover();
  }

  function renderLeftDecisionStatus() {
    el.leftPhaseTitle.textContent = `PHASE ${facilityState.phase}: ${PHASES[facilityState.phase - 1]}`;
    const blockedByValidation = facilityState.validation.errors.length > 0;
    el.confirmPhaseButton.disabled = ui.deploying.active || facilityState.phase === 8 || !isPhaseComplete(facilityState.phase) || blockedByValidation;
    el.confirmPhaseButton.textContent = facilityState.phase === 8 ? "FACILITY ONLINE" : ui.deploying.active ? "DEPLOYING..." : "CONFIRM";
  }

  function renderLeftMetrics() {
    el.annualOpex.textContent = compactMoney(facilityState.economics.annualOpex);
    el.targetPue.textContent = (facilityState.facility.pue || 2).toFixed(2);
    el.uptimeProjection.textContent = `${(ui.derived.uptime || 0).toFixed(3)}%`;
  }

  function decisionHtmlForPhase(phase) {
    let body = "";
    if (phase === 1) body = decisionPhase1();
    else if (phase === 2) body = decisionPhase2();
    else if (phase === 3) body = decisionPhase3();
    else if (phase === 4) body = decisionPhase4();
    else if (phase === 5) body = decisionPhase5();
    else if (phase === 6) body = decisionPhase6();
    else if (phase === 7) body = decisionPhase7();
    else body = `<div class="info-callout">ALL PHASES COMPLETE. SWITCH BETWEEN MAP/FLOOR VIEW OR ENABLE FULL SCREEN FROM THE CENTER CONTROLS.</div>`;

    const errorHtml = facilityState.validation.errors.map((msg) => `<div class="critical-callout">${esc(msg)}</div>`).join("");
    const warnHtml = facilityState.validation.warnings.map((msg) => `<div class="warning-callout">${esc(msg)}</div>`).join("");
    return `${body}${errorHtml}${warnHtml}`;
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

    const cityOptions = Object.entries(SITE_CITIES)
      .sort((a, b) => a[1].label.localeCompare(b[1].label))
      .map(([key, city]) => `<option value="${key}" ${facilityState.site.cityKey === key ? "selected" : ""}>${city.label} (${city.region})</option>`)
      .join("");

    const workloadCards = Object.entries(WORKLOAD_PROFILES).map(([key, item]) => decisionCard({
      action: "set-workload",
      value: key,
      title: item.label,
      lines: [
        `GOAL: ${item.objective}`,
        item.notes,
        `DEMAND: ${(item.demandFactor * 100).toFixed(0)}% BASELINE`,
      ],
      selected: facilityState.site.workloadProfile === key,
      inspectKind: "workload",
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
    const maxMw = ui.derived.siteMaxMw || acreage * 1.8;
    const util = clamp((ui.derived.targetMw ? (ui.derived.targetMw / maxMw) * 100 : 18 + acreage * 0.12), 5, 98);
    const room = clamp(100 - util, 2, 95);
    const selectedCity = SITE_CITIES[facilityState.site.cityKey];

    return `
      <div class="decision-block">
        <h3 class="decision-heading">DECISION 1 — LOCATION TYPE ${helpPopover("PICKS LAND + ENTITLEMENT CONSTRAINTS. THIS SHAPES BASE LAND COST AND PERMIT FRICTION.")}</h3>
        <div class="option-grid">${locCards}</div>
      </div>
      <div class="decision-block">
        <h3 class="decision-heading">DECISION 2 — DEPLOYMENT CITY ${helpPopover("SELECT THE ACTUAL CITY WHERE THIS FACILITY WILL OPERATE. CITY SETTINGS UPDATE MAP LOCATION, FIBER DISTANCE, AND SITE DENSITY.")}</h3>
        <div class="inline-controls one">
          <label>SITE CITY
            <select data-action="set-site-city" data-inspect-kind="site-city" data-inspect-key="${facilityState.site.cityKey || ""}">
              <option value="">SELECT CITY</option>
              ${cityOptions}
            </select>
          </label>
        </div>
        ${selectedCity ? `<div class="info-callout">REGION: ${selectedCity.region} | FIBER EDGE: ${selectedCity.fiberMiles} MI | GRID EDGE: ${selectedCity.gridMiles} MI | DENSITY: ${selectedCity.maxMwPerAcre.toFixed(2)} MW/ACRE</div>` : ""}
      </div>
      <div class="decision-block">
        <h3 class="decision-heading">DECISION 3 — PRIMARY WORKLOAD ${helpPopover("DEFINES THE OPERATING OBJECTIVE: LOW LATENCY, HIGH THROUGHPUT, OR HIGH CONCURRENCY. THIS SHIFTS BENCHMARK AND LIVE LOAD MODELING.")}</h3>
        <div class="option-grid cols-2">${workloadCards}</div>
      </div>
      <div class="decision-block">
        <h3 class="decision-heading">DECISION 4 — ACREAGE ${helpPopover("SETS MAX SITE CAPACITY ENVELOPE. INCREASING LAND ALLOWS MORE POWER + FUTURE EXPANSION.")}</h3>
        <div class="slider-line" data-inspect-kind="acreage" data-inspect-key="value">
          <div class="top"><span>SITE SIZE</span><strong>${INTEGER.format(acreage)} ACRES</strong></div>
          ${rangeControl({ action: "set-acreage", value: acreage, min: 5, max: 500, step: 1 })}
        </div>
        <div class="info-callout">MAX MW: ${maxMw.toFixed(1)} | UTILIZATION: ${util.toFixed(1)}% | EXPANSION ROOM: ${room.toFixed(1)}%</div>
      </div>
      <div class="decision-block">
        <h3 class="decision-heading">DECISION 5 — PERMITTING TRACK ${helpPopover("PERMIT TRACK DETERMINES TIME-TO-BUILD AND ENTITLEMENT COST PROFILE.")}</h3>
        <div class="option-grid cols-3">${permitCards}</div>
      </div>
    `;
  }

  function decisionPhase2() {
    const sourceSliders = Object.entries(POWER_SRC).map(([key, src]) => `
      <div class="slider-line" data-inspect-kind="power-source" data-inspect-key="${key}">
        <div class="top"><span>${src.label}</span><strong>${facilityState.power.sources[key].toFixed(1)}%</strong></div>
        ${rangeControl({ action: "set-source", value: facilityState.power.sources[key], min: 0, max: 100, step: 1, key })}
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

    const siteMaxMw = ui.derived.siteMaxMw || ((facilityState.site.acreage || 0) * 1.8);
    const overSite = !!facilityState.power.targetMW && facilityState.power.targetMW > siteMaxMw;

    return `
      <div class="decision-block">
        <h3 class="decision-heading">DECISION 1 — POWER SOURCE MIX (TOTAL 100%) ${helpPopover("BLENDS GRID, ONSITE GENERATION, AND STORAGE. TOTAL MUST EQUAL 100% FOR PROCUREMENT MODELING.")}</h3>
        ${sourceSliders}
        ${powerTotal() !== 100 ? `<div class="warning-callout">POWER MIX MUST EQUAL 100%. CURRENT: ${powerTotal()}%</div>` : ""}
      </div>
      <div class="decision-block">
        <h3 class="decision-heading">DECISION 2 — TARGET MW CAPACITY ${helpPopover("SETS THE FACILITY POWER ENVELOPE. HIGHER MW INCREASES CAPEX, QUEUE TIME, AND BUILD COMPLEXITY.")}</h3>
        <select data-action="set-target-mw" data-inspect-kind="target-mw" data-inspect-key="value">
          <option value="">SELECT TARGET CAPACITY</option>
          ${TARGET_MW.map((mw) => {
            const blocked = !facilityState.site.utilityExpansionApproved && mw > siteMaxMw;
            const label = mw >= 1000 ? "1 GW+" : `${mw} MW`;
            return `<option value="${mw}" ${facilityState.power.targetMW === mw ? "selected" : ""} ${blocked ? "disabled" : ""}>${label}${blocked ? " (SITE LIMIT)" : ""}</option>`;
          }).join("")}
        </select>
        <label class="inline-controls one"><span class="muted">ALLOW UTILITY/SITE EXPANSION</span><input type="checkbox" data-action="set-utility-expansion" ${facilityState.site.utilityExpansionApproved ? "checked" : ""} /></label>
        <div class="info-callout">SITE MAX: ${siteMaxMw.toFixed(1)} MW | PROCURED: ${(facilityState.power.targetMW || 0).toFixed(1)} MW | POWER CAPEX: ${compactMoney(ui.derived.powerCapex || 0)} | QUEUE: ${ui.derived.interconnectQueue}</div>
        ${overSite && !facilityState.site.utilityExpansionApproved ? `<div class="critical-callout">PROCURED MW EXCEEDS SITE MAX. ENABLE EXPANSION OR REDUCE TARGET.</div>` : ""}
      </div>
      <div class="decision-block">
        <h3 class="decision-heading">DECISION 3 — REDUNDANCY TIER ${helpPopover("UPTIME TIER DEFINES FAULT TOLERANCE, MAINTAINABILITY, AND BACKUP REQUIREMENTS.")}</h3>
        <div class="option-grid cols-4">${tierCards}</div>
      </div>
      <div class="decision-block">
        <h3 class="decision-heading">DECISION 4 — UPS + STORAGE STACK ${helpPopover("POWER TRANSIENT RESPONSE LAYER. SUPERCAP + BESS IS REQUIRED FOR 800V HVDC / RUBIN TIERS.")}</h3>
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
      <div class="decision-block"><h3 class="decision-heading">DECISION 1 — FIBER ACCESS ${helpPopover("PHYSICAL ENTRY MODEL FOR NETWORK CONNECTIVITY INTO THE SITE.")}</h3><div class="option-grid">${accessCards}</div></div>
      <div class="decision-block"><h3 class="decision-heading">DECISION 2 — CARRIERS (MINIMUM 2) ${helpPopover("MULTI-CARRIER REDUNDANCY REDUCES SINGLE PROVIDER FAILURE RISK.")}</h3><div class="option-grid cols-3">${carrierCards}</div>${facilityState.fiber.carriers.length < 2 ? `<div class="warning-callout">SELECT AT LEAST TWO CARRIERS (SELECTED ${facilityState.fiber.carriers.length}/2).</div>` : `<div class="info-callout">CARRIER REDUNDANCY READY (${facilityState.fiber.carriers.length}/2+).</div>`}</div>
      <div class="decision-block"><h3 class="decision-heading">DECISION 3 — IXP PROXIMITY ${helpPopover("REGIONAL EXCHANGE PROXIMITY DRIVES LAST-MILE LATENCY.")}</h3><div class="option-grid cols-4">${ixpCards}</div></div>
    `;
  }

  function decisionPhase4() {
    const devCards = Object.entries(DEVELOPER).map(([key, item]) => decisionCard({
      action: "set-developer",
      value: key,
      title: item.label,
      lines: [`SHELL: ${compactMoney((item.cost[0] + item.cost[1]) / 2)} / MW`, `BUILD: ${item.months[0]}-${item.months[1]} MO`],
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
    const intraCards = Object.entries(INTRA_NODE).map(([key, item]) => decisionCard({
      action: "set-intra",
      value: key,
      title: item.label,
      lines: [`WITHIN-NODE ONLY`, `BW: ${item.bwGbps} Gbps`, `LATENCY: ${item.us.toFixed(1)} US`],
      selected: facilityState.networking.intraNode === key,
      inspectKind: "intra-node",
      inspectKey: key,
    })).join("");

    const fabricCards = Object.entries(FABRIC).map(([key, item]) => decisionCard({
      action: "set-fabric",
      value: key,
      title: item.label,
      lines: [`PER LINK: ${item.perLinkGbps} Gbps (${gbpsToGBps(item.perLinkGbps).toFixed(1)} GB/S)`, `LATENCY: ${item.us.toFixed(1)} US`, `PREMIUM: ${Math.round((item.premium - 1) * 100)}%`],
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
      <div class="decision-block"><h3>DECISION 1 — INTRA-NODE INTERCONNECT</h3><div class="option-grid cols-3">${intraCards}</div></div>
      <div class="decision-block"><h3>DECISION 2 — SCALE-OUT FABRIC (RACK-TO-RACK)</h3><div class="option-grid cols-3">${fabricCards}</div></div>
      <div class="decision-block"><h3>DECISION 3 — SCALE</h3><div class="slider-line" data-inspect-kind="nodes" data-inspect-key="value"><div class="top"><span>NODES</span><strong>${INTEGER.format(facilityState.networking.nodeCount)}</strong></div>${rangeControl({ action: "set-nodes", value: facilityState.networking.nodeCount, min: 1, max: 1024, step: 1 })}</div><div class="info-callout" title="Internal storage is Gbps. Displayed GB/s is converted by dividing by 8.">SPINE/LEAF SWITCHES: ${INTEGER.format(ui.derived.switchCount || 0)} | PER LINK: ${(ui.derived.perLinkGbps || 0).toFixed(1)} Gbps (${(ui.derived.perLinkGBps || 0).toFixed(1)} GB/S) | AGGREGATE: ${(ui.derived.allReduceGBps || 0).toFixed(1)} GB/S</div></div>
      <div class="decision-block"><h3>DECISION 4 — EXTERNAL CONNECTIVITY</h3><div class="option-grid cols-4">${extCards}</div></div>
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
    const animate = withTransition || ui.pendingCanvasTransition;
    ui.pendingCanvasTransition = false;
    const phase8 = facilityState.phase === 8;
    const mapMode = phase8 && ui.mode === VIEW_MODE.MAP;

    if (!phase8 && ui.immersivePhase8) {
      ui.immersivePhase8 = false;
    }
    applyPhase8Immersive();

    el.canvasTitle.textContent = mapMode ? "LIVE — GLOBAL MAP VIEW" : "LIVE CONSTRUCTION VIEW";
    el.siteStatusTag.style.visibility = facilityState.phase >= 1 && facilityState.site.locationType ? "visible" : "hidden";

    el.viewToggleButton.hidden = !phase8;
    el.fullScreenToggleButton.hidden = !phase8;
    if (phase8) {
      el.viewToggleButton.textContent = ui.mode === VIEW_MODE.MAP ? "[⊞ FLOOR VIEW]" : "[⊕ MAP VIEW]";
      el.fullScreenToggleButton.textContent = ui.immersivePhase8 ? "[EXIT FULL SCREEN]" : "[FULL SCREEN]";
    }

    if (mapMode) {
      el.constructionCanvas.innerHTML = renderMapView(animate);
    } else {
      el.constructionCanvas.innerHTML = renderFloorView(animate);
    }

    setupTravelAnimations(mapMode ? VIEW_MODE.MAP : VIEW_MODE.FLOOR);
  }

  function deriveFloorLayout(phase) {
    const targetMw = ui.derived.targetMw || facilityState.power.targetMW || 10;
    const rackKw = ui.derived.rackKw || 28;
    const coolingType = facilityState.facility.coolingType;
    const denseRackLayout = ["d2c", "immersion"].includes(coolingType) || (facilityState.compute.gpusPerRack || 8) > 8;
    const signature = [
      phase,
      facilityState.site.acreage,
      targetMw.toFixed(2),
      (facilityState.facility.pue || 1.6).toFixed(3),
      facilityState.compute.rackCount || 0,
      rackKw.toFixed(2),
      coolingType || "none",
      facilityState.site.locationType || "unset",
      denseRackLayout ? "dense" : "standard",
    ].join("|");

    if (ui.layoutCache.signature === signature && ui.layoutCache.value) {
      return ui.layoutCache.value;
    }

    const plan = computeFloorplan({
      acreage: facilityState.site.acreage,
      targetMw,
      pue: facilityState.facility.pue || 1.6,
      rackCount: facilityState.compute.rackCount || 0,
      kWPerRack: rackKw,
      coolingType,
      locationType: facilityState.site.locationType,
    });
    const racks = buildRackRects(plan.rooms.dataHall, facilityState.compute.rackCount || 0, { dense: denseRackLayout });
    const networkRows = phase >= 6 ? rackRowPaths(plan.rooms.dataHall, racks) : EMPTY_NETWORK_ROWS;
    const value = { plan, racks, networkRows };

    ui.layoutCache.signature = signature;
    ui.layoutCache.value = value;
    return value;
  }

  function renderFloorView(withTransition) {
    const phase = facilityState.phase;
    const { plan, racks, networkRows } = deriveFloorLayout(phase);
    const zoom = ui.canvas.zoom;
    const stageClass = withTransition ? "floor-stage" : "";

    return `
      <div class="canvas-shell floor-cad ${stageClass}">
        ${renderFloorToolbar()}
        ${renderLayerPanel()}
        <svg id="forge-canvas" class="floor-svg-viewport" viewBox="0 0 ${FLOOR_VIEWBOX.w} ${FLOOR_VIEWBOX.h}" role="img" aria-label="Architectural floor plan">
          <defs>${renderCadDefs()}</defs>
          <rect class="cad-bg" x="0" y="0" width="${FLOOR_VIEWBOX.w}" height="${FLOOR_VIEWBOX.h}"></rect>
          <g id="floor-pan-zoom" transform="translate(${ui.canvas.panX.toFixed(2)} ${ui.canvas.panY.toFixed(2)}) scale(${zoom.toFixed(4)})">
            ${renderCadLayers(plan, racks, networkRows, phase, withTransition)}
          </g>
          ${renderCadFixedOverlay(plan)}
          <g id="travelDots"></g>
        </svg>
      </div>
    `;
  }

  function projectGeoPoint(lon, lat, view = MAP_VIEWBOX) {
    const safeLon = clamp(Number(lon || 0), -180, 180);
    const safeLat = clamp(Number(lat || 0), -85, 85);
    const innerW = view.w - view.padX * 2;
    const innerH = view.h - view.padY * 2;
    const x = view.padX + ((safeLon + 180) / 360) * innerW;
    const y = view.padY + ((90 - safeLat) / 180) * innerH;
    return { x, y };
  }

  function geoPathFromPoints(points, view = MAP_VIEWBOX) {
    if (!points || !points.length) return "";
    const first = projectGeoPoint(points[0][0], points[0][1], view);
    const steps = points.slice(1).map(([lon, lat]) => {
      const pt = projectGeoPoint(lon, lat, view);
      return `L${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
    }).join("");
    return `M${first.x.toFixed(1)} ${first.y.toFixed(1)}${steps}Z`;
  }

  function renderMapGraticule(view = MAP_VIEWBOX) {
    const lonLines = [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150].map((lon) => {
      const a = projectGeoPoint(lon, -60, view);
      const b = projectGeoPoint(lon, 75, view);
      return `<line class="world-graticule" x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}"></line>`;
    }).join("");
    const latLines = [-60, -30, 0, 30, 60].map((lat) => {
      const a = projectGeoPoint(-180, lat, view);
      const b = projectGeoPoint(180, lat, view);
      return `<line class="world-graticule" x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}"></line>`;
    }).join("");
    return `${lonLines}${latLines}`;
  }

  function renderMapView(withTransition) {
    const stageClass = withTransition ? "map-stage" : "";
    const cityGeo = ui.derived.cityGeo || LOCATION.rural.geo;
    const dcPoint = projectGeoPoint(cityGeo.lon, cityGeo.lat);
    const dcx = dcPoint.x;
    const dcy = dcPoint.y;
    const facilityLabel = `${ui.derived.cityLabel || "SITE"} | ${INTEGER.format(ui.derived.totalGpus || 0)} GPUS | ${(ui.derived.targetMw || 0)} MW | ${(facilityState.compute.totalTFLOPS / 1000 || 0).toFixed(1)} PFLOPS`;

    const projectedCities = CITIES.map((city) => ({ ...city, ...projectGeoPoint(city.lon, city.lat) }));
    const worldPaths = (ui.worldPaths && ui.worldPaths.length
      ? ui.worldPaths.map((path) => `<path class="world-land world-outline" d="${path}"></path>`).join("")
      : WORLD_LANDMASSES.map((shape) => `<path class="world-land world-outline" d="${geoPathFromPoints(shape.points)}"></path>`).join(""));

    const reqPaths = projectedCities.map((city, idx) => {
      const ctrl = arcControl(city.x, city.y, dcx, dcy);
      return `<path id="req-${idx}" class="req-arc" d="M${city.x.toFixed(1)} ${city.y.toFixed(1)} Q${ctrl.cx.toFixed(1)} ${ctrl.cy.toFixed(1)} ${dcx.toFixed(1)} ${dcy.toFixed(1)}" data-speed="${0.04 + ctrl.dist * 0.000015}" data-city="${idx}"></path>`;
    }).join("");

    const resPaths = projectedCities.map((city, idx) => {
      const ctrl = arcControl(dcx, dcy, city.x, city.y);
      return `<path id="res-${idx}" class="res-arc" d="M${dcx.toFixed(1)} ${dcy.toFixed(1)} Q${ctrl.cx.toFixed(1)} ${ctrl.cy.toFixed(1)} ${city.x.toFixed(1)} ${city.y.toFixed(1)}" data-speed="${0.035 + ctrl.dist * 0.000012}" data-city="${idx}"></path>`;
    }).join("");

    const cityNodes = projectedCities.map((city, idx) => {
      const vecX = city.x - dcx;
      const vecY = city.y - dcy;
      const vecMag = Math.max(1, Math.hypot(vecX, vecY));
      const tx = city.x + (vecX / vecMag) * 14;
      const ty = city.y + (vecY / vecMag) * 14;
      const anchor = tx >= city.x ? "start" : "end";
      return `
        <g data-inspect-kind="city" data-inspect-key="${idx}">
          <circle id="city-dot-${idx}" class="city-dot" cx="${city.x.toFixed(1)}" cy="${city.y.toFixed(1)}" r="3"></circle>
          <line class="city-label-leader" x1="${city.x.toFixed(1)}" y1="${city.y.toFixed(1)}" x2="${tx.toFixed(1)}" y2="${ty.toFixed(1)}"></line>
          <text class="city-label" x="${tx.toFixed(1)}" y="${(ty - 4).toFixed(1)}" text-anchor="${anchor}">${city.label}</text>
        </g>
      `;
    }).join("");

    return `
      <div class="canvas-shell ${stageClass}">
        <svg viewBox="0 0 ${MAP_VIEWBOX.w} ${MAP_VIEWBOX.h}" role="img" aria-label="Global map routing view">
          <defs>
            <linearGradient id="reqGrad" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#00e5ff"/><stop offset="100%" stop-color="#7c3aed"/></linearGradient>
            <linearGradient id="resGrad" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#7c3aed"/><stop offset="100%" stop-color="#10b981"/></linearGradient>
          </defs>

          <rect x="0" y="0" width="${MAP_VIEWBOX.w}" height="${MAP_VIEWBOX.h}" fill="#090e16"></rect>
          ${renderMapGraticule()}
          ${worldPaths}
          ${reqPaths}
          ${resPaths}
          ${cityNodes}
          <g class="map-legend">
            <rect class="map-legend-frame" x="20" y="${MAP_VIEWBOX.h - 90}" width="260" height="70"></rect>
            <line x1="36" y1="${MAP_VIEWBOX.h - 65}" x2="82" y2="${MAP_VIEWBOX.h - 65}" class="req-arc"></line>
            <text x="90" y="${MAP_VIEWBOX.h - 62}" class="map-legend-text">REQUEST PATH (USER → DC)</text>
            <line x1="36" y1="${MAP_VIEWBOX.h - 44}" x2="82" y2="${MAP_VIEWBOX.h - 44}" class="res-arc"></line>
            <text x="90" y="${MAP_VIEWBOX.h - 41}" class="map-legend-text">RESPONSE PATH (DC → USER)</text>
          </g>

          <g data-action="jump-floor" data-inspect-kind="dc" data-inspect-key="core">
            <circle class="dc-dot" cx="${dcx.toFixed(1)}" cy="${dcy.toFixed(1)}" r="7"></circle>
            <circle cx="${dcx.toFixed(1)}" cy="${dcy.toFixed(1)}" r="16" fill="none" stroke="#00e5ff" stroke-width="1.5" opacity="0.6"></circle>
          </g>
          <text x="${(dcx + 14).toFixed(1)}" y="${(dcy - 8).toFixed(1)}" fill="#bfeaff" font-size="8">${facilityLabel}</text>

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

  function computeFloorplan(decisions) {
    const acreage = clamp(Number(decisions.acreage || 25), 5, 500);
    const siteSqFt = acreage * 43560;
    const siteWidthFt = Math.sqrt(siteSqFt * 1.78);
    const siteDepthFt = siteSqFt / siteWidthFt;
    const siteW = clamp(680 + acreage * 2.2, 680, 1520);
    const siteH = clamp(siteW / 1.78, 390, 860);
    const siteX = (FLOOR_VIEWBOX.w - siteW) / 2;
    const siteY = (FLOOR_VIEWBOX.h - siteH) / 2 + 12;
    const feetToUnit = (siteW - 110) / Math.max(1, siteWidthFt);
    const setback = 50 * feetToUnit;

    const targetMw = clamp(Number(decisions.targetMw || 10), 1, 1000);
    const pue = clamp(Number(decisions.pue || 1.6), 1.05, 2.1);
    const itLoadMw = targetMw / pue;
    const rackCount = Math.max(8, Math.round(Number(decisions.rackCount || 0) || ((itLoadMw * 1000) / Math.max(8, decisions.kWPerRack || 28))));
    const sqFtPerRack = ["d2c", "immersion"].includes(decisions.coolingType) ? 34 : 26;
    const dataFloorSqFt = Math.max(1600, rackCount * sqFtPerRack * 1.6);
    const mechanicalRatio = ["d2c", "immersion"].includes(decisions.coolingType) ? 0.15 : 0.25;
    const totalBuildingSqFt = dataFloorSqFt / Math.max(0.2, 1 - mechanicalRatio - 0.1);

    let buildingWidthFt = Math.sqrt(totalBuildingSqFt * 1.6);
    let buildingDepthFt = totalBuildingSqFt / buildingWidthFt;
    const maxWidthFt = siteWidthFt - 140;
    const maxDepthFt = siteDepthFt - 140;
    const fit = Math.min(1, maxWidthFt / buildingWidthFt, maxDepthFt / buildingDepthFt);
    buildingWidthFt *= fit;
    buildingDepthFt *= fit;

    const buildingW = clamp(buildingWidthFt * feetToUnit, 260, siteW - setback * 2 - 16);
    const buildingH = clamp(buildingDepthFt * feetToUnit, 180, siteH - setback * 2 - 16);
    const buildingX = siteX + (siteW - buildingW) / 2;
    const buildingY = siteY + (siteH - buildingH) / 2;

    const supportBand = clamp(buildingH * 0.23, 64, 138);
    const mechWidth = buildingW * (["d2c", "immersion"].includes(decisions.coolingType) ? 0.2 : 0.28);
    const electricalWidth = buildingW * 0.17;
    const officeWidth = buildingW * 0.12;
    const loadingWidth = buildingW * 0.14;
    const roomY = buildingY + 6;
    const roomH = supportBand - 12;

    const rooms = {
      mechanical: { x: buildingX + 6, y: roomY, w: mechWidth - 10, h: roomH },
      electrical: { x: buildingX + mechWidth, y: roomY, w: electricalWidth - 8, h: roomH },
      office: { x: buildingX + mechWidth + electricalWidth, y: roomY, w: officeWidth - 6, h: roomH },
      loading: { x: buildingX + buildingW - loadingWidth - 6, y: roomY, w: loadingWidth, h: roomH },
      mmr: { x: buildingX + buildingW - loadingWidth - 74, y: roomY + 8, w: 62, h: 24 },
      switchgear: { x: buildingX - 44, y: buildingY + buildingH * 0.26, w: 36, h: 76 },
      dataHall: {
        x: buildingX + 8,
        y: buildingY + supportBand + 8,
        w: buildingW - 16,
        h: buildingH - supportBand - 14,
      },
    };

    return {
      feetToUnit,
      site: { x: siteX, y: siteY, w: siteW, h: siteH, acres: acreage, setback, widthFt: siteWidthFt, depthFt: siteDepthFt },
      building: { x: buildingX, y: buildingY, w: buildingW, h: buildingH },
      rooms,
    };
  }

  function rowCode(index) {
    let n = Math.max(0, index) + 1;
    let out = "";
    while (n > 0) {
      const rem = (n - 1) % 26;
      out = String.fromCharCode(65 + rem) + out;
      n = Math.floor((n - 1) / 26);
    }
    return out;
  }

  function buildRackRects(dataHall, installedCount, options = {}) {
    const installed = Math.max(0, installedCount || 0);
    if (!dataHall || installed <= 0) {
      return { slots: [], aisles: [], rowLabels: [], installed: 0, capacity: 0, manifolds: [], trays: [], pdus: [], clusters: [] };
    }

    const dense = !!options.dense;
    const capacity = Math.max(installed, Math.ceil(installed * 1.26));
    const rowCount = clamp(Math.round(Math.sqrt(capacity / 10)), 2, 26);
    const slotsPerRow = Math.max(8, Math.ceil(capacity / rowCount));

    const innerX = dataHall.x + 10;
    const innerY = dataHall.y + 12;
    const innerW = dataHall.w - 20;
    const innerH = dataHall.h - 20;
    const rowPitch = innerH / rowCount;
    const rackDepth = clamp(rowPitch * (dense ? 0.5 : 0.44), 5, 15);
    const slotPitch = innerW / slotsPerRow;
    const rackWidth = clamp(slotPitch * (dense ? 0.58 : 0.66), 4, 13);

    const slots = [];
    const aisles = [];
    const rowLabels = [];
    const pdus = [];
    const manifolds = [];
    const trays = [];
    let coldIdx = 0;
    let hotIdx = 0;

    for (let row = 0; row < rowCount; row += 1) {
      const y = innerY + row * rowPitch + (rowPitch - rackDepth) / 2;
      const aisleType = row % 2 === 0 ? "cold" : "hot";
      const aisleIdx = aisleType === "cold" ? ++coldIdx : ++hotIdx;
      aisles.push({
        type: aisleType,
        id: `${aisleType === "cold" ? "CA" : "HA"}-${String(aisleIdx).padStart(2, "0")}`,
        x: innerX,
        y: innerY + row * rowPitch,
        w: innerW,
        h: rowPitch,
      });
      rowLabels.push({ label: `ROW-${rowCode(row)}`, short: rowCode(row), x: innerX + 2, y: y - 3, cy: y + rackDepth * 0.5, row });
      pdus.push(
        { x: innerX - 5, y: y + rackDepth * 0.5, type: "left" },
        { x: innerX + innerW + 5, y: y + rackDepth * 0.5, type: "right" },
      );

      for (let col = 0; col < slotsPerRow; col += 1) {
        slots.push({
          x: innerX + col * slotPitch + (slotPitch - rackWidth) / 2,
          y,
          w: rackWidth,
          h: rackDepth,
          row,
          col,
        });
      }

      if (dense && row % 2 === 0) {
        manifolds.push({
          x1: innerX + 4,
          y: innerY + row * rowPitch + rowPitch * 0.22,
          x2: innerX + innerW - 4,
        });
      }
      if (!dense && row % 3 === 0) {
        trays.push({
          x1: innerX + 2,
          y: innerY + row * rowPitch + rowPitch * 0.18,
          x2: innerX + innerW - 2,
        });
      }
    }

    const clusterSize = 4;
    const clusters = [];
    for (let start = 0; start < rowCount; start += clusterSize) {
      clusters.push({
        start,
        end: Math.min(rowCount - 1, start + clusterSize - 1),
      });
    }

    return { slots, aisles, rowLabels, installed, capacity, manifolds, trays, pdus, clusters, rowCount };
  }

  function rackRowPaths(dataHall, rackLayout) {
    if (!rackLayout.slots.length) return EMPTY_NETWORK_ROWS;

    const mda = {
      x: dataHall.x + 14,
      y: dataHall.y + 10,
      w: 92,
      h: 34,
    };
    const spineY = mda.y + mda.h + 8;
    const spine = `<rect class="cad-network-spine" x="${dataHall.x + dataHall.w * 0.16}" y="${spineY}" width="${dataHall.w * 0.68}" height="8"></rect>`;
    const mdaNode = `<g data-inspect-kind="fabric" data-inspect-key="spine"><rect class="cad-network-mda" x="${mda.x}" y="${mda.y}" width="${mda.w}" height="${mda.h}"></rect><text class="cad-small" x="${mda.x + mda.w / 2}" y="${mda.y + mda.h / 2 + 3}" text-anchor="middle">MDA</text></g>`;

    const hdas = [];
    const taps = [];
    const zones = [];
    const leafs = [];
    const paths = [];
    const hdaWidth = 52;
    const hdaHeight = 20;

    rackLayout.clusters.forEach((cluster, idx) => {
      const ratio = (idx + 1) / (rackLayout.clusters.length + 1);
      const hdaX = dataHall.x + dataHall.w * ratio - hdaWidth / 2;
      const hdaY = dataHall.y + 14;
      const hdaCx = hdaX + hdaWidth / 2;
      const hdaCy = hdaY + hdaHeight / 2;

      hdas.push(`<g data-inspect-kind="fabric" data-inspect-key="hda"><rect class="cad-network-hda" x="${hdaX}" y="${hdaY}" width="${hdaWidth}" height="${hdaHeight}"></rect><text class="cad-small" x="${hdaCx}" y="${hdaCy + 3}" text-anchor="middle">HDA-${idx + 1}</text></g>`);
      taps.push(`<circle class="cad-network-tap" cx="${hdaX + hdaWidth + 8}" cy="${hdaCy}" r="2.4"></circle>`);
      zones.push(`<rect class="cad-network-zone" x="${hdaX - 22}" y="${dataHall.y + 50}" width="${hdaWidth + 44}" height="${dataHall.h - 58}"></rect>`);
      leafs.push(`<rect class="cad-network-leaf" x="${hdaX - 10}" y="${hdaY + hdaHeight + 6}" width="8" height="5"></rect><rect class="cad-network-leaf" x="${hdaX + hdaWidth + 2}" y="${hdaY + hdaHeight + 6}" width="8" height="5"></rect>`);
      paths.push(`<path id="hda-${idx}" class="cad-network-path net-path" d="M${mda.x + mda.w} ${spineY + 4}H${hdaCx}V${hdaY}" data-speed="${0.05 + idx * 0.0016}" data-inspect-kind="fabric" data-inspect-key="cabling"></path>`);

      for (let row = cluster.start; row <= cluster.end; row += 1) {
        const rowMeta = rackLayout.rowLabels[row];
        if (!rowMeta) continue;
        const y = rowMeta.cy;
        paths.push(`<path id="net-${idx}-${row}" class="cad-network-path net-path" d="M${hdaCx} ${hdaY + hdaHeight}V${y}H${dataHall.x + 2}M${hdaCx} ${hdaY + hdaHeight}V${y}H${dataHall.x + dataHall.w - 2}" data-speed="${0.053 + row * 0.0011}" data-inspect-kind="fabric" data-inspect-key="cabling"></path>`);
      }
    });

    return {
      paths: paths.join(""),
      spine,
      mda: mdaNode,
      hdas: hdas.join(""),
      taps: taps.join(""),
      zones: zones.join(""),
      leafs: leafs.join(""),
    };
  }

  function renderFloorToolbar() {
    const scalePreset = Object.prototype.hasOwnProperty.call(SCALE_PRESETS, ui.canvas.scalePreset) ? ui.canvas.scalePreset : "fit";
    return `
      <div class="floor-toolbar">
        <div class="floor-toolbar-group">
          <button class="ghost-button floor-btn" type="button" data-canvas-action="toggle-layers">☰ LAYERS ▾</button>
          <button class="ghost-button floor-btn" type="button" data-canvas-action="preset-view" data-preset-key="site">SITE PLAN</button>
          <button class="ghost-button floor-btn" type="button" data-canvas-action="preset-view" data-preset-key="electrical">ELECTRICAL</button>
          <button class="ghost-button floor-btn" type="button" data-canvas-action="preset-view" data-preset-key="cooling">COOLING</button>
          <button class="ghost-button floor-btn" type="button" data-canvas-action="preset-view" data-preset-key="network">NETWORK</button>
        </div>
        <div class="floor-toolbar-group">
          <button class="ghost-button floor-btn floor-zoom" type="button" data-canvas-action="zoom-out">−</button>
          <select class="floor-scale-select" data-canvas-action="scale-select">
            <option value="1:50" ${scalePreset === "1:50" ? "selected" : ""}>1:50</option>
            <option value="1:100" ${scalePreset === "1:100" ? "selected" : ""}>1:100</option>
            <option value="1:200" ${scalePreset === "1:200" ? "selected" : ""}>1:200</option>
            <option value="fit" ${scalePreset === "fit" ? "selected" : ""}>FIT</option>
          </select>
          <button class="ghost-button floor-btn floor-zoom" type="button" data-canvas-action="zoom-in">+</button>
        </div>
        <div class="floor-toolbar-group">
          <button class="ghost-button floor-btn" type="button" data-canvas-action="fullscreen">⤢ FULLSCREEN</button>
          <button class="ghost-button floor-btn" type="button" data-canvas-action="export-drawing">↓ EXPORT SVG</button>
        </div>
      </div>
    `;
  }

  function renderLayerPanel() {
    const cls = ui.canvas.layerPanelOpen ? "open" : "";
    return `<div class="floor-layer-panel ${cls}">
      ${Object.entries(FLOOR_LAYERS).map(([key, label]) => `<button type="button" class="floor-layer-toggle ${ui.canvas.layers[key] ? "on" : ""}" data-canvas-action="toggle-layer" data-layer-key="${key}">${label}</button>`).join("")}
    </div>`;
  }

  function renderCadDefs() {
    return `
      <pattern id="cad-dots" width="12" height="12" patternUnits="userSpaceOnUse">
        <rect width="12" height="12" fill="#f8f8f6"></rect>
        <circle cx="2" cy="2" r="0.7" fill="#d6d6d2"></circle>
      </pattern>
      <pattern id="cad-hatch-mech" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="8" stroke="#c7ccd1" stroke-width="1"></line>
      </pattern>
      <pattern id="cad-hatch-elec" width="8" height="8" patternUnits="userSpaceOnUse">
        <path d="M0 0L8 8M8 0L0 8" stroke="#cdc6d8" stroke-width="0.8"></path>
      </pattern>
      <pattern id="cad-grass" width="10" height="10" patternUnits="userSpaceOnUse">
        <rect width="10" height="10" fill="#1a2c25"></rect>
        <circle cx="2" cy="4" r="0.8" fill="#294938"></circle>
        <circle cx="7" cy="7" r="0.7" fill="#355843"></circle>
      </pattern>
      <filter id="cad-concrete-noise" x="-20%" y="-20%" width="140%" height="140%">
        <feTurbulence baseFrequency="0.9" numOctaves="2" type="fractalNoise" stitchTiles="stitch"></feTurbulence>
        <feColorMatrix type="saturate" values="0"></feColorMatrix>
        <feComponentTransfer><feFuncA type="table" tableValues="0 0.12"></feFuncA></feComponentTransfer>
      </filter>
      <marker id="cad-arrow" markerWidth="6" markerHeight="6" refX="4.5" refY="3" orient="auto">
        <path d="M0 0L6 3L0 6Z" fill="#555555"></path>
      </marker>
    `;
  }

  function layerStyle(key) {
    return ui.canvas.layers[key] ? "" : "display:none;";
  }

  function renderSiteContext(plan, locationType, withTransition) {
    const drawStroke = withTransition ? "draw-stroke" : "";
    const drawFill = withTransition ? "draw-fill" : "";
    const drawLabel = withTransition ? "draw-label" : "";

    if (locationType === "urban") {
      return `
        <rect class="cad-adjacent ${drawFill}" x="${plan.site.x - 140}" y="${plan.site.y + 24}" width="94" height="120"></rect>
        <rect class="cad-adjacent ${drawFill}" x="${plan.site.x - 152}" y="${plan.site.y + 174}" width="106" height="164"></rect>
        <rect class="cad-adjacent ${drawFill}" x="${plan.site.x + plan.site.w + 48}" y="${plan.site.y + 48}" width="96" height="140"></rect>
        <rect class="cad-adjacent ${drawFill}" x="${plan.site.x + plan.site.w + 54}" y="${plan.site.y + 220}" width="104" height="176"></rect>
        <path class="cad-street-grid ${drawStroke}" d="M${plan.site.x - 170} ${plan.site.y - 10}V${plan.site.y + plan.site.h + 20}M${plan.site.x + plan.site.w + 180} ${plan.site.y - 10}V${plan.site.y + plan.site.h + 20}"></path>
      `;
    }
    if (locationType === "repurpose") {
      return `
        <rect class="cad-existing-shell ${drawFill}" x="${plan.site.x + 96}" y="${plan.site.y + 90}" width="${plan.site.w - 192}" height="${plan.site.h - 196}"></rect>
        <text class="cad-room-label ${drawLabel}" x="${plan.site.x + plan.site.w / 2}" y="${plan.site.y + plan.site.h / 2}" text-anchor="middle">DEMO SCOPE</text>
      `;
    }
    if (locationType === "campus") {
      return `
        <path class="cad-campus-road ${drawStroke}" d="M${plan.site.x - 170} ${plan.site.y + 80}H${plan.site.x + plan.site.w + 170}"></path>
        <path class="cad-campus-road ${drawStroke}" d="M${plan.site.x - 170} ${plan.site.y + plan.site.h - 100}H${plan.site.x + plan.site.w + 170}"></path>
        <path class="cad-easement ${drawStroke}" d="M${plan.site.x + 40} ${plan.site.y + 40}L${plan.site.x + plan.site.w - 40} ${plan.site.y + plan.site.h - 40}"></path>
        <path class="cad-easement ${drawStroke}" d="M${plan.site.x + 40} ${plan.site.y + plan.site.h - 40}L${plan.site.x + plan.site.w - 40} ${plan.site.y + 40}"></path>
        <text class="cad-small ${drawLabel}" x="${plan.site.x + plan.site.w - 172}" y="${plan.site.y + 56}">UTILITY EASEMENT</text>
      `;
    }
    return `
      ${Array.from({ length: 8 }, (_, idx) => {
        const y = plan.site.y + 24 + idx * ((plan.site.h - 48) / 7);
        const amp = 8 + (idx % 3) * 3;
        return `<path class="cad-contour ${drawStroke}" d="M${plan.site.x + 14} ${y}C${plan.site.x + plan.site.w * 0.3} ${y - amp}, ${plan.site.x + plan.site.w * 0.7} ${y + amp}, ${plan.site.x + plan.site.w - 12} ${y - amp * 0.4}"></path>`;
      }).join("")}
      ${Array.from({ length: 10 }, (_, idx) => {
        const x = plan.site.x + 38 + (idx % 5) * 16;
        const y = plan.site.y + plan.site.h - 120 + Math.floor(idx / 5) * 20;
        return `<circle class="cad-tree" cx="${x}" cy="${y}" r="5"></circle>`;
      }).join("")}
    `;
  }

  function inspectZone(kind) {
    if (["location", "permit", "acreage"].includes(kind)) return "site";
    if (["target-mw", "tier", "ups", "power-source", "power-substation", "arch"].includes(kind)) return "power";
    if (["fiber-access", "carrier", "ixp", "pop"].includes(kind)) return "fiber";
    if (["developer", "facility"].includes(kind)) return "building";
    if (["cooling", "telemetry"].includes(kind)) return "cooling";
    if (["gpu", "gpr", "stack", "serving", "rack"].includes(kind)) return "racks";
    if (["intra-node", "fabric", "external"].includes(kind)) return "network";
    if (["monitoring", "maintenance"].includes(kind)) return "overlay";
    return null;
  }

  function renderSelectionHighlight(plan) {
    const inspect = ui.hoverInspect || ui.selectedInspect;
    if (!inspect) return "";
    const zone = inspectZone(inspect.kind);
    if (!zone) return "";
    const zones = {
      site: plan.site,
      building: plan.building,
      racks: plan.rooms.dataHall,
      cooling: plan.rooms.mechanical,
      network: plan.rooms.dataHall,
      overlay: plan.site,
      power: { x: plan.site.x + plan.site.w - 270, y: plan.site.y + plan.site.h - 220, w: 250, h: 180 },
      fiber: { x: plan.site.x + plan.site.w - 220, y: plan.site.y - 26, w: 210, h: 160 },
    };
    const rect = zones[zone];
    if (!rect) return "";
    return `<rect class="cad-selection-highlight" x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}"></rect>`;
  }

  function renderCadLayers(plan, racks, networkRows, phase, withTransition) {
    const showSite = phase >= 1;
    const showPower = phase >= 2;
    const showFiber = phase >= 3;
    const showFacility = phase >= 4;
    const showCompute = phase >= 5;
    const showNetwork = phase >= 6;
    const showDcim = phase >= 7;
    const complete = phase >= 8;
    const drawStroke = withTransition ? "draw-stroke" : "";
    const drawFill = withTransition ? "draw-fill" : "";
    const drawLabel = withTransition ? "draw-label" : "";
    const rackLabelOpacity = clamp((ui.canvas.zoom - 0.72) / 0.58, 0, 1);
    const locationType = facilityState.site.locationType || "rural";
    const denseCooling = ["d2c", "immersion"].includes(facilityState.facility.coolingType);
    const utilityLabelMw = Math.max(1, Math.round(ui.derived.targetMw || facilityState.power.targetMW || 10));
    const fiberStrands = Math.max(24, facilityState.fiber.carriers.length * 24);
    const carrierLabel = facilityState.fiber.carriers.map((key) => CARRIER[key]?.label || key).join(" / ") || "UNASSIGNED";

    const utilitySecondary = facilityState.power.sources.fom < 80 && (facilityState.power.sources.gas > 0 || facilityState.power.sources.solar > 0 || facilityState.power.sources.wind > 0);
    const utilityEntries = utilitySecondary
      ? [{ x: plan.site.x + 20, y: plan.site.y + plan.site.h * 0.52 }, { x: plan.site.x + plan.site.w - 20, y: plan.site.y + plan.site.h * 0.46 }]
      : [{ x: plan.site.x + 20, y: plan.site.y + plan.site.h * 0.52 }];

    const powerPads = Array.from({ length: Math.max(0, Math.ceil((ui.derived.targetMw || 0) * ((facilityState.power.sources.gas || 0) / 100) / 20)) }, (_, i) => {
      const row = Math.floor(i / 4);
      const col = i % 4;
      const x = plan.site.x + plan.site.w - 220 + col * 48;
      const y = plan.site.y + plan.site.h - 170 + row * 32;
      return `<g data-inspect-kind="power-source" data-inspect-key="gas"><rect class="cad-concrete-pad ${drawFill}" x="${x}" y="${y}" width="40" height="24"></rect><text class="cad-small ${drawLabel}" x="${x + 20}" y="${y + 15}" text-anchor="middle">GEN-${i + 1}</text></g>`;
    }).join("");

    const rackNodes = showCompute ? racks.slots.map((slot, idx) => {
      const installed = idx < racks.installed;
      const telemetry = ui.rackCache[idx];
      const power = telemetry ? telemetry.powerKw.toFixed(1) : "--";
      const temp = telemetry ? telemetry.temp.toFixed(1) : "--";
      const statusClass = telemetry ? `status-${telemetry.status}` : "";
      return `<g data-inspect-kind="rack" data-inspect-key="${idx + 1}">
        <rect class="cad-rack-slot ${installed ? "installed" : "empty"}" style="${installed ? `animation-delay:${idx * 20}ms;` : ""}" x="${slot.x}" y="${slot.y}" width="${slot.w}" height="${slot.h}"></rect>
        ${installed ? `<rect class="cad-rack-led ${GPU[facilityState.compute.gpuModel || "h100"]?.series || "H"} ${showDcim ? "live" : ""} ${statusClass}" data-rack-id="${idx}" x="${slot.x + slot.w * 0.08}" y="${slot.y + 0.5}" width="${Math.max(1, slot.w * 0.12)}" height="${slot.h - 1}"></rect>` : ""}
        ${showDcim && installed ? `<circle class="cad-sensor" cx="${slot.x + slot.w * 0.78}" cy="${slot.y + slot.h * 0.28}" r="${Math.max(0.9, slot.w * 0.12)}"></circle>` : ""}
        ${installed ? `<text class="cad-rack-meta ${drawLabel}" data-rack-id="${idx}" style="opacity:${rackLabelOpacity};" x="${slot.x + slot.w / 2}" y="${slot.y + slot.h + 7}" text-anchor="middle">${power} KW | ${temp} C</text>` : ""}
      </g>`;
    }).join("") : "";

    const metadata = complete ? `<g class="${drawLabel}">
      <rect class="cad-metadata-bg" x="${FLOOR_VIEWBOX.w - 430}" y="${FLOOR_VIEWBOX.h - 185}" width="340" height="138"></rect>
      <text class="cad-meta-line" x="${FLOOR_VIEWBOX.w - 412}" y="${FLOOR_VIEWBOX.h - 160}">PROJECT: ${esc(facilityState.scenario.name || "THE FORGE")}</text>
      <text class="cad-meta-line" x="${FLOOR_VIEWBOX.w - 412}" y="${FLOOR_VIEWBOX.h - 140}">PHASE: COMPLETE</text>
      <text class="cad-meta-line" x="${FLOOR_VIEWBOX.w - 412}" y="${FLOOR_VIEWBOX.h - 120}">TOTAL CAPACITY: ${(ui.derived.itKw ? kwToMw(ui.derived.itKw) : 0).toFixed(2)} MW IT LOAD</text>
      <text class="cad-meta-line" x="${FLOOR_VIEWBOX.w - 412}" y="${FLOOR_VIEWBOX.h - 100}">TOTAL RACKS: ${INTEGER.format(racks.installed)}</text>
      <text class="cad-meta-line" x="${FLOOR_VIEWBOX.w - 412}" y="${FLOOR_VIEWBOX.h - 80}">PUE: ${(facilityState.facility.pue || 0).toFixed(2)}</text>
      <text class="cad-meta-line" x="${FLOOR_VIEWBOX.w - 412}" y="${FLOOR_VIEWBOX.h - 60}">DRAWN: THE FORGE V1.0</text>
    </g>` : "";

    const corners = [
      { x: plan.site.x, y: plan.site.y },
      { x: plan.site.x + plan.site.w, y: plan.site.y },
      { x: plan.site.x + plan.site.w, y: plan.site.y + plan.site.h },
      { x: plan.site.x, y: plan.site.y + plan.site.h },
    ];

    const cornerMarkers = corners.map((pt) => `<path class="cad-corner-marker" d="M${pt.x - 8} ${pt.y}H${pt.x + 8}M${pt.x} ${pt.y - 8}V${pt.y + 8}"></path>`).join("");

    const roadShoulder = Array.from({ length: 12 }, (_, idx) => {
      const x = plan.site.x - 210 + idx * 18;
      const y0 = plan.site.y + plan.site.h * 0.58 + 2;
      return `<line class="cad-road-shoulder" x1="${x}" y1="${y0}" x2="${x + 7}" y2="${y0 + 11}"></line>`;
    }).join("");

    const columnXCount = Math.max(3, Math.floor((plan.building.w - 36) / 68));
    const columnYCount = Math.max(3, Math.floor((plan.building.h - 32) / 58));
    const columns = [];
    for (let gx = 0; gx <= columnXCount; gx += 1) {
      for (let gy = 0; gy <= columnYCount; gy += 1) {
        const cx = plan.building.x + 18 + (gx * (plan.building.w - 36)) / columnXCount;
        const cy = plan.building.y + 16 + (gy * (plan.building.h - 30)) / columnYCount;
        columns.push(`<circle class="cad-column" cx="${cx}" cy="${cy}" r="2.1"></circle>`);
        if (gx === 0 && gy < 8) {
          columns.push(`<text class="cad-grid-tag ${drawLabel}" x="${cx - 14}" y="${cy + 3}">${rowCode(gy)}${gx + 1}</text>`);
        }
      }
    }

    const doorArc = (x, y, radius, clockwise = true, swing = 1) => {
      const endX = clockwise ? x + radius : x - radius;
      return `<path class="cad-door" d="M${x} ${y}H${endX}M${x} ${y}A${radius} ${radius} 0 0 ${swing} ${endX} ${y + radius}"></path>`;
    };
    const doors = showFacility ? `
      ${doorArc(plan.rooms.loading.x, plan.rooms.loading.y + plan.rooms.loading.h * 0.38, 16, true, 1)}
      ${doorArc(plan.rooms.office.x + plan.rooms.office.w, plan.rooms.office.y + plan.rooms.office.h * 0.64, 12, false, 0)}
      ${doorArc(plan.rooms.mmr.x, plan.rooms.mmr.y + plan.rooms.mmr.h * 0.7, 8, false, 0)}
    ` : "";

    const powerFlow = showPower ? utilityEntries.map((entry, idx) => {
      const targetX = plan.rooms.switchgear.x + plan.rooms.switchgear.w / 2;
      const targetY = plan.rooms.switchgear.y + 14 + idx * 16;
      return `<path class="cad-power-flow live ${drawStroke}" d="M${entry.x} ${entry.y}C${entry.x + 90} ${entry.y - 12}, ${targetX - 30} ${targetY + 12}, ${targetX} ${targetY}"></path>`;
    }).join("") : "";

    const fuelFarm = showPower && facilityState.power.sources.gas > 0 ? `
      <g data-inspect-kind="power-source" data-inspect-key="gas">
        <rect class="cad-concrete-pad ${drawFill}" x="${plan.site.x + plan.site.w - 310}" y="${plan.site.y + plan.site.h - 128}" width="68" height="38"></rect>
        <circle class="cad-fuel-ring" cx="${plan.site.x + plan.site.w - 276}" cy="${plan.site.y + plan.site.h - 109}" r="34"></circle>
        <text class="cad-small ${drawLabel}" x="${plan.site.x + plan.site.w - 308}" y="${plan.site.y + plan.site.h - 138}">FUEL TANK FARM</text>
      </g>
    ` : "";

    const aisleLabels = showCompute ? racks.aisles.map((aisle) => {
      const lx = aisle.type === "cold" ? aisle.x + 4 : aisle.x + aisle.w - 4;
      const anchor = aisle.type === "cold" ? "start" : "end";
      return `<text class="cad-aisle-label ${drawLabel}" x="${lx}" y="${aisle.y + 9}" text-anchor="${anchor}">${aisle.id}</text>`;
    }).join("") : "";

    const rowLabels = showCompute ? racks.rowLabels.map((row) => `<text class="cad-row-label ${drawLabel}" x="${plan.rooms.dataHall.x + 4}" y="${row.cy + 3}">${row.label}</text>`).join("") : "";

    const rackPlumbing = showCompute && denseCooling
      ? racks.manifolds.map((line) => `<line class="cad-manifold ${showDcim && facilityState.dcim.coolingTelemetry ? "live" : ""}" x1="${line.x1}" y1="${line.y}" x2="${line.x2}" y2="${line.y}"></line>`).join("")
      : racks.trays.map((line) => `<line class="cad-tray" x1="${line.x1}" y1="${line.y}" x2="${line.x2}" y2="${line.y}"></line>`).join("");

    const dcimMeters = showDcim ? racks.pdus.map((pdu, idx) => `<rect class="cad-meter" x="${pdu.x - 1.6}" y="${pdu.y - 1.6}" width="3.2" height="3.2" data-inspect-kind="maintenance" data-inspect-key="meter-${idx}"></rect>`).join("") : "";
    const dcimLegend = showDcim ? `
      <g class="${drawLabel}">
        <rect class="cad-legend-bg" x="${plan.site.x + 14}" y="${plan.site.y + plan.site.h - 120}" width="210" height="88"></rect>
        <text class="cad-small" x="${plan.site.x + 24}" y="${plan.site.y + plan.site.h - 96}">LEGEND</text>
        <circle class="cad-sensor" cx="${plan.site.x + 30}" cy="${plan.site.y + plan.site.h - 74}" r="2.5"></circle><text class="cad-small" x="${plan.site.x + 42}" y="${plan.site.y + plan.site.h - 71}">TEMP SENSOR</text>
        <rect class="cad-meter" x="${plan.site.x + 27}" y="${plan.site.y + plan.site.h - 57}" width="5" height="5"></rect><text class="cad-small" x="${plan.site.x + 42}" y="${plan.site.y + plan.site.h - 52}">POWER METER</text>
        <circle class="cad-network-tap" cx="${plan.site.x + 30}" cy="${plan.site.y + plan.site.h - 38}" r="2.5"></circle><text class="cad-small" x="${plan.site.x + 42}" y="${plan.site.y + plan.site.h - 35}">NETWORK TAP</text>
      </g>
    ` : "";

    const completionScene = complete ? `
      <g class="${drawLabel}">
        <path class="cad-human" d="M${plan.rooms.loading.x + 24} ${plan.rooms.loading.y + plan.rooms.loading.h + 18}v12m-4 0h8m-3 -12c0 -2.2 1.8 -4 4 -4s4 1.8 4 4"></path>
        <path class="cad-human" d="M${plan.rooms.loading.x + 46} ${plan.rooms.loading.y + plan.rooms.loading.h + 16}v12m-4 0h8m-3 -12c0 -2.2 1.8 -4 4 -4s4 1.8 4 4"></path>
        <rect class="cad-vehicle" x="${plan.rooms.loading.x + plan.rooms.loading.w - 52}" y="${plan.rooms.loading.y + plan.rooms.loading.h + 4}" width="40" height="14" rx="2"></rect>
        <circle class="cad-vehicle" cx="${plan.rooms.loading.x + plan.rooms.loading.w - 44}" cy="${plan.rooms.loading.y + plan.rooms.loading.h + 20}" r="2.8"></circle>
        <circle class="cad-vehicle" cx="${plan.rooms.loading.x + plan.rooms.loading.w - 22}" cy="${plan.rooms.loading.y + plan.rooms.loading.h + 20}" r="2.8"></circle>
      </g>
    ` : "";

    return `
      <g id="layer-site" style="${layerStyle("site")}">
        ${showSite ? renderSiteContext(plan, locationType, withTransition) : ""}
        ${showSite ? `<rect class="cad-site-boundary ${drawStroke}" x="${plan.site.x}" y="${plan.site.y}" width="${plan.site.w}" height="${plan.site.h}" data-inspect-kind="acreage" data-inspect-key="value"></rect>` : ""}
        ${showSite ? cornerMarkers : ""}
        ${showSite ? `<rect class="cad-setback ${drawStroke}" x="${plan.site.x + plan.site.setback}" y="${plan.site.y + plan.site.setback}" width="${plan.site.w - plan.site.setback * 2}" height="${plan.site.h - plan.site.setback * 2}"></rect>` : ""}
        ${showSite ? `<path class="cad-road ${drawStroke}" d="M${plan.site.x - 240} ${plan.site.y + plan.site.h * 0.58}H${plan.site.x + 8}"></path><path class="cad-road ${drawStroke}" d="M${plan.site.x - 240} ${plan.site.y + plan.site.h * 0.58 + 15}H${plan.site.x + 8}"></path>` : ""}
        ${showSite ? roadShoulder : ""}
        ${showSite ? `<text class="cad-site-area ${drawLabel}" x="${plan.site.x + plan.site.w / 2}" y="${plan.site.y + plan.site.h / 2}" text-anchor="middle">±${plan.site.acres.toFixed(1)} ACRES</text>` : ""}
      </g>
      <g id="layer-building" style="${layerStyle("building")}">
        ${showSite && phase === 1 ? `<rect class="cad-footprint-tbd ${drawStroke}" x="${plan.building.x}" y="${plan.building.y}" width="${plan.building.w}" height="${plan.building.h}"></rect><text class="cad-room-label ${drawLabel}" x="${plan.building.x + plan.building.w / 2}" y="${plan.building.y + plan.building.h / 2 - 8}" text-anchor="middle">FOOTPRINT TBD</text>` : ""}
        ${showPower ? `<rect class="cad-building-shell ${drawStroke}" x="${plan.building.x}" y="${plan.building.y}" width="${plan.building.w}" height="${plan.building.h}" data-inspect-kind="facility" data-inspect-key="shell"></rect>` : ""}
        ${showFacility ? doors : ""}
        ${showFacility ? columns.join("") : ""}
      </g>
      <g id="layer-rooms" style="${layerStyle("rooms")}">
        ${showFacility ? `<rect class="cad-room cad-room-whitehall ${drawFill}" x="${plan.rooms.dataHall.x}" y="${plan.rooms.dataHall.y}" width="${plan.rooms.dataHall.w}" height="${plan.rooms.dataHall.h}"></rect>` : ""}
        ${showFacility ? `<rect class="cad-raised-floor ${drawStroke}" x="${plan.rooms.dataHall.x + 12}" y="${plan.rooms.dataHall.y + 12}" width="${plan.rooms.dataHall.w - 24}" height="${plan.rooms.dataHall.h - 24}"></rect>` : ""}
        ${showFacility ? `<rect class="cad-room cad-room-mechanical ${drawFill}" x="${plan.rooms.mechanical.x}" y="${plan.rooms.mechanical.y}" width="${plan.rooms.mechanical.w}" height="${plan.rooms.mechanical.h}" data-inspect-kind="cooling" data-inspect-key="${facilityState.facility.coolingType || "air"}"></rect>` : ""}
        ${showFacility ? `<rect class="cad-room cad-room-electrical ${drawFill}" x="${plan.rooms.electrical.x}" y="${plan.rooms.electrical.y}" width="${plan.rooms.electrical.w}" height="${plan.rooms.electrical.h}" data-inspect-kind="power-substation" data-inspect-key="mer"></rect>` : ""}
        ${showFacility ? `<rect class="cad-room cad-room-office ${drawFill}" x="${plan.rooms.office.x}" y="${plan.rooms.office.y}" width="${plan.rooms.office.w}" height="${plan.rooms.office.h}"></rect><rect class="cad-room cad-room-loading ${drawFill}" x="${plan.rooms.loading.x}" y="${plan.rooms.loading.y}" width="${plan.rooms.loading.w}" height="${plan.rooms.loading.h}"></rect><rect class="cad-room cad-room-electrical ${drawFill}" x="${plan.rooms.mmr.x}" y="${plan.rooms.mmr.y}" width="${plan.rooms.mmr.w}" height="${plan.rooms.mmr.h}" data-inspect-kind="fiber-access" data-inspect-key="${facilityState.fiber.accessType || "lit"}"></rect>` : ""}
        ${showFacility ? `<text class="cad-room-label ${drawLabel}" x="${plan.rooms.dataHall.x + 12}" y="${plan.rooms.dataHall.y + 18}">DATA FLOOR</text><text class="cad-room-label ${drawLabel}" x="${plan.rooms.mechanical.x + 8}" y="${plan.rooms.mechanical.y + 18}">MECHANICAL</text><text class="cad-room-label ${drawLabel}" x="${plan.rooms.electrical.x + 8}" y="${plan.rooms.electrical.y + 18}">ELECTRICAL</text><text class="cad-room-label ${drawLabel}" x="${plan.rooms.mmr.x + 8}" y="${plan.rooms.mmr.y + 16}">MMR</text><text class="cad-small ${drawLabel}" x="${plan.rooms.dataHall.x + plan.rooms.dataHall.w - 164}" y="${plan.rooms.dataHall.y + 18}">CLG HT: 12'-0"</text>` : ""}
        ${phase >= 4 ? `<text class="cad-room-label ${drawLabel}" x="${plan.building.x + 8}" y="${plan.building.y - 12}">${esc(facilityState.scenario.name || "THE FORGE")} — PHASE 4 COMPLETE</text>` : ""}
      </g>
      <g id="layer-racks" style="${layerStyle("racks")}">
        ${showCompute ? racks.aisles.map((aisle, idx) => `<rect class="cad-aisle ${aisle.type}" x="${aisle.x}" y="${aisle.y}" width="${aisle.w}" height="${aisle.h}"></rect>`).join("") : ""}
        ${aisleLabels}
        ${rowLabels}
        ${showCompute ? rackPlumbing : ""}
        ${rackNodes}
        ${showCompute ? `<text class="cad-rack-count ${drawLabel}" x="${plan.rooms.dataHall.x + 10}" y="${plan.rooms.dataHall.y + plan.rooms.dataHall.h - 12}">${INTEGER.format(racks.installed)} RACKS INSTALLED / ${INTEGER.format(racks.capacity)} CAPACITY</text>` : ""}
      </g>
      <g id="layer-power" style="${layerStyle("power")}">
        ${showPower ? utilityEntries.map((entry) => `<g data-inspect-kind="power-source" data-inspect-key="fom"><circle class="cad-utility-poi ${drawStroke}" cx="${entry.x}" cy="${entry.y}" r="11"></circle><line class="cad-utility-poi ${drawStroke}" x1="${entry.x - 7}" y1="${entry.y - 7}" x2="${entry.x + 7}" y2="${entry.y + 7}"></line><line class="cad-utility-poi ${drawStroke}" x1="${entry.x + 7}" y1="${entry.y - 7}" x2="${entry.x - 7}" y2="${entry.y + 7}"></line><text class="cad-small ${drawLabel}" x="${entry.x + 16}" y="${entry.y - 10}">UTILITY POI — ${utilityLabelMw}MW</text></g>`).join("") : ""}
        ${showPower ? `<rect class="cad-room cad-room-electrical ${drawFill}" x="${plan.rooms.switchgear.x}" y="${plan.rooms.switchgear.y}" width="${plan.rooms.switchgear.w}" height="${plan.rooms.switchgear.h}" data-inspect-kind="power-substation" data-inspect-key="switchgear"></rect>` : ""}
        ${showPower ? `<text class="cad-small ${drawLabel}" x="${plan.rooms.switchgear.x - 6}" y="${plan.rooms.switchgear.y - 8}">SWITCHGEAR</text>` : ""}
        ${powerFlow}
        ${showPower ? powerPads : ""}
        ${fuelFarm}
      </g>
      <g id="layer-cooling" style="${layerStyle("cooling")}">
        ${showFacility ? `<path class="cad-cooling-pipe ${showDcim && facilityState.dcim.coolingTelemetry ? "live" : ""}" d="M${plan.rooms.mechanical.x + plan.rooms.mechanical.w} ${plan.rooms.mechanical.y + plan.rooms.mechanical.h * 0.38}H${plan.rooms.dataHall.x + plan.rooms.dataHall.w - 8}"></path>` : ""}
        ${showFacility ? `<path class="cad-cooling-pipe ${showDcim && facilityState.dcim.coolingTelemetry ? "live" : ""}" d="M${plan.rooms.mechanical.x + plan.rooms.mechanical.w} ${plan.rooms.mechanical.y + plan.rooms.mechanical.h * 0.72}H${plan.rooms.dataHall.x + plan.rooms.dataHall.w - 8}"></path>` : ""}
      </g>
      <g id="layer-annotations" style="${layerStyle("annotations")}">
        ${showSite ? `<line class="cad-dim-ext" x1="${plan.site.x}" y1="${plan.site.y - 30}" x2="${plan.site.x}" y2="${plan.site.y - 10}"></line><line class="cad-dim-ext" x1="${plan.site.x + plan.site.w}" y1="${plan.site.y - 30}" x2="${plan.site.x + plan.site.w}" y2="${plan.site.y - 10}"></line><line class="cad-dim-line" x1="${plan.site.x}" y1="${plan.site.y - 20}" x2="${plan.site.x + plan.site.w}" y2="${plan.site.y - 20}" marker-start="url(#cad-arrow)" marker-end="url(#cad-arrow)"></line><text class="cad-dim-text ${drawLabel}" x="${plan.site.x + plan.site.w / 2}" y="${plan.site.y - 26}" text-anchor="middle">${toFeetInches(plan.site.widthFt)}</text><line class="cad-dim-ext" x1="${plan.site.x + plan.site.w + 28}" y1="${plan.site.y}" x2="${plan.site.x + plan.site.w + 8}" y2="${plan.site.y}"></line><line class="cad-dim-ext" x1="${plan.site.x + plan.site.w + 28}" y1="${plan.site.y + plan.site.h}" x2="${plan.site.x + plan.site.w + 8}" y2="${plan.site.y + plan.site.h}"></line><line class="cad-dim-line" x1="${plan.site.x + plan.site.w + 18}" y1="${plan.site.y}" x2="${plan.site.x + plan.site.w + 18}" y2="${plan.site.y + plan.site.h}" marker-start="url(#cad-arrow)" marker-end="url(#cad-arrow)"></line><text class="cad-dim-text ${drawLabel}" x="${plan.site.x + plan.site.w + 24}" y="${plan.site.y + plan.site.h / 2}" transform="rotate(90 ${plan.site.x + plan.site.w + 24} ${plan.site.y + plan.site.h / 2})" text-anchor="middle">${toFeetInches(plan.site.depthFt)}</text><text class="cad-small ${drawLabel}" x="${plan.site.x + plan.site.setback + 6}" y="${plan.site.y + plan.site.setback - 8}">REQUIRED SETBACK — 50FT</text>` : ""}
        ${showNetwork ? `${networkRows.zones}${networkRows.mda}${networkRows.spine}${networkRows.hdas}${networkRows.leafs}${networkRows.paths}` : ""}
        ${showDcim ? networkRows.taps : ""}
        ${dcimLegend}
        ${metadata}
      </g>
      <g id="layer-overlay" style="${layerStyle("overlay")}">
        ${renderSelectionHighlight(plan)}
        ${showFiber ? `<path class="cad-fiber-run ${drawStroke}" d="M${plan.site.x + plan.site.w - 16} ${plan.site.y + plan.site.h * 0.28}L${plan.rooms.mmr.x + plan.rooms.mmr.w / 2} ${plan.rooms.mmr.y + plan.rooms.mmr.h / 2}"></path><text class="cad-small ${drawLabel}" x="${plan.site.x + plan.site.w - 206}" y="${plan.site.y + plan.site.h * 0.28 - 10}">FIBER ENTRY — ${fiberStrands} STRANDS</text><text class="cad-small ${drawLabel}" x="${plan.rooms.mmr.x + plan.rooms.mmr.w + 10}" y="${plan.rooms.mmr.y + 14}">${carrierLabel}</text><rect class="cad-pop ${drawFill}" x="${plan.site.x + plan.site.w - 28}" y="${plan.site.y + plan.site.h * 0.28 - 10}" width="12" height="12"></rect>` : ""}
        ${showFiber && facilityState.fiber.carriers.length >= 2 ? `<path class="cad-fiber-run ${drawStroke}" d="M${plan.site.x + plan.site.w * 0.22} ${plan.site.y - 14}L${plan.rooms.mmr.x + plan.rooms.mmr.w / 2} ${plan.rooms.mmr.y + plan.rooms.mmr.h / 2}"></path>` : ""}
        ${dcimMeters}
        ${completionScene}
      </g>
    `;
  }

  function renderCadFixedOverlay(plan) {
    const feetPerScreenUnit = (1 / Math.max(0.00001, plan.feetToUnit)) / Math.max(0.45, ui.canvas.zoom);
    const scaleFeet = pickScaleFeet(feetPerScreenUnit * 120);
    const scaleBarWidth = scaleFeet / feetPerScreenUnit;
    return `<g class="cad-fixed-overlay">
      <g class="cad-north-arrow">
        <line x1="${FLOOR_VIEWBOX.w - 110}" y1="${FLOOR_VIEWBOX.h - 156}" x2="${FLOOR_VIEWBOX.w - 110}" y2="${FLOOR_VIEWBOX.h - 108}" stroke="#555555" stroke-width="1.4"></line>
        <path d="M${FLOOR_VIEWBOX.w - 116} ${FLOOR_VIEWBOX.h - 145}L${FLOOR_VIEWBOX.w - 110} ${FLOOR_VIEWBOX.h - 156}L${FLOOR_VIEWBOX.w - 104} ${FLOOR_VIEWBOX.h - 145}" fill="none" stroke="#555555" stroke-width="1.4"></path>
        <text class="cad-small" x="${FLOOR_VIEWBOX.w - 121}" y="${FLOOR_VIEWBOX.h - 95}">N</text>
      </g>
      <g class="cad-scale-bar">
        <line x1="${FLOOR_VIEWBOX.w - 290}" y1="${FLOOR_VIEWBOX.h - 52}" x2="${FLOOR_VIEWBOX.w - 290 + scaleBarWidth}" y2="${FLOOR_VIEWBOX.h - 52}" stroke="#555555" stroke-width="2"></line>
        <line x1="${FLOOR_VIEWBOX.w - 290}" y1="${FLOOR_VIEWBOX.h - 58}" x2="${FLOOR_VIEWBOX.w - 290}" y2="${FLOOR_VIEWBOX.h - 46}" stroke="#555555" stroke-width="1"></line>
        <line x1="${FLOOR_VIEWBOX.w - 290 + scaleBarWidth}" y1="${FLOOR_VIEWBOX.h - 58}" x2="${FLOOR_VIEWBOX.w - 290 + scaleBarWidth}" y2="${FLOOR_VIEWBOX.h - 46}" stroke="#555555" stroke-width="1"></line>
        <text class="cad-small" x="${FLOOR_VIEWBOX.w - 290}" y="${FLOOR_VIEWBOX.h - 64}">${toFeetInches(scaleFeet)} SCALE BAR</text>
      </g>
    </g>`;
  }

  function pickScaleFeet(targetFeet) {
    const choices = [25, 50, 100, 200, 400, 800, 1000, 1500, 2000];
    return choices.find((n) => n >= targetFeet) || 2000;
  }

  function toFeetInches(feetValue) {
    const totalInches = Math.round(Number(feetValue || 0) * 12);
    const ft = Math.floor(totalInches / 12);
    const inches = Math.abs(totalInches % 12);
    return `${ft}'-${String(inches).padStart(2, "0")}"`;
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

    if (mode === VIEW_MODE.FLOOR) {
      const paths = [...svg.querySelectorAll(".net-path")];
      paths.forEach((path, idx) => {
        const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        dot.setAttribute("r", "2.1");
        dot.setAttribute("class", "travel-dot");
        layer.appendChild(dot);
        ui.animItems.push({ type: "network", path, dot, speed: Number(path.dataset.speed || 0.06), offset: idx * 0.15, cityId: null, prev: 0 });
      });
    }

    if (mode === VIEW_MODE.MAP) {
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

    const b = ui.derived.bench || { ttft: 0, peak: 0, tps: 0, max: 0, mfu: 0, range: "N/A", source: "MODEL", queueMs: 0, rttMs: 0, prefillMs: 0, firstTokenDecodeMs: 0 };
    const ttftClass = b.ttft > 500 ? "red" : b.ttft >= 100 ? "amber" : "green";
    const ratio = b.peak > 0 ? clamp((b.tps / b.peak) * 100, 0, 100) : 0;
    const pressure = b.max > 0 ? clamp((ui.bench.conc / b.max) * 100, 0, 100) : 0;

    const mfuColor = b.mfu >= 70 ? "#00e5ff" : b.mfu >= 50 ? "#10b981" : b.mfu >= 30 ? "#f59e0b" : "#ef4444";
    const ring = 2 * Math.PI * 52;
    const ringOffset = ring * (1 - clamp(b.mfu / 100, 0, 1));

    const slots = Math.min(Math.max(b.max, 1), 72);
    const activeSlots = Math.min(slots, ui.bench.conc);
    const slotHtml = Array.from({ length: slots }, (_, i) => `<span class="slot ${i < activeSlots ? "active" : ""} ${pressure >= 80 && i < activeSlots ? "warn" : ""}"></span>`).join("");

    el.benchmarkBody.innerHTML = `
      <div class="benchmark-grid">
        <article class="bench-card">
          <h4 title="TTFT = Time to first token, including network RTT, queueing, prefill, and first-token decode.">TTFT (TIME TO FIRST TOKEN) <span class="muted-pill">${esc(b.source || "MODEL")}</span></h4>
          <div class="inline-controls">
            <label>MODEL SIZE<select data-action="bench-model">${Object.keys(MODEL).map((m) => `<option value="${m}" ${ui.bench.model === m ? "selected" : ""}>${m}</option>`).join("")}</select></label>
            <label>PROMPT TOKENS<select data-action="bench-prompt">${[128, 512, 2048].map((n) => `<option value="${n}" ${ui.bench.prompt === n ? "selected" : ""}>${n}</option>`).join("")}</select></label>
            <label>BATCH SIZE<input type="number" min="1" max="16384" value="${ui.bench.batch}" data-action="bench-batch" /></label>
          </div>
          <div class="value-line"><span>SIMULATED TTFT</span><strong>${b.ttft.toFixed(1)} MS</strong></div>
          <div class="gauge-bar"><span class="gauge-fill ${ttftClass}" style="width:${clamp((b.ttft / 1000) * 100, 2, 100)}%"></span></div>
          <div class="muted">RTT ${Math.round(b.rttMs || 0)}MS + QUEUE ${Math.round(b.queueMs || 0)}MS + PREFILL ${Math.round(b.prefillMs || 0)}MS + DECODE ${Math.round(b.firstTokenDecodeMs || 0)}MS</div>
          <div class="muted">GREEN <100MS | AMBER 100-500MS | RED >500MS</div>
        </article>

        <article class="bench-card">
          <h4 title="TPS = sustained generated tokens per second.">TPS (TOKENS PER SECOND)</h4>
          <div class="inline-controls two">
            <label>OUTPUT LENGTH<input type="number" min="1" max="262144" value="${ui.bench.output}" data-action="bench-output" /></label>
            <label>CONCURRENCY<input type="number" min="1" max="100000" value="${ui.bench.conc}" data-action="bench-conc" /></label>
          </div>
          <div class="value-line"><span>THEORETICAL PEAK</span><strong>${b.peak.toFixed(1)}</strong></div>
          <div class="value-line"><span>ACHIEVED TPS</span><strong>${b.tps.toFixed(1)}</strong></div>
          <div class="value-line"><span>EFFICIENCY</span><strong>${ratio.toFixed(1)}%</strong></div>
          <div class="gauge-bar"><span class="gauge-fill" style="width:${ratio}%"></span></div>
        </article>

        <article class="bench-card ${pressure >= 80 ? "warning-callout" : ""}">
          <h4 title="Max concurrent requests bounded by VRAM and KV cache pressure.">CONCURRENCY</h4>
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
          <h4 title="MFU = effective model FLOP utilization as a percentage of peak FLOPS.">MFU (MODEL FLOP UTILIZATION)</h4>
          <label class="inline-controls one"><span class="muted">CALIBRATION MODE (ASSUMPTION INPUTS)</span><input type="checkbox" data-action="bench-calibration-mode" ${ui.bench.calibrationMode ? "checked" : ""} /></label>
          ${ui.bench.calibrationMode ? `<label>ASSUMED OBSERVED TPS<input type="number" min="1" max="100000000" step="1" value="${Math.max(1, Math.round(ui.bench.assumedObservedTps || 1))}" data-action="bench-assumed-observed" /></label>` : `<div class="muted">OBSERVED TPS IS MODEL OUTPUT (READ-ONLY) WHEN CALIBRATION MODE IS OFF.</div>`}
          <svg class="mfu-ring" viewBox="0 0 124 124">
            <circle class="base" cx="62" cy="62" r="52"></circle>
            <circle class="val" cx="62" cy="62" r="52" stroke="${mfuColor}" style="stroke-dasharray:${ring};stroke-dashoffset:${ringOffset};"></circle>
            <text x="62" y="67" text-anchor="middle" fill="#d9ecff" font-size="14">${b.mfu.toFixed(1)}%</text>
          </svg>
          <div class="value-line"><span>INFERENCE STACK</span><strong>${esc(STACK[facilityState.compute.inferenceStack]?.label || "N/A")}</strong></div>
          <div class="value-line"><span>TYPICAL RANGE</span><strong>${b.range}</strong></div>
          <div class="value-line"><span>MODEL SOURCE</span><strong>${esc(b.source || "MODEL")}</strong></div>
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
    if (phase === 1) {
      return `${LOCATION[facilityState.site.locationType]?.label || "SITE"} / ${SITE_CITIES[facilityState.site.cityKey]?.label || "CITY"} / ${WORKLOAD_PROFILES[facilityState.site.workloadProfile]?.label || "WORKLOAD"} / ${facilityState.site.acreage} ACRES`;
    }
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
    if (phase === 6) return `${INTRA_NODE[facilityState.networking.intraNode]?.label || "INTRA-NODE"} + ${FABRIC[facilityState.networking.fabric]?.label || "FABRIC"} / ${facilityState.networking.nodeCount} NODES / ${EXTERNAL[facilityState.networking.externalBandwidth]?.label || "EXTERNAL"}`;
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
        ["FACILITY LOAD", `${kwToMw(ui.derived.facilityKw || 0).toFixed(2)} MW`],
        ["IT LOAD (AFTER PUE)", `${kwToMw(ui.derived.itKw || 0).toFixed(2)} MW`],
        ["UPTIME PROJECTION", `${(ui.derived.uptime || 0).toFixed(3)}%`],
        ["LATENCY", `${(facilityState.fiber.latencyMs || 0).toFixed(1)} MS`],
        ["CITY", ui.derived.cityLabel || "UNSET"],
        ["WORKLOAD", ui.derived.workloadLabel || "UNSET"],
        ["COST BASIS", ui.derived.costBasis || "MODEL"],
      ],
      metrics: [
        ["POWER CAPEX", compactMoney(facilityState.economics.capexBreakdown.powerGenerationStorage || 0)],
        ["FIBER CAPEX", compactMoney(facilityState.economics.capexBreakdown.fiber || 0)],
        ["FACILITY CAPEX", compactMoney(facilityState.economics.capexBreakdown.coreFacility || 0)],
        ["IT CAPEX", compactMoney(facilityState.economics.capexBreakdown.itInfrastructure || 0)],
      ],
      viz: `<div class="viz-card">${facilityState.phase < 8 ? "UNDER CONSTRUCTION MODE ACTIVE" : ui.mode === VIEW_MODE.MAP ? "VISUAL CONTEXT: GLOBAL TOKEN ROUTING MAP ACTIVE" : "VISUAL CONTEXT: FACILITY FLOOR TELEMETRY ACTIVE"}</div>`,
    };
  }

  function inspectFor(kind, key) {
    if (kind === "site-city") {
      const city = SITE_CITIES[key] || SITE_CITIES[facilityState.site.cityKey];
      if (city) {
        return {
          title: city.label,
          subtitle: "DEPLOYMENT CITY PROFILE",
          rows: [
            ["REGION", city.region],
            ["FIBER EDGE", `${city.fiberMiles} MI`],
            ["GRID EDGE", `${city.gridMiles} MI`],
            ["MAX DENSITY", `${city.maxMwPerAcre.toFixed(2)} MW/ACRE`],
          ],
          metrics: [["PERMIT COST ADD", compactMoney(city.permitCostAdd)], ["LAND MULTIPLIER", `${city.landMult.toFixed(2)}X`]],
          viz: `<div class="viz-card">CITY CHOICE SETS THE PHASE 8 MAP LOCATION AND SITE DENSITY MODEL.</div>`,
        };
      }
    }

    if (kind === "workload") {
      const workload = WORKLOAD_PROFILES[key] || WORKLOAD_PROFILES[facilityState.site.workloadProfile];
      if (workload) {
        return {
          title: workload.label,
          subtitle: "WORKLOAD OBJECTIVE PROFILE",
          rows: [
            ["PRIMARY GOAL", workload.objective],
            ["DEMAND FACTOR", `${(workload.demandFactor * 100).toFixed(0)}%`],
            ["QUEUE MULTIPLIER", `${workload.queueMult.toFixed(2)}X`],
            ["TPS MULTIPLIER", `${workload.tpsMult.toFixed(2)}X`],
          ],
          metrics: [["MFU BIAS", `${(workload.mfuBias * 100).toFixed(1)}%`], ["DECODE MULT", `${workload.decodeMult.toFixed(2)}X`]],
          viz: `<div class="viz-card">${esc(workload.notes)}</div>`,
        };
      }
    }

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

    if (kind === "carrier") {
      const c = CARRIER[key];
      if (c) {
        return {
          title: c.label,
          subtitle: "CARRIER PROFILE",
          rows: [
            ["LATENCY CLASS", c.tier],
            ["MONTHLY MRC", compactMoney(c.mrc)],
            ["QUALITY", `${Math.round(c.quality * 100)}%`],
            ["SELECTED", facilityState.fiber.carriers.includes(key) ? "YES" : "NO"],
          ],
          metrics: [["SELECTED CARRIERS", `${facilityState.fiber.carriers.length}/2+`], ["REDUNDANCY SCORE", ui.derived.redundancyScore?.toFixed(1) || "0.0"]],
          viz: `<div class="viz-card">SELECT AT LEAST TWO CARRIERS FOR PHASE 3 CONFIRM.</div>`,
        };
      }
    }

    if (kind === "intra-node") {
      const n = INTRA_NODE[key];
      if (n) {
        return {
          title: n.label,
          subtitle: "WITHIN-NODE INTERCONNECT",
          rows: [["DOMAIN", "INTRA-NODE ONLY"], ["BANDWIDTH", `${n.bwGbps} Gbps (${gbpsToGBps(n.bwGbps).toFixed(1)} GB/S)`], ["LATENCY", `${n.us.toFixed(1)} US`]],
          metrics: [["MFU IMPACT", `${Math.round(n.mfuAdj * 100)}%`]],
          viz: `<div class="viz-card">INTRA-NODE AND SCALE-OUT FABRIC ARE MODELED SEPARATELY.</div>`,
        };
      }
    }

    if (kind === "fabric") {
      const f = FABRIC[key] || FABRIC[facilityState.networking.fabric];
      if (f) {
        return {
          title: f.label,
          subtitle: "SCALE-OUT FABRIC",
          rows: [
            ["PER LINK", `${f.perLinkGbps.toFixed(1)} Gbps (${gbpsToGBps(f.perLinkGbps).toFixed(1)} GB/S)`],
            ["AGGREGATE", `${(ui.derived.aggregateGbps || 0).toFixed(1)} Gbps (${(ui.derived.allReduceGBps || 0).toFixed(1)} GB/S)`],
            ["LATENCY", `${f.us.toFixed(1)} US`],
          ],
          metrics: [["SWITCH COUNT", INTEGER.format(ui.derived.switchCount || 0)], ["BOTTLENECK RISK", ui.derived.networkRisk || "N/A"]],
          viz: `<div class="viz-card">PER-LINK VS AGGREGATE BANDWIDTH IS SHOWN WITH EXPLICIT UNIT CONVERSION.</div>`,
        };
      }
    }

    return phaseSummaryInspect();
  }

  function latencyClass(latency) {
    if (latency < 5) return "GREEN";
    if (latency <= 20) return "AMBER";
    return "RED";
  }

  function selectFlightDeckProfile(targetMw) {
    if (targetMw <= 25) return FLIGHT_DECK_PROFILES.pilot;
    if (targetMw <= 100) return FLIGHT_DECK_PROFILES.foundation1;
    if (targetMw <= 250) return FLIGHT_DECK_PROFILES.foundation2;
    return FLIGHT_DECK_PROFILES.growth;
  }

  function capexFromPctOfBase(baseCapex, pct) {
    const p = clamp(Number(pct || 0), 0, 0.95);
    if (baseCapex <= 0 || p <= 0) return 0;
    return (baseCapex / (1 - p)) * p;
  }

  function roundToHalf(v) {
    return Math.round(Number(v || 0) * 2) / 2;
  }

  function emitEvent(eventType, payload, level = "INFO") {
    facilityState.events.push({
      scenarioId: facilityState.scenario.id,
      runId: facilityState.runId,
      timestamp: new Date().toISOString(),
      eventType,
      payload,
      level,
    });
    if (facilityState.events.length > 5000) {
      facilityState.events.shift();
    }
  }

  function stableStringify(value) {
    return JSON.stringify(sortDeep(value), null, 2);
  }

  function sortDeep(value) {
    if (Array.isArray(value)) return value.map(sortDeep);
    if (!value || typeof value !== "object") return value;
    const sorted = {};
    Object.keys(value).sort().forEach((k) => {
      sorted[k] = sortDeep(value[k]);
    });
    return sorted;
  }

  function exportActiveDrawing() {
    const svg = el.constructionCanvas.querySelector("svg");
    if (!svg) {
      pushLog("EXPORT FAILED — NO DRAWING IN CANVAS", "warn");
      return;
    }

    try {
      const clone = svg.cloneNode(true);
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
      clone.querySelectorAll(".travel-dot").forEach((node) => node.remove());

      const serialized = new XMLSerializer().serializeToString(clone);
      const payload = `<?xml version="1.0" encoding="UTF-8"?>\n${serialized}\n`;
      const mode = ui.mode === VIEW_MODE.MAP ? "map" : "floor";
      downloadTextFile(`forge-${mode}-${facilityState.scenario.id}.svg`, payload, "image/svg+xml;charset=utf-8");
      pushLog(`DRAWING EXPORTED (${mode.toUpperCase()} SVG)`, "good");
      emitEvent("DRAWING_EXPORTED", { mode, bytes: payload.length }, "INFO");
    } catch (err) {
      const message = err instanceof Error ? err.message : "UNKNOWN EXPORT ERROR";
      pushLog(`EXPORT FAILED — ${message.toUpperCase()}`, "warn");
      emitEvent("ERROR_EXPORT_DRAWING", { reason: message }, "ERROR");
    }
  }

  function downloadTextFile(filename, content, mimeType = "application/json;charset=utf-8") {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    window.setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 1800);
  }

  function parseBoundedNumber(raw, min, max) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    if (n < min || n > max) return null;
    return n;
  }

  function safeEnum(raw, allowed) {
    return allowed.includes(raw) ? raw : null;
  }

  function normalizeCarrierList(raw) {
    if (!Array.isArray(raw)) return [];
    return [...new Set(raw.filter((x) => typeof x === "string" && CARRIER[x]))].sort();
  }

  function normalizeSourceMap(raw) {
    const next = { fom: 0, gas: 0, solar: 0, wind: 0, smr: 0 };
    if (raw && typeof raw === "object") {
      Object.keys(next).forEach((k) => {
        const n = parseBoundedNumber(raw[k], 0, 100);
        next[k] = n === null ? 0 : Math.round(n);
      });
    } else {
      next.fom = 100;
    }
    const total = Object.values(next).reduce((sum, v) => sum + v, 0);
    if (total === 100) return next;
    const biggest = Object.keys(next).reduce((a, b) => (next[b] > next[a] ? b : a), "fom");
    next[biggest] = clamp(next[biggest] + (100 - total), 0, 100);
    return next;
  }

  function sumObjectValues(obj) {
    return Object.values(obj).reduce((sum, v) => sum + Number(v || 0), 0);
  }

  function mwToKw(mw) {
    return Number(mw || 0) * 1000;
  }

  function kwToMw(kw) {
    return Number(kw || 0) / 1000;
  }

  function gbpsToGBps(gbps) {
    return Number(gbps || 0) / 8;
  }

  function cryptoRandomId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    const rand = Math.random().toString(16).slice(2, 10);
    return `forge-${Date.now().toString(16)}-${rand}`;
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
