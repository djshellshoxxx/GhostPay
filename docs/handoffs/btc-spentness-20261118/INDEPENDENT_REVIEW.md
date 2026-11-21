# Independent review: Bitcoin spent-output detection and scan privacy

## Latest test-only follow-up: da351eb8

The independent reviewer inspected and executed the final test-only correction at
local `da351eb840bc758d5bd43f91d8da202fc151b041`, tree
`a512665c8233592680c7d6179a382d538a1103ac`. The corresponding publication object is
`970732daf9d2330ef9fe1c56425021f4502b9291`; the coordinator fetched it and verified
its entire tree and sole parent `70ded5c6d117848178bf59aec2f37197e08749a5`.
The local parent is `4476402cc68700d8881b644a088a64e10b4147e2`.

This correction follows a concrete diagnostic in superseded
[hosted lint job 135412579088](https://github.com/djshellshoxxx/GhostPay/actions/runs/44475622817/job/135412579088):
`@typescript-eslint/require-await` at
`scan.spentness-completion.test.ts:131:116`, then npm exit 1 before cancellation.
The earlier report missed that late diagnostic. It must be recorded as an observed
lint failure even though the job's final workflow conclusion was cancelled.

Only the injected test mock changed: it now aborts synchronously and returns
`Promise.resolve(true)` without an unnecessary async declaration. Independent
semantic review confirmed the same synchronous abort and fulfilled
`Promise<boolean>` behavior. The `ABORTED` expectation and one-call assertion,
product code, test timeouts, thresholds, dependencies and workflow gates remain
unchanged. This is a test hygiene correction, not a twelfth product/security finding.

Fresh independent execution passed **45/45 library tests and 144/144 selected
Bitcoin web tests, with zero failed or skipped tests**. The library ran as one
two-file invocation; the web result consists of **eight separate sequential
invocations**. The corrected nine-test file is part of the 144, not an additional
count. All test commands exited 0. Node was **22.23.4**, Vitest **5.0.5**; commands
used `--max-old-space-size=512 --max-semi-space-size=8`, one worker and no file
parallelism. The library took **9.43 s** of reported Vitest time; web durations sum
to **103.78 s**, which is not a single-run elapsed time.

The one targeted ESLint **10.15.0** attempt ended after **14.617 s** with subprocess
status **-6 / SIGABRT**, shell exit **134**, and an explicit V8 heap-limit failure.
It did not produce a completed lint result, and was not retried. Hosted lint and
full coverage/browser gates remain required; their latest source-pinned outcomes
belong in the PR description.

Source/tree/worktree and fingerprints were unchanged at every command boundary,
and the final worktree was clean. Relative to the earlier review, the only changed
reviewed fingerprint is the corrected test:
`661ffc0b3e6787b0b9c164bb9f44cfcc7ad2cfdcc6ddcc692c837ce8ff38467c`.
The other 21 fingerprints and six complete source/dist inventories match prior
evidence. Before/after inventory snapshots are byte-identical with SHA-256
`4a93e0a010598b74a1d576cf3ac3d5d9f3093765e28a1afd3785eec87819dfb0`.

The [fresh execution JSON](evidence/test-lint-followup/qualification.json)
(25,612 bytes; SHA-256 `2867c75871d92db3cc6a08caa1385a4ec8b386fd46a891f30af49ec41fa0c0c2`)
records exact commands, versions, statuses, per-file counts/times, all reviewed
fingerprints and references to the unchanged committed full manifests.
The [complete transcript](evidence/test-lint-followup/qualification-transcript.txt)
(13,715 bytes; SHA-256 `099b5e77679324267edb55f7fc222d891b330ac07de2f8600bafa0cf9d063833`)
retains all ten invocations, including the failed lint attempt.
The reviewer made no repository edits or remote changes and left no process running.

The `f567d760` and `d646e6db` records below remain historical, with their original
source attribution and original evidence bytes. They do not substitute for these
fresh executions. References to the combined runtime in the retained sections
describe the earlier `f567d760` checkpoint.

## Previous disposition and reviewed source: f567d760

The Bitcoin implementation has no unresolved feature-specific **source** blocker
after the eleven corrections recorded below. The earlier independent execution on
`d646e6db` passed **45 library tests and 144 Bitcoin web tests**; those results are
historical evidence for that runtime, not a pass for the subsequently combined
current-main runtime.

On the current combined runtime, the fresh independent library selection passed
**45 tests in 2 files**, with no failures or skips. The single-process eight-file
web attempt ended with **SIGKILL (process status -9; wrapper exit 137)** after
**442.384 s**, without an assertion diagnostic or result summary. It is not a
144-test pass, and the available evidence does not establish why the process was
killed. The reviewer then ran the same eight web files as separate sequential
processes with unchanged tests and timeouts: all eight invocations completed,
with **144 passed, 0 failed, and 0 skipped** in aggregate, and exit 0 for each.
This aggregate is eight successful invocations, not a successful rerun of the
single-process combined command.

The `ui_consent` lane's read-only AppShell/BTC interaction review found no concrete
integration blocker. The `state_engine` lane separately confirmed source-byte and
Git-mode preservation as described below. Neither source inspection is a test or
browser pass. This review does not establish overall GhostPay release readiness,
an external professional audit, or completion of full browser/build/coverage gates.

| Identity | Revision |
| --- | --- |
| Task branch | `chatgpt/btc-spentness-private-scan-20261118` |
| Main plus PR #219 review baseline | `7873171faab06a43b40697b18973b23909fb5008` |
| Preserved PR #219 | `9617e8572f9bc414410bd937b0e7718d0c5bd55c` |
| Earlier integrated main | `58d89b39b27a66454ebf392bcd35d5c68b57b2f8` |
| Historical locally tested Bitcoin runtime | `d646e6db035f008b643d5a5278bbbae8b838f488` |
| Historical corresponding publication runtime | `4281fce1ecc862b2805fce0106efa395ed4b2f4a` |
| Identical full Git tree of that historical runtime pair | `64fa82876d9ed0667f74cb66acafa4be3021478d` |
| Newly integrated main, including independently owned #242 runtime and #214 documentation | `ffd982a7aea2856c186b40ef236a39720a1b81f5` |
| Current combined local runtime | `f567d7602c2aa2999a6b5b346389af7c409fdf6d` |
| Current combined publication runtime | `11667060182bf4d59a559530b2c89e258b231c08` |
| Identical full Git tree of the current combined runtime pair | `af0d3d83344c80c44cdf977a3d1c0a2e05992861` |
| Later main advance, changing only a historical handoff document; included with retained evidence | `a36f48da526b818a5940a7a0ed2ae7303ef17056` |

The original reviewer independently checked the historical runtime pair's tree IDs
using local Git objects, and checked that PR #219 and the earlier listed main are
ancestors of `d646e6db`. The current combined identities are recorded by the
coordinator; the fresh command wrappers independently captured a clean `f567d760` /
`af0d3d83` at command start and exit. The coordinator's
[publication mapping](evidence/publication-map.json) records commit transport.
Later documentation/evidence commits may change the complete Git tree while
preserving the reviewed product and tests. A changed runtime requires new
qualification; the documentation-only `a36f48da` advance does not supply another
runtime execution result.

## Independence and method

The separate `spentness_review` assistant lane inspected product code read-only,
proposed concrete failure mechanisms and regressions to the implementation lanes,
reviewed their fixes, and independently executed the tests attributed to it below.
The coordinator retains this report and later review records and execution
evidence. The `ui_consent` lane prepared this current-main update outside the
repository and supplied the separately attributed lock-interaction source review;
`state_engine` supplied the byte/mode preservation check. These later records do
not extend the original reviewer's authorship or turn another lane's inspection
into independent execution. No remote branch, PR, deployment, or release was
changed by the reviewer.

The review followed the repository's `AGENTS.md`, `docs/ai/WORKFLOW.md`, ownership
claim, and the investigate-first workflow. It covered the library state/scanner,
Esplora input extraction, header/source wrappers, web scan aggregation, encrypted
checkpoint integration, worker request/result boundaries, Bitcoin UI lifecycle,
disclosures, and deterministic browser acceptance source. The current-main
follow-up adds a narrow AppShell/BTC lock-interaction review. It does not audit
inherited Solana/TRON/network changes, EVM protocols, Spec 18, general seller
checkpoints or invoice-signing behavior, contracts/Mythril, or unrelated
consolidation.

The implementation lanes recorded failing regressions before their repairs. The
reviewer distinguishes those reported RED runs from its own GREEN executions.
The late replay/resource/proof-route questions were raised during the coordinator's
read-only comparison with concurrent PR #244, then independently checked against
this branch. No alternative scanning engine or coverage schema was imported.

## Findings and disposition

Coordinates below refer to the unchanged Bitcoin runtime source. Prefixes are exact:

| Prefix | Repository directory |
| --- | --- |
| `lib/` | `packages/btc-silent-payments/src/scan/` |
| `web/` | `apps/web/src/features/btc/` |

| Finding and concrete failure mechanism | Resolution reviewed | Source and regression evidence |
| --- | --- | --- |
| **R1 — Provider coinbase metadata could hide a real spend.** An uncommitted `vin[].is_coinbase=true` flag could omit a noncoinbase transaction's consumed inputs without changing its txid or Merkle commitment. | Derive coinbase identity from serialized inputs, reject contradictory supplied flags, and extract spends from the committed raw inputs. | `web/esplora.ts:176–184,562–595`; `web/esplora.test.ts`. |
| **R2 — Incomplete or legacy scans could be labeled locally unspent.** Rereading an old discovery block did not inspect the interval between discovery and the saved cursor. Merely having `getSpends` also did not prove a range reached the known chain tip. | Optional version-1 per-match `spentCheckedThrough` advances only across consecutive completed input-checked blocks. Legacy state and source-mode gaps remain unknown. The web result compares completion with both the provider tip and the checked-header tip. | `lib/state.ts:77–127,349–390`; `web/scan.ts:109–146,244–257`; `lib/state.test.ts`; `web/scan.spentness-completion.test.ts`. |
| **R3 — Corrupt or duplicate saved evidence could survive restoration.** Duplicate identities could be overwritten in a map; impossible pending/spent records and hashes contradicting remembered blocks were insufficiently constrained. Old evidence was not checked when the remembered tip still matched. | Reject duplicate/impossible records and known hash contradictions. Reconcile discovery, spend, and coverage hashes with cached local-header lookups, including evidence outside the recent window. Clear inconsistent evidence conservatively. Pending discoveries are not watched or marked spent until canonical rediscovery. | `lib/state.ts:145–200,228–326,349–390`; `lib/state.test.ts`, including the follow-up pending-row/same-block rediscovery regression. |
| **R4 — Reorgs or a later tip could preserve unsupported status.** A result could retain a spent count from an orphaned spend; restored outputs or an all-spent empty result could omit their later supporting anchor. A same-prefix tip advance could leave an older local snapshot usable. | Keep discovery and coverage/state-tip anchors, including empty resumed results. Orphaned evidence clears unsupported counts/status; a newer tip makes prior local negative-spend evidence unknown while retaining canonical discoveries for refresh. | `web/scan.ts:236–261`; `web/headers.ts:463–502`; `web/headers.test.ts`; `web/scan.spentness-completion.test.ts`; `web/BtcView.spentness.test.tsx`. |
| **R5 — The main-thread bridge could dispatch optional outspend requests without consent.** A worker source message bypassed the UI setting because the bridge did not retain that setting. | Snapshot the exact boolean for each worker session and enforce it before dispatch. The client, protocol, and scan entry point independently reject light mode without its required authorization. Revocation terminates the worker/bridge and rejects late results. | `web/scanWorkerSource.ts:10–25`; `web/scanWorkerClient.ts:41–108`; `web/scanWorkerProtocol.ts:81–116`; worker/source/oracle suites. |
| **R6 — Transaction proof routes and result labels were not bound to the selected mode.** A full scan could request `/tx/<id>/hex` or `/merkle-proof`, revealing a matched txid despite local-mode consent. A light worker could relabel provider evidence as `local`. | Grant proof requests only to a normalized light-mode session, independently in the bridge and protocol. Optional outspend authorization does not grant proof-route access. Require `provider` result status exactly when the session enabled the provider check; reject and wipe inconsistent results. | `web/scanWorkerSource.ts:12–22`; `web/scanWorkerClient.ts:28–37,48–65`; `web/scanWorkerProtocol.ts:81–116`; 14 additional bridge/client/protocol/result regressions plus existing real-light positive tests. |
| **R7 — UI mode and consent state could misrepresent disclosure or unknown outputs.** A retained light preference remained effective after selecting no oracle; optional consent could not be revoked during work; unknown candidates used an unspent summary and could be selected. | Effective light mode requires an active oracle. Full-mode optional consent remains editable and invalidates the old operation. Unknown results use distinct copy, disable sweep selection, and explain fresh-local/provider refresh paths. | `web/BtcView.tsx:123,227–228,454,734–739,798–806`; `web/BtcView.spentness.test.tsx`; existing UI/oracle tests. |
| **R8 — Old header work could change a newer session.** A delayed header load or sync could write `chainRef`, scan results, or checked-tip state after the operation was obsolete. | Check operation liveness after load and sync; require current liveness and generation before persistence; source/network changes invalidate the operation. Late worker completion is rejected and its tweaks wiped. | `web/BtcView.tsx:287–355,465–475`; `web/scanWorkerClient.ts:67–104`; deferred-header and stale-worker regressions. |
| **R9 — Same-session authority edits and retained callbacks could restore stale spending authority.** Editing a fee during an advanced-header save canceled reconciliation and released the busy state while old local results remained. Retained Sign/Broadcast callbacks used an earlier render's scan. | Authority edits preserve an already-active scan/header reconciliation. Action checks read `scanRef.current`, require the current status, compare local coverage with the live tip, and validate each input against current discoveries and live hashes. Existing signing algorithms and attempted-broadcast references remain unchanged. | `web/BtcView.tsx:232–249,490–500`; three delayed-save/retained-handler regressions in `web/BtcView.spentness.test.tsx`. |
| **R10 — Later duplicate/replayed evidence could replace a canonical spend.** A second consumer in a later block replaced the first spend, so orphaning only the later block could clear a still-valid spend. Replaying an already-confirmed full outpoint could replace its discovery and evidence. | Preserve the first canonical spend; reject later-block rediscovery of an already-confirmed full outpoint; allow pending rediscovery. Suppress repeated per-call spend callbacks only after validating every later block's complete spend list. | `lib/state.ts:101–116`; `lib/scanner.ts:165,233–253`; four added state/scanner regressions, including invalid later entries and conflicting same-block consumers. |
| **R11 — A shared tweak buffer bypassed the output-count bound.** Many distinct outpoints can share one tweak buffer, so a tweak-buffer limit alone did not bound accumulated candidate identities or provider request volume. | Bound unique candidates independently across historical recovery and forward scanning; reject oversized restored metadata before source requests. The failing candidate remains covered by tweak cleanup. | `web/scan.ts:116,166–181`; 10,000/10,001 shared-buffer cases in `web/scan-secrets.hardening.test.ts`; oversized-restoration case in `web/scan.spentness-completion.test.ts`. |

The later-spend, same-block discovery/spend, confirmed-output identity, and malformed
input tests remain in place. The fixes use the existing scan engine and state
version, rather than creating a parallel implementation.

## Independent execution ledger

### Previous combined runtime: f567d760 / af0d3d83

The `spentness_review` lane rebuilt the changed `invoice-schema` and `ux-core`
packages successfully before checking the combined runtime. Fresh commands use
Node **22.23.4**, Vitest **5.0.5**, a **512 MiB** old-space limit, an **8 MiB**
semi-space limit, one worker, and no file parallelism. The Node executable remains
`/home/agent/.npm/_npx/361c55be1121897e/node_modules/node/bin/node`, with its directory
prepended to `PATH`. Assertions, tests, timeouts, coverage thresholds, and release
gates were not changed.

| Independent command selection | Actual result | Retained evidence |
| --- | --- | --- |
| Library state/scanner, 2 files | **45 passed**, 0 failed, 0 skipped; process exit 0; **28.63 s** Vitest duration, **33.068 s** wrapper elapsed | `evidence/btc-current-main-library.txt`; command/status in `evidence/btc-current-main-execution.json` |
| Bitcoin web selection, all 8 files in one invocation | **Interrupted by SIGKILL**, process status **-9**, wrapper exit **137**, **442.384 s** wrapper elapsed; no test-count or assertion summary | `evidence/btc-current-main-web-interrupted.txt`; command/status in `evidence/btc-current-main-execution.json` |
| Same 8 web files in separate sequential invocations | **144 passed across 8 separate sequential invocations**, 0 failed, 0 skipped; every invocation exit 0 | `evidence/btc-current-main-web.txt` (eight invocations); per-invocation commands/statuses in `evidence/btc-current-main-execution.json` |

The library wrapper captured start `2026-11-19T07:58:01.930799+00:00` and finish
`2026-11-19T07:58:35.412035+00:00`. The interrupted web wrapper captured start
`2026-11-19T07:59:18.710558+00:00` and finish
`2026-11-19T08:06:41.639741+00:00`. Both recorded the same clean local commit and tree
at start and exit. The raw interrupted web log is **940 bytes**, containing startup
and proxy warnings only, with SHA-256
`981f0446a1aaf0b600eb54a3c4bc7ee6e096dabf49b5fb2c100051b26ae1c847`.
It supplies neither an assertion failure nor a successful test result. No
out-of-memory cause is asserted from the signal alone.

The current library command and interrupted web command are exactly the two
command selections printed in the historical subsection below, at their stated
working directories, with the current source/dependency pins above. Each isolated
web invocation keeps the same executable, options, and selected test file; only
the grouping changes from eight files in one process to one file per process.
The coordinator retains the actual eight commands and process statuses in
`btc-current-main-execution.json` alongside the following observed per-file results.

| Selected web file, relative to `apps/web` | Observed isolated result |
| --- | --- |
| `src/features/btc/scan.spentness-completion.test.ts` | **9 passed / 9**, exit 0; **9.47 s** |
| `src/features/btc/scan-secrets.hardening.test.ts` | **6 passed / 6**, exit 0; **6.34 s** |
| `src/features/btc/esplora.test.ts` | **36 passed / 36**, exit 0; **14.33 s** |
| `src/features/btc/headers.test.ts` | **31 passed / 31**, exit 0; **25.76 s** |
| `src/features/btc/scanWorker.test.ts` | **27 passed / 27**, exit 0; **9.96 s** |
| `src/features/btc/scanWorkerSource.test.ts` | **14 passed / 14**, exit 0; **1.21 s** |
| `src/features/btc/oracleWorker.test.ts` | **12 passed / 12**, exit 0; **9.02 s** |
| `src/features/btc/BtcView.spentness.test.tsx` | **9 passed / 9**, exit 0; **24.87 s** |

The four current-main evidence files are retained with this report. Text
transcripts contain labeled, byte-preserved raw-output payloads, with their
original byte counts and SHA-256 digests. The complete execution JSON is
209,446 bytes, SHA-256 `c3d1c93237bc68adbfa3c87924f5afd2114a31b4829caf701364b4881b8e9717`.
All eight isolated invocations completed with no failures or skips; their
durations are not represented as the duration of one combined run. Source
identity and inventories remained unchanged. This targeted selection does
not establish a whole-web pass, coverage percentages, or browser execution.

### Historical runtime source: d646e6db (before the current-main merge)

The following completed historical commands ran against local commit
`d646e6db035f008b643d5a5278bbbae8b838f488`, after the coordinator rebuilt the Bitcoin
library from that source. Product and test paths were clean before execution.
Those commands used Node **22.23.4**, Vitest **5.0.5**, a 512 MiB old-space limit,
8 MiB semi-space limit, one worker, and no file parallelism. These resource settings
do not alter test assertions, timeouts, coverage thresholds, or release gates.

| Independent command selection | Actual result | Raw local log |
| --- | --- | --- |
| Library state/scanner, 2 files | **45 passed**, 0 failed, 0 skipped; exit 0; **29.67 s** | `btc-independent-final-library.log` |
| Bitcoin web selection, 8 files | **144 passed**, 0 failed, 0 skipped; exit 0; **267.54 s** | `btc-independent-final-web.log` |

Library command, from `packages/btc-silent-payments`:

```sh
NODE_OPTIONS='--max-old-space-size=512 --max-semi-space-size=8' \
  ../../node_modules/.bin/vitest run \
  src/scan/state.test.ts src/scan/scanner.test.ts \
  --maxWorkers=1 --no-file-parallelism
```

Web command, from `apps/web`:

```sh
NODE_OPTIONS='--max-old-space-size=512 --max-semi-space-size=8' \
  ../../node_modules/.bin/vitest run \
  src/features/btc/scan.spentness-completion.test.ts \
  src/features/btc/scan-secrets.hardening.test.ts \
  src/features/btc/esplora.test.ts \
  src/features/btc/headers.test.ts \
  src/features/btc/scanWorker.test.ts \
  src/features/btc/scanWorkerSource.test.ts \
  src/features/btc/oracleWorker.test.ts \
  src/features/btc/BtcView.spentness.test.tsx \
  --maxWorkers=1 --no-file-parallelism
```

The cached Node executable was
`/home/agent/.npm/_npx/361c55be1121897e/node_modules/node/bin/node`; its directory
was prepended to `PATH`. No dependency, timeout, test, or gate was changed to obtain
these historical results. They do not qualify the later shared-runtime merge and
do not establish a coverage percentage or a whole-web pass.

### Earlier independent runs, retained with their actual attribution

| Source at execution | Result | Qualification limit |
| --- | --- | --- |
| Initial library working implementation after the pending-row fix, before `019de9cb` | 2 files / 41 passed; 21.07 s; Node 24.22.3 / Vitest 5.0.5 | Earlier component evidence; no before-run source hash was captured. Superseded for historical d646e6db library attribution by its run above. |
| `019de9cb9c9b65b6ceddec1225274504c98bcf2b` web implementation | 7 files / 120 passed; 295.17 s; Node 24.22.3, 384 MiB, one worker | Does not qualify later UI, worker, replay, cap, or current-main deltas. Log: `btc-independent-web.log`. |
| `72194c4f` plus the uncommitted final UI authority delta | 1 file / 9 passed; 59.45 s; Node 22.23.4, 512/8 MiB, one worker | UI source and test hashes matched before/after; the library replay rebuild was not yet included. Log: `btc-independent-ui-final.log`. |

These earlier selections overlap later runs and are not summed into an inflated
test total. Coordinator/implementation-lane runs, full-suite attempts,
typecheck, lint, build, and benchmark results are separately recorded in
[QUALIFICATION.md](QUALIFICATION.md).

## Resource, privacy, and compatibility review

The web operation retains bounded pages of at most 500 new blocks and 500 historical
payment blocks. Candidate identities and retained tweak buffers have independent
10,000 limits. Checkpoints remain bounded by 512 KiB of serialized plaintext; that
byte limit can be reached before 10,000 records. Worker source traffic retains four
pending requests, a 16 MiB body cap, a fixed timeout, selected-origin GET paths, and
the existing cancellation/termination behavior. These limits are visible in
`web/scan.ts`, `web/scanWorkerMessages.ts`, and `web/scanWorkerSource.ts`.

Consumed outpoints are indexed and matched locally. Full-block spent detection
does not add per-outpoint fetches. If a provider check is authorized, only candidates
not already known locally to be spent are queried, and the aggregate candidate cap
bounds that loop. Reconciliation caches each distinct historical header height;
the web caller supplies local checked-header lookups. Result anchors are deduplicated
with a set. No new dependency, provider endpoint, backend, telemetry, transaction
construction algorithm, or signing algorithm was introduced by these fixes.

The reviewer inspected the retained deterministic benchmark design and the limits
it measures; the coordinator owns the measurements and source/dist pins in the
evidence directory. Those measurements are not browser performance claims and were
not rerun by this reviewer.

### Current-main AppShell/BTC interaction review — source inspection only

The `ui_consent` lane reviewed the `AppShell.tsx` / `AppShell.idleClock.test.tsx`
merge delta on `f567d760` against `apps/web/src/lib/appLock.ts` and the Bitcoin
lifecycle in `apps/web/src/features/btc/BtcView.tsx`, `scanWorkerClient.ts`,
`scanWorkerSource.ts`, and `scanStore.ts`. It also inspected existing
`BtcView.secrets.test.tsx`, `BtcView.persistence.test.tsx`, and `scanWorker.test.ts`.
This lane ran no tests and made no source edits for that review.

No concrete integration blocker was found. The new wall/monotonic-clock expiry,
rollback, and nonfinite-value checks call the unchanged synchronous app-lock path.
`notifyAppLock('idle')` runs before the asynchronous seller-key recoverability
check and also runs when there is no seller session. The BTC subscriber always
calls `lock → invalidate`, increments the operation generation, aborts the active
controller, clears current scan/sweep authority, and wipes wallet keys, seed, and
received tweaks. It does not use the `clearSigning` exception that preserves
active header reconciliation during ordinary authority edits.

The worker's abort handler closes the source/oracle bridges, aborts pending
fetches, detaches handlers, and terminates the worker. Late results are rejected
and their tweaks wiped. Header completion and persistence callbacks retain their
operation, abort, and wallet-identity guards. Re-arming the idle timer does not
restore BTC keys or operation generations; retained Sign/Broadcast callbacks read
the cleared current scan reference. Existing tests describe those lock and
cancellation mechanisms, but inspecting them is not a new execution pass.

Separately, the `state_engine` lane confirmed that **13 independently owned main
runtime paths** retain their source bytes and Git modes from the integrated main,
and the Bitcoin feature's **51-path diff** is unchanged. This is preservation
evidence, not a new semantic audit of seller checkpoints or invoice signing.

### Current dependency and fingerprint preservation

After the interrupted web attempt and the eight successful isolated invocations,
all **22 BTC source/test/dist fingerprints** and all **six source/dist inventories**
remained identical to their captured values; `f567d760` / `af0d3d83` was still clean. The BTC dist inventory contains
**102 files**. The changed invoice-schema and ux-core packages rebuilt successfully;
their runtime inventory manifests are:

| Rebuilt runtime | Files | Manifest SHA-256 |
| --- | ---: | --- |
| `packages/invoice-schema/dist` | 33 | `fcb8a56772b794021d83450166cd31cf2dabe1ea91d9fcabd0335706888870ff` |
| `packages/ux-core/dist` | 18 | `05d439c6e47f60440c8a9477bb588d5511798792e358fecf72e942c34b4e2152` |

The complete command/status and source/dist inventory records are retained in
`evidence/btc-current-main-execution.json`. Unchanged artifacts establish the
executed inputs; they do not turn a killed process into a successful test run.

The Bitcoin browser acceptance diff includes real-worker cancellation, encrypted
reload and a later confirmed spend, optional-query revocation, a 500/501-block
incomplete-history boundary, and lean-profile exclusion. These are source-reviewed
acceptance cases. **No browser execution was performed or claimed by this reviewer.**
The coordinator records Chromium failing before page creation with `socket()`
`EPERM`; no sandbox bypass was attempted. jsdom/structured-clone worker tests do not
replace full and lean Chromium runs. The earlier a5673653 PR-merge checkout
belongs to the preceding tree; any browser result from it is historical and does
not qualify the combined af0d3d83 runtime. Final dedicated full/lean Chromium
evidence must identify the subsequently published combined checkout and tree.

The English disclosures and established fallback policy were reviewed alongside
the source. `unknown` describes incomplete evidence and disables sweeping; `local`
describes checked confirmed-block coverage at a stated height; `provider` describes
a scan-time provider observation. The documentation no longer claims an automatic
outspend recheck before broadcast. The user guide also discloses that historical
recovery block requests can narrow wallet activity even without exact outpoint
queries. See [the user guide](../../user/bitcoin-spent-status.md),
[Spec 12](../../specs/12-bip352-light-client-scanning.md), and
[`apps/web/DEVIATIONS.md`](../../../apps/web/DEVIATIONS.md).

## Remaining limits and integration dependencies

- Local confirmed-block evidence does not cover mempool spends, later blocks, a
  hidden heavier chain, or all Bitcoin consensus rules. Provider reports can be
  false or incomplete; inclusion proofs do not prove oracle completeness.
- Persisted metadata is restored through the existing authenticated Bitcoin vault.
  Discoveries are freshly re-derived before spending. Legacy gaps require a fresh
  scan from the original birth height or explicit provider authorization; switching
  modes alone cannot repair a missing interval.
- Full/lean browser execution, whole-web coverage/typecheck/lint/build, live-node
  interoperability, physical-device acceptance, native-language security review,
  and overall release gates remain separately qualified. This review does not
  convert resource-limited or unexecuted gates into passes.
- PR #219 is preserved through ancestry. Concurrent feature PR **#244** and
  overlapping consolidation PR **#238** are explicit conflicting integration
  dependencies identified by the coordinator. Neither should be silently
  overwritten or treated as already reconciled; any combined tree needs its own
  final qualification.
- General seller checkpoint semantics, invoice-signer validation, and Spec 18
  remain outside this Bitcoin feature. Independently owned #242 shared-runtime
  changes are preserved; the narrow AppShell/BTC source review above is not a new
  qualification of those other features. Inherited transport/Solana/TRON changes
  likewise remain owned and qualified by their merged workstreams.

**Merge disposition:** the reviewed source can proceed through the repository's
normal PR review and required CI, with the integration conflicts explicitly
resolved. This report alone is not merge or deployment authorization. The final
publication head and complete gate status belong in the coordinator's qualification
record and PR description.

## Source and runtime-artifact fingerprints

The following SHA-256 fingerprints were originally captured immediately before
and after the historical d646e6db independent commands. All **22 hashes matched**.
They were rechecked on the current combined runtime, including after the
interrupted web attempt and the completed eight isolated invocations, and all 22
remained identical. The six source/dist inventories also remained unchanged.
The fresh execution results are recorded separately above; unchanged fingerprints
alone are not an execution result. The historical
post-run scoped Git diff showed no product/test changes from `d646e6db`. The dist entries identify the
rebuilt Bitcoin runtime consumed by web tests; generated dist files are not proposed
repository changes.

### Production source

```text
fb10101b6329390a935109d7fdbb57573eb05599f0580b1b86777ec5f9beac49  packages/btc-silent-payments/src/scan/state.ts
3754d05c8d27ef00f284fec67e3e4b8bd671dd0ffb9556f87ce6710475b3884e  packages/btc-silent-payments/src/scan/scanner.ts
47a04e5191ee0f31c12b47cfecc7f729160ec7853e7fb5d8a0358b3ec2b7cc3d  apps/web/src/features/btc/scan.ts
a9020c2d81366ac59bdb69382798816ea9332f66a61595def88bc782d383b263  apps/web/src/features/btc/esplora.ts
b53bf48fd1e5f6e06a4de535d96e854dddd9aea816a026cdb236b67ca72cd04a  apps/web/src/features/btc/headers.ts
8409fde2a8298a4282e3e57152008ec5f4771e89c3925f1ffafff64aa68213ad  apps/web/src/features/btc/BtcView.tsx
1727b7c8478b10734841a53f64fb383d7585085fb3c878e1dbe06c38ac0e2a4a  apps/web/src/features/btc/scanWorkerSource.ts
82ef7b0ba3e228deafbc9fbada0dea5817de4f7d4d87d78af72de8fd919a92bf  apps/web/src/features/btc/scanWorkerClient.ts
82595229a20f065d3bd0f9afad5001e9a6d9ad12ec61444729ae1eeb64392d6f  apps/web/src/features/btc/scanWorkerProtocol.ts
4c9291f6ab5bc3017e3662b7efb33427d1b7c2b43c3e2c24790ca77d826ade52  apps/web/src/features/btc/scanWorkerMessages.ts
```

### Executed test files

```text
5cc16dbc708d48b9b3a296d27806e4e553fadd350fddc3da44323bafa16e2266  packages/btc-silent-payments/src/scan/state.test.ts
7a6a1250507925696cbff6512e469b453dda2d81988746598e51ef485e000b34  packages/btc-silent-payments/src/scan/scanner.test.ts
e4027b8ba8b8eb31e53af270f3c2935d32e0ae60f821c668eae7a9c9610d3d34  apps/web/src/features/btc/scan.spentness-completion.test.ts
fdba17faaceb002dc9683845d4c527a2a28fcca62886f3360f6e52dfbab061a5  apps/web/src/features/btc/scan-secrets.hardening.test.ts
0a82fa3e0f2d70cda63ac0b0f99c8ed620fb0587a567cb1955dd3a5b576caa51  apps/web/src/features/btc/esplora.test.ts
526e4d31d1dc7a926ab1ec3ad911027e272ba8b0b66068b5030b4861dc73c770  apps/web/src/features/btc/headers.test.ts
9b48843aeb2364bcb02c80a528601be40ab58c409a7f9540e1a51117fabda7ff  apps/web/src/features/btc/BtcView.spentness.test.tsx
5c9991b5c15f6b0993c21617a07cfe97f30933e1bff27a71984711447c54313a  apps/web/src/features/btc/scanWorker.test.ts
4e8ab3f531f45db35194ddf1bdb758e787d4f35b50c9f38e4fbbd057d4898748  apps/web/src/features/btc/scanWorkerSource.test.ts
2c0038ee977cfd3a02d3aa9bb25030b3f2ea227e720ee07ee4febe623b948488  apps/web/src/features/btc/oracleWorker.test.ts
```

### Rebuilt Bitcoin runtime used by web tests

```text
71519b343b2e83ff859cc31753bc7032655fffb2030164c3e1aa7d6f4bbc49a4  packages/btc-silent-payments/dist/scan/state.js
93645733999992ae83228713f62fe394f0cb7b5bb0718c7c9157b73b4df9c76a  packages/btc-silent-payments/dist/scan/scanner.js
```
