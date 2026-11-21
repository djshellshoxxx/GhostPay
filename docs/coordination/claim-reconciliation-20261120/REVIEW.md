# Independent review and execution evidence

## Reconciliation tool

The author and an independent reviewer each executed the final synthetic Git suite: **13 passed, zero failed, zero skipped**. The reviewer made no source edits. Source syntax and whitespace checks passed. No package installation is required; the tool uses Node builtins and local Git.

The review found and corrected three concrete defects before publication:

1. A deleted file could appear to match a target directory occupying the same path because recursive tree listing omitted directories. The corrected comparison records the target tree mode, type and SHA and reports a difference.
2. A nested repository argument could omit the root ownership file. The tool now normalizes the repository root and produces identical evidence from a nested directory.
3. Contradictory main/integration labels could be accepted despite otherwise valid commit objects. The snapshot contract now requires the captured main branch and integration PR to agree with the named primary targets.

Other tests cover historical inclusion versus later reversion, cherry-picked matching content without ancestry, differing contents, deletions, renames, executable modes, gitlinks despite local ignore configuration, tab/newline paths, stacks, ordinary PR-ref drift, unrelated histories, missing/noncommit objects, malformed snapshots and deterministic replay. Replacement objects and lazy fetching are disabled; shallow/grafted history is refused. Raw ownership remains uninterpreted and no readiness verdict is generated.

Reviewed SHA-256 fingerprints:

| File | SHA-256 |
| --- | --- |
| `scripts/coordination/reconcile-claims.mjs` | `8a22ffa7121e9baf3616e581bb716b78eb393bf801e751b7988f09bcd5041291` |
| `scripts/coordination/reconcile-claims.test.mjs` | `07244246a1ac1cfb67fcd73fde6f7c20f8e3e2d4b7906d32d63eb6266f5d07dc` |

The first complete corpus attempt ended with exit 137 and no output. That is retained as an unsuccessful execution; its precise termination cause was not established. Incremental serialization and a 256 MiB Node heap cap then completed the 420-branch/120-PR initial snapshot with exit zero. Its output SHA-256 is `e0ff17d180bf78ae5e5900ed12cda9d6ffd2e863332586629eda0cf584ba302d`; the coordinator independently matched the emitted hash to the actual output and its lossless compressed round trip. `SUMMARY_INITIAL.json` preserves those initial results. The final publication snapshot and results are recorded separately.

The final 425-branch/125-PR run also exited zero. Its 52,602,377-byte output SHA-256 is `ddc6c5688bc39640ffec9050f3111c3bce6e0de55f5da5b929776548a81033a3`; the coordinator independently verified the actual file digest. `SUMMARY.json` and the final indexes preserve those results.

The complete output is reproducible from the committed generator and exact snapshot. Compact branch/PR indexes and the summary are retained with the input; bulk intermediate report output need not be copied into every future documentation commit.

## Product evidence boundaries

PR #350 at `89b3572f7e60cb6f5e5a0d7830632d1bb5f04dd8` received independent source review and an actual four-test repository run. Its focused helper result is **4/4**, zero skips. The component batch, web build/typecheck and scoped lint were terminated with exit 137 before reporting results; none is presented as passing. Exact commands, dependency/source identities and limits are in `scan-350/`.

The released focus repair was independently recovered on the #352 stack with a controlled **3 failed / 7 passed** baseline and **10/10** after recovery. During publication, concurrent PR #354 was discovered. Its runtime performs the same guarded focus fallback, with predicate order and comments differing; byte identity is not claimed between the two original runtime versions. The coordinator preserved #354's implementation and browser repairs and converted #355 into a tests-only follow-up containing three distinct mounted quick-hide cases. The new file produced **2 failed / 1 passed** against the old #352 runtime, then the canonical thirteen tests plus the three additions passed **16/16**, zero skips. The canonical #354 source/test/browser blobs remain exact. The final handoff and PR preserve precise source identities and publication provenance.

These focused results do not replace full web coverage/nocov, TypeScript, typed lint, application build, browser acceptance, security or hosted checks on a combined candidate. No release qualification, external-chain acceptance or ownership release is inferred by the inventory.

## Publication package checks

An independent final documentation review verified the 425 branch rows, 125 PR rows, all 199 ownership-source associations, relative links, source/report/log fingerprints, dependency chains and the distinction between ten other included PRs and eleven including #307 itself. It also compared the complete local/public #355 trees and ordered parents, confirmed the three-file delta above #354 and the documentation-only change after the green test tree. No substantive count, qualification or dependency discrepancy remained. The review caught omitted log/manifest packaging, which was corrected before publication.

The complete referenced scan-helper artifact manifest and all seven scan logs are retained, together with the two final focus-regression logs. Their byte sizes and SHA-256 values match the corresponding qualification receipts. The ignored `.log` files were explicitly staged; no ignore rule was changed.

Source and authored-document whitespace validation is separate from immutable captured inputs. Five retained JSON captures (`CI_OBSERVATION.json`, `SNAPSHOT.json`, `live-inventory-20261121.json`, `pr-descriptions-20261121.json`, and `six-branch-dispositions-20261121.json`) have an extra final blank line. Raw execution logs can also retain terminal-output whitespace. These artifacts are preserved byte-for-byte so their recorded identities remain reproducible; a whole-package `git diff --check` reports those artifact-format findings, rather than an unqualified whitespace pass.
