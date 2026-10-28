import { describe, expect, it } from "vitest";
import { analyzeWorkload, recommend } from "@/lib/osense/adaptive";
import { generateWorkload } from "@/lib/osense/workload";
import type { OsProcess } from "@/lib/osense/types";

describe("workload analysis", () => {
  it("detects simultaneous arrivals and burst spread", () => {
    const procs: OsProcess[] = [
      { id: "A", name: "A", arrival: 0, burst: 2, priority: 1 },
      { id: "B", name: "B", arrival: 0, burst: 20, priority: 1 },
    ];
    const f = analyzeWorkload(procs);
    expect(f.allArriveTogether).toBe(true);
    expect(f.burstCV).toBeGreaterThan(0.6);
    expect(f.priorityRange).toBe(0);
  });
});

describe("adaptive engine", () => {
  it("recommends SJF for simultaneous jobs with highly variable bursts", () => {
    const procs: OsProcess[] = [
      { id: "A", name: "A", arrival: 0, burst: 1, priority: 1 },
      { id: "B", name: "B", arrival: 0, burst: 2, priority: 1 },
      { id: "C", name: "C", arrival: 0, burst: 30, priority: 1 },
    ];
    const rec = recommend(procs);
    expect(["sjf", "srtf"]).toContain(rec.algorithm);
    expect(rec.ranking.length).toBe(6);
  });

  it("recommends priority scheduling when priorities vary widely", () => {
    const procs: OsProcess[] = [
      { id: "A", name: "A", arrival: 0, burst: 5, priority: 1 },
      { id: "B", name: "B", arrival: 1, burst: 5, priority: 9 },
      { id: "C", name: "C", arrival: 2, burst: 5, priority: 5 },
    ];
    const rec = recommend(procs);
    expect(rec.features.priorityRange).toBe(8);
    expect(["priority-p", "priority"]).toContain(rec.algorithm);
  });

  it("returns a ranking sorted best-first", () => {
    const rec = recommend(generateWorkload(42, 6));
    for (let i = 1; i < rec.ranking.length; i++) {
      expect(rec.ranking[i]!.score).toBeGreaterThanOrEqual(rec.ranking[i - 1]!.score);
    }
  });
});

describe("reproducible workloads", () => {
  it("same seed produces the same workload", () => {
    expect(generateWorkload(7, 5)).toEqual(generateWorkload(7, 5));
  });
  it("different seeds differ", () => {
    expect(generateWorkload(7, 5)).not.toEqual(generateWorkload(8, 5));
  });
});
