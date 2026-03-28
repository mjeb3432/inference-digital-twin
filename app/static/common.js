const text = {
  set(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  },
  html(id, value) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = value;
  }
};

function renderMetricCards(containerId, metrics) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const labels = {
    ttft_ms: "TTFT",
    tpot_ms: "TPOT",
    tps: "TPS",
    concurrency: "Concurrency",
    mfu_utilization_pct: "MFU",
    gpu_utilization_pct: "GPU Utilization",
    carbon_kg_per_hour: "Carbon/hr",
    renewable_share_pct: "Renewables",
    cost_usd_per_hour: "Cost/hr",
    power_watts: "Power",
  };

  const displayOrder = [
    "ttft_ms",
    "tpot_ms",
    "tps",
    "concurrency",
    "mfu_utilization_pct",
    "gpu_utilization_pct",
    "power_watts",
    "cost_usd_per_hour",
    "carbon_kg_per_hour",
    "renewable_share_pct",
  ];

  if (!metrics) {
    container.innerHTML = '<p class="metric-empty">Run a scenario to populate metrics and tradeoffs.</p>';
    return;
  }

  const orderedKnown = displayOrder.filter((key) => {
    const item = metrics[key];
    return item && item.value !== undefined && item.value !== null;
  });
  const extraKeys = Object.keys(metrics).filter((key) => !displayOrder.includes(key));
  const keys = [...orderedKnown, ...extraKeys];

  if (!keys.length) {
    container.innerHTML = '<p class="metric-empty">No metrics available for this run yet.</p>';
    return;
  }

  container.innerHTML = keys
    .map((key) => {
      const item = metrics[key];
      const value = Number(item.value).toFixed(2);
      const label = labels[key] || key.replaceAll("_", " ");
      return `
        <article class="metric-card">
          <div class="muted">${label}</div>
          <strong>${value}</strong>
          <div class="mono">${item.unit}</div>
        </article>
      `;
    })
    .join("");
}

window.IDTUI = { text, renderMetricCards };

const THEME_STORAGE_KEY = "idt.theme";

function getInitialTheme() {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark") {
    return stored;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme) {
  document.body.dataset.theme = theme;
  const toggle = document.getElementById("themeToggle");
  if (!toggle) return;
  toggle.setAttribute("aria-pressed", String(theme === "dark"));
  toggle.textContent = theme === "dark" ? "Light" : "Dark";
}

function setupThemeToggle() {
  applyTheme(getInitialTheme());
  const toggle = document.getElementById("themeToggle");
  if (!toggle) return;
  toggle.addEventListener("click", () => {
    const nextTheme = document.body.dataset.theme === "dark" ? "light" : "dark";
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    applyTheme(nextTheme);
  });
}

document.addEventListener("DOMContentLoaded", setupThemeToggle);

