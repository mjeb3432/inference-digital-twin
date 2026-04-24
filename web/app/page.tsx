"use client";

import { useState, useEffect, useCallback } from "react";
import { TopStrip } from "@/components/ui/top-strip";
import { PeekStrip } from "@/components/ui/peek-strip";
import { PhaseTimeline } from "@/components/timeline/phase-timeline";
import { InspectorPanel } from "@/components/inspector/inspector-panel";
import { generateEvent, mockRackGrid } from "@/lib/mock-telemetry";
import type { InspectorTarget, LogEvent, Phase, Rack } from "@/types/forge";

const PHASES: Phase[] = [
  { index: 0, id: "site",          label: "Site Selection",   status: "complete" },
  { index: 1, id: "power",         label: "Power Grid",       status: "complete" },
  { index: 2, id: "cooling",       label: "Cooling Systems",  status: "complete" },
  { index: 3, id: "compute",       label: "Compute Array",    status: "active"   },
  { index: 4, id: "networking",    label: "Networking",       status: "pending"  },
  { index: 5, id: "runtime",       label: "Runtime Config",   status: "pending"  },
  { index: 6, id: "orchestration", label: "Orchestration",    status: "pending"  },
  { index: 7, id: "results",       label: "Results",          status: "pending"  },
];

const RACK_TYPE_COLOR: Record<Rack["type"], string> = {
  compute:  "var(--accent-alt)",
  storage:  "var(--info)",
  network:  "#8B5CF6",
  power:    "var(--warn)",
  cooling:  "var(--nominal)",
};

function formatElapsed(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

function rackToInspector(rack: Rack): InspectorTarget {
  return {
    type: "rack",
    id: rack.id,
    label: rack.label,
    metrics: {
      TYPE:       rack.type.toUpperCase(),
      STATUS:     rack.status.toUpperCase(),
      UNITS:      `${rack.units}U`,
      POWER_DRAW: `${rack.powerDraw.toFixed(0)}W`,
      TEMP:       `${rack.tempC.toFixed(1)}°C`,
      ...(rack.gpuModel && { GPU_MODEL: rack.gpuModel }),
      ...(rack.gpuCount && { GPU_COUNT: String(rack.gpuCount) }),
      ...(rack.utilPct  && { GPU_UTIL:  `${rack.utilPct.toFixed(1)}%` }),
    },
  };
}

export default function ForgePage() {
  const [elapsed, setElapsed]     = useState(0);
  const [events, setEvents]       = useState<LogEvent[]>([]);
  const [racks, setRacks]         = useState<Rack[]>([]);
  const [inspector, setInspector] = useState<InspectorTarget | null>(null);

  useEffect(() => {
    // Initialize random data client-side only to avoid hydration mismatch
    setRacks(mockRackGrid(4, 5));
    setEvents(Array.from({ length: 8 }, () => generateEvent()));
  }, []);

  useEffect(() => {
    const id = setInterval(() => setElapsed((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const delay = 1_000 + Math.random() * 7_000;
      timeout = setTimeout(() => {
        setEvents((prev) => [generateEvent(), ...prev].slice(0, 50));
        schedule();
      }, delay);
    };
    schedule();
    return () => clearTimeout(timeout);
  }, []);

  const handleRackClick = useCallback((rack: Rack) => {
    setInspector((prev) => (prev?.id === rack.id ? null : rackToInspector(rack)));
  }, []);

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg-0)" }}>
      <TopStrip
        site="site-01"
        phase={4}
        totalPhases={8}
        elapsed={formatElapsed(elapsed)}
      />

      <div className="flex flex-1 overflow-hidden relative">
        <PhaseTimeline phases={PHASES} />

        <main className="flex-1 relative overflow-hidden">
          {/* Grid background — R3F scene replaces this in Phase 3 */}
          <div
            className="absolute inset-0"
            style={{
              background: "var(--bg-0)",
              backgroundImage: `
                linear-gradient(var(--border) 1px, transparent 1px),
                linear-gradient(90deg, var(--border) 1px, transparent 1px)
              `,
              backgroundSize: "48px 48px",
            }}
          >
            <div className="absolute inset-8 flex items-center justify-center">
              <div
                className="grid gap-2 w-full"
                style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))", maxWidth: "700px" }}
              >
                {racks.map((rack) => {
                  const isSelected = inspector?.id === rack.id;
                  const isInstalling = rack.status === "installing";
                  return (
                    <button
                      key={rack.id}
                      onClick={() => handleRackClick(rack)}
                      className="aspect-[4/3] rounded border text-2xs font-mono flex flex-col items-center justify-center gap-1 transition-all"
                      style={{
                        borderColor: isSelected
                          ? "var(--accent)"
                          : RACK_TYPE_COLOR[rack.type],
                        background: isSelected
                          ? "var(--accent-dim)"
                          : "rgba(15,17,20,0.92)",
                        boxShadow: isSelected
                          ? "0 0 0 1px var(--accent), 0 0 12px rgba(245,166,35,0.2)"
                          : isInstalling
                          ? "0 0 8px rgba(245,166,35,0.25)"
                          : "none",
                      }}
                    >
                      <span
                        className="font-mono text-2xs"
                        style={{ color: RACK_TYPE_COLOR[rack.type] }}
                      >
                        {rack.id.replace("rack-", "").toUpperCase()}
                      </span>
                      <span className="text-[var(--text-2)] text-2xs leading-none">
                        {rack.label}
                      </span>
                      {isInstalling && (
                        <span className="text-[var(--accent)] text-2xs animate-pulse-slow">
                          ···
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <p className="absolute bottom-3 left-1/2 -translate-x-1/2 text-2xs font-mono text-[var(--text-2)]">
              placeholder grid — R3F isometric scene replaces this in Phase 3
            </p>
          </div>

          <InspectorPanel
            target={inspector}
            onClose={() => setInspector(null)}
          />
        </main>
      </div>

      <PeekStrip events={events} />
    </div>
  );
}
