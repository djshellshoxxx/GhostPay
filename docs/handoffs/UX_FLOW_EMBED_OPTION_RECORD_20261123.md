# GP-BUG-11 — Embed snippet malformed option-record rejection

Date: 2026-11-23 UTC. Scope: one existing-functionality runtime error in `packages/ux-flow/src/embed.ts`; no feature, contract, network or deployment change.

## Baseline and ownership

- Live `main`: `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Branch: `automation/20261123-r11/bug/ux-flow-embed-option-record`; original production source Git blob: `ee2196c92e11dbaed03528e3ecbc751812c075d7`.
- Read `AGENTS.md`, `docs/ai/WORKFLOW.md`, `docs/ai/HANDOFF.md`, `docs/ai/ACTIVE_WORK.md`; appended own ownership claim without changing earlier entries.
- Queried 254 then-open PRs across three paginated GitHub API pages. Checked their paginated changed-file inventories: no PR included `packages/ux-flow/src/embed.ts` or new `packages/ux-flow/src/embed.options-shape.test.ts` at scan time. Existing work by other owners was untouched; recheck this inventory before future integration.
- PR #390: exact HEAD `b655bc273a6704c9c140287b8adcdf4085b91882`; CI, Pages, Beta acceptance, Hosting kit and CLI qualification workflow runs completed successfully, including Pages browser verification. Snyk commit status success. Submitted independent reviews: zero. Its branch was not edited and PR was open, not draft.
- Durable integration lease: `refs/heads/automation/ghostpay-integration-lock` HEAD `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79`; lock JSON says `held`, generation 11, owner `994a0d214fb9-root-r3`. Historical expiry does not establish authorization to acquire it. No lock write or merge.

## Confirmed reproduction

`makeSnippet(link, appOrigin, opts)` documents typed `FlowError('BAD_OPTION')` on invalid options, but starts with `Object.keys(opts)`. Runtime `opts = null` throws native `TypeError: Cannot convert undefined or null to object`. Numbers, booleans and arrays silently pass the option-container validation and generate default snippets. Inputs can originate outside TypeScript at runtime.

Using source fetched at the exact baseline Git blob, executed the `makeSnippet` function body after mechanical TypeScript type-erasure, with stable valid-link/URL stubs so only options validation and generated snippet output were under test. Red 10 directed checks: **6 passed, 4 failed** (null `TypeError`; numeric, boolean and array unexpectedly accepted). This is source-derived V8 execution, not full-package compiled TypeScript or local Vitest.

## Regression-first repair and evidence

1. Ownership claim commit: `3ac38482cc1fdfde96f7843a8904cdc942d2610d`.
2. Failing regression first: `b41658f06022cdf8a8f0e64f0745cd9820c27dd5`, new `embed.options-shape.test.ts`, malformed containers plus valid-option controls.
3. Production repair: `efc1ee1e96f14621484cd96eba25b5c35de3c058`. One guard rejects `null`, primitives and arrays with existing `BAD_OPTION` before `Object.keys`; existing valid options, markup, escaping and link behavior untouched.
4. Test-correction commit: `5d812ec3a23725f26db7237a5eb455254da29b05`. Loops through invalid option values so the empty array is supplied as one value, not flattened by parameterized test-table semantics.
5. Final repaired production Git blob: `bd660f9394643ebb3d07c939ca922797fc491035`. Removing exactly the one-line guard from the repaired blob content reproduces the entire original production source verbatim.

After repair the same 10 source-derived directed/neighbor checks passed: null, number, boolean, array, unknown key, invalid variant, invalid label, default options, empty options record and customized valid output including escaping, fallback and stylesheet. No runtime network, wallet, funds, keys, contracts or deployment were touched.

## Qualification and gates

- Node repository checkout: not available in this runtime (`git ls-remote` failed with GitHub DNS resolution). Full repository Vitest, typecheck, lint, workspace build, browser/E2E and source package coverage were **not run locally**.
- Hosted GitHub Actions on final draft PR head: **must complete and be independently checked** before any merge. An in-progress or missing check is not green.
- A genuine separate independent reviewer: **not available in this run**. No self-review is represented as independent approval.
- Exact-head CI green, applicable native browser verification, independent review, no competing owner changes, reconciled current-main compatibility and legitimately held/released integration lease are all required before merging. Leave PR draft and unmerged otherwise.

## Next bug-only cycle

First re-read live main, #390 exact head/actions/reviews, this draft PR exact head/actions/reviews, current open PR filenames and generation-11 integration lease. Resolve observed CI/test failures only on owned path; request genuine independent review where available. Select a separate unowned existing-functionality bug for the next isolated regression-first repair. No deployment or release.
