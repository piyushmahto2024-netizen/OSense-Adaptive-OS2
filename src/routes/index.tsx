import { createFileRoute } from "@tanstack/react-router";
import { Activity, BrainCircuit, Cpu, GitCompare, History, Layers, MemoryStick, Terminal } from "lucide-react";
import { useState } from "react";
import { AdaptivePanel } from "@/components/osense/AdaptivePanel";
import { BenchmarkPanel } from "@/components/osense/BenchmarkPanel";
import { HistoryPanel } from "@/components/osense/HistoryPanel";
import { MemoryLab } from "@/components/osense/MemoryLab";
import { PageReplacementLab } from "@/components/osense/PageReplacementLab";
import { ProcessEditor } from "@/components/osense/ProcessEditor";
import { SchedulingLab } from "@/components/osense/SchedulingLab";
import { Panel } from "@/components/osense/ui-bits";
import { loadHistory } from "@/lib/osense/history";
import { SAMPLE_WORKLOAD } from "@/lib/osense/workload";
import type { ExperimentRecord, OsProcess } from "@/lib/osense/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "OSense 2.0 — Intelligent Operating System Simulator" },
      {
        name: "description",
        content:
          "Simulate CPU scheduling (FCFS, SJF, SRTF, Priority, Round Robin), contiguous memory allocation and page replacement, with an adaptive engine that recommends the best policy for your workload.",
      },
      { property: "og:title", content: "OSense 2.0 — Intelligent Operating System Simulator" },
      {
        property: "og:description",
        content:
          "An educational OS simulator with CPU scheduling, memory management, page replacement, adaptive resource management, benchmarking and experiment history.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type Tab = "scheduling" | "memory" | "paging" | "adaptive" | "benchmark" | "history";

const TABS: { id: Tab; label: string; icon: typeof Cpu }[] = [
  { id: "scheduling", label: "CPU Scheduling", icon: Cpu },
  { id: "memory", label: "Memory", icon: MemoryStick },
  { id: "paging", label: "Page Replacement", icon: Layers },
  { id: "adaptive", label: "Adaptive Engine", icon: BrainCircuit },
  { id: "benchmark", label: "Benchmark", icon: GitCompare },
  { id: "history", label: "History", icon: History },
];

function Index() {
  const [tab, setTab] = useState<Tab>("scheduling");
  const [processes, setProcesses] = useState<OsProcess[]>(SAMPLE_WORKLOAD);
  const [history, setHistory] = useState<ExperimentRecord[]>(() => loadHistory());

  const refreshHistory = () => setHistory(loadHistory());
  const usesWorkload = tab === "scheduling" || tab === "adaptive" || tab === "benchmark";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-4">
          <div className="flex items-center gap-2.5">
            <div className="rounded-md border border-primary/40 bg-primary/10 p-2">
              <Terminal className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="font-mono text-lg font-bold tracking-tight text-foreground">
                OSense <span className="text-primary">2.0</span>
              </h1>
              <p className="text-[11px] text-muted-foreground">Intelligent Operating System Simulator & Adaptive Resource Manager</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <Activity className="h-3.5 w-3.5 text-primary" />
            <span>7 schedulers · 3 fit strategies · 4 page policies</span>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-0">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex items-center gap-2 whitespace-nowrap rounded-t-md border-b-2 px-3.5 py-2.5 font-mono text-xs transition-colors",
                  active
                    ? "border-primary bg-card font-semibold text-primary"
                    : "border-transparent text-muted-foreground hover:bg-card/60 hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
                {t.id === "history" && history.length > 0 && (
                  <span className="rounded-full bg-primary/15 px-1.5 font-mono text-[10px] text-primary">{history.length}</span>
                )}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        {usesWorkload && (
          <Panel title="WORKLOAD" subtitle="This process set is shared by the scheduler, the adaptive engine and the benchmark. Same seed → same workload, so experiments are reproducible.">
            <ProcessEditor processes={processes} onChange={setProcesses} />
          </Panel>
        )}

        {tab === "scheduling" && <SchedulingLab processes={processes} onSave={refreshHistory} />}
        {tab === "memory" && <MemoryLab onSave={refreshHistory} />}
        {tab === "paging" && <PageReplacementLab onSave={refreshHistory} />}
        {tab === "adaptive" && <AdaptivePanel processes={processes} onSave={refreshHistory} />}
        {tab === "benchmark" && <BenchmarkPanel processes={processes} onSave={refreshHistory} />}
        {tab === "history" && <HistoryPanel history={history} onChange={setHistory} />}

        <footer className="pt-4 pb-2 text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          OSense 2.0 · educational operating-systems simulator · all computation runs locally in your browser
        </footer>
      </main>
    </div>
  );
}
