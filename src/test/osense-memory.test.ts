import { describe, expect, it } from "vitest";
import { initMemory, runAllocation } from "@/lib/osense/memory";
import { runPageReplacement } from "@/lib/osense/pageReplacement";
import type { MemoryRequest } from "@/lib/osense/types";

describe("contiguous allocation", () => {
  const reqs: MemoryRequest[] = [
    { id: "r1", processName: "A", size: 100 },
    { id: "r2", processName: "B", size: 200 },
  ];

  it("first fit takes the earliest sufficient hole", () => {
    const r = runAllocation(500, reqs, "first");
    expect(r.failedRequests).toBe(0);
    expect(r.allocatedBytes).toBe(300);
    expect(r.freeBytes).toBe(200);
  });

  it("fails requests larger than any hole and counts them", () => {
    const r = runAllocation(100, [{ id: "r1", processName: "Big", size: 150 }], "best");
    expect(r.failedRequests).toBe(1);
    expect(r.steps[0]!.success).toBe(false);
  });

  it("best fit leaves the smallest remainder", () => {
    // 500 total; allocate 100 (hole 400), then a 300 request: best fit uses the 400 hole leaving 100
    const r = runAllocation(500, reqs, "best");
    expect(r.largestFreeBlock).toBe(200);
    expect(r.externalFragmentation).toBe(0);
  });

  it("initMemory returns a single free block", () => {
    const blocks = initMemory(1024);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.size).toBe(1024);
    expect(blocks[0]!.free).toBe(true);
  });
});

describe("page replacement", () => {
  // Classic reference string from textbooks
  const refs = [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2];

  it("FIFO produces 10 faults with 3 frames", () => {
    const r = runPageReplacement("fifo", refs, 3);
    expect(r.faults).toBe(10);
    expect(r.hits).toBe(3);
  });

  it("LRU produces 9 faults with 3 frames", () => {
    const r = runPageReplacement("lru", refs, 3);
    expect(r.faults).toBe(9);
  });

  it("OPT produces 7 faults with 3 frames", () => {
    const r = runPageReplacement("opt", refs, 3);
    expect(r.faults).toBe(7);
  });

  it("more frames never increase faults for LRU (Belady-free)", () => {
    const f3 = runPageReplacement("lru", refs, 3).faults;
    const f4 = runPageReplacement("lru", refs, 4).faults;
    expect(f4).toBeLessThanOrEqual(f3);
  });
});
