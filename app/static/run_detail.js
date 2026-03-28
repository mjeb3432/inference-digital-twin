async function fetchRun(runId) {
  const response = await fetch(`/api/runs/${runId}`);
  if (!response.ok) {
    throw new Error("Run lookup failed");
  }
  return response.json();
}

function statusChip(status) {
  return `<span class="status-chip status-${status}">${status}</span>`;
}

function renderStages(stages) {
  const list = document.getElementById("stageList");
  list.innerHTML = "";
  if (!Array.isArray(stages) || stages.length === 0) {
    list.innerHTML = "<li>No stage data yet.</li>";
    return;
  }

  stages.forEach((stage) => {
    const item = document.createElement("li");
    const latency = stage.latency_ms ? `<span class="mono">${Number(stage.latency_ms).toFixed(1)} ms</span>` : "";
    item.innerHTML = `
      <span class="mono">${stage.stage_name}</span>
      ${statusChip(stage.status)}
      ${latency}
    `;
    list.appendChild(item);
  });
}

async function pollRun(runId) {
  const run = await fetchRun(runId);
  renderStages(run.stages);

  const statusLine = document.getElementById("runStatus");
  statusLine.innerHTML = `Status: ${statusChip(run.status)}`;

  if (run.report && run.report.metrics) {
    IDTUI.renderMetricCards("runMetricCards", run.report.metrics);
    document.getElementById("provenanceLink").innerHTML = `<a href="/reports/${run.report.report_id}/provenance">Open provenance for ${run.report.report_id}</a>`;
  }

  if (run.status === "completed" || run.status === "failed") {
    return;
  }

  setTimeout(() => {
    pollRun(runId).catch((error) => {
      statusLine.textContent = `Polling error: ${error.message}`;
    });
  }, 1200);
}

document.addEventListener("DOMContentLoaded", () => {
  const runId = window.__RUN_ID__;
  IDTUI.renderMetricCards("runMetricCards", null);
  pollRun(runId).catch((error) => {
    document.getElementById("runStatus").textContent = `Error: ${error.message}`;
  });
});

