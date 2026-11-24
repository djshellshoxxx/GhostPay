# GhostPay R72 — deleted dependency donor patch recovery and exact-hunk tooling

Checked GitHub: **2026-11-23T19:15:25.775Z UTC**. Protected main: `8ddb344973e80b8e1eda6821e970ee6a2b808b29`; unmerged consolidation branch pre-ledger HEAD: `379ccf0dd703912e494c4a0e6ddf8a88ddf921ab`.

## Actual code and tests

Added `scripts/consolidation/compare-donor-pr-patches.mjs` and `scripts/tests/compare-donor-pr-patches.test.mjs` to existing draft PR #471 (implementation commit `af1fcb67e571708be10af8cda0947c2f6664a396`, test commit `379ccf0dd703912e494c4a0e6ddf8a88ddf921ab`). This is a source-recovery utility, **not** payment runtime code.

The utility checks complete changed-file inventories, exact modified-file paths, complete GNU-diff-style hunk shape, old/new line counts, GitHub additions/deletions, normalized hunk context and multiplicity. Missing binary/truncated patches, unknown rename/add/remove operations, omitted file-list pages and different contexts fail closed. The output explicitly cannot establish whole-branch equivalence, approval, or merge status.

Eight analogous local Node 22 regression tests against the staging implementation completed **8 passed / 0 failed**. The published code has an independently authored but matching regression scenario set; native repository checkout/exact committed Node execution was unavailable because `git ls-remote` cannot resolve `github.com`. Hosted exact-head CI and direct execution of committed files are pending, not counted as passed. No full app TypeScript/lint/browser/payment suite was run locally.

## Previously unresolved retired branch `dependabot/github_actions/actions-b9ade1236b`

- Git history preserved at `199ab7ef1e80e6368fdc17c09b94c87a62871861`, parent `5467c158069c5bab264b6a653ac56e89e13f3e13`. Git ref is deleted, but its commit and five changed-file patches remain accessible.
- Actual donor change: three occurrences of `actions/setup-python@ece7cb06caefa5fff74198d8649806c4678c61a1` -> `@6d4fd22b20465ccc0f7354476588e8df7c9ca0e0` (v6.3.0 to 7.1.0), plus two occurrences of `peter-evans/create-pull-request@22a9089034f40e5a961c8808d113e2c98fb63676` -> `@3ffccacd46053766916f087ce41d627c0b8cf2d1` (v7 to v8.1.3).
- Active owner: [PR #492](https://github.com/djshellshoxxx/GhostPay/pull/492), exact source head `592b99417039b7bba588235c40418f368f09ebb4`, open and not merged. All **five donor file patches** were matched by changed filename and identical context-bearing hunks in PR #492's five changed files. `ci.yml`, `contract-analysis.yml`, `nightly.yml` have 1/1 matching hunks each. `ghostpay-codex-cloud.yml` and `ghostpay-parallel-review.yml` have 1/2 matching hunks each because PR #492 additionally updates `openai/codex-action` in those same files. Total **5/5 donor hunks present**, 2 additional owner-PR hunks.
- GitHub commit and PR changed-file APIs each returned exactly five files; there was no 300-file compare truncation for this source proof. The exact changed lines and surrounding context were compared; whole-file Git blob SHAs were *not* the same across different bases, and whole-tree equivalence is **not** claimed.
- **Disposition:** retired donor is `superseded-by-identical-owner-pr-hunks`. Its edits are no longer an independently unowned recovery task, but remain **unintegrated in protected main** until PR #492 passes its checks and qualified review. Do not cherry-pick this donor or consider PR #492 merged.
- The other retired dependency branch `dependabot/npm_and_yarn/npm-minor-patch-71cdd1547c` has broader unique historical code/test changes and is **not** finalized by this investigation.

## Ownership and integration

The dedicated BUG-only owner retains new PRs #519 and #520; recovery/refund/key-export owners retain their paths. Existing C1 #504, invoice #274/#515, and other scoped workers remain owner-held. The integration lock at `082e754f44944ebb4be283f89176b966bf8f7b4f` is generation 12, **released**. Branch protection read returned HTTP 403, not evidence that controls are absent. No main merge authorization, independent approval, release, deployment, private-key operation or real-funds testing is claimed. This cycle reduces a *retired duplicate donor obligation*, not the number of unmerged PR implementation obligations.
