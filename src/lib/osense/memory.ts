import type { AllocationResult, AllocationStep, FitStrategy, MemoryBlock, MemoryRequest } from "./types";

let blockCounter = 0;
function makeBlock(start: number, size: number): MemoryBlock {
  return { id: ++blockCounter, start, size, free: true, processId: null };
}

export function initMemory(totalMemory: number): MemoryBlock[] {
  blockCounter = 0;
  return [makeBlock(0, totalMemory)];
}

function coalesce(blocks: MemoryBlock[]): MemoryBlock[] {
  const out: MemoryBlock[] = [];
  for (const b of blocks) {
    const last = out[out.length - 1];
    if (last && last.free && b.free) {
      last.size += b.size;
    } else {
      out.push({ ...b });
    }
  }
  // renumber starts
  let start = 0;
  for (const b of out) {
    b.start = start;
    start += b.size;
  }
  return out;
}

function pickBlockIndex(blocks: MemoryBlock[], size: number, strategy: FitStrategy): number {
  let best = -1;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    if (!b.free || b.size < size) continue;
    if (best === -1) {
      best = i;
      continue;
    }
    if (strategy === "best" && b.size < blocks[best]!.size) best = i;
    if (strategy === "worst" && b.size > blocks[best]!.size) best = i;
    // first fit: keep earliest
  }
  return best;
}

function allocate(blocks: MemoryBlock[], req: MemoryRequest, strategy: FitStrategy): { blocks: MemoryBlock[]; blockId: number | null } {
  const idx = pickBlockIndex(blocks, req.size, strategy);
  if (idx === -1) return { blocks, blockId: null };
  const target = blocks[idx]!;
  const blockId = target.id;
  const allocated: MemoryBlock = { ...target, size: req.size, free: false, processId: req.processName };
  const remainder = target.size - req.size;
  const next = [...blocks];
  if (remainder > 0) {
    next.splice(idx, 1, allocated, makeBlock(target.start + req.size, remainder));
  } else {
    next.splice(idx, 1, allocated);
  }
  return { blocks: next, blockId };
}

export function freeProcess(blocks: MemoryBlock[], processId: string): MemoryBlock[] {
  return coalesce(blocks.map((b) => (b.processId === processId ? { ...b, free: true, processId: null } : { ...b })));
}

export function runAllocation(totalMemory: number, requests: MemoryRequest[], strategy: FitStrategy): AllocationResult {
  let blocks = initMemory(totalMemory);
  const steps: AllocationStep[] = [];
  let failed = 0;

  for (const req of requests) {
    const { blocks: next, blockId } = allocate(blocks, req, strategy);
    const success = blockId !== null;
    if (!success) failed++;
    blocks = next;
    steps.push({ request: req, success, blockId, blocksAfter: blocks.map((b) => ({ ...b })) });
  }

  const finalBlocks = coalesce(blocks);
  const freeBytes = finalBlocks.filter((b) => b.free).reduce((a, b) => a + b.size, 0);
  const largestFree = finalBlocks.filter((b) => b.free).reduce((a, b) => Math.max(a, b.size), 0);

  return {
    strategy,
    totalMemory,
    steps,
    finalBlocks,
    allocatedBytes: totalMemory - freeBytes,
    freeBytes,
    largestFreeBlock: largestFree,
    externalFragmentation: freeBytes - largestFree,
    failedRequests: failed,
  };
}
