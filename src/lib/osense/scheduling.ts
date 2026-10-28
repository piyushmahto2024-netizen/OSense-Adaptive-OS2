import type {
  GanttSegment,
  OsProcess,
  ProcessMetric,
  ScheduleMetrics,
  ScheduleResult,
  SchedulingAlgorithm,
} from "./types";

function clone(procs: OsProcess[]): OsProcess[] {
  return procs.map((p) => ({ ...p }));
}

function pushSegment(segments: GanttSegment[], processId: string | null, label: string, start: number, end: number) {
  if (end <= start) return;
  const last = segments[segments.length - 1];
  if (last && last.processId === processId && last.end === start) {
    last.end = end;
    return;
  }
  segments.push({ processId, label, start, end });
}

function buildResult(
  algorithm: SchedulingAlgorithm,
  procs: OsProcess[],
  segments: GanttSegment[],
  firstStart: Map<string, number>,
  completion: Map<string, number>,
  quantum?: number,
): ScheduleResult {
  const metrics: ProcessMetric[] = procs.map((p) => {
    const start = firstStart.get(p.id) ?? p.arrival;
    const comp = completion.get(p.id) ?? p.arrival;
    const turnaround = comp - p.arrival;
    const waiting = turnaround - p.burst;
    return {
      processId: p.id,
      name: p.name,
      arrival: p.arrival,
      burst: p.burst,
      priority: p.priority,
      start,
      completion: comp,
      turnaround,
      waiting,
      response: start - p.arrival,
    };
  });

  const n = metrics.length;
  const totalTime = segments.length ? segments[segments.length - 1]!.end : 0;
  const busy = segments.filter((s) => s.processId !== null).reduce((a, s) => a + (s.end - s.start), 0);
  let contextSwitches = 0;
  for (let i = 1; i < segments.length; i++) {
    if (segments[i]!.processId !== segments[i - 1]!.processId) contextSwitches++;
  }

  const agg: ScheduleMetrics = {
    avgWaiting: n ? metrics.reduce((a, m) => a + m.waiting, 0) / n : 0,
    avgTurnaround: n ? metrics.reduce((a, m) => a + m.turnaround, 0) / n : 0,
    avgResponse: n ? metrics.reduce((a, m) => a + m.response, 0) / n : 0,
    throughput: totalTime > 0 ? n / totalTime : 0,
    cpuUtilization: totalTime > 0 ? (busy / totalTime) * 100 : 0,
    totalTime,
    contextSwitches,
  };

  return { algorithm, ...(quantum !== undefined && { quantum }), segments, processes: metrics, metrics: agg };
}

/** Non-preemptive scheduler driven by a pick() function over the ready queue. */
function runNonPreemptive(
  algorithm: SchedulingAlgorithm,
  input: OsProcess[],
  pick: (ready: OsProcess[]) => OsProcess,
): ScheduleResult {
  const procs = clone(input).sort((a, b) => a.arrival - b.arrival || a.id.localeCompare(b.id));
  const segments: GanttSegment[] = [];
  const firstStart = new Map<string, number>();
  const completion = new Map<string, number>();
  const done = new Set<string>();
  let time = 0;

  while (done.size < procs.length) {
    const ready = procs.filter((p) => p.arrival <= time && !done.has(p.id));
    if (ready.length === 0) {
      const nextArrival = Math.min(...procs.filter((p) => !done.has(p.id)).map((p) => p.arrival));
      pushSegment(segments, null, "idle", time, nextArrival);
      time = nextArrival;
      continue;
    }
    const p = pick(ready);
    pushSegment(segments, p.id, p.name, time, time + p.burst);
    firstStart.set(p.id, time);
    time += p.burst;
    completion.set(p.id, time);
    done.add(p.id);
  }

  return buildResult(algorithm, input, segments, firstStart, completion);
}

export function fcfs(input: OsProcess[]): ScheduleResult {
  return runNonPreemptive("fcfs", input, (ready) =>
    ready.reduce((a, b) => (a.arrival < b.arrival || (a.arrival === b.arrival && a.id < b.id) ? a : b)),
  );
}

export function sjf(input: OsProcess[]): ScheduleResult {
  return runNonPreemptive("sjf", input, (ready) =>
    ready.reduce((a, b) => (a.burst < b.burst || (a.burst === b.burst && (a.arrival < b.arrival || (a.arrival === b.arrival && a.id < b.id))) ? a : b)),
  );
}

export function priorityNP(input: OsProcess[]): ScheduleResult {
  return runNonPreemptive("priority", input, (ready) =>
    ready.reduce((a, b) => (a.priority < b.priority || (a.priority === b.priority && (a.arrival < b.arrival || (a.arrival === b.arrival && a.id < b.id))) ? a : b)),
  );
}

/** Generic preemptive unit-time simulator. */
function runPreemptive(
  algorithm: SchedulingAlgorithm,
  input: OsProcess[],
  pick: (ready: { p: OsProcess; remaining: number }[]) => { p: OsProcess; remaining: number },
  quantum?: number,
): ScheduleResult {
  const procs = clone(input).sort((a, b) => a.arrival - b.arrival || a.id.localeCompare(b.id));
  const remaining = new Map(procs.map((p) => [p.id, p.burst]));
  const segments: GanttSegment[] = [];
  const firstStart = new Map<string, number>();
  const completion = new Map<string, number>();
  const done = new Set<string>();
  let time = 0;
  let currentId: string | null = null;
  let quantumLeft = quantum ?? Infinity;
  const queue: string[] = []; // ready queue (order matters for RR)

  const maxTime = procs.reduce((a, p) => a + p.burst, 0) + Math.max(...procs.map((p) => p.arrival), 0) + 1;

  const entry = (id: string) => ({ p: procs.find((x) => x.id === id)!, remaining: remaining.get(id)! });

  while (done.size < procs.length && time <= maxTime) {
    // admit arrivals at this tick
    for (const p of procs) {
      if (p.arrival === time && !done.has(p.id) && !queue.includes(p.id) && p.id !== currentId) {
        queue.push(p.id);
      }
    }

    if (algorithm === "rr") {
      if (currentId !== null && quantumLeft === 0) {
        if ((remaining.get(currentId) ?? 0) > 0) queue.push(currentId);
        currentId = null;
      }
      if (currentId === null && queue.length > 0) {
        currentId = queue.shift()!;
        quantumLeft = quantum ?? Infinity;
      }
    } else {
      // re-decide every tick, considering the running process too
      const candidates = [...queue, ...(currentId !== null ? [currentId] : [])]
        .filter((id) => (remaining.get(id) ?? 0) > 0)
        .map(entry);
      if (candidates.length > 0) {
        const chosen = pick(candidates);
        if (chosen.p.id !== currentId) {
          if (currentId !== null && (remaining.get(currentId) ?? 0) > 0 && !queue.includes(currentId)) {
            queue.push(currentId);
          }
          currentId = chosen.p.id;
          const idx = queue.indexOf(currentId);
          if (idx >= 0) queue.splice(idx, 1);
        }
      }
    }

    if (currentId === null) {
      // CPU idle: jump to next arrival
      const future = procs.filter((p) => !done.has(p.id) && p.arrival > time).map((p) => p.arrival);
      if (future.length === 0) break;
      const nextArrival = Math.min(...future);
      pushSegment(segments, null, "idle", time, nextArrival);
      time = nextArrival;
      continue;
    }

    if (!firstStart.has(currentId)) firstStart.set(currentId, time);
    pushSegment(segments, currentId, procs.find((p) => p.id === currentId)!.name, time, time + 1);
    remaining.set(currentId, (remaining.get(currentId) ?? 0) - 1);
    quantumLeft--;
    time++;

    if ((remaining.get(currentId) ?? 0) === 0) {
      completion.set(currentId, time);
      done.add(currentId);
      currentId = null;
      quantumLeft = quantum ?? Infinity;
    }
  }

  return buildResult(algorithm, input, segments, firstStart, completion, quantum);
}

export function srtf(input: OsProcess[]): ScheduleResult {
  return runPreemptive("srtf", input, (ready) =>
    ready.reduce((a, b) => (a.remaining < b.remaining || (a.remaining === b.remaining && (a.p.arrival < b.p.arrival || (a.p.arrival === b.p.arrival && a.p.id < b.p.id))) ? a : b)),
  );
}

export function priorityP(input: OsProcess[]): ScheduleResult {
  return runPreemptive("priority-p", input, (ready) =>
    ready.reduce((a, b) => (a.p.priority < b.p.priority || (a.p.priority === b.p.priority && (a.p.arrival < b.p.arrival || (a.p.arrival === b.p.arrival && a.p.id < b.p.id))) ? a : b)),
  );
}

export function roundRobin(input: OsProcess[], quantum: number): ScheduleResult {
  return runPreemptive("rr", input, (ready) => ready[0]!, Math.max(1, Math.round(quantum)));
}

/**
 * MLFQ: 3 queues. Q0 RR q=2, Q1 RR q=4, Q2 FCFS. A process that uses its full
 * quantum is demoted one level; new arrivals enter Q0. Higher queues preempt
 * lower ones at tick boundaries. Every `boostInterval` ticks all processes are
 * moved back to Q0 to prevent starvation.
 */
export function mlfq(input: OsProcess[], quanta: [number, number] = [2, 4], boostInterval = 20): ScheduleResult {
  const procs = clone(input).sort((a, b) => a.arrival - b.arrival || a.id.localeCompare(b.id));
  const remaining = new Map(procs.map((p) => [p.id, p.burst]));
  const level = new Map<string, number>();
  const queues: string[][] = [[], [], []];
  const segments: GanttSegment[] = [];
  const firstStart = new Map<string, number>();
  const completion = new Map<string, number>();
  const done = new Set<string>();
  let time = 0;
  let current: string | null = null;
  let used = 0;
  const qLimit = (lvl: number) => (lvl === 0 ? quanta[0] : lvl === 1 ? quanta[1] : Infinity);
  const admitted = new Set<string>();

  while (done.size < procs.length) {
    for (const p of procs) {
      if (p.arrival <= time && !admitted.has(p.id)) {
        admitted.add(p.id);
        level.set(p.id, 0);
        queues[0]!.push(p.id);
      }
    }
    if (boostInterval > 0 && time > 0 && time % boostInterval === 0) {
      for (let l = 1; l < 3; l++) {
        queues[0]!.push(...queues[l]!);
        queues[l] = [];
      }
      for (const id of queues[0]!) level.set(id, 0);
      if (current !== null && level.get(current)! > 0) {
        level.set(current, 0);
        used = 0;
      }
    }
    // preempt if a higher-priority queue is non-empty
    if (current !== null) {
      const cl = level.get(current)!;
      if (queues.slice(0, cl).some((q) => q.length > 0)) {
        queues[cl]!.unshift(current);
        current = null;
      }
    }
    if (current === null) {
      const lvl = queues.findIndex((q) => q.length > 0);
      if (lvl === -1) {
        const future = procs.filter((p) => !admitted.has(p.id)).map((p) => p.arrival);
        if (future.length === 0) break;
        const next = Math.min(...future);
        pushSegment(segments, null, "idle", time, next);
        time = next;
        continue;
      }
      current = queues[lvl]!.shift()!;
      used = 0;
    }
    const id = current;
    if (!firstStart.has(id)) firstStart.set(id, time);
    pushSegment(segments, id, procs.find((p) => p.id === id)!.name, time, time + 1);
    remaining.set(id, remaining.get(id)! - 1);
    used++;
    time++;
    if (remaining.get(id) === 0) {
      completion.set(id, time);
      done.add(id);
      current = null;
    } else if (used >= qLimit(level.get(id)!)) {
      const nl = Math.min(2, level.get(id)! + 1);
      level.set(id, nl);
      // arrivals at this tick enter Q0 first; demoted process goes to tail of its new queue
      for (const p of procs) {
        if (p.arrival <= time && !admitted.has(p.id)) {
          admitted.add(p.id);
          level.set(p.id, 0);
          queues[0]!.push(p.id);
        }
      }
      queues[nl]!.push(id);
      current = null;
    }
  }
  return buildResult("mlfq", input, segments, firstStart, completion);
}

export function runScheduler(
  algorithm: SchedulingAlgorithm,
  processes: OsProcess[],
  quantum = 2,
): ScheduleResult {
  switch (algorithm) {
    case "fcfs":
      return fcfs(processes);
    case "sjf":
      return sjf(processes);
    case "srtf":
      return srtf(processes);
    case "priority":
      return priorityNP(processes);
    case "priority-p":
      return priorityP(processes);
    case "rr":
      return roundRobin(processes, quantum);
    case "mlfq":
      return mlfq(processes);
  }
}

export const ALL_ALGORITHMS: SchedulingAlgorithm[] = ["fcfs", "sjf", "srtf", "priority", "priority-p", "rr", "mlfq"];
