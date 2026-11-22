# R39 — GhostPay uncapped branch triage engineering handoff

Checked at: **2026-11-22T12:12:45.528Z** (UTC). The check is a source-pinned snapshot, not a completed semantic classification of all branches.

## Current source / ownership

- Protected integration target `main`: [`eb59d93cffed7848c4aac37d0e9650b87239c6da`](https://github.com/djshellshoxxx/GhostPay/commit/eb59d93cffed7848c4aac37d0e9650b87239c6da), unchanged at all checks in this cycle.
- Isolated R39 branch: `audit/ghostpay-r39-uncapped-branch-triage-20261122`, pre-handoff HEAD `b2bafe580b541fd7ab53aa63a6d57e6e24056003`. Newly authored scanner + tests and test-first fork-PR ownership collision repair. This branch is NOT a protected-main merge.
- Integration lock `automation/ghostpay-integration-lock/integration-lock.json` was read as **held, generation 11, owner `994a0d214fb9-root-r3`**. Expired fields are insufficient for takeover. No shared ref, production source, or lock changes.
- Main branch protection read returned GitHub App 403 (`Resource not accessible by integration`), so protections cannot be independently verified from this connection. No merge authorization inferred.
- Repository `AGENTS.md`, `docs/ai/{WORKFLOW,HANDOFF,ACTIVE_WORK}.md`, #380 and R38 #464 were read before the isolated implementation. Dedicated BUG-ONLY, F04, F10 and recovery owners retained their files.

## Executed engineering and tests

- Added `scripts/consolidation/branch-disposition.mjs`: read-only paginated branch/open-PR census, exact head/merge-base/ahead-behind records, complete recursive Git-tree path/mode/blob comparison rather than capped compare-file listing, explicit non-final semantic labels, mid-scan SHA/main rechecks, branch ownership matched by full head repository, fail-closed on truncated trees/API errors, source-pinned resume and bounded `--max`/targeted `--branch` checkpoints. No GitHub write capability in the tool.
- Added `scripts/tests/branch-disposition.test.mjs`: 8 Node 22.16.0 tests. Local `node --test scripts/tests/branch-disposition.test.mjs` equivalent checked out as **8 passed, 0 failed, 0 skipped**. The fork collision regression failed against the original scanner (**7 passed, 1 failed**), followed by test/mock correction and production fix; final GREEN 8/8. These are synthetic local module tests, not live repo Vitest, TypeScript, lint, build or browser acceptance.
- Evidence commits: ownership `8bc2ab482d09`; scanner `03f269a97848`; original 7-test suite `5af88ad717de`; RED fork regression `9aef53582c04`; mock `8411c29e10fe`; production fork-head ownership fix `03826a387994`; census commits `7ddd513b2298`, `b2bafe580b54`. All on isolated R39 branch.
- Live `git ls-remote` from the available local container failed GitHub DNS. The local regression suite did run, but an authenticated execution of the new CLI against the remote repository has **not** occurred. No hosted checks for this new branch were available before PR publication.

## Fully paginated R39 census (pre-PR and pre-final-document publication)

- [Branch SHA and provisional dispositions](BRANCH_DISPOSITIONS.json): `100/100/100/100/100/33/0` = **533** branches, independent GitHub matching-refs check **533/533**, zero name/SHA mismatches.
- [Open PR inventory](OPEN_PRS.json): `100/100/24/0` = **224** open PRs; **132** based on main, **92** stacked; **169** draft, **55** ready. After creating this PR, recount; do not treat 224 as post-publication invariant.
- Versus frozen [R38 531-branch census](https://github.com/djshellshoxxx/GhostPay/blob/4f529cbb152916dfd2f3283b224d321533ec5a2d/docs/consolidation/20261122-r38/BRANCH_HEADS.json), newly observed #465 bug-worker branch and this R39 audit branch; R38 audit branch subsequently advanced. All other 530 inherited identities were unchanged at the diff cutoff.
- The provisional classification overlay records **531 not independently finalized by R39** (not 531 proven unique features or a new actionable defect queue). Older 445-branch authoritative dispositions and later R38 ancestry notes remain evidence and must be joined by exact ref/SHA, not silently reset. Source-level exhaustive signoff is **not** achieved. Historical 59 capped donors remain unresolved as a population.

## New uncapped code comparisons (real GitHub Git-tree objects, not compare cap)

| Immutable tree | Tree SHA | Blob files | Truncated |
| --- | --- | ---: | --- |
| main | `d8aa628cbc531c6969bdf0af621795ceacfc00c3` | 3,981 | false |
| historical required v1.1 | `0bfa9ee51b9530e72083db84b81defff8c3b43a1` | 5,299 | false |
| recovery #372 | `65e5cc6fdb7ab3337951ba0b0b58e87b71df095b` | 5,762 | false |

Historical v1.1 vs current main: **3,498 equal** blob paths, **1,380** only in donor, **62** only on main, **421** same-path differing blobs. Historical v1.1 vs recovery #372: **5,138 equal**, **14 donor-only**, **477 recovery-only**, **147 changed**. These are actual complete Git-tree blob comparisons, not source-equivalence or safety judgments. The 14 donor-only paths include relayer/CLI tests, a Solidity test mock, and contract-analysis/Mythril scripts/tests. No browser application source path is absent from recovery. The 147 changed paths require semantic review, including privacy/payment/relayer callers; a large donor must never be blindly imported. New complete-tree data narrows but does not clear #372's own security/QA gates.

Fresh compare examples: historical v1.0 428 ahead/119 behind and v1.1 429 ahead/119 behind with capped 300-file listings; #372 576 ahead/0 behind also capped; older `integration/ghostpay-beta-consolidated-20261109` is proven ancestor of main (0 ahead/1102 behind). F04 #460, F05 and F10 #456 remain stacked/owned; old F04/F05/F10 root source branches are divergent and not independently merge-ready. New #465 at `a234ea9487805d102bd6e6bb045fea5c95962557` is an owned BUG-ONLY PR, not available for duplicate changes.

## Current blockers and CI evidence

- R38 #464 documentation-only CI run `45016069058` passed four applicable jobs, twelve skipped.
- BUG-ONLY #465 exact head `a234ea9487805d102bd6e6bb045fea5c95962557` now has five successful workflow groups and CI run `45017902941` **24/24 jobs successful**, but stays draft pending independent review/owner action; R39 did not alter it.
- F10 #456 exact head `9e8a619cc2ce2688c16c89d16df4aeb7959bc627` retains failure (TS2769 `vault.test.ts:34` and dependent workflows); owner files untouched.
- Recovery #372 exact head `055d33e042c63edf1d5bbbdd7833d3c1ef93733d`: main CI/Pages/Beta/Integration/Hosting passed; Mythril contract-analysis and Tor browser gates failed; Firefox/WebKit recovery qualification and independence required. No analyzer finding suppression.
- Scheme-2 authority, fund recovery after loss of keys, true automated refunds, cross-tab uncertain transactions, F04/F05/F10 completion and #414 confidentiality remain outstanding; no new release qualification established.

## Next executable steps

1. Verify exact head and CI of the newly created R39 PR; independently review code, including the fork repo identity test; only promote if applicable verification holds. Never touch shared integration lock.
2. In a GitHub-network-connected Node 22 environment, run `GITHUB_TOKEN=<token> node scripts/consolidation/branch-disposition.mjs --max 8 --out audit-r39-001.json` (token supplied via environment only). Follow with `--resume audit-r39-001.json --max 8 --out audit-r39-002.json` to cover all branches without restarting resolved refs. Review each `unique-needs-review`/owned path set for safe semantics; never auto-merge based on counters or path SHA alone.
3. Reconcile 59 historically capped donor comparisons using full trees and bounded source/test review; prioritize donor-only analyzer proofs and security gates without weakening Mythril, then recovery, invoice expiry and custody safeguards. Do not import relayer/CLI/contracts into static browser-only beta.
4. Join the legacy 445-branch semantic disposition index and R38+R39 exact SHA overlays, mark genuinely integrated/superseded/blocked evidence per branch, and publish the next versioned ledger with a numerical unresolved actionable queue.
5. Obtain genuine independent approval and coordinator-authorized lock release before dependency-ordered protected-main merge. No deploy, release, force-push, branch deletion or real-funds test.

**No mainline merges, deployment, release or live-funds action in this cycle.**

## Published source-byte verification

Fetched GitHub content blobs after publication and compared their Git blob hashes to the exact local Node-tested files (source comment-only reconstruction): scanner `55f64de073edb12eaab45fb7980e64d81d0eb98c`, regression tests `0a67cd513bd0ed3f71512f2333fff3515ff994ee`. Both Git blob SHA-1s matched exactly. Re-ran `node --test`: 8 passed, 0 failed, 0 skipped. This is not remote API execution or hosted CI qualification.
