function renderTable(items) {
  if (!items.length) {
    return "<p>No reports yet.</p>";
  }

  const rows = items.map((item) => `
    <tr>
      <td><a href="/reports/${item.report_id}/provenance">${item.report_id}</a></td>
      <td><a href="/runs/${item.run_id}">${item.run_id}</a></td>
      <td>${item.created_at}</td>
    </tr>
  `).join("");

  return `
    <table>
      <thead>
        <tr><th>Report</th><th>Run</th><th>Created</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

document.addEventListener("DOMContentLoaded", async () => {
  const target = document.getElementById("artifactsTable");
  try {
    const response = await fetch("/api/reports");
    const payload = await response.json();
    target.innerHTML = renderTable(payload.items || []);
  } catch (error) {
    target.textContent = `Failed to load artifacts: ${error.message}`;
  }
});
