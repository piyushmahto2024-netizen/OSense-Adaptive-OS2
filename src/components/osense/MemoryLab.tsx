import { Play, Plus, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { runAllocation } from "@/lib/osense/memory";
import { saveExperiment } from "@/lib/osense/history";
import { FIT_LABELS, type AllocationResult, type FitStrategy, type MemoryBlock, type MemoryRequest } from "@/lib/osense/types";
import { processColor } from "./GanttChart";
import { NumberField, OSButton, Panel, SelectField, StatCard } from "./ui-bits";
import { LiveSourcePanel, type SourceMode } from "./LiveTelemetry";
import { useLiveTelemetry } from "@/hooks/use-live-telemetry";
import { liveToMemoryScenario, topProcesses } from "@/lib/osense/liveTelemetry";

function MemoryBar({ blocks, total }: { blocks: MemoryBlock[]; total: number }) {
  return (
    <div className="flex h-14 w-full overflow-hidden rounded-md border border-border">
      {blocks.map((b) => {
        const width = (b.size / total) * 100;
        return (
          <div
            key={b.id}
            title={b.free ? `free ${b.size} KB @ ${b.start}` : `${b.processId} · ${b.size} KB @ ${b.start}`}
            className="relative flex items-center justify-center overflow-hidden border-r border-background/40 last:border-r-0"
            style={{
              width: `${width}%`,
              backgroundColor: b.free ? "var(--muted)" : processColor(b.processId ?? "X"),
              opacity: b.free ? 0.35 : 1,
            }}
          >
            <span
              className="truncate px-1 font-mono text-[10px] font-semibold"
              style={{ color: b.free ? "var(--muted-foreground)" : "var(--background)" }}
            >
              {b.free ? `free ${b.size}` : `${b.processId} · ${b.size}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function MemoryLab({ onSave }: { onSave: () => void }) {
  const [totalMemory, setTotalMemory] = useState(1024);
  const [strategy, setStrategy] = useState<FitStrategy>("first");
  const [requests, setRequests] = useState<MemoryRequest[]>([
    { id: "r1", processName: "P1", size: 212 },
    { id: "r2", processName: "P2", size: 417 },
    { id: "r3", processName: "P3", size: 112 },
    { id: "r4", processName: "P4", size: 426 },
  ]);
  const [result, setResult] = useState<AllocationResult | null>(null);

  const updateReq = (id: string, field: "processName" | "size", value: string) => {
    setRequests((rs) => rs.map((r) => (r.id === id ? { ...r, [field]: field === "size" ? Math.max(1, Math.round(Number(value) || 0)) : value } : r)));
  };

  const [mode, setMode] = useState<SourceMode>("synthetic");
  const [top, setTop] = useState(6);
  const live = useLiveTelemetry(mode === "live");
  const applyLive = () => {
    if (!live.latest) return;
    const sc = liveToMemoryScenario(live.latest, topProcesses(live.latest.processes, top, "memory"));
    setTotalMemory(sc.totalMemory);
    setRequests(sc.requests);
    setResult(null);
  };

  const run = () => setResult(runAllocation(totalMemory, requests, strategy));

  const save = () => {
    if (!result) return;
    saveExperiment({
      kind: "memory",
      title: `${FIT_LABELS[strategy]} allocation · ${requests.length} requests in ${totalMemory} KB`,
      config: { totalMemory, strategy, requests },
      summary: `allocated ${result.allocatedBytes} KB, fragmentation ${result.externalFragmentation} KB, ${result.failedRequests} failed`,
      data: result,
    });
    onSave();
  };

  return (
    <div className="space-y-4">
      <Panel title="CONTIGUOUS MEMORY ALLOCATION" subtitle="Allocate processes into one contiguous memory space with first, best or worst fit.">
        <div className="mb-3">
          <LiveSourcePanel
            mode={mode} onModeChange={setMode} state={live} top={top} onTopChange={setTop}
            syntheticLabel="Manual / Preset Requests" applyLabel="Use live RAM as requests" onApply={applyLive}
            explanation={`Top-${top} processes by real working set, plus "OS+other" for the rest of used RAM, scaled from real total RAM into a 4096 KB simulated memory.`}
          />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <NumberField label="Total memory (KB)" value={totalMemory} onChange={setTotalMemory} min={64} max={65536} className="w-36" />
          <SelectField
            label="Strategy"
            value={strategy}
            onChange={setStrategy}
            options={(Object.keys(FIT_LABELS) as FitStrategy[]).map((f) => ({ value: f, label: FIT_LABELS[f] }))}
            className="w-40"
          />
          <OSButton variant="primary" onClick={run}>
            <Play className="h-3.5 w-3.5" /> Run allocation
          </OSButton>
          {result && (
            <OSButton onClick={save}>
              <Save className="h-3.5 w-3.5" /> Save experiment
            </OSButton>
          )}
        </div>

        <div className="mt-4 overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                <th className="px-3 py-2 text-left">Process</th>
                <th className="px-3 py-2 text-left">Size (KB)</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id} className="border-b border-border/60 last:border-b-0">
                  <td className="px-3 py-1.5">
                    <input
                      value={r.processName}
                      onChange={(e) => updateReq(r.id, "processName", e.target.value)}
                      className="w-24 rounded border border-input bg-background px-2 py-1 font-mono text-sm outline-none focus:border-ring"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      type="number"
                      min={1}
                      value={r.size}
                      onChange={(e) => updateReq(r.id, "size", e.target.value)}
                      className="w-24 rounded border border-input bg-background px-2 py-1 font-mono text-sm outline-none focus:border-ring"
                    />
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <button
                      type="button"
                      onClick={() => setRequests((rs) => rs.filter((x) => x.id !== r.id))}
                      disabled={requests.length <= 1}
                      className="text-muted-foreground hover:text-destructive disabled:opacity-30"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3">
          <OSButton onClick={() => setRequests((rs) => [...rs, { id: `r${Date.now()}`, processName: `P${rs.length + 1}`, size: 128 }])}>
            <Plus className="h-3.5 w-3.5" /> Add request
          </OSButton>
        </div>
      </Panel>

      {result && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard label="Allocated" value={String(result.allocatedBytes)} unit="KB" />
            <StatCard label="Free" value={String(result.freeBytes)} unit="KB" />
            <StatCard label="Largest free block" value={String(result.largestFreeBlock)} unit="KB" />
            <StatCard label="External fragmentation" value={String(result.externalFragmentation)} unit="KB" hint="free memory not in the largest hole" />
            <StatCard label="Failed requests" value={String(result.failedRequests)} />
          </div>

          <Panel title="FINAL MEMORY MAP" subtitle={`${FIT_LABELS[strategy]} · ${totalMemory} KB`}>
            <MemoryBar blocks={result.finalBlocks} total={totalMemory} />
          </Panel>

          <Panel title="ALLOCATION TRACE" subtitle="Memory map after each request.">
            <div className="space-y-3">
              {result.steps.map((s, i) => (
                <div key={i} className="rounded-md border border-border bg-background p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-mono text-xs">
                      <span className="text-primary">{s.request.processName}</span>
                      <span className="text-muted-foreground"> requests </span>
                      <span className="text-foreground">{s.request.size} KB</span>
                    </span>
                    <span className={`font-mono text-[10px] uppercase tracking-widest ${s.success ? "text-primary" : "text-destructive"}`}>
                      {s.success ? "allocated" : "failed — no hole large enough"}
                    </span>
                  </div>
                  <MemoryBar blocks={s.blocksAfter} total={totalMemory} />
                </div>
              ))}
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
