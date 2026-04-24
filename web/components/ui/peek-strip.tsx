"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import type { LogEvent } from "@/types/forge";

const SEVERITY_COLOR: Record<LogEvent["severity"], string> = {
  nominal: "var(--nominal)",
  info:    "var(--info)",
  warn:    "var(--warn)",
  crit:    "var(--crit)",
};

interface PeekStripProps {
  events: LogEvent[];
  className?: string;
}

export function PeekStrip({ events, className }: PeekStripProps) {
  const [expanded, setExpanded] = useState(false);
  const latest = events[0];

  return (
    <div
      className={cn(
        "shrink-0 border-t border-[var(--border)] bg-[var(--bg-1)]",
        "transition-all duration-200 ease-out overflow-hidden",
        className,
      )}
      style={{ height: expanded ? "320px" : "var(--bottom-strip-h)" }}
    >
      {/* Peek row — always visible */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-3 w-full px-4 text-left hover:bg-[var(--bg-2)] transition-colors"
        style={{ height: "var(--bottom-strip-h)" }}
      >
        <span className="text-[var(--text-2)] text-xs font-mono">
          {expanded ? "▸" : "▾"} events
        </span>
        {latest && (
          <>
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: SEVERITY_COLOR[latest.severity] }}
            />
            <span className="text-xs font-mono text-[var(--text-2)]">
              {latest.ts.slice(11, 19)}
            </span>
            <span className="text-xs font-mono text-[var(--text-2)]">
              {latest.source}
            </span>
            <span className="text-xs font-mono text-[var(--text-1)] truncate">
              {latest.message}
            </span>
          </>
        )}
      </button>

      {/* Expanded log */}
      {expanded && (
        <div className="overflow-y-auto" style={{ height: "calc(320px - var(--bottom-strip-h))" }}>
          {events.map((evt) => (
            <div
              key={evt.id}
              className="flex items-start gap-3 px-4 py-1.5 border-b border-[var(--border)] hover:bg-[var(--bg-2)] transition-colors"
            >
              <div
                className="w-0.5 self-stretch rounded shrink-0"
                style={{ background: SEVERITY_COLOR[evt.severity] }}
              />
              <span className="text-2xs font-mono text-[var(--text-2)] shrink-0 pt-0.5">
                {evt.ts.slice(11, 19)}
              </span>
              <span className="text-2xs font-mono text-[var(--text-2)] shrink-0 pt-0.5 w-24 truncate">
                {evt.source}
              </span>
              <span className="text-2xs font-mono text-[var(--text-1)]">
                {evt.message}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
