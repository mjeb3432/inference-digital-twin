/**
 * forge-3d.js — Three.js-driven 3D ground-floor data center.
 *
 * Renders the data center as a fully volumetric WebGL scene anchored
 * on a real architectural plan: data hall, mechanical room, electrical
 * room, MMR, switchgear, plus outdoor power yard (substation,
 * generators, batteries, solar PV arrays, wind PPA marker, SMR pad,
 * fuel farm), rooftop chillers, and the surrounding site grass +
 * perimeter setback. Each major zone has a clean HTML overlay label
 * so the user can tell COMPUTE vs ENERGY vs COOLING vs NETWORK at
 * a glance.
 *
 * Realism overhaul (May 2026):
 *   - Image-based lighting via a 1k HDRI from PolyHaven's CORS-open
 *     CDN, lazy-loaded after first paint and converted to a PMREM
 *     environment map. Falls back gracefully if the CDN is
 *     unreachable.
 *   - ACES Filmic tonemapping for cinematic highlight rolloff and
 *     realistic shadow weight.
 *   - All major outdoor equipment rebuilt as multi-mesh assemblies
 *     matching real fabrication patterns: gensets with radiator
 *     louvers + exhaust stack + control panel, pad-mount transformers
 *     with HV bushings + cooling fins + oil-fill cap, BESS containers
 *     with ribbed shell + ventilation slots + status LED bar, fluid
 *     coolers with axial fan grilles + spinning blade rotors, fuel
 *     tanks on saddle bands inside a containment dyke, PV arrays
 *     with frame + cell grid + torque tube + ground posts, and a
 *     line-up of switchgear cabinets with indicator LEDs.
 *   - Procedural 64×64 noise textures supply per-material roughness
 *     micro-detail so flat-color paint reads as real fabricated
 *     panel rather than CG primitive.
 *   - RoundedBoxGeometry helper bevels every chamfered enclosure
 *     so 90° edges no longer scream "primitive cube."
 *   - Curtain-wall mullions subdivide the ribbon glass into real
 *     window lights with head + sill rails.
 *   - Scale anchors (1.8m hi-vis worker silhouette + counterbalance
 *     forklift) parked at the loading dock instantly anchor the
 *     building's true size.
 *
 * Why a separate module:
 *   - Three.js is ~400KB; we lazy-load it from a CDN on first 3D
 *     activation so the initial Forge bundle stays small.
 *   - Keeping the renderer isolated means the 2D SVG path is the
 *     authoritative source of layout truth — `mountForge3DInto` reads
 *     `plan.rooms.*` and `racks.slots[]` and re-projects them into 3D.
 *
 * Performance:
 *   - Racks use `InstancedMesh` so a 1000-rack facility renders in a
 *     single draw call.
 *   - Aisle floor stripes are per-row Mesh instances (a few dozen).
 *   - The render loop is paused (cancelAnimationFrame) when the
 *     container is hidden (visibilitychange) so we don't burn battery.
 *
 * Public API:
 *   const handle = await window.Forge3D.mountForge3DInto({
 *     container,    // HTMLElement that will host the <canvas>
 *     plan,         // computeFloorplan() output
 *     racks,        // buildRackRects() output
 *     phase,        // current build phase (1..8)
 *     powerMix,     // { fom, gas, solar, wind, smr } percentages
 *     coolingType,  // "air" | "d2c" | "immersion" | ...
 *     targetMw,     // facility nameplate MW
 *   });
 *   handle.dispose();
 */

(function (root) {
  "use strict";

  /* We pin to r137 because it's the last stable release that ships
   * BOTH the global UMD bundle (build/three.min.js, which attaches to
   * window.THREE) AND the legacy examples/js/controls/OrbitControls.js
   * global script. Newer releases (r150+) deprecated and then removed
   * examples/js, requiring import maps + ES modules — too much surgery
   * for a single 3D toggle in an existing IIFE-based codebase. r137 is
   * feature-complete for what we render. */
  const THREE_VERSION = "0.137.0";
  const THREE_CDN_URL = `https://unpkg.com/three@${THREE_VERSION}/build/three.min.js`;
  const ORBIT_CDN_URL = `https://unpkg.com/three@${THREE_VERSION}/examples/js/controls/OrbitControls.js`;

  // ---------- Lazy Three.js loader ----------------------------------------

  function loadScriptOnce(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-forge-3d="${src}"]`);
      if (existing) {
        if (existing.dataset.loaded === "1") {
          resolve();
        } else {
          existing.addEventListener("load", () => resolve(), { once: true });
          existing.addEventListener("error", reject, { once: true });
        }
        return;
      }
      const tag = document.createElement("script");
      tag.src = src;
      tag.async = true;
      tag.dataset.forge3d = src;
      tag.addEventListener("load", () => {
        tag.dataset.loaded = "1";
        resolve();
      }, { once: true });
      tag.addEventListener("error", reject, { once: true });
      document.head.appendChild(tag);
    });
  }

  let threeLoadPromise = null;
  function ensureThree() {
    if (typeof window.THREE !== "undefined" && window.THREE.OrbitControls) {
      return Promise.resolve();
    }
    if (!threeLoadPromise) {
      threeLoadPromise = loadScriptOnce(THREE_CDN_URL)
        .then(() => loadScriptOnce(ORBIT_CDN_URL))
        .catch((err) => {
          threeLoadPromise = null;
          throw err;
        });
    }
    return threeLoadPromise;
  }

  // ---------- Coordinate mapping ------------------------------------------
  //
  // The 2D plan coords range over the SVG viewbox (~1800 × 1100 units).
  // We map those into world units centred on the building so OrbitControls
  // framing is sensible regardless of facility size. Y is up. Racks are
  // 4 units tall; the room ceiling is 9.

  const WORLD_SCALE = 0.06;     // 1 SVG unit ≈ 6 cm in world space
  const RACK_HEIGHT = 4.0;      // ~2 m IRL → 4 world units
  const CEILING_Y = 9.0;
  const BUILDING_HEIGHT = 11.0; // a touch taller than ceiling so roof is visible

  // ---------- Public mount -------------------------------------------------

  async function mountForge3DInto(opts) {
    const {
      container,
      plan,
      racks,
      phase = 5,
      powerMix = { fom: 100, gas: 0, solar: 0, wind: 0, smr: 0 },
      upsType = null,         // null | "vrla" | "liion" | "supercap"
      redundancyTier = null,  // null | "n" | "n+1" | "2n" | "2n+1"
      coolingType = "air",
      targetMw = 10,
      locationType = "rural",
      gpuModel = "h100",
      fiberCarriers = [],
      developerType = null,
      monitoringApproach = null,
      cityLabel = null,
    } = opts;

    /* Phase gating helpers — reused throughout the renderer to decide
     * which equipment is visible. The 3D model "builds" in lockstep
     * with the user advancing through Stages 1–8:
     *   ≥1  site grass + perimeter setback always visible
     *   ≥2  building wall outline + outdoor energy yard
     *   ≥3  fiber risers + MMR shell shape
     *   ≥4  building roof + interior rooms + rooftop chillers + CRAH
     *   ≥5  racks in the data hall (immersion tanks for immersion)
     *   ≥6  network spine HDA + ceiling cables
     *   ≥7  DCIM telemetry pulse on rack tops
     *   ≥8  fully lit "facility online" mint glow
     */
    const showBuilding   = phase >= 2;
    const showRoof       = phase >= 4;
    const showInterior   = phase >= 4;
    const showCooling    = phase >= 4;
    const showFiber      = phase >= 3;
    const showRacks      = phase >= 5;
    const showSpine      = phase >= 6;
    const showTelemetry  = phase >= 7;
    const fullyOnline    = phase >= 8;

    /* Collected labels — populated as we add each piece of equipment
     * and rendered to HTML overlays at the end of mount. Declared up
     * here so both the Phase-1 stake-out and the deeper interior code
     * can push to the same array. */
    const labelTargets = [];

    /* Hoverable meshes — every "interesting" piece of equipment attaches
     * its mesh + a label payload so the raycaster can resolve a precise
     * hit when the cursor is over it. This is much cleaner than the
     * old screen-space-proximity hover (which required always-on pin
     * dots that cluttered the scene). One label = one card; the user
     * sees nothing UI until they're directly over an asset. */
    const hoverables = [];
    function registerHoverable(mesh, payload) {
      if (!mesh) return;
      mesh.userData.forgeLabel = payload;
      hoverables.push(mesh);
    }
    if (!container || !plan) {
      throw new Error("mountForge3DInto requires { container, plan }");
    }

    await ensureThree();
    const THREE = window.THREE;

    /* ============================================================
     * REALISM HELPERS
     * ============================================================
     *
     * Three small utilities that turn the plain procedural geometry
     * into something arch-viz quality without leaving Three.js:
     *
     *   1. roundedBox(w, h, d, radius)
     *      - Returns a chamfered BoxGeometry. A 0.05–0.15 unit
     *        chamfer is the difference between "primitive cube" and
     *        "extruded panel with a fabricator's edge break."
     *      - Implemented via ExtrudeGeometry on a rounded-rect
     *        shape (no examples/jsm dependency, works on r137).
     *
     *   2. loadEnvironmentHDRI(scene, renderer)
     *      - LAZILY fetches a 1k HDRI from PolyHaven's CORS-open
     *        CDN AFTER the scene first paints, builds a PMREM
     *        environment map, and assigns it to scene.environment.
     *        Every PBR material immediately picks up image-based
     *        lighting — sky-tinted shadows, real reflections in
     *        chiller and substation panels.
     *      - Fails gracefully: if PolyHaven is unreachable the
     *        analytic light rig stays the only contributor.
     *      - 1k .hdr is ~1MB and post-paint, so the user never
     *        waits for it on first mount.
     *
     *   3. proceduralNoiseTexture(opts)
     *      - DataTexture-based fractal noise. Used as a roughness
     *        modifier or ambient-occlusion stand-in to break up
     *        the painterly flat-color look of the procedural
     *        materials. Zero network cost.
     */

    function roundedBox(w, h, d, radius = Math.min(w, d) * 0.06) {
      /* Build a 2D rounded-rect on the X–Z plane, then extrude up
       * by `h`. The result is a chamfered box that reads as a
       * real fabricated panel rather than a CG primitive.
       *
       * Cached: identical (w, h, d, radius) tuples reuse the same
       * BufferGeometry across meshes. Three.js handles many
       * meshes-sharing-one-geometry efficiently — each mesh keeps
       * its own world transform but the GPU vertex/index buffer
       * uploads only once. */
      const r = Math.max(0.001, Math.min(radius, w * 0.49, d * 0.49));
      const cacheKey = w.toFixed(3) + "x" + h.toFixed(3) + "x" + d.toFixed(3) + "r" + r.toFixed(3);
      if (_roundedBoxCache.has(cacheKey)) return _roundedBoxCache.get(cacheKey);
      const shape = new THREE.Shape();
      shape.moveTo(-w / 2 + r, -d / 2);
      shape.lineTo(w / 2 - r, -d / 2);
      shape.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r);
      shape.lineTo(w / 2, d / 2 - r);
      shape.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2);
      shape.lineTo(-w / 2 + r, d / 2);
      shape.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r);
      shape.lineTo(-w / 2, -d / 2 + r);
      shape.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2);
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: h,
        bevelEnabled: true,
        bevelThickness: r * 0.4,
        bevelSize: r * 0.4,
        bevelOffset: 0,
        bevelSegments: 2,
        curveSegments: 6,
      });
      /* Extrude is along +Z by default; rotate so the height runs +Y
       * (Y becomes "up") and translate so the geometry is CENTERED on
       * the origin — drop-in replacement for BoxGeometry, whose pivot
       * is also at the centre of the box. After rotateX(-PI/2): old
       * Z [0..h] → new Y [0..h]. translate by -h/2 to recenter. */
      geo.rotateX(-Math.PI / 2);
      geo.translate(0, -h / 2, 0);
      _roundedBoxCache.set(cacheKey, geo);
      return geo;
    }

    /* Caches — every {size, scale, seed} combo produces an identical
     * 64×64 texture, but the function used to be invoked fresh each
     * time, allocating a new Uint8Array + DataTexture per material.
     * The cache means each unique parameter triple computes ONCE
     * (~5ms on a cold machine) and every subsequent material that
     * asks for the same noise reuses the GPU upload. Same idea for
     * roundedBox — many enclosures share the same w/h/d/r and were
     * each generating a new ExtrudeGeometry. */
    const _noiseTextureCache = new Map();
    const _roundedBoxCache = new Map();

    function proceduralNoiseTexture({ size = 64, scale = 4, seed = 1 } = {}) {
      const cacheKey = size + ":" + scale + ":" + seed;
      if (_noiseTextureCache.has(cacheKey)) return _noiseTextureCache.get(cacheKey);
      const tex = _buildProceduralNoiseTexture({ size, scale, seed });
      _noiseTextureCache.set(cacheKey, tex);
      return tex;
    }
    function _buildProceduralNoiseTexture({ size = 64, scale = 4, seed = 1 } = {}) {
      /* Simple value-noise fractal — three octaves of bilinear-blended
       * pseudo-random samples. Looks like dust/wear/concrete grain on
       * a roughness map; vastly cheaper than fetching real textures. */
      const data = new Uint8Array(size * size * 4);
      const rand = (i, j) => {
        const x = Math.sin(i * 12.9898 + j * 78.233 + seed * 37.719) * 43758.5453;
        return x - Math.floor(x);
      };
      const sampleOctave = (u, v, freq) => {
        const x = u * freq;
        const y = v * freq;
        const xi = Math.floor(x);
        const yi = Math.floor(y);
        const xf = x - xi;
        const yf = y - yi;
        const a = rand(xi, yi);
        const b = rand(xi + 1, yi);
        const c = rand(xi, yi + 1);
        const d = rand(xi + 1, yi + 1);
        const u1 = xf * xf * (3 - 2 * xf);
        const v1 = yf * yf * (3 - 2 * yf);
        return a * (1 - u1) * (1 - v1) + b * u1 * (1 - v1) + c * (1 - u1) * v1 + d * u1 * v1;
      };
      for (let j = 0; j < size; j++) {
        for (let i = 0; i < size; i++) {
          const u = i / size;
          const v = j / size;
          let n = 0;
          let amp = 0.55;
          let freq = scale;
          for (let o = 0; o < 3; o++) {
            n += sampleOctave(u, v, freq) * amp;
            amp *= 0.5;
            freq *= 2;
          }
          const g = Math.max(0, Math.min(255, Math.round(n * 255)));
          const idx = (j * size + i) * 4;
          data[idx] = g;
          data[idx + 1] = g;
          data[idx + 2] = g;
          data[idx + 3] = 255;
        }
      }
      const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.needsUpdate = true;
      return tex;
    }

    /* ============================================================
     * REALISTIC TREE LIBRARY
     * ============================================================
     *
     * Five procedural species, each built from a Group of trunk +
     * branches + multi-sphere foliage clusters. The foliage is
     * non-uniformly scaled IcosahedronGeometry with vertex-noise
     * displacement so it reads as organic canopy rather than CG
     * sphere. A tiny CanvasTexture supplies bark detail.
     *
     *   PINE   — stacked tapering cones (conifer silhouette)
     *   OAK    — broad round canopy + visible branch structure
     *   BIRCH  — tall slim trunk + light sparse canopy
     *   POPLAR — narrow columnar canopy (Lombardy poplar shape)
     *   ORN    — ornamental ball-shaped (campus landscaping)
     *
     * Every tree returns a Group with userData.swayAxis so the render
     * loop can apply per-tree wind sway. Total per-tree mesh count
     * is 8-15; the scene-wide tree count caps at ~40 so the budget
     * stays under ~600 meshes for the entire forest.
     */

    const TREE_SPECIES = ["pine", "oak", "birch", "poplar"];

    /* Bark texture — vertical-stripe noise for a tree-bark grain.
     * Generated once and shared across all trunks. Cheap to compute
     * (~64×64 RGBA = 16KB) and the visual upgrade vs flat brown is
     * dramatic. */
    function makeBarkTexture(barkSeed = 1) {
      const size = 64;
      const data = new Uint8Array(size * size * 4);
      for (let j = 0; j < size; j++) {
        for (let i = 0; i < size; i++) {
          /* Vertical stripe noise: emphasise variation along the X
           * axis, smooth along Y. Multiplied by a brown tint. */
          const u = i / size;
          const v = j / size;
          const n =
            Math.sin(u * 24 + barkSeed) * 0.5 +
            Math.sin(u * 7 + v * 3 + barkSeed * 1.3) * 0.3 +
            Math.sin(u * 47 + v * 0.5 + barkSeed * 2.1) * 0.2;
          const g = Math.max(0, Math.min(1, 0.5 + n * 0.4));
          const r = Math.round(80 + g * 60);
          const gg = Math.round(50 + g * 40);
          const b = Math.round(28 + g * 22);
          const idx = (j * size + i) * 4;
          data[idx] = r;
          data[idx + 1] = gg;
          data[idx + 2] = b;
          data[idx + 3] = 255;
        }
      }
      const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(2, 1);
      tex.needsUpdate = true;
      return tex;
    }
    const sharedBarkMap = makeBarkTexture(7);

    /* Displaced foliage geometry — IcosahedronGeometry with subtle
     * per-vertex noise so the canopy reads as organic rather than
     * a perfect sphere. Cached per detail-level. */
    const foliageGeoCache = new Map();
    function getFoliageGeo(detail) {
      if (foliageGeoCache.has(detail)) return foliageGeoCache.get(detail);
      const geo = new THREE.IcosahedronGeometry(1, detail);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        /* Three-octave value noise on the surface. Pushes vertices
         * outward by ±15% of their unit-radius position. */
        const n =
          Math.sin(x * 6.3 + y * 2.1) * 0.06 +
          Math.sin(y * 5.7 + z * 3.4) * 0.05 +
          Math.sin(z * 4.9 + x * 7.1) * 0.04;
        const f = 1 + n;
        pos.setXYZ(i, x * f, y * f, z * f);
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
      foliageGeoCache.set(detail, geo);
      return geo;
    }

    /* Foliage materials — slight variations so neighbouring trees
     * don't look stamped from the same mould. */
    const foliagePalettes = {
      darkPine:    { color: 0x1f4029, emissive: 0x041208 },
      midPine:     { color: 0x2d5a3a, emissive: 0x051912 },
      lightPine:   { color: 0x3a6b48, emissive: 0x062014 },
      springOak:   { color: 0x4a7838, emissive: 0x0a1f10 },
      summerOak:   { color: 0x3c6a30, emissive: 0x081a0c },
      birchLeaf:   { color: 0x6b9a4a, emissive: 0x102a14 },
      poplarLeaf:  { color: 0x5e8a3e, emissive: 0x0c2412 },
      ornLight:    { color: 0x6da654, emissive: 0x142e1a },
    };
    const foliageMatCache = {};
    function getFoliageMat(key) {
      if (foliageMatCache[key]) return foliageMatCache[key];
      const pal = foliagePalettes[key] || foliagePalettes.midPine;
      foliageMatCache[key] = new THREE.MeshStandardMaterial({
        color: pal.color,
        roughness: 0.92,
        metalness: 0,
        emissive: pal.emissive,
        emissiveIntensity: 0.18,
        flatShading: true, // helps the noise displacement read sharper
      });
      return foliageMatCache[key];
    }

    /* Shared trunk material — bark texture + flat shading kills the
     * shiny-cylinder look. */
    const trunkMatShared = new THREE.MeshStandardMaterial({
      color: 0x6e4a2d,
      roughness: 0.95,
      metalness: 0,
      map: sharedBarkMap,
    });
    const trunkMatBirch = new THREE.MeshStandardMaterial({
      color: 0xd6d2c8,
      roughness: 0.85,
      metalness: 0,
    });

    function buildTree(species, scale = 1, seed = 0) {
      const tree = new THREE.Group();
      const rng = (n) => ((Math.sin((seed + n) * 12.9898) * 43758.5453) % 1 + 1) % 1;

      if (species === "pine") {
        /* Stacked tapering cones — classic conifer */
        const trunkH = 1.4 * scale;
        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.1 * scale, 0.18 * scale, trunkH, 10),
          trunkMatShared,
        );
        trunk.position.y = trunkH / 2;
        trunk.castShadow = true;
        tree.add(trunk);

        const tiers = 3 + Math.floor(rng(1) * 2); // 3 or 4
        const matKey = ["darkPine", "midPine", "lightPine"][Math.floor(rng(2) * 3)];
        let coneY = trunkH * 0.78;
        for (let t = 0; t < tiers; t++) {
          const tt = t / tiers;
          const radius = (1.0 - tt * 0.55) * 1.0 * scale;
          const height = (1.5 - tt * 0.25) * scale;
          const cone = new THREE.Mesh(
            new THREE.ConeGeometry(radius, height, 10),
            getFoliageMat(matKey),
          );
          cone.position.y = coneY + height / 2 - 0.18 * scale;
          cone.rotation.y = rng(t + 5) * Math.PI * 2;
          cone.castShadow = true;
          tree.add(cone);
          coneY += height * 0.55;
        }
      } else if (species === "oak") {
        /* Broad round canopy + visible branching */
        const trunkH = 1.6 * scale;
        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.13 * scale, 0.22 * scale, trunkH, 10),
          trunkMatShared,
        );
        trunk.position.y = trunkH / 2;
        trunk.castShadow = true;
        tree.add(trunk);

        /* 3 branches splaying out from the upper trunk */
        const branchCount = 3;
        for (let b = 0; b < branchCount; b++) {
          const branchAng = (b / branchCount) * Math.PI * 2 + rng(b + 9) * 0.6;
          const branchLen = 0.7 * scale;
          const branch = new THREE.Mesh(
            new THREE.CylinderGeometry(0.045 * scale, 0.075 * scale, branchLen, 6),
            trunkMatShared,
          );
          branch.position.set(
            Math.cos(branchAng) * 0.18 * scale,
            trunkH * 0.85,
            Math.sin(branchAng) * 0.18 * scale,
          );
          /* Tilt outward 35° */
          branch.rotation.z = Math.cos(branchAng) * 0.6;
          branch.rotation.x = Math.sin(branchAng) * 0.6;
          tree.add(branch);
        }

        /* Multi-sphere canopy — 4 overlapping puffs forming a
         * cumulus-like crown */
        const matKey = rng(3) > 0.5 ? "summerOak" : "springOak";
        const foliageGeo = getFoliageGeo(2);
        const positions = [
          { x: 0, y: trunkH + 0.7, z: 0, s: 1.05 },
          { x: 0.55, y: trunkH + 0.55, z: 0.1, s: 0.75 },
          { x: -0.4, y: trunkH + 0.6, z: 0.4, s: 0.7 },
          { x: 0.1, y: trunkH + 0.35, z: -0.55, s: 0.65 },
        ];
        for (const p of positions) {
          const puff = new THREE.Mesh(foliageGeo, getFoliageMat(matKey));
          puff.position.set(p.x * scale, p.y, p.z * scale);
          const s = p.s * scale * (0.9 + rng(p.x * 31) * 0.2);
          puff.scale.set(s * 1.05, s * 0.92, s * 1.0);
          puff.castShadow = true;
          tree.add(puff);
        }
      } else if (species === "birch") {
        /* Tall slim trunk + sparse light canopy */
        const trunkH = 2.4 * scale;
        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.07 * scale, 0.11 * scale, trunkH, 8),
          trunkMatBirch,
        );
        trunk.position.y = trunkH / 2;
        trunk.castShadow = true;
        tree.add(trunk);

        /* Subtle dark "papery" stripes on the white birch trunk —
         * thin black dashes spaced randomly along the height. */
        for (let s = 0; s < 5; s++) {
          const ringY = trunkH * (0.15 + s * 0.18);
          const ring = new THREE.Mesh(
            new THREE.CylinderGeometry(0.075 * scale, 0.1 * scale, 0.05 * scale, 8, 1, true),
            new THREE.MeshStandardMaterial({
              color: 0x2a261c, roughness: 0.95,
            }),
          );
          ring.position.y = ringY;
          tree.add(ring);
        }

        /* Sparse canopy — 3 small puffs */
        const foliageGeo = getFoliageGeo(2);
        for (let p = 0; p < 3; p++) {
          const puff = new THREE.Mesh(foliageGeo, getFoliageMat("birchLeaf"));
          const ang = rng(p + 11) * Math.PI * 2;
          const r = rng(p + 13) * 0.45 * scale;
          puff.position.set(
            Math.cos(ang) * r,
            trunkH + 0.4 + rng(p + 17) * 0.4,
            Math.sin(ang) * r,
          );
          const s = (0.55 + rng(p + 19) * 0.3) * scale;
          puff.scale.set(s, s * 0.85, s);
          puff.castShadow = true;
          tree.add(puff);
        }
      } else if (species === "poplar") {
        /* Narrow columnar canopy — Lombardy poplar shape */
        const trunkH = 0.6 * scale;
        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.09 * scale, 0.14 * scale, trunkH, 8),
          trunkMatShared,
        );
        trunk.position.y = trunkH / 2;
        trunk.castShadow = true;
        tree.add(trunk);

        /* Tall narrow ellipsoid canopy */
        const foliageGeo = getFoliageGeo(2);
        const canopy = new THREE.Mesh(foliageGeo, getFoliageMat("poplarLeaf"));
        const canopyH = 3.2 * scale;
        canopy.position.y = trunkH + canopyH * 0.5;
        canopy.scale.set(0.7 * scale, canopyH * 0.5, 0.7 * scale);
        canopy.castShadow = true;
        tree.add(canopy);
      } else {
        /* Ornamental — small ball-shaped landscaping tree */
        const trunkH = 0.85 * scale;
        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08 * scale, 0.12 * scale, trunkH, 8),
          trunkMatShared,
        );
        trunk.position.y = trunkH / 2;
        trunk.castShadow = true;
        tree.add(trunk);

        const foliageGeo = getFoliageGeo(2);
        const ball = new THREE.Mesh(foliageGeo, getFoliageMat("ornLight"));
        ball.position.y = trunkH + 0.85 * scale;
        const s = 0.95 * scale;
        ball.scale.set(s, s * 0.9, s);
        ball.castShadow = true;
        tree.add(ball);
      }

      tree.userData.kind = "tree";
      tree.userData.swayPhase = (seed * 0.91) % (Math.PI * 2);
      tree.userData.swayAmp = 0.012 + (seed % 7) * 0.002;
      return tree;
    }

    /* Bushes — multi-sphere clumps. Bigger upgrade than the previous
     * single squashed spheres. */
    function buildBush(scale = 1, seed = 0) {
      const bush = new THREE.Group();
      const rng = (n) => ((Math.sin((seed + n) * 17.137) * 9531.193) % 1 + 1) % 1;
      const foliageGeo = getFoliageGeo(1);
      const matKey = rng(1) > 0.5 ? "summerOak" : "ornLight";
      const puffCount = 3 + Math.floor(rng(2) * 2);
      for (let p = 0; p < puffCount; p++) {
        const puff = new THREE.Mesh(foliageGeo, getFoliageMat(matKey));
        const ang = (p / puffCount) * Math.PI * 2 + rng(p + 7) * 0.4;
        const r = rng(p + 11) * 0.3 * scale;
        puff.position.set(
          Math.cos(ang) * r,
          0.3 * scale + rng(p + 13) * 0.2 * scale,
          Math.sin(ang) * r,
        );
        const s = (0.5 + rng(p + 17) * 0.2) * scale;
        puff.scale.set(s, s * 0.7, s);
        puff.castShadow = true;
        bush.add(puff);
      }
      return bush;
    }

    /* ---------- Renderer + scene ---------- */
    const width = container.clientWidth || 1200;
    const height = container.clientHeight || 720;

    const scene = new THREE.Scene();
    /* Daylight sky background — warm hazy horizon tint so the
     * 3D scene reads as outdoors-noon rather than a dark stage.
     * Fog matches the horizon hue for proper distance haze
     * (atmospheric scattering approximation). */
    scene.background = new THREE.Color(0xc4d3e0);
    scene.fog = new THREE.Fog(0xc8d0d8, 130, 380);

    /* Camera framing — closer to the building, framed slightly
     * UP so the user sees both the data centre AND the sky above
     * (sun, drifting clouds, the SIMPLY SILICON teaser). The
     * building still occupies the lower 60% of the frame. The
     * 40° FOV is a touch wider so more of the atmospheric polish
     * is visible at default zoom. */
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.5, 800);
    camera.position.set(52, 38, 52);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if ("outputColorSpace" in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
    else if ("outputEncoding" in renderer) renderer.outputEncoding = THREE.sRGBEncoding;

    /* ACES Filmic tonemap — the cinematic standard. Compresses sun
     * highlights into believable shoulder rolloff (instead of clipping
     * to white), and pulls shadow detail out of the floor. The single
     * biggest "looks more real" delta after IBL.
     * Exposure 0.78 keeps the scene grounded — earlier value 1.05 was
     * blowing out the sky and the IBL specular highlights. */
    if (THREE.ACESFilmicToneMapping !== undefined) {
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 0.78;
    }

    /* Sticking with PCFSoftShadowMap — broadly compatible across
     * integrated GPUs. VSM has softer penumbra but variance-shadow
     * artifacts and higher memory cost on low-end devices weren't
     * worth the risk for this MVP. */

    container.appendChild(renderer.domElement);
    renderer.domElement.classList.add("forge-3d-canvas");

    /* ---------- Lighting ---------- */
    /* Analytic three-light rig — provides immediate sensible lighting
     * before the HDRI lands. Once IBL is online (loadEnvironmentHDRI
     * below), the hemisphere/ambient intensities are dimmed because the
     * environment map carries the diffuse contribution. */
    const hemi = new THREE.HemisphereLight(0x88aacc, 0x0a1820, 0.55);
    scene.add(hemi);

    const ambient = new THREE.AmbientLight(0xffffff, 0.12);
    scene.add(ambient);

    /* Cool sun-like key light — intensity tuned down so highlights
     * on glass + metal don't blow out under IBL. The sun reads as
     * present but not blown out. */
    const keyLight = new THREE.DirectionalLight(0xfff1e0, 0.55);
    keyLight.position.set(80, 110, 60);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.near = 10;
    keyLight.shadow.camera.far = 280;
    keyLight.shadow.camera.left = -120;
    keyLight.shadow.camera.right = 120;
    keyLight.shadow.camera.top = 120;
    keyLight.shadow.camera.bottom = -120;
    keyLight.shadow.bias = -0.0005;
    /* shadow.radius applies under VSM; PCFSoft uses mapSize for
     * quality. Leaving at default for broad compatibility. */
    scene.add(keyLight);

    /* Warm fill light to lift shadow detail */
    const fill = new THREE.DirectionalLight(0xff9a6e, 0.16);
    fill.position.set(-50, 30, -60);
    scene.add(fill);

    /* ---------- Image-based lighting (IBL) — async post-paint ----------
     * Fetched lazily so the user never blocks on this. PolyHaven has a
     * CORS-open CDN; if the fetch fails (offline, blocked, etc.) the
     * analytic lights above keep the scene perfectly viable. */
    let pmremGenerator = null;
    function loadEnvironmentHDRI() {
      /* Three.js r137 ships RGBELoader as a global on examples/js. We
       * lazy-load that script before the HDRI fetch. */
      const RGBE_URL = `https://unpkg.com/three@${THREE_VERSION}/examples/js/loaders/RGBELoader.js`;
      /* "kloofendal_43d_clear" is a clean midday sky from PolyHaven —
       * neutral colour temperature, soft clouds, suits a DC site. */
      const HDRI_URL =
        "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloofendal_43d_clear_1k.hdr";

      return loadScriptOnce(RGBE_URL)
        .then(() => {
          if (!THREE.RGBELoader) return null;
          return new Promise((resolve, reject) => {
            new THREE.RGBELoader().load(
              HDRI_URL,
              (texture) => resolve(texture),
              undefined,
              (err) => reject(err),
            );
          });
        })
        .then((hdrTex) => {
          if (!hdrTex || pmremGenerator === null) return;
          /* PMREM = pre-filtered mipmapped radiance environment map.
           * Standard Three.js IBL pipeline. */
          const envMap = pmremGenerator.fromEquirectangular(hdrTex).texture;
          hdrTex.dispose();
          /* scene.environment provides diffuse + specular IBL to every
           * MeshStandardMaterial automatically — no per-material wiring
           * needed. */
          scene.environment = envMap;
          /* Now that IBL is online, dim the analytic ambient/hemi
           * since they were over-compensating for the missing diffuse
           * environment contribution. The directional sun stays full
           * strength so shadows still have direction and form. */
          hemi.intensity = 0.18;
          ambient.intensity = 0.04;
          renderer.toneMappingExposure = 0.7;
        })
        .catch(() => {
          /* Silently fall back. Analytic lights remain authoritative. */
        });
    }
    /* ---------- Lazy PolyHaven texture loader (Path B) ----------
     * Real PBR textures fetched from PolyHaven's CORS-open CDN AFTER
     * the scene first paints. Each texture is wired into a target
     * material's `.map` slot once it lands. If the CDN is unreachable,
     * the procedural noise-roughness fallback set up earlier remains
     * authoritative — the scene never breaks.
     *
     * Materials we hand off to the upgrader:
     *   - groundMat  → grass / wild_grass diffuse (rural+campus)
     *   - yardMat    → asphalt diffuse (gravel hardstanding)
     *   - slabMat    → polished_concrete diffuse (DC slab)
     *   - dockPadMat → asphalt diffuse (loading-dock pad)
     *
     * We use 1k textures (~600KB diffuse). Total bundle add at
     * runtime: ~2-3MB across 3 sets, all post-paint. */
    const pendingTextureUpgrades = [];
    function queueTextureUpgrade(material, baseUrl, repeat = 4) {
      if (!material || !baseUrl) return;
      pendingTextureUpgrades.push({ material, baseUrl, repeat });
    }
    function applyPolyHavenTextures() {
      if (!pendingTextureUpgrades.length) return;
      const loader = new THREE.TextureLoader();
      pendingTextureUpgrades.forEach(({ material, baseUrl, repeat }) => {
        loader.load(
          baseUrl,
          (tex) => {
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            tex.repeat.set(repeat, repeat);
            if ("colorSpace" in tex) tex.colorSpace = THREE.SRGBColorSpace;
            else if ("encoding" in tex) tex.encoding = THREE.sRGBEncoding;
            material.map = tex;
            material.needsUpdate = true;
          },
          undefined,
          () => {
            /* Silent fallback — procedural roughness map remains the
             * material's only texture. No console spam. */
          },
        );
      });
    }

    /* Defer HDRI fetch until after the first frame paints so it never
     * blocks initial scene visibility. PMREMGenerator must be created
     * eagerly (cheap) since we need it inside the async callback. */
    if (THREE.PMREMGenerator !== undefined) {
      pmremGenerator = new THREE.PMREMGenerator(renderer);
      pmremGenerator.compileEquirectangularShader();
      /* Use rAF rather than setTimeout(0) so the first WebGL frame is
       * actually drawn before we kick off the HDRI fetch. */
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          loadEnvironmentHDRI();
          /* PolyHaven ground textures piggyback on the same post-
           * paint deferral path. */
          applyPolyHavenTextures();
        });
      });
    } else {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => applyPolyHavenTextures());
      });
    }

    /* Mint-accent rim light inside the data hall */
    const rim = new THREE.PointLight(0x33fbd3, 1.4, 160, 1.6);
    rim.position.set(0, CEILING_Y - 1, 0);
    scene.add(rim);

    /* ---------- Sun (sprite-based soft orange glow) ---------- */
    /* The sun is composed of a tiny solid core sphere plus a
     * billboarded Sprite carrying a procedurally-drawn radial
     * gradient. The Sprite always faces the camera so the corona
     * reads as a soft halo instead of concentric ring boundaries
     * (which is what nested SphereGeometry halos look like).
     *
     * IMPORTANT: the sun is static scenery — the
     * OrbitControls.target stays anchored at the BUILDING (0, 12, 0)
     * regardless of orbit, so the user's POV never snaps to the sun. */
    function makeSunGlowTexture() {
      const c = document.createElement("canvas");
      c.width = 512; c.height = 512;
      const x = c.getContext("2d");
      const g = x.createRadialGradient(256, 256, 8, 256, 256, 250);
      /* Softer sun: muted core + gentler corona. Earlier values were
       * full-brightness which under daylight + IBL looked over-baked
       * with a halo eating half the sky. */
      g.addColorStop(0.00, "rgba(255, 245, 220, 0.85)");
      g.addColorStop(0.06, "rgba(255, 220, 165, 0.55)");
      g.addColorStop(0.18, "rgba(255, 195, 130, 0.28)");
      g.addColorStop(0.42, "rgba(255, 175, 110, 0.10)");
      g.addColorStop(0.72, "rgba(220, 150, 100, 0.03)");
      g.addColorStop(1.00, "rgba(180, 130, 90, 0.00)");
      x.fillStyle = g;
      x.fillRect(0, 0, 512, 512);
      const tex = new THREE.CanvasTexture(c);
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      return tex;
    }

    /* Hot solid core — smaller now (was r=3.2). Pushed FAR into the
     * upper-left distance so the sun reads as a real distant
     * celestial body, not an in-frame prop. */
    const sunCore = new THREE.Mesh(
      new THREE.SphereGeometry(1.8, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xffe8b8 })
    );
    sunCore.position.set(-260, 150, -240);
    scene.add(sunCore);

    /* Smaller, more diffuse glow corona (was scale 110). The sprite
     * is now ~half the visible size and starts at lower opacity so
     * it reads as a hazy daylight sun rather than a heat lamp. */
    const sunGlowSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeSunGlowTexture(),
        transparent: true,
        depthWrite: false,
        opacity: 0.55,
      })
    );
    sunGlowSprite.scale.set(60, 60, 1);
    sunGlowSprite.position.copy(sunCore.position);
    scene.add(sunGlowSprite);

    const sun = sunCore; // alias used elsewhere for repositioning

    /* Warm point light cast FROM the sun's position. Intensity
     * reduced from 0.45 → 0.18 since IBL now carries most of the
     * directional warmth; this just adds a gentle rim cue. */
    const sunLight = new THREE.PointLight(0xffaa55, 0.18, 480, 1.5);
    sunLight.position.copy(sun.position);
    scene.add(sunLight);

    /* ---------- Clouds ----------
     *
     * Clouds are distributed in a FULL CIRCLE around the scene so
     * the user sees them no matter what orbit angle they pick.
     * Each cloud follows its own circular orbit around the world Y
     * axis at slightly different radius + speed so the sky drifts
     * without any one cloud catching up to another.
     *
     * Plus one special "teaser" cloud that bears a SIMPLY SILICON
     * banner texture — a slow Easter egg that floats around the
     * scene every ~80s.
     */
    /* Volumetric-looking cloud puff texture — multi-octave radial
     * noise gives each sprite a soft 3D-ish silhouette with bumpy
     * edges, so a stack of overlapping puffs reads as a real
     * cumulus volume rather than a flat decal. Two variants
     * (CORE = bright opaque centre, EDGE = soft transparent
     * fringe) layered together produce the sun-lit highlight + soft
     * ambient shadow effect that real clouds have. */
    function makeCloudPuffTexture(opts = {}) {
      const {
        size = 256,
        coreAlpha = 1.0,
        rim = 0.85,
        warmth = 0,        // -1..+1 → cool → warm
        seed = 0,
      } = opts;
      const c = document.createElement("canvas");
      c.width = size; c.height = size;
      const x = c.getContext("2d");
      /* Layer 1: smooth radial gradient base */
      const g = x.createRadialGradient(size / 2, size / 2, size * 0.08, size / 2, size / 2, size * 0.5);
      const top = warmth > 0
        ? `rgba(${252 + warmth * 3}, ${248 + warmth * -8}, ${235 - warmth * 14}, ${coreAlpha})`
        : `rgba(${252 - warmth * 4}, ${254 + warmth * -2}, ${255 + warmth * -2}, ${coreAlpha})`;
      g.addColorStop(0.00, top);
      g.addColorStop(0.20, `rgba(238, 244, 252, ${coreAlpha * 0.94})`);
      g.addColorStop(0.45, `rgba(212, 224, 240, ${coreAlpha * 0.6})`);
      g.addColorStop(0.70, `rgba(186, 200, 218, ${coreAlpha * 0.28})`);
      g.addColorStop(0.92, `rgba(170, 188, 210, ${coreAlpha * 0.08})`);
      g.addColorStop(1.00, "rgba(170, 188, 210, 0.00)");
      x.fillStyle = g;
      x.fillRect(0, 0, size, size);

      /* Layer 2: soft noise displacement of the alpha so the
       * silhouette has bumpy organic edges, not a perfect circle.
       * Sample sparsely + bilinear-blur at composite time. */
      const img = x.getImageData(0, 0, size, size);
      const d = img.data;
      const noise = (i, j) => {
        const k = Math.sin(i * 12.9898 + j * 78.233 + seed * 31.7) * 43758.5453;
        return (k - Math.floor(k));
      };
      for (let j = 0; j < size; j++) {
        for (let i = 0; i < size; i++) {
          const idx = (j * size + i) * 4;
          if (d[idx + 3] < 1) continue;
          const u = i / size; const v = j / size;
          const cx = u - 0.5; const cy = v - 0.5;
          const dist = Math.sqrt(cx * cx + cy * cy);
          /* Higher-frequency bumps near the rim only */
          const rimWeight = Math.max(0, Math.min(1, (dist - 0.18) * 2.4));
          const bump =
            (noise(Math.floor(i / 4), Math.floor(j / 4)) - 0.5) * 0.5 +
            (noise(Math.floor(i / 12), Math.floor(j / 12)) - 0.5) * 0.5;
          const factor = 1 - rimWeight * (1 - rim) * bump;
          d[idx + 3] = Math.max(0, Math.min(255, d[idx + 3] * factor));
        }
      }
      x.putImageData(img, 0, 0);

      const tex = new THREE.CanvasTexture(c);
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      return tex;
    }
    const cloudPuffTexCore = makeCloudPuffTexture({ size: 256, coreAlpha: 1.0, warmth: 0.3, seed: 11 });
    const cloudPuffTexShadow = makeCloudPuffTexture({ size: 256, coreAlpha: 0.55, warmth: -0.7, seed: 23 });

    /* A single cloud = a Group of sprite-based puffs at varying
     * depths, sizes, and tints. Each sprite always faces the camera
     * so the cloud reads as a soft volumetric mass even at orbit
     * angles. The "shadow" puffs sit slightly below + behind the
     * "core" puffs to suggest sun-from-above lighting. */
    function makePuff(scale, opacity, tex = cloudPuffTexCore) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: tex, transparent: true,
          opacity: opacity, depthWrite: false,
        })
      );
      sprite.scale.set(scale, scale, 1);
      return sprite;
    }

    const clouds = [];
    const CLOUD_COUNT = 16;
    for (let c = 0; c < CLOUD_COUNT; c++) {
      const cloud = new THREE.Group();
      /* 8-12 overlapping puffs per cloud (was 5-8) — denser core
       * gives a real volumetric mass, while a few outlier "tufts"
       * stretch the silhouette into a cumulus shape. */
      const baseW = 16 + (c % 3) * 5;
      const baseH = 7 + (c % 2) * 2.5;
      const puffCount = 9 + (c % 4);

      /* Bottom-shadow puff layer — slightly larger, darker, sits
       * below the core puffs so the cloud reads as having a sunlit
       * top and shadowed underside. */
      const shadowCount = 4 + (c % 3);
      for (let p = 0; p < shadowCount; p++) {
        const t = p / Math.max(1, shadowCount - 1);
        const px = (t - 0.5) * baseW * 1.1;
        const py = -1.5 - ((p * 5) % 3) * 0.4;
        const pscale = 9 + Math.sin(t * Math.PI) * 7 + ((c + p) % 3) * 1.0;
        const puff = makePuff(pscale, 0.55, cloudPuffTexShadow);
        puff.position.set(px, py, ((p * 0.7) % 2.0) - 1.0);
        cloud.add(puff);
      }

      /* Core puff layer — the bright sun-lit top of the cloud */
      for (let p = 0; p < puffCount; p++) {
        const t = p / Math.max(1, puffCount - 1);
        /* Lay puffs along a slight arc so the silhouette has a
         * cumulus-style hump in the middle, lower on the edges. */
        const px = (t - 0.5) * baseW * (1.3 + (c % 2) * 0.2);
        const py = Math.sin(t * Math.PI) * baseH * 0.85 + ((p * 7) % 3) * 0.4;
        const pscale = 8 + Math.sin(t * Math.PI) * 6.5 + ((c + p) % 4) * 0.9;
        cloud.add(makePuff(pscale, 0.82 - (p % 3) * 0.06));
        const last = cloud.children[cloud.children.length - 1];
        last.position.set(px, py, ((p * 0.7) % 2.2) - 1.0);
      }

      /* Top-highlight tufts — small bright puffs on top of the
       * cumulus hump for the bright sunlit cap. */
      const tuftCount = 2 + (c % 3);
      for (let p = 0; p < tuftCount; p++) {
        const t = (p + 0.5) / tuftCount;
        const px = (t - 0.5) * baseW * 0.6;
        const py = baseH * 0.7 + ((p * 3) % 2) * 0.3;
        const pscale = 5 + ((c + p) % 3) * 1.5;
        const puff = makePuff(pscale, 0.92);
        puff.position.set(px, py, ((p * 0.4) % 1.4) - 0.7);
        cloud.add(puff);
      }

      const angle0 = (c / CLOUD_COUNT) * Math.PI * 2 + (c * 0.31);
      const radius = 110 + (c * 13) % 90;
      const altitude = 28 + (c * 4.1) % 22;
      const speed = 0.014 + (c % 4) * 0.005; // rad/s — slightly slower
      cloud.userData = { angle: angle0, radius, altitude, speed };
      cloud.position.set(
        Math.cos(angle0) * radius,
        altitude,
        Math.sin(angle0) * radius
      );
      scene.add(cloud);
      clouds.push(cloud);
    }

    /* ---------- SIMPLY SILICON cloud (letters made of puffs) ----
     *
     * Instead of slapping text on a flat plane, we sample the
     * "SIMPLY SILICON" string onto a 2D bitmap canvas, then walk
     * every "lit" pixel and place a small cloud-puff sprite at
     * each position. The result is an actual cloud-shaped
     * formation that SPELLS the wordmark — letters made out of
     * cloud puffs, not a billboard.
     *
     * The sample canvas is sized GENEROUSLY (1600 wide × 200 tall)
     * with the text rendered at 88px so neither character
     * "SIMPLY" nor "SILICON" gets clipped. We measure the actual
     * text extent before drawing so the world-space mapping is
     * tight to the letterforms. */
    const teaser = new THREE.Group();
    const TEASER_TEXT = "SIMPLY  SILICON";
    const sampleCanvas = document.createElement("canvas");
    sampleCanvas.width = 1600; sampleCanvas.height = 200;
    const sctx = sampleCanvas.getContext("2d");
    sctx.fillStyle = "#000";
    sctx.fillRect(0, 0, 1600, 200);
    sctx.fillStyle = "#fff";
    sctx.font = "bold 110px 'JetBrains Mono', monospace";
    sctx.textBaseline = "middle";
    sctx.textAlign = "center";
    /* Measure the text first so we know its actual width and can
     * map letterforms to world space without clipping. */
    const metrics = sctx.measureText(TEASER_TEXT);
    const textW = Math.min(1500, Math.ceil(metrics.width));
    sctx.fillText(TEASER_TEXT, 800, 100);
    const data = sctx.getImageData(0, 0, 1600, 200).data;
    /* Sample on a 7-pixel grid → ~225 × 28 candidate cells. Place
     * one puff per "lit" cell, mapped into world units. */
    const STEP = 7;
    /* World extent scales with the actual rendered text width so
     * "SIMPLY SILICON" fits the full word + a little breathing
     * room. ~80 world units wide × 12 tall. */
    const W_WORLD = 80;
    const H_WORLD = 12;
    /* Find horizontal extent of lit pixels so we can centre + scale
     * the cloud tightly around the actual letterforms. */
    let minX = 1600, maxX = 0, minY = 200, maxY = 0;
    for (let py = 0; py < 200; py += STEP) {
      for (let px = 0; px < 1600; px += STEP) {
        if (data[(py * 1600 + px) * 4] > 128) {
          if (px < minX) minX = px;
          if (px > maxX) maxX = px;
          if (py < minY) minY = py;
          if (py > maxY) maxY = py;
        }
      }
    }
    const litW = Math.max(1, maxX - minX);
    const litH = Math.max(1, maxY - minY);
    for (let py = minY; py <= maxY; py += STEP) {
      for (let px = minX; px <= maxX; px += STEP) {
        const idx = (py * 1600 + px) * 4;
        if (data[idx] <= 128) continue;
        const wx = ((px - minX) / litW - 0.5) * W_WORLD;
        const wy = (0.5 - (py - minY) / litH) * H_WORLD;
        /* Each letter-puff is small but slightly varied for an
         * organic cloud look. */
        const baseScale = 2.4 + ((px + py) % 6) * 0.2;
        const puff = makePuff(baseScale, 0.92);
        puff.position.set(wx, wy, ((px * 0.013) % 1.4) - 0.7);
        teaser.add(puff);
      }
    }
    /* No underlying "cloud body" — the user wants ONLY the letters
     * visible, not a base of fluffy puffs underneath. */
    teaser.userData = {
      angle: Math.PI * 0.6,
      radius: 160,
      altitude: 60,
      speed: 0.012, // ~1 lap per ~9 minutes — slow enough to be a
                    // discoverable easter egg, not a distraction
      teaser: true,
    };
    scene.add(teaser);
    clouds.push(teaser); // share the orbit-update logic

    /* Skybox-like sphere — gives a subtle horizon gradient. Daylight
     * palette: zenith deep-blue, horizon warm hazy off-white so the
     * cumulus clouds + sun read as a real sky rather than a stage
     * backdrop. Inside-out sphere with a vertical gradient. */
    const skyGeo = new THREE.SphereGeometry(420, 24, 18);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor:    { value: new THREE.Color(0x3b6f9c) },
        bottomColor: { value: new THREE.Color(0xe2dccd) },
        offset:      { value: 80 },
        exponent:    { value: 0.55 },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + offset).y;
          gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
        }`,
    });
    scene.add(new THREE.Mesh(skyGeo, skyMat));

    /* ---------- World group (centred on the building) ---------- */
    const worldGroup = new THREE.Group();
    scene.add(worldGroup);

    /* Centre on the BUILDING (not just the data hall) so outdoor
     * yard fits in frame too. */
    const cx = plan.building.x + plan.building.w / 2;
    const cz = plan.building.y + plan.building.h / 2;
    const svgToWorld = (x, y) => [(x - cx) * WORLD_SCALE, 0, (y - cz) * WORLD_SCALE];
    const sw = (px) => px * WORLD_SCALE;

    /* ---------- Site / context ground ---------- */
    /* Site colour palette varies with location type so the user
     * immediately sees the difference between a greenfield rural
     * facility (green grass), an urban-edge campus (asphalt +
     * adjacent city blocks), a repurposed industrial site (warm
     * brown tones), and a campus-adjacent (pale concrete).
     * Daylight-tuned: under the new sky shader the ground reads
     * as midday-lit rather than a dark backdrop. */
    const SITE_PALETTES = {
      rural:     { ground: 0x4a6e3a, setback: 0x5a8048, kind: "grass" },
      urban:     { ground: 0x5a6068, setback: 0x6c7280, kind: "asphalt" },
      repurpose: { ground: 0x7a5a3e, setback: 0x8a6a4a, kind: "asphalt" },
      campus:    { ground: 0x6e7176, setback: 0x80848a, kind: "concrete" },
    };
    const sitePal = SITE_PALETTES[locationType] || SITE_PALETTES.rural;

    /* PolyHaven CDN URLs for the diffuse-only PBR textures.
     * 1k JPG ≈ 600KB each, post-paint, lazy-loaded. */
    const POLYHAVEN_TEX = {
      grass:    "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/aerial_grass_rock/aerial_grass_rock_diff_1k.jpg",
      asphalt:  "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/asphalt_02/asphalt_02_diff_1k.jpg",
      concrete: "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/concrete_floor_02/concrete_floor_02_diff_1k.jpg",
      gravel:   "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/aerial_beach_01/aerial_beach_01_diff_1k.jpg",
    };

    if (plan.site) {
      const [sx, , sz] = svgToWorld(plan.site.x + plan.site.w / 2, plan.site.y + plan.site.h / 2);

      /* Outer "context" ground — sized to cover everything that ever
       * sits OUTSIDE the official site rectangle: outdoor power yard
       * (substation + gensets at -bldgW/2 - 120 SVG units, plus solar
       * PV at yardX - 160), trees scattered around the perimeter,
       * compass arrow, light poles. Without this base plate, the yard
       * + trees float on top of the dark void below. We use a darker
       * tone so it's clearly outside the parcel boundary. */
      const yardOffset = sw(plan.building.w * 0.5 + 200);
      const groundW = Math.max(sw(plan.site.w) + yardOffset * 2.4, sw(plan.site.w) + 80);
      const groundH = Math.max(sw(plan.site.h) + 60, sw(plan.site.h) * 1.4);
      const groundGeo = new THREE.BoxGeometry(groundW, 0.18, groundH);
      const groundMat = new THREE.MeshStandardMaterial({
        color: 0x4a523c,
        roughness: 1.0, metalness: 0.0,
        roughnessMap: proceduralNoiseTexture({ size: 64, scale: 12, seed: 113 }),
        envMapIntensity: 0.35, // dim IBL contribution so ground stays matte
      });
      const groundMesh = new THREE.Mesh(groundGeo, groundMat);
      groundMesh.position.set(0, -0.9, 0);
      groundMesh.receiveShadow = true;
      worldGroup.add(groundMesh);
      /* Outer ground gets a subtle wild-grass texture (rural-ish
       * even in urban builds — represents the parcel surroundings). */
      queueTextureUpgrade(groundMat, POLYHAVEN_TEX.grass, 16);

      /* Site (parcel) plate — the "owned" land inside the fence line. */
      const siteGeo = new THREE.BoxGeometry(sw(plan.site.w), 0.2, sw(plan.site.h));
      const siteMat = new THREE.MeshStandardMaterial({
        color: sitePal.ground, roughness: 1.0, metalness: 0.0,
        roughnessMap: proceduralNoiseTexture({ size: 64, scale: 8, seed: 119 }),
        envMapIntensity: 0.35,
      });
      const siteMesh = new THREE.Mesh(siteGeo, siteMat);
      siteMesh.position.set(sx, -0.5, sz);
      siteMesh.receiveShadow = true;
      worldGroup.add(siteMesh);
      /* Choose the right texture for the site palette kind. */
      const siteTex = sitePal.kind === "grass" ? POLYHAVEN_TEX.grass
        : sitePal.kind === "asphalt" ? POLYHAVEN_TEX.asphalt
        : POLYHAVEN_TEX.concrete;
      queueTextureUpgrade(siteMat, siteTex, 8);

      /* Setback band — slightly inset, lighter palette */
      const setW = sw(plan.site.w - plan.site.setback * 2);
      const setH = sw(plan.site.h - plan.site.setback * 2);
      const setGeo = new THREE.BoxGeometry(setW, 0.1, setH);
      const setMat = new THREE.MeshStandardMaterial({
        color: sitePal.setback, roughness: 1.0, metalness: 0.0,
        roughnessMap: proceduralNoiseTexture({ size: 64, scale: 8, seed: 127 }),
        envMapIntensity: 0.35,
      });
      const setMesh = new THREE.Mesh(setGeo, setMat);
      setMesh.position.set(sx, -0.4, sz);
      setMesh.receiveShadow = true;
      worldGroup.add(setMesh);
      queueTextureUpgrade(setMat, siteTex, 6);

      /* A separate gravel pad to the WEST of the parcel — this is
       * where the outdoor power yard sits. Gives the equipment a
       * believable surface (gravel hardstanding, like a real DC's
       * generator yard) instead of floating over dirt. */
      const yardW = yardOffset * 0.95;
      const yardH = sw(plan.site.h) * 0.85;
      const yardX_world = -sw(plan.site.w) * 0.5 - yardOffset * 0.5;
      const yardGeo = new THREE.BoxGeometry(yardW, 0.16, yardH);
      const yardMat = new THREE.MeshStandardMaterial({
        color: 0x747a82, roughness: 1.0, metalness: 0.05,
        roughnessMap: proceduralNoiseTexture({ size: 64, scale: 6, seed: 131 }),
        envMapIntensity: 0.35,
      });
      const yardPad = new THREE.Mesh(yardGeo, yardMat);
      yardPad.position.set(yardX_world, -0.42, 0);
      yardPad.receiveShadow = true;
      worldGroup.add(yardPad);
      queueTextureUpgrade(yardMat, POLYHAVEN_TEX.gravel, 6);

      /* Connecting access road from the parcel to the yard pad —
       * narrow concrete strip so it reads as utility infrastructure. */
      const roadGeo = new THREE.BoxGeometry(yardOffset * 0.6, 0.12, 4);
      const roadMat = new THREE.MeshStandardMaterial({
        color: 0x2a3138, roughness: 0.8, metalness: 0.05,
      });
      const road = new THREE.Mesh(roadGeo, roadMat);
      road.position.set(yardX_world / 2, -0.4, 0);
      road.receiveShadow = true;
      worldGroup.add(road);

      /* Tree scatter array — populated per location type below.
       * Ref'd by the wind-sway loop after the main tick block. */
      const sceneTrees = [];

      /* Location-specific surroundings */
      if (locationType === "rural") {
        /* Mixed forest perimeter — pine + oak + birch + poplar in
         * a wider organic ring so the boundary reads as natural
         * woodland, not a regular plantation. Sizes vary per-tree
         * for the small-sapling-to-mature-tree variation real
         * forests have. */
        const treeCount = 38;
        for (let i = 0; i < treeCount; i++) {
          const ang = (i / treeCount) * Math.PI * 2 + (i * 0.137) % 1.0;
          const baseR = Math.max(sw(plan.site.w), sw(plan.site.h)) * 0.42;
          /* Wider radial jitter so trees don't sit on a perfect
           * circle — real forests have layered density. */
          const r = baseR + ((i * 7) % 13) * 0.45 + (i % 5) * 0.3;
          const tx = sx + Math.cos(ang) * r;
          const tz = sz + Math.sin(ang) * r;
          const scale = 0.7 + ((i * 0.31) % 0.85);
          /* Species mix: 55% pine, 25% oak, 12% birch, 8% poplar.
           * Roughly matches a North-American mixed-conifer forest. */
          const sp = i % 20;
          const species = sp < 11 ? "pine"
            : sp < 16 ? "oak"
            : sp < 18 ? "birch"
            : "poplar";
          const tree = buildTree(species, scale, i * 7 + 3);
          tree.position.set(tx, 0, tz);
          tree.rotation.y = (i * 0.917) % (Math.PI * 2);
          worldGroup.add(tree);
          sceneTrees.push(tree);
        }

        /* Multi-puff bushes near the building entrance — the
         * landscaping read of a designed entry plaza. */
        for (let i = 0; i < 8; i++) {
          const bx = sx + ((i % 3) - 1) * 8 + (i * 1.7);
          const bz = sz + sw(plan.site.h) * 0.32 + (i % 2 === 0 ? -1.4 : 1.4);
          const bush = buildBush(0.85 + (i * 0.11) % 0.5, i * 11 + 5);
          bush.position.set(bx, 0, bz);
          worldGroup.add(bush);
        }
      } else if (locationType === "urban") {
        /* Detailed neighbouring city blocks — each is a real
         * mid-rise commercial building rather than a flat box.
         * Each prefab includes:
         *   - Shell with chamfered roof line
         *   - Procedural window-grid texture (lit windows at varying
         *     intensity for an evening-city feel)
         *   - Roof HVAC equipment cluster
         *   - Parapet edge
         *   - Antenna/satellite on every 4th building
         */

        /* Window-grid texture — generated once, reused on every
         * building face. Procedural so every building reads as a
         * dense grid of office windows. */
        function makeWindowGridTexture(cols = 10, rows = 16, seed = 0) {
          const c = document.createElement("canvas");
          c.width = 256; c.height = 512;
          const x = c.getContext("2d");
          /* Dark base */
          x.fillStyle = "#181d24";
          x.fillRect(0, 0, 256, 512);
          /* Mortar/structure lines */
          x.fillStyle = "#0c1015";
          for (let i = 0; i <= cols; i++) x.fillRect((i * 256) / cols - 1, 0, 2, 512);
          for (let j = 0; j <= rows; j++) x.fillRect(0, (j * 512) / rows - 1, 256, 2);
          /* Window pane brightness — pseudo-random; some lit, some dark */
          for (let j = 0; j < rows; j++) {
            for (let i = 0; i < cols; i++) {
              const r = Math.sin((i * 12.9898 + j * 78.233 + seed) * 0.7) * 0.5 + 0.5;
              const lit = r > 0.42;
              const warm = r > 0.78;
              if (lit) {
                const a = warm ? "rgba(255, 215, 140, 0.85)" : "rgba(170, 200, 230, 0.55)";
                x.fillStyle = a;
                const px = (i * 256) / cols + 4;
                const py = (j * 512) / rows + 3;
                const pw = 256 / cols - 8;
                const ph = 512 / rows - 6;
                x.fillRect(px, py, pw, ph);
              }
            }
          }
          const tex = new THREE.CanvasTexture(c);
          tex.wrapS = THREE.RepeatWrapping;
          tex.wrapT = THREE.RepeatWrapping;
          return tex;
        }

        const cityR = Math.max(sw(plan.site.w), sw(plan.site.h)) * 0.55;
        const blockCount = 14;
        const concreteMat = new THREE.MeshStandardMaterial({
          color: 0x4a525d, roughness: 0.85, metalness: 0.15,
          roughnessMap: proceduralNoiseTexture({ size: 64, scale: 4, seed: 91 }),
        });
        const parapetMat = new THREE.MeshStandardMaterial({
          color: 0x6a747f, roughness: 0.7, metalness: 0.3,
        });
        const hvacMat = new THREE.MeshStandardMaterial({
          color: 0x3d464f, roughness: 0.6, metalness: 0.5,
        });
        const antennaMat = new THREE.MeshStandardMaterial({
          color: 0xc0c8d0, roughness: 0.4, metalness: 0.85,
        });

        for (let i = 0; i < blockCount; i++) {
          const ang = (i / blockCount) * Math.PI * 2 + 0.2;
          const r = cityR + (i % 3) * 4;
          const bw = 5 + (i % 3) * 1.5;
          const bh = 7 + (i * 1.7) % 14;
          const bd = 5 + ((i * 2) % 3) * 1.4;
          const bx = sx + Math.cos(ang) * r;
          const bz = sz + Math.sin(ang) * r;

          const blockGroup = new THREE.Group();
          blockGroup.position.set(bx, 0, bz);
          /* Slight rotation so blocks are loosely aligned to the
           * site, not orthogonal to it (cities rarely line up that
           * way relative to the facility). */
          blockGroup.rotation.y = ang + Math.PI / 2 + (i * 0.13);

          /* Window-grid material per building — sample with varied
           * tile counts so towers don't all read the same. */
          const cols = 6 + (i % 4);
          const rows = Math.max(8, Math.floor(bh * 1.6));
          const winMat = new THREE.MeshStandardMaterial({
            color: 0xf0f0f0,
            roughness: 0.4,
            metalness: 0.2,
            map: makeWindowGridTexture(cols, rows, i * 13 + 1),
            emissive: 0xfff0d0,
            emissiveIntensity: 0.25,
            emissiveMap: null,
          });
          /* Reuse the window-grid as emissive too so lit panes
           * actually glow — emissiveMap shares the same image. */
          winMat.emissiveMap = winMat.map;

          /* Tower shell — separate top cap so we can mount roof eqpt */
          const shell = new THREE.Mesh(
            roundedBox(bw, bh, bd, 0.06),
            [winMat, winMat, concreteMat, concreteMat, winMat, winMat],
          );
          /* The above material array is a fallback; for simplicity
           * use the window material for ALL faces (top is hidden by
           * roof equipment below). */
          shell.material = winMat;
          shell.position.y = bh / 2;
          shell.castShadow = true;
          shell.receiveShadow = true;
          blockGroup.add(shell);

          /* Parapet — thin band around the roof edge */
          const parapet = new THREE.Mesh(
            new THREE.BoxGeometry(bw + 0.1, 0.35, bd + 0.1),
            parapetMat,
          );
          parapet.position.y = bh + 0.18;
          blockGroup.add(parapet);

          /* Roof HVAC cluster — 2-3 condenser units */
          const hvacCount = 2 + (i % 2);
          for (let h = 0; h < hvacCount; h++) {
            const hvac = new THREE.Mesh(
              roundedBox(0.9, 0.45, 0.7, 0.04),
              hvacMat,
            );
            hvac.position.set(
              -bw * 0.25 + h * (bw * 0.25),
              bh + 0.6,
              -bd * 0.2,
            );
            blockGroup.add(hvac);
            /* Fan grille on top */
            const grille = new THREE.Mesh(
              new THREE.TorusGeometry(0.22, 0.025, 6, 16),
              antennaMat,
            );
            grille.rotation.x = Math.PI / 2;
            grille.position.set(
              -bw * 0.25 + h * (bw * 0.25),
              bh + 0.85,
              -bd * 0.2,
            );
            blockGroup.add(grille);
          }

          /* Every 4th building gets an antenna or satellite */
          if (i % 4 === 0) {
            const mast = new THREE.Mesh(
              new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6),
              antennaMat,
            );
            mast.position.set(bw * 0.3, bh + 1.0, bd * 0.25);
            blockGroup.add(mast);
            /* Cross arms */
            for (let a = 0; a < 3; a++) {
              const arm = new THREE.Mesh(
                new THREE.BoxGeometry(0.45 - a * 0.08, 0.025, 0.025),
                antennaMat,
              );
              arm.position.set(bw * 0.3, bh + 1.4 - a * 0.32, bd * 0.25);
              blockGroup.add(arm);
            }
          } else if (i % 5 === 0) {
            /* Dish */
            const dish = new THREE.Mesh(
              new THREE.SphereGeometry(0.32, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.2),
              antennaMat,
            );
            dish.rotation.x = -0.3;
            dish.position.set(bw * 0.25, bh + 0.55, bd * 0.3);
            blockGroup.add(dish);
          }

          worldGroup.add(blockGroup);
        }

        /* Even urban scenes get a few street trees along the
         * approach — gives the city blocks an "urban canopy" feel. */
        const urbanTreeCount = 8;
        for (let i = 0; i < urbanTreeCount; i++) {
          const ang = (i / urbanTreeCount) * Math.PI * 2 + 0.5;
          const r = cityR * 0.7;
          const tx = sx + Math.cos(ang) * r;
          const tz = sz + Math.sin(ang) * r;
          const tree = buildTree("ornamental", 0.7 + (i % 3) * 0.12, i * 13 + 17);
          tree.position.set(tx, 0, tz);
          worldGroup.add(tree);
          sceneTrees.push(tree);
        }
      } else if (locationType === "repurpose") {
        /* Repurposed industrial site — brick smokestacks + tilt-up
         * concrete warehouse buildings with loading bays + roof
         * monitor sawtooths + scattered shrubs growing through
         * cracked pavement. Reads as "former industrial, retrofitted". */
        const brickMat = new THREE.MeshStandardMaterial({
          color: 0x6a3a25, roughness: 0.9, metalness: 0.05,
          roughnessMap: proceduralNoiseTexture({ size: 64, scale: 6, seed: 73 }),
        });
        const stackBandMat = new THREE.MeshStandardMaterial({
          color: 0x3a2014, roughness: 0.85, metalness: 0.1,
        });

        /* Brick smokestacks — taller, with banded relief and
         * service ladders. Three stacks of varying heights. */
        for (let i = 0; i < 3; i++) {
          const ang = -1 + i * 1.4;
          const r = Math.max(sw(plan.site.w), sw(plan.site.h)) * 0.42;
          const tx = sx + Math.cos(ang) * r;
          const tz = sz + Math.sin(ang) * r;
          const stackH = 8.0 + i * 2;
          /* Three-section tapered cylinder: base, mid, top */
          const stackBase = new THREE.Mesh(
            new THREE.CylinderGeometry(0.55, 0.7, stackH * 0.55, 14),
            brickMat,
          );
          stackBase.position.set(tx, stackH * 0.275, tz);
          stackBase.castShadow = true;
          worldGroup.add(stackBase);

          const stackMid = new THREE.Mesh(
            new THREE.CylinderGeometry(0.45, 0.55, stackH * 0.35, 14),
            brickMat,
          );
          stackMid.position.set(tx, stackH * 0.55 + stackH * 0.175, tz);
          stackMid.castShadow = true;
          worldGroup.add(stackMid);

          const stackTop = new THREE.Mesh(
            new THREE.CylinderGeometry(0.4, 0.45, stackH * 0.1, 14),
            stackBandMat,
          );
          stackTop.position.set(tx, stackH * 0.95, tz);
          worldGroup.add(stackTop);

          /* Decorative band rings */
          for (let b = 0; b < 3; b++) {
            const band = new THREE.Mesh(
              new THREE.TorusGeometry(0.6 - b * 0.05, 0.04, 6, 16),
              stackBandMat,
            );
            band.rotation.x = Math.PI / 2;
            band.position.set(tx, stackH * (0.18 + b * 0.18), tz);
            worldGroup.add(band);
          }

          /* Service ladder cage on one side */
          for (let r = 0; r < 6; r++) {
            const rung = new THREE.Mesh(
              new THREE.BoxGeometry(0.18, 0.02, 0.025),
              stackBandMat,
            );
            rung.position.set(tx + 0.62, 0.4 + r * 1.0, tz);
            worldGroup.add(rung);
          }
        }

        /* Tilt-up warehouse buildings with sawtooth roof monitors —
         * a classic 60s-90s industrial silhouette. */
        const warehouseMat = new THREE.MeshStandardMaterial({
          color: 0x6e5544, roughness: 0.92, metalness: 0.08,
          roughnessMap: proceduralNoiseTexture({ size: 64, scale: 5, seed: 79 }),
        });
        const warehouseSeamMat = new THREE.MeshStandardMaterial({
          color: 0x3a2c20, roughness: 0.85,
        });
        const positions = [
          { x: sx - sw(plan.site.w) * 0.45, z: sz + sw(plan.site.h) * 0.35, w: 10, h: 5, d: 14 },
          { x: sx + sw(plan.site.w) * 0.42, z: sz - sw(plan.site.h) * 0.38, w: 14, h: 4, d: 9 },
        ];
        positions.forEach((p, idx) => {
          const wh = new THREE.Group();
          wh.position.set(p.x, 0, p.z);

          /* Main shell */
          const shell = new THREE.Mesh(
            roundedBox(p.w, p.h, p.d, 0.06),
            warehouseMat,
          );
          shell.position.y = p.h / 2;
          shell.castShadow = true;
          shell.receiveShadow = true;
          wh.add(shell);

          /* Sawtooth roof — series of triangular monitors angled
           * north for daylighting (the classic factory silhouette) */
          const teeth = Math.max(3, Math.floor(p.d / 3));
          const toothW = p.d / teeth;
          for (let s = 0; s < teeth; s++) {
            const toothShape = new THREE.Shape();
            toothShape.moveTo(0, 0);
            toothShape.lineTo(toothW, 0);
            toothShape.lineTo(0, 0.85);
            toothShape.lineTo(0, 0);
            const toothGeo = new THREE.ExtrudeGeometry(toothShape, {
              depth: p.w - 0.4,
              bevelEnabled: false,
            });
            toothGeo.translate(-(p.w - 0.4) / 2, 0, 0);
            toothGeo.rotateY(Math.PI / 2);
            const tooth = new THREE.Mesh(toothGeo, warehouseMat);
            tooth.position.set(0, p.h, -p.d / 2 + s * toothW);
            tooth.castShadow = true;
            wh.add(tooth);
            /* Glass face on the angled side */
            const glassGeo = new THREE.PlaneGeometry(p.w - 0.4, 1.05);
            const glassMat = new THREE.MeshStandardMaterial({
              color: 0xa6c4d6, roughness: 0.25, metalness: 0.75,
              transparent: true, opacity: 0.55,
            });
            const glass = new THREE.Mesh(glassGeo, glassMat);
            glass.position.set(0, p.h + 0.45, -p.d / 2 + s * toothW + toothW * 0.05);
            glass.rotation.x = -Math.atan2(0.85, toothW) + Math.PI;
            glass.rotation.y = -Math.PI / 2;
            wh.add(glass);
          }

          /* Loading bay door (one side) */
          const door = new THREE.Mesh(
            new THREE.BoxGeometry(p.w * 0.32, p.h * 0.7, 0.04),
            warehouseSeamMat,
          );
          door.position.set(0, p.h * 0.35, p.d / 2 + 0.02);
          wh.add(door);

          worldGroup.add(wh);
        });

        /* A few hardy "industrial volunteer" trees that took root
         * in the cracked yard — birch and poplar typical of
         * post-industrial sites. */
        for (let i = 0; i < 12; i++) {
          const ang = (i / 12) * Math.PI * 2 + 0.3;
          const r = Math.max(sw(plan.site.w), sw(plan.site.h)) * 0.46 + (i % 4) * 0.6;
          const tx = sx + Math.cos(ang) * r;
          const tz = sz + Math.sin(ang) * r;
          const sp = i % 5 < 2 ? "birch" : i % 5 < 4 ? "poplar" : "oak";
          const tree = buildTree(sp, 0.7 + (i % 3) * 0.15, i * 23 + 41);
          tree.position.set(tx, 0, tz);
          tree.rotation.y = (i * 0.71) % (Math.PI * 2);
          worldGroup.add(tree);
          sceneTrees.push(tree);
        }
      } else if (locationType === "campus") {
        /* Campus-adjacent — low-rise office buildings (3-5 stories)
         * with curtain-wall window patterns + canopy entrances +
         * landscaped strip between facility and campus. Reads as
         * "next to a corporate/university campus". */
        const officeShellMat = new THREE.MeshStandardMaterial({
          color: 0x4a525d, roughness: 0.55, metalness: 0.25,
          roughnessMap: proceduralNoiseTexture({ size: 64, scale: 4, seed: 89 }),
        });
        const officeRibbonMat = new THREE.MeshStandardMaterial({
          color: 0x4a637c, roughness: 0.25, metalness: 0.75,
          transparent: true, opacity: 0.7,
        });
        const officeAccentMat = new THREE.MeshStandardMaterial({
          color: 0xb8c0c8, roughness: 0.4, metalness: 0.7,
        });
        const offsets = [
          { x: -sw(plan.site.w) * 0.55, z: sw(plan.site.h) * 0.35, w: 12, h: 6, d: 24 },
          { x: -sw(plan.site.w) * 0.55, z: -sw(plan.site.h) * 0.05, w: 10, h: 7, d: 14 },
          { x: sw(plan.site.w) * 0.55, z: sw(plan.site.h) * 0.4, w: 14, h: 5, d: 11 },
        ];
        offsets.forEach((p, idx) => {
          const ofc = new THREE.Group();
          ofc.position.set(sx + p.x, 0, sz + p.z);

          /* Main shell — chamfered + ribbon glass middle band */
          const kickerH = p.h * 0.28;
          const ribbonH = p.h * 0.5;
          const capH = p.h - kickerH - ribbonH;
          /* Kicker (concrete base) */
          const kicker = new THREE.Mesh(
            roundedBox(p.w, kickerH, p.d, 0.05),
            officeShellMat,
          );
          kicker.position.y = kickerH / 2;
          kicker.castShadow = true;
          kicker.receiveShadow = true;
          ofc.add(kicker);
          /* Ribbon glass */
          const ribbon = new THREE.Mesh(
            new THREE.BoxGeometry(p.w * 0.99, ribbonH, p.d * 0.99),
            officeRibbonMat,
          );
          ribbon.position.y = kickerH + ribbonH / 2;
          ofc.add(ribbon);
          /* Cap */
          const cap = new THREE.Mesh(
            roundedBox(p.w, capH, p.d, 0.05),
            officeShellMat,
          );
          cap.position.y = kickerH + ribbonH + capH / 2;
          cap.castShadow = true;
          ofc.add(cap);

          /* Vertical mullions across the ribbon */
          const mullionCount = Math.max(6, Math.floor(p.w / 1.5));
          for (let m = 1; m < mullionCount; m++) {
            const mx = -p.w / 2 + (m / mullionCount) * p.w;
            for (const s of [-1, 1]) {
              const mull = new THREE.Mesh(
                new THREE.BoxGeometry(0.05, ribbonH, 0.06),
                officeAccentMat,
              );
              mull.position.set(mx, kickerH + ribbonH / 2, s * p.d / 2);
              ofc.add(mull);
            }
          }

          /* Entrance canopy on the long axis */
          const canopy = new THREE.Mesh(
            new THREE.BoxGeometry(p.w * 0.3, 0.12, 1.6),
            officeAccentMat,
          );
          canopy.position.set(0, 1.8, p.d / 2 + 0.7);
          ofc.add(canopy);
          /* 2 support posts */
          for (const cx2 of [-p.w * 0.12, p.w * 0.12]) {
            const post = new THREE.Mesh(
              new THREE.BoxGeometry(0.08, 1.8, 0.08),
              officeAccentMat,
            );
            post.position.set(cx2, 0.9, p.d / 2 + 1.4);
            ofc.add(post);
          }

          /* Roof HVAC */
          for (let h = 0; h < 2; h++) {
            const hvac = new THREE.Mesh(
              roundedBox(0.9, 0.45, 0.7, 0.04),
              new THREE.MeshStandardMaterial({
                color: 0x3d464f, roughness: 0.6, metalness: 0.5,
              }),
            );
            hvac.position.set(-p.w * 0.2 + h * (p.w * 0.4), p.h + 0.5, 0);
            ofc.add(hvac);
          }

          worldGroup.add(ofc);
        });

        /* Ornamental trees lining the campus edge — varied species
         * for a designed landscape feel. */
        for (let i = 0; i < 14; i++) {
          const ang = (i / 14) * Math.PI * 2;
          const r = Math.max(sw(plan.site.w), sw(plan.site.h)) * 0.4 + (i % 3) * 0.35;
          const tx = sx + Math.cos(ang) * r;
          const tz = sz + Math.sin(ang) * r;
          /* 60% ornamental, 25% birch, 15% poplar */
          const sp = i % 7 < 4 ? "ornamental" : i % 7 < 6 ? "birch" : "poplar";
          const tree = buildTree(sp, 0.85 + (i % 3) * 0.1, i * 17 + 23);
          tree.position.set(tx, 0, tz);
          tree.rotation.y = (i * 0.811) % (Math.PI * 2);
          worldGroup.add(tree);
          sceneTrees.push(tree);
        }
      }
    }

    /* ---------- Building shell ---------- */
    /* The slab pad is always visible (it represents the staked-out
     * building footprint at Phase 1). The walls + roof appear from
     * Phase 2 / Phase 4 respectively as the user procures power and
     * approves construction. */
    const bldg = plan.building;
    const slabGeo = new THREE.BoxGeometry(sw(bldg.w) * 1.04, 0.4, sw(bldg.h) * 1.04);
    const slabMat = new THREE.MeshStandardMaterial({
      color: 0x747a82, roughness: 1.0, metalness: 0.0,
      roughnessMap: proceduralNoiseTexture({ size: 64, scale: 4, seed: 137 }),
      envMapIntensity: 0.4,
    });
    const slab = new THREE.Mesh(slabGeo, slabMat);
    slab.position.set(0, -0.2, 0);
    slab.receiveShadow = true;
    worldGroup.add(slab);
    queueTextureUpgrade(slabMat, POLYHAVEN_TEX.concrete, 4);

    /* Phase-1 stake-out marker: a thin mint outline rectangle on the
     * pad so the user sees where the building WILL go before the
     * walls go up. Hidden once the walls render at Phase 2+. */
    if (!showBuilding) {
      const outlineGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(sw(bldg.w), 0.05, sw(bldg.h)));
      const outlineMat = new THREE.LineDashedMaterial({
        color: 0x33fbd3, dashSize: 0.6, gapSize: 0.4, transparent: true, opacity: 0.6,
      });
      const outline = new THREE.LineSegments(outlineGeo, outlineMat);
      outline.computeLineDistances();
      outline.position.y = 0.05;
      worldGroup.add(outline);
      labelTargets.push({
        x: 0, y: 1, z: 0,
        title: "BUILDING FOOTPRINT",
        sub: "Phase 1 stake-out",
        kind: "compute",
      });
    }

    /* ---------- Architectural building shell ---------- */
    /* Real DC buildings are NOT simple boxes — they're tilt-up
     * concrete panel structures with parapets, loading docks,
     * personnel entrances, rooftop mechanical penthouses, and
     * perimeter fencing. We compose the building from those pieces
     * here so the 3D scene reads as a real industrial facility. */
    if (showBuilding) {
      /* Modern DC palettes — light metal cladding (Equinix / QTS /
       * Digital Realty look) with location-specific accents.
       * Repurposed industrial keeps the warm brick warmth, urban
       * gets a darker glass curtain wall vibe, rural/campus get the
       * crisp white panel system most modern hyperscalers use. */
      const wallPal = locationType === "repurpose"
        ? { tint: 0x8a4a2a, panel: 0x6a3a20, accent: 0xc88860, ribbon: 0x18242a, logoBand: 0xc88860 }
        : locationType === "urban"
        ? { tint: 0x6a7380, panel: 0x4f5763, accent: 0x6dd6ff, ribbon: 0x111720, logoBand: 0x222831 }
        : { tint: 0xd0d4d8, panel: 0xafb4ba, accent: 0x33fbd3, ribbon: 0x18242a, logoBand: 0xeef0f3 };

      /* Solid concrete panel walls (one Mesh per face so we can give
       * each face slightly different material to read seams + shadow
       * gradient). Each face is divided into 5–8 vertical "panels"
       * by a thin recessed line so the user perceives tilt-up
       * construction. */
      const W = sw(bldg.w);
      const D = sw(bldg.h);
      /* Walls = mostly-transparent glass curtain so internal equipment
       * stays visible, plus solid horizontal "spandrel" bands at the
       * top and bottom of each face (where modern DCs have structural
       * concrete) that keep the building reading as a real building.
       * The middle band is a near-clear ribbon-window strip. */
      const wallSolidMat = new THREE.MeshStandardMaterial({
        color: wallPal.tint, roughness: 0.35, metalness: 0.55,
        transparent: true, opacity: 0.18,
        side: THREE.DoubleSide,
        depthWrite: false,
        emissive: fullyOnline ? 0x081218 : 0x000000,
        emissiveIntensity: fullyOnline ? 0.35 : 0,
      });
      const wallShadeMat = new THREE.MeshStandardMaterial({
        color: wallPal.panel, roughness: 0.4, metalness: 0.45,
        transparent: true, opacity: 0.22,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      /* Solid spandrel band at the bottom (kicker plate) and top
       * (parapet line), opaque metal cladding so the building has
       * a strong horizontal silhouette. */
      const spandrelMat = new THREE.MeshStandardMaterial({
        color: wallPal.panel, roughness: 0.55, metalness: 0.4,
      });
      /* Ribbon window glass — dark teal with a hint of emissive so it
       * reads as illuminated interior glow when the facility is on. */
      const ribbonMat = new THREE.MeshStandardMaterial({
        color: wallPal.ribbon, roughness: 0.15, metalness: 0.85,
        transparent: true, opacity: 0.55,
        emissive: fullyOnline ? 0x0a3a48 : 0x051218,
        emissiveIntensity: fullyOnline ? 0.45 : 0.2,
        side: THREE.DoubleSide,
      });
      const seamMat = new THREE.LineBasicMaterial({ color: 0x0a0e12, transparent: true, opacity: 0.7 });

      /* Aluminium mullion material — bright extruded frame profile
       * that subdivides the glass ribbon into individual window
       * lights. The single biggest "this is a real curtain wall"
       * tell at the scale of the building shell. */
      const mullionMat = new THREE.MeshStandardMaterial({
        color: 0xb8c0c8,
        roughness: 0.42,
        metalness: 0.78,
        emissive: 0x101216,
        emissiveIntensity: 0.1,
      });

      function placeWall(w, d, x, y, z, rotY, panelCount, mat) {
        /* Modern DC façade composition — three horizontal bands per
         * face: bottom 25% solid metal kicker (spandrel), middle 50%
         * darker glass ribbon window, top 25% solid metal cap.
         * Each is a separate mesh so the user perceives a real
         * curtain-wall system. */
        const kickerH = BUILDING_HEIGHT * 0.22;
        const ribbonH = BUILDING_HEIGHT * 0.42;
        const capH = BUILDING_HEIGHT - kickerH - ribbonH;

        /* Bottom kicker (solid metal) */
        const kicker = new THREE.Mesh(new THREE.BoxGeometry(w, kickerH, d), spandrelMat);
        kicker.position.set(x, y - BUILDING_HEIGHT / 2 + kickerH / 2, z);
        kicker.rotation.y = rotY;
        kicker.castShadow = true;
        kicker.receiveShadow = true;
        worldGroup.add(kicker);

        /* Middle ribbon window — slightly inset so it reads as glass */
        const ribbon = new THREE.Mesh(
          new THREE.BoxGeometry(w * 0.985, ribbonH, d * 0.6),
          ribbonMat
        );
        ribbon.position.set(x, y - BUILDING_HEIGHT / 2 + kickerH + ribbonH / 2, z);
        ribbon.rotation.y = rotY;
        worldGroup.add(ribbon);

        /* Top cap (solid metal cladding) */
        const cap = new THREE.Mesh(new THREE.BoxGeometry(w, capH, d), mat);
        cap.position.set(x, y + BUILDING_HEIGHT / 2 - capH / 2, z);
        cap.rotation.y = rotY;
        cap.castShadow = true;
        cap.receiveShadow = true;
        worldGroup.add(cap);

        /* Vertical panel seams — span the kicker + cap; gaps over the
         * ribbon are intentional so the seams don't cross the glass. */
        for (let i = 1; i < panelCount; i++) {
          const t = i / panelCount;
          /* Bottom seam (kicker only) */
          const seamGeoBot = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-w / 2 + t * w, -BUILDING_HEIGHT / 2 + 0.2, d / 2 + 0.01),
            new THREE.Vector3(-w / 2 + t * w, -BUILDING_HEIGHT / 2 + kickerH, d / 2 + 0.01),
          ]);
          const seamBot = new THREE.Line(seamGeoBot, seamMat);
          seamBot.position.set(x, y, z);
          seamBot.rotation.y = rotY;
          worldGroup.add(seamBot);
          /* Top seam (cap only) */
          const seamGeoTop = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-w / 2 + t * w, BUILDING_HEIGHT / 2 - capH, d / 2 + 0.01),
            new THREE.Vector3(-w / 2 + t * w, BUILDING_HEIGHT / 2 - 0.2, d / 2 + 0.01),
          ]);
          const seamTop = new THREE.Line(seamGeoTop, seamMat);
          seamTop.position.set(x, y, z);
          seamTop.rotation.y = rotY;
          worldGroup.add(seamTop);
        }

        /* Vertical mullions across the ribbon glass — twice the
         * density of the panel seams (so each panel module has 2
         * window lights). These are real solid bars with thickness so
         * they read at orbit zoom; cheap (~16 boxes per wall). */
        const mullionCount = panelCount * 2;
        const mullionThk = 0.06; // 6 cm IRL aluminum profile
        const mullionDepth = d * 0.12;
        const ribbonY = y - BUILDING_HEIGHT / 2 + kickerH + ribbonH / 2;
        for (let m = 1; m < mullionCount; m++) {
          const t = m / mullionCount;
          const mx = -w / 2 + t * w;
          const mullion = new THREE.Mesh(
            new THREE.BoxGeometry(mullionThk, ribbonH, mullionDepth),
            mullionMat,
          );
          mullion.position.set(mx, 0, d / 2);
          /* Compose with the wall's local frame */
          const wallGroup = new THREE.Group();
          wallGroup.position.set(x, ribbonY, z);
          wallGroup.rotation.y = rotY;
          wallGroup.add(mullion);
          worldGroup.add(wallGroup);
        }

        /* Top + bottom horizontal mullions framing the glass
         * ribbon — these read as the head and sill rails of the
         * curtain wall. Slightly thicker than the verticals. */
        const sillThk = 0.08;
        for (const sillY of [
          y - BUILDING_HEIGHT / 2 + kickerH - sillThk * 0.4,
          y - BUILDING_HEIGHT / 2 + kickerH + ribbonH + sillThk * 0.4,
        ]) {
          const sill = new THREE.Mesh(
            new THREE.BoxGeometry(w * 0.99, sillThk, mullionDepth * 1.05),
            mullionMat,
          );
          sill.position.set(0, 0, d / 2);
          const sillGroup = new THREE.Group();
          sillGroup.position.set(x, sillY, z);
          sillGroup.rotation.y = rotY;
          sillGroup.add(sill);
          worldGroup.add(sillGroup);
        }
      }

      /* North wall (facing +Z): full solid */
      placeWall(W, 0.4, 0, BUILDING_HEIGHT / 2, D / 2, 0, 8, wallSolidMat);
      /* South wall (facing -Z): solid with a 4-meter loading dock cut
       * out near one corner. We render two pieces with the dock door
       * panel between them. */
      const dockW = 4.0;
      const dockOff = -W * 0.25;
      placeWall(W / 2 + dockOff - dockW / 2, 0.4, -W / 4 + dockOff / 2 - dockW / 4, BUILDING_HEIGHT / 2, -D / 2, 0, 4, wallSolidMat);
      placeWall(W / 2 - dockOff + dockW / 2, 0.4, W / 4 + dockOff / 2 + dockW / 4, BUILDING_HEIGHT / 2, -D / 2, 0, 4, wallSolidMat);

      /* Loading dock door — a tall amber rectangle inset into the
       * south wall. Suggests the rolling shutter of a real facility. */
      const dockMat = new THREE.MeshStandardMaterial({
        color: 0x8a6230, roughness: 0.55, metalness: 0.4,
        emissive: 0x2a1a08, emissiveIntensity: 0.4,
      });
      const dockGeo = new THREE.BoxGeometry(dockW, BUILDING_HEIGHT * 0.55, 0.3);
      const dockDoor = new THREE.Mesh(dockGeo, dockMat);
      dockDoor.position.set(dockOff, BUILDING_HEIGHT * 0.275, -D / 2 - 0.05);
      dockDoor.castShadow = true;
      worldGroup.add(dockDoor);

      /* Concrete loading dock pad in front of the door */
      const dockPadGeo = new THREE.BoxGeometry(dockW + 1.4, 0.6, 2.4);
      const dockPadMat = new THREE.MeshStandardMaterial({
        color: 0x6e747d, roughness: 0.95,
        roughnessMap: proceduralNoiseTexture({ size: 64, scale: 5, seed: 141 }),
      });
      const dockPad = new THREE.Mesh(dockPadGeo, dockPadMat);
      dockPad.position.set(dockOff, 0.3, -D / 2 - 1.4);
      dockPad.receiveShadow = true;
      worldGroup.add(dockPad);
      queueTextureUpgrade(dockPadMat, POLYHAVEN_TEX.asphalt, 3);

      /* ---------- SCALE ANCHORS ----------
       * A 1.8m human silhouette and a counter-balance forklift parked
       * at the dock. Tiny cost (~12 meshes total) and instantly
       * communicates the real size of the building — a 30,000 sqft
       * compute hall with no people in it reads as a toy. With these
       * two props the user immediately feels the scale.
       */
      const anchorGroup = new THREE.Group();

      /* Human silhouette — head + torso + legs. Rendered in a soft
       * mid-grey so it doesn't compete with the equipment for
       * attention. ~1.8m tall, parked next to the dock pad. */
      const skinMat = new THREE.MeshStandardMaterial({
        color: 0x4f5560, roughness: 0.85, metalness: 0,
      });
      const hiVisMat = new THREE.MeshStandardMaterial({
        color: 0xff8a3a, roughness: 0.55, metalness: 0,
        emissive: 0xff8a3a, emissiveIntensity: 0.18,
      });
      const human = new THREE.Group();
      const torso = new THREE.Mesh(
        roundedBox(0.45, 0.7, 0.25, 0.05),
        hiVisMat, // hi-vis vest
      );
      torso.position.y = 0.6 + 0.35; // legs 0.6, torso starts above
      human.add(torso);
      const legs = new THREE.Mesh(
        roundedBox(0.4, 0.85, 0.22, 0.04),
        skinMat,
      );
      legs.position.y = 0.85 / 2;
      human.add(legs);
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.13, 12, 10),
        skinMat,
      );
      head.position.y = 0.6 + 0.7 + 0.13 + 0.02;
      human.add(head);
      /* Hardhat */
      const hat = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({
          color: 0xffae42, roughness: 0.6, metalness: 0,
        }),
      );
      hat.position.y = 0.6 + 0.7 + 0.13 + 0.08;
      human.add(hat);
      human.position.set(dockOff + dockW / 2 + 0.6, 0, -D / 2 - 1.0);
      human.castShadow = true;
      human.receiveShadow = true;
      human.traverse((m) => { m.castShadow = true; });
      anchorGroup.add(human);

      /* Forklift — counterbalance lift truck. Tiny lowpoly assembly:
       * - Yellow chassis
       * - Driver seat back
       * - Mast (2 vertical rails)
       * - Forks (2 horizontal prongs)
       * - 4 wheels
       */
      const forklift = new THREE.Group();
      const liftMat = new THREE.MeshStandardMaterial({
        color: 0xffae42, roughness: 0.5, metalness: 0.5,
        emissive: 0x2a1a08, emissiveIntensity: 0.16,
      });
      const liftDarkMat = new THREE.MeshStandardMaterial({
        color: 0x2c2f33, roughness: 0.7, metalness: 0.3,
      });
      const wheelMat = new THREE.MeshStandardMaterial({
        color: 0x16181b, roughness: 0.92, metalness: 0,
      });

      /* Chassis */
      const chassis = new THREE.Mesh(
        roundedBox(1.0, 0.55, 1.6, 0.06),
        liftMat,
      );
      chassis.position.y = 0.45;
      forklift.add(chassis);
      /* Driver area — open seat back */
      const seatBack = new THREE.Mesh(
        roundedBox(0.7, 0.45, 0.08, 0.02),
        liftMat,
      );
      seatBack.position.set(0, 0.95, 0.5);
      forklift.add(seatBack);
      /* Overhead guard frame — 4 thin posts + roof bar */
      const postMat = liftDarkMat;
      for (const [px2, pz2] of [
        [-0.45, 0.45], [0.45, 0.45], [-0.45, -0.45], [0.45, -0.45],
      ]) {
        const post = new THREE.Mesh(
          new THREE.BoxGeometry(0.06, 1.0, 0.06),
          postMat,
        );
        post.position.set(px2, 1.2, pz2);
        forklift.add(post);
      }
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(1.0, 0.06, 1.0),
        postMat,
      );
      roof.position.set(0, 1.7, 0);
      forklift.add(roof);

      /* Mast — 2 vertical rails out front */
      for (const mxs of [-0.25, 0.25]) {
        const rail = new THREE.Mesh(
          new THREE.BoxGeometry(0.08, 1.6, 0.08),
          liftDarkMat,
        );
        rail.position.set(mxs, 1.0, -0.85);
        forklift.add(rail);
      }
      /* Forks — 2 horizontal prongs at floor level */
      for (const fxs of [-0.2, 0.2]) {
        const fork = new THREE.Mesh(
          new THREE.BoxGeometry(0.08, 0.06, 0.85),
          liftDarkMat,
        );
        fork.position.set(fxs, 0.18, -1.32);
        forklift.add(fork);
      }
      /* Wheels — 4 corners */
      for (const [wx2, wz2] of [
        [-0.55, 0.55], [0.55, 0.55], [-0.55, -0.55], [0.55, -0.55],
      ]) {
        const wheel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.22, 0.22, 0.16, 14),
          wheelMat,
        );
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(wx2, 0.22, wz2);
        forklift.add(wheel);
      }

      forklift.position.set(dockOff - dockW / 2 - 1.0, 0, -D / 2 - 2.4);
      forklift.rotation.y = -0.4;
      forklift.traverse((m) => { m.castShadow = true; m.receiveShadow = true; });
      anchorGroup.add(forklift);

      /* ---------- ARCHITECTURAL DC DETAIL ----------
       *
       * The building shell on its own is still a chamfered box. To
       * make the data center read as a real industrial facility (not
       * a CG box) we layer on the kind of detail every Equinix /
       * QTS / Digital Realty hyperscaler actually has:
       *
       *   - Vertical pilasters (column accents) breaking up the long
       *     wall faces every ~12-15m
       *   - Corner downspouts running floor-to-roof
       *   - Glass entrance vestibule with cantilevered canopy on the
       *     east personnel-entry side
       *   - Side-wall HVAC louver intakes
       *   - Fire-department Siamese standpipe near the dock (bright
       *     red, tiny but visually grounding)
       *   - Concrete bollards lining the dock pad
       *   - Wall-mounted exterior service light fixtures
       *
       * All shadow-casting is OFF on these tiny details — they're
       * shadow-receiving but not shadow-casting, since their shadows
       * would be lost in the building's own shadow anyway. */

      /* Pilasters — vertical column accents along the long faces.
       * Built as InstancedMesh since they share geometry+material.
       * 4 along each long side = 8 total, tall thin chamfered boxes
       * standing slightly proud of the wall face. (Note: the existing
       * code further down adds STEEL corner pilasters with a
       * different darker material — these are the *facade-accent*
       * pilasters, named distinctly to avoid the collision.) */
      const wallPilasterMat = new THREE.MeshStandardMaterial({
        color: wallPal.accent, roughness: 0.55, metalness: 0.45,
      });
      const pilasterGeo = roundedBox(0.5, BUILDING_HEIGHT - 0.4, 0.35, 0.04);
      const pilasterCount = 8;
      const pilasterMesh = new THREE.InstancedMesh(pilasterGeo, wallPilasterMat, pilasterCount);
      const tmpPilasterMat = new THREE.Matrix4();
      const tmpPilasterPos = new THREE.Vector3();
      const tmpPilasterQuat = new THREE.Quaternion();
      const tmpPilasterScale = new THREE.Vector3(1, 1, 1);
      let pi = 0;
      for (let s of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
          const px = -W * 0.4 + i * (W * 0.8 / 3);
          tmpPilasterPos.set(px, BUILDING_HEIGHT / 2 - 0.2, s * (D / 2 + 0.1));
          tmpPilasterMat.compose(tmpPilasterPos, tmpPilasterQuat, tmpPilasterScale);
          pilasterMesh.setMatrixAt(pi++, tmpPilasterMat);
        }
      }
      pilasterMesh.instanceMatrix.needsUpdate = true;
      pilasterMesh.castShadow = true;
      worldGroup.add(pilasterMesh);

      /* Corner downspouts — thin grey vertical pipes running
       * floor-to-eave at all four corners. Real DCs always have
       * these for roof drainage. */
      const downspoutMat = new THREE.MeshStandardMaterial({
        color: 0x4a525c, roughness: 0.55, metalness: 0.6,
      });
      const downspoutGeo = new THREE.CylinderGeometry(0.06, 0.06, BUILDING_HEIGHT, 8);
      for (const [cx, cz] of [
        [W / 2 + 0.05, D / 2 + 0.05],
        [-W / 2 - 0.05, D / 2 + 0.05],
        [W / 2 + 0.05, -D / 2 - 0.05],
        [-W / 2 - 0.05, -D / 2 - 0.05],
      ]) {
        const ds = new THREE.Mesh(downspoutGeo, downspoutMat);
        ds.position.set(cx, BUILDING_HEIGHT / 2, cz);
        worldGroup.add(ds);
        /* Elbow + outlet at the bottom, kicking out 90° */
        const elbow = new THREE.Mesh(
          new THREE.CylinderGeometry(0.07, 0.07, 0.18, 8),
          downspoutMat,
        );
        elbow.rotation.x = Math.PI / 2;
        elbow.position.set(cx, 0.18, cz + Math.sign(cz) * 0.18);
        worldGroup.add(elbow);
      }

      /* Side-wall HVAC louvers — set of thin horizontal slats
       * on the east + west wall mid-band. Reads as fresh-air
       * intake (real DCs have huge louver banks for outside-air
       * economiser cooling). */
      const louverFrameMat = new THREE.MeshStandardMaterial({
        color: 0x4a525c, roughness: 0.55, metalness: 0.6,
      });
      const louverSlatMat = new THREE.MeshStandardMaterial({
        color: 0x14181d, roughness: 0.85, metalness: 0.2,
      });
      for (const sideX of [W / 2 + 0.06, -W / 2 - 0.06]) {
        for (let bay = 0; bay < 2; bay++) {
          const louverGroup = new THREE.Group();
          louverGroup.position.set(
            sideX,
            BUILDING_HEIGHT * 0.5,
            -D * 0.25 + bay * (D * 0.5),
          );
          /* Frame */
          const frame = new THREE.Mesh(
            roundedBox(0.06, 1.6, 1.4, 0.02),
            louverFrameMat,
          );
          louverGroup.add(frame);
          /* Slats — 8 thin horizontal bars inside the frame */
          for (let l = 0; l < 8; l++) {
            const slat = new THREE.Mesh(
              new THREE.BoxGeometry(0.04, 0.08, 1.32),
              louverSlatMat,
            );
            slat.position.set(0, -0.7 + l * 0.2, 0);
            louverGroup.add(slat);
          }
          worldGroup.add(louverGroup);
        }
      }

      /* Fire-department Siamese connection — a small bright-red
       * 4-inch standpipe at the south wall near the loading dock.
       * Tiny but a visually perfect "this is a code-compliant
       * industrial building" detail. */
      const fdcRedMat = new THREE.MeshStandardMaterial({
        color: 0xc4341a, roughness: 0.5, metalness: 0.4,
        emissive: 0x4a1208, emissiveIntensity: 0.3,
      });
      const fdcChromeMat = new THREE.MeshStandardMaterial({
        color: 0xc8d0d8, roughness: 0.3, metalness: 0.9,
      });
      const fdcGroup = new THREE.Group();
      fdcGroup.position.set(dockOff + dockW + 1.0, 1.1, -D / 2 + 0.05);
      /* Stand pipe */
      const fdcStand = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.09, 1.1, 12),
        fdcRedMat,
      );
      fdcStand.position.y = 0;
      fdcGroup.add(fdcStand);
      /* Two angled inlet caps (the Siamese) */
      for (const ang of [-0.5, 0.5]) {
        const inlet = new THREE.Mesh(
          new THREE.CylinderGeometry(0.075, 0.075, 0.22, 12),
          fdcChromeMat,
        );
        inlet.rotation.x = Math.PI / 2;
        inlet.rotation.y = ang;
        inlet.position.set(Math.sin(ang) * 0.18, 0.45, 0.12);
        fdcGroup.add(inlet);
      }
      /* Identification plate */
      const fdcPlate = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.18, 0.02),
        fdcRedMat,
      );
      fdcPlate.position.set(0, 0.85, 0.08);
      fdcGroup.add(fdcPlate);
      worldGroup.add(fdcGroup);

      /* Concrete bollards — line the dock pad protecting the
       * building from truck strikes. Single shared geometry,
       * InstancedMesh for the whole ring. */
      const bollardMat = new THREE.MeshStandardMaterial({
        color: 0xfdbf3d, roughness: 0.85, metalness: 0,
        emissive: 0x4a3208, emissiveIntensity: 0.18,
      });
      const bollardGeo = new THREE.CylinderGeometry(0.18, 0.22, 0.95, 14);
      const bollardCount = 6;
      const bollardMesh = new THREE.InstancedMesh(bollardGeo, bollardMat, bollardCount);
      const tmpBollardMat = new THREE.Matrix4();
      const tmpBollardPos = new THREE.Vector3();
      const tmpBollardScale = new THREE.Vector3(1, 1, 1);
      const tmpBollardQuat = new THREE.Quaternion();
      for (let b = 0; b < bollardCount; b++) {
        const t = b / (bollardCount - 1);
        tmpBollardPos.set(
          dockOff - (dockW / 2 + 1.0) + t * (dockW + 2.0),
          0.475,
          -D / 2 - 2.6,
        );
        tmpBollardMat.compose(tmpBollardPos, tmpBollardQuat, tmpBollardScale);
        bollardMesh.setMatrixAt(b, tmpBollardMat);
      }
      bollardMesh.instanceMatrix.needsUpdate = true;
      bollardMesh.castShadow = true;
      worldGroup.add(bollardMesh);

      /* Wall-mounted exterior service light fixtures — small
       * gooseneck-style fixtures on the dock + entry walls. Mint
       * emissive bulb so even at dusk they read as "active." */
      const fixtureMat = new THREE.MeshStandardMaterial({
        color: 0x363c45, roughness: 0.55, metalness: 0.6,
      });
      const fixtureBulbMat = new THREE.MeshStandardMaterial({
        color: 0xfff5d0, roughness: 0.3, metalness: 0,
        emissive: 0xfff5d0, emissiveIntensity: 1.4,
      });
      for (const [fx, fz, ang] of [
        [dockOff - dockW / 2 - 0.5, -D / 2 - 0.05, 0],
        [dockOff + dockW / 2 + 0.5, -D / 2 - 0.05, 0],
        [W / 2 + 0.05, 0, Math.PI / 2],
        [-W / 2 - 0.05, 0, -Math.PI / 2],
      ]) {
        const fGroup = new THREE.Group();
        fGroup.position.set(fx, BUILDING_HEIGHT * 0.78, fz);
        fGroup.rotation.y = ang;
        const arm = new THREE.Mesh(
          new THREE.CylinderGeometry(0.025, 0.025, 0.32, 6),
          fixtureMat,
        );
        arm.rotation.x = Math.PI / 2;
        arm.position.z = 0.16;
        fGroup.add(arm);
        const shade = new THREE.Mesh(
          new THREE.ConeGeometry(0.15, 0.18, 12, 1, true),
          fixtureMat,
        );
        shade.rotation.x = Math.PI;
        shade.position.set(0, -0.06, 0.34);
        fGroup.add(shade);
        const bulb = new THREE.Mesh(
          new THREE.SphereGeometry(0.06, 8, 6),
          fixtureBulbMat,
        );
        bulb.position.set(0, -0.1, 0.34);
        fGroup.add(bulb);
        worldGroup.add(fGroup);
      }

      worldGroup.add(anchorGroup);

      /* ---------- SITE-LEVEL DETAIL ----------
       * Staff parking lot + perimeter light poles + guard booth
       * at the access-road entry. All instanced where possible
       * so the perf cost is one draw call per category. */

      /* Staff parking lot — east of the building, ~16 cars in two
       * rows. Two cars use slightly different scales for variety,
       * with random hue variation per-instance. */
      /* Pushed further east so it sits CLEAR of the office wing
       * (which extends from W/2 outward by ~36% of W). */
      const parkingX = W / 2 + W * 0.36 + 4.5;
      const parkingZ = D * 0.18;
      const parkingPad = new THREE.Mesh(
        new THREE.BoxGeometry(11, 0.12, 8),
        new THREE.MeshStandardMaterial({
          color: 0x4a5258, roughness: 1.0, metalness: 0,
          envMapIntensity: 0.3,
        }),
      );
      parkingPad.position.set(parkingX, 0.06, parkingZ);
      parkingPad.receiveShadow = true;
      worldGroup.add(parkingPad);

      /* Painted line stripes on the parking pad — InstancedMesh of
       * thin white BoxGeometries marking the bay edges. */
      const stripeMat = new THREE.MeshBasicMaterial({ color: 0xddd5c8 });
      const stripeGeo = new THREE.BoxGeometry(0.06, 0.005, 2.6);
      const stripeCount = 9;
      const stripeMesh = new THREE.InstancedMesh(stripeGeo, stripeMat, stripeCount);
      const tmpStripeM = new THREE.Matrix4();
      const tmpStripeP = new THREE.Vector3();
      const tmpStripeQ = new THREE.Quaternion();
      const tmpStripeS = new THREE.Vector3(1, 1, 1);
      for (let s = 0; s < stripeCount; s++) {
        const sx = parkingX - 4.5 + s * 1.1;
        for (const sz of [parkingZ - 1.6, parkingZ + 1.6]) {
          tmpStripeP.set(sx, 0.13, sz);
          tmpStripeM.compose(tmpStripeP, tmpStripeQ, tmpStripeS);
          stripeMesh.setMatrixAt(s, tmpStripeM);
        }
      }
      stripeMesh.instanceMatrix.needsUpdate = true;
      worldGroup.add(stripeMesh);

      /* Cars — 14 procedurally-coloured sedans/SUVs. Single shared
       * geometry per vehicle component (chassis, roof, wheel) so we
       * can use 3 InstancedMeshes for the whole fleet. */
      const carCount = 14;
      const chassisGeo = roundedBox(0.95, 0.45, 1.85, 0.05);
      const roofGeo = roundedBox(0.85, 0.32, 1.05, 0.04);
      const wheelGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.12, 12);

      /* Car colour palette — soft realistic automotive tones. */
      const carColours = [
        0x4a4f56, 0xe6e4dd, 0x101216, 0x8b1a1e,
        0x244a6b, 0x4a5e2a, 0xc8a45e, 0x7a7d82,
      ];
      const wheelMatShared = new THREE.MeshStandardMaterial({
        color: 0x16181b, roughness: 0.92, metalness: 0,
      });

      /* Two rows of 7. */
      const cars = new THREE.Group();
      for (let i = 0; i < carCount; i++) {
        const row = i < 7 ? 0 : 1;
        const col = i % 7;
        const cx = parkingX - 4.5 + col * 1.55;
        const cz = parkingZ + (row === 0 ? -2.2 : 2.2);
        const colour = carColours[i % carColours.length];
        const carColMat = new THREE.MeshStandardMaterial({
          color: colour, roughness: 0.45, metalness: 0.4,
          emissive: colour, emissiveIntensity: 0.04,
        });
        const car = new THREE.Group();
        car.position.set(cx, 0, cz);
        car.rotation.y = row === 0 ? 0 : Math.PI;

        const chassis = new THREE.Mesh(chassisGeo, carColMat);
        chassis.position.y = 0.36;
        chassis.castShadow = true;
        car.add(chassis);

        const carRoof = new THREE.Mesh(roofGeo, carColMat);
        carRoof.position.set(0, 0.65, 0.05);
        car.add(carRoof);

        for (const [wx, wz] of [
          [-0.5, 0.65], [0.5, 0.65], [-0.5, -0.6], [0.5, -0.6],
        ]) {
          const wheel = new THREE.Mesh(wheelGeo, wheelMatShared);
          wheel.rotation.z = Math.PI / 2;
          wheel.position.set(wx, 0.16, wz);
          car.add(wheel);
        }

        /* Front + rear lights — small mint emissive squares */
        const headlightMat = new THREE.MeshBasicMaterial({ color: 0xfff5d0 });
        const headlight = new THREE.Mesh(
          new THREE.BoxGeometry(0.12, 0.06, 0.02),
          headlightMat,
        );
        headlight.position.set(-0.3, 0.42, 0.93);
        car.add(headlight);
        const headlight2 = headlight.clone();
        headlight2.position.set(0.3, 0.42, 0.93);
        car.add(headlight2);

        cars.add(car);
      }
      worldGroup.add(cars);

      /* Perimeter light poles — 8 poles spaced around the parcel.
       * Each is a tall slim pole + horizontal arm + cobra-head
       * fixture with mint emissive bulb. InstancedMesh for the
       * pole geometry; the arm + heads are added individually so
       * we can rotate them toward the building. */
      const lightPoleMat = new THREE.MeshStandardMaterial({
        color: 0x2a2f33, roughness: 0.6, metalness: 0.55,
      });
      const poleH = 6.0;
      const poleGeo = new THREE.CylinderGeometry(0.08, 0.12, poleH, 8);
      const poleCount = 8;
      const poleMesh = new THREE.InstancedMesh(poleGeo, lightPoleMat, poleCount);
      const tmpPoleM = new THREE.Matrix4();
      const tmpPoleP = new THREE.Vector3();
      const tmpPoleQ = new THREE.Quaternion();
      const tmpPoleS = new THREE.Vector3(1, 1, 1);
      const polePositions = [];
      for (let i = 0; i < poleCount; i++) {
        const ang = (i / poleCount) * Math.PI * 2 + 0.4;
        const r = Math.max(W, D) * 0.7;
        const px = Math.cos(ang) * r;
        const pz = Math.sin(ang) * r;
        polePositions.push({ x: px, z: pz, ang });
        tmpPoleP.set(px, poleH / 2, pz);
        tmpPoleM.compose(tmpPoleP, tmpPoleQ, tmpPoleS);
        poleMesh.setMatrixAt(i, tmpPoleM);
      }
      poleMesh.instanceMatrix.needsUpdate = true;
      worldGroup.add(poleMesh);

      /* Cobra-head fixtures pointing back toward the building */
      const fixtureBulbHotMat = new THREE.MeshStandardMaterial({
        color: 0xfff5d0, roughness: 0.3, metalness: 0,
        emissive: 0xfff5d0, emissiveIntensity: 1.6,
      });
      for (const p of polePositions) {
        const head = new THREE.Group();
        head.position.set(p.x, poleH - 0.2, p.z);
        /* Arm extending toward the building (interior of the ring) */
        const armDir = Math.atan2(-p.z, -p.x);
        const arm = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04, 0.04, 1.2, 6),
          lightPoleMat,
        );
        arm.rotation.z = Math.PI / 2;
        arm.rotation.y = -armDir;
        arm.position.set(
          Math.cos(armDir) * 0.6,
          0,
          Math.sin(armDir) * 0.6,
        );
        head.add(arm);
        /* Cobra-head shade */
        const shade = new THREE.Mesh(
          roundedBox(0.28, 0.14, 0.45, 0.04),
          lightPoleMat,
        );
        shade.position.set(
          Math.cos(armDir) * 1.2,
          -0.06,
          Math.sin(armDir) * 1.2,
        );
        shade.rotation.y = -armDir;
        head.add(shade);
        /* Lens */
        const lens = new THREE.Mesh(
          new THREE.BoxGeometry(0.22, 0.05, 0.34),
          fixtureBulbHotMat,
        );
        lens.position.set(
          Math.cos(armDir) * 1.2,
          -0.14,
          Math.sin(armDir) * 1.2,
        );
        lens.rotation.y = -armDir;
        head.add(lens);
        worldGroup.add(head);
      }

      /* Guard booth — small outpost at the access-road entry to
       * the parcel. Tiny but immediately reads as "secure
       * facility." Position it where the access road meets the
       * site edge (rough estimate using parcel + road geometry). */
      const guardBoothGroup = new THREE.Group();
      guardBoothGroup.position.set(W * 0.4, 0, D * 0.5 + 4);
      const boothShellMat = new THREE.MeshStandardMaterial({
        color: 0x9099a3, roughness: 0.6, metalness: 0.3,
      });
      const boothGlassMat = new THREE.MeshStandardMaterial({
        color: 0xa6c4d6, roughness: 0.2, metalness: 0.85,
        transparent: true, opacity: 0.55,
      });
      const boothShell = new THREE.Mesh(
        roundedBox(2.0, 2.4, 1.6, 0.06),
        boothShellMat,
      );
      boothShell.position.y = 1.2;
      boothShell.castShadow = true;
      guardBoothGroup.add(boothShell);
      /* Glass on three sides */
      const boothGlassFront = new THREE.Mesh(
        new THREE.BoxGeometry(1.7, 1.2, 0.04),
        boothGlassMat,
      );
      boothGlassFront.position.set(0, 1.5, 0.81);
      guardBoothGroup.add(boothGlassFront);
      const boothGlassL = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 1.2, 1.4),
        boothGlassMat,
      );
      boothGlassL.position.set(-1.01, 1.5, 0);
      guardBoothGroup.add(boothGlassL);
      const boothGlassR = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 1.2, 1.4),
        boothGlassMat,
      );
      boothGlassR.position.set(1.01, 1.5, 0);
      guardBoothGroup.add(boothGlassR);
      /* Roof overhang */
      const boothRoof = new THREE.Mesh(
        roundedBox(2.4, 0.12, 2.0, 0.04),
        boothShellMat,
      );
      boothRoof.position.y = 2.5;
      guardBoothGroup.add(boothRoof);
      /* Mint emissive top-of-booth strip */
      const boothLed = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 0.04, 0.02),
        new THREE.MeshStandardMaterial({
          color: 0x33fbd3, emissive: 0x33fbd3, emissiveIntensity: 1.5,
        }),
      );
      boothLed.position.set(0, 2.4, 0.81);
      guardBoothGroup.add(boothLed);
      worldGroup.add(guardBoothGroup);

      /* Drop-arm gate barrier next to the guard booth */
      const armBaseMat = new THREE.MeshStandardMaterial({
        color: 0xc4341a, roughness: 0.55, metalness: 0.4,
      });
      const armStripeMat = new THREE.MeshStandardMaterial({
        color: 0xddd5c8, roughness: 0.5, metalness: 0,
      });
      const armBase = new THREE.Mesh(
        roundedBox(0.35, 1.0, 0.35, 0.04),
        armBaseMat,
      );
      armBase.position.set(W * 0.4 - 1.6, 0.5, D * 0.5 + 4);
      worldGroup.add(armBase);
      /* Horizontal striped barrier arm — alternating red + white */
      for (let s = 0; s < 5; s++) {
        const seg = new THREE.Mesh(
          new THREE.BoxGeometry(0.7, 0.08, 0.08),
          s % 2 === 0 ? armBaseMat : armStripeMat,
        );
        seg.position.set(W * 0.4 - 1.6 + 0.6 + s * 0.7, 1.05, D * 0.5 + 4);
        worldGroup.add(seg);
      }

      /* East wall (facing +X) — has the personnel entrance + small
       * canopy near the centre. */
      placeWall(0.4, D, W / 2, BUILDING_HEIGHT / 2, 0, 0, 5, wallShadeMat);
      const canopyMat = new THREE.MeshStandardMaterial({
        color: wallPal.accent, transparent: true, opacity: 0.85,
        roughness: 0.4, metalness: 0.2,
      });
      const canopyGeo = new THREE.BoxGeometry(0.15, 0.2, 2.6);
      const canopy = new THREE.Mesh(canopyGeo, canopyMat);
      canopy.position.set(W / 2 + 0.85, BUILDING_HEIGHT * 0.42, D * 0.18);
      canopy.castShadow = true;
      worldGroup.add(canopy);
      const entryDoorMat = new THREE.MeshStandardMaterial({
        color: 0x1a2026, roughness: 0.4, metalness: 0.3,
        emissive: 0x051018, emissiveIntensity: 0.4,
      });
      const entryDoor = new THREE.Mesh(new THREE.BoxGeometry(0.2, BUILDING_HEIGHT * 0.32, 1.5), entryDoorMat);
      entryDoor.position.set(W / 2 + 0.05, BUILDING_HEIGHT * 0.16, D * 0.18);
      worldGroup.add(entryDoor);

      /* West wall (facing -X) — solid with seams */
      placeWall(0.4, D, -W / 2, BUILDING_HEIGHT / 2, 0, 0, 5, wallShadeMat);

      /* Subtle blueprint outline so the silhouette stays crisp */
      const wallEdgeMat = new THREE.LineBasicMaterial({
        color: wallPal.accent, transparent: true, opacity: 0.45,
      });
      const wallShellGeo = new THREE.BoxGeometry(W, BUILDING_HEIGHT, D);
      const wallEdges = new THREE.LineSegments(new THREE.EdgesGeometry(wallShellGeo), wallEdgeMat);
      wallEdges.position.y = BUILDING_HEIGHT / 2;
      worldGroup.add(wallEdges);

      /* Subtle horizontal accent stripe at the top of the kicker
       * (where modern hyperscalers often run an LED or paint line)
       * and a small "facility identifier" logo plaque on the east
       * wall above the personnel entrance. */
      const accentMat = new THREE.MeshStandardMaterial({
        color: wallPal.accent, roughness: 0.3, metalness: 0.7,
        emissive: wallPal.accent, emissiveIntensity: fullyOnline ? 0.7 : 0.25,
      });
      const stripeH = 0.18;
      const stripePerim = [
        { w: W, d: 0.45, x: 0, z: D / 2 + 0.05 },
        { w: W, d: 0.45, x: 0, z: -D / 2 - 0.05 },
        { w: 0.45, d: D, x: W / 2 + 0.05, z: 0 },
        { w: 0.45, d: D, x: -W / 2 - 0.05, z: 0 },
      ];
      stripePerim.forEach((s) => {
        const stripe = new THREE.Mesh(
          new THREE.BoxGeometry(s.w, stripeH, s.d),
          accentMat
        );
        stripe.position.set(s.x, BUILDING_HEIGHT * 0.22 + stripeH / 2, s.z);
        worldGroup.add(stripe);
      });
      /* Facility logo plaque — a small mint-glow rectangle on the
       * east face above the entrance. Reads as a brand sign. */
      const logoMat = new THREE.MeshStandardMaterial({
        color: wallPal.logoBand, roughness: 0.45, metalness: 0.5,
        emissive: wallPal.accent, emissiveIntensity: fullyOnline ? 0.4 : 0.18,
      });
      const logoPlate = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.2, 3.0), logoMat);
      logoPlate.position.set(W / 2 + 0.08, BUILDING_HEIGHT * 0.78, D * 0.18);
      worldGroup.add(logoPlate);

      /* ---------- MULTI-VOLUME BUILDING COMPOSITION ----------
       *
       * Real hyperscaler DCs are NEVER a single rectangular box.
       * They're composed of:
       *   - The main DATA-HALL MASS (the big bulk we already have)
       *   - An OFFICE WING attached on one short side at lower
       *     height with more glazing (the people-side)
       *   - A STAIR / SERVICES TOWER at one corner, taller than the
       *     main mass — vertical accent volume
       *   - A RECESSED ENTRY PORTAL cut into the office wing's
       *     facade with a cantilevered glass canopy
       *   - A BRAND-COLOR STRIPE band wrapping the data-hall cap
       *
       * These extra volumes attach OUTSIDE the existing building
       * footprint (to the +X side) so they don't conflict with the
       * interior plan rooms. */

      /* OFFICE WING — extends east of the main mass. ~35% of the
       * width, full depth, lower height (~70%). Cap material is
       * different from the main mass so the silhouette reads as a
       * composed building. */
      const officeW = W * 0.36;
      const officeH = BUILDING_HEIGHT * 0.74;
      const officeD = D * 0.78;
      const officeOriginX = W / 2 + officeW / 2 - 0.3; // slight overlap so seam reads as continuous
      const officeOriginZ = -D * 0.06;

      const officeShellMat = new THREE.MeshStandardMaterial({
        color: 0xc8cdd4, roughness: 0.55, metalness: 0.3,
        roughnessMap: proceduralNoiseTexture({ size: 64, scale: 4, seed: 161 }),
        envMapIntensity: 0.55,
      });
      const officeGlassMat = new THREE.MeshStandardMaterial({
        color: 0x4f7a93, roughness: 0.18, metalness: 0.85,
        transparent: true, opacity: 0.62,
        envMapIntensity: 0.9,
      });
      const officeMullionMat = new THREE.MeshStandardMaterial({
        color: 0x9099a3, roughness: 0.4, metalness: 0.75,
      });
      const accentStripeMat = new THREE.MeshStandardMaterial({
        color: 0x33fbd3, roughness: 0.4, metalness: 0,
        emissive: 0x33fbd3, emissiveIntensity: 0.45,
      });

      /* Office shell — chamfered painted-concrete kicker (lower 25%)
       * + ribbon glass middle band + slim white cap (top 25%). Three
       * distinct materials = three distinct horizontal bands. */
      const officeKickerH = officeH * 0.28;
      const officeRibbonH = officeH * 0.5;
      const officeCapH = officeH - officeKickerH - officeRibbonH;
      const officeKicker = new THREE.Mesh(
        roundedBox(officeW, officeKickerH, officeD, 0.08),
        officeShellMat,
      );
      officeKicker.position.set(officeOriginX, officeKickerH / 2, officeOriginZ);
      officeKicker.castShadow = true;
      officeKicker.receiveShadow = true;
      worldGroup.add(officeKicker);

      const officeRibbon = new THREE.Mesh(
        new THREE.BoxGeometry(officeW * 0.99, officeRibbonH, officeD * 0.99),
        officeGlassMat,
      );
      officeRibbon.position.set(
        officeOriginX,
        officeKickerH + officeRibbonH / 2,
        officeOriginZ,
      );
      worldGroup.add(officeRibbon);

      const officeCap = new THREE.Mesh(
        roundedBox(officeW, officeCapH, officeD, 0.06),
        officeShellMat,
      );
      officeCap.position.set(
        officeOriginX,
        officeKickerH + officeRibbonH + officeCapH / 2,
        officeOriginZ,
      );
      officeCap.castShadow = true;
      worldGroup.add(officeCap);

      /* Office wing parapet edge */
      const officeParapet = new THREE.Mesh(
        new THREE.BoxGeometry(officeW + 0.1, 0.32, officeD + 0.1),
        officeMullionMat,
      );
      officeParapet.position.set(officeOriginX, officeH + 0.1, officeOriginZ);
      worldGroup.add(officeParapet);

      /* Curtain-wall mullions across the office wing's ribbon glass
       * (every ~1.2m). InstancedMesh single draw call. */
      const officeMullCount = Math.floor(officeW / 1.2);
      const officeMullionGeo = new THREE.BoxGeometry(0.06, officeRibbonH, 0.08);
      const officeMullMesh = new THREE.InstancedMesh(officeMullionGeo, officeMullionMat, officeMullCount * 2);
      const tmpOfM = new THREE.Matrix4();
      const tmpOfP = new THREE.Vector3();
      const tmpOfQ = new THREE.Quaternion();
      const tmpOfS = new THREE.Vector3(1, 1, 1);
      let omIdx = 0;
      for (let m = 1; m < officeMullCount; m++) {
        const t = m / officeMullCount;
        const mx = officeOriginX - officeW / 2 + t * officeW;
        for (const sz of [officeOriginZ + officeD / 2, officeOriginZ - officeD / 2]) {
          tmpOfP.set(mx, officeKickerH + officeRibbonH / 2, sz);
          tmpOfM.compose(tmpOfP, tmpOfQ, tmpOfS);
          officeMullMesh.setMatrixAt(omIdx++, tmpOfM);
        }
      }
      officeMullMesh.count = omIdx;
      officeMullMesh.instanceMatrix.needsUpdate = true;
      worldGroup.add(officeMullMesh);

      /* RECESSED ENTRY PORTAL — cut a notch into the office wing's
       * east face to create a sheltered entry. Implemented by
       * adding two side walls + a back wall + a glass storefront
       * + cantilever canopy roof, all inside a recess on the +X
       * face of the wing. */
      const entryNotchW = 4.0;
      const entryNotchH = officeH * 0.6;
      const entryNotchD = 1.6; // recessed 1.6m back from face
      const entryFaceX = officeOriginX + officeW / 2;
      const entryFaceZ = officeOriginZ;

      /* Notch back wall (interior surface where the entry doors are) */
      const entryBack = new THREE.Mesh(
        new THREE.BoxGeometry(entryNotchW, entryNotchH, 0.08),
        officeShellMat,
      );
      entryBack.position.set(
        entryFaceX - entryNotchD,
        entryNotchH / 2,
        entryFaceZ,
      );
      entryBack.rotation.y = Math.PI / 2;
      worldGroup.add(entryBack);

      /* Storefront glass — full-height glazed entry */
      const entryGlass = new THREE.Mesh(
        new THREE.BoxGeometry(entryNotchW * 0.85, entryNotchH * 0.92, 0.04),
        officeGlassMat,
      );
      entryGlass.position.set(
        entryFaceX - entryNotchD + 0.05,
        entryNotchH * 0.46,
        entryFaceZ,
      );
      entryGlass.rotation.y = Math.PI / 2;
      worldGroup.add(entryGlass);

      /* Vertical mullions across the storefront */
      for (let m = 1; m < 5; m++) {
        const mz = entryFaceZ - entryNotchW / 2 + (m / 5) * entryNotchW;
        const stuMull = new THREE.Mesh(
          new THREE.BoxGeometry(0.06, entryNotchH * 0.92, 0.06),
          officeMullionMat,
        );
        stuMull.position.set(entryFaceX - entryNotchD + 0.07, entryNotchH * 0.46, mz);
        worldGroup.add(stuMull);
      }

      /* Cantilever canopy — extends FORWARD from the recess top
       * over the entry pad. Slim chamfered box with mint-emissive
       * underside strip (the brand-color "welcome" cue). */
      const canopyW = entryNotchW + 1.6;
      const canopyDepth = entryNotchD + 1.0;
      const canopyMain = new THREE.Mesh(
        roundedBox(canopyDepth, 0.18, canopyW, 0.04),
        officeShellMat,
      );
      canopyMain.position.set(
        entryFaceX - entryNotchD + canopyDepth / 2,
        entryNotchH + 0.1,
        entryFaceZ,
      );
      canopyMain.castShadow = true;
      worldGroup.add(canopyMain);

      const canopyAccent = new THREE.Mesh(
        new THREE.BoxGeometry(canopyDepth * 0.95, 0.04, canopyW * 0.95),
        accentStripeMat,
      );
      canopyAccent.position.set(
        entryFaceX - entryNotchD + canopyDepth / 2,
        entryNotchH + 0.0,
        entryFaceZ,
      );
      worldGroup.add(canopyAccent);

      /* Canopy support rod (one tension rod from canopy edge to
       * roof, common in modern arch-viz lobbies) */
      const canopyRod = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.025, officeH - entryNotchH - 0.1, 6),
        officeMullionMat,
      );
      canopyRod.position.set(
        entryFaceX - entryNotchD + canopyDepth - 0.1,
        entryNotchH + 0.1 + (officeH - entryNotchH - 0.1) / 2,
        entryFaceZ,
      );
      worldGroup.add(canopyRod);

      /* STAIR / SERVICES TOWER — taller narrow volume at the
       * NE corner of the data hall mass. Reads as the elevator
       * core + stair landing the building actually has, plus it
       * breaks the silhouette so the building is no longer a
       * single block. */
      const towerW = 4.5;
      const towerD = 4.5;
      const towerH = BUILDING_HEIGHT * 1.35;
      const towerOriginX = W / 2 - towerW / 2;
      const towerOriginZ = D / 2 - towerD / 2;

      const towerShellMat = new THREE.MeshStandardMaterial({
        color: 0x394048, roughness: 0.6, metalness: 0.35,
        roughnessMap: proceduralNoiseTexture({ size: 64, scale: 4, seed: 167 }),
        envMapIntensity: 0.55,
      });
      const towerShell = new THREE.Mesh(
        roundedBox(towerW, towerH, towerD, 0.08),
        towerShellMat,
      );
      towerShell.position.set(towerOriginX, towerH / 2, towerOriginZ);
      towerShell.castShadow = true;
      towerShell.receiveShadow = true;
      worldGroup.add(towerShell);

      /* Tower glass slot — single tall glazed strip on the south
       * face (towards the data hall) suggesting the stair landing
       * windows. */
      const towerSlot = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, towerH * 0.85, towerD * 0.6),
        officeGlassMat,
      );
      towerSlot.position.set(
        towerOriginX + towerW / 2 - 0.03,
        towerH * 0.5,
        towerOriginZ,
      );
      worldGroup.add(towerSlot);

      /* Tower cap — slim chamfered roof crown sitting above the
       * parapet line. */
      const towerCap = new THREE.Mesh(
        roundedBox(towerW + 0.2, 0.4, towerD + 0.2, 0.04),
        towerShellMat,
      );
      towerCap.position.set(towerOriginX, towerH + 0.2, towerOriginZ);
      worldGroup.add(towerCap);

      /* Tower lightning rod */
      const towerRod = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.04, 1.4, 8),
        new THREE.MeshStandardMaterial({
          color: 0xc8cdd4, roughness: 0.4, metalness: 0.85,
        }),
      );
      towerRod.position.set(towerOriginX, towerH + 1.1, towerOriginZ);
      worldGroup.add(towerRod);

      /* BRAND-COLOR STRIPE — slim mint accent band wrapping the
       * data-hall cap. Reads as a real branded hyperscaler facade
       * (think Digital Realty / Equinix coloured trim). */
      const brandStripeH = 0.18;
      const brandStripeY = BUILDING_HEIGHT - 0.65;
      /* North + south edges */
      const stripeNS = new THREE.Mesh(
        new THREE.BoxGeometry(W + 0.05, brandStripeH, 0.05),
        accentStripeMat,
      );
      stripeNS.position.set(0, brandStripeY, D / 2 + 0.03);
      worldGroup.add(stripeNS);
      const stripeNS2 = stripeNS.clone();
      stripeNS2.position.set(0, brandStripeY, -D / 2 - 0.03);
      worldGroup.add(stripeNS2);
      /* West edge (the +X / east edge is occupied by the office wing) */
      const stripeEW = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, brandStripeH, D + 0.05),
        accentStripeMat,
      );
      stripeEW.position.set(-W / 2 - 0.03, brandStripeY, 0);
      worldGroup.add(stripeEW);

      /* Office-wing has its OWN slim accent stripe at the parapet */
      const officeStripe = new THREE.Mesh(
        new THREE.BoxGeometry(officeW + 0.05, 0.12, 0.04),
        accentStripeMat,
      );
      officeStripe.position.set(
        officeOriginX,
        officeH - 0.25,
        officeOriginZ + officeD / 2 + 0.03,
      );
      worldGroup.add(officeStripe);
      const officeStripe2 = officeStripe.clone();
      officeStripe2.position.set(
        officeOriginX,
        officeH - 0.25,
        officeOriginZ - officeD / 2 - 0.03,
      );
      worldGroup.add(officeStripe2);

      /* Steel corner pilasters at the building corners — narrow tall
       * columns that read as structural steel. */
      const pilasterMat = new THREE.MeshStandardMaterial({
        color: 0x2a323b, roughness: 0.35, metalness: 0.7,
      });
      [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2]].forEach(([cx2, cz2]) => {
        const pil = new THREE.Mesh(
          new THREE.BoxGeometry(0.5, BUILDING_HEIGHT + 0.4, 0.5),
          pilasterMat
        );
        pil.position.set(cx2, BUILDING_HEIGHT / 2, cz2);
        pil.castShadow = true;
        worldGroup.add(pil);
      });

      /* Perimeter fence — chain-link + posts running along the
       * setback band so the user feels the facility is secured. */
      if (plan.site) {
        const sw_w = sw(plan.site.w - plan.site.setback * 1.1);
        const sw_h = sw(plan.site.h - plan.site.setback * 1.1);
        const fencePostMat = new THREE.MeshStandardMaterial({ color: 0x40474f, roughness: 0.6, metalness: 0.5 });
        const fenceMesh = new THREE.MeshStandardMaterial({
          color: 0x40474f, transparent: true, opacity: 0.18,
          roughness: 0.5, metalness: 0.5, side: THREE.DoubleSide,
        });
        /* Four fence rails */
        const railH = 1.6;
        const fenceGroup = new THREE.Group();
        const longGeo = new THREE.BoxGeometry(sw_w, railH, 0.05);
        const shortGeo = new THREE.BoxGeometry(0.05, railH, sw_h);
        [-sw_h / 2, sw_h / 2].forEach((zz) => {
          const m = new THREE.Mesh(longGeo, fenceMesh);
          m.position.set(0, railH / 2, zz);
          fenceGroup.add(m);
        });
        [-sw_w / 2, sw_w / 2].forEach((xx) => {
          const m = new THREE.Mesh(shortGeo, fenceMesh);
          m.position.set(xx, railH / 2, 0);
          fenceGroup.add(m);
        });
        /* Posts every ~6 units along each rail */
        const postGeo = new THREE.CylinderGeometry(0.06, 0.06, railH + 0.2, 6);
        const postSpacing = 6;
        for (let xx = -sw_w / 2; xx <= sw_w / 2 + 0.001; xx += postSpacing) {
          [-sw_h / 2, sw_h / 2].forEach((zz) => {
            const post = new THREE.Mesh(postGeo, fencePostMat);
            post.position.set(xx, railH / 2, zz);
            fenceGroup.add(post);
          });
        }
        for (let zz = -sw_h / 2 + postSpacing; zz <= sw_h / 2 - postSpacing + 0.001; zz += postSpacing) {
          [-sw_w / 2, sw_w / 2].forEach((xx) => {
            const post = new THREE.Mesh(postGeo, fencePostMat);
            post.position.set(xx, railH / 2, zz);
            fenceGroup.add(post);
          });
        }
        worldGroup.add(fenceGroup);
      }

      /* Site light poles were superseded by the cobra-head pole
       * cluster added in the Site-Level Detail block above. */
    }

    /* Building roof — appears at Phase 4 once construction is approved.
     * Real DC roofs have a parapet, mechanical penthouses, exhaust
     * stacks, and a clearly defined membrane. We compose those here. */
    if (showRoof) {
      const W = sw(bldg.w);
      const D = sw(bldg.h);
      /* Roof membrane — also transparent so the user can see racks
       * from above. We keep a slight tint so the roof plane still
       * reads as a surface (without it the parapet would float). */
      const roofGeo = new THREE.BoxGeometry(W * 0.99, 0.3, D * 0.99);
      const roofMat = new THREE.MeshStandardMaterial({
        color: 0x131820, roughness: 0.92, metalness: 0.05,
        transparent: true, opacity: 0.18, depthWrite: false,
      });
      const roof = new THREE.Mesh(roofGeo, roofMat);
      roof.position.y = BUILDING_HEIGHT + 0.15;
      roof.receiveShadow = true;
      worldGroup.add(roof);

      /* Parapet — short border wall around the roof edge so the
       * silhouette reads as a real industrial roofline (not a
       * sharp-edged box). Built as four thin Box meshes. */
      const parapetMat = new THREE.MeshStandardMaterial({
        color: 0x4a525c, roughness: 0.85, metalness: 0.1,
      });
      const parapetH = 0.85;
      const long = new THREE.BoxGeometry(W * 1.005, parapetH, 0.4);
      const shortP = new THREE.BoxGeometry(0.4, parapetH, D * 1.005);
      [[0, BUILDING_HEIGHT + parapetH / 2 + 0.3, D / 2 + 0.0], 0].forEach(() => {});
      const pn = new THREE.Mesh(long, parapetMat);
      pn.position.set(0, BUILDING_HEIGHT + parapetH / 2 + 0.3, D / 2);
      pn.castShadow = true;
      worldGroup.add(pn);
      const ps = new THREE.Mesh(long, parapetMat);
      ps.position.set(0, BUILDING_HEIGHT + parapetH / 2 + 0.3, -D / 2);
      ps.castShadow = true;
      worldGroup.add(ps);
      const pe = new THREE.Mesh(shortP, parapetMat);
      pe.position.set(W / 2, BUILDING_HEIGHT + parapetH / 2 + 0.3, 0);
      pe.castShadow = true;
      worldGroup.add(pe);
      const pw = new THREE.Mesh(shortP, parapetMat);
      pw.position.set(-W / 2, BUILDING_HEIGHT + parapetH / 2 + 0.3, 0);
      pw.castShadow = true;
      worldGroup.add(pw);

      /* Mechanical penthouse — a smaller box on the roof toward the
       * mechanical-room side so the silhouette has vertical interest. */
      const penthouseMat = new THREE.MeshStandardMaterial({
        color: 0x383f48, roughness: 0.75, metalness: 0.2,
      });
      const penthouseGeo = new THREE.BoxGeometry(sw(plan.rooms.mechanical?.w || 80) * 0.9, 1.6, sw(plan.rooms.mechanical?.h || 50) * 0.55);
      const penthouse = new THREE.Mesh(penthouseGeo, penthouseMat);
      const [pmx, , pmz] = plan.rooms.mechanical
        ? svgToWorld(plan.rooms.mechanical.x + plan.rooms.mechanical.w / 2, plan.rooms.mechanical.y + plan.rooms.mechanical.h / 2)
        : [-W * 0.3, 0, -D * 0.3];
      penthouse.position.set(pmx, BUILDING_HEIGHT + 0.95, pmz);
      penthouse.castShadow = true;
      worldGroup.add(penthouse);

      /* Exhaust stacks rising from the roof (gas-genset exhaust path). */
      if (powerMix.gas > 0) {
        const stackMat = new THREE.MeshStandardMaterial({
          color: 0x2a323b, roughness: 0.7, metalness: 0.5,
        });
        for (let i = 0; i < 2; i++) {
          const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 2.6, 8), stackMat);
          stack.position.set(-W * 0.35 + i * 1.4, BUILDING_HEIGHT + 1.4, D * 0.32);
          stack.castShadow = true;
          worldGroup.add(stack);
        }
      }

      /* HVAC ducts running across part of the roof — galvanised steel
       * with proper hangers + reinforcement bands so the duct reads as
       * a real fabricated air-handling run. */
      const ductMat = new THREE.MeshStandardMaterial({
        color: 0xc8cdd4, roughness: 0.4, metalness: 0.55,
        roughnessMap: proceduralNoiseTexture({ size: 64, scale: 4, seed: 101 }),
      });
      const ductBandMat = new THREE.MeshStandardMaterial({
        color: 0x5a626d, roughness: 0.55, metalness: 0.45,
      });
      const duct = new THREE.Mesh(roundedBox(W * 0.6, 0.35, 0.5, 0.04), ductMat);
      duct.position.set(0, BUILDING_HEIGHT + 0.55, D * 0.1);
      duct.castShadow = true;
      worldGroup.add(duct);
      /* Reinforcement bands every ~2m along the duct */
      const bandCount = Math.floor(W * 0.6 / 2);
      for (let b = 0; b < bandCount; b++) {
        const band = new THREE.Mesh(
          new THREE.BoxGeometry(0.06, 0.4, 0.55),
          ductBandMat,
        );
        band.position.set(
          -W * 0.3 + (b + 0.5) * (W * 0.6 / bandCount),
          BUILDING_HEIGHT + 0.55,
          D * 0.1,
        );
        worldGroup.add(band);
      }

      /* Rooftop condenser cluster — small array of dry-coolers near
       * the centre of the roof. Always present (the building always
       * has some air handling regardless of cooling type, just less
       * for liquid-cooled). */
      const condenserCount = coolingType === "immersion" ? 2
        : coolingType === "d2c" ? 4 : 6;
      const condenserMat = new THREE.MeshStandardMaterial({
        color: 0x4d5660, roughness: 0.6, metalness: 0.5,
      });
      const condenserGrilleMat = new THREE.MeshStandardMaterial({
        color: 0xb8c0c8, roughness: 0.4, metalness: 0.7,
      });
      for (let i = 0; i < condenserCount; i++) {
        const cluster = new THREE.Group();
        const cx2 = W * 0.18 + (i % 3) * 1.2 - 1.2;
        const cz2 = D * 0.32 - Math.floor(i / 3) * 1.4;
        cluster.position.set(cx2, BUILDING_HEIGHT + 0.45, cz2);
        const box = new THREE.Mesh(roundedBox(0.95, 0.7, 0.85, 0.04), condenserMat);
        box.castShadow = true;
        cluster.add(box);
        /* Side-mount fan grille */
        const grille = new THREE.Mesh(
          new THREE.TorusGeometry(0.28, 0.025, 6, 16),
          condenserGrilleMat,
        );
        grille.rotation.y = Math.PI / 2;
        grille.position.x = 0.43;
        cluster.add(grille);
        worldGroup.add(cluster);
      }

      /* Satellite dishes — every DC has at least 1-2 for OOB
       * management connectivity. We add 2 angled toward the
       * sky-southwest. */
      const dishMat = new THREE.MeshStandardMaterial({
        color: 0xe6e8ec, roughness: 0.45, metalness: 0.55,
      });
      const dishStandMat = new THREE.MeshStandardMaterial({
        color: 0x40474f, roughness: 0.6, metalness: 0.5,
      });
      for (let i = 0; i < 2; i++) {
        const stand = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.05, 0.6, 8),
          dishStandMat,
        );
        stand.position.set(-W * 0.42 + i * 0.9, BUILDING_HEIGHT + 0.6, -D * 0.42);
        worldGroup.add(stand);
        const dish = new THREE.Mesh(
          new THREE.SphereGeometry(0.42, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.4),
          dishMat,
        );
        dish.rotation.x = -0.6;
        dish.rotation.y = -0.3 + i * 0.4;
        dish.position.set(-W * 0.42 + i * 0.9, BUILDING_HEIGHT + 1.0, -D * 0.42);
        worldGroup.add(dish);
        /* LNB feed at dish focus */
        const lnb = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04, 0.04, 0.18, 8),
          dishStandMat,
        );
        lnb.rotation.x = 0.6;
        lnb.position.set(-W * 0.42 + i * 0.9, BUILDING_HEIGHT + 1.18, -D * 0.42 + 0.32);
        worldGroup.add(lnb);
      }

      /* Lightning rods at the four roof corners — thin tapered
       * cylinders with red caps, like real Franklin-style air
       * terminals. */
      const rodMat = new THREE.MeshStandardMaterial({
        color: 0xc8cdd4, roughness: 0.4, metalness: 0.85,
      });
      const rodCapMat = new THREE.MeshStandardMaterial({
        color: 0xd14a3a, roughness: 0.5, metalness: 0.4,
        emissive: 0x4a1208, emissiveIntensity: 0.4,
      });
      for (const [rx, rz] of [
        [W / 2 - 0.4, D / 2 - 0.4],
        [-W / 2 + 0.4, D / 2 - 0.4],
        [W / 2 - 0.4, -D / 2 + 0.4],
        [-W / 2 + 0.4, -D / 2 + 0.4],
      ]) {
        const rod = new THREE.Mesh(
          new THREE.CylinderGeometry(0.025, 0.04, 1.4, 8),
          rodMat,
        );
        rod.position.set(rx, BUILDING_HEIGHT + parapetH + 0.7, rz);
        worldGroup.add(rod);
        const cap = new THREE.Mesh(
          new THREE.SphereGeometry(0.05, 8, 6),
          rodCapMat,
        );
        cap.position.set(rx, BUILDING_HEIGHT + parapetH + 1.4, rz);
        worldGroup.add(cap);
      }

      /* Drainage scuppers — small rectangular outlets through the
       * parapet on the north and south edges, where rain runs off
       * the membrane. Tiny but visually grounding. */
      const scupperMat = new THREE.MeshStandardMaterial({
        color: 0x2a323b, roughness: 0.7, metalness: 0.5,
      });
      for (let s = -2; s <= 2; s += 2) {
        for (const z of [D / 2, -D / 2]) {
          const sc = new THREE.Mesh(
            new THREE.BoxGeometry(0.5, 0.18, 0.45),
            scupperMat,
          );
          sc.position.set(s * (W / 6), BUILDING_HEIGHT + 0.45, z);
          worldGroup.add(sc);
        }
      }

      /* Roof-access service ladder — climbs the parapet on the
       * mechanical-room side. */
      const ladderMat = new THREE.MeshStandardMaterial({
        color: 0x4a525c, roughness: 0.65, metalness: 0.55,
      });
      const ladderRail1 = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, parapetH + 0.4, 0.04),
        ladderMat,
      );
      ladderRail1.position.set(-W / 2 - 0.05, BUILDING_HEIGHT + parapetH * 0.5 + 0.3, 0.25);
      worldGroup.add(ladderRail1);
      const ladderRail2 = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, parapetH + 0.4, 0.04),
        ladderMat,
      );
      ladderRail2.position.set(-W / 2 - 0.05, BUILDING_HEIGHT + parapetH * 0.5 + 0.3, -0.25);
      worldGroup.add(ladderRail2);
      for (let r = 0; r < 5; r++) {
        const rung = new THREE.Mesh(
          new THREE.BoxGeometry(0.04, 0.025, 0.55),
          ladderMat,
        );
        rung.position.set(
          -W / 2 - 0.05,
          BUILDING_HEIGHT + 0.05 + r * (parapetH + 0.4) / 5,
          0,
        );
        worldGroup.add(rung);
      }

      /* Wall-mounted facility nameplate — thin sign board centred
       * above the loading dock. Adds the "this is a real building
       * with branded entrance" feel. */
      const signMat = new THREE.MeshStandardMaterial({
        color: 0x33fbd3, roughness: 0.4, metalness: 0,
        emissive: 0x33fbd3, emissiveIntensity: 0.5,
      });
      const signBackerMat = new THREE.MeshStandardMaterial({
        color: 0x101820, roughness: 0.7, metalness: 0.4,
      });
      const sign = new THREE.Mesh(
        roundedBox(W * 0.18, 0.6, 0.08, 0.04),
        signBackerMat,
      );
      sign.position.set(0, BUILDING_HEIGHT * 0.78, D / 2 + 0.05);
      worldGroup.add(sign);
      const signText = new THREE.Mesh(
        new THREE.BoxGeometry(W * 0.16, 0.42, 0.025),
        signMat,
      );
      signText.position.set(0, BUILDING_HEIGHT * 0.78, D / 2 + 0.11);
      worldGroup.add(signText);
    }

    /* ---------- Floor grid inside building ---------- */
    const grid = new THREE.GridHelper(
      Math.max(sw(bldg.w), sw(bldg.h)) * 1.2,
      Math.max(8, Math.round(Math.max(sw(bldg.w), sw(bldg.h)) / 4)),
      0x1a3a36,
      0x10221f
    );
    grid.position.y = 0.011;
    worldGroup.add(grid);

    /* Each room is a coloured floor pad + an optional taller "rack" of
     * generic equipment so the user perceives volume. The colours
     * encode function — green=mechanical/cooling, amber=electrical,
     * sky=MMR/network, mint=data hall (compute). */

    const roomDefs = [];

    function addZoneFloor(rect, color, opacity = 0.55) {
      const [wx, , wz] = svgToWorld(rect.x + rect.w / 2, rect.y + rect.h / 2);
      const padGeo = new THREE.BoxGeometry(sw(rect.w), 0.06, sw(rect.h));
      const padMat = new THREE.MeshStandardMaterial({
        color, transparent: true, opacity, roughness: 0.7, metalness: 0.1,
      });
      const pad = new THREE.Mesh(padGeo, padMat);
      pad.position.set(wx, 0.05, wz);
      pad.receiveShadow = true;
      worldGroup.add(pad);
      return { wx, wz, w: sw(rect.w), h: sw(rect.h) };
    }

    /* Interior rooms — populated only at Phase 4+ (Facility
     * Construction). Earlier phases just show the empty slab. */

    /* Mechanical (cooling plant) */
    if (showInterior && plan.rooms.mechanical) {
      const mech = addZoneFloor(plan.rooms.mechanical, 0x12354b, 0.55);
      /* Pop a few CRAH unit columns inside */
      const crahMat = new THREE.MeshStandardMaterial({
        color: 0x2a5a78, roughness: 0.5, metalness: 0.4, emissive: 0x0c2032, emissiveIntensity: 0.35,
      });
      const crahGeo = new THREE.BoxGeometry(0.9, 2.4, 0.9);
      const crahCount = Math.max(2, Math.round(plan.rooms.mechanical.w / 26));
      for (let i = 0; i < crahCount; i++) {
        const cm = new THREE.Mesh(crahGeo, crahMat);
        const tx = mech.wx - mech.w * 0.4 + (mech.w * 0.8) * (i / Math.max(1, crahCount - 1));
        cm.position.set(tx, 1.2, mech.wz);
        cm.castShadow = true;
        worldGroup.add(cm);
      }
      labelTargets.push({
        x: mech.wx, y: 3.2, z: mech.wz,
        title: "COOLING PLANT",
        sub: coolingType === "immersion" ? "Immersion tanks"
           : coolingType === "d2c" ? "Direct-to-chip CDU"
           : "Air handlers (CRAH)",
        kind: "cooling",
      });
    }

    /* Electrical (switchgear / MER)
     *
     * A row of low-voltage switchgear cabinets matching the look of
     * Eaton/Schneider drawout breaker line-ups:
     *   - Light-grey painted enclosure (chamfered)
     *   - Front-face split into 3 vertical sections per cabinet
     *     (incoming bus, breaker compartments, instrumentation panel)
     *   - Status indicator LEDs (mint = healthy, amber = standby)
     *   - Door handle + nameplate label
     */
    if (showInterior && plan.rooms.electrical) {
      const ele = addZoneFloor(plan.rooms.electrical, 0x4b3413, 0.6);

      const sgShellMat = new THREE.MeshStandardMaterial({
        color: 0x9099a3,
        roughness: 0.5,
        metalness: 0.6,
        emissive: 0x141618, emissiveIntensity: 0.18,
      });
      const sgPanelMat = new THREE.MeshStandardMaterial({
        color: 0x6d747e, roughness: 0.55, metalness: 0.55,
      });
      const sgSeamMat = new THREE.MeshStandardMaterial({
        color: 0x18191c, roughness: 0.85, metalness: 0.3,
      });
      const sgLedGreen = new THREE.MeshStandardMaterial({
        color: 0x33fbd3, emissive: 0x33fbd3, emissiveIntensity: 1.7, roughness: 0.3,
      });
      const sgLedAmber = new THREE.MeshStandardMaterial({
        color: 0xffae42, emissive: 0xffae42, emissiveIntensity: 1.4, roughness: 0.3,
      });
      const handleMat = new THREE.MeshStandardMaterial({
        color: 0x2c2f33, roughness: 0.5, metalness: 0.7,
      });

      const sgCount = Math.max(3, Math.round(plan.rooms.electrical.w / 18));
      for (let i = 0; i < sgCount; i++) {
        const cab = new THREE.Group();
        const tx = ele.wx - ele.w * 0.4 + (ele.w * 0.8) * (i / Math.max(1, sgCount - 1));
        cab.position.set(tx, 0, ele.wz);

        /* Main shell */
        const shell = new THREE.Mesh(roundedBox(0.9, 2.6, 0.6, 0.04), sgShellMat);
        shell.position.y = 1.3;
        shell.castShadow = true;
        cab.add(shell);

        /* Front face split into 3 panels with seam lines */
        for (let p = 0; p < 3; p++) {
          const panel = new THREE.Mesh(
            roundedBox(0.78, 0.78, 0.012, 0.02),
            sgPanelMat,
          );
          panel.position.set(0, 0.36 + p * 0.85, 0.305);
          cab.add(panel);
          /* Indicator LED on each panel — alternating green/amber */
          const led = new THREE.Mesh(
            new THREE.SphereGeometry(0.025, 6, 6),
            (i + p) % 3 === 0 ? sgLedAmber : sgLedGreen,
          );
          led.position.set(-0.32, 0.55 + p * 0.85, 0.318);
          cab.add(led);
        }

        /* Vertical seam between cabinets */
        const seam = new THREE.Mesh(
          new THREE.BoxGeometry(0.012, 2.55, 0.62),
          sgSeamMat,
        );
        seam.position.set(0.452, 1.3, 0);
        cab.add(seam);

        /* Door handle on the middle panel */
        const handle = new THREE.Mesh(
          new THREE.BoxGeometry(0.05, 0.18, 0.04),
          handleMat,
        );
        handle.position.set(0.32, 1.21, 0.325);
        cab.add(handle);

        worldGroup.add(cab);
      }

      labelTargets.push({
        x: ele.wx, y: 3.4, z: ele.wz,
        title: "ELECTRICAL ROOM",
        sub: `${targetMw.toFixed ? targetMw.toFixed(0) : targetMw} MW switchgear`,
        kind: "electrical",
      });
    }

    /* MMR (Meet-Me Room / network entrance). The shell shape lights
     * up at Phase 3 (fiber procurement) so the user sees where their
     * carriers will land before the rest of the interior is built. */
    if (showFiber && plan.rooms.mmr) {
      const mmr = addZoneFloor(plan.rooms.mmr, 0x123a48, 0.7);
      /* Network rack stack */
      const nrMat = new THREE.MeshStandardMaterial({
        color: 0x1c4258, roughness: 0.4, metalness: 0.5, emissive: 0x051824, emissiveIntensity: 0.4,
      });
      const nrGeo = new THREE.BoxGeometry(Math.max(0.8, mmr.w * 0.6), 2.2, Math.max(0.6, mmr.h * 0.7));
      const nr = new THREE.Mesh(nrGeo, nrMat);
      nr.position.set(mmr.wx, 1.1, mmr.wz);
      nr.castShadow = true;
      worldGroup.add(nr);
      labelTargets.push({
        x: mmr.wx, y: 2.9, z: mmr.wz,
        title: "MMR (NETWORK)",
        sub: "Carriers · Cross-connects",
        kind: "network",
      });
    }

    /* Switchgear pad (outside building wall) — Phase 2+ since the
     * substation is part of power procurement.
     *
     * Pad-mounted utility transformer assembly:
     *   - Concrete pad base
     *   - Main rectangular oil-filled tank (chamfered)
     *   - Pleated radiator/cooling fins along the long sides
     *   - Three porcelain HV bushings on top
     *   - Three smaller LV bushings on the side
     *   - Oil conservator/fill cap on top
     *   - Hazard-orange warning placard on the front
     */
    if (showBuilding && plan.rooms.switchgear) {
      const sg = addZoneFloor(plan.rooms.switchgear, 0x3a2a13, 0.65);

      const tankMat = new THREE.MeshStandardMaterial({
        color: 0x4d6d3e, // utility-green is the standard pad-mount colour
        roughness: 0.6,
        metalness: 0.45,
        emissive: 0x0a1408, emissiveIntensity: 0.16,
        roughnessMap: proceduralNoiseTexture({ size: 64, scale: 4, seed: 23 }),
      });
      const finMat = new THREE.MeshStandardMaterial({
        color: 0x3d5a32, roughness: 0.7, metalness: 0.4,
      });
      const bushingMat = new THREE.MeshStandardMaterial({
        color: 0xeae3d6, roughness: 0.35, metalness: 0,
      });
      const conductorMat = new THREE.MeshStandardMaterial({
        color: 0x7a8088, roughness: 0.45, metalness: 0.85,
      });
      const placardMat = new THREE.MeshStandardMaterial({
        color: 0xff8a3a, roughness: 0.6, metalness: 0,
        emissive: 0xff8a3a, emissiveIntensity: 0.22,
      });
      const padMat = new THREE.MeshStandardMaterial({
        color: 0x848890, roughness: 0.95, metalness: 0,
      });

      const sub = new THREE.Group();
      sub.position.set(sg.wx, 0, sg.wz);

      /* Concrete pad */
      const pad = new THREE.Mesh(roundedBox(2.6, 0.18, 2.0, 0.04), padMat);
      pad.position.y = 0.09;
      pad.receiveShadow = true;
      sub.add(pad);

      /* Main oil tank */
      const tank = new THREE.Mesh(roundedBox(2.0, 1.4, 1.4, 0.06), tankMat);
      tank.position.y = 0.18 + 0.7;
      tank.castShadow = true;
      tank.receiveShadow = true;
      sub.add(tank);

      /* Cooling fins / pleated radiators along the +Z and -Z faces */
      const finCount = 8;
      for (let s of [-1, 1]) {
        for (let f = 0; f < finCount; f++) {
          const fin = new THREE.Mesh(
            new THREE.BoxGeometry(0.05, 1.05, 0.18),
            finMat,
          );
          fin.position.set(
            -0.85 + (f / (finCount - 1)) * 1.7,
            0.18 + 0.55,
            s * 0.78,
          );
          sub.add(fin);
        }
      }

      /* Three HV bushings on top — porcelain stack with conductor cap */
      for (let b = 0; b < 3; b++) {
        const bx2 = -0.55 + b * 0.55;
        /* Stacked porcelain insulator (flared at base, tapered) */
        const insulator = new THREE.Mesh(
          new THREE.CylinderGeometry(0.07, 0.11, 0.55, 12),
          bushingMat,
        );
        insulator.position.set(bx2, 0.18 + 1.4 + 0.275, 0);
        sub.add(insulator);
        /* Petticoat rings to read as a real porcelain insulator */
        for (let r = 0; r < 4; r++) {
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(0.11 - r * 0.005, 0.018, 4, 16),
            bushingMat,
          );
          ring.rotation.x = Math.PI / 2;
          ring.position.set(bx2, 0.18 + 1.4 + 0.06 + r * 0.13, 0);
          sub.add(ring);
        }
        /* Aluminium cap */
        const cap = new THREE.Mesh(
          new THREE.CylinderGeometry(0.09, 0.09, 0.06, 12),
          conductorMat,
        );
        cap.position.set(bx2, 0.18 + 1.4 + 0.58, 0);
        sub.add(cap);
      }

      /* Three smaller LV bushings on the front face */
      for (let b = 0; b < 3; b++) {
        const bx2 = -0.5 + b * 0.5;
        const lv = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.07, 0.32, 10),
          bushingMat,
        );
        lv.rotation.x = Math.PI / 2;
        lv.position.set(bx2, 0.18 + 0.4, 0.85);
        sub.add(lv);
      }

      /* Oil-fill cap (small disc on top, slightly off-centre) */
      const fillCap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.07, 0.05, 12),
        conductorMat,
      );
      fillCap.position.set(0.7, 0.18 + 1.42, -0.4);
      sub.add(fillCap);

      /* Hazard-orange warning placard on the door */
      const placard = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 0.22, 0.012),
        placardMat,
      );
      placard.position.set(0, 1.0, 0.711);
      sub.add(placard);

      worldGroup.add(sub);

      labelTargets.push({
        x: sg.wx, y: 2.4, z: sg.wz,
        title: "UTILITY SUBSTATION",
        sub: `${targetMw.toFixed ? targetMw.toFixed(0) : targetMw} MW grid tap`,
        kind: "energy",
      });
    }

    /* ---------- DATA HALL (compute) ---------- */
    /* The mint-glow data hall floor pad lights up at Phase 4 (along
     * with the rest of the interior). Racks themselves only spawn at
     * Phase 5+ once GPU decisions are locked. */
    const dh = plan.rooms.dataHall;
    if (showInterior && dh) {
      const dhInfo = addZoneFloor(dh, 0x0a3935, 0.85);
      labelTargets.push({
        x: dhInfo.wx, y: RACK_HEIGHT + 2.5, z: dhInfo.wz,
        title: "COMPUTE FLOOR",
        sub: `${racks.installed || 0} racks · ${(racks.slots || []).length > 0 ? "INFER ACTIVE" : "PRE-INSTALL"}`,
        kind: "compute",
      });

      /* Cold/hot aisle stripes */
      const aisleColdMat = new THREE.MeshStandardMaterial({ color: 0x12354b, roughness: 0.95, opacity: 0.85, transparent: true });
      const aisleHotMat = new THREE.MeshStandardMaterial({ color: 0x4b1a13, roughness: 0.95, opacity: 0.85, transparent: true });
      racks.aisles.forEach((aisle) => {
        const ax = aisle.x + aisle.w / 2;
        const az = aisle.y + aisle.h / 2;
        const [wx, , wz] = svgToWorld(ax, az);
        const stripe = new THREE.Mesh(
          new THREE.BoxGeometry(sw(aisle.w) * 0.97, 0.05, sw(aisle.h) * 0.85),
          aisle.type === "cold" ? aisleColdMat : aisleHotMat
        );
        stripe.position.set(wx, 0.1, wz);
        stripe.receiveShadow = true;
        worldGroup.add(stripe);
      });

      /* Rack / immersion-tank instances — InstancedMesh keeps draw
       * calls tiny. Cooling type radically changes shape:
       *   - air, d2c   → vertical cabinets (RACK_HEIGHT tall)
       *   - immersion  → horizontal bath tanks (~1.5 tall, wider)
       * GPU model also nudges the rack profile:
       *   - b200       → taller + denser (+15% height, mint glow)
       *   - a100       → shorter (–10%) older-gen rack
       *   - h100/h200  → standard
       */
      const slotCount = racks.slots.length;
      const isImmersion = (coolingType || "").toLowerCase().includes("immersion");
      const gpuKey = (gpuModel || "").toLowerCase();
      const heightMult = gpuKey.startsWith("b") ? 1.15
        : gpuKey.startsWith("a") ? 0.88
        : 1.0;
      const rackH = isImmersion ? 1.4 : RACK_HEIGHT * heightMult;
      const isB200 = gpuKey.startsWith("b");
      const rackEmissive = isB200 ? 0x103020 : 0x041018;

      /* Racks only spawn at Phase 5+ once compute decisions are
       * locked. Earlier phases just show the empty data hall floor. */
      if (showRacks && slotCount > 0 && racks.installed > 0) {
        /* Server rack chassis — main body. Now uses a chamfered box
         * so the front/back edges read as fabricated steel rather
         * than primitive geometry. The procedural-noise roughness
         * map adds a subtle paint-finish micro-detail across the
         * whole instanced mesh (same texture is reused, near-free). */
        const rackGeo = roundedBox(1, rackH, 1, 0.04);
        const rackMat = new THREE.MeshStandardMaterial({
          color: isImmersion ? 0x132a3a : 0x1a2026,
          roughness: isImmersion ? 0.35 : 0.6,
          metalness: isImmersion ? 0.65 : 0.5,
          emissive: rackEmissive,
          emissiveIntensity: 0.45,
          roughnessMap: proceduralNoiseTexture({ size: 64, scale: 6, seed: 53 }),
        });
        const installedMesh = new THREE.InstancedMesh(rackGeo, rackMat, racks.installed);

        /* Immersion tanks have a glass top "window" mesh so they read
         * as bath tanks rather than just shorter racks. Standard racks
         * have an LED on top instead. */
        const ledOrLidMat = isImmersion
          ? new THREE.MeshBasicMaterial({ color: 0x6dd6ff, transparent: true, opacity: 0.55 })
          : new THREE.MeshBasicMaterial({ color: 0x33fbd3 });
        const ledOrLidGeo = isImmersion
          ? new THREE.BoxGeometry(0.92, 0.05, 0.92)
          : new THREE.SphereGeometry(0.12, 8, 8);
        const ledMesh = new THREE.InstancedMesh(ledOrLidGeo, ledOrLidMat, racks.installed);
        ledMesh.frustumCulled = false;

        const emptyCount = Math.max(0, racks.capacity - racks.installed);
        let emptyMesh = null;
        if (emptyCount > 0) {
          const emptyMat = new THREE.MeshStandardMaterial({
            color: 0x0f1419, transparent: true, opacity: 0.32,
            roughness: 0.9, metalness: 0.1,
          });
          emptyMesh = new THREE.InstancedMesh(rackGeo, emptyMat, emptyCount);
        }

        const tmpMatrix = new THREE.Matrix4();
        const tmpQuat = new THREE.Quaternion();
        const tmpScale = new THREE.Vector3();
        const tmpPos = new THREE.Vector3();
        const tmpColor = new THREE.Color();

        let installedIdx = 0;
        let emptyIdx = 0;
        racks.slots.forEach((slot, idx) => {
          const cx2 = slot.x + slot.w / 2;
          const cz2 = slot.y + slot.h / 2;
          const [wx, , wz] = svgToWorld(cx2, cz2);
          const sx = Math.max(0.4, sw(slot.w));
          const sz = Math.max(0.4, sw(slot.h));
          tmpPos.set(wx, rackH / 2, wz);
          tmpScale.set(sx, 1, sz);
          tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);

          if (idx < racks.installed) {
            installedMesh.setMatrixAt(installedIdx, tmpMatrix);
            /* Heat colour ramp differs per cooling type — immersion
             * stays cool (sky/cyan), air/d2c go from mint to amber. */
            const heatT = (idx % 13) / 13.0;
            if (isImmersion) {
              tmpColor.setHSL(0.55, 0.7, 0.42 - heatT * 0.1);
            } else {
              tmpColor.setHSL(0.45 - heatT * 0.45, 0.85, 0.45);
            }
            installedMesh.setColorAt(installedIdx, tmpColor);

            /* Top LED / glass lid */
            if (isImmersion) {
              tmpPos.set(wx, rackH + 0.04, wz);
              tmpScale.set(sx * 0.92, 1, sz * 0.92);
            } else {
              const ledScale = 0.5;
              tmpPos.set(wx, rackH + 0.18, wz - sz * 0.35);
              tmpScale.set(ledScale, ledScale, ledScale);
            }
            tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
            ledMesh.setMatrixAt(installedIdx, tmpMatrix);

            installedIdx += 1;
          } else if (emptyMesh) {
            emptyMesh.setMatrixAt(emptyIdx, tmpMatrix);
            emptyIdx += 1;
          }
        });

        installedMesh.instanceMatrix.needsUpdate = true;
        if (installedMesh.instanceColor) installedMesh.instanceColor.needsUpdate = true;
        installedMesh.castShadow = true;
        installedMesh.receiveShadow = true;
        worldGroup.add(installedMesh);

        ledMesh.instanceMatrix.needsUpdate = true;
        worldGroup.add(ledMesh);

        if (emptyMesh) {
          emptyMesh.instanceMatrix.needsUpdate = true;
          worldGroup.add(emptyMesh);
        }
      }

      /* Phase 7 — DCIM telemetry. Two visual layers:
       *   1. A constant low-amplitude floor glow so the user sees
       *      monitoring is "online" even at idle.
       *   2. A periodic RADAR-STYLE radial scan: a ring expands from
       *      the centre of the data hall every ~6 seconds. Marks the
       *      moment a sweep passes through, much like a NOC's heartbeat.
       */
      if (showTelemetry) {
        const [dx, , dz] = svgToWorld(dh.x + dh.w / 2, dh.y + dh.h / 2);

        /* Constant glow plane */
        const scanGeo = new THREE.PlaneGeometry(sw(dh.w) * 0.96, sw(dh.h) * 0.96);
        const scanMat = new THREE.MeshBasicMaterial({
          color: 0x33fbd3, transparent: true, opacity: 0.08, side: THREE.DoubleSide,
        });
        const scan = new THREE.Mesh(scanGeo, scanMat);
        scan.position.set(dx, 0.16, dz);
        scan.rotation.x = -Math.PI / 2;
        scan.userData.kind = "dcim-scan";
        worldGroup.add(scan);

        /* Periodic radial scan ring — fades outward then resets */
        const scanRingGeo = new THREE.RingGeometry(0.4, 0.6, 64);
        const scanRingMat = new THREE.MeshBasicMaterial({
          color: 0x33fbd3, transparent: true, opacity: 0.85,
          side: THREE.DoubleSide, depthWrite: false,
        });
        const scanRing = new THREE.Mesh(scanRingGeo, scanRingMat);
        scanRing.position.set(dx, 0.18, dz);
        scanRing.rotation.x = -Math.PI / 2;
        scanRing.userData.kind = "dcim-scan-ring";
        scanRing.userData.maxRadius = Math.max(sw(dh.w), sw(dh.h)) * 0.48;
        worldGroup.add(scanRing);

        /* Telemetry summary label */
        const monLabel = monitoringApproach === "dcim-suite" ? "Full DCIM suite"
          : monitoringApproach === "open-stack" ? "Open-source stack"
          : "Telemetry online";
        labelTargets.push({
          x: dx, y: RACK_HEIGHT + 4.2, z: dz - sw(dh.h) * 0.35,
          title: "DCIM TELEMETRY",
          sub: monLabel,
          kind: "network",
          radius: 4,
        });
      }

      /* In-row CDU (Cooling Distribution Unit) manifolds — appear
       * once compute is installed AND the user picked a liquid
       * cooling stack (d2c or immersion). Run sky-blue pipes along
       * each rack row so the cooling path is obvious. */
      if (showRacks && (coolingType === "d2c" || coolingType === "immersion") && racks.rowLabels) {
        const cduMat = new THREE.MeshStandardMaterial({
          color: 0x6dd6ff, emissive: 0x6dd6ff, emissiveIntensity: 0.55,
          roughness: 0.3, metalness: 0.7,
        });
        racks.rowLabels.forEach((row) => {
          const [rx, , rz] = svgToWorld(dh.x + dh.w / 2, row.cy);
          const pipe = new THREE.Mesh(
            new THREE.CylinderGeometry(0.06, 0.06, sw(dh.w) * 0.9, 8),
            cduMat
          );
          pipe.rotation.z = Math.PI / 2;
          pipe.position.set(rx, RACK_HEIGHT * 0.95, rz);
          worldGroup.add(pipe);
        });
        const [dx2, , dz2] = svgToWorld(dh.x + dh.w / 2, dh.y + dh.h / 2);
        labelTargets.push({
          x: dx2, y: RACK_HEIGHT * 0.95, z: dz2,
          title: coolingType === "immersion" ? "IMMERSION LOOPS" : "DIRECT-TO-CHIP CDU",
          sub: "Liquid cooling manifolds",
          kind: "cooling",
          radius: 5,
        });
      }

      /* Spine / network overlay — Phase 6+ once the user has chosen
       * fabric + node count. */
      if (showSpine && racks.clusters && racks.clusters.length > 0) {
        const spineMat = new THREE.MeshStandardMaterial({
          color: 0x6dd6ff, emissive: 0x6dd6ff, emissiveIntensity: 0.7,
          roughness: 0.3, metalness: 0.6, transparent: true, opacity: 0.92,
        });
        racks.clusters.forEach((cluster, idx) => {
          const ratio = (idx + 1) / (racks.clusters.length + 1);
          const hdaX = dh.x + dh.w * ratio;
          const hdaY = dh.y + 22;
          const [wx, , wz] = svgToWorld(hdaX, hdaY);
          const hdaMesh = new THREE.Mesh(
            new THREE.BoxGeometry(2.5, 0.5, 1.2), spineMat
          );
          hdaMesh.position.set(wx, CEILING_Y - 0.6, wz);
          hdaMesh.castShadow = true;
          worldGroup.add(hdaMesh);

          const cableGeo = new THREE.CylinderGeometry(0.04, 0.04, CEILING_Y - 0.6 - RACK_HEIGHT, 6);
          const cableMat = new THREE.MeshBasicMaterial({ color: 0x6dd6ff, transparent: true, opacity: 0.4 });
          const cable = new THREE.Mesh(cableGeo, cableMat);
          cable.position.set(wx, (CEILING_Y - 0.6 + RACK_HEIGHT) / 2, wz);
          worldGroup.add(cable);
        });
      }
    }

    /* ---------- UPS BATTERY SYSTEM ---------- */
    /* The user picks a UPS technology in Phase 2 (VRLA / Li-Ion /
     * Supercap). We render a row of battery cabinets immediately
     * NEXT to the electrical room — that's where they really live in
     * a Tier-3 facility. Cabinet count + emissive vary by ups type
     * (faster response = brighter accent). */
    if (showInterior && plan.rooms.electrical) {
      const elec = plan.rooms.electrical;
      const [eux, , euz] = svgToWorld(elec.x + elec.w + 12, elec.y + elec.h / 2);
      const upsCount = 4;
      const upsMat = new THREE.MeshStandardMaterial({
        color: 0x1c4258, roughness: 0.45, metalness: 0.55,
        emissive: 0x0a3548, emissiveIntensity: fullyOnline ? 0.7 : 0.45,
      });
      for (let i = 0; i < upsCount; i++) {
        const ups = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.6, 1.0), upsMat);
        ups.position.set(eux + (i - upsCount / 2) * 0.75, 0.85, euz);
        ups.castShadow = true;
        worldGroup.add(ups);
      }
      labelTargets.push({
        x: eux, y: 2.4, z: euz,
        title: "UPS BATTERY",
        sub: "Ride-through energy storage",
        kind: "electrical",
        radius: 3,
      });
    }

    /* ---------- FIBER ENTRY + IXP UPLINK ---------- */
    /* Phase 3+ visualises the network entry path the user committed
     * to. Two physical signals:
     *   • Underground glowing fiber strand from the parcel edge to
     *     the MMR room (sky-blue, runs just below grade so it reads
     *     as "buried duct").
     *   • A long uplink line that extends BEYOND the parcel toward
     *     where the IXP region lives (off-screen). Reads as the
     *     wide-area carrier handoff.
     *   • A fiber junction box at the parcel edge — a small mint
     *     pillar with hover label "EXTERNAL CONNECTIVITY".
     */
    if (showFiber && plan.rooms.mmr && plan.site) {
      const mmr = plan.rooms.mmr;
      const site = plan.site;
      const [mx, , mz] = svgToWorld(mmr.x + mmr.w / 2, mmr.y + mmr.h / 2);
      /* Junction sits at the SE corner of the parcel — outside the
       * fence line where carriers actually drop fiber. */
      const [jx, , jz] = svgToWorld(site.x + site.w * 0.92, site.y + site.h * 0.5);

      /* Underground fiber duct (slightly below grade) */
      const fiberMat = new THREE.MeshBasicMaterial({
        color: 0x6dd6ff, transparent: true, opacity: 0.92,
      });
      const fiberPoints = [
        new THREE.Vector3(jx, 0.05, jz),
        new THREE.Vector3((jx + mx) / 2, 0.05, (jz + mz) / 2),
        new THREE.Vector3(mx, 0.05, mz),
      ];
      const fiberGeo = new THREE.BufferGeometry().setFromPoints(fiberPoints);
      const fiberLine = new THREE.Line(fiberGeo, fiberMat);
      worldGroup.add(fiberLine);

      /* Carrier junction box */
      const jbMat = new THREE.MeshStandardMaterial({
        color: 0x6dd6ff, emissive: 0x6dd6ff, emissiveIntensity: 0.7,
        roughness: 0.3, metalness: 0.7,
      });
      const junction = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.4, 0.7), jbMat);
      junction.position.set(jx, 0.7, jz);
      junction.castShadow = true;
      worldGroup.add(junction);
      labelTargets.push({
        x: jx, y: 1.8, z: jz,
        title: "FIBER ENTRY",
        sub: `${(fiberCarriers && fiberCarriers.length) || 0} carriers · underground`,
        kind: "network",
        radius: 2.5,
      });

      /* IXP uplink — long emissive line extending well off-parcel.
       * The far endpoint isn't a real city, just a beacon at the
       * world edge so the user perceives "this fiber leaves the
       * facility and goes to the IXP". */
      const ixpFar = new THREE.Vector3(jx + 60, 1.0, jz + 16);
      const ixpMat = new THREE.LineBasicMaterial({
        color: 0xb6d6ff, transparent: true, opacity: 0.6,
      });
      const ixpGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(jx, 0.7, jz),
        ixpFar,
      ]);
      const ixpLine = new THREE.Line(ixpGeo, ixpMat);
      worldGroup.add(ixpLine);

      const beaconMat = new THREE.MeshBasicMaterial({ color: 0xb6d6ff });
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 12), beaconMat);
      beacon.position.copy(ixpFar);
      worldGroup.add(beacon);
      labelTargets.push({
        x: ixpFar.x, y: ixpFar.y + 1.4, z: ixpFar.z,
        title: "IXP UPLINK",
        sub: "Wide-area carrier handoff",
        kind: "network",
        radius: 2.5,
      });
    }

    /* ---------- ROOFTOP CHILLERS (cooling continued) ---------- */
    /* Phase 4+ once the user has chosen a cooling type. Air-cooled
     * facilities get a row of rooftop chillers; d2c gets fewer but
     * larger units; immersion needs only a small heat-rejection skid.
     *
     * Each chiller is a real fluid-cooler-style assembly:
     *   - Chamfered painted-steel housing (RoundedBoxGeometry-equivalent)
     *   - Two top-mounted axial fan wells with grille rings + spinning
     *     blades (driven from the render loop, not the per-frame mat
     *     update path so they stay smooth even when the scene rerenders)
     *   - Side panel seam line
     *   - Refrigerant-line connection studs at the back
     */
    const chillerFanRotors = [];
    if (showCooling && plan.rooms.dataHall) {
      const chillerCount = coolingType === "immersion" ? 2
        : coolingType === "d2c" ? 4
        : 6;

      /* Painted galvanized-steel housing — slightly metallic, mostly
       * rough so you don't get a chrome look. The procedural noise
       * roughness map breaks up the flat colour just enough to read
       * as fabricated panel. */
      const chillerMat = new THREE.MeshStandardMaterial({
        color: 0x3b6360,
        roughness: 0.55,
        metalness: 0.55,
        emissive: 0x0a1c1c,
        emissiveIntensity: 0.18,
        roughnessMap: proceduralNoiseTexture({ size: 64, scale: 6, seed: 7 }),
      });
      /* Dark-grey fan well throat (deep recess for the blades) */
      const fanWellMat = new THREE.MeshStandardMaterial({
        color: 0x14181d, roughness: 0.85, metalness: 0.2,
      });
      /* Aluminium fan grille — slightly reflective */
      const grilleMat = new THREE.MeshStandardMaterial({
        color: 0xb8c0c8, roughness: 0.4, metalness: 0.7,
      });
      /* Mint accent blade — keeps the brand on-screen even in the
       * realistic detail layer */
      const bladeMat = new THREE.MeshStandardMaterial({
        color: 0x7fcfb6, roughness: 0.4, metalness: 0.45,
        emissive: 0x0a3328, emissiveIntensity: 0.4,
      });
      const refrigerantMat = new THREE.MeshStandardMaterial({
        color: 0xe6e8ec, roughness: 0.3, metalness: 0.85,
      });

      for (let i = 0; i < chillerCount; i++) {
        const t = (i + 0.5) / chillerCount;
        const xx = sw(plan.rooms.dataHall.x + plan.rooms.dataHall.w * t) - sw(cx);
        const zz = -sw(plan.building.h) * 0.35;
        const baseY = BUILDING_HEIGHT + 0.65;

        const unit = new THREE.Group();
        unit.position.set(xx, baseY, zz);

        /* Main housing — chamfered box, real proportions for a
         * 2-fan rooftop fluid cooler. */
        const housing = new THREE.Mesh(roundedBox(2.4, 1.25, 1.5, 0.08), chillerMat);
        housing.castShadow = true;
        housing.receiveShadow = true;
        unit.add(housing);

        /* Two axial fan wells set into the top */
        const fanRadius = 0.42;
        const fanInsetXs = [-0.55, 0.55];
        for (let k = 0; k < fanInsetXs.length; k++) {
          const fx = fanInsetXs[k];
          /* Recessed dark well */
          const well = new THREE.Mesh(
            new THREE.CylinderGeometry(fanRadius * 1.05, fanRadius * 1.05, 0.16, 24, 1, true),
            fanWellMat,
          );
          well.position.set(fx, 0.62 + 0.001, 0);
          unit.add(well);

          /* Aluminium grille ring (thin torus) */
          const grilleRing = new THREE.Mesh(
            new THREE.TorusGeometry(fanRadius * 1.02, 0.025, 6, 32),
            grilleMat,
          );
          grilleRing.rotation.x = Math.PI / 2;
          grilleRing.position.set(fx, 0.7, 0);
          unit.add(grilleRing);

          /* Cross-bar spokes giving the grille a fan-guard look */
          for (let s = 0; s < 4; s++) {
            const spoke = new THREE.Mesh(
              new THREE.BoxGeometry(fanRadius * 2.05, 0.012, 0.025),
              grilleMat,
            );
            spoke.rotation.y = (s * Math.PI) / 4;
            spoke.position.set(fx, 0.7, 0);
            unit.add(spoke);
          }

          /* Spinning blade rotor — 5 tapered blades, group-rotated
           * by the render loop animation so all units look alive. */
          const rotor = new THREE.Group();
          rotor.position.set(fx, 0.62, 0);
          const bladeShape = new THREE.Shape();
          bladeShape.moveTo(-0.04, 0);
          bladeShape.lineTo(0.04, 0);
          bladeShape.lineTo(0.02, fanRadius * 0.95);
          bladeShape.lineTo(-0.02, fanRadius * 0.95);
          bladeShape.lineTo(-0.04, 0);
          const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, { depth: 0.04, bevelEnabled: false });
          for (let b = 0; b < 5; b++) {
            const blade = new THREE.Mesh(bladeGeo, bladeMat);
            blade.rotation.y = Math.PI / 2; // lay flat on the fan plane
            blade.rotation.x = Math.PI / 2;
            blade.rotation.z = (b * 2 * Math.PI) / 5;
            rotor.add(blade);
          }
          /* Hub cap */
          const hub = new THREE.Mesh(
            new THREE.CylinderGeometry(0.06, 0.06, 0.04, 12),
            grilleMat,
          );
          hub.position.y = 0.02;
          rotor.add(hub);
          rotor.userData.kind = "chiller-fan";
          /* Stagger so all 12 fans don't spin in lockstep */
          rotor.userData.spinOffset = (i * 0.7 + k * 0.3) % (Math.PI * 2);
          chillerFanRotors.push(rotor);
          unit.add(rotor);
        }

        /* Side seam line — a thin dark slit suggesting the access
         * panel break. Tiny detail, big "real fabricated unit" tell. */
        const seam = new THREE.Mesh(
          new THREE.BoxGeometry(2.42, 0.012, 0.012),
          new THREE.MeshStandardMaterial({ color: 0x0a0d10, roughness: 0.9 }),
        );
        seam.position.set(0, 0.05, 0.755);
        unit.add(seam);

        /* Refrigerant-line connection studs on the back face — two
         * small cylinders hinting at supply/return. */
        for (let r = 0; r < 2; r++) {
          const stud = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.05, 0.18, 10),
            refrigerantMat,
          );
          stud.rotation.x = Math.PI / 2;
          stud.position.set(-0.4 + r * 0.8, -0.25, -0.85);
          unit.add(stud);
        }

        worldGroup.add(unit);
      }
    }

    /* ---------- OUTDOOR ENERGY YARD ---------- */
    /* Compose simple equipment based on power source mix percentages.
     * We place them in pads to the WEST of the building, similar to
     * what the SVG renderer draws but volumetric. */

    const yardX = -sw(bldg.w) * 0.5 - sw(120);
    const yardZ0 = -sw(bldg.h) * 0.42;
    const padHeight = 0.35;

    function addPad(x, z, w, d, color = 0x1a1f24) {
      const padMat = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05 });
      const pad = new THREE.Mesh(new THREE.BoxGeometry(w, padHeight, d), padMat);
      pad.position.set(x, padHeight / 2, z);
      pad.receiveShadow = true;
      worldGroup.add(pad);
    }

    /* Generators — Cat / Cummins-style enclosed diesel gensets.
     *
     * Each unit is now an assembled prefab matching the real silhouette
     * of an outdoor genset enclosure:
     *   - Main painted-steel sound-attenuated enclosure (chamfered box)
     *   - Radiator grille on the long end (vertical louvers)
     *   - Vertical stainless exhaust stack with rain cap
     *   - Side access door panel with handle
     *   - Front control-panel display (small mint-emissive LCD)
     *   - Galvanised skid base
     *
     * All gensets are oriented with radiators facing outward and
     * exhausts pointing skyward so they read at a glance.
     */
    if (powerMix.gas > 0) {
      addPad(yardX, yardZ0, 6, 6, 0x222a31);

      const enclosureMat = new THREE.MeshStandardMaterial({
        color: 0x6f5a2c,
        roughness: 0.55,
        metalness: 0.4,
        emissive: 0x1a1208, emissiveIntensity: 0.18,
        roughnessMap: proceduralNoiseTexture({ size: 64, scale: 5, seed: 11 }),
      });
      const louverMat = new THREE.MeshStandardMaterial({
        color: 0x1c1d1f, roughness: 0.9, metalness: 0.15,
      });
      const stackMat = new THREE.MeshStandardMaterial({
        color: 0xc0c4cc, roughness: 0.35, metalness: 0.85,
      });
      const skidMat = new THREE.MeshStandardMaterial({
        color: 0x363a40, roughness: 0.7, metalness: 0.4,
      });
      const handleMat = new THREE.MeshStandardMaterial({
        color: 0x2a2f35, roughness: 0.5, metalness: 0.7,
      });
      const lcdMat = new THREE.MeshStandardMaterial({
        color: 0x101e18, roughness: 0.3, metalness: 0,
        emissive: 0x33fbd3, emissiveIntensity: 0.7,
      });

      /* Genset count scales with the gas-power share — a 25% gas
       * mix gets the standard 2x N+1 redundancy line-up, 50% gets 3,
       * 75% gets 4, 100% gets 5. Reflects real DC power-block sizing. */
      const genCount = powerMix.gas >= 75 ? 5
                     : powerMix.gas >= 50 ? 4
                     : powerMix.gas >= 25 ? 3
                     : 2;
      const genGroup = new THREE.Group();
      for (let i = 0; i < genCount; i++) {
        const t = (i + 0.5) / genCount;
        const gz = yardZ0 - 2.2 + t * 4.4;

        const gen = new THREE.Group();
        gen.position.set(yardX, padHeight, gz);

        /* Skid base */
        const skid = new THREE.Mesh(roundedBox(2.3, 0.12, 1.0, 0.03), skidMat);
        skid.position.y = 0.06;
        skid.receiveShadow = true;
        gen.add(skid);

        /* Main sound-attenuated enclosure */
        const enclosure = new THREE.Mesh(roundedBox(2.2, 1.25, 0.9, 0.06), enclosureMat);
        enclosure.position.y = 0.12 + 1.25 / 2;
        enclosure.castShadow = true;
        enclosure.receiveShadow = true;
        gen.add(enclosure);

        /* Radiator grille on the +X end — vertical louvers cover the
         * front face. Implemented as a series of thin Box meshes. */
        const louverCount = 12;
        for (let l = 0; l < louverCount; l++) {
          const louver = new THREE.Mesh(
            new THREE.BoxGeometry(0.02, 1.0, 0.85),
            louverMat,
          );
          louver.position.set(
            1.115,
            0.12 + 1.25 / 2,
            -0.42 + (l / (louverCount - 1)) * 0.84,
          );
          gen.add(louver);
        }

        /* Side access door — slightly recessed rectangle with a handle */
        const door = new THREE.Mesh(
          roundedBox(1.0, 0.8, 0.02, 0.02),
          new THREE.MeshStandardMaterial({
            color: 0x5a4824, roughness: 0.6, metalness: 0.45,
          }),
        );
        door.position.set(0.1, 0.62, 0.461);
        gen.add(door);
        const handle = new THREE.Mesh(
          new THREE.BoxGeometry(0.06, 0.18, 0.05),
          handleMat,
        );
        handle.position.set(-0.32, 0.62, 0.49);
        gen.add(handle);

        /* Control-panel LCD beside the door */
        const lcd = new THREE.Mesh(
          new THREE.BoxGeometry(0.18, 0.12, 0.015),
          lcdMat,
        );
        lcd.position.set(0.62, 0.85, 0.466);
        gen.add(lcd);

        /* Vertical exhaust stack rising off the rear-top corner */
        const stackBase = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.09, 0.12, 12),
          stackMat,
        );
        stackBase.position.set(-0.85, 1.42, -0.32);
        gen.add(stackBase);
        const stack = new THREE.Mesh(
          new THREE.CylinderGeometry(0.07, 0.07, 0.95, 12),
          stackMat,
        );
        stack.position.set(-0.85, 1.95, -0.32);
        stack.castShadow = true;
        gen.add(stack);
        /* Rain cap — flat disc tilted downward */
        const cap = new THREE.Mesh(
          new THREE.CylinderGeometry(0.11, 0.11, 0.02, 14),
          stackMat,
        );
        cap.position.set(-0.85, 2.46, -0.27);
        cap.rotation.x = 0.2;
        gen.add(cap);

        genGroup.add(gen);
      }
      worldGroup.add(genGroup);

      labelTargets.push({
        x: yardX, y: 2.6, z: yardZ0,
        title: "GENERATORS",
        sub: `${Math.round(powerMix.gas)}% gas backup`,
        kind: "energy",
      });
    }

    /* Battery (BESS) / UPS cabinets — visualisation varies by the
     * UPS chemistry the user has explicitly selected:
     *
     *   vrla     → Legacy lead-acid line-up (deeper grey, stout
     *              cabinets, no LED accent). Lower density.
     *   liion    → Tesla Megapack-style enclosed lithium containers
     *              (tall ribbed shell, mint status LED bar).
     *   supercap → Compact supercapacitor banks adjacent to a
     *              smaller BESS support row (cyan accent, vent
     *              louvers + capacitor bus rails).
     *
     * Phase gating: NOTHING appears until the user explicitly picks
     * a UPS type in Phase 2. Until then no battery line-up is shown
     * — accurately reflects "no UPS = no UPS". The cabinet count
     * scales with the size of the non-firm power share so a 100%
     * gas/solar/wind facility shows a wider line-up than a 100% grid-
     * tied facility. */
    const nonFirmPct = (powerMix.gas || 0) + (powerMix.solar || 0)
                     + (powerMix.wind || 0) + (powerMix.smr || 0);
    const bessCount = nonFirmPct >= 60 ? 4
                    : nonFirmPct >= 30 ? 3
                    : 2;
    if (upsType) {
      const bx = yardX + 9;
      const bz = yardZ0;
      addPad(bx, bz, 5, 5, 0x1a2530);

      /* UPS palette varies with chemistry. Lead-acid is dirty grey
       * (no LEDs); Li-ion is mint-blue with status LED; supercap is
       * cyan with prominent vent louvers. */
      const upsPal = upsType === "vrla"
        ? { shell: 0x40474f, rib: 0x2a2f35, led: null, accent: 0x6e757e }
        : upsType === "supercap"
        ? { shell: 0x1d4a5d, rib: 0x123544, led: 0x66f4ff, accent: 0x66f4ff }
        : /* liion default */
          { shell: 0x2c4d68, rib: 0x223e54, led: 0x6dd6ff, accent: 0x6dd6ff };

      const bessShellMat = new THREE.MeshStandardMaterial({
        color: upsPal.shell,
        roughness: 0.5,
        metalness: 0.55,
        emissive: 0x081822, emissiveIntensity: 0.22,
        roughnessMap: proceduralNoiseTexture({ size: 64, scale: 5, seed: 19 }),
      });
      const ribMat = new THREE.MeshStandardMaterial({
        color: upsPal.rib, roughness: 0.65, metalness: 0.5,
      });
      const ventMat = new THREE.MeshStandardMaterial({
        color: 0x101418, roughness: 0.85, metalness: 0.2,
      });
      const ledMat = upsPal.led ? new THREE.MeshStandardMaterial({
        color: upsPal.led, roughness: 0.3, metalness: 0,
        emissive: upsPal.led, emissiveIntensity: 1.6,
      }) : null;
      const conduitMat = new THREE.MeshStandardMaterial({
        color: 0x1d242b, roughness: 0.7, metalness: 0.4,
      });
      const handleMat = new THREE.MeshStandardMaterial({
        color: 0x252a30, roughness: 0.5, metalness: 0.7,
      });

      const bessGroup = new THREE.Group();
      /* Place cabinets centred around `bx` with 1.5m spacing so
       * a 2-cabinet row centres on bx, a 3-cab row spans ±1.5m,
       * a 4-cab row spans ±2.25m. */
      const startX = bx - ((bessCount - 1) * 1.5) / 2;
      for (let i = 0; i < bessCount; i++) {
        const cab = new THREE.Group();
        cab.position.set(startX + i * 1.5, padHeight, bz);

        /* Main shell */
        const shell = new THREE.Mesh(roundedBox(1.4, 1.2, 1.4, 0.06), bessShellMat);
        shell.position.y = 0.6;
        shell.castShadow = true;
        shell.receiveShadow = true;
        cab.add(shell);

        /* Vertical sheet-metal ribs on side faces */
        const ribCount = 6;
        for (let r = 0; r < ribCount; r++) {
          const rib = new THREE.Mesh(
            new THREE.BoxGeometry(0.012, 1.0, 0.04),
            ribMat,
          );
          rib.position.set(0.71, 0.6, -0.55 + (r / (ribCount - 1)) * 1.1);
          cab.add(rib);
          const ribL = new THREE.Mesh(
            new THREE.BoxGeometry(0.012, 1.0, 0.04),
            ribMat,
          );
          ribL.position.set(-0.71, 0.6, -0.55 + (r / (ribCount - 1)) * 1.1);
          cab.add(ribL);
        }

        /* Front door panel (recessed) */
        const door = new THREE.Mesh(
          roundedBox(1.1, 0.95, 0.02, 0.03),
          ribMat,
        );
        door.position.set(0, 0.6, 0.711);
        cab.add(door);
        /* Door handle */
        const handle = new THREE.Mesh(
          new THREE.BoxGeometry(0.05, 0.18, 0.04),
          handleMat,
        );
        handle.position.set(0.42, 0.6, 0.74);
        cab.add(handle);

        /* Status LED strip across the door — only for chemistries
         * that have BMS visualisation (li-ion, supercap). VRLA
         * cabinets get a plain unmarked door. */
        if (ledMat) {
          const led = new THREE.Mesh(
            new THREE.BoxGeometry(0.85, 0.025, 0.012),
            ledMat,
          );
          led.position.set(0, 0.95, 0.722);
          cab.add(led);
        }

        /* Top ventilation grille — series of slim slots */
        const ventCount = 7;
        for (let v = 0; v < ventCount; v++) {
          const vent = new THREE.Mesh(
            new THREE.BoxGeometry(1.05, 0.025, 0.05),
            ventMat,
          );
          vent.position.set(0, 1.215, -0.4 + (v / (ventCount - 1)) * 0.8);
          cab.add(vent);
        }

        bessGroup.add(cab);
      }

      /* Top-running bus-bar conduit linking all cabinets */
      const conduitW = (bessCount - 1) * 1.5 + 1.5;
      const conduit = new THREE.Mesh(
        new THREE.BoxGeometry(conduitW, 0.12, 0.18),
        conduitMat,
      );
      conduit.position.set(bx, padHeight + 1.32, bz - 0.6);
      conduit.castShadow = true;
      bessGroup.add(conduit);

      worldGroup.add(bessGroup);

      labelTargets.push({
        x: bx, y: 2.4, z: bz,
        title: "BATTERY (UPS)",
        sub: "BESS · ride-through",
        kind: "energy",
      });
    }

    /* Solar PV array — utility-scale ground-mount with proper detail
     *
     * Each row is built as a real PV array assembly:
     *   - Tilted backsheet panel (deep blue, faintly metallic)
     *   - Aluminium frame border around each module
     *   - 6×10 cell grid lines etched into the surface
     *   - Steel torque tube + post pile foundation
     *   - Slight roughness variation to read as dust
     */
    if (powerMix.solar > 0) {
      const px = yardX - sw(160);
      const pz = yardZ0 + sw(60);

      const cellMat = new THREE.MeshStandardMaterial({
        color: 0x0e2748,
        roughness: 0.18,
        metalness: 0.65,
        emissive: 0x0a1622, emissiveIntensity: 0.42,
        roughnessMap: proceduralNoiseTexture({ size: 64, scale: 8, seed: 41 }),
      });
      const frameMat = new THREE.MeshStandardMaterial({
        color: 0xc0c8d0, roughness: 0.4, metalness: 0.85,
      });
      const cellLineMat = new THREE.MeshStandardMaterial({
        color: 0x06101a, roughness: 0.95, metalness: 0,
      });
      const postMat = new THREE.MeshStandardMaterial({
        color: 0x4d525a, roughness: 0.6, metalness: 0.5,
      });
      const torqueMat = new THREE.MeshStandardMaterial({
        color: 0x383b40, roughness: 0.55, metalness: 0.6,
      });

      const rowCount = Math.max(2, Math.round(powerMix.solar / 25) + 2);
      const tilt = -0.5;
      for (let row = 0; row < rowCount; row++) {
        const rowGroup = new THREE.Group();
        rowGroup.position.set(px, 1.0, pz - 4 + row * 2.4);
        rowGroup.rotation.x = tilt;

        /* Active cell layer (the dark blue PV face) */
        const panel = new THREE.Mesh(
          new THREE.BoxGeometry(8, 0.04, 1.6),
          cellMat,
        );
        panel.castShadow = true;
        panel.receiveShadow = true;
        rowGroup.add(panel);

        /* Aluminium frame border (4 thin bars) */
        const frameLong = new THREE.BoxGeometry(8.05, 0.06, 0.08);
        const frameShort = new THREE.BoxGeometry(0.08, 0.06, 1.65);
        const fl1 = new THREE.Mesh(frameLong, frameMat);
        fl1.position.set(0, 0.005, 0.81);
        rowGroup.add(fl1);
        const fl2 = new THREE.Mesh(frameLong, frameMat);
        fl2.position.set(0, 0.005, -0.81);
        rowGroup.add(fl2);
        const fs1 = new THREE.Mesh(frameShort, frameMat);
        fs1.position.set(4.0, 0.005, 0);
        rowGroup.add(fs1);
        const fs2 = new THREE.Mesh(frameShort, frameMat);
        fs2.position.set(-4.0, 0.005, 0);
        rowGroup.add(fs2);

        /* Cell grid lines — 9 vertical + 5 horizontal sub-divisions
         * giving the impression of a 10×6 cell mosaic. Implemented as
         * thin black bars sitting just above the panel surface. */
        for (let v = 1; v < 10; v++) {
          const line = new THREE.Mesh(
            new THREE.BoxGeometry(0.012, 0.005, 1.55),
            cellLineMat,
          );
          line.position.set(-4 + v * 0.8, 0.022, 0);
          rowGroup.add(line);
        }
        for (let h = 1; h < 6; h++) {
          const line = new THREE.Mesh(
            new THREE.BoxGeometry(7.95, 0.005, 0.012),
            cellLineMat,
          );
          line.position.set(0, 0.022, -0.8 + h * 0.27);
          rowGroup.add(line);
        }

        worldGroup.add(rowGroup);

        /* Torque tube running along the back of the row + ground
         * posts every 2m. (These don't tilt with the panel.) */
        const torque = new THREE.Mesh(
          new THREE.CylinderGeometry(0.06, 0.06, 8, 8),
          torqueMat,
        );
        torque.rotation.z = Math.PI / 2;
        torque.position.set(px, 0.85, pz - 4 + row * 2.4);
        worldGroup.add(torque);

        for (let p = 0; p < 5; p++) {
          const post = new THREE.Mesh(
            new THREE.BoxGeometry(0.1, 0.85, 0.12),
            postMat,
          );
          post.position.set(px - 3.6 + p * 1.8, 0.425, pz - 4 + row * 2.4);
          post.castShadow = true;
          worldGroup.add(post);
        }
      }
      labelTargets.push({
        x: px, y: 2.0, z: pz,
        title: "SOLAR PV",
        sub: `${Math.round(powerMix.solar)}% renewable`,
        kind: "energy",
      });
    }

    /* Wind turbine marker — placement is location-aware. Urban
     * campuses can't have a turbine in the middle of city blocks,
     * so we render the turbine FAR off-parcel toward the upper-left
     * and run a sky-blue uplink line from the substation to it.
     * Rural / repurposed / campus keep the turbine close-by. */
    if (powerMix.wind > 0) {
      let wx, wz, turbineH = 8.0;
      if (locationType === "urban") {
        wx = yardX - sw(280);
        wz = yardZ0 - sw(220);
        turbineH = 12.0; // taller — these are mid-distance utility-scale towers
      } else if (locationType === "campus") {
        wx = yardX - sw(180);
        wz = yardZ0 - sw(120);
        turbineH = 10.0;
      } else {
        wx = yardX - sw(120);
        wz = yardZ0 - sw(80);
      }
      const towerMat = new THREE.MeshStandardMaterial({ color: 0xc8d3e0, roughness: 0.5, metalness: 0.6 });
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, turbineH, 12), towerMat);
      tower.position.set(wx, turbineH / 2, wz);
      tower.castShadow = true;
      worldGroup.add(tower);
      const hub = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 12), towerMat);
      hub.position.set(wx, turbineH, wz);
      worldGroup.add(hub);
      /* Three blades, 120° apart, attached to a rotor Group so we can
       * spin all three together via a single rotation in the render
       * loop. The Group sits in front of the hub (slight Z offset) so
       * blades appear to clear the tower. */
      const turbineRotor = new THREE.Group();
      turbineRotor.position.set(wx, turbineH, wz + 0.4);
      turbineRotor.userData.kind = "wind-rotor";
      for (let b = 0; b < 3; b++) {
        const bladeShape = new THREE.Shape();
        /* Tapered blade — wider at the root, narrower at the tip,
         * matches a real wind turbine silhouette far better than a
         * uniform box. */
        const bladeLen = turbineH * 0.55;
        bladeShape.moveTo(-0.08, 0);
        bladeShape.lineTo(0.08, 0);
        bladeShape.lineTo(0.04, bladeLen);
        bladeShape.lineTo(-0.04, bladeLen);
        bladeShape.lineTo(-0.08, 0);
        const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, { depth: 0.12, bevelEnabled: false });
        bladeGeo.translate(0, 0, -0.06);
        const blade = new THREE.Mesh(bladeGeo, towerMat);
        blade.rotation.z = (b * 2 * Math.PI) / 3;
        blade.castShadow = true;
        turbineRotor.add(blade);
      }
      worldGroup.add(turbineRotor);
      /* PPA uplink line from the substation to the turbine, suggesting
       * a utility-grid tie-in even though the turbine sits far away. */
      if (plan.rooms.switchgear) {
        const [tx, , tz] = svgToWorld(
          plan.rooms.switchgear.x + plan.rooms.switchgear.w / 2,
          plan.rooms.switchgear.y + plan.rooms.switchgear.h / 2
        );
        const ppaMat = new THREE.LineBasicMaterial({
          color: 0xc8d3e0, transparent: true, opacity: 0.4,
        });
        const ppaGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(tx, 0.4, tz),
          new THREE.Vector3(wx, turbineH * 0.6, wz),
        ]);
        worldGroup.add(new THREE.Line(ppaGeo, ppaMat));
      }
      labelTargets.push({
        x: wx, y: turbineH + 1.5, z: wz,
        title: "WIND PPA",
        sub: `${Math.round(powerMix.wind)}% wind contract`,
        kind: "energy",
        radius: 4,
      });
    }

    /* SMR — Small Modular Reactor. Realistic containment-vessel
     * assembly inspired by NuScale / GE BWRX-300 visuals:
     *   - Concrete reactor pad
     *   - Cylindrical containment vessel with domed top
     *   - Two cylindrical heat-exchanger modules flanking the
     *     containment (the "heat island")
     *   - Cooling tower (hyperbolic profile via tapered cylinder)
     *   - Radiation-warning placards (yellow + black hazard)
     *   - Service walkway between modules
     *
     * Module count scales with smr percentage (1 module per 25%). */
    if (powerMix.smr > 0) {
      const sx2 = yardX - sw(60);
      const sz2 = yardZ0 + sw(140);
      const moduleCount = Math.max(1, Math.ceil(powerMix.smr / 25));
      addPad(sx2, sz2, 6 + moduleCount * 1.2, 6, 0x747a82);

      const containmentMat = new THREE.MeshStandardMaterial({
        color: 0xc4cad2, roughness: 0.45, metalness: 0.7,
        emissive: 0x0a2014, emissiveIntensity: 0.18,
        roughnessMap: proceduralNoiseTexture({ size: 64, scale: 4, seed: 151 }),
      });
      const heatExchangerMat = new THREE.MeshStandardMaterial({
        color: 0x4a5560, roughness: 0.5, metalness: 0.65,
      });
      const towerMat = new THREE.MeshStandardMaterial({
        color: 0xdde2e8, roughness: 0.6, metalness: 0.25,
        emissive: 0x141a1c, emissiveIntensity: 0.05,
      });
      const placardMat = new THREE.MeshStandardMaterial({
        color: 0xffd23a, roughness: 0.5, metalness: 0,
        emissive: 0xffd23a, emissiveIntensity: 0.5,
      });
      const walkwayMat = new THREE.MeshStandardMaterial({
        color: 0x4a525c, roughness: 0.65, metalness: 0.5,
      });

      const smrGroup = new THREE.Group();

      for (let m = 0; m < moduleCount; m++) {
        const mxOff = (m - (moduleCount - 1) / 2) * 2.2;

        /* Containment vessel — main cylinder */
        const containment = new THREE.Mesh(
          new THREE.CylinderGeometry(0.85, 0.85, 2.6, 24),
          containmentMat,
        );
        containment.position.set(sx2 + mxOff, padHeight + 1.3, sz2);
        containment.castShadow = true;
        containment.receiveShadow = true;
        smrGroup.add(containment);

        /* Domed top cap — half-sphere matching the cylinder radius */
        const dome = new THREE.Mesh(
          new THREE.SphereGeometry(0.85, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2),
          containmentMat,
        );
        dome.position.set(sx2 + mxOff, padHeight + 2.6, sz2);
        dome.castShadow = true;
        smrGroup.add(dome);

        /* Pressure-vessel banding rings */
        for (let r = 0; r < 3; r++) {
          const band = new THREE.Mesh(
            new THREE.TorusGeometry(0.87, 0.04, 6, 24),
            heatExchangerMat,
          );
          band.rotation.x = Math.PI / 2;
          band.position.set(sx2 + mxOff, padHeight + 0.5 + r * 0.85, sz2);
          smrGroup.add(band);
        }

        /* Heat-exchanger modules flanking the containment — slim
         * cylinders representing the steam generator + condenser. */
        for (const dx of [-1.1, 1.1]) {
          const hx = new THREE.Mesh(
            new THREE.CylinderGeometry(0.22, 0.22, 1.8, 14),
            heatExchangerMat,
          );
          hx.position.set(sx2 + mxOff + dx * 0.25, padHeight + 0.9, sz2 + dx * 0.4);
          hx.castShadow = true;
          smrGroup.add(hx);
        }

        /* Radiation-warning placard on the front */
        const placard = new THREE.Mesh(
          new THREE.BoxGeometry(0.3, 0.3, 0.02),
          placardMat,
        );
        placard.position.set(sx2 + mxOff, padHeight + 1.0, sz2 + 0.86);
        smrGroup.add(placard);
      }

      /* Hyperbolic cooling tower behind the SMR pad — every nuclear
       * plant has one. Implemented as a tapered cylinder with an
       * indented waist. */
      const towerY = padHeight + 1.8;
      const towerH = 4.0;
      const tower = new THREE.Mesh(
        new THREE.CylinderGeometry(0.85, 1.4, towerH, 22, 4),
        towerMat,
      );
      tower.position.set(sx2 + (moduleCount * 1.2), towerY, sz2 - 1.6);
      tower.castShadow = true;
      smrGroup.add(tower);

      /* Wisp of "steam" plume on top — Sprite with cloud puff
       * texture so it always faces camera */
      const steam = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: cloudPuffTexCore,
          transparent: true,
          opacity: 0.7,
          depthWrite: false,
        }),
      );
      steam.scale.set(2.4, 2.4, 1);
      steam.position.set(sx2 + (moduleCount * 1.2), towerY + towerH * 0.6 + 0.5, sz2 - 1.6);
      smrGroup.add(steam);

      /* Service walkway — narrow grated platform connecting modules */
      const walkway = new THREE.Mesh(
        new THREE.BoxGeometry((moduleCount - 1) * 2.2 + 0.2, 0.08, 0.6),
        walkwayMat,
      );
      walkway.position.set(sx2, padHeight + 0.18, sz2 + 1.1);
      smrGroup.add(walkway);

      worldGroup.add(smrGroup);

      labelTargets.push({
        x: sx2, y: 3.4, z: sz2,
        title: "SMR REACTOR",
        sub: `${Math.round(powerMix.smr)}% nuclear (${moduleCount} module${moduleCount > 1 ? "s" : ""})`,
        kind: "energy",
      });
    }

    /* Fuel farm — saddle-mounted horizontal diesel tanks
     *
     * Real DC fuel farms are usually horizontal cylindrical tanks
     * mounted on concrete saddles inside a containment dyke. Each tank:
     *   - Painted-steel cylinder (chamfered ends would need a Lathe;
     *     keeping CylinderGeometry but with cap detail)
     *   - Steel saddle bands at quarter-points
     *   - Top-mounted vent stack and gauge cluster
     *   - Climbing ladder along one side
     *   - Containment dyke wall around the perimeter
     */
    if (powerMix.gas > 0) {
      const fx = yardX + sw(20);
      const fz = yardZ0 + sw(80);
      addPad(fx, fz, 4, 4, 0x2a2218);

      const tankMat = new THREE.MeshStandardMaterial({
        color: 0x9d6f2f, // safety-orange diesel-tank colour
        roughness: 0.55, metalness: 0.55,
        roughnessMap: proceduralNoiseTexture({ size: 64, scale: 4, seed: 31 }),
      });
      const saddleMat = new THREE.MeshStandardMaterial({
        color: 0x2a2f33, roughness: 0.6, metalness: 0.5,
      });
      const ventMat = new THREE.MeshStandardMaterial({
        color: 0xb6bdc4, roughness: 0.4, metalness: 0.85,
      });
      const ladderMat = new THREE.MeshStandardMaterial({
        color: 0x484c52, roughness: 0.5, metalness: 0.6,
      });
      const dykeMat = new THREE.MeshStandardMaterial({
        color: 0x6e7178, roughness: 0.95, metalness: 0,
      });

      /* Containment dyke — low retaining wall around the pad */
      const dyke = new THREE.Group();
      const dykeH = 0.35;
      const dykeT = 0.08;
      const dykeW = 4.2;
      const dykeD = 2.6;
      const sides = [
        { w: dykeW, d: dykeT, x: 0, z: -dykeD / 2 },
        { w: dykeW, d: dykeT, x: 0, z: dykeD / 2 },
        { w: dykeT, d: dykeD, x: -dykeW / 2, z: 0 },
        { w: dykeT, d: dykeD, x: dykeW / 2, z: 0 },
      ];
      for (const s of sides) {
        const wall = new THREE.Mesh(
          new THREE.BoxGeometry(s.w, dykeH, s.d),
          dykeMat,
        );
        wall.position.set(fx + s.x, padHeight + dykeH / 2, fz + s.z);
        wall.receiveShadow = true;
        dyke.add(wall);
      }
      worldGroup.add(dyke);

      /* Two horizontal tanks on saddles */
      for (let i = 0; i < 2; i++) {
        const tx = fx - 0.9 + i * 1.8;
        const ty = padHeight + 0.85;

        const tank = new THREE.Mesh(
          new THREE.CylinderGeometry(0.55, 0.55, 1.7, 24),
          tankMat,
        );
        tank.rotation.z = Math.PI / 2;
        tank.position.set(tx, ty, fz);
        tank.castShadow = true;
        worldGroup.add(tank);

        /* Steel saddle bands */
        for (let s = 0; s < 2; s++) {
          const band = new THREE.Mesh(
            new THREE.TorusGeometry(0.57, 0.04, 8, 16),
            saddleMat,
          );
          band.rotation.y = Math.PI / 2;
          band.position.set(tx - 0.5 + s * 1.0, ty, fz);
          worldGroup.add(band);
          /* Saddle leg */
          const leg = new THREE.Mesh(
            new THREE.BoxGeometry(0.12, 0.45, 0.4),
            saddleMat,
          );
          leg.position.set(tx - 0.5 + s * 1.0, padHeight + 0.225, fz);
          worldGroup.add(leg);
        }

        /* Top vent stack */
        const vent = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04, 0.04, 0.45, 10),
          ventMat,
        );
        vent.position.set(tx, ty + 0.75, fz);
        worldGroup.add(vent);
        const ventCap = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.08, 0.04, 10),
          ventMat,
        );
        ventCap.position.set(tx, ty + 1.0, fz);
        worldGroup.add(ventCap);

        /* Gauge cluster */
        const gauge = new THREE.Mesh(
          new THREE.BoxGeometry(0.18, 0.12, 0.08),
          saddleMat,
        );
        gauge.position.set(tx, ty + 0.62, fz + 0.45);
        worldGroup.add(gauge);

        /* Climbing ladder rail (one side) */
        const ladderRails = new THREE.Mesh(
          new THREE.BoxGeometry(0.025, 0.02, 0.95),
          ladderMat,
        );
        ladderRails.position.set(tx, ty + 0.55, fz - 0.6);
        worldGroup.add(ladderRails);
        for (let r = 0; r < 4; r++) {
          const rung = new THREE.Mesh(
            new THREE.BoxGeometry(0.18, 0.02, 0.025),
            ladderMat,
          );
          rung.position.set(tx, ty + 0.2 + r * 0.18, fz - 0.6);
          worldGroup.add(rung);
        }
      }

      labelTargets.push({
        x: fx, y: 2.4, z: fz,
        title: "FUEL FARM",
        sub: "Diesel · backup",
        kind: "energy",
      });
    }

    /* Compass + label for the building */
    const compass = new THREE.Group();
    const compassPole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 1.4, 6),
      new THREE.MeshBasicMaterial({ color: 0x4f9080 })
    );
    compassPole.position.y = 0.7;
    compass.add(compassPole);
    const compassN = new THREE.Mesh(
      new THREE.ConeGeometry(0.22, 0.5, 6),
      new THREE.MeshBasicMaterial({ color: 0x33fbd3 })
    );
    compassN.position.y = 1.7;
    compass.add(compassN);
    compass.position.set(-sw(bldg.w) / 2 - 1.5, 0, -sw(bldg.h) / 2 - 1.5);
    worldGroup.add(compass);

    /* ---------- Hover-only label system (raycasting) ----------
     *
     * No always-on pins anywhere in the scene. The user sees a clean
     * 3D model. When they hover OVER an actual piece of equipment,
     * a label card pops up at their cursor.
     *
     * Implementation: for every entry in `labelTargets`, we create
     * an INVISIBLE hover-zone Box mesh centred on the equipment.
     * The zones are sized generously (~3-6 world units) so users
     * don't need pixel-perfect aim. A Raycaster hit-tests the cursor
     * against these zones each frame and the topmost hit's label
     * is rendered as a single floating card following the cursor.
     */
    const hoverLayer = document.createElement("div");
    hoverLayer.className = "forge-3d-hover-layer";
    container.appendChild(hoverLayer);

    /* Single floating card — moved to follow the cursor when a hit is
     * resolved. One DOM node beats 12 always-mounted elements + their
     * per-frame projections. */
    const hoverCard = document.createElement("div");
    hoverCard.className = "forge-3d-hover-card forge-3d-hover-hidden";
    hoverCard.innerHTML = `
      <div class="forge-3d-hover-title"></div>
      <div class="forge-3d-hover-sub"></div>
    `;
    hoverLayer.appendChild(hoverCard);
    const hoverTitle = hoverCard.querySelector(".forge-3d-hover-title");
    const hoverSub = hoverCard.querySelector(".forge-3d-hover-sub");

    /* Build invisible hover-zone boxes — one per labelTarget, centred
     * at its world position, sized by zone radius (defaults to 3 but
     * label authors can pass a `radius` to widen tricky targets). */
    const hoverZones = [];
    labelTargets.forEach((tgt) => {
      const radius = tgt.radius || 3.2;
      const heightR = tgt.heightRadius || radius;
      const geo = new THREE.BoxGeometry(radius * 2, heightR * 2, radius * 2);
      const mat = new THREE.MeshBasicMaterial({
        transparent: true, opacity: 0, depthWrite: false,
      });
      const zone = new THREE.Mesh(geo, mat);
      zone.position.set(tgt.x, tgt.y, tgt.z);
      zone.userData.forgeLabel = { title: tgt.title, sub: tgt.sub, kind: tgt.kind };
      worldGroup.add(zone);
      hoverZones.push(zone);
    });
    /* Also include any meshes that explicitly registered themselves
     * via registerHoverable (they get hit-tested directly, no zone). */
    hoverables.forEach((m) => hoverZones.push(m));

    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let hoverHidden = true;
    let cursorClient = { x: -9999, y: -9999, inside: false };

    function onPointerMove(e) {
      const r = renderer.domElement.getBoundingClientRect();
      cursorClient.x = e.clientX - r.left;
      cursorClient.y = e.clientY - r.top;
      cursorClient.inside = true;
      ndc.x = (cursorClient.x / r.width) * 2 - 1;
      ndc.y = -(cursorClient.y / r.height) * 2 + 1;
    }
    function onPointerLeave() {
      cursorClient.inside = false;
    }
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerleave", onPointerLeave);

    function updateHoverCard() {
      if (!cursorClient.inside) {
        if (!hoverHidden) {
          hoverCard.classList.add("forge-3d-hover-hidden");
          hoverHidden = true;
        }
        return;
      }
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(hoverZones, false);
      const hit = hits.length ? hits[0] : null;
      if (!hit || !hit.object.userData.forgeLabel) {
        if (!hoverHidden) {
          hoverCard.classList.add("forge-3d-hover-hidden");
          hoverHidden = true;
        }
        return;
      }
      const label = hit.object.userData.forgeLabel;
      hoverTitle.textContent = label.title || "";
      hoverSub.textContent = label.sub || "";
      hoverCard.dataset.kind = label.kind || "compute";
      /* Position the card just below+right of the cursor */
      hoverCard.style.transform = `translate(${(cursorClient.x + 14).toFixed(0)}px, ${(cursorClient.y + 14).toFixed(0)}px)`;
      if (hoverHidden) {
        hoverCard.classList.remove("forge-3d-hover-hidden");
        hoverHidden = false;
      }
    }

    function escapeHtml(s) {
      return String(s == null ? "" : s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }

    /* ---------- Orbit controls ---------- */
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    /* Target at y=12 (mid-building height) instead of y=1 (ground)
     * so the camera tilts less steeply downward — leaves the upper
     * half of the frame for sky / sun / clouds. */
    controls.target.set(0, 12, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 12;
    controls.maxDistance = 280;
    controls.maxPolarAngle = Math.PI * 0.495; // never look up from below
    controls.update();

    /* ---------- Resize handling ---------- */
    function handleResize() {
      const w = container.clientWidth || width;
      const h = container.clientHeight || height;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    const ro = new ResizeObserver(handleResize);
    ro.observe(container);

    /* ---------- Render loop with auto-pause ---------- */
    let raf = null;
    let running = true;
    let t0 = performance.now();
    const tmpVec = new THREE.Vector3();
    /* Cache the DCIM scan plane + radial scan ring + wind rotor +
     * tree groups once (if they exist) so the per-frame loop doesn't
     * traverse the scene each frame. */
    let scanPlane = null;
    let scanRing = null;
    let windRotor = null;
    const trees = [];
    worldGroup.traverse((obj) => {
      if (!obj.userData) return;
      if (obj.userData.kind === "dcim-scan") scanPlane = obj;
      else if (obj.userData.kind === "dcim-scan-ring") scanRing = obj;
      else if (obj.userData.kind === "wind-rotor") windRotor = obj;
      else if (obj.userData.kind === "tree") trees.push(obj);
    });
    /* Constants for the radial scan: full sweep every SCAN_PERIOD
     * seconds; the ring expands from r=0.6 to r=maxRadius and fades
     * opacity from 0.85 → 0 across the period. */
    const SCAN_PERIOD = 6.0;

    function tick(t) {
      if (!running) return;
      const dt = (t - t0) / 1000;
      /* Rim-light pulse intensity ramps with phase so an early-stage
       * facility feels quieter than a fully-online Phase 8 build. */
      const phaseGlow = fullyOnline ? 1.0 : (phase / 8) * 0.55;
      rim.intensity = (1.0 + phaseGlow) + Math.sin(dt * 1.2) * 0.45;
      /* Phase 7 telemetry scan — two animations running in parallel:
       *   1. Pulse the constant glow plane sinusoidally (existing).
       *   2. Drive the radial scan ring: every SCAN_PERIOD seconds it
       *      starts at r=0.6, expands to maxRadius, and fades opacity
       *      0.85 → 0. The ring reads as a NOC's heartbeat. */
      if (scanPlane) {
        scanPlane.material.opacity = 0.06 + (Math.sin(dt * 1.6) * 0.5 + 0.5) * 0.10;
      }
      if (scanRing) {
        const phaseT = (dt % SCAN_PERIOD) / SCAN_PERIOD;
        const maxR = scanRing.userData.maxRadius || 18;
        const r = 0.6 + (maxR - 0.6) * phaseT;
        /* Ring geometry doesn't easily resize; instead scale the mesh. */
        scanRing.scale.setScalar(r / 0.6);
        scanRing.material.opacity = 0.85 * (1 - phaseT);
      }

      /* Spinning wind turbine — 0.6 rad/s ≈ 1 revolution per ~10s,
       * matching the cinematic "slow majestic spin" wind farms get
       * filmed at. */
      if (windRotor) {
        windRotor.rotation.z = dt * 0.6;
      }

      /* Rooftop chiller fans — each rotor spins about its local Y
       * axis at ~3.5 rad/s (real axial fluid-cooler fan speed at
       * cruise) with a per-rotor offset so all units don't lockstep.
       * Cheap loop; chillerFanRotors caps at 12 even on 6-fan units. */
      for (let i = 0; i < chillerFanRotors.length; i++) {
        const r = chillerFanRotors[i];
        r.rotation.y = dt * 3.5 + (r.userData.spinOffset || 0);
      }

      /* Tree wind sway — cheap sinusoidal Z + X tilt per tree with
       * a per-tree phase + amplitude so the canopy reads as a
       * gentle breeze, not a synchronised wave. ~50-60 trees max
       * per scene; loop is microseconds. */
      for (let i = 0; i < trees.length; i++) {
        const t = trees[i];
        const ud = t.userData;
        const phase = ud.swayPhase || 0;
        const amp = ud.swayAmp || 0.018;
        t.rotation.z = Math.sin(dt * 0.7 + phase) * amp;
        t.rotation.x = Math.sin(dt * 0.55 + phase * 1.3) * amp * 0.6;
      }

      /* Clouds drift along circular orbits around the scene's Y
       * axis — each at its own radius / altitude / angular speed.
       * The SIMPLY SILICON teaser cloud also yaws to face the
       * camera so its letterforms always read forward, not
       * mirrored when the camera orbits past it. */
      for (let i = 0; i < clouds.length; i++) {
        const cloud = clouds[i];
        const ud = cloud.userData;
        ud.angle += ud.speed * 0.016; // ~16ms frame → 0.016 of speed
        cloud.position.x = Math.cos(ud.angle) * ud.radius;
        cloud.position.z = Math.sin(ud.angle) * ud.radius;
        cloud.position.y = ud.altitude + Math.sin(dt * 0.4 + i) * 0.6;
        if (ud.teaser) {
          /* Yaw the teaser group around its own Y axis so the
           * letterforms face whichever direction the camera is in.
           * `Math.atan2` gives the angle from the cloud to the
           * camera in the XZ plane; we yaw to that angle so the
           * text is always readable forward. */
          const dx = camera.position.x - cloud.position.x;
          const dz = camera.position.z - cloud.position.z;
          cloud.rotation.y = Math.atan2(dx, dz);
        }
      }

      /* Sun bobs ±2 world-units on Y at 0.15 Hz. The Sprite glow
       * + cast point light track the core so they always stay
       * pinned to it. Sprite opacity breathes for a haze-shimmer. */
      const sunY = 130 + Math.sin(dt * 0.15) * 2.0;
      sun.position.y = sunY;
      sunGlowSprite.position.copy(sun.position);
      sunLight.position.copy(sun.position);
      sunGlowSprite.material.opacity = 0.5 + Math.sin(dt * 0.4) * 0.05;
      controls.update();
      renderer.render(scene, camera);

      /* Pure raycasting hover — no on-screen label projection. The
       * single floating card follows the cursor when an invisible
       * hover-zone is hit. */
      updateHoverCard();

      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    function onVisibility() {
      running = !document.hidden;
      if (running && !raf) {
        t0 = performance.now();
        raf = requestAnimationFrame(tick);
      } else if (!running && raf) {
        cancelAnimationFrame(raf);
        raf = null;
      }
    }
    document.addEventListener("visibilitychange", onVisibility);

    /* ---------- Dispose handle ---------- */
    function dispose() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerleave", onPointerLeave);
      ro.disconnect();
      controls.dispose();
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      if (hoverLayer.parentNode) hoverLayer.parentNode.removeChild(hoverLayer);
    }

    return {
      dispose,
      camera,
      controls,
      recenter() {
        /* Reset to the default building-anchored framing — never
         * the sun's position. The OrbitControls.target is always
         * the data-centre, even after the camera orbits. */
        camera.position.set(52, 38, 52);
        controls.target.set(0, 12, 0);
        controls.update();
      },
    };
  }

  root.Forge3D = Object.freeze({ mountForge3DInto });
})(typeof window !== "undefined" ? window : this);
