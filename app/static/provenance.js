async function fetchProvenance(reportId) {
  const response = await fetch(`/api/reports/${reportId}/provenance`);
  if (!response.ok) {
    throw new Error("Unable to load provenance");
  }
  return response.json();
}

async function fetchBundle(reportId) {
  const response = await fetch(`/api/reports/${reportId}/bundle`);
  if (!response.ok) {
    throw new Error("Unable to export bundle");
  }
  return response.json();
}

function renderProvenance(payload) {
  const kv = document.getElementById("provenanceKv");
  const p = payload.provenance;

  const rows = [
    ["Run ID", payload.run_id],
    ["Scenario Hash", p.scenario_hash],
    ["Artifact IDs", p.artifact_ids.join(", ")],
    ["Timestamp", p.timestamp],
    ["Commit", p.commit_id],
    ["Module Versions", JSON.stringify(p.module_versions)],
  ];

  kv.innerHTML = rows
    .map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`)
    .join("");

  const list = document.getElementById("limitations");
  list.innerHTML = (payload.limitations || []).map((item) => `<li>${item}</li>`).join("");

  document.getElementById("runBackLink").href = `/runs/${payload.run_id}`;
}

document.addEventListener("DOMContentLoaded", async () => {
  const reportId = window.__REPORT_ID__;
  try {
    const payload = await fetchProvenance(reportId);
    renderProvenance(payload);
  } catch (error) {
    document.getElementById("bundlePreview").textContent = `Load failed: ${error.message}`;
  }

  document.getElementById("bundleButton").addEventListener("click", async () => {
    try {
      const bundle = await fetchBundle(reportId);
      document.getElementById("bundlePreview").textContent = JSON.stringify(bundle, null, 2);
    } catch (error) {
      document.getElementById("bundlePreview").textContent = `Export failed: ${error.message}`;
    }
  });
});
