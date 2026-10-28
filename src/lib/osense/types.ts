// Core domain types for OSense 2.0

export interface OsProcess {
  id: string;
  name: string;
  arrival: number; // arrival time (ms/ticks)
  burst: number; // CPU burst time
  priority: number; // lower number = higher priority
}

export interface GanttSegment {
  processId: string | null; // null = CPU idle
  label: string;
  start: number;
  end: number;
}

export interface ProcessMetric {
  processId: string;
  name: string;
  arrival: number;
  burst: number;
  priority: number;
  start: number; // first time scheduled
  completion: number;
  turnaround: number; // completion - arrival
  waiting: number; // turnaround - burst
  response: number; // start - arrival
}

export interface ScheduleMetrics {
  avgWaiting: number;
  avgTurnaround: number;
  avgResponse: number;
  throughput: number; // processes per time unit
  cpuUtilization: number; // 0..100
  totalTime: number;
  contextSwitches: number;
}

export type SchedulingAlgorithm =
  | "fcfs"
  | "sjf"
  | "srtf"
  | "priority"
  | "priority-p"
  | "rr"
  | "mlfq";

export const ALGORITHM_LABELS: Record<SchedulingAlgorithm, string> = {
  fcfs: "First-Come First-Served",
  sjf: "Shortest Job First",
  srtf: "Shortest Remaining Time First",
  priority: "Priority (non-preemptive)",
  "priority-p": "Priority (preemptive)",
  rr: "Round Robin",
  mlfq: "Multi-Level Feedback Queue",
};

export interface ScheduleResult {
  algorithm: SchedulingAlgorithm;
  quantum?: number;
  segments: GanttSegment[];
  processes: ProcessMetric[];
  metrics: ScheduleMetrics;
}

// ---- Memory ----

export type FitStrategy = "first" | "best" | "worst";

export const FIT_LABELS: Record<FitStrategy, string> = {
  first: "First Fit",
  best: "Best Fit",
  worst: "Worst Fit",
};

export interface MemoryBlock {
  id: number;
  start: number;
  size: number;
  free: boolean;
  processId: string | null;
}

export interface MemoryRequest {
  id: string;
  processName: string;
  size: number;
}

export interface AllocationStep {
  request: MemoryRequest;
  success: boolean;
  blockId: number | null;
  blocksAfter: MemoryBlock[];
}

export interface AllocationResult {
  strategy: FitStrategy;
  totalMemory: number;
  steps: AllocationStep[];
  finalBlocks: MemoryBlock[];
  allocatedBytes: number;
  freeBytes: number;
  largestFreeBlock: number;
  externalFragmentation: number; // freeBytes - largestFreeBlock
  failedRequests: number;
}

// ---- Page replacement ----

export type PageAlgorithm = "fifo" | "lru" | "opt" | "clock";

export const PAGE_LABELS: Record<PageAlgorithm, string> = {
  fifo: "FIFO",
  lru: "LRU",
  opt: "Optimal",
  clock: "Clock (Second-Chance)",
};

export interface PageStep {
  index: number;
  page: number;
  frames: (number | null)[];
  fault: boolean;
  evicted: number | null;
}

export interface PageReplacementResult {
  algorithm: PageAlgorithm;
  references: number[];
  frameCount: number;
  steps: PageStep[];
  faults: number;
  hits: number;
  faultRate: number; // 0..100
}

// ---- Adaptive engine ----

export interface WorkloadFeatures {
  processCount: number;
  avgBurst: number;
  burstStdDev: number;
  burstCV: number; // coefficient of variation
  arrivalSpread: number;
  allArriveTogether: boolean;
  priorityRange: number;
  shortJobFraction: number; // fraction with burst <= avg/2
}

export interface AdaptiveRecommendation {
  algorithm: SchedulingAlgorithm;
  quantum?: number;
  reason: string;
  features: WorkloadFeatures;
  ranking: { algorithm: SchedulingAlgorithm; score: number; avgWaiting: number }[];
}

// ---- Experiment history ----

export interface ExperimentRecord {
  id: string;
  timestamp: number;
  kind: "scheduling" | "memory" | "paging" | "adaptive" | "benchmark";
  title: string;
  config: Record<string, unknown>;
  summary: string;
  data: unknown;
}
