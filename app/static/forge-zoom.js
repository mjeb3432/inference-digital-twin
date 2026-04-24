/* ============================================================
 * forge-zoom.js — 6-LOD scroll-zoom tour overlay for THE FORGE
 *
 * Adds a self-contained tour overlay on top of #constructionCanvas:
 *   SITE → SHELL → HALL → ROW → RACK → GPU
 *
 * Activated via the [TOUR] toggle in the canvas header. While active,
 * mousewheel steps through LODs with a 320ms crossfade. A scale
 * ladder UI on the right edge shows the active step.
 *
 * Non-invasive: does NOT touch ui.mode or the existing floor-svg
 * wheel handler in forge.js. When inactive, wheel events pass through.
 * ============================================================ */

(function () {
  "use strict";

  const LODS = [
    { key: "SITE",  label: "SITE",  sub: "FACILITY-01 // CAMPUS VIEW" },
    { key: "SHELL", label: "SHELL", sub: "BUILDING ENVELOPE + COOLING YARD" },
    { key: "HALL",  label: "HALL",  sub: "DATA HALL // HOT/COLD AISLES" },
    { key: "ROW",   label: "ROW",   sub: "ROW ELEVATION + POWER WHIP" },
    { key: "RACK",  label: "RACK",  sub: "42U FRONT // GPU COMPUTE NODE" },
    { key: "GPU",   label: "GPU",   sub: "H100 SXM5 // 6×HBM3 + NVLINK" }
  ];

  const MINT = "#33FBD3";
  const LIME = "#7BFF9E";
  const SKY  = "#6DD6FF";
  const WARN = "#FFD166";
  const INK  = "#05070B";

  let state = {
    active: false,
    idx: 0,
    cooldown: 0,
    overlay: null,
    sceneHost: null,
    ladder: null,
    header: null,
    toggleButton: null
  };

  function boot() {
    const canvas = document.getElementById("constructionCanvas");
    if (!canvas) return;

    injectStyles();
    createToggleButton();
    createOverlay(canvas);

    // Wheel handler on overlay only — passes through when inactive.
    window.addEventListener("wheel", onWheel, { passive: false, capture: true });
    window.addEventListener("keydown", onKeyDown);
  }

  function injectStyles() {
    if (document.getElementById("forge-zoom-styles")) return;
    const css = `
      .zoom-tour-toggle {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 8px 14px; min-height: 36px;
        background: rgba(51,251,211,0.06); color: ${MINT};
        border: 1px solid rgba(51,251,211,0.35);
        border-radius: 2px; cursor: pointer;
        font: 500 11px 'IBM Plex Mono', monospace;
        letter-spacing: 0.12em; text-transform: uppercase;
        transition: background 160ms ease, color 160ms ease, border-color 160ms ease;
      }
      .zoom-tour-toggle:hover,
      .zoom-tour-toggle:focus-visible {
        background: rgba(51,251,211,0.14); color: ${INK};
        border-color: ${MINT}; outline: none;
        box-shadow: 0 0 0 2px rgba(51,251,211,0.25);
      }
      .zoom-tour-toggle[aria-pressed="true"] {
        background: ${MINT}; color: ${INK}; border-color: ${MINT};
      }
      .zoom-tour-toggle .dot {
        width: 6px; height: 6px; border-radius: 50%;
        background: ${MINT}; box-shadow: 0 0 6px ${MINT};
      }
      .zoom-tour-toggle[aria-pressed="true"] .dot {
        background: ${INK}; box-shadow: none;
      }

      .zoom-tour-overlay {
        position: absolute; inset: 0; z-index: 40;
        background: radial-gradient(ellipse at center, rgba(5,7,11,0.82) 0%, rgba(5,7,11,0.96) 75%);
        pointer-events: none; opacity: 0; visibility: hidden;
        transition: opacity 220ms ease, visibility 220ms ease;
        overflow: hidden;
      }
      .zoom-tour-overlay.is-active {
        pointer-events: auto; opacity: 1; visibility: visible;
      }

      .zoom-tour-header {
        position: absolute; top: 14px; left: 18px; right: 110px; z-index: 2;
        display: flex; align-items: baseline; gap: 14px;
        font-family: 'IBM Plex Mono', monospace;
      }
      .zoom-tour-header .tour-step {
        color: ${MINT}; font-size: 22px; font-weight: 600; letter-spacing: 0.15em;
        text-shadow: 0 0 14px rgba(51,251,211,0.45);
      }
      .zoom-tour-header .tour-sub {
        color: rgba(255,255,255,0.62); font-size: 10px; letter-spacing: 0.18em;
      }
      .zoom-tour-header .tour-hint {
        margin-left: auto; color: rgba(255,255,255,0.4); font-size: 10px;
        letter-spacing: 0.15em;
      }

      .zoom-tour-scene-host {
        position: absolute; inset: 56px 100px 56px 40px;
        display: flex; align-items: center; justify-content: center;
      }
      .zoom-tour-scene {
        position: absolute; inset: 0;
        display: flex; align-items: center; justify-content: center;
        opacity: 0; transform: scale(0.96);
        transition: opacity 320ms ease, transform 420ms cubic-bezier(0.2,0.7,0.3,1);
      }
      .zoom-tour-scene.is-visible {
        opacity: 1; transform: scale(1);
      }
      .zoom-tour-scene svg { width: 100%; height: 100%; max-height: 100%; }

      .zoom-tour-ladder {
        position: absolute; top: 50%; right: 22px; transform: translateY(-50%);
        display: flex; flex-direction: column; gap: 8px; z-index: 2;
        font-family: 'IBM Plex Mono', monospace; font-size: 10px;
        letter-spacing: 0.15em;
      }
      .zoom-tour-ladder .rung {
        display: flex; align-items: center; gap: 10px;
        color: rgba(255,255,255,0.35); cursor: pointer;
        padding: 6px 8px; border: 1px solid transparent;
        border-radius: 2px; transition: color 160ms ease, border-color 160ms ease;
        min-height: 32px;
      }
      .zoom-tour-ladder .rung:hover,
      .zoom-tour-ladder .rung:focus-visible {
        color: rgba(255,255,255,0.85); outline: none;
        border-color: rgba(51,251,211,0.3);
      }
      .zoom-tour-ladder .rung .tick {
        width: 20px; height: 2px; background: rgba(255,255,255,0.2);
        transition: background 160ms ease, width 160ms ease;
      }
      .zoom-tour-ladder .rung.is-active {
        color: ${MINT};
      }
      .zoom-tour-ladder .rung.is-active .tick {
        background: ${MINT}; width: 34px;
        box-shadow: 0 0 6px rgba(51,251,211,0.6);
      }

      .zoom-tour-progress {
        position: absolute; left: 40px; right: 100px; bottom: 26px; z-index: 2;
        height: 2px; background: rgba(255,255,255,0.08); border-radius: 2px;
        overflow: hidden;
      }
      .zoom-tour-progress .fill {
        height: 100%; width: 0%;
        background: linear-gradient(90deg, ${SKY}, ${MINT}, ${LIME});
        transition: width 320ms ease;
        box-shadow: 0 0 10px rgba(51,251,211,0.4);
      }

      .zoom-tour-hint-line {
        position: absolute; left: 40px; bottom: 10px; z-index: 2;
        color: rgba(255,255,255,0.35);
        font: 500 10px 'IBM Plex Mono', monospace;
        letter-spacing: 0.18em;
      }

      @media (max-width: 900px) {
        .zoom-tour-header { right: 20px; flex-wrap: wrap; }
        .zoom-tour-ladder { display: none; }
        .zoom-tour-scene-host { inset: 68px 20px 56px 20px; }
        .zoom-tour-progress { right: 20px; left: 20px; }
      }
    `;
    const style = document.createElement("style");
    style.id = "forge-zoom-styles";
    style.textContent = css;
    document.head.appendChild(style);
  }

  function createToggleButton() {
    const actions = document.querySelector(".forge-center .canvas-actions");
    if (!actions) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "zoom-tour-toggle";
    btn.setAttribute("aria-pressed", "false");
    btn.setAttribute("aria-label", "Toggle zoom tour");
    btn.innerHTML = `<span class="dot" aria-hidden="true"></span>ZOOM TOUR`;
    btn.addEventListener("click", toggleTour);
    actions.appendChild(btn);
    state.toggleButton = btn;
  }

  function createOverlay(canvas) {
    // Ensure canvas is positioned so absolute children anchor to it.
    const computed = getComputedStyle(canvas);
    if (computed.position === "static") canvas.style.position = "relative";

    const overlay = document.createElement("div");
    overlay.className = "zoom-tour-overlay";
    overlay.setAttribute("aria-hidden", "true");

    const header = document.createElement("div");
    header.className = "zoom-tour-header";
    header.innerHTML = `
      <span class="tour-step" data-role="step">SITE</span>
      <span class="tour-sub" data-role="sub">FACILITY-01 // CAMPUS VIEW</span>
      <span class="tour-hint">&uarr; / &darr; // WHEEL // ESC</span>
    `;

    const sceneHost = document.createElement("div");
    sceneHost.className = "zoom-tour-scene-host";

    const ladder = document.createElement("div");
    ladder.className = "zoom-tour-ladder";
    LODS.forEach((lod, i) => {
      const rung = document.createElement("button");
      rung.type = "button";
      rung.className = "rung";
      rung.dataset.idx = String(i);
      rung.innerHTML = `<span class="tick"></span><span>${lod.label}</span>`;
      rung.addEventListener("click", () => setIdx(i));
      ladder.appendChild(rung);
    });

    const progress = document.createElement("div");
    progress.className = "zoom-tour-progress";
    progress.innerHTML = `<div class="fill" data-role="progress"></div>`;

    const hintLine = document.createElement("div");
    hintLine.className = "zoom-tour-hint-line";
    hintLine.textContent = "SCROLL TO TRAVERSE // ESC TO EXIT";

    overlay.appendChild(header);
    overlay.appendChild(sceneHost);
    overlay.appendChild(ladder);
    overlay.appendChild(progress);
    overlay.appendChild(hintLine);
    canvas.appendChild(overlay);

    // Pre-render all scenes, keep one visible at a time.
    LODS.forEach((lod, i) => {
      const scene = document.createElement("div");
      scene.className = "zoom-tour-scene";
      scene.dataset.idx = String(i);
      scene.innerHTML = renderScene(lod.key);
      sceneHost.appendChild(scene);
    });

    state.overlay = overlay;
    state.sceneHost = sceneHost;
    state.ladder = ladder;
    state.header = header;
  }

  function toggleTour() {
    state.active ? closeTour() : openTour();
  }

  function openTour() {
    if (!state.overlay) return;
    state.active = true;
    state.idx = 0;
    state.overlay.classList.add("is-active");
    state.overlay.setAttribute("aria-hidden", "false");
    state.toggleButton && state.toggleButton.setAttribute("aria-pressed", "true");
    renderActive();
  }

  function closeTour() {
    if (!state.overlay) return;
    state.active = false;
    state.overlay.classList.remove("is-active");
    state.overlay.setAttribute("aria-hidden", "true");
    state.toggleButton && state.toggleButton.setAttribute("aria-pressed", "false");
  }

  function setIdx(i) {
    const clamped = Math.max(0, Math.min(LODS.length - 1, i));
    if (clamped === state.idx) return;
    state.idx = clamped;
    renderActive();
  }

  function renderActive() {
    if (!state.overlay) return;
    const lod = LODS[state.idx];

    // Scene crossfade
    state.sceneHost.querySelectorAll(".zoom-tour-scene").forEach((el) => {
      const isActive = Number(el.dataset.idx) === state.idx;
      el.classList.toggle("is-visible", isActive);
    });

    // Ladder highlight
    state.ladder.querySelectorAll(".rung").forEach((el, i) => {
      el.classList.toggle("is-active", i === state.idx);
    });

    // Header text
    const stepEl = state.header.querySelector('[data-role="step"]');
    const subEl  = state.header.querySelector('[data-role="sub"]');
    if (stepEl) stepEl.textContent = lod.label;
    if (subEl)  subEl.textContent  = lod.sub;

    // Progress bar
    const pct = (state.idx / (LODS.length - 1)) * 100;
    const fill = state.overlay.querySelector('[data-role="progress"]');
    if (fill) fill.style.width = pct.toFixed(1) + "%";
  }

  function onWheel(event) {
    if (!state.active) return;
    // If event isn't targeting overlay area, ignore.
    if (!state.overlay.contains(event.target)) return;

    event.preventDefault();
    event.stopPropagation();

    const now = performance.now();
    if (now - state.cooldown < 160) return;
    state.cooldown = now;

    if (event.deltaY > 0) setIdx(state.idx + 1);
    else if (event.deltaY < 0) setIdx(state.idx - 1);
  }

  function onKeyDown(event) {
    if (!state.active) return;
    if (event.key === "Escape") {
      closeTour();
      event.preventDefault();
    } else if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      setIdx(state.idx + 1);
      event.preventDefault();
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      setIdx(state.idx - 1);
      event.preventDefault();
    }
  }

  /* ============================================================
   * SCENE RENDERERS — SVG, ~1000×560 viewBox, Augur palette
   * ============================================================ */

  function renderScene(key) {
    switch (key) {
      case "SITE":  return sceneSite();
      case "SHELL": return sceneShell();
      case "HALL":  return sceneHall();
      case "ROW":   return sceneRow();
      case "RACK":  return sceneRack();
      case "GPU":   return sceneGpu();
      default:      return "";
    }
  }

  function sceneSite() {
    // Campus view — building footprint, substation, fiber vault, perimeter
    return `
    <svg viewBox="0 0 1000 560" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="siteGrid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(109,214,255,0.08)" stroke-width="0.5"/>
        </pattern>
        <linearGradient id="plot" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="rgba(51,251,211,0.05)"/>
          <stop offset="1" stop-color="rgba(51,251,211,0.015)"/>
        </linearGradient>
      </defs>

      <rect width="1000" height="560" fill="#05070B"/>
      <rect width="1000" height="560" fill="url(#siteGrid)"/>

      <!-- property boundary -->
      <rect x="80" y="60" width="840" height="440" fill="url(#plot)" stroke="rgba(51,251,211,0.35)" stroke-dasharray="6 4" stroke-width="1"/>

      <!-- fiber corridor -->
      <path d="M 80 280 L 380 280" stroke="${SKY}" stroke-width="1.5" stroke-dasharray="3 3" opacity="0.7"/>
      <text x="120" y="270" fill="${SKY}" font-family="IBM Plex Mono" font-size="10" letter-spacing="1">FIBER ↘ 96 STRAND</text>

      <!-- main data hall building -->
      <rect x="380" y="160" width="380" height="240" fill="rgba(51,251,211,0.08)" stroke="${MINT}" stroke-width="1.5"/>
      <text x="570" y="280" text-anchor="middle" fill="${MINT}" font-family="Comfortaa" font-weight="600" font-size="22" letter-spacing="3">DATA HALL</text>
      <text x="570" y="302" text-anchor="middle" fill="rgba(255,255,255,0.5)" font-family="IBM Plex Mono" font-size="10" letter-spacing="1.5">12 MW // 48,000 FT²</text>

      <!-- cooling yard -->
      <g transform="translate(770 180)">
        <rect width="120" height="80" fill="rgba(109,214,255,0.08)" stroke="${SKY}" stroke-width="1"/>
        <circle cx="30" cy="40" r="16" fill="none" stroke="${SKY}" stroke-width="1"/>
        <circle cx="60" cy="40" r="16" fill="none" stroke="${SKY}" stroke-width="1"/>
        <circle cx="90" cy="40" r="16" fill="none" stroke="${SKY}" stroke-width="1"/>
        <text x="60" y="75" text-anchor="middle" fill="${SKY}" font-family="IBM Plex Mono" font-size="9" letter-spacing="1">CHILLER YARD</text>
      </g>

      <!-- substation -->
      <g transform="translate(770 310)">
        <rect width="120" height="70" fill="rgba(255,209,102,0.08)" stroke="${WARN}" stroke-width="1"/>
        <path d="M 10 40 L 30 20 L 30 60 L 50 40 L 70 20 L 70 60 L 90 40 L 110 40" fill="none" stroke="${WARN}" stroke-width="1.2"/>
        <text x="60" y="65" text-anchor="middle" fill="${WARN}" font-family="IBM Plex Mono" font-size="9" letter-spacing="1">25 kV SUBSTATION</text>
      </g>

      <!-- generator yard -->
      <g transform="translate(220 180)">
        <rect width="140" height="80" fill="rgba(123,255,158,0.06)" stroke="${LIME}" stroke-width="1"/>
        <rect x="10" y="15" width="55" height="50" fill="none" stroke="${LIME}" stroke-width="0.8"/>
        <rect x="75" y="15" width="55" height="50" fill="none" stroke="${LIME}" stroke-width="0.8"/>
        <text x="70" y="75" text-anchor="middle" fill="${LIME}" font-family="IBM Plex Mono" font-size="9" letter-spacing="1">GENSET 2×3MW</text>
      </g>

      <!-- fiber vault -->
      <g transform="translate(220 310)">
        <rect width="140" height="70" fill="rgba(109,214,255,0.08)" stroke="${SKY}" stroke-width="1"/>
        <circle cx="70" cy="35" r="18" fill="none" stroke="${SKY}" stroke-width="1"/>
        <circle cx="70" cy="35" r="8" fill="${SKY}" opacity="0.4"/>
        <text x="70" y="62" text-anchor="middle" fill="${SKY}" font-family="IBM Plex Mono" font-size="9" letter-spacing="1">FIBER MEET-ME</text>
      </g>

      <!-- compass + scale -->
      <g transform="translate(880 490)">
        <circle r="18" fill="none" stroke="rgba(255,255,255,0.25)"/>
        <path d="M 0 -14 L 4 4 L 0 0 L -4 4 Z" fill="${MINT}"/>
        <text y="-22" text-anchor="middle" fill="${MINT}" font-family="IBM Plex Mono" font-size="9">N</text>
      </g>
      <g transform="translate(100 490)">
        <line x1="0" y1="0" x2="80" y2="0" stroke="rgba(255,255,255,0.4)" stroke-width="1"/>
        <line x1="0" y1="-4" x2="0" y2="4" stroke="rgba(255,255,255,0.4)"/>
        <line x1="80" y1="-4" x2="80" y2="4" stroke="rgba(255,255,255,0.4)"/>
        <text x="40" y="-8" text-anchor="middle" fill="rgba(255,255,255,0.55)" font-family="IBM Plex Mono" font-size="9" letter-spacing="1">50 m</text>
      </g>
    </svg>`;
  }

  function sceneShell() {
    return `
    <svg viewBox="0 0 1000 560" xmlns="http://www.w3.org/2000/svg">
      <rect width="1000" height="560" fill="#05070B"/>
      <!-- building shell (iso perspective) -->
      <g transform="translate(240 110)">
        <!-- roof top -->
        <polygon points="0,120 260,40 520,120 260,200" fill="rgba(51,251,211,0.06)" stroke="${MINT}" stroke-width="1.2"/>
        <!-- front face -->
        <polygon points="0,120 260,200 260,360 0,280" fill="rgba(5,7,11,0.85)" stroke="${MINT}" stroke-width="1"/>
        <!-- right face -->
        <polygon points="520,120 260,200 260,360 520,280" fill="rgba(5,7,11,0.7)" stroke="${MINT}" stroke-width="1"/>

        <!-- louvred intake wall -->
        ${Array.from({ length: 10 }).map((_, i) =>
          `<line x1="${20 + i * 24}" y1="${140 + i * 6}" x2="${20 + i * 24}" y2="${280 + i * 6}" stroke="rgba(109,214,255,0.35)" stroke-width="1"/>`
        ).join("")}

        <!-- server glow behind facade -->
        <rect x="60" y="200" width="180" height="100" fill="url(#hallGlow)" opacity="0.8"/>

        <!-- door -->
        <rect x="360" y="250" width="30" height="60" fill="rgba(51,251,211,0.1)" stroke="${MINT}" stroke-width="0.8"/>

        <!-- rooftop gear -->
        <g transform="translate(80 60)">
          <rect width="30" height="14" fill="rgba(109,214,255,0.15)" stroke="${SKY}" stroke-width="0.8"/>
          <rect x="40" width="30" height="14" fill="rgba(109,214,255,0.15)" stroke="${SKY}" stroke-width="0.8"/>
          <rect x="80" width="30" height="14" fill="rgba(109,214,255,0.15)" stroke="${SKY}" stroke-width="0.8"/>
        </g>

        <!-- CRAH outlets on side -->
        <g transform="translate(540 160)">
          <rect width="20" height="12" fill="rgba(123,255,158,0.2)" stroke="${LIME}" stroke-width="0.8"/>
          <rect y="30" width="20" height="12" fill="rgba(123,255,158,0.2)" stroke="${LIME}" stroke-width="0.8"/>
          <rect y="60" width="20" height="12" fill="rgba(123,255,158,0.2)" stroke="${LIME}" stroke-width="0.8"/>
        </g>
      </g>

      <defs>
        <linearGradient id="hallGlow" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="rgba(51,251,211,0.0)"/>
          <stop offset="0.5" stop-color="rgba(51,251,211,0.25)"/>
          <stop offset="1" stop-color="rgba(51,251,211,0.0)"/>
        </linearGradient>
      </defs>

      <!-- annotations -->
      <g font-family="IBM Plex Mono" font-size="10" fill="rgba(255,255,255,0.5)" letter-spacing="1.3">
        <line x1="240" y1="150" x2="180" y2="120" stroke="rgba(255,255,255,0.3)"/>
        <text x="80" y="115">↘ LOUVRED INTAKE WALL</text>

        <line x1="780" y1="220" x2="850" y2="220" stroke="rgba(255,255,255,0.3)"/>
        <text x="860" y="224" fill="${LIME}">CRAH EXHAUST</text>

        <line x1="360" y1="140" x2="360" y2="100" stroke="rgba(255,255,255,0.3)"/>
        <text x="280" y="95" fill="${SKY}">ROOFTOP DRY COOLERS</text>
      </g>

      <text x="500" y="40" text-anchor="middle" fill="${MINT}" font-family="Comfortaa" font-weight="600" font-size="18" letter-spacing="4">BUILDING ENVELOPE</text>
      <text x="500" y="540" text-anchor="middle" fill="rgba(255,255,255,0.4)" font-family="IBM Plex Mono" font-size="10" letter-spacing="1.5">48,000 FT² // PUE 1.18 // N+1 COOLING</text>
    </svg>`;
  }

  function sceneHall() {
    // Top-down view of data hall with rows and aisles
    const rows = 8;
    const rackPerRow = 16;
    const rackW = 32, rackH = 14;
    const rowGap = 42;
    const startX = 120, startY = 100;

    let racks = "";
    for (let r = 0; r < rows; r++) {
      const y = startY + r * rowGap;
      const isHot = r % 2 === 1;
      // aisle tint
      racks += `<rect x="${startX - 6}" y="${y - 8}" width="${rackW * rackPerRow + 12}" height="6" fill="${isHot ? 'rgba(255,107,107,0.1)' : 'rgba(109,214,255,0.1)'}"/>`;
      for (let c = 0; c < rackPerRow; c++) {
        const x = startX + c * rackW;
        const load = Math.abs(Math.sin(r * 2.3 + c * 0.7));
        const fill = load > 0.7 ? MINT : load > 0.4 ? SKY : "rgba(255,255,255,0.15)";
        racks += `<rect x="${x}" y="${y}" width="${rackW - 2}" height="${rackH}" fill="rgba(5,7,11,0.95)" stroke="${fill}" stroke-width="0.8"/>`;
        if (load > 0.7) {
          racks += `<rect x="${x + 2}" y="${y + 2}" width="${rackW - 6}" height="2" fill="${MINT}" opacity="0.8"/>`;
        }
      }
      // row label
      racks += `<text x="${startX - 14}" y="${y + 11}" fill="rgba(255,255,255,0.35)" font-family="IBM Plex Mono" font-size="9" letter-spacing="1">R${String.fromCharCode(65 + r)}</text>`;
    }

    return `
    <svg viewBox="0 0 1000 560" xmlns="http://www.w3.org/2000/svg">
      <rect width="1000" height="560" fill="#05070B"/>

      <!-- hall boundary -->
      <rect x="80" y="70" width="780" height="400" fill="rgba(51,251,211,0.02)" stroke="rgba(51,251,211,0.35)" stroke-width="1"/>

      ${racks}

      <!-- CRAH units along walls -->
      ${Array.from({ length: 4 }).map((_, i) =>
        `<g transform="translate(${680 + i * 40} 80)">
          <rect width="30" height="14" fill="rgba(109,214,255,0.15)" stroke="${SKY}" stroke-width="1"/>
          <circle cx="15" cy="7" r="4" fill="none" stroke="${SKY}" stroke-width="0.6"/>
        </g>`
      ).join("")}
      ${Array.from({ length: 4 }).map((_, i) =>
        `<g transform="translate(${680 + i * 40} 456)">
          <rect width="30" height="14" fill="rgba(109,214,255,0.15)" stroke="${SKY}" stroke-width="1"/>
          <circle cx="15" cy="7" r="4" fill="none" stroke="${SKY}" stroke-width="0.6"/>
        </g>`
      ).join("")}

      <!-- PDUs at row ends -->
      ${Array.from({ length: 8 }).map((_, r) =>
        `<rect x="96" y="${100 + r * 42}" width="18" height="14" fill="rgba(255,209,102,0.15)" stroke="${WARN}" stroke-width="0.8"/>`
      ).join("")}

      <!-- legend -->
      <g transform="translate(80 500)" font-family="IBM Plex Mono" font-size="10" letter-spacing="1.3">
        <rect width="10" height="4" y="5" fill="rgba(109,214,255,0.35)"/>
        <text x="16" y="12" fill="rgba(255,255,255,0.6)">COLD AISLE</text>
        <rect x="120" width="10" height="4" y="5" fill="rgba(255,107,107,0.35)"/>
        <text x="136" y="12" fill="rgba(255,255,255,0.6)">HOT AISLE</text>
        <rect x="240" width="10" height="10" fill="rgba(5,7,11,0.95)" stroke="${MINT}"/>
        <text x="256" y="9" fill="rgba(255,255,255,0.6)">GPU RACK · ACTIVE</text>
        <rect x="420" width="10" height="10" fill="rgba(5,7,11,0.95)" stroke="rgba(255,255,255,0.2)"/>
        <text x="436" y="9" fill="rgba(255,255,255,0.6)">RACK · IDLE</text>
      </g>

      <text x="500" y="50" text-anchor="middle" fill="${MINT}" font-family="Comfortaa" font-weight="600" font-size="18" letter-spacing="4">DATA HALL // TOP-DOWN</text>
    </svg>`;
  }

  function sceneRow() {
    // Side elevation of a row: rack silhouettes + overhead cable tray + power whip
    const rackCount = 8;
    const rackW = 74, rackH = 220;
    const startX = 120, startY = 160;

    let racks = "";
    for (let i = 0; i < rackCount; i++) {
      const x = startX + i * (rackW + 6);
      racks += `
        <rect x="${x}" y="${startY}" width="${rackW}" height="${rackH}" fill="rgba(5,7,11,0.95)" stroke="${MINT}" stroke-width="1"/>
        <!-- U markings -->
        ${Array.from({ length: 10 }).map((_, u) =>
          `<line x1="${x + 4}" y1="${startY + 10 + u * 20}" x2="${x + rackW - 4}" y2="${startY + 10 + u * 20}" stroke="rgba(255,255,255,0.1)" stroke-width="0.4"/>`
        ).join("")}
        <!-- chassis -->
        <rect x="${x + 6}" y="${startY + 30}" width="${rackW - 12}" height="16" fill="rgba(51,251,211,0.15)" stroke="${MINT}" stroke-width="0.5"/>
        <rect x="${x + 6}" y="${startY + 60}" width="${rackW - 12}" height="32" fill="rgba(109,214,255,0.1)" stroke="${SKY}" stroke-width="0.5"/>
        <rect x="${x + 6}" y="${startY + 100}" width="${rackW - 12}" height="32" fill="rgba(109,214,255,0.1)" stroke="${SKY}" stroke-width="0.5"/>
        <rect x="${x + 6}" y="${startY + 140}" width="${rackW - 12}" height="32" fill="rgba(123,255,158,0.1)" stroke="${LIME}" stroke-width="0.5"/>
        <!-- status LED strip -->
        <rect x="${x + 6}" y="${startY + 180}" width="${rackW - 12}" height="4" fill="${MINT}" opacity="${0.3 + (i % 3) * 0.22}"/>
        <!-- rack label -->
        <text x="${x + rackW / 2}" y="${startY + rackH + 14}" text-anchor="middle" fill="rgba(255,255,255,0.5)" font-family="IBM Plex Mono" font-size="9" letter-spacing="1">RACK ${String.fromCharCode(65 + (i % 4))}${(i % 4) + 1}</text>
      `;
    }

    // Cable tray
    let tray = `<rect x="100" y="110" width="${(rackW + 6) * rackCount + 20}" height="18" fill="rgba(109,214,255,0.08)" stroke="${SKY}" stroke-width="1"/>`;
    for (let i = 0; i < 20; i++) {
      tray += `<line x1="${110 + i * 30}" y1="110" x2="${110 + i * 30}" y2="128" stroke="${SKY}" stroke-width="0.4" opacity="0.5"/>`;
    }
    tray += `<text x="108" y="105" fill="${SKY}" font-family="IBM Plex Mono" font-size="9" letter-spacing="1">FIBER/COPPER CABLE TRAY</text>`;

    // Power whip
    let whip = "";
    for (let i = 0; i < rackCount; i++) {
      const x = startX + i * (rackW + 6) + rackW / 2;
      whip += `<path d="M ${x} 128 L ${x - 4} 145 L ${x + 4} 155 L ${x} 160" stroke="${WARN}" stroke-width="1" fill="none"/>`;
    }
    whip = `<g opacity="0.8">${whip}</g>`;

    // Floor + busway
    const floorY = startY + rackH + 30;
    const busway = `
      <rect x="100" y="${floorY}" width="${(rackW + 6) * rackCount + 20}" height="12" fill="rgba(255,209,102,0.08)" stroke="${WARN}" stroke-width="1"/>
      <text x="108" y="${floorY + 24}" fill="${WARN}" font-family="IBM Plex Mono" font-size="9" letter-spacing="1">OVERHEAD BUSWAY // 400 A · 415 V</text>
    `;

    // Cold/hot aisle hint
    const aisles = `
      <rect x="100" y="${startY - 20}" width="${(rackW + 6) * rackCount + 20}" height="8" fill="rgba(109,214,255,0.12)"/>
      <text x="108" y="${startY - 24}" fill="${SKY}" font-family="IBM Plex Mono" font-size="9" letter-spacing="1">← COLD AISLE 22°C</text>
    `;

    return `
    <svg viewBox="0 0 1000 560" xmlns="http://www.w3.org/2000/svg">
      <rect width="1000" height="560" fill="#05070B"/>
      ${tray}
      ${whip}
      ${aisles}
      ${racks}
      ${busway}
      <text x="500" y="50" text-anchor="middle" fill="${MINT}" font-family="Comfortaa" font-weight="600" font-size="18" letter-spacing="4">ROW ELEVATION // A1–A8</text>
    </svg>`;
  }

  function sceneRack() {
    // 42U rack front view
    const unitH = 11;
    const rackW = 280;
    const startX = 360, startY = 50;

    let frame = `
      <rect x="${startX - 14}" y="${startY - 12}" width="${rackW + 28}" height="${42 * unitH + 40}" fill="rgba(5,7,11,0.98)" stroke="${MINT}" stroke-width="1.5"/>
      <rect x="${startX}" y="${startY}" width="${rackW}" height="${42 * unitH}" fill="#05070B" stroke="rgba(255,255,255,0.12)" stroke-width="0.8"/>
    `;

    // U labels
    for (let u = 1; u <= 42; u += 3) {
      frame += `<text x="${startX - 18}" y="${startY + (42 - u + 1) * unitH - 2}" text-anchor="end" fill="rgba(255,255,255,0.3)" font-family="IBM Plex Mono" font-size="7" letter-spacing="0.5">${String(u).padStart(2, "0")}U</text>`;
    }

    // Chassis layout — bottom to top:
    // 1U (x2) PDUs, 2U switch, 4U GPU servers (x7), 2U storage, 1U ToR switch, cable org
    const items = [
      { u: 1, h: 1, label: "PDU · 415V · 32A", color: WARN, kind: "pdu" },
      { u: 2, h: 1, label: "PDU · 415V · 32A", color: WARN, kind: "pdu" },
      { u: 3, h: 1, label: "MGMT SWITCH · 48P", color: SKY, kind: "switch" },
      { u: 4, h: 2, label: "CABLE ORG", color: "rgba(255,255,255,0.25)", kind: "cable" },
      { u: 6, h: 4, label: "GPU NODE 01 · 8×H100", color: MINT, kind: "gpu" },
      { u: 10, h: 4, label: "GPU NODE 02 · 8×H100", color: MINT, kind: "gpu" },
      { u: 14, h: 4, label: "GPU NODE 03 · 8×H100", color: MINT, kind: "gpu" },
      { u: 18, h: 4, label: "GPU NODE 04 · 8×H100", color: MINT, kind: "gpu" },
      { u: 22, h: 2, label: "CABLE ORG", color: "rgba(255,255,255,0.25)", kind: "cable" },
      { u: 24, h: 4, label: "GPU NODE 05 · 8×H100", color: MINT, kind: "gpu" },
      { u: 28, h: 4, label: "GPU NODE 06 · 8×H100", color: MINT, kind: "gpu" },
      { u: 32, h: 2, label: "NVMe STORAGE · 240 TB", color: LIME, kind: "storage" },
      { u: 34, h: 2, label: "LEAF SW · 64×400G QSFP", color: SKY, kind: "switch" },
      { u: 36, h: 1, label: "CABLE ORG", color: "rgba(255,255,255,0.25)", kind: "cable" },
      { u: 37, h: 4, label: "GPU NODE 07 · 8×H100", color: MINT, kind: "gpu" },
      { u: 41, h: 2, label: "SPARE", color: "rgba(255,255,255,0.15)", kind: "spare" }
    ];

    let chassis = "";
    items.forEach((it) => {
      const y = startY + (42 - it.u - it.h + 1) * unitH;
      const h = it.h * unitH - 1;
      chassis += `<rect x="${startX + 3}" y="${y}" width="${rackW - 6}" height="${h}" fill="rgba(5,7,11,0.98)" stroke="${it.color}" stroke-width="0.8"/>`;
      if (it.kind === "gpu") {
        // 8 GPU bays
        for (let i = 0; i < 8; i++) {
          const bx = startX + 8 + i * ((rackW - 22) / 8);
          chassis += `<rect x="${bx}" y="${y + 3}" width="${(rackW - 22) / 8 - 2}" height="${h - 6}" fill="rgba(51,251,211,0.08)" stroke="${MINT}" stroke-width="0.4"/>`;
        }
        // status LED
        chassis += `<rect x="${startX + rackW - 10}" y="${y + 3}" width="4" height="${h - 6}" fill="${MINT}"/>`;
      } else if (it.kind === "switch") {
        // ports
        for (let i = 0; i < 24; i++) {
          chassis += `<rect x="${startX + 10 + i * 10}" y="${y + 3}" width="7" height="${h - 6}" fill="rgba(109,214,255,0.3)"/>`;
        }
      } else if (it.kind === "pdu") {
        // outlet strip
        for (let i = 0; i < 12; i++) {
          chassis += `<circle cx="${startX + 18 + i * 20}" cy="${y + h / 2}" r="2" fill="${WARN}" opacity="0.7"/>`;
        }
      } else if (it.kind === "storage") {
        // drive bays
        for (let r = 0; r < 2; r++) {
          for (let i = 0; i < 12; i++) {
            chassis += `<rect x="${startX + 10 + i * 20}" y="${y + 3 + r * 9}" width="16" height="7" fill="rgba(123,255,158,0.15)" stroke="${LIME}" stroke-width="0.3"/>`;
          }
        }
      } else if (it.kind === "cable") {
        // squiggle
        let path = `M ${startX + 10} ${y + h / 2}`;
        for (let i = 0; i < 20; i++) {
          path += ` q 6 ${i % 2 === 0 ? -4 : 4} 12 0`;
        }
        chassis += `<path d="${path}" stroke="rgba(255,255,255,0.25)" stroke-width="1" fill="none"/>`;
      }
      // label to the right
      chassis += `<text x="${startX + rackW + 24}" y="${y + h / 2 + 3}" fill="${it.color}" font-family="IBM Plex Mono" font-size="9" letter-spacing="1">${it.label}</text>`;
    });

    return `
    <svg viewBox="0 0 1000 560" xmlns="http://www.w3.org/2000/svg">
      <rect width="1000" height="560" fill="#05070B"/>

      <!-- airflow arrows on left -->
      <g opacity="0.5">
        ${Array.from({ length: 6 }).map((_, i) =>
          `<g transform="translate(200 ${80 + i * 70})">
            <path d="M 0 0 L 60 0 M 50 -5 L 60 0 L 50 5" stroke="${SKY}" stroke-width="1" fill="none"/>
            <text x="30" y="-8" text-anchor="middle" fill="${SKY}" font-family="IBM Plex Mono" font-size="9" letter-spacing="1">COLD IN</text>
          </g>`
        ).join("")}
      </g>

      ${frame}
      ${chassis}

      <text x="500" y="40" text-anchor="middle" fill="${MINT}" font-family="Comfortaa" font-weight="600" font-size="18" letter-spacing="4">RACK A1 // 42U COMPUTE</text>
      <text x="500" y="540" text-anchor="middle" fill="rgba(255,255,255,0.45)" font-family="IBM Plex Mono" font-size="10" letter-spacing="1.5">56×H100 · 42.4 KW DRAW · HYBRID DLC</text>
    </svg>`;
  }

  function sceneGpu() {
    // H100 SXM5 — die with 6 HBM stacks + NVLink
    const pkgX = 320, pkgY = 130, pkgW = 360, pkgH = 300;

    return `
    <svg viewBox="0 0 1000 560" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="dieGlow" cx="0.5" cy="0.5" r="0.6">
          <stop offset="0" stop-color="rgba(51,251,211,0.4)"/>
          <stop offset="1" stop-color="rgba(51,251,211,0)"/>
        </radialGradient>
        <linearGradient id="hbmGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="rgba(109,214,255,0.35)"/>
          <stop offset="1" stop-color="rgba(109,214,255,0.08)"/>
        </linearGradient>
      </defs>
      <rect width="1000" height="560" fill="#05070B"/>

      <!-- package substrate -->
      <rect x="${pkgX}" y="${pkgY}" width="${pkgW}" height="${pkgH}" rx="6" fill="rgba(16,22,32,0.98)" stroke="${MINT}" stroke-width="1.5"/>

      <!-- BGA pads around edges -->
      <g opacity="0.4">
        ${Array.from({ length: 38 }).map((_, i) =>
          `<circle cx="${pkgX + 12 + (i * (pkgW - 24)) / 37}" cy="${pkgY + pkgH - 6}" r="2" fill="${WARN}"/>`
        ).join("")}
        ${Array.from({ length: 38 }).map((_, i) =>
          `<circle cx="${pkgX + 12 + (i * (pkgW - 24)) / 37}" cy="${pkgY + 6}" r="2" fill="${WARN}"/>`
        ).join("")}
      </g>

      <!-- die (GH100) -->
      <g transform="translate(${pkgX + 115} ${pkgY + 85})">
        <rect width="130" height="130" fill="rgba(51,251,211,0.12)" stroke="${MINT}" stroke-width="1.2"/>
        <rect width="130" height="130" fill="url(#dieGlow)"/>
        <!-- SM grid: 8x16 streaming multiprocessors -->
        ${Array.from({ length: 8 }).flatMap((_, r) =>
          Array.from({ length: 16 }).map((_, c) =>
            `<rect x="${4 + c * 7.6}" y="${4 + r * 15.5}" width="6.6" height="14.5" fill="rgba(51,251,211,${0.15 + ((r + c) % 5) * 0.08})" stroke="rgba(51,251,211,0.4)" stroke-width="0.3"/>`
          )
        ).join("")}
        <text x="65" y="145" text-anchor="middle" fill="${MINT}" font-family="IBM Plex Mono" font-size="9" letter-spacing="1.5">GH100 · 814 mm²</text>
      </g>

      <!-- 6 HBM3 stacks — 3 each side of die -->
      ${[0, 1, 2].map((i) =>
        `<g transform="translate(${pkgX + 30} ${pkgY + 95 + i * 45})">
          <rect width="70" height="34" fill="url(#hbmGrad)" stroke="${SKY}" stroke-width="1"/>
          ${Array.from({ length: 4 }).map((_, s) =>
            `<rect y="${4 + s * 7}" width="70" height="5" fill="rgba(109,214,255,0.08)" stroke="${SKY}" stroke-width="0.3"/>`
          ).join("")}
          <text x="35" y="22" text-anchor="middle" fill="${SKY}" font-family="IBM Plex Mono" font-size="8" letter-spacing="1">HBM3 · 16GB</text>
        </g>`
      ).join("")}
      ${[0, 1, 2].map((i) =>
        `<g transform="translate(${pkgX + 260} ${pkgY + 95 + i * 45})">
          <rect width="70" height="34" fill="url(#hbmGrad)" stroke="${SKY}" stroke-width="1"/>
          ${Array.from({ length: 4 }).map((_, s) =>
            `<rect y="${4 + s * 7}" width="70" height="5" fill="rgba(109,214,255,0.08)" stroke="${SKY}" stroke-width="0.3"/>`
          ).join("")}
          <text x="35" y="22" text-anchor="middle" fill="${SKY}" font-family="IBM Plex Mono" font-size="8" letter-spacing="1">HBM3 · 16GB</text>
        </g>`
      ).join("")}

      <!-- NVLink pads bottom of package -->
      <g transform="translate(${pkgX + 40} ${pkgY + pkgH - 52})">
        ${Array.from({ length: 18 }).map((_, i) =>
          `<rect x="${i * 15}" y="0" width="12" height="30" fill="rgba(123,255,158,0.2)" stroke="${LIME}" stroke-width="0.6"/>`
        ).join("")}
        <text x="135" y="44" text-anchor="middle" fill="${LIME}" font-family="IBM Plex Mono" font-size="9" letter-spacing="1.5">NVLINK 4.0 · 900 GB/s · 18 LINKS</text>
      </g>

      <!-- callouts -->
      <g font-family="IBM Plex Mono" font-size="10" letter-spacing="1.3">
        <line x1="${pkgX + 180}" y1="${pkgY + 150}" x2="${pkgX + 540}" y2="${pkgY - 20}" stroke="rgba(51,251,211,0.4)" stroke-width="0.8"/>
        <text x="${pkgX + 545}" y="${pkgY - 24}" fill="${MINT}">GH100 DIE · 80 GB · 3.35 TB/s</text>
        <text x="${pkgX + 545}" y="${pkgY - 10}" fill="rgba(255,255,255,0.5)">132 SM · 989 TFLOPS FP16 · 3958 TOPS INT8</text>

        <line x1="${pkgX + 64}" y1="${pkgY + 125}" x2="${pkgX - 120}" y2="${pkgY + 60}" stroke="rgba(109,214,255,0.4)" stroke-width="0.8"/>
        <text x="${pkgX - 130}" y="${pkgY + 56}" text-anchor="end" fill="${SKY}">6× HBM3 · 96 GB · 3.0 TB/s</text>

        <line x1="${pkgX + 180}" y1="${pkgY + pkgH - 35}" x2="${pkgX + 540}" y2="${pkgY + pkgH + 40}" stroke="rgba(123,255,158,0.4)" stroke-width="0.8"/>
        <text x="${pkgX + 545}" y="${pkgY + pkgH + 44}" fill="${LIME}">NVLINK 4.0 · 18 lanes · 900 GB/s</text>
      </g>

      <text x="500" y="40" text-anchor="middle" fill="${MINT}" font-family="Comfortaa" font-weight="600" font-size="18" letter-spacing="4">H100 SXM5 // COMPUTE UNIT</text>
      <text x="500" y="540" text-anchor="middle" fill="rgba(255,255,255,0.45)" font-family="IBM Plex Mono" font-size="10" letter-spacing="1.5">TDP 700 W · 80 GB HBM3 · 18× NVLINK · TSMC N4</text>
    </svg>`;
  }

  // Boot when DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
