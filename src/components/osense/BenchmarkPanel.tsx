import { Download, Play, Save } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ALL_ALGORITHMS, runScheduler } from "@/lib/osense/scheduling";
import { downloadCSV } from "@/lib/osense/export";
import { saveExperiment } from "@/lib/osense/history";
import { ALGORITHM_LABELS, type OsProcess, type ScheduleResult } from "@/lib/osense/types";
import { NumberField, OSButton, Panel } from "./ui-bits";

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

export function BenchmarkPanel({ processes, onSave }: { processes: OsProcess[]; onSave: () => void }) {
  const [quantum, setQuantum] = useState(2);
  const [results, setResults] = useState<ScheduleResult[] | null>(null);

  const run = () => setResults(ALL_ALGORITHMS.map((a) => runScheduler(a, processes, quantum)));

  const save = () => {
    if (!results) return;
    const best = [...results].sort((a, b) => a.metrics.avgWaiting - b.metrics.avgWaiting)[0]!;
    saveExperiment({
      kind: "benchmark",
      title: `Benchmark of ${results.length} algorithms on ${processes.length} processes`,
      config: { quantum, processes },
      summary: `Best avg waiting: ${ALGORITHM_LABELS[best.algorithm]} (${fmt(best.metrics.avgWaiting)})`,
      data: results.map((r) => ({ algorithm: r.algorithm, metrics: r.metrics })),
    });
    onSave();
  };

  const exportCSV = () => {
    if (!results) return;
    downloadCSV(
      "osense-benchmark.csv",
      ["Algorithm", "Avg waiting", "Avg turnaround", "Avg response", "Throughput", "CPU util %", "Context switches"],
      results.map((r) => [
        ALGORITHM_LABELS[r.algorithm],
        fmt(r.metrics.avgWaiting),
        fmt(r.metrics.avgTurnaround),
        fmt(r.metrics.avgResponse),
        fmt(r.metrics.throughput),
        fmt(r.metrics.cpuUtilization),
        r.metrics.contextSwitches,
      ]),
    );
  };

  const chartData = results?.map((r) => ({
    name: r.algorithm.toUpperCase(),
    waiting: Number(r.metrics.avgWaiting.toFixed(2)),
    turnaround: Number(r.metrics.avgTurnaround.toFixed(2)),
    response: Number(r.metrics.avgResponse.toFixed(2)),
  }));

  return (
    <div className="space-y-4">
      <Panel title="BENCHMARK SUITE" subtitle="Run all six scheduling algorithms on the same workload and compare them head to head.">
        <div className="flex flex-wrap items-end gap-3">
          <NumberField label="RR quantum" value={quantum} onChange={setQuantum} min={1} max={20} className="w-28" />
          <OSButton variant="primary" onClick={run} disabled={processes.length === 0}>
            <Play className="h-3.5 w-3.5" /> Run benchmark
          </OSButton>
          {results && (
            <>
              <OSButton onClick={save}>
                <Save className="h-3.5 w-3.5" /> Save experiment
              </OSButton>
              <OSButton onClick={exportCSV}>
                <Download className="h-3.5 w-3.5" /> CSV
              </OSButton>
            </>
          )}
        </div>
      </Panel>

      {results && chartData && (
        <>
          <Panel title="COMPARISON CHART">
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fill: "var(--muted-foreground)", fontSize: 11, fontFamily: "JetBrains Mono" }} />
                  <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11, fontFamily: "JetBrains Mono" }} />
                  <Tooltip
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontFamily: "JetBrains Mono", fontSize: 12 }}
                    labelStyle={{ color: "var(--primary)" }}
                  />
                  <Legend wrapperStyle={{ fontFamily: "JetBrains Mono", fontSize: 11 }} />
                  <Bar dataKey="waiting" name="Avg waiting" fill="var(--chart-1)" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="turnaround" name="Avg turnaround" fill="var(--chart-3)" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="response" name="Avg response" fill="var(--chart-2)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel title="FULL RESULTS TABLE">
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {["Algorithm", "Avg waiting", "Avg turnaround", "Avg response", "Throughput", "CPU util", "Ctx switches"].map((h) => (
                      <th key={h} className="px-3 py-2 text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => {
                    const bestWait = Math.min(...results.map((x) => x.metrics.avgWaiting));
                    const isBest = r.metrics.avgWaiting === bestWait;
                    return (
                      <tr key={r.algorithm} className="border-b border-border/60 font-mono last:border-b-0">
                        <td className="px-3 py-2 font-semibold" style={{ color: isBest ? "var(--primary)" : "var(--foreground)" }}>
                          {ALGORITHM_LABELS[r.algorithm]}
                          {isBest && <span className="ml-2 text-[10px] uppercase tracking-widest">best wait</span>}
                        </td>
                        <td className="px-3 py-2">{fmt(r.metrics.avgWaiting)}</td>
                        <td className="px-3 py-2">{fmt(r.metrics.avgTurnaround)}</td>
                        <td className="px-3 py-2">{fmt(r.metrics.avgResponse)}</td>
                        <td className="px-3 py-2">{fmt(r.metrics.throughput)}</td>
                        <td className="px-3 py-2">{fmt(r.metrics.cpuUtilization)}%</td>
                        <td className="px-3 py-2">{r.metrics.contextSwitches}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
