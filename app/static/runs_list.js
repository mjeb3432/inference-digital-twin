function renderTable(items) {
  if (!items.length) {
    return "<p>No runs yet.</p>";
  }

  const statusChip = (status) => `<span class="status-chip status-${status}">${status}</span>`;
  const rows = items.map((item) => `
    <tr>
      <td><a href="/runs/${item.run_id}">${item.run_id}</a></td>
      <td>${statusChip(item.status)}</td>
      <td class="mono hash-cell">${item.scenario_hash}</td>
      <td>${item.report_id ? `<a href="/reports/${item.report_id}/provenance">${item.report_id}</a>` : "-"}</td>
      <td>${item.updated_at}</td>
    </tr>
  `).join("");

  return `
    <table>
      <thead>
        <tr><th>Run</th><th>Status</th><th>Scenario Hash</th><th>Report</th><th>Updated</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

document.addEventListener("DOMContentLoaded", async () => {
  const target = document.getElementById("runsTable");
  try {
    const response = await fetch("/api/runs");
    const payload = await response.json();
    target.innerHTML = renderTable(payload.items || []);
  } catch (error) {
    target.textContent = `Failed to load runs: ${error.message}`;
  }
});

