# Complete branch and claim reconciliation — November 20, 2026

This review captures **425 live branches and 125 open PRs** and preserves their exact Git identities. It adds a reproducible, read-only comparison tool, complete branch/PR indexes, source-pinned ownership references, selected recovery dispositions and actual qualification evidence. It does not authorize a merge or declare every feature complete.

The final endpoint observation completed at **7:04:08 p.m. Pacific on November 20, 2026** (`2026-11-21T03:04:08Z`). Branch and PR endpoints were read separately; the snapshot is not an atomic GitHub transaction. It includes concurrent PRs #353–#357 and the corrected #355 dependency. The later publication branch and PR for this report are intentionally outside that frozen inventory.

## Pinned source and inventory results

| Target | Commit | Tree |
| --- | --- | --- |
| `main` | `aec179910c39081d820396409ff3139ff2264132` | `93588004b788f583bab76a72953be98f9d8e8591` |
| Integration [#307](https://github.com/djshellshoxxx/GhostPay/pull/307) | `5a745d4b5fba69b66a9779f88aefc63c253a4f27` | `05b0425153c66260bc8e1da2ea82f57a248bf376` |

| Result | Count | Interpretation |
| --- | ---: | --- |
| Live API-observed branches | 425 | Local-only refs are excluded. |
| Open PRs | 125 | Both pages of the open-PR endpoint are retained. |
| Complete branch deltas | 410 | A unique merge base exists with pinned main. |
| Branches with multiple merge bases | 14 | No arbitrary base or empty-change verdict is substituted. |
| Branches with unrelated history | 1 | `gh-pages`; no comparable branch delta. |
| Complete PR deltas | 125 | Each uses its own pinned base and head. |
| Branch heads in main's history | 189 | Historical inclusion, not proof that behavior survived later edits. |
| Branch heads in #307's history | 199 | The same ancestry limitation applies. |
| Distinct ownership-document blobs | 199 | Raw claims are preserved by identity and remain uninterpreted. |
| PR base SHA / captured branch-tip mismatches | 76 | Visible source drift; not an automatic conflict or failure verdict. |
| PR head SHA / captured branch-tip mismatches | 0 | Agreement within the separately captured endpoints. |
| Paths changed by more than one open PR | 1,198 | Narrow narrative-document exclusions apply; overlap alone does not prove a conflict. |

The largest complete branch comparison contains **3,902 changed paths**. The tool reads Git objects directly and is not constrained by a paginated GitHub changed-file response. Every comparison records path, object type, mode and blob identity, including deletions. See [SUMMARY.json](SUMMARY.json), [BRANCH_INDEX.md](BRANCH_INDEX.md), [PR_INDEX.md](PR_INDEX.md) and [OWNERSHIP_INDEX.json](OWNERSHIP_INDEX.json).

Ten other open PR heads are already ancestors of #307: **#231, #252, #272, #308, #313, #315, #316, #317, #319 and #320**. The generated total is eleven because #307 includes itself. This supports checking for obsolete review work; it does not authorize closing those PRs or assume their behavior remains intact. No open PR head is an ancestor of pinned main.

## Findings that affect consolidation

### Idle-session recovery missed the integration branch

[PR #325](https://github.com/djshellshoxxx/GhostPay/pull/325), at `1788f1e0a0fe1fb22bb887427c47bdd62db78c1a`, merged into #307 at **3:17:17 p.m. Pacific** on November 20 (`23:17:17Z`), producing `394793b1276aeac337aedde30499548bb57eadf9`.

[PR #331](https://github.com/djshellshoxxx/GhostPay/pull/331) then merged idle source `f5e04a30bd538b5dba6202885c8e1c3cceb31fa3` into #325's already-merged source branch at **3:29:16 p.m. Pacific** (`23:29:16Z`). That branch advanced to `2748c9bfd55bd226c7801c15a7acdd955ab70339`; #307 did not inherit the later update.

The existing **#333 → #335 → #344** stack retains the idle commit as an ancestor. Sixteen of seventeen inspected source/test/catalog blobs are exact to the idle donor; `SellerKeys.tsx` was deliberately strengthened by #333's backup-preflight work. Carry this existing stack forward with its dependency history and qualify the combined result. Restoring the older SellerKeys blob would discard the subsequent fix. The chronology and exact comparisons are preserved in [six-branch-dispositions-20261121.json](six-branch-dispositions-20261121.json) and [orphan-branch-blob-dispositions-20261121.json](orphan-branch-blob-dispositions-20261121.json).

### The focus recovery now has one runtime implementation

The released orphan branch `fix/ghostpay-browser-acceptance-20261120-r3` at `2affd298c364c284d4d74f703fd4a612cc0f16d9` contained a focus fallback absent from the initial 120-PR inventory. The owner's handoff explicitly released its source paths for isolated recovery. A controlled local recovery reproduced three failures before the fix and passed ten tests afterward.

Concurrent [PR #354](https://github.com/djshellshoxxx/GhostPay/pull/354), at `8ce7f1db452167311876bd0707778c2e9c64f3df`, supplied the canonical guarded fallback, cancellation tests and browser repairs. Its runtime differs textually from the original orphan implementation; review established the same focus-fallback behavior, not byte identity between those original versions.

[PR #355](https://github.com/djshellshoxxx/GhostPay/pull/355) was therefore advanced without rewriting history and retargeted to #354. Its final head is **`0fb2831a1b89430c69896f6db57306cd5518e55f`**, with tree **`e76571b61bfa8afbb745054df7f78e3b39d771e1`**. Relative to #354, it changes only the additive ownership record, its handoff and the new `WalletDisclosure.quickHide.test.tsx` file. All existing application and browser files remain exact to #354.

The three additional mounted tests cover quick hide after disclosure, including body/document-element opener fallbacks. They check that sensitive controls disappear, no transaction or additional provider request occurs, and focus ends on the visible privacy switch without visiting a hidden or inert element. The new tests produced **2 failed / 1 passed** against the old #352 runtime; the canonical thirteen tests plus these three passed **16/16**, with no skips. See [focus-355/qualification.json](focus-355/qualification.json), its adjacent logs and [focus-355/PUBLICATION.json](focus-355/PUBLICATION.json).

The dependency chain continues through **#326 → #327 → #336 → #348 → #352 → #354 → #355** above the existing privacy/retention foundation. The initial six-branch records remain frozen evidence from 420 branches / 120 PRs; their statements that the focus fix was missing are superseded by this final disposition. The broader orphan test edits require path-specific comparison; no wholesale cherry-pick of that orphan was made.

One acceptance distinction remains: the orphan's `walletFixture.ts` changes accounts silently at the final account recheck. #354 retains the event-emitting fixture and strengthens `flows.spec.ts` around account invalidation, reconnection, concealed controls and zero submission. Those tests exercise different paths. The silent final-recheck fixture remains a preserved test-design candidate; this review does not establish a runtime defect or complete behavioral equivalence of the entire orphan patch.

### #307 has a recorded failing web gate with an existing repair

Core CI [run 44836230375](https://github.com/djshellshoxxx/GhostPay/actions/runs/44836230375), associated with #307's pinned head, failed its web shard: **3,084 passed, 1 failed, 1 skipped**. The failure was `Pay.requestFile.test.tsx` — “uses the existing passphrase flow without previewing private fields” — waiting for the “Review payment” heading.

The checkout log identifies the actual tested commit as **`a55b0d07f4df48488929d742c935886ac2ecbd91`**, GitHub's synthetic merge of head `5a745d4b…` into base `bfebea0a…`. This is evidence about that composition, not an assertion that CI ran the head as a standalone checkout or tested current main.

Existing [PR #344](https://github.com/djshellshoxxx/GhostPay/pull/344), at `a88157b53d1e0925350d5c8db047eabb4365f4e9`, waits for the real `invoices.openFragment` KDF promise in `act`, checks its invocation and retains the UI/secret assertions. It belongs above #335 and avoids duplicating that repair. Its core CI was still queued at the retained observation; full success is not claimed. Workflow-level successes elsewhere do not establish that every conditional job ran. [CI_OBSERVATION.json](CI_OBSERVATION.json) retains run/job identities, actual checkout and status limits.

### Preserve the other retained recovery work

| Retained branch or work | Disposition from exact source review |
| --- | --- |
| Vault rekey evidence `b9911c72…` | Documentation-only child of #328 (`81598d93…`); both inspected product/test blobs match #328. Retain evidence and qualify that existing PR. |
| Idle evidence `ebc3fea4…` | Documentation-only child of `f5e04a30…`; preserve the original reported results and their skip identities without presenting them as reruns. |
| Hygiene composition `0e19ccc7…` | Four inspected blobs match #347 and two ledger blobs match #341. Preserve #339 → #347 plus #341 and the existing composition evidence. |
| Fee-floor evidence `aeb6cb37…` | Documentation-only child of merged #334. The two inspected product/test blobs already match main; #307 still has the older blobs. Preserve main's correction during reconciliation. |
| Scan helper [#350](https://github.com/djshellshoxxx/GhostPay/pull/350) | Independent source review found no blocker in deduplicating repeated identical announcement IDs while retaining warnings for distinct IDs at the same address. The four original helper tests passed at `89b3572f…`. No financial-loss defect was established by this review. |
| Concurrent #353 → #356 and #357 | Included in the final inventory. #356 depends on the settings-import draft #353; #357 is separate policy-identity work on main. Their product behavior was not independently qualified in this task. |

Full branch names, commit identities, source paths and retained prior results are in the six-branch evidence files. Prior owners' package/build results are identified as retained evidence, distinct from the focused tests actually executed here.

## Verification and limits

The reconciliation tool's synthetic Git suite passed **13/13** for the author and independently for the reviewer, with no skips. Review corrected directory-versus-deletion comparison, nested-repository ownership lookup and contradictory primary-target provenance. [REVIEW.md](REVIEW.md) records source fingerprints and the remaining cases covered by tests.

The final complete inventory run exited zero. Its output is **52,602,377 bytes**, SHA-256:

```text
ddc6c5688bc39640ffec9050f3111c3bce6e0de55f5da5b929776548a81033a3
```

The coordinator independently matched the emitted digest to the actual file. The final [SNAPSHOT.json](SNAPSHOT.json) SHA-256 is `56663c301cea0d7c9723a5eb1a825341f4dd3d44057075a710ec651a96c0106e`. The initial 420/120 run and its different output identity remain in [SUMMARY_INITIAL.json](SUMMARY_INITIAL.json).

For #350, the focused repository result was **4/4**. Broader component, build/typecheck and scoped-lint attempts ended with exit 137 before results; they are not recorded as passing, and the precise termination cause was not established. See [scan-350/README.md](scan-350/README.md) and its evidence.

For #355, **16/16 focused tests** passed on the recorded immutable source tree; only handoff documentation changed afterward. Full web coverage/nocov, TypeScript, typed lint, app build, browser acceptance and hosted checks on the final combined product candidate remain required. Local test execution used Node 24; the repository's Node 22 CI remains a separate gate.

This is a complete captured branch/PR inventory and selected semantic review, not a complete semantic audit of every branch or a release qualification. Exact matching changed-path postimages do not prove provenance; ancestry does not prove surviving behavior; overlapping paths do not prove ownership or conflict; a claim document does not prove its owner has released the work.

## Reproduce the complete evidence

Use Node and Git in a full clone that retains every commit object named in the snapshot. The tool needs no npm dependencies and does not fetch, alter refs, merge, dispatch CI or interpret ownership status. It rejects missing/noncommit objects, shallow or grafted history and malformed snapshots. Replacement objects and lazy fetching are disabled.

From the repository root:

```sh
node --test scripts/coordination/reconcile-claims.test.mjs
node --max-old-space-size=256 scripts/coordination/reconcile-claims.mjs \
  --repo . \
  --snapshot docs/coordination/claim-reconciliation-20261120/SNAPSHOT.json \
  --output ../ghostpay-reconciliation-20261120.json
sha256sum ../ghostpay-reconciliation-20261120.json
```

If required objects are missing, obtain those exact objects before replay; do not replace snapshot identities with current branch tips. The complete generated report includes all file comparisons, postimages, dependency and overlap records, and all 199 raw ownership-document blobs. Compact indexes and the exact input are committed here; the reproducible 52 MB intermediate is not duplicated into this documentation commit. Initial PR descriptions are unverified author statements and are retained as provenance only.

## Next integration steps

1. The integration owner should refresh relevant heads and qualification results, preserve main's fee-floor correction, and bring the existing idle/backup/receipt/#344 stack into a composed candidate.
2. Preserve the privacy chain through #354 and the tests-only #355, and review the remaining orphan browser paths individually. Keep #339/#347 and #341 source provenance when incorporating the hygiene composition; qualify #328 and #350 on their actual combined sources.
3. Resolve the captured base-ref drift and overlapping product changes with the relevant owners. Preserve existing source and qualification evidence while doing so.
4. Run the required full/lean, browser, Pages/Beta and security gates on the final composed source. Merge only after review and the applicable successful gates.

The initial live lock observation was `automation/ghostpay-integration-lock` at `c196151daf8233f96045fd205b2d899c9e8cc97d`, held at generation 11 by `994a0d214fb9-root-r3`; see [live-inventory-20261121.json](live-inventory-20261121.json). Lease expiry alone does not authorize takeover. The final report does not refresh or infer that lock state. This worker did not acquire the integration lock, modify shared integration/main, merge a PR, delete branches, force-update refs, dispatch workflows, deploy, or transact real funds.
