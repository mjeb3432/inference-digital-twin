/* ============================================================
 *  Forge state bridge — keeps Build / Dashboard / Control Room
 *  in sync. The Forge writes a compact snapshot to localStorage
 *  on every state change; the Dashboard and Control Room read
 *  it on load and re-render their hardcoded shells around the
 *  user's actual facility.
 *
 *  All writes are debounced so we don't churn localStorage
 *  while the user is dragging sliders.
 *
 *  Cross-tab updates: listens to the `storage` event so a
 *  Dashboard tab open alongside the Forge picks up changes.
 * ============================================================ */

(function (root) {
  "use strict";

  const STORAGE_KEY = "forge:facility:v1";
  const SCHEMA_VERSION = 1;

  function read() {
    try {
      const raw = root.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.meta?.schemaVersion !== SCHEMA_VERSION) return null;
      return parsed;
    } catch (_) {
      return null;
    }
  }

  function write(snapshot) {
    /* Synchronous write — needed so that applyNavGate() (called right
       after) reads the up-to-date snapshot. localStorage.setItem on a
       ~1 KB JSON is sub-millisecond, so debouncing wasn't worth the
       UX correctness cost. */
    if (!snapshot) return;
    try {
      const payload = JSON.stringify({
        ...snapshot,
        meta: { ...(snapshot.meta || {}), savedAt: new Date().toISOString(), schemaVersion: SCHEMA_VERSION },
      });
      root.localStorage.setItem(STORAGE_KEY, payload);
    } catch (err) {
      console.warn("[forge-state] write failed:", err);
    }
  }

  function clear() {
    try { root.localStorage.removeItem(STORAGE_KEY); } catch (_) {}
  }

  /* Subscribe to changes — fires on cross-tab updates AND
     same-tab updates (we re-emit the storage event manually
     after writing because the spec doesn't fire it locally). */
  const listeners = new Set();
  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }
  function emit(snapshot) {
    listeners.forEach((fn) => {
      try { fn(snapshot); } catch (_) {}
    });
  }
  root.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY) return;
    emit(read());
  });

  /* Augmented write that also notifies same-tab listeners */
  function writeAndNotify(snapshot) {
    write(snapshot);
    /* Notify synchronously since write is now synchronous */
    emit(read());
  }

  // ----------------------------------------------------------
  // Helpers used by Dashboard / Control Room when adapting the
  // raw snapshot to their UI shells. Centralised here so both
  // pages format things identically.
  // ----------------------------------------------------------

  function formatCityLabel(snapshot) {
    return snapshot?.facility?.cityLabel || "TOR-DC-01 · TORONTO";
  }

  function deriveDcCode(snapshot) {
    /* Build a believable "TOR-DC-01"-style code from the chosen city */
    const cityLabel = snapshot?.facility?.cityLabel;
    if (!cityLabel) return "TOR-DC-01";
    const cityName = cityLabel.split(",")[0].trim();
    const code = cityName.replace(/[^A-Z]/gi, "").slice(0, 3).toUpperCase() || "DC";
    return `${code}-DC-01`;
  }

  function deriveRackCount(snapshot) {
    /* If Forge progressed past compute, the rackCount field is set.
       Otherwise default to 20 (4×5 grid in dashboard). */
    const n = Number(snapshot?.compute?.rackCount);
    if (Number.isFinite(n) && n > 0) return Math.min(n, 64);
    return 20;
  }

  function deriveGpuModel(snapshot) {
    return snapshot?.compute?.gpuLabel || "H100 SXM5";
  }

  function deriveAlerts(snapshot) {
    /* Surface any validation warnings from the Forge as alerts.
       Falls back to the original CPU-thermal alert when nothing
       is present. */
    const warns = snapshot?.facility?.warnings || [];
    if (!warns.length) {
      return [
        {
          severity: "warn",
          rackId: "RACK-C3",
          message: "CPU Thermal Warning",
        },
      ];
    }
    return warns.slice(0, 4).map((w, i) => ({
      severity: w.severity || "warn",
      rackId: w.scope || `FORGE-${String(i + 1).padStart(2, "0")}`,
      message: w.text || "Forge validation warning",
    }));
  }

  function deriveAvgTemp(snapshot) {
    /* Air-cooled is hottest, immersion coolest. Map cooling type → C° */
    const c = (snapshot?.facilityCons?.cooling || "").toLowerCase();
    if (c.includes("immersion")) return 18.4;
    if (c.includes("liquid") || c.includes("d2c")) return 21.0;
    return 22.4;
  }

  function deriveMwDraw(snapshot) {
    return Number(snapshot?.metrics?.mwDraw) || Number(snapshot?.power?.targetMw) * 0.32 || 3.2;
  }

  function deriveTokensPerSec(snapshot) {
    const tps = Number(snapshot?.metrics?.achievedTps);
    if (Number.isFinite(tps) && tps > 0) return tps;
    return 124500;
  }

  // ----------------------------------------------------------
  // Build-completion gate — Dashboard and Control Room are only
  // unlocked once the user reaches Phase 8 (FACILITY ONLINE).
  // ----------------------------------------------------------
  function isBuildComplete(snapshot) {
    snapshot = snapshot ?? read();
    if (!snapshot) return false;
    const phase = Number(snapshot.facility?.phase);
    if (!Number.isFinite(phase)) return false;
    return phase >= 8;
  }

  /**
   * Disable a list of nav <a> links when the build isn't complete.
   * Adds .locked class, pointer-events: none, prevents click, and
   * surfaces a tooltip explaining why.
   *
   * Call this on every page that renders the global nav (Dashboard,
   * Control Room, Forge). The Forge link is never locked.
   */
  function applyNavGate(opts) {
    const complete = isBuildComplete();
    const links = document.querySelectorAll(
      'a.global-nav-link[data-nav="dashboard"], a.global-nav-link[data-nav="control-room"]'
    );
    links.forEach((link) => {
      if (complete) {
        link.classList.remove("locked");
        link.removeAttribute("aria-disabled");
        link.removeAttribute("title");
        link.removeAttribute("tabindex");
      } else {
        link.classList.add("locked");
        link.setAttribute("aria-disabled", "true");
        link.setAttribute("tabindex", "-1");
        link.title = "Available after the build is complete (reach Phase 8 in The Forge).";
        if (!link.dataset.gateBound) {
          link.addEventListener("click", (e) => {
            if (link.classList.contains("locked")) {
              e.preventDefault();
              e.stopPropagation();
            }
          });
          link.dataset.gateBound = "1";
        }
      }
    });
  }

  /**
   * Render a full-page lock overlay if the user lands directly on a
   * gated page (e.g. via URL bar). The overlay explains why and links
   * back to /forge.
   */
  function renderLockOverlayIfNeeded(opts) {
    if (isBuildComplete()) return false;
    if (document.getElementById("forgeBuildGate")) return true;

    const pageName = opts?.pageName || "this view";
    const overlay = document.createElement("div");
    overlay.id = "forgeBuildGate";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", "Build required");
    overlay.innerHTML = `
      <div class="gate-bg" aria-hidden="true"></div>
      <div class="gate-card">
        <div class="gate-kicker">[ ACCESS RESTRICTED ]</div>
        <h2 class="gate-title">Build the facility first</h2>
        <p class="gate-body">
          ${pageName} reflects a live data centre. It only unlocks after
          you complete the 8-phase build in <strong>The Forge</strong>.
        </p>
        <a class="gate-cta" href="/forge">OPEN THE FORGE &rsaquo;</a>
      </div>
    `;

    /* Inline minimal styles so the overlay works on any page without
       us editing every page's CSS. */
    const css = document.createElement("style");
    css.textContent = `
      #forgeBuildGate {
        position: fixed; inset: 0; z-index: 9000;
        display: flex; align-items: center; justify-content: center;
        font-family: "IBM Plex Mono", ui-monospace, monospace;
      }
      #forgeBuildGate .gate-bg {
        position: absolute; inset: 0;
        background: rgba(5, 7, 11, 0.92);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
      }
      #forgeBuildGate .gate-card {
        position: relative;
        max-width: 460px; padding: 36px 32px;
        background: rgba(10, 16, 28, 0.94);
        border: 1px solid rgba(51, 251, 211, 0.32);
        box-shadow: 0 0 40px rgba(51, 251, 211, 0.18);
        text-align: center;
        color: #f2f7ff;
      }
      #forgeBuildGate .gate-kicker {
        font-size: 10px; letter-spacing: 0.36em;
        color: #ffb750; margin-bottom: 18px;
      }
      #forgeBuildGate .gate-title {
        font-family: "Comfortaa", sans-serif; font-weight: 700;
        font-size: 28px; line-height: 1.1; margin: 0 0 14px 0;
        color: #f2f7ff;
      }
      #forgeBuildGate .gate-body {
        font-family: "Plus Jakarta Sans", sans-serif;
        font-size: 14px; line-height: 1.55;
        color: rgba(242, 247, 255, 0.78);
        margin: 0 0 26px 0;
      }
      #forgeBuildGate .gate-body strong { color: #33fbd3; font-weight: 600; }
      #forgeBuildGate .gate-cta {
        display: inline-block;
        padding: 12px 22px;
        border: 1px solid rgba(51, 251, 211, 0.6);
        background: rgba(51, 251, 211, 0.1);
        color: #f2f7ff;
        font-size: 11px; letter-spacing: 0.28em;
        text-transform: uppercase; text-decoration: none;
        transition: background 160ms ease, border-color 160ms ease;
      }
      #forgeBuildGate .gate-cta:hover {
        background: rgba(51, 251, 211, 0.22);
        border-color: rgba(51, 251, 211, 1);
      }
    `;
    document.head.appendChild(css);
    document.body.appendChild(overlay);
    return true;
  }

  // ----------------------------------------------------------
  // Public API
  // ----------------------------------------------------------
  root.ForgeState = Object.freeze({
    STORAGE_KEY,
    SCHEMA_VERSION,
    read,
    write: writeAndNotify,
    clear,
    subscribe,
    formatCityLabel,
    deriveDcCode,
    deriveRackCount,
    deriveGpuModel,
    deriveAlerts,
    deriveAvgTemp,
    deriveMwDraw,
    deriveTokensPerSec,
    isBuildComplete,
    applyNavGate,
    renderLockOverlayIfNeeded,
  });
})(typeof window !== "undefined" ? window : this);
