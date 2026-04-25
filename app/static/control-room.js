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
  const ledColor = rack.status === 'critical' ? '#FF6B6B' : rack.status === 'warn' ? '#FFD166' : '#7BFF9E';

  // Rack body
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', x);
  rect.setAttribute('y', y);
  rect.setAttribute('width', size);
  rect.setAttribute('height', size);
  rect.setAttribute('fill', '#171A1F');
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
  led.setAttribute('class', 'iso-led');
  svg.appendChild(led);

  // Label
  const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  label.setAttribute('x', x + size / 2);
  label.setAttribute('y', y + size / 2);
  label.setAttribute('fill', '#33FBD3');
  label.setAttribute('font-size', '11');
  label.setAttribute('font-family', 'monospace');
  label.setAttribute('text-anchor', 'middle');
  label.setAttribute('dy', '0.3em');
  label.textContent = rack.id;
  svg.appendChild(label);

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

  const metrics = {
    'CPU Util': `${rack.cpu}%`,
    'RAM Util': `${Math.round(rng.range(80, 99))}%`,
    Power: `${rng.range(2.5, 4.5).toFixed(1)} kW`,
    Temp: `${Math.round(rng.range(75, 87))}°C`,
    Uptime: `${Math.round(rng.range(100, 300))}d`,
    'Last Ping': `${Math.round(rng.range(1, 10))}ms`,
    'GPU Model': GPU_LABEL,
    'GPU Count': String(GPUS_PER_RACK),
    Firmware: '2024.Q1.19',
  };

  Object.entries(metrics).forEach(([key, val]) => {
    const el = document.getElementById(`det${key.replace(/\s+/g, '')}`);
    if (el) el.textContent = val;
  });
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

  // Quick filters: status counts derived from rack list
  const onlineCount = ISO_RACKS.filter((r) => r.status === 'online').length;
  const warnCount = ISO_RACKS.filter((r) => r.status === 'warn').length;
  const criticalCount = ISO_RACKS.filter((r) => r.status === 'critical').length;
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
});
