import { mulberry32, randInt } from "./rng";
import type { OsProcess } from "./types";

/** Generate a reproducible random workload from a seed. */
export function generateWorkload(seed: number, count: number): OsProcess[] {
  const rng = mulberry32(seed);
  const n = Math.max(2, Math.min(12, Math.round(count)));
  return Array.from({ length: n }, (_, i) => ({
    id: `P${i + 1}`,
    name: `P${i + 1}`,
    arrival: randInt(rng, 0, 12),
    burst: randInt(rng, 1, 16),
    priority: randInt(rng, 1, 8),
  }));
}

export const SAMPLE_WORKLOAD: OsProcess[] = [
  { id: "P1", name: "P1", arrival: 0, burst: 8, priority: 3 },
  { id: "P2", name: "P2", arrival: 1, burst: 4, priority: 1 },
  { id: "P3", name: "P3", arrival: 2, burst: 9, priority: 4 },
  { id: "P4", name: "P4", arrival: 3, burst: 5, priority: 2 },
];
