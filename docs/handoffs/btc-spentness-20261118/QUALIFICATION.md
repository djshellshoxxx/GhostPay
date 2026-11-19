# Bitcoin spent-output detection and private scanning

## Candidate and scope

Branch: `chatgpt/btc-spentness-private-scan-20261118`.

| Source | Exact revision |
| --- | --- |
| Main inspected before work | `dfc75ef2087fa6463ae59e0818abec01796c578d` |
| Main rechecked before PR integration | `58d89b39b27a66454ebf392bcd35d5c68b57b2f8` (#241 transport isolation and #237 beta logs) |
| PR #219 preserved as an ancestor | `9617e8572f9bc414410bd937b0e7718d0c5bd55c` |
| Main + PR #219 integration and ownership claim | `7873171faab06a43b40697b18973b23909fb5008` |
| Continuous coverage and state reconciliation | `62380400` (full revision available in branch history) |
| Initial completed runtime/test implementation | `019de9cb9c9b65b6ceddec1225274504c98bcf2b` |

This work preserves PR #219 and completes its Bitcoin-specific spentness,
resumption, provider-consent, and UI safeguards. It does not modify EVM protocols,
Spec 18 recovery, seller checkpoint architecture, signing/transaction construction,
contracts/Mythril, dependencies, release workflows, or general consolidation.
The full web profile contains Bitcoin; the lean Pages profile still excludes it.

**Qualification status:** focused regression evidence is recorded below. Full
candidate browser/build/typecheck/coverage qualification requires the current
PR's actual CI results. This document does not claim release readiness or a main
merge. The final PR description records the published head and latest CI outcomes.

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
| Workspace library build, `npm run build:libs` | Passed on the initial integrated baseline. Current-main inherited transport packages are rebuilt before combined qualification. |
| Pages tooling `node --test scripts/pages/*.test.mjs` | 72 passed, no failures/skips. This is tooling validation, not a built artifact or browser pass. |
| Independent library state/scanner tests | 41 passed across 2 files, no skips. |
| Independent combined Bitcoin web selection at `019de9cb` | 120 passed across 7 files, no failures/skips; later authority-edit review findings require separate delta qualification. |
| Coordinator scan/spend/resume/Esplora/header selection | 80 passed across 5 files. |
| Additional full tip/reorg selection | 39 passed across 2 files. |
| Worker/source/oracle selection | 37 passed across 3 files before the final malformed-start additions. |
| Initial UI compatibility selection | 27 passed / 1 failed; the additional tip-advance test captured the old helper before its regression-backed repair. Final independent rerun is required. |
| Full Bitcoin library coverage command | 568 passed / 1 failed, 32 files. The unchanged 100,005-header reload test exceeded its unchanged 60-second timeout. No complete coverage percentage was emitted. |
| Same header stress test on CI-compatible Node 22 | Same timeout, 1 failed / 26 deselected. Diagnostic partial coverage is not full-suite coverage. |
| Whole-web typecheck | Local attempts exceeded memory limits: Node 24/512 MiB exited 137; Node 22/384 and 640 MiB reached V8 heap limits; Node 22/1536 MiB exited 137. No pass claimed. |
| Native Chromium readiness | Failed before page creation: Chromium `socket()` returned `EPERM`. No sandbox bypass or browser pass claimed. |
| Playwright discovery | Full: 82 tests in 21 files; lean: 72 tests in 19 files. Discovery is not execution. |
| i18n validation/extraction | 4 catalogs, 0 errors, 439 warnings; 2,125 used keys, 0 missing English keys, 136 unused. English security fallback warnings are intentional pending native review. |
| Secret scan | Passed: no committed environment files or key material found. |
| Whole-web ESLint | Local Node 22 attempt exited 137 (memory/resource limit); no lint pass claimed. |
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
```

Pages output must be a new directory and the ordinary clean-tree/commit and
deployment-manifest guards remain enforced. PR workflows validate artifacts only;
publishing requires the existing separate authorized manual deployment path.

## Measured resource behavior

Exact library source at `019de9cb9c9b65b6ceddec1225274504c98bcf2b`, with source and
compiled-module SHA-256 pins inside each JSON file:

| Fixture | Local scan | Resume/checkpoint |
| --- | ---: | ---: |
| Completed blocks | 500 | 500 |
| Watched outputs | 10,000 | 750 |
| Input entries supplied, including identical duplicates | 1,000,000 | 1,000,000 |
| Spend events / persisted spends | 10,000 | 750 |
| Tweak/output/spend-source calls | 500 each | 500 each |
| Network calls | 0 | 0 |
| Wall time | 18,726.44 ms | 23,718.77 ms |
| Maximum process RSS | 82,016 KiB | 82,228 KiB |
| Largest serialized checkpoint | Not applicable | 469,351 bytes |

The resume fixture serializes 500 checkpoints totaling 209,056,679 bytes. The
largest is below the unchanged 524,288-byte worker limit. Persistent capacity is
byte-based: a 10,000-match scan limit does not imply that 10,000 complete records
fit in a checkpoint. A conflicting-consumer fixture is rejected before any spend
or block-completion callback (87.68 ms in this run).

These are single-run Node measurements under local executor load, not browser
benchmarks. They exclude receiver cryptography, raw block/header verification,
worker messaging, encryption, storage I/O and network latency. RSS includes runtime
and fixture setup. Run the retained harness with an already built library:

```sh
node --max-old-space-size=128 --max-semi-space-size=8 --expose-gc docs/handoffs/btc-spentness-20261118/evidence/benchmark.mjs scan
node --max-old-space-size=128 --max-semi-space-size=8 --expose-gc docs/handoffs/btc-spentness-20261118/evidence/benchmark.mjs resume
node --max-old-space-size=128 --max-semi-space-size=8 --expose-gc docs/handoffs/btc-spentness-20261118/evidence/benchmark.mjs conflict
```

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

Mempool blindness in local mode, provider dishonesty/omission, full-consensus limits,
live-node interoperability, physical-device acceptance, native-language security
review and overall GhostPay/Mythril/release gates remain explicit. No merge,
deployment, release publication or mainnet enablement is part of this work.
