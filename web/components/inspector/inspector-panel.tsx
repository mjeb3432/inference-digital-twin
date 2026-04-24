"use client";

import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/cn";
import type { InspectorTarget } from "@/types/forge";

interface InspectorPanelProps {
  target: InspectorTarget | null;
  onClose: () => void;
  className?: string;
}

export function InspectorPanel({ target, onClose, className }: InspectorPanelProps) {
  return (
    <AnimatePresence>
      {target && (
        <motion.aside
          key={target.id}
          initial={{ x: "var(--inspector-w)", opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: "var(--inspector-w)", opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className={cn(
            "absolute right-0 top-0 bottom-0 z-20",
            "border-l border-[var(--border)] bg-[var(--bg-1)]",
            "flex flex-col overflow-hidden",
            className,
          )}
          style={{ width: "var(--inspector-w)" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
            <div>
              <p className="text-2xs font-mono text-[var(--text-2)] uppercase tracking-widest">
                {target.type}
              </p>
              <p
                className="text-base font-mono font-medium text-[var(--accent)] mt-0.5"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                {target.id.toUpperCase()}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-[var(--text-2)] hover:text-[var(--text-0)] transition-colors text-sm"
              aria-label="Close inspector"
            >
              ✕
            </button>
          </div>

          {/* Label */}
          <div className="px-4 py-2 border-b border-[var(--border)]">
            <p className="text-xs font-mono text-[var(--text-1)]">{target.label}</p>
          </div>

          {/* Metrics */}
          <div className="flex-1 overflow-y-auto">
            <dl className="py-2">
              {Object.entries(target.metrics).map(([key, value]) => (
                <div
                  key={key}
                  className="flex justify-between px-4 py-1.5 border-b border-[var(--border)] last:border-0"
                >
                  <dt className="text-2xs font-mono text-[var(--text-2)] uppercase tracking-wider">
                    {key}
                  </dt>
                  <dd className="text-2xs font-mono text-[var(--text-1)] text-right">
                    {String(value)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
