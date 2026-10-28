import { Download, Play, Save } from "lucide-react";
import { useMemo, useState } from "react";
import { runScheduler } from "@/lib/osense/scheduling";
import { downloadCSV, downloadJSON, printReport } from "@/lib/osense/export";
import { saveExperiment } from "@/lib/osense/history";
import { ALGORITHM_LABELS, type OsProcess, type ScheduleResult, type SchedulingAlgorithm } from "@/lib/osense/types";
import { GanttChart } from "./GanttChart";
import { NumberField, OSButton, Panel, SelectField, StatCard } from "./ui-bits";
import { LiveSourcePanel, type SourceMode } from "./LiveTelemetry";
import { useLiveTelemetry } from "@/hooks/use-live-telemetry";
import { liveToWorkload, topProcesses } from "@/lib/osense/liveTelemetry";

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

export function SchedulingLab({ processes: synthetic, onSave }: { processes: OsProcess[]; onSave: () => void }) {
  const [algorithm, setAlgorithm] = useState<SchedulingAlgorithm>("fcfs");
  const [quantum, setQuantum] = useState(2);
  const [result, setResult] = useState<ScheduleResult | null>(null);
  const [mode, setMode] = useState<SourceMode>("synthetic");
  const [top, setTop] = useState(8);
  const [liveProcs, setLiveProcs] = useState<OsProcess[] | null>(null);
  const live = useLiveTelemetry(mode === "live");
  const processes = mode === "live" && liveProcs ? liveProcs : synthetic;
  const applyLive = () => {
    if (!live.latest) return;
    setLiveProcs(liveToWorkload(topProcesses(live.latest.processes, top, "cpu")));
    setResult(null);
  };

  const valid = processes.length > 0 && processes.every((p) => p.burst > 0);

  const run = () => {
    const r = runScheduler(algorithm, processes, quantum);
    setResult(r);
  };

  const save = () => {
    if (!result) return;
    saveExperiment({
      kind: "scheduling",
      title: `${ALGORITHM_LABELS[result.algorithm]} on ${processes.length} processes`,
      config: { algorithm, quantum, processes },
      summary: `avg waiting ${fmt(result.metrics.avgWaiting)}, avg turnaround ${fmt(result.metrics.avgTurnaround)}, CPU ${fmt(result.metrics.cpuUtilization)}%`,
      data: result,
    });
    onSave();
  };

  const exportCSV = () => {
    if (!result) return;
    downloadCSV(
      `osense-${algorithm}-schedule.csv`,
      ["Process", "Arrival", "Burst", "Priority", "Start", "Completion", "Turnaround", "Waiting", "Response"],
      result.processes.map((p) => [p.name, p.arrival, p.burst, p.priority, p.start, p.completion, p.turnaround, p.waiting, p.response]),
    );
  };

  const exportJSON = () => {
    if (!result) return;
    downloadJSON(`osense-${algorithm}-result.json`, result);
  };

  const exportPDF = () => {
    if (!result) return;
    const rows = result.processes
      .map(
        (p) =>
          `<tr><td>${p.name}</td><td>${p.arrival}</td><td>${p.burst}</td><td>${p.priority}</td><td>${p.completion}</td><td>${p.turnaround}</td><td>${p.waiting}</td><td>${p.response}</td></tr>`,
      )
      .join("");
    printReport(
      `OSense 2.0 — ${ALGORITHM_LABELS[result.algorithm]}`,
      `<h2>Schedule metrics</h2><table><tr><th>Avg waiting</th><th>Avg turnaround</th><th>Avg response</th><th>Throughput</th><th>CPU util</th><th>Context switches</th></tr>
      <tr><td>${fmt(result.metrics.avgWaiting)}</td><td>${fmt(result.metrics.avgTurnaround)}</td><td>${fmt(result.metrics.avgResponse)}</td><td>${fmt(result.metrics.throughput)}</td><td>${fmt(result.metrics.cpuUtilization)}%</td><td>${result.metrics.contextSwitches}</td></tr></table>
      <h2>Per-process results</h2><table><tr><th>Process</th><th>Arrival</th><th>Burst</th><th>Priority</th><th>Completion</th><th>Turnaround</th><th>Waiting</th><th>Response</th></tr>${rows}</table>`,
    );
  };

  const algoOptions = useMemo(
    () => (Object.keys(ALGORITHM_LABELS) as SchedulingAlgorithm[]).map((a) => ({ value: a, label: ALGORITHM_LABELS[a] })),
    [],
  );

  return (
    <div className="space-y-4">
      <Panel title="CPU SCHEDULER" subtitle="Pick an algorithm and run it against the current workload.">
        <div className="mb-3">
          <LiveSourcePanel
            mode={mode} onModeChange={setMode} state={live} top={top} onTopChange={setTop}
            syntheticLabel="Synthetic / Preset Workload" applyLabel="Use live Top-N as workload" onApply={applyLive}
            explanation={`Top-${top} processes by real CPU %. Burst = 1 + CPU%/10 (1–20), arrival = rank, priority by rank (busiest = 1).${mode === "live" && liveProcs ? ` Using ${liveProcs.length} live processes.` : ""}`}
          />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <SelectField label="Algorithm" value={algorithm} onChange={setAlgorithm} options={algoOptions} className="w-64" />
          {algorithm === "rr" && <NumberField label="Time quantum" value={quantum} onChange={setQuantum} min={1} max={20} className="w-28" />}
          <OSButton variant="primary" onClick={run} disabled={!valid}>
            <Play className="h-3.5 w-3.5" /> Run simulation
          </OSButton>
          {result && (
            <>
              <OSButton onClick={save}>
                <Save className="h-3.5 w-3.5" /> Save experiment
              </OSButton>
              <OSButton onClick={exportCSV}>
                <Download className="h-3.5 w-3.5" /> CSV
              </OSButton>
              <OSButton onClick={exportJSON}>
                <Download className="h-3.5 w-3.5" /> JSON
              </OSButton>
              <OSButton onClick={exportPDF}>
                <Download className="h-3.5 w-3.5" /> PDF report
              </OSButton>
            </>
          )}
        </div>
      </Panel>

      {result && (
        <>
          <Panel title="GANTT CHART" subtitle={`${ALGORITHM_LABELS[result.algorithm]}${result.quantum ? ` · quantum ${result.quantum}` : ""} · total time ${result.metrics.totalTime}`}>
            <GanttChart segments={result.segments} />
          </Panel>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label="Avg waiting" value={fmt(result.metrics.avgWaiting)} unit="t" />
            <StatCard label="Avg turnaround" value={fmt(result.metrics.avgTurnaround)} unit="t" />
            <StatCard label="Avg response" value={fmt(result.metrics.avgResponse)} unit="t" />
            <StatCard label="Throughput" value={fmt(result.metrics.throughput)} unit="proc/t" />
            <StatCard label="CPU utilization" value={fmt(result.metrics.cpuUtilization)} unit="%" />
            <StatCard label="Context switches" value={String(result.metrics.contextSwitches)} />
          </div>

          <Panel title="PER-PROCESS METRICS">
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {["Process", "Arrival", "Burst", "Priority", "Start", "Completion", "Turnaround", "Waiting", "Response"].map((h) => (
                      <th key={h} className="px-3 py-2 text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.processes.map((p) => (
                    <tr key={p.processId} className="border-b border-border/60 font-mono last:border-b-0">
                      <td className="px-3 py-1.5 font-semibold text-primary">{p.name}</td>
                      <td className="px-3 py-1.5">{p.arrival}</td>
                      <td className="px-3 py-1.5">{p.burst}</td>
                      <td className="px-3 py-1.5">{p.priority}</td>
                      <td className="px-3 py-1.5">{p.start}</td>
                      <td className="px-3 py-1.5">{p.completion}</td>
                      <td className="px-3 py-1.5">{p.turnaround}</td>
                      <td className="px-3 py-1.5">{p.waiting}</td>
                      <td className="px-3 py-1.5">{p.response}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
