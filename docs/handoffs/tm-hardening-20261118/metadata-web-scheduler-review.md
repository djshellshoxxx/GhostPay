# TM15 active browser scheduler correction

## Scope and provenance

- Worker: `/root/metadata_privacy`; independent read-only reviewer: `/root/acceptance_review`.
- Repository: `/workspace/scratch/88088facfb13/GhostPay`; branch `chatgpt/ghostpay-tm-hardening-20261118`.
- Prior implementation checkpoint: `6464083bd75b9c6913bbea49c98be651026de7a5`.
- No commit, index mutation, checkout, locale edit, transport rewrite or checkpoint change by this worker for this correction.
- Fresh #241 metadata: head `e8857bfa1ec93fafa9ff83f63f7430ef26a362c2`, merged at `2026-11-19T06:08:21Z` as `5a33a435ffbb4711d0a5fa69ade9d32ad4f8b929`. Its 18 changed files do not include either modified runtime file below. Its transport changes are not imported into this continuation.

## Confirmed defect and narrow correction

Earlier cancellation fixes in `packages/scan-source` did not qualify the active web implementation. `createWindowedScanClient` used `padRange`, then allocated and scheduled its own shuffled window list without an AbortSignal. `Scan` passed its controller only into `runScan`; primary and secondary window clients did not receive it. Cancelling while `getLogs` was pending could therefore continue the inner window loop and the current outer fetch before control returned to `runScan`.

The failing real-view probes observed **9 announcement-window calls rather than the expected 1** on both primary and secondary paths after the user pressed Cancel and the first pending provider response settled.

The correction adds an optional signal to `WindowedOptions`/`OpenScanOptions` and passes the existing `ctl.signal` at `Scan.tsx:216` and `:250`. Scheduler guards check pre-dispatch state, head settlement, jitter settlement, window settlement, cached-result acceptance, and provider-limit rejection before any split retry. The existing `scan-aborted` sentinel produces the existing cancelled UI state and does not copy a caller-controlled abort reason. Provider-sized/unwindowed log calls also reject late responses.

The cap is **4096 per wrapper announcement `getLogs` invocation**. Before allocation/shuffling, bigint arithmetic rejects a grid exceeding 4096 windows (`scanPrivacy.ts:531–532`). A separate local counter permits at most 4096 uncached window dispatches including provider-limit splits (`:439–450`, `:545`). The fixed `INVALID_INPUT: scan request budget exceeded` error is terminal for the outer fetch rather than masquerading as another provider-limit response. Concurrent invocations have separate counters.

## Changed files

| File | Change |
|---|---|
| `apps/web/src/lib/scanPrivacy.ts` | Optional signal, scheduler guards, head/unwindowed response guards, arithmetic grid preflight and per-invocation split-inclusive dispatch budget. |
| `apps/web/src/views/Scan.tsx` | Two existing controller callsites: primary opening and secondary window construction. |
| `apps/web/src/lib/scanPrivacy.scheduler.test.ts` | New focused 15-case scheduler suite. |
| `apps/web/src/lib/scanPrivacy.clients.test.ts` | Two new tests: pre-aborted opening makes no call; opened scheduler receives the signal. |
| `apps/web/src/views/Scan.privacy.test.tsx` | Two behavioral Cancel probes through the actual Scan view, primary and secondary. |

## Exact verification history

Commands ran from `/workspace/scratch/88088facfb13/GhostPay/apps/web`. Logs live alongside this report. Counts across runs overlap and are not unique test totals.

1. **Failing-first baseline**

   `node ../../node_modules/vitest/vitest.mjs run src/lib/scanPrivacy.scheduler.test.ts src/lib/scanPrivacy.clients.test.ts src/views/Scan.privacy.test.tsx --maxWorkers=1`

   **Exit 1: 16 failed / 7 passed, 23 total, 3 files, 32.99 seconds.** Log: `metadata-web-scheduler-red.log`. All newly reproduced cancellation and budget behaviors failed against the original runtime. The exact-4096 unsplit control passed. Each real Cancel test observed 9 calls instead of 1. The failing budget probes used only 4097 ordinary windows or a bounded 3-window split tree; no deliberate OOM was attempted.

2. **Initial corrected runtime, same command**

   **Exit 1: 20 passed / 3 failed, 23 total, 3 files, 50.15 seconds.** Log: `metadata-web-scheduler-green.log` (the filename does not mean the run passed). All cancellation, client wiring, UI Cancel and control cases passed. The three remaining failures were expected-error assertions: the tests omitted the existing `ChainAdapterError` prefix `INVALID_INPUT: `. Those exact expectations were corrected; the required code, fixed text, zero-dispatch/pre-shuffle checks and split-budget count assertions were retained.

3. **Final-source acceptance and existing-behavior rerun**

   `node ../../node_modules/vitest/vitest.mjs run src/lib/scanPrivacy.scheduler.test.ts src/lib/scanPrivacy.clients.test.ts src/lib/scanPrivacy.test.ts src/views/Scan.privacy.test.tsx --maxWorkers=1`

   Final log reports **62 assertions passed / 4 files passed, 137.25 seconds**, including the corrected budget cases, new MAX_SAFE_INTEGER-sized preallocation boundary and concurrent-query budget separation. However, it also reports **`[vitest-pool]: Timeout terminating forks worker` for `Scan.privacy.test.tsx`**. The coordinator requested termination; Ctrl-C produced **process exit 130**. Totals flushed into `metadata-web-scheduler-final.log` after interruption. This is evidence that the 62 assertions passed, **not a clean completed process or final qualification gate**. Hosted CI remains required on the final published source. The huge-range case was added and run only after arithmetic preflight existed; it is not failing-first OOM evidence.

4. `git diff --check -- apps/web/src/lib/scanPrivacy.ts apps/web/src/lib/scanPrivacy.clients.test.ts apps/web/src/views/Scan.tsx apps/web/src/views/Scan.privacy.test.tsx`

   **Exit 0.** No new typed lint/typecheck or broad local build was run by this worker. The coordinator owns the final sequential/hosted gates. No additional local processes remain running.

## Boundaries and remaining limitations

- The 4096 budget covers initial grid allocation and uncached inner window dispatches per wrapper call. It excludes head/block reads, other RPC operations, and retries or further work inside an underlying transport/indexer. It is not an all-network or entire-scan request cap.
- A locally valid combination such as padding 100000 with one-block windows can now fail the combined request-budget check. Padding is not silently reduced. The parent updated disclosure text and documentation.
- Cancellation prevents further scheduler dispatch and late result acceptance **after an already-dispatched backend operation settles**. It cannot recall sent bytes or force a backend promise to finish. Inner indexer operations, transport retries, and client creation are not converted into a new deadline engine.
- `request` and `getBlock` pass through unchanged. Plain base RPC clients still serve manifest/receipt operations; this correction does not claim universal per-dispatch cancellation or a private-path policy engine.
- The TM14 shared EVM RPC policy guard remains separate from explicitly configured scan endpoints/indexers. Current root-owned disclosure text names that limitation, as well as relayer/Bitcoin/Solana/TRON adapter boundaries. No scope expansion was made here.
- Existing window alignment, head/block-zero boundaries, caching, provider-limit splitting, router fallback, filter validation and indexer checks are retained. No checkpoint format, receipt protocol, key generation, encryption protocol, transport timeout or chain contract was changed.

## Independent review and source pin

`acceptance_review` read the frozen runtime/test diff and reported no material runtime blocker in guard placement, controller wiring, per-invocation budgeting, split accounting or terminal budget errors. No separate new reviewer execution is claimed. The root stopped further local heavy runs because of resource/worker limits and will obtain final-source hosted qualification.

Exact frozen source hashes are in `metadata-web-scheduler-source.sha256`:

```text
81d6941d1adf3c7a3fccd605387ac010fc8a82e53607996a80b7e3911155b21c  apps/web/src/lib/scanPrivacy.ts
7998b56e8d32660912b6677e0297bff781652b4e301ff716c499521ed0b07c35  apps/web/src/views/Scan.tsx
3b69a2c46615fded546d641bdb7ff85c7c52dc02f81ea5209eeded433e731e4c  apps/web/src/lib/scanPrivacy.scheduler.test.ts
837635b3ce38e42a547ce5cd66f75496a1a87acb85eff13824395576853f17e3  apps/web/src/lib/scanPrivacy.clients.test.ts
72edf4d3856c30478c078730b11afad05486b288145250b0d86018b8b1bbf6e9  apps/web/src/views/Scan.privacy.test.tsx
```
