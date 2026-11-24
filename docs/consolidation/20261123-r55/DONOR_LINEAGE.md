# R55 historical security donor lineage — immutable non-integration finding

Checked November 23, 2026 UTC, during R55 consolidation. These comparisons are **source-history triage**, not successful payment/recovery acceptance or main integration.

## Parent/child relationship

* Historical, PR-unassociated ancestor: `claude/gifted-planck-115x2k` at `1d28f24d86f40c7af5d4187f5d0b3b0d0bf79c78`.
* Descendant: `codex/ghostpay-security-audit-20261030` at `63994db6cff8b3b3ca698427eee9e95904230546`.
* GitHub immutable compare `1d28f24d...63994db6` reports **ahead 1, behind 0**. Its only changed paths are `apps/relayer/src/secrets.test.ts` (new), `apps/relayer/src/secrets.ts` (modified), and `docs/audits/25-security-triage-2026-10-30.md` (new).
* Both recursive Git trees were returned with `truncated=false`, containing 3,182 blobs in the ancestor and 3,184 in the descendant. These historical refs are distinct from current protected main `eb59d93cffed7848c4aac37d0e9650b87239c6da`.

GitHub compare of main against the older ancestor reports 4 commits ahead and 1,385 behind, touching 12 paths. The descendant is one security-audit commit further. The historic source differs substantially from the modern browser beta; in particular, `apps/web/src/lib/sweep.ts`, `apps/web/src/lib/txGuard.ts`, `packages/chain-adapters/src/rpc.ts`, and `packages/chain-adapters/src/errors.ts` have different current-main blob SHAs. Some security ideas have stronger current-main equivalents, but complete functional redundancy **has not been proven**.

**Disposition:** both ancestor and descendant remain semantically unresolved and unmerged. There is no justification for wholesale cherry-picking old relayer/browser code over newer main. Investigate any concrete nonduplicated regression before a narrow recovery candidate; do not erase the historical refs or imply that descendant ancestry constitutes main integration. Relayer-specific secret loading is outside the static Pages beta scope and should not be added as a hosted custody dependency.

## Concurrent branch deletions — preserved historical obligations

The current complete live census found two R54 branches absent:
* `dependabot/github_actions/actions-b9ade1236b` last seen `199ab7ef1e80e6368fdc17c09b94c87a62871861`, corresponding to **closed, unmerged PR #207**.
* `dependabot/npm_and_yarn/npm-minor-patch-71cdd1547c` last seen `3c95b2a00bdcfb45dd36242ff40c133dd19d1811`, corresponding to **closed, unmerged PR #210**.

GET `/git/ref/heads/<branch>` returned HTTP 404 for each, and both were absent from the complete independent `matching-refs/heads/` census. The R55 ledger preserves each prior SHA and unresolved disposition in `retiredHistories`; **their disappearance does not prove dependency changes shipped or qualify a final disposition**.

## Consolidation ledger code change

Test-first commit `9832fe71b09127af13ea1a46e357f8d2eddd740a` exercises deletion preservation, identity and HTTP 404 evidence. Implementation `cdd9e86f4209472c5d9650506deb3d8bf3a4fed8` validates tombstones, prevents silent history loss across checkpoint transitions, and introduces an explicit global unresolved total that counts still-unresolved deleted histories. Earlier test-first `eabe1f073c814068dd4b896030283b19be99ed68` and implementation `88c2dc5ac80564ab0c4845740556af1bfee2d8e5` permit same-cycle finalized audit-only new branches **only with immutable source proof**. Native hosted CI is required on the exact resultant head; no standalone checkout was possible in the executor.
