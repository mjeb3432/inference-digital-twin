"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import type { Phase } from "@/types/forge";

const STATUS_ICON: Record<Phase["status"], React.ReactNode> = {
  complete: <span className="text-[var(--nominal)]">✓</span>,
  active: (
    <span
      className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse-slow"
    />
  ),
  pending: <span className="inline-block w-1.5 h-1.5 rounded-full border border-[var(--border-strong)]" />,
};

interface PhaseTimelineProps {
  phases: Phase[];
  className?: string;
}

export function PhaseTimeline({ phases, className }: PhaseTimelineProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      className={cn(
        "shrink-0 border-r border-[var(--border)] bg-[var(--bg-1)] flex flex-col overflow-hidden transition-all duration-200",
        className,
      )}
      style={{
        width: collapsed ? "var(--timeline-w-collapsed)" : "var(--timeline-w)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
        {!collapsed && (
          <span className="text-2xs font-mono text-[var(--text-2)] tracking-widest uppercase">
            Build Timeline
          </span>
        )}
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="text-[var(--text-2)] hover:text-[var(--text-1)] transition-colors text-xs ml-auto"
          aria-label={collapsed ? "Expand timeline" : "Collapse timeline"}
        >
          {collapsed ? "▸" : "◂"}
        </button>
      </div>

      {/* Phase list */}
      {!collapsed && (
        <ol className="flex flex-col py-2 overflow-y-auto">
          {phases.map((phase) => (
            <li
              key={phase.id}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 text-xs font-mono transition-colors",
                phase.status === "active" && "bg-[var(--accent-dim)]",
                phase.status === "complete" && "text-[var(--text-2)]",
                phase.status === "pending" && "text-[var(--text-2)]",
                phase.status === "active" && "text-[var(--accent)]",
              )}
            >
              <span className="w-4 shrink-0 text-right text-[var(--text-2)]">
                {String(phase.index + 1).padStart(2, "0")}
              </span>
              <span className="shrink-0 flex items-center justify-center w-4">
                {STATUS_ICON[phase.status]}
              </span>
              <span className="truncate tracking-wide uppercase text-2xs leading-tight">
                {phase.label}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
