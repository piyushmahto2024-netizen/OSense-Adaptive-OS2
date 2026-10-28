import { ALL_ALGORITHMS, runScheduler } from "./scheduling";
import type { AdaptiveRecommendation, OsProcess, SchedulingAlgorithm, WorkloadFeatures } from "./types";

export function analyzeWorkload(processes: OsProcess[]): WorkloadFeatures {
  const n = processes.length;
  const bursts = processes.map((p) => p.burst);
  const arrivals = processes.map((p) => p.arrival);
  const priorities = processes.map((p) => p.priority);
  const avgBurst = n ? bursts.reduce((a, b) => a + b, 0) / n : 0;
  const variance = n ? bursts.reduce((a, b) => a + (b - avgBurst) ** 2, 0) / n : 0;
  const stdDev = Math.sqrt(variance);
  const arrivalSpread = n ? Math.max(...arrivals) - Math.min(...arrivals) : 0;
  const priorityRange = n ? Math.max(...priorities) - Math.min(...priorities) : 0;

  return {
    processCount: n,
    avgBurst,
    burstStdDev: stdDev,
    burstCV: avgBurst > 0 ? stdDev / avgBurst : 0,
    arrivalSpread,
    allArriveTogether: arrivalSpread === 0,
    priorityRange,
    shortJobFraction: n ? bursts.filter((b) => b <= avgBurst / 2).length / n : 0,
  };
}

function ruleBasedPick(f: WorkloadFeatures): { algorithm: SchedulingAlgorithm; reason: string } {
  if (f.priorityRange >= 5) {
    return {
      algorithm: "priority-p",
      reason: "Priorities vary widely, so a preemptive priority scheduler can react quickly to urgent work.",
    };
  }
  if (!f.allArriveTogether && f.shortJobFraction >= 0.5) {
    return {
      algorithm: "srtf",
      reason: "Jobs arrive over time and many are short, so preempting for the shortest remaining job minimizes waiting.",
    };
  }
  if (f.allArriveTogether && f.burstCV > 0.6) {
    return {
      algorithm: "sjf",
      reason: "All jobs are ready at once with very unequal bursts, so running short jobs first minimizes average waiting time.",
    };
  }
  if (f.burstCV <= 0.6) {
    return {
      algorithm: "rr",
      reason: "Burst times are fairly uniform, so Round Robin gives every job fair, responsive time slices.",
    };
  }
  return {
    algorithm: "fcfs",
    reason: "The workload is simple and arrival-ordered, so First-Come First-Served is adequate and cheapest to run.",
  };
}

/**
 * Adaptive engine: analyze the workload, pick an algorithm by rules, then
 * empirically verify by running every algorithm and scoring them on
 * average waiting time (70%) and average response time (30%).
 */
export function recommend(processes: OsProcess[], quantum = 2): AdaptiveRecommendation {
  const features = analyzeWorkload(processes);
  const rule = ruleBasedPick(features);

  const results = ALL_ALGORITHMS.filter((a) => a !== "mlfq").map((alg) => {
    const r = runScheduler(alg, processes, quantum);
    return { algorithm: alg, avgWaiting: r.metrics.avgWaiting, avgResponse: r.metrics.avgResponse };
  });

  const maxW = Math.max(...results.map((r) => r.avgWaiting), 1);
  const maxR = Math.max(...results.map((r) => r.avgResponse), 1);
  const ranking = results
    .map((r) => ({
      ...r,
      score: 0.7 * (r.avgWaiting / maxW) + 0.3 * (r.avgResponse / maxR),
    }))
    .sort((a, b) => a.score - b.score);

  const best = ranking[0]!;
  const ruleEntry = ranking.find((r) => r.algorithm === rule.algorithm)!;
  // Trust the rule unless the benchmark winner is meaningfully better (>5%).
  const ruleWithinTolerance = ruleEntry.score <= best.score * 1.05;
  const chosen = ruleWithinTolerance ? rule.algorithm : best.algorithm;
  const reason =
    chosen === rule.algorithm
      ? `${rule.reason} Benchmarking all six algorithms on this workload confirms it is at or near the best score.`
      : `${rule.reason} However, benchmarking all six algorithms on this exact workload shows ${best.algorithm.toUpperCase()} scores clearly better, so the engine overrides the rule.`;

  return { algorithm: chosen, ...(chosen === "rr" && { quantum }), reason, features, ranking };
}
