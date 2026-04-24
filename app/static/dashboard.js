/**
 * dashboard.js — Rack Floor View
 * Deterministic mock data with seeded randomness
 */

// ─── Seeded Random for Deterministic Data ──────────────────────────
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

// ─── Rack Data ───────────────────────────────────────────────────────
const RACK_ROWS = ['A', 'B', 'C', 'D'];
const RACK_COLS = [1, 2, 3, 4, 5];

function generateRackData() {
  const racks = [];
  for (const row of RACK_ROWS) {
    for (const col of RACK_COLS) {
      const id = `RACK-${row}${col}`;
      const cpu = Math.round(rng.range(45, 95));
      const temp = Math.round(rng.range(75, 87));
      const power = rng.range(2.5, 4.5);
      const status = cpu > 85 ? 'critical' : cpu > 75 ? 'warn' : 'online';
      const led = cpu > 85 ? 'critical' : cpu > 75 ? 'warn' : 'online';

      racks.push({
        id,
        row,
        col,
        hostname: `infer-${row.toLowerCase()}${col}-host-01`,
        ip: `10.1.${rng.range(1, 255)|0}.${rng.range(100, 200)|0}`,
        status,
        led,
        cpu,
        temp,
        power,
        rackUnits: 42,
        gpus: 8,
        gpuModel: 'H100 SXM5',
      });
    }
  }
  return racks;
}

const RACKS = generateRackData();

// ─── DOM Setup ────────────────────────────────────────────────────────
let selectedRack = RACKS[0];

function initDashboard() {
  renderRackGrid();
  selectRack(RACKS[0]);
  startMetricsTicker();
}

// ─── Rack Grid Rendering ──────────────────────────────────────────────
function renderRackGrid() {
  const container = document.getElementById('rackGrid');
  container.innerHTML = '';

  RACKS.forEach((rack) => {
    const card = document.createElement('div');
    card.className = `rack-card ${rack === selectedRack ? 'selected' : ''}`;
    card.dataset.rackId = rack.id;

    const cpuColor = rack.cpu > 85 ? 'critical' : rack.cpu > 75 ? 'warn' : '';

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
        <div><strong>${rack.rackUnits}U</strong> H100×${rack.gpus}</div>
      </div>
      <div class="rack-chip">INFER ACTIVE</div>
    `;

    card.addEventListener('click', () => selectRack(rack));
    container.appendChild(card);
  });
}

function selectRack(rack) {
  selectedRack = rack;
  document.querySelectorAll('.rack-card').forEach((el) => {
    el.classList.toggle('selected', el.dataset.rackId === rack.id);
  });
  updateInspector();
}

// ─── Inspector Update ──────────────────────────────────────────────────
function updateInspector() {
  const rack = selectedRack;
  document.getElementById('inspectorTitle').textContent = rack.id;

  const details = {
    Hostname: rack.hostname,
    'IP Address': rack.ip,
    OS: 'Ubuntu 22.04 LTS',
    Uptime: `${Math.round(rng.range(100, 300))}d ${Math.round(rng.range(0, 24))}h ${Math.round(rng.range(0, 60))}m`,
    'Last Ping': `${Math.round(rng.range(1, 10))}ms ago`,
    Firmware: '2024.Q1.19',
  };

  const detailsEl = document.getElementById('assetDetails');
  detailsEl.innerHTML = Object.entries(details)
    .map(([key, val]) => `<div class="kv-pair"><span class="key">${key}</span><span class="value mono">${val}</span></div>`)
    .join('');

  updateMetrics();
}

// ─── Metrics Update ────────────────────────────────────────────────────
function updateMetrics() {
  const rack = selectedRack;
  const tokensPerSec = (rng.range(100, 150) * 1000).toFixed(1);
  const gpuTemp = Math.round(rack.temp + rng.range(-2, 5));
  const memBW = (rng.range(1.5, 2.0)).toFixed(1);
  const latency = Math.round(rng.range(800, 950));
  const fanSpeed = Math.round(rng.range(60, 75));
  const psuEff = (rng.range(92, 96)).toFixed(1);

  const metricsEls = document.querySelectorAll('.live-metric');
  if (metricsEls.length >= 6) {
    metricsEls[0].querySelector('.metric-value').textContent = `${tokensPerSec}k`;
    metricsEls[1].querySelector('.metric-value').textContent = `${gpuTemp}°C`;
    metricsEls[2].querySelector('.metric-value').textContent = `${memBW} TB/s`;
    metricsEls[3].querySelector('.metric-value').textContent = `${latency}ns`;
    metricsEls[4].querySelector('.metric-value').textContent = `${fanSpeed}%`;
    metricsEls[5].querySelector('.metric-value').textContent = `${psuEff}%`;
  }
}

// ─── Metrics Ticker ────────────────────────────────────────────────────
function startMetricsTicker() {
  setInterval(() => {
    // Update live metrics and rack health
    RACKS.forEach((rack) => {
      rack.cpu = Math.round(rack.cpu + rng.range(-5, 10));
      rack.cpu = Math.max(20, Math.min(99, rack.cpu));
      rack.temp = Math.round(rack.temp + rng.range(-2, 3));
    });

    renderRackGrid();
    if (selectedRack) {
      selectRack(selectedRack);
    }
  }, 2000);
}

// ─── Event Listeners ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initDashboard();

  // Preset buttons
  document.querySelectorAll('[data-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      console.log('Preset:', btn.dataset.preset);
    });
  });

  // Toggle buttons
  document.querySelectorAll('.toggle-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      btn.parentElement.querySelectorAll('.toggle-btn').forEach((b) => {
        b.classList.remove('active');
      });
      btn.classList.add('active');
    });
  });

  // Action buttons
  document.querySelectorAll('.action-buttons .confirm-button').forEach((btn) => {
    btn.addEventListener('click', () => {
      console.log('Action:', btn.textContent);
    });
  });

  // Slider inputs
  document.querySelectorAll('.slider-input').forEach((input) => {
    input.addEventListener('input', (e) => {
      console.log('Slider value:', e.target.value);
    });
  });

  document.querySelectorAll('.slider-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = btn.closest('.slider-container').querySelector('.slider-input');
      const delta = parseInt(btn.dataset.delta);
      input.value = Math.max(input.min, Math.min(input.max, parseInt(input.value) + delta));
    });
  });
});
