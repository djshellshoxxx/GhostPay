# Bitcoin spent-output detection and private scanning

## Latest test correction and qualification

The final test-only correction is local commit
`da351eb840bc758d5bd43f91d8da202fc151b041`, corresponding to publication commit
`970732daf9d2330ef9fe1c56425021f4502b9291`. Their complete Git trees are identical:
`a512665c8233592680c7d6179a382d538a1103ac`. Their respective parents are local
`4476402cc68700d8881b644a088a64e10b4147e2` and published
`70ded5c6d117848178bf59aec2f37197e08749a5`. The coordinator fetched the publication
object and verified its parent and entire tree before advancing the branch.
The PR description records the eventual evidence descendant and actual hosted
checkout, including the latest workflow outcomes.

### Late lint diagnostic and correction

Inspection of the superseded [hosted lint job 135412579088](https://github.com/djshellshoxxx/GhostPay/actions/runs/44475622817/job/135412579088)
found one concrete `@typescript-eslint/require-await` error at
`apps/web/src/features/btc/scan.spentness-completion.test.ts:131:116`, followed by
npm exit 1 before the workflow cancellation. Earlier reporting missed that late
diagnostic; cancellation does not erase the observed lint failure.

The injected provider mock now uses
`() => { abort.abort(); return Promise.resolve(true); }` in place of an async
callback returning `true`. Independent review confirmed that it still aborts
synchronously and returns a fulfilled `Promise<boolean>`. The `ABORTED`
expectation and one-call assertion remain unchanged. This changes one test line;
product code, assertions, timeouts, coverage thresholds, dependencies and workflow
gates are unchanged. The eleven product/security findings below remain the same.

### Fresh independent execution on da351eb8

The independent reviewer reran the library selection and all eight selected web
files on the clean corrected commit. Node was **22.23.4**, Vitest **5.0.5**, and
ESLint **10.15.0**. Commands used a **512 MiB** old-space limit, **8 MiB** semi-space
limit, one Vitest worker and no file parallelism. Each web row is a separate
sequential invocation, not a single combined-suite run.

| Selection | Passed / collected | Failed | Skipped | Vitest duration |
| --- | ---: | ---: | ---: | ---: |
| Library state/scanner, 2 files | 45 / 45 | 0 | 0 | 9.43 s |
| `scan.spentness-completion.test.ts` | 9 / 9 | 0 | 0 | 8.30 s |
| `scan-secrets.hardening.test.ts` | 6 / 6 | 0 | 0 | 7.00 s |
| `esplora.test.ts` | 36 / 36 | 0 | 0 | 15.46 s |
| `headers.test.ts` | 31 / 31 | 0 | 0 | 23.99 s |
| `scanWorker.test.ts` | 27 / 27 | 0 | 0 | 11.40 s |
| `scanWorkerSource.test.ts` | 14 / 14 | 0 | 0 | 1.08 s |
| `oracleWorker.test.ts` | 12 / 12 | 0 | 0 | 6.67 s |
| `BtcView.spentness.test.tsx` | 9 / 9 | 0 | 0 | 29.88 s |
| **Selected web total, eight invocations** | **144 / 144** | **0** | **0** | **103.78 s summed** |

All test commands exited 0. The affected nine-test file is included in the 144
web tests, not an additional test count. These focused executions do not replace
full-web coverage/nocov, dedicated full/lean Chromium, build, typecheck or lint.

The reviewer attempted targeted ESLint once. It terminated after **14.617 s**
with **SIGABRT**, subprocess status **-6**, shell exit **134**, and the explicit
V8 diagnostic `Reached heap limit Allocation failed - JavaScript heap out of memory`.
No lint pass is claimed and no retry was made. A separate earlier coordinator
attempt before the correction exited 137 with no lint diagnostic; its cause is
undetermined. Hosted lint remains required.

The worktree was clean at command start and final handoff. All 22 reviewed
fingerprints remained unchanged during execution; relative to the earlier
qualification, only the corrected test fingerprint changed, to
`661ffc0b3e6787b0b9c164bb9f44cfcc7ad2cfdcc6ddcc692c837ce8ff38467c`.
The other 21 fingerprints and six complete source/dist inventories match the
earlier evidence. Complete unchanged manifests are referenced from the prior
execution bundle; the new JSON includes all current reviewed fingerprints.

- [Fresh execution bundle](evidence/test-lint-followup/qualification.json):
  25,612 bytes, SHA-256 `2867c75871d92db3cc6a08caa1385a4ec8b386fd46a891f30af49ec41fa0c0c2`.
- [Complete ten-invocation transcript](evidence/test-lint-followup/qualification-transcript.txt):
  13,715 bytes, SHA-256 `099b5e77679324267edb55f7fc222d891b330ac07de2f8600bafa0cf9d063833`.

The `f567d760` and `d646e6db` executions retained below are historical observations
at their named inputs. Filenames containing `btc-current-main` retain their
original meaning and bytes; they are not fresh executions of `da351eb8`.
The PR description retains the latest source-pinned hosted results so status-only
updates do not retrigger workflows.

## Previously qualified combined runtime and scope

Branch: `chatgpt/btc-spentness-private-scan-20261118`.

| Source | Exact revision |
| --- | --- |
| Main inspected before work | `dfc75ef2087fa6463ae59e0818abec01796c578d` |
| Main rechecked before PR integration | `58d89b39b27a66454ebf392bcd35d5c68b57b2f8` (#241 transport isolation and #237 beta logs) |
| PR #219 preserved as an ancestor | `9617e8572f9bc414410bd937b0e7718d0c5bd55c` |
| Main + PR #219 integration and ownership claim | `7873171faab06a43b40697b18973b23909fb5008` |
| Continuous coverage and state reconciliation | `62380400320c0cda7867b42e3cb708b0148af64e` |
| Initial completed runtime/test implementation | `019de9cb9c9b65b6ceddec1225274504c98bcf2b` |
| Earlier current-main integration | `72194c4f57b27f2928bd47d67c8999eb27794fbb` |
| Duplicate/replayed evidence repair | `8998030627f091de4079d91dbaccf0619a7b77c9` |
| Current-authority action guards | `8cbbc1bfedce73e785d9b0f46069f501a67b59e7` |
| Distinct-output resource bounds | `e261a777c44d742f5e19a8975bbdcbab7059c545` |
| Earlier runtime implementation / independent review target | `d646e6db035f008b643d5a5278bbbae8b838f488` |
| Published runtime with byte-identical complete tree | `4281fce1ecc862b2805fce0106efa395ed4b2f4a` |
| Earlier runtime tree, local and published | `64fa82876d9ed0667f74cb66acafa4be3021478d` |
| Earlier published PR head | `8c1d87a2587281c32a5f1326a4f36cfada4384bc` |
| Earlier hosted PR merge checkout | `a5673653b0a856b63a266ee0e2bbb8b44fdf9c02` |
| Earlier hosted checkout tree | `9721a1fe7bfbfcac65dad577c651c9b5284386cb` |
| Current-main runtime baseline imported (#242 and #214) | `ffd982a7aea2856c186b40ef236a39720a1b81f5` |
| Previous combined runtime, local merge | `f567d7602c2aa2999a6b5b346389af7c409fdf6d` |
| Matching published combined runtime | `11667060182bf4d59a559530b2c89e258b231c08` |
| Previous combined runtime tree | `af0d3d83344c80c44cdf977a3d1c0a2e05992861` |
| Documentation-only main advance (#216), included with retained evidence | `a36f48da526b818a5940a7a0ed2ae7303ef17056` |

This work preserves PR #219 and completes its Bitcoin-specific spentness,
resumption, provider-consent, and UI safeguards. The feature diff leaves EVM
protocols, Spec 18 recovery, seller checkpoint architecture, cryptographic signing
and transaction construction, contracts/Mythril, dependencies and release
workflows unchanged. The new combined runtime also inherits the shared AppShell
idle clock, seller checkpoint v4, invoice signer and ux-core changes from current
main exactly; the import is verified below. The full web profile contains Bitcoin;
the lean Pages profile still excludes it.

**Previous combined-source qualification status:** independent focused validation
passed on `f567d760`: **45 library tests across 2 files and 144 web tests across
8 files, with no failures or skips**. The web result comes from eight separate
sequential invocations with unchanged assertions and timeouts; each retained the
same source/tree/fingerprint inventories. It is not a completed single-process
eight-file run or a full-web coverage result. The earlier combined eight-file
attempt ended with SIGKILL before any assertion diagnostic or test summary and
is retained separately.

The earlier `d646e6db` selection passed 45 library and 144 web tests. Hosted results
on `a5673653` are also retained below as historical evidence. Neither result
qualifies the newer combined AppShell/invoice/checkpoint runtime. Hosted
build/typecheck/lint/coverage/full-and-lean browser qualification must be tied to
the new published head and its actual checkout after publication. The PR description records the latest exact-head hosted outcomes. This report
does not claim release readiness, a merge into main, or a deployed artifact.

## Current-main integration and source identity

The local merge `f567d7602c2aa2999a6b5b346389af7c409fdf6d` has ordered parents
`ea196fb3c7c9e8b5182d3e89285ec44a6e7bede9` and
`ffd982a7aea2856c186b40ef236a39720a1b81f5`, with tree
`af0d3d83344c80c44cdf977a3d1c0a2e05992861`. The independently inspected worktree
was clean. The merge imports main into the feature branch.

Main changed 23 paths between `58d89b39` and `ffd982a7`; the merge changes the
same 23 paths with the same status entries relative to `ea196fb3`. All 13 imported
runtime/test paths below are byte-for-byte and mode-identical to `ffd982a7`:

| Directory | Imported source and test files |
| --- | --- |
| `apps/web/src/` | `AppShell.tsx`, `AppShell.idleClock.test.tsx` |
| `apps/web/src/lib/` | `scanCheckpointPrivacy.test.ts`, `scanClient.test.ts`, `scanClient.ts`, `scanCursorSlot.test.ts`, `scanCursorSlot.ts`, `scannerCore.spam.nocov.test.ts` |
| `packages/invoice-schema/src/` | `envelope.ts`, `errors.ts`, `pinnedSigner.test.ts` |
| `packages/ux-core/src/` | `errors.test.ts`, `errors.ts` |

Of the 23 imported paths, 22 match main exactly. `docs/ai/ACTIVE_WORK.md` is the
sole imported-path difference: it preserves the identical pre-existing 24-line
feature overlay with no removals. No file changed relative to `ea196fb3` in
`packages/btc-silent-payments`, `apps/web/src/features/btc`, or either
`apps/web/e2e/btc-worker.spec.ts` or `apps/web/e2e/btc-spentness.spec.ts`.
Of the 51 prior feature paths, only the shared ownership document changed during
the merge. The feature diff versus `ffd982a7` is still **51 paths, 2,634 additions
and 118 deletions**, with exactly the prior per-file numstat. `git diff --check`
passed. These counts describe `f567d760` before the planned evidence/documentation
additions; they are not a prediction of the final documentation-only diff count.

The evidence descendant also integrates main `a36f48da526b818a5940a7a0ed2ae7303ef17056` (#216).
That commit was created at 2026-11-19 08:01:12 UTC. Comparison and fetch confirmed
that its difference from `ffd982a7` is only
`docs/handoffs/CHATGPT_ZERO_CODEX_LATEST.md`. The retained evidence and this
handoff update change no product, test, dependency, or workflow input from the
independently tested `f567d760` runtime. The actual published head and complete
tree are recorded in the PR description.

### AppShell and Bitcoin lock compatibility review

The `ui_consent` lane’s source-only review of `f567d760` found no concrete interaction
blocker. It inspected the AppShell/idle-clock delta, `lib/appLock.ts`, Bitcoin
`BtcView.tsx`, `scanWorkerClient.ts`, `scanWorkerSource.ts`, `scanStore.ts`, and
the existing secrets, persistence and worker tests. The new clock triggers use
the unchanged synchronous `notifyAppLock` path before seller recovery. Bitcoin
lock handling increments its operation generation, aborts the active controller,
clears scan/review/signature authority and wipes keys/tweaks. Worker abort closes
bridges and terminates the worker; delayed header and persistence completions
retain live/abort/wallet checks. Timer rearming does not restore Bitcoin authority.
This is read-only source/test inspection, with no new test or browser execution
claimed by that review.

## Previous combined-source validation: f567d760

The following fresh observations are attributed to local `f567d760` / tree
`af0d3d83`, whose matching published runtime is `11667060`. Later evidence-only
descendants preserve its product and test inputs. Hosted checks are recorded
against their actual checkout in the PR description.

| Check | Actual current combined-source observation |
| --- | --- |
| Shared package rebuilds | `invoice-schema` and `ux-core` builds passed before the independent reruns. |
| Independent library state/scanner selection | **45 passed across 2 files; 0 failed, 0 skipped**, Vitest duration **28.63 seconds**, wrapper wall time **33.068 seconds**, Node **22.23.4**. The worktree remained clean at `f567d760` before and after execution. |
| Combined eight-file Bitcoin web attempt | Terminated by **signal 9 / SIGKILL**, wrapper exit **137**, after **442.384 seconds**. The 940-byte log contains startup/proxy warnings only: no assertion diagnostic, completed test summary or coverage result. No pass is claimed; the termination cause beyond the observed signal is not assigned. |
| Fingerprints around the interrupted web attempt | All **22 Bitcoin fingerprints and six source/dist inventories** were unchanged after termination; HEAD/tree remained clean at `f567d760` / `af0d3d83`. |
| Sequential replacement, complete eight-file result | **144/144 passed across 8 files, 0 failed, 0 skipped**, executed as eight separate sequential invocations with unchanged assertions, timeouts and gates. Every invocation retained the same source/tree/inventories. Per-file results are listed below; this is not full-web coverage. |
| Imported-main/source-scope review | Passed as detailed above; no tests or product edits were performed by the source-review lane. |
| New combined-source hosted CI | Required on the final published head and its actual workflow checkout; the PR description retains current source-pinned outcomes. Earlier runs on `a5673653` do not satisfy this row. |

All paths in this per-file result table are relative to
`apps/web/src/features/btc/`. Each row represents a separate completed invocation:

| Test file | Passed / collected | Failed | Skipped | Reported Vitest duration |
| --- | ---: | ---: | ---: | ---: |
| `scan.spentness-completion.test.ts` | 9 / 9 | 0 | 0 | 9.47 s |
| `scan-secrets.hardening.test.ts` | 6 / 6 | 0 | 0 | 6.34 s |
| `esplora.test.ts` | 36 / 36 | 0 | 0 | 14.33 s |
| `headers.test.ts` | 31 / 31 | 0 | 0 | 25.76 s |
| `scanWorker.test.ts` | 27 / 27 | 0 | 0 | 9.96 s |
| `scanWorkerSource.test.ts` | 14 / 14 | 0 | 0 | 1.21 s |
| `oracleWorker.test.ts` | 12 / 12 | 0 | 0 | 9.02 s |
| `BtcView.spentness.test.tsx` | 9 / 9 | 0 | 0 | 24.87 s |

The sum of these eight reported Vitest durations is **100.96 seconds**.
It is a sum across separate invocations, not the elapsed wall time of one
invocation or a combined-suite benchmark. The interrupted attempt's 442.384-second
wrapper time remains a separate observation.

The four current-main evidence files are retained with this report. The text
transcripts wrap unchanged raw output in labeled blocks and identify each payload
by its original byte count and SHA-256. The execution JSON preserves exact
commands, source identities, statuses, all eight isolated invocations, and all
three complete before/after inventories. Its 209,446 bytes have SHA-256
`c3d1c93237bc68adbfa3c87924f5afd2114a31b4829caf701364b4881b8e9717`.
The interrupted attempt remains separate from the successful focused selection.

## Acceptance matrix

The baseline column records inspection of main plus PR #219 before this lane's
repairs. “Present” means existing behavior was preserved, not reimplemented.

| Acceptance requirement | Baseline | Implemented behavior / evidence |
| --- | --- | --- |
| Derive consumed outpoints without another request | Present | Esplora reuses verified full-block transactions; existing source/wrapper tests retained. |
| Exclude coinbase safely | Partial | Coinbase identity comes from serialized inputs; contradictory uncommitted JSON flags fail. New Esplora regression. |
| Same-range and same-block creation/spending | Present | Existing scanner/web tests retained; local input matching continues after discovery. |
| Spend outputs discovered in an earlier session | Present, incompletely qualified | New encrypted-vault reload → later spend → reload integration; native-worker browser fixture extended. |
| Duplicate inputs/results | Partial | Identical spend events are deduplicated; conflicting consumers and duplicate persisted identities are rejected. |
| Partial range must not imply unspentness | Missing | `unknown` until local coverage reaches both the selected provider's sampled tip and the known checked-header tip. |
| Legacy history without input coverage | Missing | Optional version-1 `spentCheckedThrough` is absent for legacy data; it remains unknown until a fresh rescan or authorized provider result. |
| Mode change must not bridge a historical gap | Missing | Only consecutive complete-input blocks advance coverage; source modes without complete inputs leave a gap. |
| Full-mode provider checks off by default | Present in UI | Defaults preserved and independently enforced by the main-thread request bridge. |
| Explicit provider opt-in | Present | Exact queried outpoints are disclosed; a new bridge snapshots authorization for each scan. |
| Consent revocation during work | Missing | Revocation aborts the worker/requests, wipes results, and prevents subsequent optional dispatch. Already sent requests cannot be undone. |
| Cached clients and invalid worker messages | Partial | No-consent bridges reject outspend requests before fetch; forged provider-status results and malformed start flags are rejected. |
| Light-mode dependency before network activity | Partial | Worker client, protocol and scan engine refuse light mode without explicit provider authorization. |
| Light → local transition | Defective | Effective light mode requires an active oracle; a retained light preference cannot force local disclosure. |
| Interrupted blocks/checkpoints | Present | Existing checkpoint acknowledgment/CAS preserved; new coverage advances only after a complete block. |
| Corrupted persisted spend evidence | Partial | Strict bounds/identity/hash checks; explicit header reconciliation invalidates inconsistent historical evidence outside the recent window. |
| Shallow/deep reorganizations | Partial | Clear orphaned spends, clamp coverage, mark orphaned discoveries pending, preserve canonical discoveries and revalidate them. |
| Reorg of an empty resumed result | Missing | Retain the reconciled state-tip anchor even when every known output was already spent. |
| Reorg of a displayed spent count | Defective | Clear unsupported count and mark status unknown when supporting scanned blocks are orphaned. |
| New checked tip without a fork | Missing | Local negative-spend coverage becomes unknown; canonical discoveries/known positive counts are retained for refresh. |
| Stale wallet/network work | Partial | Old header operations and workers cannot replace a newer session's state or spend authority. |
| Authority edits and retained action callbacks | Missing | Editing a sweep field keeps active header reconciliation busy; Sign/Broadcast validate current scan evidence and the live local tip rather than an earlier render's scan. |
| Unknown UI/sweep behavior | Missing | Candidate count is distinct from “unspent”; selection/review are disabled; fresh-scan/provider refresh instructions are shown. |
| Translation policy | Present | English security disclosures are retained in all four catalogs pending native review and included in security-key classification. |
| Bounded resources / no extra endpoints | Present | Existing block, match, request and state limits preserved; deterministic measurements below. |
| Full/lean browser compatibility | Unverified on new source | Deterministic browser acceptance added; lean test asserts Bitcoin remains excluded. Hosted execution remains required. |

## Confirmed defects and regression-first repairs

1. **Uncommitted coinbase flag:** `is_coinbase=true` on a real transaction could
   hide its consumed inputs despite a valid txid. The parser now checks it against
   raw input identity; spend extraction uses raw inputs committed by the Merkle root.
2. **False local classification:** saved cursors, source-mode gaps and incomplete
   ranges lacked proof of continuous negative-spend coverage. Per-match evidence
   is persisted only for completed contiguous blocks, and the result is conservative.
3. **Unauthorized provider dispatch:** the worker bridge previously allowed any
   allowlisted outspend path without knowing consent. The bridge now refuses before
   fetch, while the client and protocol enforce the same permission.
4. **Consent state leaks:** selecting no oracle did not reset the effective light
   condition; the provider option could remain forced on. Effective mode now governs
   the setting and disclosures. Optional consent remains revocable during scanning.
5. **Stale UI state:** unknown results used an unspent summary and could be selected;
   obsolete header work could overwrite newer state. These paths now fail closed.
6. **Orphaned/late evidence:** reorg filtering retained unsupported counts, and
   recovered outputs/empty results lacked later supporting anchors. Results now retain
   those anchors and require a refresh when they change or a newer local tip is known.
7. **Library integration edge:** independent review found pending discoveries could
   receive spends without canonical rediscovery. A failing regression preceded the
   fix; pending rows are not watched or marked spent until rediscovered.
8. **Stale action authority:** a fee edit during delayed header persistence could
   invalidate the reconciliation operation and restore usability of an old scan;
   retained Sign/Broadcast handlers could also use an old render's scan after the
   checked tip advanced. One delayed-save regression and two retained-handler
   regressions reproduced the defects. Authority edits now preserve active header
   reconciliation, and action checks read the current scan and live chain evidence.
   Existing signing, transaction construction and attempted-broadcast references
   are preserved.
9. **Repeated chain evidence:** a later duplicate spend could replace an earlier
   canonical spend, and replaying a confirmed output at another height could clear
   its spend mark. Four regressions reproduced the issue. Earliest spend evidence
   is preserved, repeated callbacks are suppressed after validating each block's
   list, and conflicting confirmed discoveries fail. Pending rediscovery still works.
10. **Output-count bound:** the previous limit counted distinct tweak buffers;
    10,001 different outputs sharing one buffer escaped it. The unique outpoint
    count is now capped independently across recovery and forward work, with full
    tweak cleanup on rejection. Oversized resumed metadata fails before requests.
11. **Proof-route disclosure and result relabeling:** full-mode worker sessions
    could request matched-transaction hex/proofs even with outspend consent off;
    an authorized light worker could report `local` or `unknown` despite required
    provider checks. Fourteen regression cases reproduced these boundary failures.
    Matched proofs now require an immutable light-mode capability in both request
    layers, and returned spent status must agree with the scan's permission.

Regression RED evidence is distinct from environment setup failures. Missing
workspace `dist` imports were resolved by building libraries and were not counted
as proof of a product defect. Initial RED runs recorded 8 library failures, 7
worker/bridge failures, 5 UI failures, 8 coordinator web failures, and 3 additional
tip/anchor regressions. These selections overlap; the numbers are not summed into
one unique-test count.

## Historical local validation ledger

These rows preserve the earlier checkpoint ledger. Explicit revisions remain
binding; rows without a revision are historical diagnostic observations without
an exact-current-source claim. None of the rows in this section qualifies
`f567d760`. The earlier final independent selections refer to `d646e6db`.

All npm dependencies came from the existing lockfile with `npm ci --ignore-scripts
--offline --no-audit --no-fund`. No dependency upgrade or gate change was made.

| Check | Actual result at this report checkpoint |
| --- | --- |
| Workspace library build, `npm run build:libs` | Passed on the initial integrated baseline. Bitcoin was rebuilt after its repairs; inherited net-transport, solana-stealth and tron-adapter packages rebuilt successfully after current-main integration. |
| Pages tooling `node --test scripts/pages/*.test.mjs` | 72 passed, no failures/skips. This is tooling validation, not a built artifact or browser pass. |
| Independent library state/scanner tests | 41 passed across 2 files, no skips. |
| Repeated-consumer / replay delta | 4 RED failures, then 45 passed across both state/scanner files, no skips; incorporated in `89980306`. |
| Independent combined Bitcoin web selection at `019de9cb` | 120 passed across 7 files, no failures/skips; later authority-edit review findings require separate delta qualification. |
| Coordinator scan/spend/resume/Esplora/header selection | 80 passed across 5 files. |
| Additional full tip/reorg selection | 39 passed across 2 files. |
| Worker/source/oracle selection | 37 passed across 3 files before the final malformed-start additions. |
| Initial UI compatibility selection | 27 passed / 1 failed; the additional tip-advance test captured the old helper before its regression-backed repair. Final independent rerun is required. |
| Current-authority UI delta | Independent 9/9 passed, no skips, with exact source hashes retained. A wider two-file attempt recorded 27 passed of 43 collected, then a SIGKILL in the existing headers suite; that wider suite did not pass. |
| Aggregate scan-bound delta | 2 new RED failures; then 15/15 passed across completion and tweak-cleanup files, including the real 10,000/10,001 copied-key boundary. Incorporated in `e261a777`. |
| Worker proof-route / result-mode delta | 14 RED failures, then 53/53 passed across worker, source bridge and oracle worker files; real light proof paths retained. Incorporated in `d646e6db`. |
| Final Bitcoin library build and typecheck | Both documented scripts passed on `d646e6db`, Node 22.23.4, 512 MiB old space / 8 MiB semi space. |
| Final independent library selection | 45/45 passed across state/scanner files on `d646e6db`, no skips, 29.67 seconds. |
| Final independent Bitcoin web selection | 144/144 passed across 8 files on `d646e6db`, no skips, 267.54 seconds; complete scan/Esplora/header, worker/source/oracle, UI spentness and tweak-cleanup selections. |
| Full Bitcoin library coverage command | 568 passed / 1 failed, 32 files. The unchanged 100,005-header reload test exceeded its unchanged 60-second timeout. No complete coverage percentage was emitted. |
| Same header stress test on CI-compatible Node 22 | Same timeout, 1 failed / 26 deselected. Diagnostic partial coverage is not full-suite coverage. |
| Whole-web typecheck | Node 24/512 MiB exited 137; Node 22/384 and 640 MiB reached V8 heap limits; Node 22/1536 MiB exited 137. The exit-137 cause was not independently diagnosed. No pass claimed. |
| Native Chromium readiness | Failed before page creation: Chromium `socket()` returned `EPERM`. No sandbox bypass or browser pass claimed. |
| Playwright discovery | Full: 82 tests in 21 files; lean: 72 tests in 19 files. Discovery is not execution. |
| i18n validation/extraction | 4 catalogs, 0 errors, 439 warnings; 2,125 used keys, 0 missing English keys, 136 unused. English security fallback warnings are intentional pending native review. |
| Secret scan / action-reference policy | Passed again on final runtime: no committed environment files or key material found; 111 action references satisfy the unchanged policy. |
| Final network-egress inventory | `node --test scripts/tests/network-egress-inventory.test.mjs`: 4 passed, no failures/skips, on committed runtime `d646e6db`. |
| Whole-web ESLint | Local Node 22 attempt exited 137 without a lint diagnostic; no lint pass claimed. |
| Bitcoin library typecheck / lint before replay delta | Typecheck passed on `72194c4f` (same library source as `62380400`); documented lint exited 137 without a source diagnostic. These are not final-delta qualification. |
| Full web unit/coverage, whole-web lint, full/lean builds and Pages artifact verification | Current PR qualification required; final outcomes are recorded in the PR description and follow-up evidence. |


### Later pre-merge local observations

The Bitcoin library ESLint run at
`ea196fb3c7c9e8b5182d3e89285ec44a6e7bede9` passed with **0 errors and 1 unchanged
generated-file warning**. This is earlier-source lint evidence, not a lint pass
for the combined shared runtime. A bounded whole-web lint attempt using a
640 MiB V8 old-space limit ended with a V8 heap exhaustion and exit **134**;
no whole-web lint pass is claimed. The earlier local full-web unit/coverage
attempt lost its execution handle, so no complete terminal result or coverage
report was captured. These observations do not replace the pending current-source
qualification, and the lost-handle attempt is not described as either a pass or
an assertion failure.

Historical local tool versions used: Node 24.22.3 (initial execution and benchmark), cached Node
22.23.4 (CI-compatible diagnostic/runtime), npm 11.9.0, TypeScript 5.9.3, Vitest
5.0.5 with `@vitest/coverage-v8` 5.0.5, Playwright 1.64.1, and installed Chromium
156.0.8078.79. Browser tests in hosted CI use the repository's configured runner.

Resource bounds such as `NODE_OPTIONS` and `VITEST_MAX_WORKERS=1` changed execution
concurrency/heap allocation only. No test timeout, assertion, coverage threshold,
privacy gate or release requirement was relaxed.

## Historical hosted qualification

The results in this section ran on **`a5673653b0a856b63a266ee0e2bbb8b44fdf9c02`**,
the earlier synthetic PR merge of head
`8c1d87a2587281c32a5f1326a4f36cfada4384bc` with base
`58d89b39b27a66454ebf392bcd35d5c68b57b2f8`, tree
`9721a1fe7bfbfcac65dad577c651c9b5284386cb`. Actual checkout identities were
verified in completed logs. They predate the `ffd982a7` shared-runtime import
and do not qualify the new combined source.

| Earlier hosted run | Actual result on `a5673653` |
| --- | --- |
| [Main CI: Bitcoin library](https://github.com/djshellshoxxx/GhostPay/actions/runs/44475622817/job/135412579657) | **573 tests passed across 32 files**; coverage **97.83% statements / 96.02% branches / 98.46% functions / 99.37% lines**. Node **22.23.5**, npm **10.9.9**. This resolves the earlier local header-stress timeout for that earlier source only. |
| [Hosting: full web qualification](https://github.com/djshellshoxxx/GhostPay/actions/runs/44475622820/job/135395328391) | Whole-web `tsc -p tsconfig.json --noEmit` and full-profile Vite build passed; 19-file bundle scan and archive verification passed; **1 Chromium hosting smoke test passed, 0 skipped**. Node **22.23.4**, npm **10.9.9**. |
| [Pages](https://github.com/djshellshoxxx/GhostPay/actions/runs/44475622779) | **72 tooling/verifier tests passed, 0 failed/skipped**; lean site build/verification passed; **16 real-Anvil Pages browser tests passed**. Release-gates, deploy and post-deploy jobs were skipped under the normal PR conditions. |
| [Integration](https://github.com/djshellshoxxx/GhostPay/actions/runs/44475622799) | EVM, Bitcoin and Solana suites passed. Bitcoin regtest: **9 steps**; Solana: **10 steps**; EVM additionally reported **1 Vitest file / 5 tests passed**. |
| [Beta acceptance](https://github.com/djshellshoxxx/GhostPay/actions/runs/44475622838) | Library, CLI and browser stages passed; **124/124 CLI checks**, including 11 recorded fail-closed gap assertions; **3 browser tests passed**. |
| [Hosting kit](https://github.com/djshellshoxxx/GhostPay/actions/runs/44475622820/job/135395328887) | Lint, typecheck and package verification passed; **290 tests passed, 6 skipped, 0 failed**. The skips concern unavailable/disabled environment capabilities; they remain explicit. |
| [CLI operator qualification](https://github.com/djshellshoxxx/GhostPay/actions/runs/44475622855) | Ubuntu/macOS: **570 tests passed across 37 files each**. Windows: **568 passed, 2 skipped across 37 files**. Each platform also passed **1 build-contract test and 21 compiled tests**. Windows skips are the explicit FIFO and POSIX signing-key file-permission cases; they passed on Ubuntu/macOS. |

The Bitcoin regtest scenario verifies payment discovery, header/PoW/Merkle/linkage
checks and a confirmed sweep with the exact destination amount. It does not
assert the new post-sweep spent-state coverage or reorg behavior. Pages and beta
browser journeys are Anvil/EVM scenarios, not Bitcoin-specific browser results.
The hosting smoke is ordinary Chromium validation, not Tor Browser, I2P or
wallet acceptance.

The retained Pages artifact is `pages-site-a5673653b0a856b63a266ee0e2bbb8b44fdf9c02`,
ID `14506918504`, SHA-256
`6f880f60395f9312369e081f5150da155326436e5cc36313c7845ee419fdf4c6`.
It is a verified 16-file DEMO site with payments disabled because no deployment
manifest is present. The browser job built a separate devnet-enabled artifact
from the same source; its bytes are not asserted to equal that retained upload.
Integration retained `integration-logs` (ID `14507968035`); beta retained
`beta-acceptance-log` (ID `14507694298`). Hosting and CLI uploaded no GitHub
artifacts. None of these historical artifacts represents the new combined source.

## Reproduction commands

Run from the repository root after installing its locked dependencies. Listing a
command here is not a claim that it completed on the current combined source;
actual current-run commands/statuses belong in `btc-current-main-execution.json`:

```sh
npm run build:libs
npm test -w @ghostpay/btc-silent-payments -- --maxWorkers=1 --no-file-parallelism
npm exec -w @ghostpay/web -- vitest run src/features/btc --maxWorkers=1 --no-file-parallelism
VITEST_MAX_WORKERS=1 npm test -w @ghostpay/web
npm run typecheck -w @ghostpay/web
npm run lint -w @ghostpay/web
npm run build -w @ghostpay/web
GHOSTPAY_LOCAL_BUILD_PROFILE=full npm run test:e2e -w @ghostpay/web
GHOSTPAY_LOCAL_BUILD_PROFILE=lean npm run test:e2e -w @ghostpay/web
bash scripts/pages/build-pages.sh /absolute/new/pages-output
node scripts/pages/verify-pages-site.mjs /absolute/new/pages-output/site /absolute/new/pages-output/evidence/ghostpay-lean-build.json
bash scripts/scan-secrets.sh
node scripts/i18n/check.mjs
node scripts/i18n/extract.mjs
node --test scripts/tests/network-egress-inventory.test.mjs
```

Pages output must be a new directory and the ordinary clean-tree/commit and
deployment-manifest guards remain enforced. PR workflows validate artifacts only;
publishing requires the existing separate authorized manual deployment path.

## Measured resource behavior

These historical measurements use exact library source at
`d646e6db035f008b643d5a5278bbbae8b838f488`, with source and compiled-module SHA-256
pins inside each JSON file. They are not a new combined-runtime benchmark:

| Fixture | Local scan | Resume/checkpoint |
| --- | ---: | ---: |
| Completed blocks | 500 | 500 |
| Watched outputs | 10,000 | 750 |
| Input entries supplied, including identical duplicates | 1,000,000 | 1,000,000 |
| Spend events / persisted spends | 10,000 | 750 |
| Tweak/output/spend-source calls | 500 each | 500 each |
| Network calls | 0 | 0 |
| Wall time | 7,307.92 ms | 11,172.91 ms |
| Maximum process RSS | 81,096 KiB | 83,512 KiB |
| Largest serialized checkpoint | Not applicable | 469,351 bytes |

The resume fixture serializes 500 checkpoints totaling 209,056,679 bytes. The
largest is below the unchanged 524,288-byte worker limit. Persistent capacity is
byte-based: a 10,000-match scan limit does not imply that 10,000 complete records
fit in a checkpoint. A conflicting-consumer fixture is rejected before any spend
or block-completion callback (30.19 ms in this run). The retained heap delta after
GC in the resume fixture was +97,280 bytes.

These are single-run Node measurements under local executor load, not browser
benchmarks. They exclude receiver cryptography, raw block/header verification,
worker messaging, encryption, storage I/O and network latency. RSS includes runtime
and fixture setup. Run the retained harness with an already built library:

```sh
node --max-old-space-size=128 --max-semi-space-size=8 --expose-gc docs/handoffs/btc-spentness-20261118/evidence/benchmark.mjs scan
node --max-old-space-size=128 --max-semi-space-size=8 --expose-gc docs/handoffs/btc-spentness-20261118/evidence/benchmark.mjs resume
node --max-old-space-size=128 --max-semi-space-size=8 --expose-gc docs/handoffs/btc-spentness-20261118/evidence/benchmark.mjs conflict
```

## Changed-file acceptance mapping

Every feature file relative to the inspected current-main baseline belongs to
the following groups. The 51-path count above is for `f567d760`; four retained
evidence files brought the prior feature diff to 55 paths. The two test-correction
evidence files bring the final feature diff against `a36f48da` to 57 paths.
Paths in the middle column are relative to the stated directory; paired
source/test names are listed explicitly. PR #219's original changes are included
in this mapping. The unrelated main changes inherited through ancestry do not
appear in the feature diff.

| Directory | Files | Assignment acceptance criterion |
| --- | --- | --- |
| `packages/btc-silent-payments/src/scan/` | `state.ts`, `state.test.ts` | Persistence, legacy evidence, corruption, contiguous coverage and reorganization correctness (§§3,5,6,9). |
| Same | `scanner.ts`, `scanner.test.ts` | Local matching, duplicate/conflicting consumers, bounded input processing (§§3,9,11). |
| Same | `headersync.ts`, `headersync.test.ts` | Preserve PR #219's header-bound spend-source forwarding (§§2,3,6,12). |
| `apps/web/src/features/btc/` | `esplora.ts`, `esplora.test.ts` | Committed coinbase/input identity, malformed-provider rejection, local spends (§§3,9,10). |
| Same | `oracleSource.ts`, `oracleSource.test.ts` | Full-block/cross-check interfaces and light-mode limitations (§§3,4,12). |
| Same | `scan.ts`, `scan.spends.test.ts`, `scan.spentness-completion.test.ts`, `scan-secrets.hardening.test.ts` | Local/provider/unknown semantics, encrypted resumption, history refresh, consent abort, cleanup and aggregate limits (§§3–7,9–11). |
| Same | `headers.ts`, `headers.test.ts` | Invalidate orphaned or obsolete negative-spend evidence (§§6,8,9). |
| Same | `BtcView.tsx`, `BtcView.test.tsx`, `BtcView.secrets.test.tsx`, `BtcView.spentness.test.tsx` | Consent, unknown UI, network/session lifecycle, current action authority and cleanup (§§4,5,8–10,12). |
| Same | `scanWorkerClient.ts`, `scanWorkerMessages.ts`, `scanWorkerProtocol.ts`, `scanWorkerSource.ts`, `scanWorker.test.ts`, `scanWorkerSource.test.ts`, `oracleWorker.test.ts` | Immutable permission, light-only proof requests, protocol compatibility and stale/malformed messages (§§4,9,10,12). |
| Same | `fixtures.testutil.ts` | Deterministic blocks, confirmed spends and controlled forks for regression/browser acceptance (§§5,6,9). |
| Same | `verification.ts` | Accurate current spentness disclosure (§§7,8,14). |
| `apps/web/e2e/` | `btc-worker.spec.ts`, `btc-spentness.spec.ts` | Full/lean Chromium acceptance, request counts, revocation, reload and unknown states (§9). |
| `apps/web/locales/`; `apps/web/src/i18n/` | `en.json`, `es.json`, `ja.json`, `ar.json`; `securityKeys.ts` | Reviewed English disclosures and established security-copy fallback (§8). |
| Repository documentation | `apps/web/DEVIATIONS.md`, `packages/btc-silent-payments/README.md`, `docs/specs/12-bip352-light-client-scanning.md`, `docs/audits/08-completion-gates.md`, `docs/user/bitcoin-spent-status.md` | Privacy/technical guarantees, limits and intentionally open overall release gate (§§7,8,14). |
| Coordination | `docs/ai/ACTIVE_WORK.md` | Repository-required disjoint ownership and safe integration (§15). |
| `docs/handoffs/btc-spentness-20261118/` | `QUALIFICATION.md`, `INDEPENDENT_REVIEW.md` | Acceptance, exact-source evidence, independent review and merge limits (§§2,10,13,16). |
| `docs/handoffs/btc-spentness-20261118/evidence/` | `benchmark.mjs`, `performance-scan.json`, `performance-resume.json`, `performance-conflict.json` | Reproducible measured resource behavior with explicit exclusions (§11). |
| Same | `publication-map.json` | Exact local/published commit-tree and ordered-parent provenance (§§13,15,16). |
| Same | `btc-independent-final-library.txt`, `btc-independent-final-web.txt` | Retained earlier independent execution evidence at `d646e6db` (§§10,13,16). |
| Same | `btc-current-main-library.txt` | Retained 45-test, two-file library execution at combined runtime `f567d760`, including the actual command and terminal result (§§10,13,16). |
| Same | `btc-current-main-web.txt` | All eight completed sequential Bitcoin web invocations: 144 passed, 0 failed/skipped, with individual counts, statuses and timings (§§10,13,16). |
| Same | `btc-current-main-web-interrupted.txt` | Preserve the 940-byte interrupted combined attempt and its signal/exit/wall-time attribution, separate from the replacement run (§§10,13,16). |
| Same | `btc-current-main-execution.json` | Exact source/tree, runtime versions, commands, statuses/timings, all 22 Bitcoin fingerprints and six source/dist inventories before and after execution (§§10,13,16). |
| `docs/handoffs/btc-spentness-20261118/evidence/test-lint-followup/` | `qualification.json`, `qualification-transcript.txt` | Fresh independent 45-library/144-web test qualification of the corrected test descendant, retained lint limitation, commands, versions and unchanged source evidence (§§9,10,13,16). |

## Publication provenance

Shell Git has no push credential in this workspace. The authenticated GitHub
connector initially recreated the nine local feature-history commits
with the same complete trees and ordered ancestry, then created this feature's
separate branch. Every generated blob and tree was checked against its local Git object
ID. For those original nine commits, local commit IDs, authors, committers and
ordered parent IDs are retained in the corresponding published commit messages. The machine-readable
[mapping](evidence/publication-map.json) identifies both sets of commits. This
transport does not modify main, PR #219 or another worker's branch and does not
force-update any ref. Documentation-only descendants retain the same runtime
inputs; the PR description records the final published head and its own checks.

For the current-main integration, local `f567d760` corresponds to published
runtime `11667060182bf4d59a559530b2c89e258b231c08`, with the identical complete tree
`af0d3d83344c80c44cdf977a3d1c0a2e05992861`. The publication map includes this
correspondence and the preceding documentation commit. The earlier evidence
commit `4476402c` / `70ded5c6` also integrates the documentation-only `a36f48da`
advance without changing runtime inputs. The map now retains 13 correspondences,
including that evidence commit and the test-only `da351eb8` / `970732da` correction.
The latest documentation descendant and actual hosted outcomes are recorded in
the PR description. The feature branch is updated with a checked, non-force
fast-forward.

## Independent review and integration limits

An independent assistant reviewed the state engine, provider trust boundary,
worker consent, stale-session behavior, UI classification, reorg handling and
resource bounds. Its separate report records reviewed source hashes and executed
tests. This is an independent engineering review within this task, not an external
professional audit.

The branch includes PR #219 through ancestry and should be integrated as its
feature completion, not as a second scanning engine. Other active GhostPay PRs
remain independently owned. The Bitcoin-specific design did not require an
independent import of general seller checkpoint PR #235 or Spec 18 work. The later
current-main shared checkpoint/runtime changes are now inherited exactly as
recorded above. Overlapping consolidation branches must integrate this feature
deliberately and rerun their combined gates.

An earlier remote recheck also found concurrently created PR #244 at
`ef08170a83d86d194b8ce4186299e791027e461e`, on a different Bitcoin completion
branch. It uses a different continuous-coverage representation and overlaps the
same source paths. Its source informed additional concrete regression checks;
its branch, claims and evidence were not overwritten. PR #238 at
`198aa5baff22272453733a0f3dcfcac0e0994eec` also overlaps Bitcoin paths as part of a
broader consolidation. These alternatives must be reconciled deliberately; the
two Bitcoin implementations must not be merged mechanically. Their CI results
do not qualify this branch. Neither competing branch is a prerequisite imported
by this work.

Mempool blindness in local mode, provider dishonesty/omission, full-consensus limits,
live-node interoperability, physical-device acceptance, native-language security
review and overall GhostPay/Mythril/release gates remain explicit. No merge into
main, deployment, release publication or mainnet enablement is part of this work.
