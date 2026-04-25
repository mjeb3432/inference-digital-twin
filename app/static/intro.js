/* ============================================================
 *  The Forge — Opening Intro (WebGL2 data center depth scan)
 *  ---------------------------------------------------------
 *  Vanilla WebGL2 — NO three.js dependency.
 *
 *  Renders a procedural pixel-art rack wall (8 racks, mixed
 *  1U/2U/4U/6U gear: servers, switches, storage, GPU boxes,
 *  cable orgs, blanks) into a hidden colour-map canvas plus a
 *  matching depth-map canvas. The depth map is what lets the
 *  scan "flow through" the geometry instead of riding on top.
 *
 *  Animation timeline:
 *    0.00 - 0.75s   water drop falls from above to image centre
 *    0.75 - 0.95s   impact flash + shockwave at the centre
 *    0.75s onwards  outward water-ripples emit every 2.6s, each
 *                   ring drives a depth-tomography slice through
 *                   the rack volume (visible as mint/lime dots)
 *
 *  Pointer parallax: cursor shifts depth-near elements more than
 *  far ones (classic 21st.dev pattern: uv += (1-d) * pointer * k).
 *
 *  Dismiss handlers live in an inline <script> in forge.html that
 *  runs BEFORE this module — the overlay is ALWAYS dismissable
 *  (Enter / Space / Esc / click) even if WebGL2 init fails.
 * ============================================================ */

(function () {
  const overlay = document.getElementById("introOverlay");
  if (!overlay) return;

  const canvas = overlay.querySelector(".intro-canvas");
  if (!canvas) return;

  const colorCvs = document.createElement("canvas");
  const depthCvs = document.createElement("canvas");

  // -----------------------------------------------------------
  // BOOT — invoked at the bottom of the IIFE (after VERTEX_SRC /
  // FRAGMENT_SRC are out of the temporal dead zone).
  // -----------------------------------------------------------
  function boot(scan, ccvs, dcvs) {
    const COLOR_W = 1000;
    const COLOR_H = 560;

    ccvs.width = COLOR_W;
    ccvs.height = COLOR_H;
    dcvs.width = COLOR_W;
    dcvs.height = COLOR_H;

    const cctx = ccvs.getContext("2d");
    const dctx = dcvs.getContext("2d");
    cctx.imageSmoothingEnabled = false;
    dctx.imageSmoothingEnabled = false;

    paintRackWall(cctx, dctx, COLOR_W, COLOR_H);

    const gl = scan.getContext("webgl2", {
      antialias: false,
      premultipliedAlpha: false,
    });
    if (!gl) throw new Error("WebGL2 unavailable");

    function resizeCanvas() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      scan.width = Math.floor(window.innerWidth * dpr);
      scan.height = Math.floor(window.innerHeight * dpr);
      gl.viewport(0, 0, scan.width, scan.height);
    }
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SRC);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC);
    const prog = linkProgram(gl, vs, fs);
    gl.useProgram(prog);

    const quad = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    makeTex(gl, ccvs, 0);
    makeTex(gl, dcvs, 1);
    gl.uniform1i(gl.getUniformLocation(prog, "uColor"), 0);
    gl.uniform1i(gl.getUniformLocation(prog, "uDepth"), 1);

    const uTime = gl.getUniformLocation(prog, "uTime");
    const uRes = gl.getUniformLocation(prog, "uRes");
    const uImgSize = gl.getUniformLocation(prog, "uImgSize");
    const uImgCenter = gl.getUniformLocation(prog, "uImgCenter");
    const uReveal = gl.getUniformLocation(prog, "uReveal");
    const uFallProgress = gl.getUniformLocation(prog, "uFallProgress");
    const uImpactFlash = gl.getUniformLocation(prog, "uImpactFlash");
    const uRippleTime = gl.getUniformLocation(prog, "uRippleTime");

    // HUD elements (optional — not all overlays include them)
    const depthEl = overlay.querySelector("[data-intro-hud='depth']");
    const layerEl = overlay.querySelector("[data-intro-hud='layer']");
    const mwEl = overlay.querySelector("[data-intro-hud='mw']");
    const logFeed = overlay.querySelector("[data-intro-hud='log']");

    const LAYERS = [
      [0.0, "AIR"],
      [0.14, "FRAME"],
      [0.22, "BEZEL"],
      [0.3, "VENT"],
      [0.46, "CHASSIS"],
      [0.6, "DEEP"],
      [0.76, "BACKPLANE"],
      [0.88, "WALL"],
    ];
    function layerFor(p) {
      let name = "AIR";
      for (const [t, n] of LAYERS) if (p >= t) name = n;
      return name;
    }

    const logMessages = [
      { tag: "SCAN", msg: "Lock on frame @ 0.18" },
      { tag: "SCAN", msg: "Bezel layer traced — 192 units" },
      { tag: "POWER", msg: "Draw 11.48 MW / 16.00 MW" },
      { tag: "SCAN", msg: "GPU enclosures visible R04..R06" },
      { tag: "TEMP", msg: "Cold aisle 18.2°C · green" },
      { tag: "SCAN", msg: "Backplane trace normal" },
      { tag: "NET", msg: "Switch ports 142/192 active" },
      { tag: "SCAN", msg: "Pivot depth 0.52 — blades" },
      { tag: "UTIL", msg: "Utilization 71.4% · trending flat" },
      { tag: "SCAN", msg: "Frame return · reverse sweep" },
    ];
    let logIdx = 0;
    let logTimer = null;
    if (logFeed) {
      logTimer = setInterval(() => {
        const m = logMessages[logIdx % logMessages.length];
        const div = document.createElement("div");
        div.className = "log-line";
        div.innerHTML = `<span class="tag">${m.tag}</span>${m.msg}`;
        logFeed.insertBefore(div, logFeed.firstChild);
        while (logFeed.childElementCount > 5) logFeed.removeChild(logFeed.lastChild);
        logIdx++;
      }, 1500);
    }

    const start = performance.now();
    const FALL_DUR = 0.75;
    const IMPACT_DUR = 0.2;
    const ripplePeriodHud = 2.6;
    const rippleSpeedHud = 0.22;

    let stopped = false;
    function frame() {
      if (stopped || overlay.dataset.state === "gone") return;
      const t = (performance.now() - start) / 1000;

      let fallProgress = t < FALL_DUR ? t / FALL_DUR : 1.5;
      let impactFlashV = 0.0;
      if (t >= FALL_DUR && t < FALL_DUR + IMPACT_DUR + 0.4) {
        const it = (t - FALL_DUR) / IMPACT_DUR;
        impactFlashV = Math.max(0.0, Math.exp(-it * 2.6));
      }
      const rippleTimeV = t >= FALL_DUR ? t - FALL_DUR : -1.0;

      let progress = 0.0;
      if (rippleTimeV >= 0.0) {
        const latest = Math.floor(rippleTimeV / ripplePeriodHud);
        const rt = rippleTimeV - latest * ripplePeriodHud;
        progress = Math.max(0.02, Math.min(0.96, (rt * rippleSpeedHud) / 0.9));
      }

      const revealV = Math.min(1.0, Math.max(0.0, (t - 0.1) / 0.6));

      const imgAR = COLOR_W / COLOR_H;
      const scrAR = window.innerWidth / window.innerHeight;
      const fit = 0.62;
      let imgW, imgH;
      if (scrAR > imgAR) {
        imgH = fit;
        imgW = (fit * imgAR) / scrAR;
      } else {
        imgW = fit;
        imgH = (fit * scrAR) / imgAR;
      }

      gl.uniform1f(uTime, t);
      gl.uniform2f(uRes, scan.width, scan.height);
      gl.uniform2f(uImgSize, imgW, imgH);
      gl.uniform2f(uImgCenter, 0.5, 0.5);
      gl.uniform1f(uReveal, revealV);
      gl.uniform1f(uFallProgress, fallProgress);
      gl.uniform1f(uImpactFlash, impactFlashV);
      gl.uniform1f(uRippleTime, rippleTimeV);

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      // HUD — throttle to ~10Hz
      if (((t * 10) | 0) !== (((t - 0.016) * 10) | 0)) {
        if (depthEl) depthEl.textContent = progress.toFixed(3);
        if (layerEl) layerEl.textContent = layerFor(progress);
        if (mwEl) {
          const mw = 11.48 + Math.sin(t * 0.42) * 0.22;
          mwEl.textContent = mw.toFixed(2) + " MW";
        }
      }

      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    // Stop the render loop the moment the overlay is dismissed —
    // keeps the GPU idle once the user is in the Forge.
    document.addEventListener("forge:intro-complete", () => {
      stopped = true;
      if (logTimer) clearInterval(logTimer);
    });
  }

  // -----------------------------------------------------------
  // PROCEDURAL RACK WALL — paints colour + depth maps
  // -----------------------------------------------------------
  function paintRackWall(cctx, dctx, COLOR_W, COLOR_H) {
    const setDepth = (v) => {
      const g = Math.max(0, Math.min(255, Math.round(v * 255)));
      return `rgb(${g},${g},${g})`;
    };
    const depthRect = (x, y, w, h, d) => {
      dctx.fillStyle = setDepth(d);
      dctx.fillRect(x, y, w, h);
    };

    // Deterministic PRNG so the wall is identical every load
    function mulberry32(seed) {
      let t = seed >>> 0;
      return function () {
        t = (t + 0x6d2b79f5) >>> 0;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
      };
    }
    const rng = mulberry32(1337);

    // Background + back wall
    cctx.fillStyle = "#070B13";
    cctx.fillRect(0, 0, COLOR_W, COLOR_H);
    dctx.fillStyle = setDepth(0.93);
    dctx.fillRect(0, 0, COLOR_W, COLOR_H);

    // Floor
    cctx.fillStyle = "#0A111C";
    cctx.fillRect(0, 490, COLOR_W, 70);
    depthRect(0, 490, COLOR_W, 70, 0.88);

    // Floor grid + perspective
    cctx.strokeStyle = "rgba(90, 140, 180, 0.08)";
    cctx.lineWidth = 1;
    for (let i = 0; i < 12; i++) {
      const y = 490 + i * 6;
      cctx.beginPath();
      cctx.moveTo(0, y);
      cctx.lineTo(COLOR_W, y);
      cctx.stroke();
    }
    for (let i = 0; i <= 14; i++) {
      cctx.beginPath();
      cctx.moveTo(i * (COLOR_W / 14), 560);
      cctx.lineTo(COLOR_W / 2, 490);
      cctx.stroke();
    }

    // Overhead cable tray
    cctx.fillStyle = "#0E1622";
    cctx.fillRect(0, 28, COLOR_W, 10);
    depthRect(0, 28, COLOR_W, 10, 0.22);
    for (let x = 0; x < COLOR_W; x += 24) {
      cctx.fillStyle = "#1B2836";
      cctx.fillRect(x, 30, 1, 6);
    }

    const CHASSIS_A = "#1A222F";
    const CHASSIS_B = "#212B3B";
    const CHASSIS_C = "#2A3647";
    const CHASSIS_D = "#111821";
    const GRILLE = "#0A1119";
    const SCREW = "#3B4A5E";
    const LABEL = "#2F3C50";
    const LED_GREEN = "#4AE091";
    const LED_AMBER = "#FFB750";
    const LED_RED = "#FF5A6E";
    const LED_CYAN = "#6AE0FF";

    const D_FRAME = 0.18;
    const D_BEZEL = 0.26;
    const D_INNER = 0.5;
    const D_DEEP = 0.66;

    function draw1USrv(ctx, x, y, w, h, d, r) {
      ctx.fillStyle = CHASSIS_B;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = CHASSIS_D;
      ctx.fillRect(x, y, w, 1);
      ctx.fillRect(x, y + h - 1, w, 1);
      const gW = Math.floor(w * 0.52);
      ctx.fillStyle = GRILLE;
      ctx.fillRect(x + 4, y + 2, gW, h - 4);
      ctx.fillStyle = CHASSIS_A;
      for (let dy = 0; dy < h - 4; dy += 2) {
        for (let dx = 0; dx < gW - 1; dx += 2) {
          ctx.fillRect(x + 5 + dx, y + 3 + dy, 1, 1);
        }
      }
      const lx = x + gW + 8;
      ctx.fillStyle = r() > 0.18 ? LED_GREEN : r() > 0.5 ? LED_AMBER : LED_RED;
      ctx.fillRect(lx, y + 2, 2, 2);
      ctx.fillStyle = r() > 0.3 ? LED_CYAN : LED_GREEN;
      ctx.fillRect(lx + 4, y + 2, 2, 2);
      ctx.fillStyle = LABEL;
      ctx.fillRect(x + w - 22, y + 2, 18, h - 4);
      ctx.fillStyle = SCREW;
      ctx.fillRect(x + 1, y + 1, 1, 1);
      ctx.fillRect(x + w - 2, y + 1, 1, 1);
      ctx.fillRect(x + 1, y + h - 2, 1, 1);
      ctx.fillRect(x + w - 2, y + h - 2, 1, 1);
      depthRect(x, y, w, h, d);
      depthRect(x + 4, y + 2, gW, h - 4, d + 0.18);
    }

    function draw2USrv(ctx, x, y, w, h, d, r) {
      ctx.fillStyle = CHASSIS_B;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = CHASSIS_D;
      ctx.fillRect(x, y, w, 1);
      ctx.fillRect(x, y + h - 1, w, 1);
      ctx.fillRect(x, y + Math.floor(h / 2), w, 1);
      const gW = Math.floor(w * 0.48);
      ctx.fillStyle = GRILLE;
      ctx.fillRect(x + 4, y + 3, gW, h - 6);
      ctx.fillStyle = CHASSIS_A;
      for (let dy = 0; dy < h - 6; dy += 2) {
        for (let dx = 0; dx < gW - 1; dx += 2) {
          ctx.fillRect(x + 5 + dx, y + 4 + dy, 1, 1);
        }
      }
      const bx0 = x + gW + 8;
      const bayW = Math.max(6, Math.floor((w - gW - 14) / 4));
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 4; col++) {
          const bx = bx0 + col * (bayW + 1);
          const by = y + 3 + row * Math.floor((h - 6) / 2);
          const bh = Math.floor((h - 6) / 2) - 1;
          ctx.fillStyle = CHASSIS_D;
          ctx.fillRect(bx, by, bayW, bh);
          ctx.fillStyle = CHASSIS_A;
          ctx.fillRect(bx + 1, by + 1, bayW - 2, bh - 2);
          if (r() > 0.14) {
            ctx.fillStyle = r() > 0.25 ? LED_GREEN : LED_AMBER;
            ctx.fillRect(bx + bayW - 2, by + 1, 1, 1);
          }
        }
      }
      depthRect(x, y, w, h, d);
      depthRect(x + 4, y + 3, gW, h - 6, d + 0.16);
    }

    function draw4UChassis(ctx, x, y, w, h, d) {
      ctx.fillStyle = CHASSIS_B;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = CHASSIS_D;
      ctx.fillRect(x, y, w, 2);
      ctx.fillRect(x, y + h - 2, w, 2);
      ctx.fillStyle = GRILLE;
      ctx.fillRect(x + 6, y + 4, w - 12, h - 8);
      ctx.fillStyle = CHASSIS_C;
      for (let dy = 0; dy < h - 10; dy += 3) {
        ctx.fillRect(x + 7, y + 5 + dy, w - 14, 1);
      }
      ctx.fillStyle = "#061223";
      ctx.fillRect(x + 8, y + 6, 28, 8);
      ctx.fillStyle = LED_CYAN;
      ctx.fillRect(x + 10, y + 8, 1, 1);
      ctx.fillRect(x + 12, y + 8, 8, 1);
      ctx.fillStyle = LED_GREEN;
      ctx.fillRect(x + 10, y + 11, 1, 1);
      ctx.fillStyle = LED_AMBER;
      ctx.fillRect(x + 22, y + 11, 1, 1);
      ctx.fillStyle = LED_RED;
      ctx.fillRect(x + w - 12, y + 6, 3, 3);
      ctx.fillStyle = SCREW;
      ctx.fillRect(x + w - 11, y + 10, 1, 1);
      depthRect(x, y, w, h, d);
      depthRect(x + 6, y + 4, w - 12, h - 8, d + 0.14);
    }

    function drawSwitch(ctx, x, y, w, h, d, r) {
      ctx.fillStyle = CHASSIS_A;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = CHASSIS_D;
      ctx.fillRect(x, y, w, 1);
      ctx.fillRect(x, y + h - 1, w, 1);
      const portCount = 24,
        portW = 2,
        portG = 1;
      const portsW = portCount * (portW + portG) - portG;
      const sx = x + Math.max(6, Math.floor((w - portsW) / 2));
      for (let p = 0; p < portCount; p++) {
        const px = sx + p * (portW + portG);
        ctx.fillStyle = CHASSIS_D;
        ctx.fillRect(px, y + 2, portW, h - 4);
        if (r() > 0.4) {
          ctx.fillStyle = r() > 0.72 ? LED_AMBER : LED_GREEN;
          ctx.fillRect(px, y + 3, portW, 1);
        }
      }
      ctx.fillStyle = LED_GREEN;
      ctx.fillRect(x + 3, y + 2, 1, 1);
      ctx.fillStyle = LED_CYAN;
      ctx.fillRect(x + 3, y + 5, 1, 1);
      depthRect(x, y, w, h, d);
    }

    function drawStorage(ctx, x, y, w, h, d, r) {
      ctx.fillStyle = CHASSIS_B;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = CHASSIS_D;
      ctx.fillRect(x, y, w, 1);
      ctx.fillRect(x, y + h - 1, w, 1);
      const cols = 6,
        rows = 3;
      const bayW = Math.floor((w - 8) / cols);
      const bayH = Math.floor((h - 4) / rows);
      for (let ri = 0; ri < rows; ri++) {
        for (let ci = 0; ci < cols; ci++) {
          const bx = x + 4 + ci * bayW;
          const by = y + 2 + ri * bayH;
          ctx.fillStyle = CHASSIS_D;
          ctx.fillRect(bx, by, bayW - 1, bayH - 1);
          ctx.fillStyle = CHASSIS_A;
          ctx.fillRect(bx + 1, by + 1, bayW - 3, bayH - 3);
          if (r() > 0.1) {
            ctx.fillStyle = r() > 0.22 ? LED_GREEN : LED_AMBER;
            ctx.fillRect(bx + bayW - 3, by + 1, 1, 1);
          }
        }
      }
      depthRect(x, y, w, h, d);
    }

    function drawGPUBox(ctx, x, y, w, h, d) {
      ctx.fillStyle = CHASSIS_A;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = CHASSIS_C;
      ctx.fillRect(x, y, w, 2);
      ctx.fillRect(x, y + h - 2, w, 2);
      ctx.fillStyle = GRILLE;
      ctx.fillRect(x + 4, y + 3, w - 8, h - 6);
      ctx.fillStyle = CHASSIS_B;
      for (let dy = 0; dy < h - 6; dy += 4) {
        for (let dx = 0; dx < w - 8; dx += 4) {
          const offset = (Math.floor(dy / 4) % 2) * 2;
          ctx.fillRect(x + 5 + dx + offset, y + 4 + dy, 2, 2);
        }
      }
      ctx.fillStyle = "#234A6A";
      ctx.fillRect(x + Math.floor(w / 2) - 11, y + 8, 22, 5);
      ctx.fillStyle = LED_CYAN;
      ctx.fillRect(x + Math.floor(w / 2) - 7, y + 10, 14, 1);
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = i < 4 ? LED_GREEN : LED_AMBER;
        ctx.fillRect(x + 6 + i * 3, y + h - 6, 2, 2);
      }
      depthRect(x, y, w, h, d);
      depthRect(x + 4, y + 3, w - 8, h - 6, d + 0.08);
    }

    function drawBlank(ctx, x, y, w, h, d) {
      ctx.fillStyle = CHASSIS_A;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = CHASSIS_D;
      ctx.fillRect(x, y, w, 1);
      ctx.fillRect(x, y + h - 1, w, 1);
      ctx.fillStyle = SCREW;
      ctx.fillRect(x + 2, y + 2, 1, 1);
      ctx.fillRect(x + w - 3, y + 2, 1, 1);
      ctx.fillRect(x + 2, y + h - 3, 1, 1);
      ctx.fillRect(x + w - 3, y + h - 3, 1, 1);
      depthRect(x, y, w, h, d);
    }

    function drawCableOrg(ctx, x, y, w, h, d, r) {
      ctx.fillStyle = CHASSIS_B;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = CHASSIS_D;
      ctx.fillRect(x, y, w, 1);
      ctx.fillRect(x, y + h - 1, w, 1);
      const cols = 8;
      const cw = Math.floor((w - 4) / cols);
      for (let c = 0; c < cols; c++) {
        const cx = x + 2 + c * cw;
        ctx.fillStyle = CHASSIS_D;
        ctx.fillRect(cx, y + 2, cw - 1, h - 4);
        if (r() > 0.25) {
          const palette = ["#2C3A4D", "#3D2C4D", "#2C4D3A", "#4D3A2C", "#2C4D4D"];
          ctx.fillStyle = palette[Math.floor(r() * palette.length)];
          ctx.fillRect(cx + 1, y + 3, cw - 3, h - 6);
        }
      }
      depthRect(x, y, w, h, d);
    }

    const EQUIPMENT = [
      { u: 1, d: D_BEZEL, draw: draw1USrv, w: 3 },
      { u: 1, d: D_BEZEL, draw: drawSwitch, w: 1 },
      { u: 1, d: D_FRAME + 0.03, draw: drawBlank, w: 2 },
      { u: 1, d: D_BEZEL - 0.02, draw: drawCableOrg, w: 1 },
      { u: 2, d: D_BEZEL, draw: draw2USrv, w: 3 },
      { u: 2, d: D_DEEP, draw: drawStorage, w: 2 },
      { u: 4, d: D_INNER, draw: draw4UChassis, w: 2 },
      { u: 6, d: D_DEEP - 0.04, draw: drawGPUBox, w: 2 },
    ];

    function pickEquipment(remU, r) {
      const candidates = [];
      for (const e of EQUIPMENT) {
        if (e.u <= remU) for (let i = 0; i < e.w; i++) candidates.push(e);
      }
      if (candidates.length === 0) return EQUIPMENT[2];
      return candidates[Math.floor(r() * candidates.length)];
    }

    const RACK_COUNT = 8;
    const WALL_L = 58;
    const WALL_R = COLOR_W - 58;
    const GAP = 6;
    const RACK_W = Math.floor((WALL_R - WALL_L - (RACK_COUNT - 1) * GAP) / RACK_COUNT);
    const RACK_TOP = 58;
    const RACK_H = 432;
    const U_PX = 10;
    const CAP_TOP = 14;
    const CAP_BOT = 14;

    for (let ri = 0; ri < RACK_COUNT; ri++) {
      const rx = WALL_L + ri * (RACK_W + GAP);
      const ry = RACK_TOP;

      cctx.fillStyle = "#020407";
      cctx.fillRect(rx - 2, ry + RACK_H, RACK_W + 4, 3);
      cctx.fillStyle = "#0A111C";
      cctx.fillRect(rx - 3, ry + RACK_H + 3, RACK_W + 6, 4);
      depthRect(rx - 3, ry + RACK_H, RACK_W + 6, 7, 0.14);

      cctx.fillStyle = CHASSIS_A;
      cctx.fillRect(rx, ry, RACK_W, RACK_H);
      depthRect(rx, ry, RACK_W, RACK_H, D_FRAME);

      cctx.fillStyle = CHASSIS_C;
      cctx.fillRect(rx, ry, 3, RACK_H);
      cctx.fillRect(rx + RACK_W - 3, ry, 3, RACK_H);
      depthRect(rx, ry, 3, RACK_H, D_FRAME - 0.04);
      depthRect(rx + RACK_W - 3, ry, 3, RACK_H, D_FRAME - 0.04);

      cctx.fillStyle = CHASSIS_C;
      cctx.fillRect(rx, ry, RACK_W, CAP_TOP);
      cctx.fillStyle = CHASSIS_B;
      cctx.fillRect(rx + 3, ry + 2, RACK_W - 6, CAP_TOP - 4);
      const cableN = 4 + Math.floor(rng() * 5);
      const palette = ["#2A3342", "#3A2B45", "#283A48", "#452A38", "#283F3A"];
      for (let c = 0; c < cableN; c++) {
        cctx.fillStyle = palette[Math.floor(rng() * palette.length)];
        const cx = rx + 5 + Math.floor(rng() * (RACK_W - 14));
        cctx.fillRect(cx, ry + 3, 2, CAP_TOP - 6);
      }
      cctx.fillStyle = "#0A1421";
      cctx.fillRect(rx + RACK_W - 26, ry + 3, 22, 7);
      cctx.fillStyle = LED_GREEN;
      cctx.fillRect(rx + RACK_W - 6, ry + 5, 2, 2);
      depthRect(rx, ry, RACK_W, CAP_TOP, D_BEZEL - 0.03);

      cctx.fillStyle = CHASSIS_C;
      cctx.fillRect(rx, ry + RACK_H - CAP_BOT, RACK_W, CAP_BOT);
      cctx.fillStyle = CHASSIS_B;
      cctx.fillRect(rx + 3, ry + RACK_H - CAP_BOT + 2, RACK_W - 6, CAP_BOT - 4);
      const outlets = 6;
      const oW = Math.floor((RACK_W - 12) / outlets);
      for (let o = 0; o < outlets; o++) {
        const ox = rx + 5 + o * oW;
        const oy = ry + RACK_H - CAP_BOT + 3;
        cctx.fillStyle = CHASSIS_D;
        cctx.fillRect(ox, oy, oW - 2, 6);
        cctx.fillStyle = LED_GREEN;
        cctx.fillRect(ox + oW - 3, oy + 4, 1, 1);
      }
      depthRect(rx, ry + RACK_H - CAP_BOT, RACK_W, CAP_BOT, D_BEZEL - 0.03);

      const eAreaX = rx + 4;
      const eAreaY = ry + CAP_TOP + 2;
      const eAreaW = RACK_W - 8;
      const eAreaH = RACK_H - CAP_TOP - CAP_BOT - 4;
      let curY = eAreaY;
      let remU = Math.floor(eAreaH / U_PX);

      while (remU > 0) {
        const eq = pickEquipment(remU, rng);
        const h = eq.u * U_PX - 1;
        eq.draw(cctx, eAreaX, curY, eAreaW, h, eq.d, rng);
        curY += eq.u * U_PX;
        remU -= eq.u;
      }

      cctx.fillStyle = "#5A7595";
      cctx.font = '7px "IBM Plex Mono", monospace';
      cctx.fillText(`R${String(ri + 1).padStart(2, "0")}`, rx + 6, ry + 10);
    }

    const vol = cctx.createLinearGradient(0, 0, 0, COLOR_H);
    vol.addColorStop(0, "rgba(6, 10, 18, 0.55)");
    vol.addColorStop(0.5, "rgba(6, 10, 18, 0.00)");
    vol.addColorStop(1, "rgba(6, 10, 18, 0.65)");
    cctx.fillStyle = vol;
    cctx.fillRect(0, 0, COLOR_W, COLOR_H);
  }

  // -----------------------------------------------------------
  // GL helpers
  // -----------------------------------------------------------
  function compileShader(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error("Shader: " + log);
    }
    return s;
  }
  function linkProgram(gl, vs, fs) {
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(prog);
      gl.deleteProgram(prog);
      throw new Error("Link: " + log);
    }
    return prog;
  }
  function makeTex(gl, cvs, unit) {
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cvs);
    return tex;
  }

  // -----------------------------------------------------------
  // SHADER SOURCES
  // -----------------------------------------------------------
  const VERTEX_SRC = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

  const FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uColor;
uniform sampler2D uDepth;

uniform float uTime;
uniform vec2  uRes;
uniform vec2  uImgSize;
uniform vec2  uImgCenter;
uniform float uReveal;

uniform float uFallProgress;   /* 0..1 during fall, >1 after impact */
uniform float uImpactFlash;    /* 0..1, peaks at impact, decays    */
uniform float uRippleTime;     /* seconds since impact; <0 before  */

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

vec3 blendScreen(vec3 a, vec3 b) { return 1.0 - (1.0 - a) * (1.0 - b); }

void main() {
  vec2 uv = vUv;
  float aspect = uRes.x / uRes.y;

  /* Background */
  vec3 bg = vec3(0.013, 0.020, 0.035);
  float bgRad = distance(uv, vec2(0.5, 0.45));
  bg += vec3(0.012, 0.020, 0.033) * (1.0 - smoothstep(0.0, 0.7, bgRad));
  vec2 gUv = vec2(uv.x * aspect, uv.y) * 46.0;
  vec2 gF = abs(fract(gUv) - 0.5);
  float gridLine = smoothstep(0.49, 0.50, max(gF.x, gF.y));
  bg += vec3(0.018, 0.030, 0.048) * (1.0 - gridLine) * 0.20;

  /* Image rectangle */
  vec2 imgUv = (uv - uImgCenter) / uImgSize + 0.5;
  bool inImg = imgUv.x > 0.0 && imgUv.x < 1.0 && imgUv.y > 0.0 && imgUv.y < 1.0;

  /* Dot matrix */
  float tiling = 170.0;
  vec2 tUv = vec2(uv.x * aspect, uv.y);
  vec2 tiledUv = mod(tUv * tiling, 2.0) - 1.0;
  float distInCell = length(tiledUv);
  float dotShape = smoothstep(0.52, 0.42, distInCell);
  float dotBright = 0.55 + 0.45 * hash21(floor(tUv * tiling * 0.5));
  float dot = dotShape * dotBright;

  vec3 color = bg;
  float depth = 0.95;

  if (inImg) {
    vec3 imgCol = texture(uColor, imgUv).rgb;
    float imgDepth = texture(uDepth, imgUv).r;

    float revealFromCenter = 1.0 - smoothstep(0.0, 0.6 * uReveal + 0.01,
                                              distance(imgUv, vec2(0.5)));
    float imgAlpha = uReveal * revealFromCenter;
    imgAlpha = smoothstep(0.0, 1.0, imgAlpha);

    color = mix(bg, imgCol, imgAlpha);
    depth = mix(0.95, imgDepth, imgAlpha);
  }

  vec3 mint = vec3(0.200, 0.984, 0.827);
  vec3 lime = vec3(0.482, 1.000, 0.620);

  /* --- Outward water-ripples emit from impact --- */
  vec2 impactOffset = (uv - uImgCenter) * vec2(aspect, 1.0);
  float impactDist = length(impactOffset);

  float rippleMask = 0.0;
  float rippleScanProg = -1.0;
  float rippleMaxSpeed = 0.22;
  float ripplePeriod = 2.60;
  float rippleLife = 5.40;

  if (uRippleTime > 0.0) {
    float latestF = floor(uRippleTime / ripplePeriod);
    for (int k = 0; k < 4; k++) {
      float idxF = latestF - float(k);
      if (idxF >= 0.0) {
        float spawnT = idxF * ripplePeriod;
        float rt = uRippleTime - spawnT;
        if (rt > 0.0 && rt < rippleLife) {
          float r = rt * rippleMaxSpeed;
          float width = 0.032 + rt * 0.006;
          float crest = exp(-pow((impactDist - r) / width, 2.0));
          float trailR = r - 0.060;
          float trail = exp(-pow((impactDist - trailR) / (width * 1.7), 2.0)) * 0.42;
          float ring = crest + trail;
          float fadeIn = smoothstep(0.0, 0.32, rt);
          float fadeOut = max(0.0, 1.0 - rt / rippleLife);
          fadeOut = fadeOut * fadeOut;
          float decay = fadeIn * fadeOut;
          rippleMask += ring * decay;
          float slice = clamp(r / 0.9, 0.02, 0.96);
          if (ring * decay > 0.07) rippleScanProg = slice;
        }
      }
    }
  }

  /* 3D tomographic scan */
  float rippleFlow = 0.0;
  float rippleHalo = 0.0;
  if (inImg && rippleScanProg >= 0.0) {
    rippleFlow = (1.0 - smoothstep(0.0, 0.024, abs(depth - rippleScanProg)))
                 * min(1.0, rippleMask * 1.2);
    rippleHalo = 1.0 - smoothstep(0.0, 0.08, abs(depth - rippleScanProg));
    rippleHalo = pow(rippleHalo, 3.0) * 0.38 * min(1.0, rippleMask * 1.2);
  }

  float flow = rippleFlow;
  float halo = rippleHalo;

  vec3 scanCol = mix(mint, lime, smoothstep(0.4, 1.0, flow));

  vec3 scanMask = scanCol * dot * flow * 2.4;
  color = blendScreen(color, scanMask);

  float rim = smoothstep(0.88, 1.00, flow);
  color += vec3(0.92, 1.0, 0.94) * rim * dot * 0.8;
  color += scanCol * halo * 0.22 * (0.6 + 0.4 * dotBright);

  if (uRippleTime > 0.0) {
    float outsideBoost = inImg ? 0.18 : 0.30;
    color += mint * rippleMask * outsideBoost * dot;
  }

  /* --- Falling water drop --- */
  if (uFallProgress > 0.0 && uFallProgress < 1.0) {
    float fall = pow(uFallProgress, 1.6);
    float startY = uImgCenter.y + uImgSize.y * 0.70;
    startY = min(startY, 1.04);
    float dropY = mix(startY, uImgCenter.y, fall);
    vec2 dropP = vec2(uImgCenter.x, dropY);
    vec2 dp = (uv - dropP) * vec2(aspect, 1.0);
    float dist = length(dp);

    float core = exp(-dist * 140.0) * 1.8;
    float glow = exp(-dist * 26.0) * 0.45;

    float trailOn = smoothstep(dropP.y, min(1.04, dropP.y + 0.18), uv.y)
                  * (1.0 - smoothstep(dropP.y + 0.02,
                                      dropP.y + 0.22, uv.y));
    float trailX = exp(-abs(uv.x - dropP.x) * aspect * 260.0);
    float trail = trailOn * trailX * (0.35 + 0.55 * uFallProgress);

    color += vec3(0.88, 1.0, 0.93) * core;
    color += mint * glow;
    color += mix(mint, lime, 0.25) * trail * 0.7;
  }

  /* --- Impact flash --- */
  if (uImpactFlash > 0.001) {
    float core = exp(-impactDist * 6.0) * uImpactFlash * 2.8;
    float halo2 = exp(-impactDist * 1.8) * uImpactFlash * 0.45;
    color += vec3(0.95, 1.0, 0.95) * core;
    color += mix(mint, lime, 0.4) * halo2;
    float shockR = (1.0 - uImpactFlash) * 0.35;
    float shock = exp(-pow((impactDist - shockR) / 0.015, 2.0))
                  * uImpactFlash * 1.6;
    color += mint * shock;
  }

  /* Vignette + soft bloom + tone-map */
  float vig = 1.0 - smoothstep(0.45, 1.15, length(uv - 0.5));
  color *= 0.30 + 0.70 * vig;
  color += pow(max(color - 0.72, 0.0), vec3(2.0)) * 0.65;
  color = color / (color + 0.88);
  color = pow(color, vec3(0.94));

  outColor = vec4(color, 1.0);
}`;

  // -----------------------------------------------------------
  // KICK OFF — runs last so all const declarations above are
  // out of the temporal dead zone before boot() needs them.
  // -----------------------------------------------------------
  try {
    boot(canvas, colorCvs, depthCvs);
    overlay.dataset.canvasReady = "true";
  } catch (err) {
    // CSS baseline already covers this — just log and move on.
    console.warn("[intro] WebGL2 init failed, CSS baseline remains:", err);
  }
})();
