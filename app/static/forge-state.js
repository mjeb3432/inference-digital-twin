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

  let writeTimer = null;

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
    if (!snapshot) return;
    if (writeTimer) clearTimeout(writeTimer);
    writeTimer = setTimeout(() => {
      try {
        const payload = JSON.stringify({
          ...snapshot,
          meta: { ...(snapshot.meta || {}), savedAt: new Date().toISOString(), schemaVersion: SCHEMA_VERSION },
        });
        root.localStorage.setItem(STORAGE_KEY, payload);
      } catch (err) {
        console.warn("[forge-state] write failed:", err);
      }
    }, 200);
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
    /* Notify after the debounce so the value listeners read is fresh */
    setTimeout(() => emit(read()), 220);
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
  });
})(typeof window !== "undefined" ? window : this);
