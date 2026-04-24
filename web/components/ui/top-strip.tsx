"use client";

import { cn } from "@/lib/cn";

interface TopStripProps {
  site?: string;
  phase?: number;
  totalPhases?: number;
  elapsed?: string;
  className?: string;
}

export function TopStrip({
  site = "site-01",
  phase = 4,
  totalPhases = 8,
  elapsed = "00:00:00",
  className,
}: TopStripProps) {
  return (
    <header
      className={cn(
        "flex items-center justify-between px-4 border-b border-[var(--border)]",
        "bg-[var(--bg-1)] shrink-0",
        className,
      )}
      style={{ height: "var(--top-strip-h)" }}
    >
      {/* Left: wordmark */}
      <div className="flex items-center gap-3">
        <span
          className="font-display text-lg font-bold tracking-tight text-[var(--text-0)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          ◆ THE FORGE
        </span>
        <span className="text-[var(--border-strong)] select-none">|</span>
        <span className="text-xs font-mono text-[var(--text-2)]">{site}</span>
      </div>

      {/* Center: phase + elapsed */}
      <div className="flex items-center gap-4 text-xs font-mono">
        <span className="text-[var(--text-2)]">
          phase{" "}
          <span className="text-[var(--accent)] font-medium">
            {phase}/{totalPhases}
          </span>
        </span>
        <span className="text-[var(--text-2)]">
          T+<span className="text-[var(--text-1)]">{elapsed}</span>
        </span>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-2">
        <button className="text-xs text-[var(--text-2)] hover:text-[var(--text-1)] transition-colors px-2 py-1 rounded border border-transparent hover:border-[var(--border)]">
          export
        </button>
      </div>
    </header>
  );
}
