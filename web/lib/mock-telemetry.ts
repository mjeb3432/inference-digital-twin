import type { LogEvent, Rack, BenchmarkResult, FacilityMetrics } from "@/types/forge";

const SOURCES = [
  "pdu-42a", "pdu-18b", "cdu-07", "cdu-12",
  "switch-leaf-12", "switch-spine-01",
  "rack-ctrl-b14", "rack-ctrl-a08",
  "inference-router", "cooling-ctrl",
];

const EVENT_TEMPLATES: { message: string; severity: LogEvent["severity"] }[] = [
  { message: "Breaker C7 at 87% nominal — monitor for thermal rise", severity: "warn" },
  { message: "Coolant return temp 34.2°C — above setpoint by 2.2°C", severity: "warn" },
  { message: "Model cold-loaded on rack CR-04-B", severity: "info" },
  { message: "Spot price tick: $0.42 / 1M output tokens", severity: "info" },
  { message: "NVLink fabric init complete — 8× H100 SXM5 online", severity: "nominal" },
  { message: "PDU-02 voltage spike — 12.4% over threshold, auto-capped", severity: "crit" },
  { message: "Cooling loop LC-07 pressure nominal — 2.1 bar", severity: "nominal" },
  { message: "Inference latency P99 within SLA (284ms < 300ms)", severity: "nominal" },
  { message: "TOR switch link-down on port 0/14 — failover activated", severity: "crit" },
  { message: "HBM3 ECC correctable error count elevated on GPU-3", severity: "warn" },
];

let eventCounter = 0;

export function generateEvent(): LogEvent {
  const template = EVENT_TEMPLATES[Math.floor(Math.random() * EVENT_TEMPLATES.length)];
  const source = SOURCES[Math.floor(Math.random() * SOURCES.length)];
  return {
    id: `evt-${++eventCounter}`,
    ts: new Date().toISOString(),
    source,
    message: template.message,
    severity: template.severity,
  };
}

export function mockFacilityMetrics(): FacilityMetrics {
  return {
    totalCapexUsd: 142_800_000,
    annualOpexUsd: 28_400_000,
    targetPue: 1.42,
    uptimePct: 99.97,
  };
}

export function mockBenchmark(): BenchmarkResult {
  return {
    ttftMs: 84 + Math.random() * 10,
    tpsK: 2.84 + Math.random() * 0.1,
    mfuPct: 61.3 + Math.random() * 2,
    powerW: 698 + Math.random() * 20,
    carbonKgPerHour: 0.14 + Math.random() * 0.01,
    model: "llama-3-70b",
  };
}

export function mockRackGrid(rows = 4, cols = 5): Rack[] {
  const types: Rack["type"][] = ["compute", "compute", "compute", "cooling", "power", "network"];
  const gpuModels = ["H100 SXM5", "H100 NVL", "A100 SXM"];
  const racks: Rack[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const type = types[Math.floor(Math.random() * types.length)];
      const id = `${String.fromCharCode(65 + r)}${String(c + 1).padStart(2, "0")}`;
      racks.push({
        id: `rack-${id}`,
        row: r,
        col: c,
        type,
        status: r === 1 && c === 2 ? "installing" : "nominal",
        label: type === "compute" ? "SERVER RACK" : type.toUpperCase(),
        units: 42,
        powerDraw: type === "compute" ? 680 + Math.random() * 40 : 80,
        tempC: 28 + Math.random() * 8,
        gpuModel: type === "compute" ? gpuModels[0] : undefined,
        gpuCount: type === "compute" ? 8 : undefined,
        utilPct: type === "compute" ? 70 + Math.random() * 25 : undefined,
      });
    }
  }
  return racks;
}
