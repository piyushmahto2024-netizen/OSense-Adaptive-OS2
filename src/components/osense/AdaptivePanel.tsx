import { ArrowRight, CheckCircle2, Cpu, Play, Save, Sparkles } from "lucide-react";
import { useState } from "react";
import { recommend } from "@/lib/osense/adaptive";
import { runScheduler } from "@/lib/osense/scheduling";
import { saveExperiment } from "@/lib/osense/history";
import { ALGORITHM_LABELS, type AdaptiveRecommendation, type OsProcess, type ScheduleResult } from "@/lib/osense/types";
import { NumberField, OSButton, Panel, StatCard } from "./ui-bits";
import { GanttChart } from "./GanttChart";
import { LiveSourcePanel, type SourceMode } from "./LiveTelemetry";
import { useLiveTelemetry } from "@/hooks/use-live-telemetry";
import { analyzePressure, liveToWorkload, topProcesses } from "@/lib/osense/liveTelemetry";

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

export function AdaptivePanel({ processes: synthetic, onSave }: { processes: OsProcess[]; onSave: () => void }) {
  const [quantum, setQuantum] = useState(2);
  const [rec, setRec] = useState<AdaptiveRecommendation | null>(null);
  const [mode, setMode] = useState<SourceMode>("synthetic");
  const [top, setTop] = useState(8);
  const [liveProcs, setLiveProcs] = useState<OsProcess[] | null>(null);
  const [comparison, setComparison] = useState<{ before: ScheduleResult; after: ScheduleResult; workload: OsProcess[] } | null>(null);
  const live = useLiveTelemetry(mode === "live");
  const processes = mode === "live" && liveProcs ? liveProcs : synthetic;
  const pressure = mode === "live" ? analyzePressure(live.history) : null;
  const applyLive = () => {
    if (!live.latest) return;
    const w = liveToWorkload(topProcesses(live.latest.processes, top, "cpu"));
    setLiveProcs(w);
    setRec(recommend(w, quantum));
    setComparison(null);
  };

  const analyze = () => {
    setRec(recommend(processes, quantum));
    setComparison(null);
  };

  // Run both algorithms on one immutable workload snapshot for a fair comparison.
  const useSuggestedAlgorithm = () => {
    if (!rec || processes.length === 0) return;
    const workload = processes.map((p) => ({ ...p }));
    const before = runScheduler("fcfs", workload, quantum);
    const after = runScheduler(rec.algorithm, workload, rec.quantum ?? quantum);
    setComparison({ before, after, workload });
  };

  const save = () => {
    if (!rec) return;
    saveExperiment({
      kind: "adaptive",
      title: `Adaptive engine → ${ALGORITHM_LABELS[rec.algorithm]}`,
      config: { quantum, processes },
      summary: rec.reason,
      data: { recommendation: rec, comparison },
    });
    onSave();
  };

  return (
    <div className="space-y-4">
      <Panel
        title="ADAPTIVE RESOURCE MANAGER"
        subtitle="Analyzes the workload, applies scheduling heuristics, then verifies by benchmarking every algorithm — and overrides itself when the numbers disagree."
      >
        <div className="mb-3 space-y-3">
          <LiveSourcePanel
            mode={mode} onModeChange={setMode} state={live} top={top} onTopChange={setTop}
            syntheticLabel="Synthetic / Preset Workload" applyLabel="Analyze live workload" onApply={applyLive}
            explanation={`Top-${top} live processes become an estimated workload; system pressure is judged over the last ${live.history.length} samples, not a single reading.`}
          />
          {pressure && (
            <div className="rounded-md border border-border p-3 text-xs">
              <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-primary">
                Live pressure · CPU {pressure.cpuPressure} (avg {pressure.avgCpu.toFixed(0)}%, peak {pressure.peakCpu.toFixed(0)}%) · RAM {pressure.memPressure} ({pressure.avgMem.toFixed(0)}%)
              </div>
              <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
                {pressure.notes.map((n) => <li key={n}>{n}</li>)}
              </ul>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <NumberField label="RR quantum (if chosen)" value={quantum} onChange={setQuantum} min={1} max={20} className="w-40" />
          <OSButton variant="primary" onClick={analyze} disabled={processes.length === 0}>
            <Sparkles className="h-3.5 w-3.5" /> Analyze & recommend
          </OSButton>
          {rec && (
            <OSButton variant="primary" onClick={useSuggestedAlgorithm}>
              <Play className="h-3.5 w-3.5" /> Use Suggested Algorithm
            </OSButton>
          )}
          {rec && (
            <OSButton onClick={save}>
              <Save className="h-3.5 w-3.5" /> Save experiment
            </OSButton>
          )}
        </div>
      </Panel>

      {rec && (
        <>
          <Panel>
            <div className="flex items-start gap-4">
              <div className="rounded-md border border-primary/40 bg-primary/10 p-3">
                <Cpu className="h-6 w-6 text-primary" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Recommended scheduler</div>
                <div className="mt-1 font-mono text-2xl font-bold text-primary">
                  {ALGORITHM_LABELS[rec.algorithm]}
                  {rec.quantum && <span className="ml-2 text-sm text-muted-foreground">q = {rec.quantum}</span>}
                </div>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-foreground/90">{rec.reason}</p>
              </div>
            </div>
          </Panel>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label="Processes" value={String(rec.features.processCount)} />
            <StatCard label="Avg burst" value={fmt(rec.features.avgBurst)} unit="t" />
            <StatCard label="Burst variation" value={fmt(rec.features.burstCV)} hint="coefficient of variation" />
            <StatCard label="Arrival spread" value={fmt(rec.features.arrivalSpread)} unit="t" />
            <StatCard label="Priority range" value={String(rec.features.priorityRange)} />
            <StatCard label="Short jobs" value={`${Math.round(rec.features.shortJobFraction * 100)}`} unit="%" hint="burst ≤ half the average" />
          </div>

          <Panel title="EMPIRICAL RANKING" subtitle="All six algorithms scored on this workload: 70% average waiting time + 30% average response time, normalized. Lower is better.">
            <div className="space-y-2">
              {rec.ranking.map((r, i) => (
                <div key={r.algorithm} className="flex items-center gap-3">
                  <span className="w-6 font-mono text-xs text-muted-foreground">#{i + 1}</span>
                  <span className={`w-56 truncate font-mono text-xs ${i === 0 ? "font-semibold text-primary" : "text-foreground"}`}>
                    {ALGORITHM_LABELS[r.algorithm]}
                  </span>
                  <div className="h-4 flex-1 overflow-hidden rounded-sm bg-muted/50">
                    <div
                      className="h-full rounded-sm"
                      style={{
                        width: `${Math.max(4, r.score * 100)}%`,
                        backgroundColor: i === 0 ? "var(--primary)" : "var(--chart-3)",
                      }}
                    />
                  </div>
                  <span className="w-24 text-right font-mono text-xs text-muted-foreground">wait {fmt(r.avgWaiting)}</span>
                  <span className="w-16 text-right font-mono text-xs text-muted-foreground">{r.score.toFixed(3)}</span>
                </div>
              ))}
            </div>
          </Panel>

          {comparison && (
            <div className="space-y-4">
              <Panel
                title="BEFORE VS AFTER COMPARISON"
                subtitle="Both simulations use the exact same workload. Before = FCFS baseline; After = recommended algorithm. These are simulation results, not changes to Windows’ actual scheduler."
              >
                <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
                  <span className="rounded-md border border-border px-3 py-2 font-mono">Before: {ALGORITHM_LABELS[comparison.before.algorithm]}</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <span className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 font-mono text-primary">After: {ALGORITHM_LABELS[comparison.after.algorithm]}</span>
                  <span className="text-xs text-muted-foreground">{comparison.workload.length} identical processes</span>
                </div>
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-border bg-muted/40 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      <th className="px-3 py-2 text-left">Metric</th><th className="px-3 py-2 text-right">Before (FCFS)</th><th className="px-3 py-2 text-right">After ({ALGORITHM_LABELS[comparison.after.algorithm]})</th><th className="px-3 py-2 text-right">Change</th>
                    </tr></thead>
                    <tbody>
                      {[
                        { label: "Average waiting time", key: "avgWaiting" as const, lower: true, unit: " t" },
                        { label: "Average turnaround time", key: "avgTurnaround" as const, lower: true, unit: " t" },
                        { label: "Average response time", key: "avgResponse" as const, lower: true, unit: " t" },
                        { label: "Throughput", key: "throughput" as const, lower: false, unit: " proc/t" },
                        { label: "CPU utilization", key: "cpuUtilization" as const, lower: false, unit: "%" },
                        { label: "Context switches", key: "contextSwitches" as const, lower: true, unit: "" },
                      ].map((metric) => {
                        const before = comparison.before.metrics[metric.key];
                        const after = comparison.after.metrics[metric.key];
                        const delta = after - before;
                        const improved = Math.abs(delta) < 0.000001 ? null : metric.lower ? delta < 0 : delta > 0;
                        const change = Math.abs(before) < 0.000001 ? (Math.abs(delta) < 0.000001 ? "0" : "—") : `${delta > 0 ? "+" : ""}${((delta / Math.abs(before)) * 100).toFixed(1)}%`;
                        return (
                          <tr key={metric.key} className="border-b border-border/60 last:border-0">
                            <td className="px-3 py-2">{metric.label}</td>
                            <td className="px-3 py-2 text-right font-mono">{fmt(before)}{metric.unit}</td>
                            <td className="px-3 py-2 text-right font-mono">{fmt(after)}{metric.unit}</td>
                            <td className={`px-3 py-2 text-right font-mono ${improved === true ? "text-emerald-500" : improved === false ? "text-destructive" : "text-muted-foreground"}`}>{change}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">Lower is better for waiting, turnaround, response, and context switches. Higher is better for throughput and CPU utilization. Changes are relative to the FCFS baseline.</p>
              </Panel>

              <div className="grid gap-4 lg:grid-cols-2">
                <Panel title={`BEFORE · ${ALGORITHM_LABELS[comparison.before.algorithm]}`} subtitle={`Total time ${fmt(comparison.before.metrics.totalTime)} ticks`}>
                  <GanttChart segments={comparison.before.segments} />
                </Panel>
                <Panel title={`AFTER · ${ALGORITHM_LABELS[comparison.after.algorithm]}`} subtitle={`Total time ${fmt(comparison.after.metrics.totalTime)} ticks`}>
                  <GanttChart segments={comparison.after.segments} />
                </Panel>
              </div>
              <Panel>
                <div className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <p>Comparison complete. The recommended algorithm was simulated on the same process list as the FCFS baseline. To check your real PC, continue observing the live CPU/RAM panel after taking any suggested action; this button does not change Windows’ scheduler.</p>
                </div>
              </Panel>
            </div>
          )}
        </>
      )}
    </div>
  );
}
