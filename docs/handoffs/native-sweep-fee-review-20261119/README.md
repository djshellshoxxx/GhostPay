# Native sweep fee review — recovered source and fresh qualification

## Status

The native fee-review implementation is restored on
`repair/ghostpay-native-fee-recovered-20261119` at local source commit
`ed95c5601b0ec127be56cad57fcb78d44954b2fb`, tree
`7de0e0371f078ca5d0926b0fa1162d23dd781074`. Its base is the published checkpoint
`7b4c1554382b05ac3fab48527aadf596d6b1ff7b`. The coordinator published the same
source tree at
[`3da1f5519580ed0dce5b733cb68215a96e95af9e`](https://github.com/djshellshoxxx/GhostPay/commit/3da1f5519580ed0dce5b733cb68215a96e95af9e).
Local and published commit IDs differ because the publication workflow recreated
the commit objects; the recorded source tree matches.

All 14 feature files match the exact Git blob IDs recorded from the previously
reviewed runtime commit `02760fb4f609615c6bf31592afc261d78c3dc82f`. The complete old
commit object and its logs were lost when the earlier execution environment was
replaced. This recovery establishes identity for those 14 files; it does not
reconstruct or qualify the old complete repository tree. The machine-readable
[source recovery record](recovered-evidence/source-recovery.json) gives every path,
Git blob, SHA-256, byte length, and the supported Node runtime identity.

Fresh focused execution on the recovered source passed **374 tests in nine
files**, followed by **10 destination-privacy tests in one additional file**.
That is **384 distinct tests across ten files**, with zero failures, skips, or
todo cases. The 54 new native-review cases are included in the 374-test run.
This is focused regression qualification, not full coverage, browser acceptance,
testnet acceptance, or release approval.

## Resulting behavior

Native direct sweeps require a separate fee-preparation action and a later
confirmation. Preparation uses the selected endpoint through a read-only
`sweep-quote` network grant. It proves ownership, disposes the derived secret,
and computes the transaction without signing or creating a broadcast journal
entry. The review presents the exact destination, balance, nonce, gas limit,
fee caps, execution reserve, additional L1/operator fee reserve, total reserve,
and net native amount.

The in-memory review is an opaque, frozen capability. It binds the original
session, endpoint, payment, destination, manifest, context revision, and full
same-nonce replacement identity. It expires after at most 60 seconds, detects
invalid or backward wall/monotonic clock readings, and is consumed before the
first asynchronous confirmation step. Cancellation, locking, relevant input
changes, or replacement of the session invalidates it permanently.

Confirmation needs a separate `sweep-submit` grant and vault authorization. A
fresh preflight must match the exact reviewed serialized transaction, reserve,
and simulation classification. Changed balance, nonce, gas, or other fee inputs
require a new explicit preparation. Authority is checked before key access,
signature creation, the handoff journal, and transport. Requests inside native
preflight and native manifest verification are guarded before and after awaits;
expiry during a manifest response stops the remaining manifest reads and keeps
the specific stale-review error.

Existing submitted and uncertain handoff outcomes retain their transaction
evidence even if authority expires after transmission. A reserve is a maximum
allocation, not a claim that the chain will charge that exact fee. No ERC-20
qualification, mainnet enabling, relayer service, or backend requirement is
added by this change.

## Fresh execution evidence

| Check | Exact outcome | Evidence |
| --- | --- | --- |
| Initial CLI attempt | Exit 1 before test collection: installed Vitest rejects `--minWorkers`. Zero product tests qualified. Only the invocation was corrected. | [Receipt](recovered-evidence/focused-tests-cli-error.receipt.json), [complete log](recovered-evidence/focused-tests-cli-error.log.gz) |
| Focused helper, native UI, lifecycle, privacy, journal and state suites | 9 files, 374 tests passed; 0 failed/skipped/todo; process exit 0; 80.252 seconds | [Receipt](recovered-evidence/focused-tests.receipt.json), [complete log](recovered-evidence/focused-tests.log.gz), [complete JSON report](recovered-evidence/focused-tests.json.gz) |
| Destination privacy | 1 additional file, 10 tests passed; 0 failed/skipped/todo; process exit 0; 2.436 seconds | [Receipt](recovered-evidence/destination-privacy.receipt.json), [complete log](recovered-evidence/destination-privacy.log.gz), [complete JSON report](recovered-evidence/destination-privacy.json.gz) |
| Source identity | All 14 recorded feature blobs match exactly | [Source recovery record](recovered-evidence/source-recovery.json) |
| Whitespace integrity | `git diff --check` from base through the restored source passed | Re-run the command below on this branch |

The historical 342-case result is not included in these totals. Its original
file manifest and raw logs are unavailable. An anticipated count of 13 for the
destination-privacy file was an inference before execution; the fresh report
establishes that it contains and executed 10 cases.

Every retained raw diagnostic/report is gzip-compressed without trimming or
rewriting its uncompressed bytes. Each receipt records the exact command,
working directory, source/tree, runtime options, elapsed time, child exit code,
uncompressed SHA-256 and byte length, and stored-file SHA-256. Vitest's JSON
`numTotalTestSuites` also counts nested suites; use its `testResults` file list
and the logged file totals when interpreting the nine-file and one-file runs.

Both runs use the repository's original Vite/Vitest configuration, with
`--maxWorkers=1`, and the supported Node 22.23.5 binary recorded in the source
receipt. The larger run has a 768 MiB V8 old-space cap; the destination test has
a 512 MiB cap. Coverage was not requested for these scoped runs; no coverage
threshold, assertion, production configuration, or test inclusion rule changed.

## Reproduction

From `apps/web`, after a clean dependency installation and all workspace
library builds, run the following with the supported Node runtime selected:

```sh
NODE_OPTIONS=--max-old-space-size=768 node ../../node_modules/vitest/vitest.mjs run --maxWorkers=1 \
  src/lib/sweep.test.ts \
  src/lib/sweep.reviewAuthority.test.ts \
  src/lib/sweep.nativeReview.test.ts \
  src/lib/sweepAttemptJournal.test.ts \
  src/state.sweep.test.ts \
  src/views/Sweep.test.tsx \
  src/views/Sweep.privacy.test.tsx \
  src/views/Sweep.quoteLifecycle.test.tsx \
  src/views/Sweep.nativeReview.test.tsx

NODE_OPTIONS=--max-old-space-size=512 node ../../node_modules/vitest/vitest.mjs run --maxWorkers=1 \
  src/lib/sweep.destinations.privacy.test.ts
```

From the repository root:

```sh
git diff --check 7b4c1554382b05ac3fab48527aadf596d6b1ff7b..HEAD
```

## Independent review and remaining boundaries

The provenance reviewer issued a fresh source-only approval at the immutable
recovered source on 2026-11-19. It checked helper/UI and regression blob identity,
one-shot authority, clock and session binding, manifest expiry, late-signature
refusal, and preservation of evidence after transport. A separate independent
key/export reviewer is also reviewing the restored implementation. Their
coordinator-owned review receipts must be retained with the integration record;
source review alone is not an executed test result or external security review.

The RPC client's internal initialization and chain-ID retry sequence retains
its existing network/action deadline. Native review checks occur before and
after client creation; this change does not add fee-clock checks inside every
SDK initialization request. Explicit cancellation still aborts the action
grant. The per-request native guard covers subsequent manifest verification and
private preflight requests.

The coordinator owns full web TypeScript checking, typed lint, complete coverage,
egress/i18n checks, full/lean Pages builds, browser acceptance and final integrated
source qualification. The three browser journey changes are restored exactly
but have not been executed by this worker in the replacement environment.
Dedicated-origin and owner decisions, authenticated deployment manifests,
approved signing authority, actual testnet transactions and required independent
external security review remain separate release gates. This handoff issues no
demonstration or testnet readiness verdict.
