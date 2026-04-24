export type RackStatus = "nominal" | "warn" | "crit" | "installing" | "offline";
export type PhaseStatus = "complete" | "active" | "pending";
export type EventSeverity = "info" | "nominal" | "warn" | "crit";

export interface Rack {
  id: string;
  row: number;
  col: number;
  type: "compute" | "storage" | "network" | "power" | "cooling";
  status: RackStatus;
  label: string;
  units: number;
  powerDraw: number;   // watts
  tempC: number;
  gpuModel?: string;
  gpuCount?: number;
  utilPct?: number;
}

export interface Phase {
  index: number;
  id: string;
  label: string;
  status: PhaseStatus;
}

export interface FacilityMetrics {
  totalCapexUsd: number;
  annualOpexUsd: number;
  targetPue: number;
  uptimePct: number;
}

export interface InspectorTarget {
  type: "rack" | "pdu" | "crac" | "cabling";
  id: string;
  label: string;
  metrics: Record<string, string | number>;
}

export interface LogEvent {
  id: string;
  ts: string;           // ISO
  source: string;       // e.g. "pdu-42a", "rack-ctrl-b14"
  message: string;
  severity: EventSeverity;
}

export interface BenchmarkResult {
  ttftMs: number;
  tpsK: number;
  mfuPct: number;
  powerW: number;
  carbonKgPerHour: number;
  model: string;
}
