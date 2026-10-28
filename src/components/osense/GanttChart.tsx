import type { GanttSegment } from "@/lib/osense/types";

const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export function processColor(processId: string): string {
  const n = parseInt(processId.replace(/\D/g, ""), 10);
  const idx = Number.isFinite(n) ? (n - 1) % COLORS.length : processId.length % COLORS.length;
  return COLORS[idx] ?? COLORS[0]!;
}

export function GanttChart({ segments }: { segments: GanttSegment[] }) {
  if (segments.length === 0) return null;
  const total = segments[segments.length - 1]!.end;
  if (total <= 0) return null;

  const ticks: number[] = [];
  const step = total <= 20 ? 1 : total <= 60 ? 5 : 10;
  for (let t = 0; t <= total; t += step) ticks.push(t);
  if (ticks[ticks.length - 1] !== total) ticks.push(total);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[480px]">
        <div className="flex h-12 w-full overflow-hidden rounded-md border border-border">
          {segments.map((s, i) => {
            const width = ((s.end - s.start) / total) * 100;
            const idle = s.processId === null;
            return (
              <div
                key={i}
                title={idle ? `idle [${s.start}–${s.end}]` : `${s.label} [${s.start}–${s.end}]`}
                className="relative flex items-center justify-center border-r border-background/40 last:border-r-0"
                style={{
                  width: `${width}%`,
                  backgroundColor: idle ? "var(--muted)" : processColor(s.processId!),
                  opacity: idle ? 0.35 : 1,
                }}
              >
                <span
                  className="px-1 font-mono text-[10px] font-semibold"
                  style={{ color: idle ? "var(--muted-foreground)" : "var(--background)" }}
                >
                  {idle ? "idle" : s.label}
                </span>
              </div>
            );
          })}
        </div>
        <div className="relative mt-1 h-4 w-full">
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute -translate-x-1/2 font-mono text-[10px] text-muted-foreground"
              style={{ left: `${(t / total) * 100}%` }}
            >
              {t}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
