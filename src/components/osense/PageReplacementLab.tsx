import { GitCompare, Play, Save } from "lucide-react";
import { useState } from "react";
import { runPageReplacement } from "@/lib/osense/pageReplacement";
import { saveExperiment } from "@/lib/osense/history";
import { PAGE_LABELS, type PageAlgorithm, type PageReplacementResult } from "@/lib/osense/types";
import { NumberField, OSButton, Panel, SelectField, StatCard } from "./ui-bits";

const DEFAULT_REFS = "7 0 1 2 0 3 0 4 2 3 0 3 2 1 2 0 1 7 0 1";

function parseRefs(text: string): number[] {
  return text
    .split(/[\s,]+/)
    .map((t) => parseInt(t, 10))
    .filter((n) => Number.isFinite(n) && n >= 0);
}

function ResultView({ result }: { result: PageReplacementResult }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Page faults" value={String(result.faults)} />
        <StatCard label="Hits" value={String(result.hits)} />
        <StatCard label="Fault rate" value={result.faultRate.toFixed(1)} unit="%" />
      </div>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/40 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              <th className="px-2 py-2 text-left">Ref</th>
              {result.steps.map((s) => (
                <th key={s.index} className="px-2 py-2 text-center font-semibold text-foreground">{s.page}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: result.frameCount }, (_, f) => (
              <tr key={f} className="border-b border-border/60">
                <td className="px-2 py-1.5 font-mono text-[10px] text-muted-foreground">F{f}</td>
                {result.steps.map((s) => (
                  <td
                    key={s.index}
                    className="px-2 py-1.5 text-center font-mono"
                    style={{
                      color: s.frames[f] === null ? "var(--muted-foreground)" : "var(--foreground)",
                      backgroundColor: s.fault && s.frames[f] === s.page ? "color-mix(in oklch, var(--primary) 18%, transparent)" : undefined,
                    }}
                  >
                    {s.frames[f] ?? "·"}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <td className="px-2 py-1.5 font-mono text-[10px] text-muted-foreground">Fault</td>
              {result.steps.map((s) => (
                <td key={s.index} className={`px-2 py-1.5 text-center font-mono font-bold ${s.fault ? "text-destructive" : "text-primary"}`}>
                  {s.fault ? "F" : "✓"}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PageReplacementLab({ onSave }: { onSave: () => void }) {
  const [refText, setRefText] = useState(DEFAULT_REFS);
  const [frames, setFrames] = useState(3);
  const [algorithm, setAlgorithm] = useState<PageAlgorithm>("fifo");
  const [result, setResult] = useState<PageReplacementResult | null>(null);
  const [comparison, setComparison] = useState<PageReplacementResult[] | null>(null);

  const refs = parseRefs(refText);

  const run = () => {
    setComparison(null);
    setResult(runPageReplacement(algorithm, refs, frames));
  };

  const compare = () => {
    setResult(null);
    setComparison((Object.keys(PAGE_LABELS) as PageAlgorithm[]).map((a) => runPageReplacement(a, refs, frames)));
  };

  const save = () => {
    if (!result) return;
    saveExperiment({
      kind: "paging",
      title: `${PAGE_LABELS[result.algorithm]} page replacement · ${refs.length} refs, ${frames} frames`,
      config: { algorithm, frames, refs },
      summary: `${result.faults} faults, ${result.hits} hits, fault rate ${result.faultRate.toFixed(1)}%`,
      data: result,
    });
    onSave();
  };

  return (
    <div className="space-y-4">
      <Panel title="PAGE REPLACEMENT" subtitle="Simulate demand paging with FIFO, LRU and Optimal replacement.">
        <div className="space-y-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Reference string (space or comma separated)</span>
            <input
              value={refText}
              onChange={(e) => setRefText(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm text-foreground outline-none focus:border-ring"
            />
          </label>
          <div className="flex flex-wrap items-end gap-3">
            <NumberField label="Frames" value={frames} onChange={setFrames} min={1} max={10} className="w-24" />
            <SelectField
              label="Algorithm"
              value={algorithm}
              onChange={setAlgorithm}
              options={(Object.keys(PAGE_LABELS) as PageAlgorithm[]).map((a) => ({ value: a, label: PAGE_LABELS[a] }))}
              className="w-40"
            />
            <OSButton variant="primary" onClick={run} disabled={refs.length === 0}>
              <Play className="h-3.5 w-3.5" /> Run
            </OSButton>
            <OSButton onClick={compare} disabled={refs.length === 0}>
              <GitCompare className="h-3.5 w-3.5" /> Compare all three
            </OSButton>
            {result && (
              <OSButton onClick={save}>
                <Save className="h-3.5 w-3.5" /> Save experiment
              </OSButton>
            )}
          </div>
        </div>
      </Panel>

      {result && (
        <Panel title={`${PAGE_LABELS[result.algorithm]} RESULT`}>
          <ResultView result={result} />
        </Panel>
      )}

      {comparison && (
        <Panel title="ALGORITHM COMPARISON" subtitle="Same reference string and frame count for all three policies.">
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {["Algorithm", "Faults", "Hits", "Fault rate"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparison.map((r) => {
                  const best = Math.min(...comparison.map((x) => x.faults));
                  return (
                    <tr key={r.algorithm} className="border-b border-border/60 font-mono last:border-b-0">
                      <td className="px-3 py-2 font-semibold" style={{ color: r.faults === best ? "var(--primary)" : "var(--foreground)" }}>
                        {PAGE_LABELS[r.algorithm]}
                        {r.faults === best && <span className="ml-2 text-[10px] uppercase tracking-widest">best</span>}
                      </td>
                      <td className="px-3 py-2">{r.faults}</td>
                      <td className="px-3 py-2">{r.hits}</td>
                      <td className="px-3 py-2">{r.faultRate.toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}
