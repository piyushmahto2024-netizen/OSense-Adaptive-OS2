import { Download, Trash2 } from "lucide-react";
import { downloadJSON } from "@/lib/osense/export";
import { clearHistory, deleteExperiment } from "@/lib/osense/history";
import type { ExperimentRecord } from "@/lib/osense/types";
import { OSButton, Panel } from "./ui-bits";

const KIND_LABELS: Record<ExperimentRecord["kind"], string> = {
  scheduling: "CPU scheduling",
  memory: "Memory allocation",
  paging: "Page replacement",
  adaptive: "Adaptive engine",
  benchmark: "Benchmark",
};

export function HistoryPanel({ history, onChange }: { history: ExperimentRecord[]; onChange: (h: ExperimentRecord[]) => void }) {
  const remove = (id: string) => onChange(deleteExperiment(id));
  const clear = () => {
    clearHistory();
    onChange([]);
  };

  return (
    <Panel
      title="EXPERIMENT HISTORY"
      subtitle="Saved experiments persist in this browser. Export the full log as JSON for your records."
      actions={
        history.length > 0 && (
          <>
            <OSButton onClick={() => downloadJSON("osense-experiments.json", history)}>
              <Download className="h-3.5 w-3.5" /> Export all
            </OSButton>
            <OSButton variant="danger" onClick={clear}>
              <Trash2 className="h-3.5 w-3.5" /> Clear
            </OSButton>
          </>
        )
      }
    >
      {history.length === 0 ? (
        <p className="py-8 text-center font-mono text-sm text-muted-foreground">
          No experiments saved yet. Run a simulation and hit “Save experiment”.
        </p>
      ) : (
        <div className="space-y-2">
          {history.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-background px-3 py-2.5">
              <span className="rounded-sm border border-primary/40 bg-primary/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-primary">
                {KIND_LABELS[r.kind]}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-sm font-medium text-foreground">{r.title}</div>
                <div className="truncate text-xs text-muted-foreground">{r.summary}</div>
              </div>
              <span className="font-mono text-[10px] text-muted-foreground">{new Date(r.timestamp).toLocaleString()}</span>
              <button type="button" onClick={() => remove(r.id)} className="text-muted-foreground hover:text-destructive" title="Delete record">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
