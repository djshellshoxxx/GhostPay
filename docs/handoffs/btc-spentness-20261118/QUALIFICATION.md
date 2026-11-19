# Bitcoin spent-output detection and private scanning

## Candidate and scope

Branch: `chatgpt/btc-spentness-private-scan-20261118`.

| Source | Exact revision |
| --- | --- |
| Main inspected before work | `dfc75ef2087fa6463ae59e0818abec01796c578d` |
| Main rechecked before PR integration | `58d89b39b27a66454ebf392bcd35d5c68b57b2f8` (#241 transport isolation and #237 beta logs) |
| PR #219 preserved as an ancestor | `9617e8572f9bc414410bd937b0e7718d0c5bd55c` |
| Main + PR #219 integration and ownership claim | `7873171faab06a43b40697b18973b23909fb5008` |
| Continuous coverage and state reconciliation | `62380400320c0cda7867b42e3cb708b0148af64e` |
| Initial completed runtime/test implementation | `019de9cb9c9b65b6ceddec1225274504c98bcf2b` |
| Current-main integration | `72194c4f57b27f2928bd47d67c8999eb27794fbb` |
| Duplicate/replayed evidence repair | `8998030627f091de4079d91dbaccf0619a7b77c9` |
| Current-authority action guards | `8cbbc1bfedce73e785d9b0f46069f501a67b59e7` |
| Distinct-output resource bounds | `e261a777c44d742f5e19a8975bbdcbab7059c545` |
| Final runtime implementation / independent review target | `d646e6db035f008b643d5a5278bbbae8b838f488` |
| Published runtime with byte-identical complete tree | `4281fce1ecc862b2805fce0106efa395ed4b2f4a` |
| Complete runtime tree, local and published | `64fa82876d9ed0667f74cb66acafa4be3021478d` |

This work preserves PR #219 and completes its Bitcoin-specific spentness,
resumption, provider-consent, and UI safeguards. It does not modify EVM protocols,
Spec 18 recovery, seller checkpoint architecture, cryptographic signing or transaction construction,
contracts/Mythril, dependencies, release workflows, or general consolidation.
The full web profile contains Bitcoin; the lean Pages profile still excludes it.

**Qualification status:** final independent focused qualification passed on
`d646e6db`: **45 library tests and 144 web tests**, with no failures or skips.
All 22 captured source/test/compiled-library hashes were unchanged before and
after execution. Full candidate browser/build/typecheck/coverage qualification
requires the current PR's actual CI results. This document does not claim release
readiness or a main merge. The final PR description records the published head
and latest CI outcomes.

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

## Local validation ledger

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

Tool versions used: Node 24.22.3 (initial execution and benchmark), cached Node
22.23.4 (CI-compatible diagnostic/runtime), npm 11.9.0, TypeScript 5.9.3, Vitest
5.0.5 with `@vitest/coverage-v8` 5.0.5, Playwright 1.64.1, and installed Chromium
156.0.8078.79. Browser tests in hosted CI use the repository's configured runner.

Resource bounds such as `NODE_OPTIONS` and `VITEST_MAX_WORKERS=1` changed execution
concurrency/heap allocation only. No test timeout, assertion, coverage threshold,
privacy gate or release requirement was relaxed.

## Reproduction commands

Run from the repository root after installing its locked dependencies:

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

Exact library source at `d646e6db035f008b643d5a5278bbbae8b838f488`, with source and
compiled-module SHA-256 pins inside each JSON file:

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

Every changed file relative to current main belongs to the following feature
groups. Paths in the middle column are relative to the stated directory; paired
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
| Same | `btc-independent-final-library.txt`, `btc-independent-final-web.txt` | Retained raw final independent execution evidence at the reviewed runtime (§§10,13,16). |

## Publication provenance

Shell Git has no push credential in this workspace. The authenticated GitHub
connector recreates the nine local implementation/integration commits with the
same complete trees and ordered ancestry, then creates this feature's separate
branch. Every generated blob and tree was checked against its local Git object
ID. Original local commit IDs, authors, committers and ordered parent IDs are
retained in the corresponding published commit messages. The machine-readable
[mapping](evidence/publication-map.json) identifies both sets of commits. This
transport does not modify main, PR #219 or another worker's branch and does not
force-update any ref. Documentation-only descendants retain the same runtime
inputs; the PR description records the final published head and its own checks.

## Independent review and integration limits

An independent assistant reviewed the state engine, provider trust boundary,
worker consent, stale-session behavior, UI classification, reorg handling and
resource bounds. Its separate report records reviewed source hashes and executed
tests. This is an independent engineering review within this task, not an external
professional audit.

The branch includes PR #219 through ancestry and should be integrated as its
feature completion, not as a second scanning engine. Other active GhostPay PRs
remain independently owned. General seller checkpoint PR #235 and Spec 18 work are
not prerequisites for these Bitcoin-specific changes. Overlapping consolidation
branches must integrate this feature deliberately and rerun their combined gates.

The final remote recheck also found concurrently created PR #244 at
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
review and overall GhostPay/Mythril/release gates remain explicit. No merge,
deployment, release publication or mainnet enablement is part of this work.
