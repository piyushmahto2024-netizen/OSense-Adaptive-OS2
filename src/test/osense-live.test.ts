import { describe, expect, it } from "vitest";
import { analyzePressure, liveToMemoryScenario, liveToWorkload, parseSnapshot, topProcesses, TelemetryError } from "@/lib/osense/liveTelemetry";

const raw = {
  timestamp: 1, cpu_percent: 50, per_core: [40, 60],
  memory: { total_mb: 8192, used_mb: 4096, available_mb: 4096, percent: 50 },
  processes: [
    { pid: 0, name: "System Idle Process", cpu_percent: 90, memory_mb: 0 },
    { pid: 10, name: "chrome.exe", cpu_percent: 35, memory_mb: 1024 },
    { pid: 20, name: "code.exe", cpu_percent: 5, memory_mb: 2048 },
    { bad: true },
  ],
};

describe("live telemetry", () => {
  it("parses and counts malformed processes as skipped", () => {
    const s = parseSnapshot(raw);
    expect(s.processes).toHaveLength(3);
    expect(s.skippedProcesses).toBe(1);
  });
  it("rejects snapshots missing memory", () => {
    expect(() => parseSnapshot({ cpu_percent: 1 })).toThrow(TelemetryError);
  });
  it("top-N by CPU excludes idle process", () => {
    expect(topProcesses(parseSnapshot(raw).processes, 5).map((p) => p.pid)).toEqual([10, 20]);
  });
  it("burst = 1 + cpu/10 rounded, arrival = rank", () => {
    const w = liveToWorkload(topProcesses(parseSnapshot(raw).processes, 5));
    expect(w.map((p) => [p.burst, p.arrival, p.priority])).toEqual([[5, 0, 1], [2, 1, 3]]);
  });
  it("memory scenario scales real RAM into 4096 KB", () => {
    const s = parseSnapshot(raw);
    const sc = liveToMemoryScenario(s, topProcesses(s.processes, 2, "memory"));
    expect(sc.requests.map((r) => r.size)).toEqual([512, 1024, 512]);
  });
  it("sustained-high CPU needs >=60% of samples at 80%+", () => {
    const s = parseSnapshot(raw);
    const hi = { ...s, cpuPercent: 95 };
    expect(analyzePressure([hi, hi, s])!.cpuPressure).toBe("sustained-high");
    expect(analyzePressure([hi, s, s])!.cpuPressure).toBe("moderate");
  });
});
