import type { PageAlgorithm, PageReplacementResult, PageStep } from "./types";

function simulate(references: number[], frameCount: number, algorithm: PageAlgorithm): PageReplacementResult {
  const frames: (number | null)[] = Array(frameCount).fill(null);
  const lastUsed = new Map<number, number>();
  const steps: PageStep[] = [];
  let faults = 0;
  let fifoPointer = 0;
  const refBit: boolean[] = Array(frameCount).fill(false);
  let hand = 0;

  references.forEach((page, i) => {
    let fault = false;
    let evicted: number | null = null;

    if (frames.includes(page)) {
      lastUsed.set(page, i);
      refBit[frames.indexOf(page)] = true;
    } else {
      fault = true;
      faults++;
      const emptyIdx = frames.indexOf(null);
      if (emptyIdx !== -1) {
        frames[emptyIdx] = page;
        refBit[emptyIdx] = true;
        if (algorithm === "clock") hand = (emptyIdx + 1) % frameCount;
        if (algorithm === "fifo" && emptyIdx === fifoPointer) fifoPointer = (fifoPointer + 1) % frameCount;
      } else {
        let victimIdx = 0;
        if (algorithm === "fifo") {
          victimIdx = fifoPointer;
          fifoPointer = (fifoPointer + 1) % frameCount;
        } else if (algorithm === "lru") {
          victimIdx = frames.reduce<number>((a, _, idx) => ((lastUsed.get(frames[idx]!) ?? -1) < (lastUsed.get(frames[a]!) ?? -1) ? idx : a), 0);
        } else if (algorithm === "clock") {
          // Second chance: skip (and clear) frames whose reference bit is set
          while (refBit[hand]) {
            refBit[hand] = false;
            hand = (hand + 1) % frameCount;
          }
          victimIdx = hand;
          hand = (hand + 1) % frameCount;
        } else {
          // OPT: evict the page whose next use is farthest in the future (or never)
          let farthest = -1;
          frames.forEach((f, idx) => {
            const nextUse = references.indexOf(f!, i + 1);
            const dist = nextUse === -1 ? Infinity : nextUse;
            if (dist > farthest) {
              farthest = dist;
              victimIdx = idx;
            }
          });
        }
        evicted = frames[victimIdx] ?? null;
        frames[victimIdx] = page;
        refBit[victimIdx] = true;
      }
      lastUsed.set(page, i);
    }

    steps.push({ index: i, page, frames: [...frames], fault, evicted });
  });

  const hits = references.length - faults;
  return {
    algorithm,
    references,
    frameCount,
    steps,
    faults,
    hits,
    faultRate: references.length ? (faults / references.length) * 100 : 0,
  };
}

export function runPageReplacement(algorithm: PageAlgorithm, references: number[], frameCount: number): PageReplacementResult {
  const frames = Math.max(1, Math.min(10, Math.round(frameCount)));
  const refs = references.filter((r) => Number.isFinite(r) && r >= 0);
  return simulate(refs, frames, algorithm);
}
