// Live Windows telemetry bridge — pure, framework-free TypeScript.
// Talks to scripts/windows_monitor.py (default http://127.0.0.1:5000), validates and
// normalizes its snapshots, and converts REAL measurements into ESTIMATED simulation
// inputs. OSense never changes the real Windows scheduler or memory manager.

import type { MemoryRequest, OsProcess } from "./types";

export const DEFAULT_TELEMETRY_URL = "http://127.0.0.1:5000";
export const DEFAULT_POLL_MS = 2000;
export const MAX_PROCESSES = 50;

export type TelemetryStatus = "disconnected" | "connecting" | "connected" | "error";

export interface LiveProcess {
  pid: number;
  name: string;
  cpuPercent: number; // % of one logical core summed (psutil semantics), clamped >= 0
  memoryMB: number; // working set (RSS) in MB
  memoryPercent: number;
  status: string;
  threads: number | null;
}

export interface SystemSnapshot {
  timestamp: number; // epoch ms
  cpuPercent: number;
  perCore: number[];
  memory: { totalMB: number; usedMB: number; availableMB: number; percent: number };
  disk: { percent: number | null; readMB: number | null; writeMB: number | null };
  network: { sentMB: number | null; recvMB: number | null };
  uptimeSec: number;
  processes: LiveProcess[];
  skippedProcesses: number; // processes that exited or denied access during collection
}

export class TelemetryError extends Error {
  constructor(message: string, public kind: "network" | "http" | "malformed") {
    super(message);
  }
}

const num = (v: unknown, fallback: number | null = null): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
const req = (v: unknown, field: string): number => {
  const n = num(v);
  if (n === null) throw new TelemetryError(`Malformed telemetry: "${field}" is missing or not a number`, "malformed");
  return n;
};
const clampPct = (n: number) => Math.min(100, Math.max(0, n));

/** Validate + normalize the raw /metrics JSON. Throws TelemetryError("malformed"). */
export function parseSnapshot(raw: unknown): SystemSnapshot {
  if (!raw || typeof raw !== "object") throw new TelemetryError("Malformed telemetry: response is not an object", "malformed");
  const r = raw as any;
  const mem = r.memory;
  if (!mem || typeof mem !== "object") throw new TelemetryError('Malformed telemetry: "memory" missing', "malformed");
  const totalMB = req(mem.total_mb, "memory.total_mb");
  const usedMB = req(mem.used_mb, "memory.used_mb");
  const availableMB = req(mem.available_mb, "memory.available_mb");
  const rawProcs: unknown[] = Array.isArray(r.processes) ? r.processes : [];
  let skipped = num(r.skipped_processes, 0) ?? 0;
  const processes: LiveProcess[] = [];
  for (const p of rawProcs) {
    const o = p as any;
    const pid = num(o?.pid);
    if (!o || pid === null || typeof o.name !== "string") {
      skipped++;
      continue;
    }
    processes.push({
      pid,
      name: o.name.trim() || `pid-${pid}`,
      cpuPercent: Math.max(0, num(o.cpu_percent, 0)!),
      memoryMB: Math.max(0, num(o.memory_mb, 0)!),
      memoryPercent: clampPct(num(o.memory_percent, 0)!),
      status: typeof o.status === "string" ? o.status : "unknown",
      threads: num(o.threads),
    });
    if (processes.length >= MAX_PROCESSES) break;
  }
  return {
    timestamp: num(r.timestamp) !== null ? Math.round(num(r.timestamp)! * 1000) : Date.now(),
    cpuPercent: clampPct(req(r.cpu_percent, "cpu_percent")),
    perCore: Array.isArray(r.per_core) ? r.per_core.filter((x: unknown) => typeof x === "number").map(clampPct) : [],
    memory: { totalMB, usedMB, availableMB, percent: clampPct(num(mem.percent, (usedMB / Math.max(1, totalMB)) * 100)!) },
    disk: { percent: num(r.disk?.percent), readMB: num(r.disk?.read_mb), writeMB: num(r.disk?.write_mb) },
    network: { sentMB: num(r.network?.sent_mb), recvMB: num(r.network?.recv_mb) },
    uptimeSec: num(r.uptime_sec, 0)!,
    processes,
    skippedProcesses: skipped,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FetchLike = (url: string, init?: any) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export async function fetchSnapshot(baseUrl = DEFAULT_TELEMETRY_URL, top = 25, fetchImpl: FetchLike = (u, i) => fetch(u, i), signal?: AbortSignal) {
  let res;
  try {
    res = await fetchImpl(`${baseUrl.replace(/\/$/, "")}/metrics?top=${Math.min(MAX_PROCESSES, Math.max(1, top))}`, { signal });
  } catch {
    throw new TelemetryError(`Cannot reach the monitor at ${baseUrl}. Is windows_monitor.py running?`, "network");
  }
  if (!res.ok) throw new TelemetryError(`Monitor responded with HTTP ${res.status}`, "http");
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new TelemetryError("Malformed telemetry: response is not JSON", "malformed");
  }
  return parseSnapshot(body);
}

export interface PollerState {
  status: TelemetryStatus;
  latest: SystemSnapshot | null;
  history: SystemSnapshot[]; // bounded window, oldest first
  error: string | null;
  lastUpdate: number | null;
}

/** Polls the monitor without overlapping requests. Call stop() to clean up. */
export function createPoller(opts: {
  baseUrl?: string;
  intervalMs?: number;
  windowSize?: number;
  top?: number;
  fetchImpl?: FetchLike;
  onChange: (s: PollerState) => void;
}) {
  const windowSize = opts.windowSize ?? 15;
  let state: PollerState = { status: "connecting", latest: null, history: [], error: null, lastUpdate: null };
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;
  let stopped = false;
  let controller: AbortController | null = null;
  const emit = (patch: Partial<PollerState>) => {
    state = { ...state, ...patch };
    opts.onChange(state);
  };
  const tick = async () => {
    if (stopped || inFlight) return;
    inFlight = true;
    controller = new AbortController();
    try {
      const snap = await fetchSnapshot(opts.baseUrl, opts.top, opts.fetchImpl, controller.signal);
      if (stopped) return;
      emit({ status: "connected", latest: snap, history: [...state.history, snap].slice(-windowSize), error: null, lastUpdate: Date.now() });
    } catch (e) {
      if (stopped) return;
      const err = e instanceof TelemetryError ? e : new TelemetryError(String(e), "network");
      emit({ status: err.kind === "network" ? "disconnected" : "error", error: err.message });
    } finally {
      inFlight = false;
      if (!stopped) timer = setTimeout(tick, opts.intervalMs ?? DEFAULT_POLL_MS);
    }
  };
  emit({});
  void tick();
  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      controller?.abort();
    },
    getState: () => state,
  };
}

// ---------- Conversion: real measurements → estimated simulation inputs ----------

export type TopNBy = "cpu" | "memory";

/** Top-N processes by CPU or memory; ties broken by PID for determinism. Excludes the idle pseudo-process. */
export function topProcesses(list: LiveProcess[], n: number, by: TopNBy = "cpu"): LiveProcess[] {
  const key = (p: LiveProcess) => (by === "cpu" ? p.cpuPercent : p.memoryMB);
  return list
    .filter((p) => p.pid !== 0 && !/^system idle process$/i.test(p.name))
    .slice()
    .sort((a, b) => key(b) - key(a) || a.pid - b.pid)
    .slice(0, Math.max(0, n));
}

/**
 * ESTIMATION RULES (documented in the UI):
 *  burst    = clamp(round(1 + cpu% / 10), 1, 20)        — busier processes get longer CPU bursts
 *  arrival  = rank index (0, 1, 2…) in the Top-N order  — deterministic stagger, not real ready-queue times
 *  priority = 1 + floor(rank * 5 / n)                   — highest observed CPU → priority 1
 * Same input snapshot → identical workload (reproducible).
 */
export function liveToWorkload(list: LiveProcess[]): OsProcess[] {
  const n = Math.max(1, list.length);
  return list.map((p, i) => ({
    id: `L${p.pid}`,
    name: `${p.name.replace(/\.exe$/i, "").slice(0, 12)}#${p.pid}`,
    arrival: i,
    burst: Math.min(20, Math.max(1, Math.round(1 + p.cpuPercent / 10))),
    priority: 1 + Math.floor((i * 5) / n),
  }));
}

/**
 * Representative allocation scenario scaled down to the simulator.
 * Simulated total = `simTotalKB`; each request is the process working set's share of REAL total RAM,
 * scaled into simTotalKB (min 1 KB). The `reservedFraction` of total models already-used RAM by
 * reserving an "OS+other" request first.
 */
export function liveToMemoryScenario(snap: SystemSnapshot, procs: LiveProcess[], simTotalKB = 4096, includeUsed = true) {
  const scale = simTotalKB / Math.max(1, snap.memory.totalMB);
  const requests: MemoryRequest[] = [];
  const picked = procs.reduce((s, p) => s + p.memoryMB, 0);
  if (includeUsed) {
    const other = Math.max(0, snap.memory.usedMB - picked);
    const kb = Math.round(other * scale);
    if (kb > 0) requests.push({ id: "live-os", processName: "OS+other", size: kb });
  }
  for (const p of procs) {
    requests.push({ id: `live-${p.pid}`, processName: p.name.replace(/\.exe$/i, "").slice(0, 10), size: Math.max(1, Math.round(p.memoryMB * scale)) });
  }
  return { totalMemory: simTotalKB, requests, scaleKBperMB: scale };
}

export interface LivePressure {
  samples: number;
  avgCpu: number;
  peakCpu: number;
  avgMem: number;
  cpuPressure: "low" | "moderate" | "sustained-high";
  memPressure: "normal" | "elevated" | "high";
  notes: string[];
}

/** Analyze a bounded window of snapshots (not a single sample). */
export function analyzePressure(history: SystemSnapshot[], window = 15): LivePressure | null {
  const w = history.slice(-window);
  if (w.length === 0) return null;
  const cpus = w.map((s) => s.cpuPercent);
  const avgCpu = cpus.reduce((a, b) => a + b, 0) / w.length;
  const avgMem = w.reduce((a, s) => a + s.memory.percent, 0) / w.length;
  const highShare = cpus.filter((c) => c >= 80).length / w.length;
  const cpuPressure = highShare >= 0.6 ? "sustained-high" : avgCpu >= 40 ? "moderate" : "low";
  const memPressure = avgMem >= 85 ? "high" : avgMem >= 70 ? "elevated" : "normal";
  const notes: string[] = [];
  if (w.length < 3) notes.push(`Only ${w.length} sample(s) so far — pressure estimate is preliminary.`);
  if (cpuPressure === "sustained-high") notes.push("CPU was ≥80% in most samples: a preemptive, short-job-favoring policy (SRTF / RR) keeps interactive tasks responsive.");
  else if (cpuPressure === "moderate") notes.push("Moderate CPU load: response time matters but throughput-friendly policies remain viable.");
  else notes.push("CPU mostly idle: almost any policy performs well; simple FCFS overhead is lowest.");
  if (memPressure !== "normal") notes.push(`RAM at ${avgMem.toFixed(0)}% on average: memory pressure can cause paging, so fewer concurrent jobs / shorter quanta help.`);
  return { samples: w.length, avgCpu, peakCpu: Math.max(...cpus), avgMem, cpuPressure, memPressure, notes };
}
