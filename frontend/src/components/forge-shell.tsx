import { FlickeringGrid } from './flickering-grid';
import { CpuArchitecture } from './cpu-architecture';
import { InteractiveLogsTable } from './interactive-logs-table';
import { SplineScene } from './spline-scene';

// Main Forge control-room UI. The three rails (decision / canvas /
// inspector) mirror the vanilla-JS layout in forge.html so the
// FastAPI scenario JSON + event log shape don't have to change.
export function ForgeShell() {
  return (
    <div className="relative grid grid-cols-[320px_1fr_320px] h-screen w-screen bg-forge-bg text-white">
      {/* Flickering grid fills the background of the center canvas */}
      <div className="absolute inset-0 opacity-[0.06] pointer-events-none">
        <FlickeringGrid />
      </div>

      {/* LEFT — decision rail */}
      <aside className="relative z-10 border-r border-forge-line bg-forge-panel/80 backdrop-blur-sm p-5 overflow-y-auto">
        <p className="font-mono text-[10px] tracking-[0.32em] text-white/50 uppercase">
          AI Data Center Construction Simulator
        </p>
        <h1 className="font-display text-3xl font-bold mt-2 tracking-tight">THE FORGE</h1>

        <section className="mt-6">
          <h2 className="font-mono text-xs tracking-[0.22em] text-forge-amber uppercase mb-3">
            Build Timeline
          </h2>
          {/* Phase list — wire to /api/phases once endpoint returns JSON */}
          <ol id="phaseTimeline" className="space-y-1.5 text-sm text-white/80" />
        </section>

        <section className="mt-8">
          <h2 className="font-mono text-xs tracking-[0.22em] text-forge-amber uppercase mb-3">
            Facility Metrics
          </h2>
          <dl className="space-y-2 text-sm">
            <MetricRow label="Total CAPEX"    id="capexTicker"      value="$0" />
            <MetricRow label="Annual OPEX"    id="annualOpex"       value="$0" />
            <MetricRow label="Target PUE"     id="targetPue"        value="2.00" />
            <MetricRow label="Uptime Proj."   id="uptimeProjection" value="0.000%" />
          </dl>
        </section>
      </aside>

      {/* CENTER — construction canvas + logs */}
      <main className="relative z-10 flex flex-col overflow-hidden">
        <header className="flex items-center justify-between px-6 py-4 border-b border-forge-line">
          <div>
            <p className="font-mono text-[10px] tracking-[0.32em] text-white/50 uppercase">Center Canvas</p>
            <h2 className="font-display text-xl font-semibold tracking-tight">Live Construction View</h2>
          </div>
          <span className="font-mono text-[10px] tracking-[0.22em] text-forge-nominal uppercase flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-forge-nominal shadow-[0_0_8px_rgba(74,222,128,0.9)]" />
            Site Acquired
          </span>
        </header>

        <section className="flex-1 relative">
          {/* Spline 3D scene (optional, lazy-loaded) */}
          <SplineScene />
          {/* CPU architecture overlay while the scene is empty */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <CpuArchitecture />
          </div>
        </section>

        <section className="border-t border-forge-line bg-forge-panel/50 max-h-[40%] overflow-hidden">
          <InteractiveLogsTable />
        </section>
      </main>

      {/* RIGHT — inspector */}
      <aside className="relative z-10 border-l border-forge-line bg-forge-panel/80 backdrop-blur-sm p-5 overflow-y-auto">
        <h2 className="font-mono text-xs tracking-[0.22em] text-forge-amber uppercase">Deployment</h2>
        <p className="mt-2 text-sm text-white/80">Ready</p>
        <div className="mt-2 h-1 bg-forge-line rounded overflow-hidden">
          <div className="h-full bg-forge-amber w-0 transition-all duration-500" />
        </div>

        <h2 className="mt-8 font-mono text-xs tracking-[0.22em] text-forge-amber uppercase">Inspector</h2>
        <p className="mt-2 text-xs text-white/55 uppercase tracking-wider">
          Hover or select an element to view costs, timelines, and tradeoffs.
        </p>
      </aside>
    </div>
  );
}

function MetricRow({ label, id, value }: { label: string; id: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-white/60 uppercase text-[11px] tracking-wider">{label}</dt>
      <dd id={id} className="font-mono text-forge-amber">{value}</dd>
    </div>
  );
}
