# OSense 2.0 — Build Roadmap

- [x] Core engine: types, seeded RNG, CPU scheduling (FCFS, SJF, SRTF, Priority NP/P, Round Robin)
- [x] Memory: contiguous allocation (first/best/worst fit), paging, page replacement (FIFO, LRU, OPT)
- [x] Metrics: waiting/turnaround/response/throughput/utilization
- [x] Adaptive engine: workload analysis + algorithm recommendation
- [x] Benchmark/compare mode across all algorithms
- [x] Export: CSV / JSON / print-PDF report
- [x] Experiment history (localStorage persistence)
- [x] UI: dark console theme, tabs (Scheduling, Memory, Page Replacement, Adaptive, Benchmark, History), Gantt charts, process editor
- [x] Head metadata + fonts
- [x] Automated tests (vitest) for scheduling, memory, adaptive rules — 22 passing
- [x] Verify: tests pass, build OK, browser walkthrough of all six tabs
- [x] Live Windows telemetry: monitor script, telemetry bridge, Live toggle in Scheduling/Memory/Adaptive, 6 tests
- [x] MLFQ scheduler + Clock page replacement, 4 tests (32 total)
- [x] Downloadable project ZIP
