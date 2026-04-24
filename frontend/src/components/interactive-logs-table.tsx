import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Minimal placeholder. Replace with the full 21st.dev
// interactive-logs-table when you're ready — the framer-motion
// layout animation will plug straight in since we already have
// framer-motion as a dep.
type LogRow = {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'ok';
  message: string;
  detail: string;
};

const SEED: LogRow[] = [
  { id: '1', timestamp: '14:02:11', level: 'ok',   message: 'PHASE 1 · SITE SELECTION confirmed',  detail: '12MW FACILITY-01 · permit #A-2026-0481' },
  { id: '2', timestamp: '14:02:42', level: 'info', message: 'Switchgear option A selected',        detail: '2N topology, 4x2.5MVA transformers, medium voltage' },
  { id: '3', timestamp: '14:03:07', level: 'warn', message: 'Cooling spec exceeds budget envelope', detail: 'Hybrid liquid + air adds +$4.2M CAPEX. Accept?' },
];

const levelColor: Record<LogRow['level'], string> = {
  ok:    'text-forge-nominal',
  info:  'text-white/80',
  warn:  'text-forge-amber',
  error: 'text-forge-crit',
};

export function InteractiveLogsTable() {
  const [openRow, setOpenRow] = useState<string | null>(null);

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-mono text-xs tracking-[0.22em] text-forge-amber uppercase">Build Terminal</h3>
        <span className="font-mono text-[10px] text-white/40 uppercase tracking-widest">{SEED.length} events</span>
      </div>

      <div className="divide-y divide-forge-line font-mono text-sm">
        {SEED.map((row) => {
          const open = openRow === row.id;
          return (
            <motion.div key={row.id} layout className="cursor-pointer" onClick={() => setOpenRow(open ? null : row.id)}>
              <motion.div layout className="flex items-center gap-4 py-2">
                <span className="text-white/40 text-xs">{row.timestamp}</span>
                <span className={`uppercase text-[10px] tracking-widest ${levelColor[row.level]}`}>{row.level}</span>
                <span className="flex-1 text-white/80">{row.message}</span>
                <span className="text-white/30 text-xs">{open ? '−' : '+'}</span>
              </motion.div>
              <AnimatePresence initial={false}>
                {open && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="overflow-hidden"
                  >
                    <p className="pb-3 pl-28 text-xs text-white/55">{row.detail}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

export default InteractiveLogsTable;
