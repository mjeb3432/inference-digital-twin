/**
 * dashboard.js — Rack Floor View
 *
 * Reads the live Forge snapshot from window.ForgeState (populated by
 * forge-state.js + forge.js) so the Dashboard reflects the user's
 * actual build: city, GPU model, rack count, alerts, MW draw, PUE.
 *
 * Falls back to deterministic mock data when no snapshot is present
 * (e.g. user lands on /dashboard before opening the Forge).
 *
 * Cross-tab sync: subscribes to ForgeState changes so the Dashboard
 * updates live when the user is editing in a Forge tab next door.
 */

// ─── Seeded random for deterministic mock data ─────────────────────
class SeededRandom {
  constructor(seed = 12345) {
    this.seed = seed;
  }
  next() {
    const x = Math.sin(this.seed++) * 10000;
    return x - Math.floor(x);
  }
  range(min, max) {
    return min + this.next() * (max - min);
  }
}

const rng = new SeededRandom(42);

// ─── Forge snapshot integration ────────────────────────────────────
function loadSnapshot() {
  try {
    return window.ForgeState ? window.ForgeState.read() : null;
  } catch (_) {
    return null;
  }
}

// Choose row × col layout that comfortably fits N racks
function rackLayoutFor(count) {
  if (count <= 8) return { rows: ["A", "B"], cols: [1, 2, 3, 4] };
  if (count <= 12) return { rows: ["A", "B", "C"], cols: [1, 2, 3, 4] };
  if (count <= 20) return { rows: ["A", "B", "C", "D"], cols: [1, 2, 3, 4, 5] };
  if (count <= 30) return { rows: ["A", "B", "C", "D", "E"], cols: [1, 2, 3, 4, 5, 6] };
  if (count <= 42) return { rows: ["A", "B", "C", "D", "E", "F"], cols: [1, 2, 3, 4, 5, 6, 7] };
  return { rows: ["A", "B", "C", "D", "E", "F", "G", "H"], cols: [1, 2, 3, 4, 5, 6, 7, 8] };
}

// ─── User-controlled ops thresholds ────────────────────────────────
//
// Persisted in localStorage so the user's choices survive page reloads.
// The defaults are tuned to be realistic: 75/90 % CPU and 30/34 °C
// thresholds match what most NOC dashboards (Datadog, NewRelic,
// Cloudwatch) ship with for GPU compute.
const THRESH_DEFAULTS = { cpuWarn: 75, cpuCrit: 90, tempWarn: 30, tempCrit: 34 };
const THRESH_KEY = "dashboard:opsThresholds:v1";

function loadThresholds() {
  try {
    const raw = localStorage.getItem(THRESH_KEY);
    if (!raw) return { ...THRESH_DEFAULTS };
    const parsed = JSON.parse(raw);
    return { ...THRESH_DEFAULTS, ...(parsed || {}) };
  } catch (_) {
    return { ...THRESH_DEFAULTS };
  }
}

function saveThresholds(t) {
  try { localStorage.setItem(THRESH_KEY, JSON.stringify(t)); } catch (_) {}
}

let opsThresholds = loadThresholds();

// ─── Rack data — driven by Forge snapshot ──────────────────────────
//
// Per-rack metrics are now DERIVED from the snapshot, not random:
//
//   * CPU%   = (snapshot MFU × ~80 %) ± per-rack jitter
//              MFU is the fraction of GPU compute actually used by the
//              workload — a realistic reflection of "load" per rack.
//   * Temp   = baseline driven by cooling type (immersion → 18 C,
//              liquid → 22 C, air → 28 C) + small per-rack delta
//              proportional to that rack's CPU loading.
//   * Power  = total MW draw / rack count + ±12 % per-rack jitter
//              (matches what real DC tools show because each rack's
//              actual draw varies with the workload landed on it).
//
// The per-rack jitter is SEEDED by rack index, so the same build always
// shows the same per-rack values — no more numbers that flicker
// every page reload.
function generateRackData(snapshot) {
  const rackCount = snapshot && window.ForgeState
    ? window.ForgeState.deriveRackCount(snapshot)
    : 20;
  const gpuModel = snapshot && window.ForgeState
    ? window.ForgeState.deriveGpuModel(snapshot)
    : "H100 SXM5";
  const gpusPerRack = Number(snapshot?.compute?.gpusPerRack) || 8;
  const dcCode = snapshot && window.ForgeState
    ? window.ForgeState.deriveDcCode(snapshot)
    : "TOR-DC-01";
  const hostPrefix = dcCode.toLowerCase().replace(/[^a-z0-9]/g, "-");

  // Cluster-wide MFU drives the per-rack CPU baseline. If we don't have
  // a benchmark yet, fall back to a moderate 60 % so the page isn't blank.
  const clusterMfu = Number(snapshot?.metrics?.mfu)
    || Number(snapshot?.benchmarks?.mfu)
    || 60;

  // Cooling-type drives the temp baseline.
  const coolingType = String(
    snapshot?.facilityCons?.cooling
    || snapshot?.facility?.coolingType
    || ""
  ).toLowerCase();
  let tempBaseline = 28; // air-cooled
  if (coolingType.includes("immersion")) tempBaseline = 18;
  else if (coolingType.includes("liquid") || coolingType.includes("d2c")) tempBaseline = 22;

  // Total MW → per-rack kW
  const mwDraw = (snapshot && window.ForgeState)
    ? window.ForgeState.deriveMwDraw(snapshot)
    : 3.2;
  const baselinePerRackKw = (mwDraw * 1000) / Math.max(1, rackCount);

  const layout = rackLayoutFor(rackCount);
  const racks = [];
  let placed = 0;
  let idx = 0;
  for (const row of layout.rows) {
    for (const col of layout.cols) {
      if (placed >= rackCount) break;
      placed++;

      // Stable per-rack seed → repeatable jitter across renders
      const seed = stableSeed(`${row}${col}-${rackCount}`);
      const id = `RACK-${row}${col}`;

      // CPU% = MFU-derived load (most racks run near cluster MFU,
      // some hot spots run hotter, some cooler) — clamp 25-99
      const cpu = clamp(Math.round(clusterMfu * (0.78 + seed * 0.45)), 25, 99);

      // Power kW — proportional to load with a small spread
      const power = clamp(baselinePerRackKw * (0.92 + seed * 0.18), 0.5, baselinePerRackKw * 1.4);

      // Temp — air-cooled racks rise more under load than immersion
      const heatRiseFactor = coolingType.includes("immersion") ? 0.12
        : coolingType.includes("liquid") ? 0.18 : 0.32;
      const temp = clamp(
        tempBaseline + (cpu / 100) * (heatRiseFactor * 32) + (seed - 0.5) * 2,
        tempBaseline - 1,
        tempBaseline + 14
      );

      // Status + reason are computed against the user's thresholds
      const { status, reason } = classifyRack(cpu, temp, opsThresholds);

      racks.push({
        id,
        row,
        col,
        hostname: `${hostPrefix}-${row.toLowerCase()}${col}-host-01`,
        ip: `10.${42 + (idx % 24)}.${(seed * 200) | 0}.${100 + (idx % 100)}`,
        status,
        reason,
        led: status,
        cpu,
        temp: Number(temp.toFixed(1)),
        power: Number(power.toFixed(2)),
        rackUnits: 42,
        gpus: gpusPerRack,
        gpuModel,
      });

      idx++;
    }
  }
  return racks;
}

/**
 * Classify a rack against the user's thresholds and return both the
 * severity and a HUMAN-READABLE reason for it. The reason is what we
 * surface on hover so operators can tell "WHY is this critical?"
 * without having to dig through code.
 */
function classifyRack(cpu, temp, t) {
  if (cpu >= t.cpuCrit) {
    return { status: "critical", reason: `CPU at ${cpu}% — at or above the ${t.cpuCrit}% critical threshold (set in Ops Thresholds).` };
  }
  if (temp >= t.tempCrit) {
    return { status: "critical", reason: `Temperature ${temp.toFixed ? temp.toFixed(1) : temp}°C — at or above the ${t.tempCrit}°C critical threshold.` };
  }
  if (cpu >= t.cpuWarn) {
    return { status: "warn", reason: `CPU at ${cpu}% — above the ${t.cpuWarn}% warn threshold (still operational).` };
  }
  if (temp >= t.tempWarn) {
    return { status: "warn", reason: `Temperature ${temp.toFixed ? temp.toFixed(1) : temp}°C — above the ${t.tempWarn}°C warn threshold.` };
  }
  return { status: "online", reason: `All metrics within thresholds (CPU ${cpu}% / Temp ${temp.toFixed ? temp.toFixed(1) : temp}°C).` };
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function stableSeed(key) {
  let h = 0;
  for (let i = 0; i < key.length; i += 1) {
    h = (h * 31 + key.charCodeAt(i)) | 0;
  }
  const v = Math.abs(Math.sin(h * 0.31415));
  return v - Math.floor(v);
}

// ─── Static elements (header, gauges, alerts) ──────────────────────
function applyForgeOverlay(snapshot) {
  if (!snapshot || !window.ForgeState) return;

  const dcCode = window.ForgeState.deriveDcCode(snapshot);
  const cityRaw = window.ForgeState.formatCityLabel(snapshot);
  const cityName = (cityRaw || "Toronto").split(",")[0].trim();
  const headerEl = document.querySelector(".dashboard-left .left-header h2");
  if (headerEl) headerEl.textContent = `${dcCode} · ${cityName}`;

  // Health ring — derive from uptime projection (post-phase-2)
  const uptime = Number(snapshot.power?.uptimeProjection) || 94;
  const ringValue = document.getElementById("healthRingValue");
  const ringStroke = document.getElementById("healthRingStroke");
  if (ringValue) ringValue.textContent = `${Math.round(uptime)}%`;
  if (ringStroke) {
    /* SVG circle r=56 → circumference ~352. Map uptime% → dashoffset. */
    const C = 2 * Math.PI * 56;
    const off = C * (1 - uptime / 100);
    ringStroke.style.strokeDasharray = String(C);
    ringStroke.style.strokeDashoffset = String(off);
  }

  // Power gauge
  const targetMw = Number(snapshot.power?.targetMw) || 5;
  const mwDraw = window.ForgeState.deriveMwDraw(snapshot);
  const powerLabel = document.getElementById("powerGaugeLabel");
  const powerFill = document.getElementById("powerGaugeFill");
  if (powerLabel) powerLabel.textContent = `${mwDraw.toFixed(2)} MW`;
  if (powerFill) {
    const ratio = targetMw > 0 ? Math.min(100, (mwDraw / targetMw) * 100) : 0;
    powerFill.style.width = `${ratio.toFixed(1)}%`;
  }

  // Cooling gauge
  const tempC = window.ForgeState.deriveAvgTemp(snapshot);
  const tempLabel = document.getElementById("tempGaugeLabel");
  const tempFill = document.getElementById("tempGaugeFill");
  if (tempLabel) tempLabel.textContent = `${tempC.toFixed(1)} C`;
  if (tempFill) {
    const ratio = Math.min(100, ((tempC - 16) / (32 - 16)) * 100);
    tempFill.style.width = `${ratio.toFixed(1)}%`;
  }

  // Alerts
  const alertsList = document.getElementById("alertsList");
  if (alertsList) {
    const alerts = window.ForgeState.deriveAlerts(snapshot);
    if (alerts.length) {
      alertsList.innerHTML = alerts
        .map(
          (a) => `
        <div class="alert-item alert-${a.severity}">
          <span class="alert-icon">[${a.severity === "critical" ? "X" : "!"}]</span>
          <div class="alert-text">
            <strong>${a.rackId}</strong><br />
            <small>${a.message}</small>
          </div>
        </div>`
        )
        .join("");
    }
  }

  // Center header — show GPU + workload
  const centerKicker = document.querySelector(".dashboard-center .center-header .kicker");
  const centerTitle = document.querySelector(".dashboard-center .center-header h2");
  const layout = rackLayoutFor(window.ForgeState.deriveRackCount(snapshot));
  const dimText = `${layout.rows.length}×${layout.cols.length}`;
  if (centerKicker) centerKicker.textContent = `RACK FLOOR VIEW · ${snapshot.workloadLabel || snapshot.facility?.workloadLabel || "READY"}`;
  if (centerTitle) {
    const gpuLabel = window.ForgeState.deriveGpuModel(snapshot).replace(/\s+SXM\d?$/, "");
    centerTitle.textContent = `INFERENCE FABRIC — ${dimText} ${gpuLabel} GRID`;
  }
}

// ─── DOM / state ────────────────────────────────────────────────────
let RACKS = [];
let selectedRack = null;
let currentSnapshot = null;

function initDashboard() {
  currentSnapshot = loadSnapshot();

  /* Build-completion gate — Dashboard only opens once the user has
     finished the 8-phase build in the Forge. If they navigate here
     directly we render a full-page lock and bail out. */
  if (window.ForgeState && !window.ForgeState.isBuildComplete()) {
    window.ForgeState.renderLockOverlayIfNeeded({ pageName: "The Dashboard" });
    window.ForgeState.applyNavGate();
    return;
  }
  if (window.ForgeState) window.ForgeState.applyNavGate();

  applyForgeOverlay(currentSnapshot);
  RACKS = generateRackData(currentSnapshot);
  selectedRack = RACKS[0];
  renderRackGrid();
  if (selectedRack) selectRack(selectedRack);
  startMetricsTicker();

  if (window.ForgeState && typeof window.ForgeState.subscribe === "function") {
    window.ForgeState.subscribe((snap) => {
      if (!snap) return;
      currentSnapshot = snap;
      applyForgeOverlay(snap);
      const next = generateRackData(snap);
      RACKS = next;
      const stillThere = selectedRack ? next.find((r) => r.id === selectedRack.id) : null;
      selectedRack = stillThere || next[0] || null;
      renderRackGrid();
      if (selectedRack) selectRack(selectedRack);
    });
  }
}

// ─── Rack grid rendering ───────────────────────────────────────────
function renderRackGrid() {
  const container = document.getElementById("rackGrid");
  if (!container) return;
  container.innerHTML = "";

  RACKS.forEach((rack) => {
    const card = document.createElement("div");
    card.className = `rack-card status-${rack.status} ${rack === selectedRack ? "selected" : ""}`;
    card.dataset.rackId = rack.id;
    /* Native browser tooltip — works without us styling a popover and
     * conveys the WHY without extra UI weight. The same reason is
     * rendered as a small visible badge on warn/critical cards too. */
    card.title = rack.reason;

    const cpuColor =
      rack.cpu >= opsThresholds.cpuCrit ? "critical"
      : rack.cpu >= opsThresholds.cpuWarn ? "warn"
      : "";

    const reasonBadge =
      rack.status !== "online"
        ? `<div class="rack-reason ${rack.status}" data-action="explain-rack" title="${rack.reason}">WHY?</div>`
        : "";

    card.innerHTML = `
      <div class="rack-header">
        <span>${rack.id}</span>
        <span class="rack-led ${rack.led}"></span>
      </div>
      <div class="rack-status ${rack.status}">${rack.status.toUpperCase()}</div>
      <div>
        <div class="cpu-bar">
          <div class="cpu-bar-fill ${cpuColor}" style="width: ${rack.cpu}%"></div>
        </div>
      </div>
      <div class="rack-metrics">
        <div><strong>CPU</strong> ${rack.cpu}% ${rack.temp}°C ${rack.power.toFixed(1)}kW</div>
        <div><strong>${rack.rackUnits}U</strong> ${rack.gpuModel.split(" ")[0]}×${rack.gpus}</div>
      </div>
      ${reasonBadge}
      <div class="rack-chip">INFER ACTIVE</div>
    `;

    card.addEventListener("click", () => selectRack(rack));
    container.appendChild(card);
  });
}

function selectRack(rack) {
  selectedRack = rack;
  document.querySelectorAll(".rack-card").forEach((el) => {
    el.classList.toggle("selected", el.dataset.rackId === rack.id);
  });
  updateInspector();
}

// ─── Inspector update ──────────────────────────────────────────────
function updateInspector() {
  const rack = selectedRack;
  if (!rack) return;
  document.getElementById("inspectorTitle").textContent = rack.id;

  const details = {
    Hostname: rack.hostname,
    "IP Address": rack.ip,
    OS: "Ubuntu 22.04 LTS",
    Uptime: `${Math.round(rng.range(100, 300))}d ${Math.round(rng.range(0, 24))}h ${Math.round(rng.range(0, 60))}m`,
    "Last Ping": `${Math.round(rng.range(1, 10))}ms ago`,
    Firmware: "2024.Q1.19",
    GPU: `${rack.gpuModel} ×${rack.gpus}`,
  };

  const detailsEl = document.getElementById("assetDetails");
  detailsEl.innerHTML = Object.entries(details)
    .map(
      ([key, val]) =>
        `<div class="kv-pair"><span class="key">${key}</span><span class="value mono">${val}</span></div>`
    )
    .join("");

  updateMetrics();
}

// ─── Metrics update ────────────────────────────────────────────────
function updateMetrics() {
  const rack = selectedRack;
  if (!rack) return;

  // Prefer snapshot-driven values when present so the live metrics
  // line up with the user's Forge build
  const snap = currentSnapshot;
  const tps = snap && window.ForgeState ? window.ForgeState.deriveTokensPerSec(snap) : 124500;
  const tokensPerSecK = (tps / 1000).toFixed(1);
  const gpuTemp = Math.round(rack.temp + rng.range(-2, 5));
  const memBW = rng.range(1.5, 2.0).toFixed(1);
  const latency = Math.round(rng.range(800, 950));
  const fanSpeed = Math.round(rng.range(60, 75));
  const psuEff = rng.range(92, 96).toFixed(1);

  const metricsEls = document.querySelectorAll(".live-metric");
  if (metricsEls.length >= 6) {
    metricsEls[0].querySelector(".metric-value").textContent = `${tokensPerSecK}k`;
    metricsEls[1].querySelector(".metric-value").textContent = `${gpuTemp}°C`;
    metricsEls[2].querySelector(".metric-value").textContent = `${memBW} TB/s`;
    metricsEls[3].querySelector(".metric-value").textContent = `${latency}ns`;
    metricsEls[4].querySelector(".metric-value").textContent = `${fanSpeed}%`;
    metricsEls[5].querySelector(".metric-value").textContent = `${psuEff}%`;
  }
}

// ─── Metrics ticker ────────────────────────────────────────────────
//
// The previous ticker was wildly unbounded (rack.cpu drifted +/- 5-10
// every 2s, status flipped randomly between online/warn/critical). That
// made the dashboard feel chaotic and made the warning explanations
// unstable: by the time a user mouse-hovered a critical rack to see
// why it was critical, it had already drifted back to online.
//
// New ticker: a small mean-reverting wobble around each rack's
// snapshot-derived baseline, recomputing status against the user's
// thresholds on every tick. Cleaner UX + the explanations stay valid.
function startMetricsTicker() {
  setInterval(() => {
    RACKS.forEach((rack) => {
      // Anchor each rack to its derived baseline; wobble is < ±3 percentage
      // points and < ±1 °C — enough to feel alive, not enough to flip status.
      const cpuBase = rack._cpuBase || rack.cpu;
      rack._cpuBase = cpuBase;
      const tempBase = rack._tempBase || rack.temp;
      rack._tempBase = tempBase;

      const cpuJitter = (Math.random() - 0.5) * 5;        // ±2.5 pp
      const tempJitter = (Math.random() - 0.5) * 1.4;     // ±0.7 °C

      rack.cpu = clamp(Math.round(cpuBase + cpuJitter), 20, 99);
      rack.temp = clamp(Number((tempBase + tempJitter).toFixed(1)), 14, 60);

      const { status, reason } = classifyRack(rack.cpu, rack.temp, opsThresholds);
      rack.status = status;
      rack.led = status;
      rack.reason = reason;
    });
    renderRackGrid();
    if (selectedRack) {
      // Re-pick the same rack so its inspector reflects the new metrics
      const same = RACKS.find((r) => r.id === selectedRack.id);
      if (same) selectRack(same);
    }
  }, 2000);
}

// Recompute classification on every rack against the current thresholds.
// Called when the user changes a threshold value.
function reclassifyAllRacks() {
  RACKS.forEach((r) => {
    const { status, reason } = classifyRack(r.cpu, r.temp, opsThresholds);
    r.status = status;
    r.led = status;
    r.reason = reason;
  });
  renderRackGrid();
  if (selectedRack) {
    const same = RACKS.find((r) => r.id === selectedRack.id);
    if (same) selectRack(same);
  }
}

// ─── 3D Live view ──────────────────────────────────────────────────
//
// The Dashboard's center pane has two view modes:
//   "cards"  — the existing rack-card grid with WHY badges
//   "3d"     — the same Three.js facility model the Forge renders,
//              mounted live so the user can orbit/inspect their
//              actual build from the operations dashboard.
//
// We need the user's facility plan to mount the 3D scene. Since the
// dashboard isn't part of the Forge IIFE, we re-run a tiny piece of
// the floor-plan math here (matching what `computeFloorplan` returns
// in the Forge) so the building outline + room layout match.
let dashboard3dHandle = null;
let currentDashboardView = "cards";

function approximatePlanForDashboard(snapshot) {
  /* Match the Forge's `computeFloorplan` for a default reasonable
   * Phase-8 layout. The Dashboard always renders against a completed
   * build (gated by isBuildComplete) so we use the snapshot's known
   * mw + rack count for sizing. */
  const acreage = 25;
  const targetMw = Number(snapshot?.power?.targetMw) || 10;
  const rackCount = (snapshot && window.ForgeState
    ? window.ForgeState.deriveRackCount(snapshot)
    : 20) || 20;
  const coolingType = (snapshot?.facilityCons?.cooling || "air").toLowerCase();

  const VIEW_W = 1800, VIEW_H = 1100;
  const siteW = clamp(680 + acreage * 2.2, 680, 1520);
  const siteH = clamp(siteW / 1.78, 390, 860);
  const siteX = (VIEW_W - siteW) / 2;
  const siteY = (VIEW_H - siteH) / 2 + 12;
  const setback = 50;
  const buildingW = clamp(siteW * 0.62, 260, siteW - setback * 2 - 16);
  const buildingH = clamp(siteH * 0.62, 180, siteH - setback * 2 - 16);
  const buildingX = siteX + (siteW - buildingW) / 2;
  const buildingY = siteY + (siteH - buildingH) / 2;
  const supportBand = clamp(buildingH * 0.23, 64, 138);
  const mechWidth = buildingW * (["d2c", "immersion"].includes(coolingType) ? 0.2 : 0.28);
  const electricalWidth = buildingW * 0.17;
  const officeWidth = buildingW * 0.12;
  const loadingWidth = buildingW * 0.14;
  const roomY = buildingY + 6;
  const roomH = supportBand - 12;
  const rooms = {
    mechanical:  { x: buildingX + 6, y: roomY, w: mechWidth - 10, h: roomH },
    electrical:  { x: buildingX + mechWidth, y: roomY, w: electricalWidth - 8, h: roomH },
    office:      { x: buildingX + mechWidth + electricalWidth, y: roomY, w: officeWidth - 6, h: roomH },
    loading:     { x: buildingX + buildingW - loadingWidth - 6, y: roomY, w: loadingWidth, h: roomH },
    mmr:         { x: buildingX + buildingW - loadingWidth - 74, y: roomY + 8, w: 62, h: 24 },
    switchgear:  { x: buildingX - 44, y: buildingY + buildingH * 0.26, w: 36, h: 76 },
    dataHall:    { x: buildingX + 8, y: buildingY + supportBand + 8, w: buildingW - 16, h: buildingH - supportBand - 14 },
  };
  return {
    site: { x: siteX, y: siteY, w: siteW, h: siteH, acres: acreage, setback },
    building: { x: buildingX, y: buildingY, w: buildingW, h: buildingH },
    rooms,
  };
}

function approximateRacksForDashboard(plan, rackCount, coolingType) {
  const dh = plan.rooms.dataHall;
  if (!dh || rackCount <= 0) {
    return { slots: [], aisles: [], rowLabels: [], pdus: [], manifolds: [], trays: [], clusters: [], rowCount: 0, installed: 0, capacity: 0 };
  }
  const dense = ["d2c", "immersion"].includes(coolingType);
  const capacity = Math.max(rackCount, Math.ceil(rackCount * 1.26));
  const rowCount = clamp(Math.round(Math.sqrt(capacity / 10)), 2, 26);
  const slotsPerRow = Math.max(8, Math.ceil(capacity / rowCount));
  const innerX = dh.x + 10, innerY = dh.y + 12;
  const innerW = dh.w - 20, innerH = dh.h - 20;
  const rowPitch = innerH / rowCount;
  const rackDepth = clamp(rowPitch * (dense ? 0.5 : 0.44), 5, 15);
  const slotPitch = innerW / slotsPerRow;
  const rackWidth = clamp(slotPitch * (dense ? 0.58 : 0.66), 4, 13);
  const slots = [], aisles = [], rowLabels = [], clusters = [];
  for (let row = 0; row < rowCount; row++) {
    const y = innerY + row * rowPitch + (rowPitch - rackDepth) / 2;
    aisles.push({
      type: row % 2 === 0 ? "cold" : "hot",
      id: `${row % 2 === 0 ? "CA" : "HA"}-${String(row + 1).padStart(2, "0")}`,
      x: innerX, y: innerY + row * rowPitch, w: innerW, h: rowPitch,
    });
    rowLabels.push({ row, x: innerX + 2, y: y - 3, cy: y + rackDepth / 2, label: `ROW-${row}`, short: String(row) });
    for (let col = 0; col < slotsPerRow; col++) {
      slots.push({
        x: innerX + col * slotPitch + (slotPitch - rackWidth) / 2,
        y, w: rackWidth, h: rackDepth, row, col,
      });
    }
  }
  for (let i = 0; i < rowCount; i += 4) clusters.push({ start: i, end: Math.min(rowCount - 1, i + 3) });
  return { slots, aisles, rowLabels, pdus: [], manifolds: [], trays: [], clusters, rowCount, installed: rackCount, capacity };
}

async function mountDashboard3D() {
  if (!window.Forge3D) {
    console.warn("[dashboard 3D] Forge3D not loaded yet");
    return;
  }
  const host = document.getElementById("dashboard3dHost");
  if (!host) return;
  if (dashboard3dHandle) {
    try { dashboard3dHandle.dispose(); } catch (_) {}
    dashboard3dHandle = null;
  }
  const snap = currentSnapshot || loadSnapshot();
  const coolingType = (snap?.facilityCons?.cooling || "air").toLowerCase();
  const plan = approximatePlanForDashboard(snap);
  const rackCount = window.ForgeState ? window.ForgeState.deriveRackCount(snap) : 32;
  const racks = approximateRacksForDashboard(plan, rackCount, coolingType);

  try {
    dashboard3dHandle = await window.Forge3D.mountForge3DInto({
      container: host,
      plan, racks, phase: 8,
      powerMix: { fom: 100, gas: 0, solar: 0, wind: 0, smr: 0 },
      coolingType,
      targetMw: Number(snap?.power?.targetMw) || 10,
      locationType: "rural",
      gpuModel: snap?.compute?.gpuModel || "h100",
    });
    const loading = host.querySelector(".dashboard-3d-loading");
    if (loading) loading.remove();
  } catch (e) {
    console.error("[dashboard 3D] mount failed:", e);
  }
}

function setDashboardView(view) {
  if (view === currentDashboardView) return;
  currentDashboardView = view;
  const grid = document.getElementById("rackGrid");
  const host = document.getElementById("dashboard3dHost");
  if (!grid || !host) return;
  if (view === "3d") {
    grid.hidden = true;
    host.hidden = false;
    mountDashboard3D();
  } else {
    grid.hidden = false;
    host.hidden = true;
    if (dashboard3dHandle) {
      try { dashboard3dHandle.dispose(); } catch (_) {}
      dashboard3dHandle = null;
    }
  }
  document.querySelectorAll(".view-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === view);
    btn.setAttribute("aria-selected", String(btn.dataset.view === view));
  });
}

// ─── Event listeners ──────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  initDashboard();

  /* Wire the CARDS / 3D LIVE toggle */
  document.querySelectorAll(".view-btn").forEach((btn) => {
    btn.addEventListener("click", () => setDashboardView(btn.dataset.view));
  });

  // Reflect saved threshold values into the inputs on load
  syncThresholdInputs();

  document.querySelectorAll("[data-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.parentElement.querySelectorAll("[data-preset]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });

  document.querySelectorAll(".toggle-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.parentElement.querySelectorAll(".toggle-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });

  document.querySelectorAll(".action-buttons .confirm-button").forEach((btn) => {
    btn.addEventListener("click", () => {
      // Visual feedback: brief active state
      btn.classList.add("flash");
      setTimeout(() => btn.classList.remove("flash"), 220);
    });
  });

  document.querySelectorAll(".slider-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = btn.closest(".slider-container").querySelector(".slider-input");
      if (!input) return;
      const delta = parseInt(btn.dataset.delta, 10) || 0;
      const min = parseInt(input.min, 10);
      const max = parseInt(input.max, 10);
      input.value = Math.max(min, Math.min(max, parseInt(input.value, 10) + delta));
    });
  });

  // Threshold inputs — apply on every keystroke + persist on blur.
  document.querySelectorAll('[data-threshold]').forEach((input) => {
    input.addEventListener('input', () => {
      const key = input.dataset.threshold;
      const n = Number(input.value);
      if (!Number.isFinite(n)) return;
      opsThresholds[key] = n;
      saveThresholds(opsThresholds);
      reclassifyAllRacks();
    });
  });

  // Reset button — restore defaults and propagate
  const resetBtn = document.getElementById('thresholdsReset');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      opsThresholds = { ...THRESH_DEFAULTS };
      saveThresholds(opsThresholds);
      syncThresholdInputs();
      reclassifyAllRacks();
    });
  }

  // "?" help toggle
  const helpBtn = document.getElementById('thresholdsHelpBtn');
  const helpBody = document.getElementById('thresholdsHelpBody');
  if (helpBtn && helpBody) {
    helpBtn.addEventListener('click', () => {
      const open = helpBody.hasAttribute('hidden');
      if (open) {
        helpBody.removeAttribute('hidden');
        helpBtn.setAttribute('aria-expanded', 'true');
      } else {
        helpBody.setAttribute('hidden', '');
        helpBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // Click-to-explain on the WHY? badge — toast-style explanation.
  document.addEventListener('click', (e) => {
    const why = e.target.closest('[data-action="explain-rack"]');
    if (!why) return;
    e.stopPropagation();
    const card = why.closest('.rack-card');
    const id = card?.dataset.rackId;
    const rack = RACKS.find((r) => r.id === id);
    if (rack) showWhyToast(rack);
  });
});

function syncThresholdInputs() {
  document.querySelectorAll('[data-threshold]').forEach((input) => {
    const key = input.dataset.threshold;
    if (opsThresholds[key] != null) input.value = opsThresholds[key];
  });
}

let whyToastTimer = null;
function showWhyToast(rack) {
  let toast = document.getElementById('whyToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'whyToast';
    toast.className = 'why-toast';
    document.body.appendChild(toast);
  }
  toast.innerHTML = `
    <div class="why-toast-head">${rack.id} &middot; ${rack.status.toUpperCase()}</div>
    <div class="why-toast-body">${rack.reason}</div>
    <div class="why-toast-foot">Adjust the threshold values in the OPS THRESHOLDS panel on the left.</div>`;
  toast.classList.add('open');
  if (whyToastTimer) clearTimeout(whyToastTimer);
  whyToastTimer = setTimeout(() => toast.classList.remove('open'), 5500);
}
