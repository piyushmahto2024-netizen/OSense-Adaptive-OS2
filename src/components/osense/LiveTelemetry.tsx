import { Radio } from "lucide-react";
import type { PollerState } from "@/lib/osense/liveTelemetry";
import { cn } from "@/lib/utils";
import { StatCard } from "./ui-bits";

export type SourceMode = "synthetic" | "live";

export function SourceToggle({ value, onChange, syntheticLabel, liveLabel }: {
  value: SourceMode;
  onChange: (v: SourceMode) => void;
  syntheticLabel: string;
  liveLabel: string;
}) {
  return (
    <div role="tablist" aria-label="Workload source" className="inline-flex rounded-md border border-border bg-background p-0.5">
      {(["synthetic", "live"] as const).map((m) => (
        <button
          key={m}
          type="button"
          role="tab"
          aria-selected={value === m}
          onClick={() => onChange(m)}
          className={cn(
            "rounded px-3 py-1.5 font-mono text-xs transition-colors",
            value === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {m === "synthetic" ? syntheticLabel : liveLabel}
        </button>
      ))}
    </div>
  );
}

export function ConnectionStatus({ state }: { state: PollerState }) {
  const color =
    state.status === "connected" ? "bg-primary" : state.status === "connecting" ? "bg-accent animate-pulse" : "bg-destructive";
  const label = { connected: "Live · connected", connecting: "Connecting…", disconnected: "Monitor not reachable", error: "Monitor error" }[state.status];
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3 font-mono text-xs">
        <span className="inline-flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", color)} />
          <Radio className="h-3.5 w-3.5 text-muted-foreground" />
          {label}
        </span>
        {state.lastUpdate && (
          <span className="text-muted-foreground">last update {new Date(state.lastUpdate).toLocaleTimeString()}</span>
        )}
        {state.latest && state.latest.skippedProcesses > 0 && (
          <span className="text-muted-foreground">{state.latest.skippedProcesses} processes skipped (exited / access denied)</span>
        )}
      </div>
      {state.error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-foreground">
          <p>{state.error}</p>
          <p className="mt-1 text-muted-foreground">
            On the same Windows PC run: <code className="font-mono">pip install -r scripts/requirements.txt</code> then{" "}
            <code className="font-mono">python scripts/windows_monitor.py</code>. Synthetic mode keeps working meanwhile.
          </p>
        </div>
      )}
    </div>
  );
}

export function LiveSystemStats({ state }: { state: PollerState }) {
  const s = state.latest;
  if (!s) return null;
  const gb = (mb: number) => (mb / 1024).toFixed(1);
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-widest text-primary">Measured (real Windows values)</div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="CPU" value={s.cpuPercent.toFixed(0)} unit="%" hint={s.perCore.length ? `${s.perCore.length} logical cores` : undefined} />
        <StatCard label="RAM used" value={gb(s.memory.usedMB)} unit={`/ ${gb(s.memory.totalMB)} GB`} hint={`${s.memory.percent.toFixed(0)}%`} />
        <StatCard label="RAM available" value={gb(s.memory.availableMB)} unit="GB" />
        <StatCard label="Uptime" value={(s.uptimeSec / 3600).toFixed(1)} unit="h" hint={s.disk.percent !== null ? `disk ${s.disk.percent.toFixed(0)}% full` : undefined} />
      </div>
    </div>
  );
}

export function LiveSourcePanel({ mode, onModeChange, state, syntheticLabel, applyLabel, onApply, explanation, top, onTopChange }: {
  mode: SourceMode;
  onModeChange: (m: SourceMode) => void;
  state: PollerState;
  syntheticLabel: string;
  applyLabel: string;
  onApply: () => void;
  explanation: string;
  top: number;
  onTopChange: (n: number) => void;
}) {
  return (
    <div className="space-y-3 rounded-md border border-border bg-card/40 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <SourceToggle value={mode} onChange={onModeChange} syntheticLabel={syntheticLabel} liveLabel="Live Windows System" />
        {mode === "live" && (
          <>
            <label className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
              Top
              <input
                type="number" min={1} max={20} value={top}
                onChange={(e) => onTopChange(Math.min(20, Math.max(1, Math.round(Number(e.target.value) || 1))))}
                className="w-16 rounded border border-border bg-background px-2 py-1 text-foreground"
              />
              processes
            </label>
            <button
              type="button" onClick={onApply} disabled={!state.latest}
              className="rounded-md border border-primary/50 bg-primary/10 px-3 py-1.5 font-mono text-xs text-primary disabled:opacity-40"
            >
              {applyLabel}
            </button>
          </>
        )}
      </div>
      {mode === "live" && (
        <>
          <ConnectionStatus state={state} />
          <LiveSystemStats state={state} />
          <p className="text-xs leading-relaxed text-muted-foreground">
            <span className="text-accent">Estimated:</span> {explanation} OSense only reads measurements — it never changes how Windows schedules or allocates.
          </p>
        </>
      )}
    </div>
  );
}
