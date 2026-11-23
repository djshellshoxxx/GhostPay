# GhostPay BUG-ONLY R12 — reject sparse receipt canonical arrays (2026-11-22)

## Scope and immutable source pins
- Live `main` read from Git ref: `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Isolated branch: `automation/20261122-r12/bug/ux-receipts-canonical-sparse`.
- Claim commit: `cc5368135e200300ff6f8d4d59104c08c8ef29c4`; additive `docs/ai/ACTIVE_WORK.md`, preserving prior content.
- Test-first RED commit: `1f28da544ad249985579fba5df4b9741322423f3`; dedicated `packages/ux-receipts/src/canonical.sparse.test.ts`.
- Minimal source repair: `396da34e960de14d8c4bd33f4d75b5fe038fe0f8`; `packages/ux-receipts/src/canonical.ts`, one replacement expression only.
- Test-lint correction (not production change): `aac10005a5e939ef550645484f44b166f45010ed`.
- Original Git blob `8e2dbd7c57a292507309272b586c87d98c08b15d`; repaired blob `9c6f2f4780477c4a32773a3d4ec78659cd7e0f49`; `errors.ts` blob `730d536da677ca99e9031d87e0da46690abcac91`.
- README/contract: `canonicalJson` creates deterministic, parseable canonical JSON for receipt rendering and reproducible digest. Existing rules reject undefined, invalid numbers, non-plain objects and deep nesting.

## Confirmed failure, root cause, minimal repair
JavaScript `Array.prototype.map` skips missing array slots. `canonicalJson(new Array(1))` on exact unmodified main yields `[]`, identical to the empty array; `canonicalJson([1, , 3])` emits `[1,,3]`, which is invalid JSON. Nested sparse arrays exhibit the same defect; a digest of a sparse array can collide with an intended empty array at the canonical encoding layer. This is an existing exported-library correctness defect; no evidence of a currently exploitable real receipt or financial compromise is claimed.

The source change enumerates every array index using `Array.from({ length: v.length }, (_, i) => encode(v[i], depth + 1))`. Missing slots reach the existing unsupported-value branch and throw `ReceiptError('NOT_CANONICALIZABLE')`. Dense arrays retain their exact serialization. No new dependency, schema, public API or UI.

## Source-exact isolated runtime evidence — not repository Vitest
The original `canonical.ts` and `errors.ts` were manually copied from the authenticated GitHub connector; both local `git hash-object` results exactly matched the above Git blob SHAs. The repaired source copy also exactly matches the new Git blob SHA. Compiled both variants with globally installed TypeScript 5.8.3 and executed their JavaScript output on Node.js 22.16.0, without repository checkout, npm installation or network requests.

- RED: 6/10 checks fail against original exact source; one/two missing slots, middle/trailing slots, nested and deeply nested slots unexpectedly return strings. Four dense/empty/undefined/nested-valid checks pass.
- GREEN: 10/10 checks pass on repaired exact source.
- Additional GREEN: 2,500 deterministic dense JSON round trips, 325 different hole-length/position rejection cases, four neighboring cases (null-prototype object, explicit undefined, unsupported function and cycle) pass.
- The Vitest regression exists in the branch but **was not executed as repository Vitest**. Workspace lint, typecheck, build, native browser and full CI are **not locally executed**. Do not infer hosted CI success from isolated Node compilation.

## Ownership, coordination and merge gates
- Initial PR inventory: GitHub REST pages `100/100/44/0` = **244 open PRs** before publication. `list_pr_changed_filenames` checked every open PR, including oversized historical #238/#262/#264/#278/#372: **no direct edits** to the selected `canonical.ts` or new dedicated regression path. The broad historical PRs do modify `core.test.ts`, which was explicitly left untouched. This is a point-in-time path census, not proof against a concurrent later edit.
- PR #390 exactly at `b655bc273a6704c9c140287b8adcdf4085b91882` was rechecked: 5/5 hosted workflow groups successful; detailed check-runs included browser jobs and no failures; submitted independent GitHub reviews: **0**. PR is no longer draft but remains unmerged, and its branch was not modified. Its stacked integration #422 must be reconciled before any review/integration conclusion.
- The metadata-only lease branch `automation/ghostpay-integration-lock` is at `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79`: `integration-lock.json` blob `97523a9ce00231ac883b32178ab48a547eb0dd8f`, **held** generation 11 by a different coordinator. Expired timestamp is **not** authorization to acquire/release; do not change lock or merge.
- No genuinely independent verifier is available in this execution; sequential self-review is not an independent approval.
- Reinspect live main, PR changed files, reviews, required exact-head GitHub Actions and all browser artifacts immediately before integration. Leave PR draft and unmerged without independent review, valid lock ownership and all green checks.

## Handoff
Publish a focused draft PR to `main`, without moving another worker's branches. Observe hosted checks at the exact PR head; fix actual lint/code/test failures only in this owned branch. If no failure, leave outstanding CI/review gates explicit. Next cycle should select another unrelated, unowned existing defect after rechecking #390 and live ownership; do not stack unrelated fixes here. No traffic, wallet, funds, deployment, contract or release action was performed.
