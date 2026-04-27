/**
 * control-room.js — Isometric 3D Control Room with Scroll-Zoom
 * LOD levels: FLOOR (0) > RACK (1) > CHASSIS (2) > TRAY (3) > GPU (4)
 */

// ─── Seeded Random ────────────────────────────────────────────────────
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

// ─── State ────────────────────────────────────────────────────────────
let currentLOD = 0;
let selectedRack = 'B-03';
const lodLevels = ['FLOOR', 'RACK', 'CHASSIS', 'TRAY', 'GPU'];

/* Per-rack operational state, keyed by rack id (e.g. "A-01").
 * `power`: "on" | "off"
 * `rebootingUntil`: timestamp ms — non-null means still rebooting
 * `benchmarkingUntil`: timestamp ms — non-null means a benchmark in progress */
const rackOps = new Map();

/* Returns (or initializes) the ops record for a rack. */
function getRackOps(rackId) {
  if (!rackOps.has(rackId)) {
    rackOps.set(rackId, { power: 'on', rebootingUntil: null, benchmarkingUntil: null });
  }
  return rackOps.get(rackId);
}

/* Effective status for the rack — combines its physical CPU/temp telemetry
 * with operator-set power state and any in-flight reboot/benchmark. */
function effectiveStatus(rack) {
  const ops = getRackOps(rack.id);
  if (ops.power === 'off') return 'offline';
  const now = Date.now();
  if (ops.rebootingUntil && now < ops.rebootingUntil) return 'rebooting';
  if (ops.benchmarkingUntil && now < ops.benchmarkingUntil) return 'benchmarking';
  return rack.status; // healthy / warn / critical from the underlying telemetry
}

/* Map status → LED hex color, kept in one place so we don't drift. */
function statusToLed(status) {
  switch (status) {
    case 'offline':       return '#5C626B';   // grey
    case 'rebooting':     return '#FFD166';   // amber
    case 'benchmarking':  return '#6DD6FF';   // sky
    case 'critical':      return '#FF6B6B';
    case 'warn':          return '#FFD166';
    default:              return '#7BFF9E';
  }
}

// ─── Forge snapshot integration ─────────────────────────────────────
function getSnapshot() {
  try { return window.ForgeState ? window.ForgeState.read() : null; } catch (_) { return null; }
}

function rackLayoutFor(count) {
  if (count <= 8)  return { rows: ['A', 'B'],            cols: [1, 2, 3, 4] };
  if (count <= 12) return { rows: ['A', 'B', 'C'],       cols: [1, 2, 3, 4] };
  if (count <= 20) return { rows: ['A', 'B', 'C', 'D'],  cols: [1, 2, 3, 4, 5] };
  if (count <= 30) return { rows: ['A', 'B', 'C', 'D', 'E'], cols: [1, 2, 3, 4, 5, 6] };
  if (count <= 42) return { rows: ['A', 'B', 'C', 'D', 'E', 'F'], cols: [1, 2, 3, 4, 5, 6, 7] };
  return { rows: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], cols: [1, 2, 3, 4, 5, 6, 7, 8] };
}

// ─── Rack Data — adapts to snapshot.compute.rackCount ──────────────
let RACK_ROWS = ['A', 'B', 'C', 'D'];
let RACK_COLS = [1, 2, 3, 4, 5];
let GPU_LABEL = 'H100 SXM5';
let GPUS_PER_RACK = 8;

function generateIsoRacks() {
  const snap = getSnapshot();
  if (snap && window.ForgeState) {
    const layout = rackLayoutFor(window.ForgeState.deriveRackCount(snap));
    RACK_ROWS = layout.rows;
    RACK_COLS = layout.cols;
    GPU_LABEL = window.ForgeState.deriveGpuModel(snap);
    GPUS_PER_RACK = Number(snap.compute?.gpusPerRack) || 8;
  }

  const total = (snap && window.ForgeState ? window.ForgeState.deriveRackCount(snap) : RACK_ROWS.length * RACK_COLS.length);
  const racks = [];
  let placed = 0;
  for (const row of RACK_ROWS) {
    for (const col of RACK_COLS) {
      if (placed >= total) break;
      placed++;
      const id = `${row}-${String(col).padStart(2, '0')}`;
      const cpu = Math.round(rng.range(45, 95));
      const status = cpu > 85 ? 'critical' : cpu > 75 ? 'warn' : 'online';
      racks.push({ id, row, col, cpu, status });
    }
  }
  return racks;
}

let ISO_RACKS = generateIsoRacks();

// ─── Isometric Projection ────────────────────────────────────────────
function isoProject(x, y, z = 0) {
  const isoX = (x - y) * 0.866; // cos(30°)
  const isoY = (x + y) * 0.5 - z;
  return { isoX, isoY };
}

// ─── Render LOD 0: FLOOR (rack grid sized to forge state + spine) ──
function renderFloorView() {
  const svg = document.getElementById('isoView');
  svg.innerHTML = '';

  /* Pick a cell size that fits the chosen grid into the 800×600 canvas */
  const numCols = RACK_COLS.length;
  const numRows = RACK_ROWS.length;
  const cellW = Math.max(48, Math.min(80, Math.floor(700 / numCols)));
  const cellH = Math.max(48, Math.min(80, Math.floor(360 / Math.max(1, numRows))));
  const startX = 50;
  const startY = 250 - Math.max(0, (numRows - 4) * (cellH / 2));

  // Background
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('width', '800');
  bg.setAttribute('height', '600');
  bg.setAttribute('fill', '#0F1114');
  svg.appendChild(bg);

  // Rack grid
  ISO_RACKS.forEach((rack, idx) => {
    const row = Math.floor(idx / numCols);
    const col = idx % numCols;
    const x = startX + col * cellW;
    const y = startY + row * cellH;
    drawRackBlock(svg, x, y, rack, 'floor');
  });

  // Spine node (hovering above the grid centre)
  const spineX = startX + Math.floor(numCols / 2) * cellW;
  const spineY = Math.max(40, startY - 150);
  drawSpineNode(svg, spineX, spineY);

  // Dashed lines from spine to top-of-row racks
  for (let c = 0; c < numCols; c++) {
    const rackX = startX + c * cellW;
    const rackY = startY;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', spineX);
    line.setAttribute('y1', spineY + 30);
    line.setAttribute('x2', rackX);
    line.setAttribute('y2', rackY);
    line.setAttribute('stroke', 'rgba(51, 251, 211, 0.2)');
    line.setAttribute('stroke-width', '1');
    line.setAttribute('stroke-dasharray', '4,4');
    svg.appendChild(line);
  }

  // Row labels
  RACK_ROWS.forEach((rowLabel, idx) => {
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', startX - 20);
    label.setAttribute('y', startY + idx * cellH + cellH / 2 + 4);
    label.setAttribute('fill', '#A0A4AB');
    label.setAttribute('font-size', '12');
    label.setAttribute('font-family', 'monospace');
    label.setAttribute('text-anchor', 'end');
    label.textContent = `ROW ${rowLabel}`;
    svg.appendChild(label);
  });
}

function drawRackBlock(svg, x, y, rack, lod) {
  const size = 60;
  const status = effectiveStatus(rack);
  const ledColor = statusToLed(status);
  const offline = status === 'offline';
  const rebooting = status === 'rebooting';
  const benchmarking = status === 'benchmarking';

  // Rack body — fade when offline so the user can tell at a glance
  // which racks have been operator-disabled.
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', x);
  rect.setAttribute('y', y);
  rect.setAttribute('width', size);
  rect.setAttribute('height', size);
  rect.setAttribute('fill', offline ? '#0c0e11' : '#171A1F');
  if (offline) rect.setAttribute('opacity', '0.45');
  rect.setAttribute('stroke', rack.id === selectedRack ? '#33FBD3' : '#23272D');
  rect.setAttribute('stroke-width', rack.id === selectedRack ? '2' : '1');
  rect.setAttribute('rx', '2');
  rect.setAttribute('cursor', 'pointer');
  rect.setAttribute('class', 'iso-rack-block');
  rect.setAttribute('data-rack-id', rack.id);
  svg.appendChild(rect);

  // LED
  const led = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  led.setAttribute('cx', x + size - 6);
  led.setAttribute('cy', y + 6);
  led.setAttribute('r', '3');
  led.setAttribute('fill', ledColor);
  led.setAttribute('class', 'iso-led' + (rebooting || benchmarking ? ' iso-led-pulse' : ''));
  svg.appendChild(led);

  // Rack ID label (top centre of cell)
  const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  label.setAttribute('x', x + size / 2);
  label.setAttribute('y', y + size / 2 - 4);
  label.setAttribute('fill', offline ? '#5C626B' : '#33FBD3');
  label.setAttribute('font-size', '11');
  label.setAttribute('font-family', 'monospace');
  label.setAttribute('text-anchor', 'middle');
  label.setAttribute('dy', '0.3em');
  label.textContent = rack.id;
  svg.appendChild(label);

  // Power draw subtitle — shows the rack's per-rack kW so the floor view
  // is clearly tied to the user's MW build, not just decorative.
  const powerLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  powerLabel.setAttribute('x', x + size / 2);
  powerLabel.setAttribute('y', y + size / 2 + 10);
  powerLabel.setAttribute('fill', offline ? '#3A3F47' : '#7BFF9E');
  powerLabel.setAttribute('font-size', '8');
  powerLabel.setAttribute('font-family', 'monospace');
  powerLabel.setAttribute('text-anchor', 'middle');
  powerLabel.setAttribute('opacity', '0.85');
  powerLabel.textContent = offline ? '— kW' : `${rackPowerKw(rack).toFixed(1)} kW`;
  svg.appendChild(powerLabel);

  // Clickable
  rect.addEventListener('click', () => selectRack(rack.id));
  rect.addEventListener('mouseover', () => {
    rect.setAttribute('stroke', '#33FBD3');
    rect.setAttribute('stroke-width', '2');
  });
  rect.addEventListener('mouseout', () => {
    const sel = rack.id === selectedRack;
    rect.setAttribute('stroke', sel ? '#33FBD3' : '#23272D');
    rect.setAttribute('stroke-width', sel ? '2' : '1');
  });
}

function drawSpineNode(svg, x, y) {
  const size = 30;
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', x);
  circle.setAttribute('cy', y);
  circle.setAttribute('r', size / 2);
  circle.setAttribute('fill', 'rgba(109, 214, 255, 0.15)');
  circle.setAttribute('stroke', '#6DD6FF');
  circle.setAttribute('stroke-width', '1.5');
  svg.appendChild(circle);

  const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  label.setAttribute('x', x);
  label.setAttribute('y', y);
  label.setAttribute('fill', '#6DD6FF');
  label.setAttribute('font-size', '10');
  label.setAttribute('font-family', 'monospace');
  label.setAttribute('text-anchor', 'middle');
  label.setAttribute('dy', '0.3em');
  label.textContent = 'SPINE';
  svg.appendChild(label);
}

// ─── Render LOD 1: SINGLE RACK (exploded view) ──────────────────────
function renderRackDetailView() {
  const svg = document.getElementById('isoView');
  svg.innerHTML = '';

  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('width', '800');
  bg.setAttribute('height', '600');
  bg.setAttribute('fill', '#0F1114');
  svg.appendChild(bg);

  const x = 200, y = 150;
  const rackHeight = 300;
  const rackWidth = 80;

  // Rack frame
  const frame = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  frame.setAttribute('x', x);
  frame.setAttribute('y', y);
  frame.setAttribute('width', rackWidth);
  frame.setAttribute('height', rackHeight);
  frame.setAttribute('fill', 'none');
  frame.setAttribute('stroke', '#33FBD3');
  frame.setAttribute('stroke-width', '2');
  frame.setAttribute('rx', '3');
  svg.appendChild(frame);

  // 42U markers
  for (let u = 0; u < 42; u += 7) {
    const markerY = y + (u / 42) * rackHeight;
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    marker.setAttribute('x1', x);
    marker.setAttribute('y1', markerY);
    marker.setAttribute('x2', x + rackWidth);
    marker.setAttribute('y2', markerY);
    marker.setAttribute('stroke', 'rgba(51, 251, 211, 0.2)');
    marker.setAttribute('stroke-width', '1');
    svg.appendChild(marker);

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', x - 10);
    label.setAttribute('y', markerY + 3);
    label.setAttribute('fill', '#A0A4AB');
    label.setAttribute('font-size', '9');
    label.setAttribute('font-family', 'monospace');
    label.setAttribute('text-anchor', 'end');
    label.textContent = `${u}U`;
    svg.appendChild(label);
  }

  // Chassis blocks (4U units)
  const rack = ISO_RACKS.find((r) => r.id === selectedRack);
  const chassisCount = 10;
  for (let i = 0; i < chassisCount; i++) {
    const chassisY = y + 10 + i * 28;
    const chassis = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    chassis.setAttribute('x', x + 2);
    chassis.setAttribute('y', chassisY);
    chassis.setAttribute('width', rackWidth - 4);
    chassis.setAttribute('height', 24);
    chassis.setAttribute('fill', '#171A1F');
    chassis.setAttribute('stroke', '#23272D');
    chassis.setAttribute('stroke-width', '1');
    chassis.setAttribute('rx', '2');
    chassis.setAttribute('cursor', 'pointer');
    svg.appendChild(chassis);

    // Chassis label
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', x + rackWidth / 2);
    label.setAttribute('y', chassisY + 12);
    label.setAttribute('fill', '#7BFF9E');
    label.setAttribute('font-size', '9');
    label.setAttribute('font-family', 'monospace');
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('dy', '0.3em');
    label.textContent = i < 8 ? `4U GPU` : `1U PSU`;
    svg.appendChild(label);

    chassis.addEventListener('click', () => {
      zoomTo(2);
    });
  }

  // Title
  const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  title.setAttribute('x', 400);
  title.setAttribute('y', 40);
  title.setAttribute('fill', '#33FBD3');
  title.setAttribute('font-size', '14');
  title.setAttribute('font-family', 'monospace');
  title.setAttribute('text-anchor', 'middle');
  title.setAttribute('font-weight', '600');
  title.textContent = `RACK ${selectedRack} — 42U ELEVATION`;
  svg.appendChild(title);
}

// ─── Render LOD 2: CHASSIS (4U GPU chassis) ──────────────────────────
function renderChassisDetailView() {
  const svg = document.getElementById('isoView');
  svg.innerHTML = '';

  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('width', '800');
  bg.setAttribute('height', '600');
  bg.setAttribute('fill', '#0F1114');
  svg.appendChild(bg);

  const x = 150, y = 150;
  const width = 500, height = 300;

  // Chassis body
  const body = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  body.setAttribute('x', x);
  body.setAttribute('y', y);
  body.setAttribute('width', width);
  body.setAttribute('height', height);
  body.setAttribute('fill', '#171A1F');
  body.setAttribute('stroke', '#33FBD3');
  body.setAttribute('stroke-width', '2');
  body.setAttribute('rx', '4');
  svg.appendChild(body);

  // Front panel vents
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 3; j++) {
      const ventX = x + 20 + i * 55;
      const ventY = y + 30 + j * 100;
      const vent = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      vent.setAttribute('x', ventX);
      vent.setAttribute('y', ventY);
      vent.setAttribute('width', '40');
      vent.setAttribute('height', '80');
      vent.setAttribute('fill', 'none');
      vent.setAttribute('stroke', 'rgba(51, 251, 211, 0.3)');
      vent.setAttribute('stroke-width', '1');
      vent.setAttribute('rx', '2');
      svg.appendChild(vent);

      // Vent grilles
      for (let k = 0; k < 4; k++) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', ventX + 2);
        line.setAttribute('y1', ventY + 5 + k * 18);
        line.setAttribute('x2', ventX + 38);
        line.setAttribute('y2', ventY + 5 + k * 18);
        line.setAttribute('stroke', 'rgba(51, 251, 211, 0.15)');
        line.setAttribute('stroke-width', '1');
        svg.appendChild(line);
      }
    }
  }

  // Status LEDs on front
  for (let i = 0; i < 4; i++) {
    const led = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    led.setAttribute('cx', x + 30 + i * 120);
    led.setAttribute('cy', y + height - 20);
    led.setAttribute('r', '4');
    led.setAttribute('fill', i < 2 ? '#7BFF9E' : '#FFD166');
    svg.appendChild(led);
  }

  // Title
  const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  title.setAttribute('x', 400);
  title.setAttribute('y', 40);
  title.setAttribute('fill', '#33FBD3');
  title.setAttribute('font-size', '14');
  title.setAttribute('font-family', 'monospace');
  title.setAttribute('text-anchor', 'middle');
  title.setAttribute('font-weight', '600');
  title.textContent = '4U GPU CHASSIS — FRONT VIEW';
  svg.appendChild(title);

  // Hint
  const hint = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  hint.setAttribute('x', 400);
  hint.setAttribute('y', 570);
  hint.setAttribute('fill', '#5C626B');
  hint.setAttribute('font-size', '11');
  hint.setAttribute('font-family', 'monospace');
  hint.setAttribute('text-anchor', 'middle');
  hint.textContent = 'Scroll up to zoom to GPU tray • Click to select';
  svg.appendChild(hint);
}

// ─── Render LOD 3: GPU TRAY ───────────────────────────────────────────
function renderTrayDetailView() {
  const svg = document.getElementById('isoView');
  svg.innerHTML = '';

  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('width', '800');
  bg.setAttribute('height', '600');
  bg.setAttribute('fill', '#0F1114');
  svg.appendChild(bg);

  const x = 200, y = 150;

  // 8 GPU modules in a tray (2x4 grid)
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 4; col++) {
      const gpuX = x + col * 120;
      const gpuY = y + row * 150;

      // GPU module
      const module = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      module.setAttribute('x', gpuX);
      module.setAttribute('y', gpuY);
      module.setAttribute('width', '100');
      module.setAttribute('height', '130');
      module.setAttribute('fill', '#0F1114');
      module.setAttribute('stroke', '#33FBD3');
      module.setAttribute('stroke-width', '2');
      module.setAttribute('rx', '3');
      module.setAttribute('cursor', 'pointer');
      svg.appendChild(module);

      // Heat spreader (top)
      const spreader = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      spreader.setAttribute('x', gpuX + 5);
      spreader.setAttribute('y', gpuY + 5);
      spreader.setAttribute('width', '90');
      spreader.setAttribute('height', '50');
      spreader.setAttribute('fill', '#1a1e24');
      spreader.setAttribute('stroke', '#33FBD3');
      spreader.setAttribute('stroke-width', '1');
      spreader.setAttribute('rx', '2');
      svg.appendChild(spreader);

      // LED
      const led = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      led.setAttribute('cx', gpuX + 10);
      led.setAttribute('cy', gpuY + 10);
      led.setAttribute('r', '2.5');
      led.setAttribute('fill', '#7BFF9E');
      svg.appendChild(led);

      // Label
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', gpuX + 50);
      label.setAttribute('y', gpuY + 100);
      label.setAttribute('fill', '#33FBD3');
      label.setAttribute('font-size', '9');
      label.setAttribute('font-family', 'monospace');
      label.setAttribute('text-anchor', 'middle');
      label.textContent = `GPU${row * 4 + col}`;
      svg.appendChild(label);

      module.addEventListener('click', () => zoomTo(4));
    }
  }

  // NVLink connections (conceptual)
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 3; col++) {
      const x1 = x + (col + 0.5) * 120 + 50;
      const y1 = y + row * 150 + 65;
      const x2 = x1 + 120;
      const y2 = y1;
      const link = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      link.setAttribute('x1', x1);
      link.setAttribute('y1', y1);
      link.setAttribute('x2', x2);
      link.setAttribute('y2', y2);
      link.setAttribute('stroke', 'rgba(123, 255, 158, 0.3)');
      link.setAttribute('stroke-width', '1');
      link.setAttribute('stroke-dasharray', '3,2');
      svg.appendChild(link);
    }
  }

  // Title
  const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  title.setAttribute('x', 400);
  title.setAttribute('y', 40);
  title.setAttribute('fill', '#33FBD3');
  title.setAttribute('font-size', '14');
  title.setAttribute('font-family', 'monospace');
  title.setAttribute('text-anchor', 'middle');
  title.setAttribute('font-weight', '600');
  title.textContent = 'GPU TRAY (8× H100 SXM5)';
  svg.appendChild(title);
}

// ─── Render LOD 4: GPU DIE ─────────────────────────────────────────────
function renderGPUDieView() {
  const svg = document.getElementById('isoView');
  svg.innerHTML = '';

  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('width', '800');
  bg.setAttribute('height', '600');
  bg.setAttribute('fill', '#0F1114');
  svg.appendChild(bg);

  const centerX = 400, centerY = 300;
  const dieSize = 120;

  // Die
  const die = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  die.setAttribute('x', centerX - dieSize / 2);
  die.setAttribute('y', centerY - dieSize / 2);
  die.setAttribute('width', dieSize);
  die.setAttribute('height', dieSize);
  die.setAttribute('fill', '#0a0c0e');
  die.setAttribute('stroke', '#33FBD3');
  die.setAttribute('stroke-width', '2');
  die.setAttribute('rx', '4');
  svg.appendChild(die);

  // HBM stacks (6 total: 3 each side)
  const hbmWidth = 25, hbmHeight = 60;
  const positions = [
    { x: centerX - dieSize / 2 - hbmWidth - 10, y: centerY - 80, label: 'HBM0' },
    { x: centerX - dieSize / 2 - hbmWidth - 10, y: centerY - 10, label: 'HBM1' },
    { x: centerX - dieSize / 2 - hbmWidth - 10, y: centerY + 50, label: 'HBM2' },
    { x: centerX + dieSize / 2 + 10, y: centerY - 80, label: 'HBM3' },
    { x: centerX + dieSize / 2 + 10, y: centerY - 10, label: 'HBM4' },
    { x: centerX + dieSize / 2 + 10, y: centerY + 50, label: 'HBM5' },
  ];

  positions.forEach((pos) => {
    const hbm = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    hbm.setAttribute('x', pos.x);
    hbm.setAttribute('y', pos.y);
    hbm.setAttribute('width', hbmWidth);
    hbm.setAttribute('height', hbmHeight);
    hbm.setAttribute('fill', '#1a1e24');
    hbm.setAttribute('stroke', '#6DD6FF');
    hbm.setAttribute('stroke-width', '1.5');
    hbm.setAttribute('rx', '2');
    svg.appendChild(hbm);

    // HBM label
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', pos.x + hbmWidth / 2);
    label.setAttribute('y', pos.y + hbmHeight / 2);
    label.setAttribute('fill', '#6DD6FF');
    label.setAttribute('font-size', '8');
    label.setAttribute('font-family', 'monospace');
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('dy', '0.3em');
    label.textContent = pos.label;
    svg.appendChild(label);
  });

  // NVLink connector pads (edges)
  for (let i = 0; i < 4; i++) {
    const pad = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    const angle = (i / 4) * Math.PI * 2;
    const padX = centerX + Math.cos(angle) * (dieSize / 2 + 5);
    const padY = centerY + Math.sin(angle) * (dieSize / 2 + 5);
    pad.setAttribute('cx', padX);
    pad.setAttribute('cy', padY);
    pad.setAttribute('r', '3');
    pad.setAttribute('fill', '#7BFF9E');
    pad.setAttribute('opacity', '0.6');
    svg.appendChild(pad);
  }

  // Die label (center)
  const dieLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  dieLabel.setAttribute('x', centerX);
  dieLabel.setAttribute('y', centerY);
  dieLabel.setAttribute('fill', '#33FBD3');
  dieLabel.setAttribute('font-size', '11');
  dieLabel.setAttribute('font-family', 'monospace');
  dieLabel.setAttribute('text-anchor', 'middle');
  dieLabel.setAttribute('dy', '0.3em');
  dieLabel.setAttribute('font-weight', '600');
  dieLabel.textContent = 'CUDA CORE';
  svg.appendChild(dieLabel);

  // Title
  const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  title.setAttribute('x', 400);
  title.setAttribute('y', 40);
  title.setAttribute('fill', '#33FBD3');
  title.setAttribute('font-size', '14');
  title.setAttribute('font-family', 'monospace');
  title.setAttribute('text-anchor', 'middle');
  title.setAttribute('font-weight', '600');
  title.textContent = 'H100 SXM5 — 80GB · 700W · 9000+ CUDA Cores';
  svg.appendChild(title);
}

// ─── Zoom Logic ───────────────────────────────────────────────────────
function zoomTo(lod) {
  currentLOD = Math.max(0, Math.min(4, lod));
  updateLODView();
  updateLadder();
}

function updateLODView() {
  switch (currentLOD) {
    case 0:
      renderFloorView();
      break;
    case 1:
      renderRackDetailView();
      break;
    case 2:
      renderChassisDetailView();
      break;
    case 3:
      renderTrayDetailView();
      break;
    case 4:
      renderGPUDieView();
      break;
  }
}

function updateLadder() {
  document.querySelectorAll('.zoom-step').forEach((step, idx) => {
    step.classList.toggle('active', idx === currentLOD);
  });
}

function selectRack(rackId) {
  selectedRack = rackId;
  updateRackInspector();
  updateLODView();
}

function updateRackInspector() {
  const rack = ISO_RACKS.find((r) => r.id === selectedRack);
  if (!rack) return;

  document.getElementById('ctrlInspectorTitle').textContent = `RACK-${rack.id}`;

  /* Derive metrics from the actual Forge snapshot when present.
   * Each rack inherits the cluster-wide GPU model and gpus/rack
   * but adds a small deterministic jitter (seeded by rack id) so
   * different racks don't all read identically. */
  const ops = getRackOps(rack.id);
  const snap = getSnapshot();
  const seed = rackSeed(rack.id);

  // Power-per-rack: derive from the user's MW target / rack count.
  let perRackKw = 3.6;
  if (snap && window.ForgeState) {
    const mw = window.ForgeState.deriveMwDraw(snap);
    const racks = window.ForgeState.deriveRackCount(snap) || 1;
    perRackKw = (mw * 1000) / racks;
  }

  // Temperature: derive from cooling type + small per-rack offset
  let baseTempC = 24;
  if (snap?.facilityCons?.cooling) {
    const c = String(snap.facilityCons.cooling).toLowerCase();
    if (c.includes('immersion')) baseTempC = 18;
    else if (c.includes('liquid') || c.includes('d2c')) baseTempC = 22;
    else baseTempC = 28; // air
  }
  const rackTempC = clamp(baseTempC + (seed - 0.5) * 4, baseTempC - 2, baseTempC + 6);

  // CPU Util: drive from snapshot MFU + per-rack jitter so it ranges
  // ~30-95 instead of being purely random
  const baselineUtil = clamp(((rack.cpu / 100) * 100) || 60, 25, 95);

  let valOps = 'ONLINE';
  let valOpsClass = '';
  const status = effectiveStatus(rack);
  if (status === 'offline') { valOps = 'POWER OFF'; valOpsClass = 'critical'; }
  else if (status === 'rebooting') { valOps = 'REBOOTING…'; valOpsClass = 'warn'; }
  else if (status === 'benchmarking') { valOps = 'BENCH RUNNING'; valOpsClass = 'info'; }
  else if (status === 'critical') { valOps = 'CRITICAL'; valOpsClass = 'critical'; }
  else if (status === 'warn') { valOps = 'WARN'; valOpsClass = 'warn'; }

  const metrics = {
    'CPU Util': status === 'offline' ? '—' : `${Math.round(baselineUtil)}%`,
    'RAM Util': status === 'offline' ? '—' : `${Math.round(82 + seed * 14)}%`,
    Power:     status === 'offline' ? '0.0 kW' : `${perRackKw.toFixed(1)} kW`,
    Temp:      status === 'offline' ? '—' : `${rackTempC.toFixed(1)}°C`,
    Uptime:    `${Math.round(80 + seed * 220)}d`,
    'Last Ping': status === 'offline' ? '— ms' : `${(0.4 + seed * 5).toFixed(1)}ms`,
    'GPU Model': GPU_LABEL,
    'GPU Count': String(GPUS_PER_RACK),
    Firmware:  '2026.Q1.19',
  };

  Object.entries(metrics).forEach(([key, val]) => {
    const el = document.getElementById(`det${key.replace(/\s+/g, '')}`);
    if (el) el.textContent = val;
  });

  // Sync power toggle group to current state
  document.querySelectorAll('#powerToggleGroup .toggle-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.state === ops.power);
  });

  // Asset preview overlay
  const overlay = document.querySelector('.asset-preview .preview-overlay');
  if (overlay) {
    overlay.textContent = valOps;
    overlay.dataset.severity = valOpsClass || 'good';
  }
}

/* Tiny deterministic seed so each rack's per-frame jitter is stable
 * across renders (otherwise CPU%/Temp would jump every time the
 * inspector re-rendered, which felt twitchy). */
function rackSeed(id) {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  // map to [0,1)
  const v = Math.abs(Math.sin(h * 0.31415));
  return v - Math.floor(v);
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/* Per-rack kW draw — derived from MW target / rack count, with the same
 * deterministic per-rack jitter we use elsewhere so different racks show
 * slightly different values. Kept in one place so floor view + inspector
 * never disagree. */
function rackPowerKw(rack) {
  const snap = getSnapshot();
  let basePerRack = 3.6;
  if (snap && window.ForgeState) {
    const mw = window.ForgeState.deriveMwDraw(snap);
    const racks = window.ForgeState.deriveRackCount(snap) || 1;
    basePerRack = (mw * 1000) / racks;
  }
  const seed = rackSeed(rack.id);
  return clamp(basePerRack * (0.92 + seed * 0.18), 0.4, basePerRack * 1.25);
}

// ─── Apply forge snapshot to static page chrome ────────────────────
function applyForgeOverlay() {
  const snap = getSnapshot();
  if (!snap || !window.ForgeState) return;

  // Facility hierarchy heading + selected node label
  const dcCode = window.ForgeState.deriveDcCode(snap);
  const headerH2 = document.querySelector('.control-left .left-header h2');
  if (headerH2) {
    const cityRaw = window.ForgeState.formatCityLabel(snap);
    const cityName = (cityRaw || 'Toronto').split(',')[0].trim();
    headerH2.textContent = cityName ? `${cityName} Grid` : 'Global Grid';
  }
  const dcLabelNodes = document.querySelectorAll('.tree-node.selected .tree-label');
  dcLabelNodes.forEach((el) => { el.textContent = dcCode; });

  // Quick filters: status counts derived from EFFECTIVE rack status,
  // which factors in operator power-off / reboot / benchmark states.
  const onlineCount   = ISO_RACKS.filter((r) => effectiveStatus(r) === 'online' || effectiveStatus(r) === 'healthy').length;
  const warnCount     = ISO_RACKS.filter((r) => effectiveStatus(r) === 'warn').length;
  const criticalCount = ISO_RACKS.filter((r) => effectiveStatus(r) === 'critical' || effectiveStatus(r) === 'offline').length;
  const so = document.getElementById('statusOnline');
  const sw = document.getElementById('statusWarn');
  const sc = document.getElementById('statusCritical');
  if (so) so.textContent = String(onlineCount);
  if (sw) sw.textContent = String(warnCount);
  if (sc) sc.textContent = String(criticalCount);

  // Active alerts: prefer real warning racks
  const alertsList = document.querySelector('.control-left .alerts-panel .alerts-list');
  if (alertsList) {
    const flagged = ISO_RACKS.filter((r) => r.status !== 'online').slice(0, 3);
    if (flagged.length) {
      alertsList.innerHTML = flagged
        .map((r) => `
          <div class="alert-item ${r.status}">
            <span class="alert-icon">[${r.status === 'critical' ? 'X' : '!'}]</span>
            <span class="alert-text">RACK-${r.id} ${r.status === 'critical' ? 'PSU degraded' : 'thermal warning'}</span>
          </div>
        `)
        .join('');
    }
  }

  // Center header: include workload context
  const centerKicker = document.querySelector('.control-center .center-header .kicker');
  if (centerKicker && snap.facility?.workloadLabel) {
    centerKicker.textContent = `CONTROL ROOM · ${snap.facility.workloadLabel}`;
  }
}

// ─── Scroll-Zoom Handler ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  /* Build-completion gate — Control Room only opens once the user has
     finished the 8-phase build in the Forge. */
  if (window.ForgeState && !window.ForgeState.isBuildComplete()) {
    window.ForgeState.renderLockOverlayIfNeeded({ pageName: "The Control Room" });
    window.ForgeState.applyNavGate();
    return;
  }
  if (window.ForgeState) window.ForgeState.applyNavGate();

  const container = document.getElementById('isoViewContainer');

  container.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 1 : -1;
    zoomTo(currentLOD + delta);
  });

  // Zoom ladder clicks
  document.querySelectorAll('.zoom-step').forEach((step) => {
    step.addEventListener('click', () => {
      const lod = parseInt(step.dataset.lod);
      zoomTo(lod);
    });
  });

  // ── Apply Forge snapshot to chrome + grid, then render ─────────
  function refreshFromSnapshot() {
    ISO_RACKS = generateIsoRacks();
    /* Pick the first rack if our previously-selected one no longer exists */
    if (!ISO_RACKS.find((r) => r.id === selectedRack)) {
      selectedRack = ISO_RACKS[0]?.id || 'A-01';
    }
    applyForgeOverlay();
    updateLODView();
    updateRackInspector();
  }

  refreshFromSnapshot();

  if (window.ForgeState && typeof window.ForgeState.subscribe === 'function') {
    window.ForgeState.subscribe(() => refreshFromSnapshot());
  }

  // Wire the operational control buttons (ON/OFF, Reboot, Benchmark, Open Console)
  wireControlActions();

  // Wire the console modal: input handling, command echo, close on backdrop / Escape
  wireConsoleModal();
});

// ──────────────────────────────────────────────────────────────────────
// Operational control wiring — turn the previously-decorative buttons
// into actually-working controls that change the rack state and
// reflect that change in the LOD view + inspector.
// ──────────────────────────────────────────────────────────────────────
function wireControlActions() {
  const root = document.querySelector('.control-actions');
  if (!root) return;

  root.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const rack = ISO_RACKS.find((r) => r.id === selectedRack);
    if (!rack) return;
    const ops = getRackOps(rack.id);

    switch (action) {
      case 'set-power': {
        const wantOn = btn.dataset.state === 'on';
        ops.power = wantOn ? 'on' : 'off';
        ops.rebootingUntil = null;
        ops.benchmarkingUntil = null;
        document.querySelectorAll('#powerToggleGroup .toggle-btn').forEach((b) => {
          b.classList.toggle('active', b.dataset.state === ops.power);
        });
        flashStatus(wantOn
          ? `RACK-${rack.id} powered ON`
          : `RACK-${rack.id} powered OFF — telemetry stream paused`);
        updateLODView();
        updateRackInspector();
        break;
      }
      case 'reboot': {
        if (ops.power === 'off') {
          flashStatus('Rack is OFF — power on first', 'warn');
          break;
        }
        ops.rebootingUntil = Date.now() + 2500;
        btn.classList.add('flash');
        setTimeout(() => btn.classList.remove('flash'), 220);
        flashStatus(`RACK-${rack.id} rebooting… (BIOS POST → driver init → fabric handshake)`);
        updateLODView();
        updateRackInspector();
        // Clear after timeout, then refresh
        setTimeout(() => {
          ops.rebootingUntil = null;
          flashStatus(`RACK-${rack.id} back online`, 'good');
          updateLODView();
          updateRackInspector();
        }, 2600);
        break;
      }
      case 'benchmark': {
        if (ops.power === 'off') {
          flashStatus('Rack is OFF — power on first', 'warn');
          break;
        }
        ops.benchmarkingUntil = Date.now() + 3500;
        btn.classList.add('flash');
        setTimeout(() => btn.classList.remove('flash'), 220);
        runRackBenchmark(rack);
        updateLODView();
        updateRackInspector();
        setTimeout(() => {
          ops.benchmarkingUntil = null;
          updateLODView();
          updateRackInspector();
        }, 3600);
        break;
      }
      case 'open-console': {
        if (ops.power === 'off') {
          flashStatus('Rack is OFF — cannot open console', 'warn');
          break;
        }
        openConsole(rack);
        break;
      }
      default:
        break;
    }
  });
}

// Briefly show a status message under the button group (auto-hides after 2.5s).
let statusFlashTimer = null;
function flashStatus(msg, severity) {
  const el = document.getElementById('actionStatus');
  if (!el) return;
  el.textContent = msg;
  el.dataset.severity = severity || 'info';
  el.hidden = false;
  if (statusFlashTimer) clearTimeout(statusFlashTimer);
  statusFlashTimer = setTimeout(() => {
    el.hidden = true;
  }, 2500);
}

// Animate a fake benchmark TPS counter for a few seconds. We tween from 0
// up to roughly the snapshot-derived TPS divided by rack count, with a
// small jitter so the bar feels alive.
function runRackBenchmark(rack) {
  const strip = document.getElementById('benchmarkStrip');
  const tpsEl = document.getElementById('benchmarkStripTps');
  const fillEl = document.getElementById('benchmarkStripFill');
  if (!strip || !tpsEl || !fillEl) return;

  const snap = getSnapshot();
  let target = 18000; // sane fallback
  if (snap && window.ForgeState) {
    const total = window.ForgeState.deriveTokensPerSec(snap);
    const rackCount = window.ForgeState.deriveRackCount(snap) || 1;
    target = Math.max(800, Math.round(total / rackCount));
  }
  strip.hidden = false;
  fillEl.style.width = '0%';
  tpsEl.textContent = '0 TPS';

  const start = performance.now();
  const dur = 3500;
  function step(now) {
    const t = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - t, 2.4);
    const live = Math.round(target * eased * (0.94 + Math.random() * 0.12));
    tpsEl.textContent = `${live.toLocaleString()} TPS`;
    fillEl.style.width = `${(eased * 100).toFixed(1)}%`;
    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      flashStatus(`Benchmark complete — ${target.toLocaleString()} tokens/s sustained`, 'good');
      // Hide strip after a short pause so the user can see the final value.
      setTimeout(() => { strip.hidden = true; }, 2200);
    }
  }
  requestAnimationFrame(step);
}

// ──────────────────────────────────────────────────────────────────────
// Console modal — purely cosmetic SSH-style transcript that runs a few
// fake commands and accepts free-typed input. Useful as a "tangible"
// affordance for operators looking at the rack in the control room.
// ──────────────────────────────────────────────────────────────────────
function openConsole(rack) {
  const modal = document.getElementById('consoleModal');
  const stream = document.getElementById('consoleStream');
  const title = document.getElementById('consoleTitle');
  const input = document.getElementById('consoleInput');
  if (!modal || !stream || !input || !title) return;

  title.textContent = `root@RACK-${rack.id} ~`;
  stream.textContent = '';
  modal.hidden = false;

  // Print a believable boot sequence
  const snap = getSnapshot();
  const gpuLabel = (snap && window.ForgeState ? window.ForgeState.deriveGpuModel(snap) : 'H100 SXM5');
  const gpuCount = Number(snap?.compute?.gpusPerRack) || 8;
  const cityLabel = (snap && window.ForgeState ? window.ForgeState.formatCityLabel(snap) : 'TOR-DC-01');

  const lines = [
    `Last login: ${new Date().toUTCString()} from 10.42.0.1`,
    `Welcome to NVIDIA HGX ${gpuLabel} chassis`,
    `Site: ${cityLabel}`,
    ``,
    `$ uname -a`,
    `Linux rack-${rack.id.toLowerCase()} 6.6.32-x86_64-cuda #1 SMP PREEMPT_DYNAMIC Tue Mar  4 18:22:11 UTC 2026 x86_64 GNU/Linux`,
    `$ uptime`,
    `${new Date().toLocaleTimeString()} up 187 days,  4:11,  3 users,  load average: ${(0.6 + Math.random() * 0.4).toFixed(2)}, ${(0.5 + Math.random() * 0.4).toFixed(2)}, ${(0.4 + Math.random() * 0.4).toFixed(2)}`,
    `$ nvidia-smi --query-gpu=index,name,utilization.gpu,memory.used --format=csv,noheader`,
    ...Array.from({ length: gpuCount }).map((_, i) =>
      `${i}, NVIDIA ${gpuLabel}, ${Math.round(60 + Math.random() * 30)}%, ${Math.round(60 + Math.random() * 18)} GiB`
    ),
    ``,
    `Type a command (echo only — this is a read-only operator console).`,
  ];

  // Type out the lines with a small stagger so it feels alive.
  appendConsoleLines(stream, lines);

  // Focus the input
  setTimeout(() => input.focus(), 60);
}

function appendConsoleLines(stream, lines) {
  let i = 0;
  function tick() {
    if (i >= lines.length) return;
    stream.textContent += lines[i] + '\n';
    stream.scrollTop = stream.scrollHeight;
    i += 1;
    setTimeout(tick, 35);
  }
  tick();
}

function wireConsoleModal() {
  const modal = document.getElementById('consoleModal');
  const input = document.getElementById('consoleInput');
  const stream = document.getElementById('consoleStream');
  if (!modal || !input || !stream) return;

  // Close handlers (backdrop, X button, Escape)
  modal.addEventListener('click', (e) => {
    const close = e.target.closest('[data-action="close-console"]');
    if (close) modal.hidden = true;
  });
  document.addEventListener('keydown', (e) => {
    if (!modal.hidden && e.key === 'Escape') {
      modal.hidden = true;
    }
  });

  // Echo typed commands with a few hardcoded responses
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const cmd = input.value.trim();
    input.value = '';
    if (!cmd) return;
    stream.textContent += `$ ${cmd}\n`;
    stream.textContent += commandResponse(cmd) + '\n';
    stream.scrollTop = stream.scrollHeight;
  });
}

function commandResponse(cmd) {
  const lc = cmd.toLowerCase();
  if (lc === 'help') return 'available: nvidia-smi, uptime, ls, whoami, date, clear';
  if (lc === 'clear') {
    const stream = document.getElementById('consoleStream');
    if (stream) stream.textContent = '';
    return '';
  }
  if (lc === 'whoami') return 'root';
  if (lc === 'date') return new Date().toUTCString();
  if (lc === 'ls') return 'cuda-12.4  inference-runtime  triton-server.log  vllm.cfg';
  if (lc.startsWith('echo ')) return cmd.slice(5);
  if (lc === 'uptime') {
    const h = Math.round(2 + Math.random() * 22);
    return `up 187d ${h}h, load avg: 0.${Math.floor(Math.random() * 99)}`;
  }
  if (lc.startsWith('nvidia-smi')) return 'GPU 0: utilization 87% · power 690 W · temp 76 C';
  return `bash: ${cmd.split(' ')[0]}: command not found (read-only operator console)`;
}
