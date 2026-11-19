# TM1 / TM7 / TM8 — bounded independent local execution

Reviewer: `acceptance_review`. Date: 2026-11-19.

**Result: exit 0; six files passed; 58 selected tests passed, zero failures.**
Another 138 defined tests were deliberately excluded by the test-name filter.
This was one bounded selection, executed once, with one worker and a 512 MB Node
heap. No product source or test was edited and no retry was needed.

## Source and process identity

- Repository HEAD and requested runtime checkpoint:
  `f0c15de9b381ac8a13ed3c76781d7fad8b236391`.
- The five-file CSP scanner correction was present in the working tree; its
  separate review is recorded in `tm5-scanner-acceptance-review.md`. It does not
  alter this selection's runtime source.
- Before execution, `git diff --quiet` against the requested checkpoint verified
  the selected test, runtime, dependency-source, configuration and lockfile
  inputs were unchanged. Twenty explicit SHA-256 entries, including the actual
  built hygiene ledger entrypoints, were captured before and after execution;
  all remained identical.
- Node: `v24.22.3`. `NODE_OPTIONS=--max-old-space-size=512`.
- Worker count: `--maxWorkers=1`; existing configured fork pool and isolation
  retained. No coverage thresholds or test definitions changed.
- Start: `2026-11-19T07:35:48.538Z`. Total supervised process duration:
  **21.744 seconds**; Vitest-reported duration: **20.93 seconds**.
- The command was supervised with a **120-second** timeout, interrupt followed
  by forced termination after another 10 seconds if necessary. Neither limit
  was reached. Exit was **0**, signal **null**.

The authoritative exact executable path, argument vector, working directory,
test-name filter, times, exit, per-file totals and before/after hashes are in
`acceptance-tm1-tm7-tm8.json`. A conventional hash manifest is saved as
`acceptance-tm1-tm7-tm8.sha256`; the complete verbose output is
`acceptance-tm1-tm7-tm8.log`.

## Selection and acceptance mapping

Paths came from the current completion/defaults matrix and its TM1, TM7 and TM8
source references. All paths in the table are relative to `apps/web`.

| Test file | Passed | Deliberately filtered | Executed acceptance |
|---|---:|---:|---|
| `src/views/Sweep.privacy.test.tsx` | 17 | 0 | No RPC creation or balance read on opening; a disclosed action authorizes one read; payment/asset changes require a fresh action; payment/asset/chain/provider/factory/session/lock/unmount changes during client creation prevent stale reads; rejected/unavailable RPCs do not silently retry or fall back. |
| `src/views/Sweep.test.tsx` | 2 | 55 | Actual Sweep integration: no balance before the action, advisory reuse warning and post-sweep recording; late sweep completion after app lock cannot restore cleared address links. |
| `src/lib/sweep.destinations.privacy.test.ts` | 10 | 0 | No persistence/import of plaintext linkage; in-memory behavior with absent or denied storage; best-effort legacy-key cleanup; manual/idle lock, seller replacement and silent clearing; late-result epoch refusal; copied snapshots and no-session refusal. |
| `src/lib/scanCursorSlot.test.ts` | 13 | 0 | Private HKDF v4 names bound to viewing key, chain and key ID; no public identifiers in slot/value; matching-key resume; legacy rescan behavior; storage failure; session-bound lending/cache separation and borrowed-key wiping on success/failure. |
| `src/lib/scanCheckpointPrivacy.test.ts` | 7 | 0 | Separate v4 namespace; wrong-seller read/write refusal; retained-store invalidation on lock/replacement; v1/v2 and both incompatible v3 formats ignored/cleaned; explicit HKDF-v3 and HMAC-v3 non-resume cases; no public-v2 import when a new write would fail. |
| `src/lib/scanClient.test.ts` | 9 | 83 | Checkpoint key-set/chain separation; finality and reorg resume behavior; cursor round-trip; malformed/corrupt storage handling and unavailable storage; pending old scans cannot persist after silent lock, different-seller replacement or same-seller reinstall. |
| **Total** | **58** | **138** | **Six files; zero executed failures.** |

The current TM8 format is **HKDF v4**. The HMAC tests prove refusal to resume the
legacy HMAC-v3 format; they do not qualify a revived v2-to-v3 migration. Cursor
contents remain plaintext and unauthenticated. Corruption tests exercise the
existing parser/fallback behavior, not cryptographic integrity or confidentiality.

## Command

Working directory: `/workspace/scratch/88088facfb13/GhostPay/apps/web`.
The command below uses the same executable and arguments as the receipt, with
line wrapping added for readability:

```sh
NODE_OPTIONS=--max-old-space-size=512 timeout --signal=INT --kill-after=10s 120s \
  /opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node \
  /workspace/scratch/88088facfb13/GhostPay/node_modules/vitest/vitest.mjs run \
  src/views/Sweep.privacy.test.tsx \
  src/views/Sweep.test.tsx \
  src/lib/sweep.destinations.privacy.test.ts \
  src/lib/scanCursorSlot.test.ts \
  src/lib/scanCheckpointPrivacy.test.ts \
  src/lib/scanClient.test.ts \
  --maxWorkers=1 --reporter=verbose \
  --testNamePattern 'Sweep balance read and scan privacy|TM1/TM7:|TM7: a sweep completed|TM7 session-only destination history|SEC-22 scan cursor slot names|checkpoint format reconciliation|localCheckpointStore.*(round-trips a cursor|ignores corrupt data)|WEB-APP-04 / CHAIN-ADAPTERS-03: checkpoints|two-provider replay-tail checkpoint anchor.*cannot persist an old scan'
```

## Qualification limits

This closes the identified **local targeted execution gap** for TM1, TM7 and TM8
on the recorded runtime source. The result can replace their prior
source/test-definition-only status with a targeted local pass. The 138 filtered
cases are not passed cases and no full-file pass is claimed for `Sweep.test.tsx`
or `scanClient.test.ts` beyond their selected cases.

The run reused the installed workspace and built dependency artifacts. It did
not rebuild packages, install dependencies, run whole-web tests, invoke coverage,
typecheck or lint, or launch a browser. Actual full/lean reload, cross-tab,
provider and complete-suite acceptance remains part of final hosted
qualification. No inherited gate or owner approval changed.

Separately, the reviewer read the updated TM5 matrix and ACTIVE_WORK wording
against `corrected-artifact-results.json`: the 79 regression passes, 56
independent probes, six fresh-artifact stages at exit 0, unknown build metadata
and remaining canonical-build/browser/deployed-policy boundaries are accurately
qualified. No wording blocker was identified.
