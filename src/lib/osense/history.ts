import type { ExperimentRecord } from "./types";

const KEY = "osense2-history";
const MAX_RECORDS = 50;

export function loadHistory(): ExperimentRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ExperimentRecord[]) : [];
  } catch {
    return [];
  }
}

export function saveExperiment(record: Omit<ExperimentRecord, "id" | "timestamp">): ExperimentRecord[] {
  const full: ExperimentRecord = {
    ...record,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
  };
  const next = [full, ...loadHistory()].slice(0, MAX_RECORDS);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  }
  return next;
}

export function clearHistory(): void {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(KEY);
  }
}

export function deleteExperiment(id: string): ExperimentRecord[] {
  const next = loadHistory().filter((r) => r.id !== id);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  }
  return next;
}
