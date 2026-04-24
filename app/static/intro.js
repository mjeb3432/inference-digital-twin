/* ============================================================
 *  The Forge — Opening Intro (vanilla JS / WebGL port)
 *  ---------------------------------------------------------
 *  Vanilla-JS port of the `hero-futuristic` React component,
 *  adapted for "THE FORGE" with a data center photograph
 *  instead of the original hand image. Preserves every key
 *  effect from the source:
 *
 *    - depth-mapped parallax (moves with the pointer)
 *    - red dot-flow band sweeping on the depth axis
 *    - vertical red scan line overlay
 *    - bloom-ish additive glow
 *
 *  Uses three.js WebGL (r160 module) for universal browser
 *  support — WebGPU support is still patchy (Firefox, Safari,
 *  older Chromium). The depth map is SYNTHESIZED from the
 *  photograph on the client (luminance + vertical gradient +
 *  box blur) so we don't need a second hosted asset.
 *
 *  Dismiss handlers live in an inline <script> in forge.html
 *  that runs BEFORE this module — so the overlay is always
 *  dismissable even if this file 404s or WebGL init fails.
 * ============================================================ */

import * as THREE from 'three';

// ---------------------------------------------------------------
// Config
// ---------------------------------------------------------------
// Data-center hot-aisle photograph from Unsplash (CORS-enabled).
// Server racks with directional blue/teal LED lighting — matches
// the Forge's "control-room" aesthetic.
const TEXTURE_URL =
  'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=1920&q=80';

// Entry point
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

  // ---- load photo + synthesize depth map ----
  const loader = new THREE.TextureLoader();
  loader.crossOrigin = 'anonymous';

  const rawMap = await loadTexture(loader, TEXTURE_URL);
  rawMap.colorSpace = THREE.SRGBColorSpace;
  rawMap.minFilter = THREE.LinearFilter;
  rawMap.magFilter = THREE.LinearFilter;
  rawMap.wrapS = THREE.ClampToEdgeWrapping;
  rawMap.wrapT = THREE.ClampToEdgeWrapping;

  const depthMap = await synthesizeDepthMap(TEXTURE_URL);

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

  // ---- sizing ----
  function resize() {
    const { w, h } = sizeOf();
    renderer.setSize(w, h, false);
    uniforms.uAspect.value = w / h;

    // Fit the plane as "cover" — image fills viewport, overflow cropped.
    const imgW = rawMap.image ? rawMap.image.width  : 1920;
    const imgH = rawMap.image ? rawMap.image.height : 1080;
    const imgAspect  = imgW / imgH;
    const viewAspect = w / h;

    let sx = 1, sy = 1;
    if (viewAspect > imgAspect) {
      // viewport wider than image → scale by width, overflow vertically
      sy = (h / w) * imgAspect;
    } else {
      // viewport taller than image → scale by height, overflow horizontally
      sx = (w / h) / imgAspect;
    }
    // Keep slight underscan so edges don't sit hard against UI.
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

  // Mark overlay so CSS can fade the canvas in gently
  root.dataset.canvasReady = 'true';

  function tick() {
    if (disposed) return;
    const t = clock.getElapsedTime();

    // Red scan line + depth-flow band both sweep on the same cycle
    // (~4 second period, matching the React source).
    uniforms.uTime.value = t;
    uniforms.uProgress.value = Math.sin(t * 0.5) * 0.5 + 0.5;

    // Fade in over the first ~1.5 seconds.
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

  // ---- cleanup on dismiss ----
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
// Shaders — straight port of the TSL graph from hero-futuristic
// ---------------------------------------------------------------

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;

  uniform sampler2D uMap;
  uniform sampler2D uDepth;
  uniform vec2  uPointer;
  uniform float uProgress;
  uniform float uTime;
  uniform float uAspect;
  uniform float uOpacity;

  // Cheap hash-based "cell noise" — stands in for mx_cell_noise_float.
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float cellNoise(vec2 p) {
    vec2 i = floor(p);
    return hash12(i);
  }

  // Port of 1 - (1-a)*(1-b) — "blend screen".
  vec3 blendScreen(vec3 a, vec3 b) {
    return 1.0 - (1.0 - a) * (1.0 - b);
  }

  void main() {
    // 1. Depth-parallax sample of the photograph.
    float depth = texture2D(uDepth, vUv).r;
    float strength = 0.012;
    vec2 parallaxUv = vUv + depth * uPointer * strength;
    vec3 tMap = texture2D(uMap, parallaxUv).rgb;

    // Boost the photograph a touch so the reds pop on darker server rooms.
    tMap = pow(tMap, vec3(0.92)) * 1.08;

    // 2. Red dot-flow mask (tiled dots * cell-noise * depth gate).
    vec2 tUv = vec2(vUv.x * uAspect, vUv.y);
    float tiling = 120.0;
    vec2 tiledUv = mod(tUv * tiling, 2.0) - 1.0;
    float brightness = cellNoise(tUv * tiling * 0.5);
    float dist = length(tiledUv);
    float dotShape = smoothstep(0.5, 0.49, dist) * brightness;

    // A narrow band of dots that follows the current "progress" depth.
    float flow = 1.0 - smoothstep(0.0, 0.02, abs(depth - uProgress));
    vec3  mask = vec3(dotShape * flow * 10.0, 0.0, 0.0);

    vec3 blended = blendScreen(tMap, mask);

    // 3. Vertical red scan line — sweeps top↔bottom on the progress uniform.
    float scanWidth = 0.05;
    float scanLine  = smoothstep(0.0, scanWidth, abs(vUv.y - uProgress));
    vec3  redOverlay = vec3(1.0, 0.08, 0.08) * (1.0 - scanLine) * 0.55;
    vec3  withScan = mix(blended, blended + redOverlay,
                         smoothstep(0.9, 1.0, 1.0 - scanLine));

    // 4. Cheap bloom-like lift: take the bright channel and add back.
    float lum = max(max(withScan.r, withScan.g), withScan.b);
    vec3  bloomish = withScan * smoothstep(0.6, 1.1, lum) * 0.6;
    vec3  finalCol = withScan + bloomish;

    // 5. Vignette to keep focus centered.
    float r = length(vUv - 0.5);
    float vignette = smoothstep(0.95, 0.35, r);
    finalCol *= (0.55 + 0.55 * vignette);

    // 6. Warm color grade toward the Forge amber palette.
    finalCol = mix(finalCol, finalCol * vec3(1.08, 0.96, 0.82), 0.35);

    gl_FragColor = vec4(finalCol, uOpacity);
  }
`;

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

function loadTexture(loader, url) {
  return new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });
}

/**
 * Synthesize a depth map from the source photograph.
 *
 * Runs in an offscreen canvas: converts the image to a grayscale
 * depth approximation using luminance + a vertical bias (floors
 * are "closer", ceilings "farther") + a gentle blur. The result
 * is a grayscale DataTexture used by the parallax shader.
 *
 * It's not a MiDaS-quality depth map, but it's "good enough" for
 * the subtle 0.012-strength parallax the shader uses, and it
 * keeps us from needing a second hosted asset.
 */
async function synthesizeDepthMap(imageUrl) {
  const img = await loadImage(imageUrl);

  // Downsample for speed — 512px long edge is plenty for a depth map.
  const target = 512;
  const aspect = img.width / img.height;
  const w = aspect >= 1 ? target : Math.round(target * aspect);
  const h = aspect >= 1 ? Math.round(target / aspect) : target;

  const cnv = document.createElement('canvas');
  cnv.width = w;
  cnv.height = h;
  const ctx = cnv.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);

  const src = ctx.getImageData(0, 0, w, h);
  const depth = new Uint8Array(w * h);

  // Pass 1: luminance + vertical gradient → raw depth guess.
  for (let y = 0; y < h; y++) {
    const vy = y / (h - 1);
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = src.data[i], g = src.data[i + 1], b = src.data[i + 2];
      // Rec. 709 luminance
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      // Bright pixels → closer. Low rows → closer (floors).
      const bias = (1.0 - vy) * 64.0;  // bottom of frame reads closer
      const val = Math.min(255, Math.max(0, lum * 0.7 + bias));
      depth[y * w + x] = val;
    }
  }

  // Pass 2: cheap 3x box blur (horizontal then vertical) to smooth noise.
  const tmp = new Uint8Array(depth.length);
  blurPass(depth, tmp, w, h, true);
  blurPass(tmp, depth, w, h, false);
  blurPass(depth, tmp, w, h, true);
  blurPass(tmp, depth, w, h, false);

  // Pack as R channel of an RGBA texture (three.js supports that everywhere).
  const rgba = new Uint8Array(w * h * 4);
  for (let i = 0, j = 0; i < depth.length; i++, j += 4) {
    const v = depth[i];
    rgba[j] = v; rgba[j + 1] = v; rgba[j + 2] = v; rgba[j + 3] = 255;
  }

  const tex = new THREE.DataTexture(rgba, w, h, THREE.RGBAFormat);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

function blurPass(inArr, outArr, w, h, horizontal) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0, n = 0;
      for (let k = -2; k <= 2; k++) {
        const xx = horizontal ? Math.min(w - 1, Math.max(0, x + k)) : x;
        const yy = horizontal ? y : Math.min(h - 1, Math.max(0, y + k));
        sum += inArr[yy * w + xx];
        n++;
      }
      outArr[y * w + x] = sum / n;
    }
  }
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}
