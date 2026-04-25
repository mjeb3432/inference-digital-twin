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

// ─── Rack data — driven by Forge snapshot ──────────────────────────
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

  const layout = rackLayoutFor(rackCount);
  const racks = [];
  let placed = 0;
  for (const row of layout.rows) {
    for (const col of layout.cols) {
      if (placed >= rackCount) break;
      placed++;
      const id = `RACK-${row}${col}`;
      const cpu = Math.round(rng.range(45, 95));
      const temp = Math.round(rng.range(75, 87));
      const power = rng.range(2.5, 4.5);
      const status = cpu > 85 ? "critical" : cpu > 75 ? "warn" : "online";

      racks.push({
        id,
        row,
        col,
        hostname: `${hostPrefix}-${row.toLowerCase()}${col}-host-01`,
        ip: `10.${(rng.range(1, 50) | 0)}.${(rng.range(1, 255) | 0)}.${(rng.range(100, 200) | 0)}`,
        status,
        led: status,
        cpu,
        temp,
        power,
        rackUnits: 42,
        gpus: gpusPerRack,
        gpuModel,
      });
    }
  }
  return racks;
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
    card.className = `rack-card ${rack === selectedRack ? "selected" : ""}`;
    card.dataset.rackId = rack.id;

    const cpuColor = rack.cpu > 85 ? "critical" : rack.cpu > 75 ? "warn" : "";

    card.innerHTML = `
      <div class="rack-header">
        <span>${rack.id}</span>
        <span class="rack-led ${rack.led}"></span>
      </div>
      <div class="rack-status">${rack.status.toUpperCase()}</div>
      <div>
        <div class="cpu-bar">
          <div class="cpu-bar-fill ${cpuColor}" style="width: ${rack.cpu}%"></div>
        </div>
      </div>
      <div class="rack-metrics">
        <div><strong>CPU</strong> ${rack.cpu}% ${rack.temp}°C ${rack.power.toFixed(1)}kW</div>
        <div><strong>${rack.rackUnits}U</strong> ${rack.gpuModel.split(" ")[0]}×${rack.gpus}</div>
      </div>
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
function startMetricsTicker() {
  setInterval(() => {
    RACKS.forEach((rack) => {
      rack.cpu = Math.round(rack.cpu + rng.range(-5, 10));
      rack.cpu = Math.max(20, Math.min(99, rack.cpu));
      rack.temp = Math.round(rack.temp + rng.range(-2, 3));
    });
    renderRackGrid();
    if (selectedRack) selectRack(selectedRack);
  }, 2000);
}

// ─── Event listeners ──────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  initDashboard();

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
});
