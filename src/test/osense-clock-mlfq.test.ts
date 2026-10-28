import { describe, expect, it } from "vitest";
import { runPageReplacement } from "@/lib/osense/pageReplacement";
import { mlfq, runScheduler } from "@/lib/osense/scheduling";
import type { OsProcess } from "@/lib/osense/types";

const proc = (id: string, arrival: number, burst: number, priority = 1): OsProcess =>
  ({ id, name: id, arrival, burst, priority }) as OsProcess;

describe("clock (second-chance) page replacement", () => {
  it("spares a recently referenced page that FIFO would evict", () => {
    const refs = [1, 2, 3, 4, 2, 5];
    const clock = runPageReplacement("clock", refs, 3);
    expect(clock.steps.at(-1)!.frames).toEqual([4, 2, 5]);
    expect(clock.steps.at(-1)!.evicted).toBe(3);
    const fifo = runPageReplacement("fifo", refs, 3);
    expect(fifo.steps.at(-1)!.evicted).toBe(2);
  });

  it("never beats Optimal on the textbook string", () => {
    const refs = [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2];
    expect(runPageReplacement("clock", refs, 3).faults).toBeGreaterThanOrEqual(runPageReplacement("opt", refs, 3).faults);
  });
});

describe("MLFQ scheduler", () => {
  it("demotes a long job and lets a short arrival finish first", () => {
    const r = mlfq([proc("A", 0, 6), proc("B", 1, 2)]);
    const a = r.processes.find((p) => p.processId === "A")!;
    const b = r.processes.find((p) => p.processId === "B")!;
    expect(b.completion).toBe(4);
    expect(a.completion).toBe(8);
    expect(r.segments.map((s) => [s.processId, s.start, s.end])).toEqual([["A", 0, 2], ["B", 2, 4], ["A", 4, 8]]);
  });

  it("runs a single long job through all three queues", () => {
    const r = runScheduler("mlfq", [proc("A", 0, 7)]);
    expect(r.processes[0]!.completion).toBe(7);
  });
});
