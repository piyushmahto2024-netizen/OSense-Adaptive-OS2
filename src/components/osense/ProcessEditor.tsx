import { Plus, Shuffle, Trash2 } from "lucide-react";
import { useState } from "react";
import type { OsProcess } from "@/lib/osense/types";
import { generateWorkload } from "@/lib/osense/workload";
import { NumberField, OSButton } from "./ui-bits";

export function ProcessEditor({ processes, onChange }: { processes: OsProcess[]; onChange: (p: OsProcess[]) => void }) {
  const [seed, setSeed] = useState(42);
  const [count, setCount] = useState(5);

  const update = (id: string, field: keyof OsProcess, value: number) => {
    onChange(processes.map((p) => (p.id === id ? { ...p, [field]: Math.max(field === "burst" ? 1 : 0, Math.round(value)) } : p)));
  };

  const addProcess = () => {
    const n = processes.length + 1;
    onChange([...processes, { id: `P${n}`, name: `P${n}`, arrival: 0, burst: 4, priority: 3 }]);
  };

  const remove = (id: string) => onChange(processes.filter((p) => p.id !== id));

  const randomize = () => onChange(generateWorkload(seed, count));

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              <th className="px-3 py-2 text-left">Process</th>
              <th className="px-3 py-2 text-left">Arrival</th>
              <th className="px-3 py-2 text-left">Burst</th>
              <th className="px-3 py-2 text-left">Priority</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {processes.map((p) => (
              <tr key={p.id} className="border-b border-border/60 last:border-b-0">
                <td className="px-3 py-1.5 font-mono font-semibold text-primary">{p.name}</td>
                {(["arrival", "burst", "priority"] as const).map((field) => (
                  <td key={field} className="px-3 py-1.5">
                    <input
                      type="number"
                      min={field === "burst" ? 1 : 0}
                      value={p[field]}
                      onChange={(e) => update(p.id, field, Number(e.target.value))}
                      className="w-20 rounded border border-input bg-background px-2 py-1 font-mono text-sm outline-none focus:border-ring"
                    />
                  </td>
                ))}
                <td className="px-3 py-1.5 text-right">
                  <button
                    type="button"
                    onClick={() => remove(p.id)}
                    disabled={processes.length <= 1}
                    className="text-muted-foreground transition-colors hover:text-destructive disabled:opacity-30"
                    title="Remove process"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <OSButton onClick={addProcess}>
          <Plus className="h-3.5 w-3.5" /> Add process
        </OSButton>
        <NumberField label="Seed" value={seed} onChange={setSeed} min={0} max={99999} className="w-24" />
        <NumberField label="Count" value={count} onChange={setCount} min={2} max={12} className="w-24" />
        <OSButton onClick={randomize} title="Generate a reproducible random workload from the seed">
          <Shuffle className="h-3.5 w-3.5" /> Random workload
        </OSButton>
      </div>
    </div>
  );
}
