import { describe, expect, it } from "vitest";
import { fcfs, priorityNP, roundRobin, runScheduler, sjf, srtf } from "@/lib/osense/scheduling";
import type { OsProcess } from "@/lib/osense/types";

// Classic textbook workload (Galvin-style)
const W: OsProcess[] = [
  { id: "P1", name: "P1", arrival: 0, burst: 8, priority: 3 },
  { id: "P2", name: "P2", arrival: 1, burst: 4, priority: 1 },
  { id: "P3", name: "P3", arrival: 2, burst: 9, priority: 4 },
  { id: "P4", name: "P4", arrival: 3, burst: 5, priority: 2 },
];

describe("FCFS", () => {
  it("runs jobs in arrival order with correct average waiting time", () => {
    const r = fcfs(W);
    // Order: P1(0-8) P2(8-12) P3(12-21) P4(21-26)
    expect(r.processes.map((p) => p.completion)).toEqual([8, 12, 21, 26]);
    // waiting: P1=0, P2=7, P3=10, P4=18 -> avg 8.75
    expect(r.metrics.avgWaiting).toBeCloseTo(8.75);
    expect(r.metrics.cpuUtilization).toBeCloseTo(100);
  });
});

describe("SJF (non-preemptive)", () => {
  it("picks shortest ready job", () => {
    const r = sjf(W);
    // P1(0-8), then P2(8-12), P4(12-17), P3(17-26)
    const p2 = r.processes.find((p) => p.processId === "P2")!;
    const p3 = r.processes.find((p) => p.processId === "P3")!;
    const p4 = r.processes.find((p) => p.processId === "P4")!;
    expect(p2.completion).toBe(12);
    expect(p4.completion).toBe(17);
    expect(p3.completion).toBe(26);
    // waiting: 0,7,15,9 -> avg 7.75
    expect(r.metrics.avgWaiting).toBeCloseTo(7.75);
  });
});

describe("SRTF", () => {
  it("preempts for shorter remaining time", () => {
    const r = srtf(W);
    // waiting: P1=17-0-8=9? Compute: P1 runs 0-1, preempted by P2(1-5), P4(5-10), P1(10-17), P3(17-26)
    const p1 = r.processes.find((p) => p.processId === "P1")!;
    const p2 = r.processes.find((p) => p.processId === "P2")!;
    expect(p2.completion).toBe(5);
    expect(p1.completion).toBe(17);
    // avg waiting = (9 + 0 + 15 + 2) / 4 = 6.5
    expect(r.metrics.avgWaiting).toBeCloseTo(6.5);
  });
});

describe("Priority (non-preemptive)", () => {
  it("honors lower-number = higher priority", () => {
    const r = priorityNP(W);
    // P1(0-8), then P2(p1), P4(p2), P3(p4)
    const p2 = r.processes.find((p) => p.processId === "P2")!;
    const p4 = r.processes.find((p) => p.processId === "P4")!;
    expect(p2.completion).toBe(12);
    expect(p4.completion).toBe(17);
  });
});

describe("Round Robin", () => {
  it("time-slices with the given quantum", () => {
    const single: OsProcess[] = [{ id: "A", name: "A", arrival: 0, burst: 5, priority: 1 }];
    const r = roundRobin(single, 2);
    expect(r.processes[0]!.completion).toBe(5);
    expect(r.metrics.totalTime).toBe(5);
  });

  it("rotates between two processes", () => {
    const two: OsProcess[] = [
      { id: "A", name: "A", arrival: 0, burst: 4, priority: 1 },
      { id: "B", name: "B", arrival: 0, burst: 4, priority: 1 },
    ];
    const r = roundRobin(two, 2);
    const order = r.segments.map((s) => s.processId);
    expect(order).toEqual(["A", "B", "A", "B"]);
    expect(r.processes.find((p) => p.processId === "A")!.completion).toBe(6);
    expect(r.processes.find((p) => p.processId === "B")!.completion).toBe(8);
  });
});

describe("metrics", () => {
  it("reports idle time and utilization below 100% when CPU waits", () => {
    const late: OsProcess[] = [{ id: "X", name: "X", arrival: 5, burst: 5, priority: 1 }];
    const r = runScheduler("fcfs", late);
    expect(r.metrics.totalTime).toBe(10);
    expect(r.metrics.cpuUtilization).toBeCloseTo(50);
    expect(r.segments[0]!.processId).toBeNull();
  });
});
