# Negative handled timestamp regression — 2026-11-24 UTC

- Base main: c8e131c1402a96b5c9d5cd8dc5ae4f0c02188063.
- Branch: automation/20261124T2125Z/bug/schedule-negative-handled; ownership commit 3262781ad35d15e46234179ecc11ae7ebdd55164.
- Regression commit bc9487c7bc59d495d9ab5c18b8d0cf6c9cdf5459; test blob 30ba7f98b0aa63989ec4078ae61a4f1303acaa5d.
- Production repair ed062aeb10108a2ae7837305928544bf1e53ad91; original schedule.ts blob a8161275fd2efd3c4f47a90a90cf9c4d24016e1c; repaired blob 9e2364defb219a528967f53bb41a959cbad6784d.

## Defect and repair
The exported markHandled helper accepts negative safe integers. With lastHandledMs null, -1 is persisted into the returned schedule; the existing evaluateRecurrence guard rejects that value. With a previously handled schedule the same invalid argument silently succeeds. Reject negative timestamps at the same validation boundary as nonintegers. No changes to scheduling semantics for valid input, no real funds, no new features/dependencies.

## Evidence
A fresh read of exact commits and six Git blob hashes was verified by recomputing SHA-1 using Git's blob header. Dependency blobs: recurrence.ts c7a549975ee327f44068ddc619c99e72391b559f; time.ts e8ec37233c1347378d06eee881bbf12589f47245; result.ts 0bfd142f44e06b3acf832a5b27ab3d0bddc98db8. Executed actual markHandled, evaluateSchedule, evaluateRecurrence and their daily calendar/clock function bodies in V8 with TypeScript annotations removed, source-matched constants and Vitest-compatible minimal assertion shims. Committed regression bodies: before 1/3 passed (both negative rejection cases failed with expected RangeError absent); after 3/3 passed. Control cases include zero, monotonic updates, NaN/fraction rejection, due/next evaluation. Initial isolated markHandled probes: 4/6 before, 6/6 after proposed correction. No native Vitest, full repository, browser, lint/build or deployment verification claimed. Local git ls-remote fails DNS resolution.

## Coordination / outstanding gates
All 243 open PR changed-file inventories at discovery inspected for both source and regression paths, none matched. Main ACTIVE_WORK did not claim these paths. Existing recurrence.ts owners #616/#617 are untouched. Integration lock ref 4fe0656517a03cb7a39d4e248187c76ffaa3238a generation 20 released, not acquired. Recheck live ownership, main, dependency compatibility, exact-head all-required hosted CI, applicable native browser evidence and independent review before integration. No separate verifier available in this round, and no shared branch or main changes authorized. Leave draft.
