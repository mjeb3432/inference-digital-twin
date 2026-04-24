/* ============================================================
 *  The Forge — Opening Intro (vanilla JS / WebGL port)
 *  ---------------------------------------------------------
 *  Vanilla-JS port of the 21st.dev `hero-futuristic` component.
 *  Uses the reference image + matching depth map so the scan
 *  line actually flows through the components of a real data
 *  center (rack rows, cooling units, aisle perspective) — the
 *  red dot-flow band rides the depth slice as uProgress sweeps.
 *
 *  Preserves every key effect from the source:
 *    - depth-mapped parallax (moves with the pointer)
 *    - red dot-flow band following the depth slice
 *    - vertical red scan line overlay
 *    - bloom-ish additive glow
 *
 *  If the external images fail to load (offline / blocked),
 *  we fall back to a PROCEDURALLY-GENERATED pixel data center
 *  painted into an offscreen canvas so the scan always has a
 *  subject to run over.
 *
 *  Dismiss handlers live in an inline <script> in forge.html
 *  that runs BEFORE this module — the overlay is always
 *  dismissable even if this file 404s or WebGL init fails.
 * ============================================================ */

import * as THREE from 'three';

// ---------------------------------------------------------------
// Texture sources — straight from the 21st.dev reference.
// The pair is a data-center hall with a precomputed depth map,
// which is what makes the scan "flow through" the geometry.
// ---------------------------------------------------------------
const TEXTUREMAP_SRC = 'https://i.postimg.cc/XYwvXN8D/img-4.png';
const DEPTHMAP_SRC   = 'https://i.postimg.cc/2SHKQh2q/raw-4.webp';

// ---------------------------------------------------------------
// Entry point — only runs on the Forge intro overlay, so the
// scan CANNOT leak onto any other page (no overlay, no boot).
// ---------------------------------------------------------------
const overlay = document.getElementById('introOverlay');
if (overlay) {
  boot(overlay).catch((err) => {
    console.warn('[intro] WebGL init failed, CSS baseline remains:', err);
    // The pure-CSS backdrop is already visible; nothing to swap.
  });
}

async function boot(root) {
  const canvas = root.querySelector('.intro-canvas');
  if (!canvas) throw new Error('intro-canvas not found');

  // ---- renderer ----
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    premultipliedAlpha: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);

  const sizeOf = () => ({ w: window.innerWidth, h: window.innerHeight });

  // ---- camera + scene ----
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 1;

  // ---- load textures (or fall back to procedural) ----
  const { rawMap, depthMap, imgW, imgH } = await loadTexturePair();

  // ---- shader material ----
  const uniforms = {
    uMap:       { value: rawMap },
    uDepth:     { value: depthMap },
    uPointer:   { value: new THREE.Vector2(0, 0) },
    uProgress:  { value: 0 },
    uTime:      { value: 0 },
    uAspect:    { value: 1 },
    uOpacity:   { value: 0 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });

  const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  scene.add(plane);

  // ---- sizing — cover-fit the data-center image onto the viewport ----
  function resize() {
    const { w, h } = sizeOf();
    renderer.setSize(w, h, false);
    uniforms.uAspect.value = w / h;

    const imgAspect  = imgW / imgH;
    const viewAspect = w / h;

    let sx = 1, sy = 1;
    if (viewAspect > imgAspect) {
      sy = (h / w) * imgAspect;
    } else {
      sx = (w / h) / imgAspect;
    }
    const scale = 1.04;
    plane.scale.set(sx * scale, sy * scale, 1);
  }
  resize();
  window.addEventListener('resize', resize);

  // ---- pointer parallax ----
  window.addEventListener('pointermove', (e) => {
    const { w, h } = sizeOf();
    const x = (e.clientX / w) * 2 - 1;
    const y = -((e.clientY / h) * 2 - 1);
    uniforms.uPointer.value.set(x, y);
  });

  // ---- render loop ----
  const clock = new THREE.Clock();
  let disposed = false;

  root.dataset.canvasReady = 'true';

  function tick() {
    if (disposed) return;
    const t = clock.getElapsedTime();
    uniforms.uTime.value = t;
    // Scan + depth-flow share this cycle; matches the reference exactly.
    uniforms.uProgress.value = Math.sin(t * 0.5) * 0.5 + 0.5;
    uniforms.uOpacity.value = Math.min(1, t / 1.5);

    try {
      renderer.render(scene, camera);
    } catch (err) {
      console.warn('[intro] render failed, bailing:', err);
      disposed = true;
      dispose();
      return;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // ---- cleanup ----
  const dispose = () => {
    disposed = true;
    window.removeEventListener('resize', resize);
    try {
      plane.geometry.dispose();
      material.dispose();
      rawMap.dispose();
      depthMap.dispose();
      renderer.dispose();
    } catch (_) { /* best effort */ }
  };
  document.addEventListener('forge:intro-complete', dispose, { once: true });
}

// ---------------------------------------------------------------
// Texture pair loader — tries the reference pair first, falls
// back to a procedural data-center canvas if the CDN is blocked.
// ---------------------------------------------------------------
async function loadTexturePair() {
  try {
    const loader = new THREE.TextureLoader();
    loader.crossOrigin = 'anonymous';
    const [rawMap, depthMap] = await Promise.all([
      loadTexture(loader, TEXTUREMAP_SRC),
      loadTexture(loader, DEPTHMAP_SRC),
    ]);

    rawMap.colorSpace = THREE.SRGBColorSpace;
    rawMap.minFilter = THREE.LinearFilter;
    rawMap.magFilter = THREE.LinearFilter;
    rawMap.wrapS = THREE.ClampToEdgeWrapping;
    rawMap.wrapT = THREE.ClampToEdgeWrapping;

    depthMap.minFilter = THREE.LinearFilter;
    depthMap.magFilter = THREE.LinearFilter;
    depthMap.wrapS = THREE.ClampToEdgeWrapping;
    depthMap.wrapT = THREE.ClampToEdgeWrapping;

    const imgW = rawMap.image ? rawMap.image.width  : 1920;
    const imgH = rawMap.image ? rawMap.image.height : 1080;
    return { rawMap, depthMap, imgW, imgH };
  } catch (err) {
    console.warn('[intro] reference texture load failed, using procedural fallback:', err);
    const { color, depth } = drawPixelDataCenter();
    const rawMap = new THREE.CanvasTexture(color);
    rawMap.colorSpace = THREE.SRGBColorSpace;
    rawMap.minFilter = THREE.NearestFilter;
    rawMap.magFilter = THREE.NearestFilter;
    rawMap.wrapS = THREE.ClampToEdgeWrapping;
    rawMap.wrapT = THREE.ClampToEdgeWrapping;
    rawMap.needsUpdate = true;

    const depthMap = new THREE.CanvasTexture(depth);
    depthMap.minFilter = THREE.LinearFilter;
    depthMap.magFilter = THREE.LinearFilter;
    depthMap.wrapS = THREE.ClampToEdgeWrapping;
    depthMap.wrapT = THREE.ClampToEdgeWrapping;
    depthMap.needsUpdate = true;

    return { rawMap, depthMap, imgW: color.width, imgH: color.height };
  }
}

function loadTexture(loader, url) {
  return new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });
}

// ---------------------------------------------------------------
// Procedural pixel data center fallback — only used if the CDN
// images fail. Kept so the scan always has a subject.
// ---------------------------------------------------------------
const CANVAS_W = 960;
const CANVAS_H = 540;
const PIXEL    = 4;
const snap = (n) => Math.floor(n / PIXEL) * PIXEL;

function drawPixelDataCenter() {
  const color = document.createElement('canvas');
  color.width = CANVAS_W; color.height = CANVAS_H;
  const c = color.getContext('2d');
  c.imageSmoothingEnabled = false;

  const depth = document.createElement('canvas');
  depth.width = CANVAS_W; depth.height = CANVAS_H;
  const d = depth.getContext('2d');
  d.imageSmoothingEnabled = false;

  c.fillStyle = '#05070B'; c.fillRect(0, 0, CANVAS_W, CANVAS_H);
  d.fillStyle = '#000';    d.fillRect(0, 0, CANVAS_W, CANVAS_H);

  const VX = CANVAS_W / 2;
  const VY = CANVAS_H * 0.47;

  // Ceiling cable-tray slats
  for (let i = 0; i < 14; i++) {
    const t = i / 13;
    const y = snap(VY * (1 - Math.pow(1 - t, 1.8)) * 0.92);
    const a = 0.08 + 0.32 * (1 - t);
    c.fillStyle = `rgba(40, 60, 85, ${a})`;
    c.fillRect(0, y, CANVAS_W, PIXEL);
  }
  c.fillStyle = 'rgba(120, 245, 220, 0.30)';
  c.fillRect(snap(VX - 90), snap(VY - 16), 180, PIXEL);
  c.fillStyle = 'rgba(170, 255, 235, 0.60)';
  c.fillRect(snap(VX - 28), snap(VY - 16), 56, PIXEL);

  // Floor tile lines
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const ease = Math.pow(t, 1.8);
    const y = snap(VY + (CANVAS_H - VY) * ease);
    const a = 0.10 + 0.42 * t;
    c.strokeStyle = `rgba(60, 120, 135, ${a})`;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(0, y + 0.5);
    c.lineTo(CANVAS_W, y + 0.5);
    c.stroke();
  }
  for (let i = -11; i <= 11; i++) {
    const xNear = snap(VX + i * (CANVAS_W * 0.055));
    const grad = c.createLinearGradient(VX, VY, xNear, CANVAS_H);
    grad.addColorStop(0, 'rgba(60, 120, 135, 0.04)');
    grad.addColorStop(1, 'rgba(80, 180, 185, 0.42)');
    c.strokeStyle = grad;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(VX, VY);
    c.lineTo(xNear, CANVAS_H);
    c.stroke();
  }

  // Back wall + doorway
  const wallW = snap(136);
  const wallH = snap(88);
  c.fillStyle = '#12161E';
  c.fillRect(snap(VX - wallW / 2), snap(VY - wallH / 2), wallW, wallH);
  const doorGrad = c.createRadialGradient(VX, VY, 2, VX, VY, wallW / 2);
  doorGrad.addColorStop(0.0, 'rgba(90, 255, 230, 0.90)');
  doorGrad.addColorStop(0.5, 'rgba(51, 251, 211, 0.45)');
  doorGrad.addColorStop(1.0, 'rgba(51, 251, 211, 0)');
  c.fillStyle = doorGrad;
  c.fillRect(snap(VX - wallW / 2), snap(VY - wallH / 2), wallW, wallH);
  c.fillStyle = 'rgba(180, 255, 240, 0.60)';
  c.fillRect(snap(VX - 2), snap(VY - wallH / 2 + 8), PIXEL, snap(wallH - 16));

  const rand = (seed) => {
    const s = Math.sin(seed * 12.9898) * 43758.5453;
    return s - Math.floor(s);
  };

  const RACK_COUNT = 10;
  const drawRow = (side) => {
    for (let i = RACK_COUNT - 1; i >= 0; i--) {
      const t = (i + 1) / RACK_COUNT;
      const ease = Math.pow(t, 1.55);
      const aisleHalf = 22;
      const farX  = side * aisleHalf;
      const nearX = side * CANVAS_W * 0.50;
      const cx = VX + farX + (nearX - farX) * ease;

      const rackH = snap(48 + 330 * ease);
      const rackW = snap(20 + 150 * ease);
      const rackX = snap(cx - rackW / 2);
      const rackY = snap(VY - rackH * 0.34);

      const depthVal = Math.floor(30 + 210 * ease);
      d.fillStyle = `rgb(${depthVal},${depthVal},${depthVal})`;
      d.fillRect(rackX, rackY, rackW, rackH);

      c.fillStyle = '#0A1420';
      c.fillRect(rackX, rackY, rackW, rackH);
      c.fillStyle = '#1B2A3C';
      c.fillRect(rackX, rackY, PIXEL, rackH);
      c.fillRect(rackX + rackW - PIXEL, rackY, PIXEL, rackH);
      c.fillStyle = '#03060C';
      c.fillRect(rackX, rackY, rackW, PIXEL * 2);
      c.fillRect(rackX, rackY + rackH - PIXEL * 2, rackW, PIXEL * 2);

      const unitH = Math.max(PIXEL * 2, snap(rackH / 22));
      const units = Math.floor((rackH - PIXEL * 6) / unitH);
      const innerX = rackX + PIXEL * 2;
      const innerW = rackW - PIXEL * 4;

      for (let u = 0; u < units; u++) {
        const uy = rackY + PIXEL * 3 + u * unitH;
        c.fillStyle = u % 3 === 0 ? '#0F1C2A' : '#0B1624';
        c.fillRect(innerX, uy, innerW, Math.max(PIXEL, unitH - PIXEL));
        if (unitH >= PIXEL * 3) {
          c.fillStyle = 'rgba(0,0,0,0.35)';
          c.fillRect(innerX, uy + unitH - PIXEL, innerW, 1);
        }
        if (unitH < PIXEL * 3 || innerW < PIXEL * 6) continue;

        const r = rand(i * 53 + u * 17 + (side === 1 ? 7 : 29));
        const ledColor =
          r < 0.55 ? '#33FBD3'
          : r < 0.80 ? '#7BFF9E'
          : r < 0.93 ? '#6DD6FF'
          : '#FF6B7A';
        const ledGlow
