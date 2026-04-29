/**
 * forge-3d.js — Three.js-driven 3D ground-floor data center.
 *
 * Renders the SAME plan that the SVG floor view uses, but as a fully
 * volumetric WebGL scene. The ground floor is the canonical 3D model:
 * data hall, mechanical room, electrical room, MMR, switchgear, plus
 * outdoor power yard (substation, generators, batteries, solar PV
 * arrays, wind PPA marker, SMR pad, fuel farm), rooftop chillers, and
 * the surrounding site grass + perimeter setback. Each major zone has
 * a clean HTML overlay label so the user can tell COMPUTE vs ENERGY
 * vs COOLING vs NETWORK at a glance.
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
    if (!container || !plan) {
      throw new Error("mountForge3DInto requires { container, plan }");
    }

    await ensureThree();
    const THREE = window.THREE;

    /* ---------- Renderer + scene ---------- */
    const width = container.clientWidth || 1200;
    const height = container.clientHeight || 720;

    const scene = new THREE.Scene();
    /* Skybox gradient sphere is added below — leave background as
     * a solid fallback in case the shader fails. Fog still helps
     * sell the depth at long viewing angles. */
    scene.background = new THREE.Color(0x05070a);
    scene.fog = new THREE.Fog(0x0a1018, 90, 320);

    /* Camera framing — closer to the building so the user can read
     * the zone labels at default zoom. The building is centred at the
     * origin; this position looks down at it from the north-east at a
     * ~35° pitch, which is close to "isometric" and matches the
     * existing control-room aesthetic. The user can orbit/zoom from
     * here. */
    const camera = new THREE.PerspectiveCamera(34, width / height, 0.5, 800);
    camera.position.set(48, 42, 48);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if ("outputColorSpace" in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
    else if ("outputEncoding" in renderer) renderer.outputEncoding = THREE.sRGBEncoding;
    container.appendChild(renderer.domElement);
    renderer.domElement.classList.add("forge-3d-canvas");

    /* ---------- Lighting ---------- */
    /* Three-light rig: a hemisphere for soft sky+ground bounce, a
     * directional sun for sharp shadows + form, and a warm fill
     * to keep shadows from going flat. Plus a mint accent rim light
     * for the "inference fabric" vibe. */
    const hemi = new THREE.HemisphereLight(0x88aacc, 0x0a1820, 0.55);
    scene.add(hemi);

    const ambient = new THREE.AmbientLight(0xffffff, 0.12);
    scene.add(ambient);

    /* Cool sun-like key light */
    const keyLight = new THREE.DirectionalLight(0xfff1e0, 0.75);
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
    scene.add(keyLight);

    /* Warm fill light to lift shadow detail */
    const fill = new THREE.DirectionalLight(0xff9a6e, 0.16);
    fill.position.set(-50, 30, -60);
    scene.add(fill);

    /* Mint-accent rim light inside the data hall */
    const rim = new THREE.PointLight(0x33fbd3, 1.4, 160, 1.6);
    rim.position.set(0, CEILING_Y - 1, 0);
    scene.add(rim);

    /* Skybox-like sphere — gives a subtle horizon gradient instead
     * of a flat black background. Inside-out box with a vertical
     * gradient material. */
    const skyGeo = new THREE.SphereGeometry(420, 24, 18);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor:    { value: new THREE.Color(0x05080d) },
        bottomColor: { value: new THREE.Color(0x10202c) },
        offset:      { value: 30 },
        exponent:    { value: 0.7 },
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
     * facility (green grass), an urban-edge campus (concrete + adjacent
     * city blocks), a repurposed industrial site (warm brick tones),
     * and a campus-adjacent (pale cement). */
    const SITE_PALETTES = {
      rural:     { ground: 0x142822, setback: 0x1f3a31 },
      urban:     { ground: 0x1a1d22, setback: 0x282d35 },
      repurpose: { ground: 0x2a2018, setback: 0x3a2c20 },
      campus:    { ground: 0x1f2326, setback: 0x2a3034 },
    };
    const sitePal = SITE_PALETTES[locationType] || SITE_PALETTES.rural;

    if (plan.site) {
      const [sx, , sz] = svgToWorld(plan.site.x + plan.site.w / 2, plan.site.y + plan.site.h / 2);
      const siteGeo = new THREE.BoxGeometry(sw(plan.site.w), 0.2, sw(plan.site.h));
      const siteMat = new THREE.MeshStandardMaterial({
        color: sitePal.ground, roughness: 0.95, metalness: 0.0,
      });
      const siteMesh = new THREE.Mesh(siteGeo, siteMat);
      siteMesh.position.set(sx, -0.5, sz);
      siteMesh.receiveShadow = true;
      worldGroup.add(siteMesh);

      /* Setback band */
      const setW = sw(plan.site.w - plan.site.setback * 2);
      const setH = sw(plan.site.h - plan.site.setback * 2);
      const setGeo = new THREE.BoxGeometry(setW, 0.1, setH);
      const setMat = new THREE.MeshStandardMaterial({
        color: sitePal.setback, roughness: 0.95, metalness: 0.0,
      });
      const setMesh = new THREE.Mesh(setGeo, setMat);
      setMesh.position.set(sx, -0.4, sz);
      setMesh.receiveShadow = true;
      worldGroup.add(setMesh);

      /* Location-specific surroundings */
      if (locationType === "rural") {
        /* Realistic conifer trees — each tree is a stack of progressively
         * smaller cones (suggests layered branches) with a thicker
         * tapered trunk + base flare. Sizes vary per-tree so the
         * perimeter doesn't read as a regular pattern. Two foliage
         * tints alternate (deeper green vs lighter mint) for variety. */
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3d2615, roughness: 0.95, metalness: 0 });
        const foliageMatA = new THREE.MeshStandardMaterial({ color: 0x1f4029, roughness: 0.9 });
        const foliageMatB = new THREE.MeshStandardMaterial({ color: 0x2d5a3a, roughness: 0.9 });
        const foliageMatC = new THREE.MeshStandardMaterial({ color: 0x365e3f, roughness: 0.9 });
        const foliageMats = [foliageMatA, foliageMatB, foliageMatC];

        const treeCount = 30;
        for (let i = 0; i < treeCount; i++) {
          /* Distribute trees in a wider organic ring with random
           * jitter so the perimeter looks natural, not algorithmic. */
          const ang = (i / treeCount) * Math.PI * 2 + (i * 0.137) % 1.0;
          const baseR = Math.max(sw(plan.site.w), sw(plan.site.h)) * 0.42;
          const r = baseR + ((i * 7) % 11) * 0.4;
          const tx = sx + Math.cos(ang) * r;
          const tz = sz + Math.sin(ang) * r;
          /* Vary scale so we get small saplings and tall mature pines */
          const scale = 0.65 + ((i * 0.31) % 0.85);
          const foliageMat = foliageMats[i % foliageMats.length];

          const treeGroup = new THREE.Group();
          treeGroup.position.set(tx, 0, tz);
          /* Random rotation so trees don't all face the same way */
          treeGroup.rotation.y = (i * 0.917) % (Math.PI * 2);

          /* Trunk: thicker base + tapered top */
          const trunkH = 1.3 * scale;
          const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.12 * scale, 0.18 * scale, trunkH, 8),
            trunkMat
          );
          trunk.position.y = trunkH / 2;
          trunk.castShadow = true;
          treeGroup.add(trunk);

          /* Three layered cone tiers — base wider, top tighter */
          const tiers = 3 + (i % 2); // 3 or 4 tiers
          let coneY = trunkH;
          for (let t = 0; t < tiers; t++) {
            const tierT = t / tiers;
            const radius = (1.0 - tierT * 0.55) * 0.95 * scale;
            const height = (1.4 - tierT * 0.25) * scale;
            const cone = new THREE.Mesh(
              new THREE.ConeGeometry(radius, height, 8),
              foliageMat
            );
            cone.position.y = coneY + height / 2 - 0.18 * scale;
            cone.castShadow = true;
            treeGroup.add(cone);
            coneY += height * 0.55;
          }
          worldGroup.add(treeGroup);
        }

        /* Scatter a few rounded "bushes" near the building entrance
         * so the plant-life feels designed, not just perimeter-only. */
        const bushMat = new THREE.MeshStandardMaterial({ color: 0x2a4d33, roughness: 0.95 });
        for (let i = 0; i < 6; i++) {
          const bx = sx + ((i % 3) - 1) * 8 + (i * 1.7);
          const bz = sz + sw(plan.site.h) * 0.32 + (i % 2 === 0 ? -1.4 : 1.4);
          const bush = new THREE.Mesh(new THREE.SphereGeometry(0.65 + (i * 0.11) % 0.4, 8, 6), bushMat);
          bush.position.set(bx, 0.4, bz);
          bush.scale.set(1, 0.7, 1);
          bush.castShadow = true;
          worldGroup.add(bush);
        }
      } else if (locationType === "urban") {
        /* A grid of low neighbouring building blocks tilted around the
         * site so the campus sits inside a city fabric. Pure decoration
         * — not part of the facility plan. */
        const blockMat = new THREE.MeshStandardMaterial({ color: 0x222831, roughness: 0.7, metalness: 0.15 });
        const blockEdge = new THREE.LineBasicMaterial({ color: 0x3a4250 });
        const cityR = Math.max(sw(plan.site.w), sw(plan.site.h)) * 0.55;
        const blockCount = 12;
        for (let i = 0; i < blockCount; i++) {
          const ang = (i / blockCount) * Math.PI * 2 + 0.2;
          const r = cityR + (i % 3) * 4;
          const bw = 4 + (i % 3) * 1.5;
          const bh = 6 + (i * 1.7) % 12;
          const bd = 4 + ((i * 2) % 3) * 1.4;
          const bx = sx + Math.cos(ang) * r;
          const bz = sz + Math.sin(ang) * r;
          const block = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), blockMat);
          block.position.set(bx, bh / 2 - 0.4, bz);
          block.castShadow = true;
          block.receiveShadow = true;
          worldGroup.add(block);
          const edges = new THREE.LineSegments(new THREE.EdgesGeometry(block.geometry), blockEdge);
          edges.position.copy(block.position);
          worldGroup.add(edges);
        }
      } else if (locationType === "repurpose") {
        /* Warm brick-toned palette — also pop a couple of disused
         * smokestacks at the edge for vibe. */
        const stackMat = new THREE.MeshStandardMaterial({ color: 0x4a2a1a, roughness: 0.9 });
        for (let i = 0; i < 2; i++) {
          const ang = -1 + i * 2.0;
          const r = Math.max(sw(plan.site.w), sw(plan.site.h)) * 0.42;
          const tx = sx + Math.cos(ang) * r;
          const tz = sz + Math.sin(ang) * r;
          const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 7.0, 10), stackMat);
          stack.position.set(tx, 3.5, tz);
          stack.castShadow = true;
          worldGroup.add(stack);
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
      color: 0x131820, roughness: 0.85, metalness: 0.1,
    });
    const slab = new THREE.Mesh(slabGeo, slabMat);
    slab.position.set(0, -0.2, 0);
    slab.receiveShadow = true;
    worldGroup.add(slab);

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
      const dockPadMat = new THREE.MeshStandardMaterial({ color: 0x363f49, roughness: 0.95 });
      const dockPad = new THREE.Mesh(dockPadGeo, dockPadMat);
      dockPad.position.set(dockOff, 0.3, -D / 2 - 1.4);
      dockPad.receiveShadow = true;
      worldGroup.add(dockPad);

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

      /* Site light poles — 4 corner poles + 4 edge poles. Each has a
       * point light at the top (low intensity so we don't overload
       * the renderer). */
      const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a323b, roughness: 0.5, metalness: 0.6 });
      const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff3c8 });
      const polePositions = [
        [-W * 0.7, -D * 0.7], [W * 0.7, -D * 0.7], [-W * 0.7, D * 0.7], [W * 0.7, D * 0.7],
        [0, -D * 0.85], [0, D * 0.85], [-W * 0.85, 0], [W * 0.85, 0],
      ];
      polePositions.forEach(([px, pz]) => {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 6.5, 6), poleMat);
        pole.position.set(px, 3.25, pz);
        pole.castShadow = true;
        worldGroup.add(pole);
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), lampMat);
        lamp.position.set(px, 6.5, pz);
        worldGroup.add(lamp);
      });
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

      /* HVAC ducts running across part of the roof */
      const ductMat = new THREE.MeshStandardMaterial({ color: 0xc8cdd4, roughness: 0.4, metalness: 0.55 });
      const ductGeo = new THREE.BoxGeometry(W * 0.6, 0.35, 0.5);
      const duct = new THREE.Mesh(ductGeo, ductMat);
      duct.position.set(0, BUILDING_HEIGHT + 0.55, D * 0.1);
      duct.castShadow = true;
      worldGroup.add(duct);
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

    /* Electrical (switchgear / MER) */
    if (showInterior && plan.rooms.electrical) {
      const ele = addZoneFloor(plan.rooms.electrical, 0x4b3413, 0.6);
      /* A row of busbar / switchgear cabinets */
      const sgMat = new THREE.MeshStandardMaterial({
        color: 0x5e4322, roughness: 0.5, metalness: 0.55, emissive: 0x261405, emissiveIntensity: 0.5,
      });
      const sgGeo = new THREE.BoxGeometry(0.9, 2.6, 0.6);
      const sgCount = Math.max(3, Math.round(plan.rooms.electrical.w / 18));
      for (let i = 0; i < sgCount; i++) {
        const sm = new THREE.Mesh(sgGeo, sgMat);
        const tx = ele.wx - ele.w * 0.4 + (ele.w * 0.8) * (i / Math.max(1, sgCount - 1));
        sm.position.set(tx, 1.3, ele.wz);
        sm.castShadow = true;
        worldGroup.add(sm);
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
     * substation is part of power procurement. */
    if (showBuilding && plan.rooms.switchgear) {
      const sg = addZoneFloor(plan.rooms.switchgear, 0x3a2a13, 0.65);
      const tMat = new THREE.MeshStandardMaterial({
        color: 0x6a4a1a, roughness: 0.45, metalness: 0.5,
      });
      const transformer = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.6, 8), tMat);
      transformer.position.set(sg.wx, 0.85, sg.wz);
      transformer.castShadow = true;
      worldGroup.add(transformer);
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
        const rackGeo = new THREE.BoxGeometry(1, rackH, 1);
        const rackMat = new THREE.MeshStandardMaterial({
          color: isImmersion ? 0x132a3a : 0x1a2026,
          roughness: isImmersion ? 0.35 : 0.55,
          metalness: isImmersion ? 0.65 : 0.45,
          emissive: rackEmissive,
          emissiveIntensity: 0.6,
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

      /* Phase 7 — DCIM telemetry "scan plane". A faint mint disc
       * sweeps across the floor of the data hall to signal that
       * monitoring is hot. We attach it to ui.forge3d so the render
       * loop can animate its phase. */
      if (showTelemetry) {
        const scanGeo = new THREE.PlaneGeometry(sw(dh.w) * 0.96, sw(dh.h) * 0.96);
        const scanMat = new THREE.MeshBasicMaterial({
          color: 0x33fbd3, transparent: true, opacity: 0.08, side: THREE.DoubleSide,
        });
        const scan = new THREE.Mesh(scanGeo, scanMat);
        const [dx, , dz] = svgToWorld(dh.x + dh.w / 2, dh.y + dh.h / 2);
        scan.position.set(dx, 0.16, dz);
        scan.rotation.x = -Math.PI / 2;
        scan.userData.kind = "dcim-scan";
        worldGroup.add(scan);

        /* Telemetry summary label */
        const monLabel = monitoringApproach === "dcim-suite" ? "Full DCIM suite"
          : monitoringApproach === "open-stack" ? "Open-source stack"
          : "Telemetry online";
        labelTargets.push({
          x: dx, y: RACK_HEIGHT + 4.2, z: dz - sw(dh.h) * 0.35,
          title: "DCIM TELEMETRY",
          sub: monLabel,
          kind: "network",
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

    /* ---------- ROOFTOP CHILLERS (cooling continued) ---------- */
    /* Phase 4+ once the user has chosen a cooling type. Air-cooled
     * facilities get a row of rooftop chillers; d2c gets fewer but
     * larger units; immersion needs only a small heat-rejection skid. */
    if (showCooling && plan.rooms.dataHall) {
      const chillerCount = coolingType === "immersion" ? 2
        : coolingType === "d2c" ? 4
        : 6;
      const chillerMat = new THREE.MeshStandardMaterial({
        color: 0x2a4d4a, roughness: 0.45, metalness: 0.65,
        emissive: 0x102020, emissiveIntensity: 0.35,
      });
      const chillerGeo = new THREE.BoxGeometry(2.0, 1.2, 1.4);
      for (let i = 0; i < chillerCount; i++) {
        const cm = new THREE.Mesh(chillerGeo, chillerMat);
        const t = (i + 0.5) / chillerCount;
        const xx = sw(plan.rooms.dataHall.x + plan.rooms.dataHall.w * t) - sw(cx);
        const zz = -sw(plan.building.h) * 0.35;
        cm.position.set(xx, BUILDING_HEIGHT + 0.65, zz);
        cm.castShadow = true;
        worldGroup.add(cm);
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

    /* Generators */
    if (powerMix.gas > 0) {
      addPad(yardX, yardZ0, 6, 6, 0x222a31);
      const genMat = new THREE.MeshStandardMaterial({
        color: 0x4a3a22, roughness: 0.55, metalness: 0.45,
        emissive: 0x1a1208, emissiveIntensity: 0.4,
      });
      const genCount = 4;
      for (let i = 0; i < genCount; i++) {
        const gen = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 0.9), genMat);
        const t = (i + 0.5) / genCount;
        gen.position.set(yardX, padHeight + 0.7, yardZ0 - 2.2 + t * 4.4);
        gen.castShadow = true;
        worldGroup.add(gen);
      }
      labelTargets.push({
        x: yardX, y: 2.6, z: yardZ0,
        title: "GENERATORS",
        sub: `${Math.round(powerMix.gas)}% gas backup`,
        kind: "energy",
      });
    }

    /* Battery pack pad */
    if (powerMix.gas > 0 || powerMix.solar > 0 || powerMix.wind > 0) {
      const bx = yardX + 9;
      const bz = yardZ0;
      addPad(bx, bz, 5, 5, 0x1a2530);
      const bessMat = new THREE.MeshStandardMaterial({
        color: 0x6dd6ff, roughness: 0.4, metalness: 0.6,
        emissive: 0x0c3548, emissiveIntensity: 0.55,
      });
      for (let i = 0; i < 3; i++) {
        const bess = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, 1.4), bessMat);
        bess.position.set(bx - 1.5 + i * 1.5, padHeight + 0.6, bz);
        bess.castShadow = true;
        worldGroup.add(bess);
      }
      labelTargets.push({
        x: bx, y: 2.4, z: bz,
        title: "BATTERY (UPS)",
        sub: "BESS · ride-through",
        kind: "energy",
      });
    }

    /* Solar PV array — east of the yard */
    if (powerMix.solar > 0) {
      const px = yardX - sw(160);
      const pz = yardZ0 + sw(60);
      const solarMat = new THREE.MeshStandardMaterial({
        color: 0x122236, roughness: 0.2, metalness: 0.6,
        emissive: 0x0a1622, emissiveIntensity: 0.5,
      });
      const rowCount = Math.max(2, Math.round(powerMix.solar / 25) + 2);
      for (let row = 0; row < rowCount; row++) {
        const panel = new THREE.Mesh(new THREE.BoxGeometry(8, 0.1, 1.6), solarMat);
        panel.rotation.x = -0.5;
        panel.position.set(px, 1.0, pz - 4 + row * 2.4);
        panel.castShadow = true;
        worldGroup.add(panel);
      }
      labelTargets.push({
        x: px, y: 2.0, z: pz,
        title: "SOLAR PV",
        sub: `${Math.round(powerMix.solar)}% renewable`,
        kind: "energy",
      });
    }

    /* Wind turbine marker */
    if (powerMix.wind > 0) {
      const wx = yardX - sw(120);
      const wz = yardZ0 - sw(80);
      const towerMat = new THREE.MeshStandardMaterial({ color: 0xc8d3e0, roughness: 0.5, metalness: 0.6 });
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 8.0, 12), towerMat);
      tower.position.set(wx, 4.0, wz);
      tower.castShadow = true;
      worldGroup.add(tower);
      const hub = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 12), towerMat);
      hub.position.set(wx, 8.0, wz);
      worldGroup.add(hub);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3.6, 0.4), towerMat);
      blade.position.set(wx, 9.6, wz);
      worldGroup.add(blade);
      labelTargets.push({
        x: wx, y: 10.5, z: wz,
        title: "WIND PPA",
        sub: `${Math.round(powerMix.wind)}% wind contract`,
        kind: "energy",
      });
    }

    /* SMR pad */
    if (powerMix.smr > 0) {
      const sx2 = yardX - sw(60);
      const sz2 = yardZ0 + sw(140);
      addPad(sx2, sz2, 5, 5, 0x232f24);
      const smrMat = new THREE.MeshStandardMaterial({
        color: 0x33503c, roughness: 0.4, metalness: 0.5,
        emissive: 0x0a2412, emissiveIntensity: 0.55,
      });
      const smrShell = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 2.6, 16), smrMat);
      smrShell.position.set(sx2, padHeight + 1.3, sz2);
      smrShell.castShadow = true;
      worldGroup.add(smrShell);
      labelTargets.push({
        x: sx2, y: 3.4, z: sz2,
        title: "SMR REACTOR",
        sub: `${Math.round(powerMix.smr)}% nuclear`,
        kind: "energy",
      });
    }

    /* Fuel farm — only when gas is present */
    if (powerMix.gas > 0) {
      const fx = yardX + sw(20);
      const fz = yardZ0 + sw(80);
      addPad(fx, fz, 4, 4, 0x2a2218);
      const tankMat = new THREE.MeshStandardMaterial({ color: 0x715a30, roughness: 0.5, metalness: 0.5 });
      for (let i = 0; i < 2; i++) {
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.6, 14), tankMat);
        tank.position.set(fx - 0.9 + i * 1.8, padHeight + 0.8, fz);
        tank.castShadow = true;
        worldGroup.add(tank);
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

    /* ---------- HTML overlay labels (hover-only) ---------- */
    /* Labels are intentionally hidden by default — they only appear
     * when the user hovers near a labeled piece of equipment. We
     * project every label position to screen space each frame, then
     * the mousemove handler shows the closest label within a small
     * pixel radius of the cursor and hides everything else. This
     * keeps the scene visually quiet until the user wants info. */
    const labelLayer = document.createElement("div");
    labelLayer.className = "forge-3d-label-layer";
    container.appendChild(labelLayer);

    /* Always-on tiny pin marker for every labeled object so the user
     * knows which things have hover info — but the title/sub card is
     * hidden until hover. The pin is a separate element from the card
     * so we can keep the marker visible while the card is hidden. */
    const labelEls = labelTargets.map((tgt) => {
      const el = document.createElement("div");
      /* Add the spawn-animation class for newly-mounted labels so they
       * pop in instead of just appearing. The class auto-cleans via
       * a setTimeout below since CSS animations don't auto-remove
       * classes. */
      el.className = `forge-3d-label forge-3d-label-${tgt.kind} forge-3d-label-spawn`;
      setTimeout(() => el.classList.remove("forge-3d-label-spawn"), 700);
      el.innerHTML = `
        <div class="forge-3d-label-pin"></div>
        <div class="forge-3d-label-card">
          <div class="forge-3d-label-title">${escapeHtml(tgt.title)}</div>
          <div class="forge-3d-label-sub">${escapeHtml(tgt.sub || "")}</div>
        </div>
      `;
      labelLayer.appendChild(el);
      return {
        el,
        target: tgt,
        vec: new THREE.Vector3(tgt.x, tgt.y, tgt.z),
        sx: 0, sy: 0, depth: 1, onScreen: false,
      };
    });

    /* Track cursor position relative to the canvas. mouseLeave hides
     * any open label so the scene returns to a clean state when the
     * user moves out of the canvas. */
    let cursor = { x: -9999, y: -9999, inside: false };
    function onPointerMove(e) {
      const r = renderer.domElement.getBoundingClientRect();
      cursor.x = e.clientX - r.left;
      cursor.y = e.clientY - r.top;
      cursor.inside = true;
    }
    function onPointerLeave() {
      cursor.inside = false;
    }
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerleave", onPointerLeave);

    function escapeHtml(s) {
      return String(s == null ? "" : s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }

    /* ---------- Orbit controls ---------- */
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1, 0);
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
    /* Cache the DCIM scan plane once (if it exists) so the per-frame
     * loop doesn't have to traverse the scene to find it. */
    const scanPlane = (() => {
      let found = null;
      worldGroup.traverse((obj) => { if (obj.userData && obj.userData.kind === "dcim-scan") found = obj; });
      return found;
    })();

    function tick(t) {
      if (!running) return;
      const dt = (t - t0) / 1000;
      /* Rim-light pulse intensity ramps with phase so an early-stage
       * facility feels quieter than a fully-online Phase 8 build. */
      const phaseGlow = fullyOnline ? 1.0 : (phase / 8) * 0.55;
      rim.intensity = (1.0 + phaseGlow) + Math.sin(dt * 1.2) * 0.45;
      /* Phase 7 telemetry scan: pulse the opacity sinusoidally between
       * 4% and 16% so the user perceives a live monitoring overlay. */
      if (scanPlane) {
        scanPlane.material.opacity = 0.06 + (Math.sin(dt * 1.6) * 0.5 + 0.5) * 0.10;
      }
      controls.update();
      renderer.render(scene, camera);

      /* Project every label to screen space, then reveal the one
       * closest to the cursor (within HOVER_RADIUS px). All others
       * stay hidden so the scene reads cleanly. */
      const w = container.clientWidth || width;
      const h = container.clientHeight || height;
      labelEls.forEach((p) => {
        tmpVec.copy(p.vec).project(camera);
        p.sx = (tmpVec.x * 0.5 + 0.5) * w;
        p.sy = (-tmpVec.y * 0.5 + 0.5) * h;
        p.depth = tmpVec.z;
        p.onScreen = tmpVec.z > -1 && tmpVec.z < 1
          && p.sx > -50 && p.sx < w + 50
          && p.sy > -50 && p.sy < h + 50;
        /* Position the (possibly-hidden) element so the show/hide
         * transition happens in place rather than from origin. */
        p.el.style.transform = `translate(${p.sx.toFixed(1)}px, ${p.sy.toFixed(1)}px)`;
      });

      const HOVER_RADIUS = 95; // pixels — generous so users don't
                                // need pixel-perfect aim. Always-on
                                // pins give the visual target.
      let hovered = null;
      if (cursor.inside) {
        let best = HOVER_RADIUS * HOVER_RADIUS;
        for (let i = 0; i < labelEls.length; i++) {
          const p = labelEls[i];
          if (!p.onScreen) continue;
          const dx = p.sx - cursor.x;
          const dy = p.sy - cursor.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < best) { best = d2; hovered = p; }
        }
      }

      labelEls.forEach((p) => {
        if (p === hovered) {
          p.el.classList.add("forge-3d-label-active");
        } else {
          p.el.classList.remove("forge-3d-label-active");
        }
        /* Pin opacity fades with depth so back-of-scene pins don't
         * compete with foreground ones. */
        if (p.onScreen) {
          const depthFade = 1 - Math.min(1, Math.max(0, (p.depth + 0.6) / 1.6));
          p.el.style.opacity = String(0.55 + depthFade * 0.45);
        } else {
          p.el.style.opacity = "0";
        }
      });

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
      if (labelLayer.parentNode) labelLayer.parentNode.removeChild(labelLayer);
    }

    return {
      dispose,
      camera,
      controls,
      recenter() {
        camera.position.set(48, 42, 48);
        controls.target.set(0, 1, 0);
        controls.update();
      },
    };
  }

  root.Forge3D = Object.freeze({ mountForge3DInto });
})(typeof window !== "undefined" ? window : this);
