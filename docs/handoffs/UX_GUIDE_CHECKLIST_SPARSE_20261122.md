# GhostPay BUG-ONLY — sparse pre-send checklist arrays (2026-11-22)

## Repository and source pins

- Live `main` before this cycle: `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Isolated task branch: `automation/20261122-r12/bug/guide-sparse-checklist` (never merged or deployed).
- Instructions verified on that main: `AGENTS.md@c7260f4fc81c572ac9787d8325e54463b8fcb35a`, `docs/ai/WORKFLOW.md@37f625bb62b2b2479a0492495abbf34f55fee943`, `docs/ai/HANDOFF.md@95a9c272dc6019697a72db088b717fa0d271dc84`, `docs/ai/ACTIVE_WORK.md@7c88f2618257fcfc8b62555343221f6813e98e65`.
- Baseline source: `packages/ux-guide/src/checklist.ts` Git blob `7e237b6cfe876c7956a57fced0978a036373afa2`.
- Repaired source: `packages/ux-guide/src/checklist.ts` Git blob `cc165b1ec1ed2dd41aab3394d885c69e9e6eddda`.
- Claimed paths (additive registry first): `3f8ee2c3ae11716df81357a8ec287eed5aaf211c`.
- Failing regression committed **before** production change: `7f9cfcb8fec93715f7997f81117c8a2cfadd5077`, new `packages/ux-guide/src/checklist.sparse.test.ts`.
- Minimal two-site production fix: `7e434629cea66b70d0c498680858cf40c4a1637d`.
- No existing tests, wallet sources, contracts, fee logic, dependencies, build profiles, release configs or deployment scripts modified.

## Confirmed failure and root cause

`evaluateChecklist` advertises fail-closed `input_invalid` for malformed host inputs, but `validInput()` used `Array.every` over runtime safety lists. Because `every` skips absent indexes in sparse JavaScript arrays, it accepted arrays containing holes in `knownAddresses`, `wallet.ownAddresses` or `acknowledged`. A sparse `knownAddresses` list then reached `findLookalike`, whose `for...of` visits holes as `undefined` and can throw a native `TypeError` on `k.address`; other sparse lists could be silently accepted and produce a normal success result. This is a source/runtime correctness failure (synthetic inputs), not evidence of a reported production incident.

The new Vitest regression requires an `input_invalid` blocker for a single known-address hole, an interior known-address hole, a wallet-address hole and an acknowledgement hole. It also preserves clean dense arrays and invalid dense-record handling.

The entire production fix replaces two `.every()` calls with spread iteration `[...v].every()` / `[...ka].every()`. The spread iterator exposes absent slots as `undefined` to the existing validators, rejecting them before any downstream address inspection. No change to the validation contract for dense arrays.

## Observed verification and limitations

- A local Node.js 22.16.0 **source-equivalent control-flow excerpt** reproduced four failures out of six checks on baseline: three arrays with missing entries were accepted and lookalike iteration threw on a hole. Two dense valid controls passed.
- The revised iterator behavior passed **12/12 separate standalone Node checks** (sparse cases plus valid/empty/dense malformed controls).
- These replay tests are **not exact full-file Git-blob-matched execution** and are **not repository Vitest**. Native GitHub checkout was unavailable in the local executor because GitHub DNS failed; no local repository Vitest, typecheck, lint, build, GitHub Pages native-browser or separate verifier run is claimed.
- GitHub hosted CI must exercise the committed test against the actual PR head; inspect and repair any exact-head failures in the task-owned paths, retaining red-test-before-fix history.

## Ownership and gates

- A full live snapshot of **239 open PRs**, fetched across three GitHub pages, was reconciled against paginated changed-file lists for each PR before edits. **No PR owns `packages/ux-guide/src/checklist.ts` or `packages/ux-guide/src/checklist.sparse.test.ts`**. Other `ux-guide` work: PR #451 owns `profiles.ts`/its tests; PR #429 owns `onboarding.ts`/its tests. Both were avoided.
- PR [#390](https://github.com/djshellshoxxx/GhostPay/pull/390): exact head `b655bc273a6704c9c140287b8adcdf4085b91882`, five hosted workflow runs `CI`, `Pages`, `Hosting kit`, `Beta acceptance`, `CLI operator qualification` all completed successfully; 39 check runs returned: successful core CI/browser/build checks, expected skipped deploy/smoke checks. **No submitted independent review**. Its owner branch was left unchanged.
- Shared metadata-only integration-lock branch `automation/ghostpay-integration-lock` head `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79`, `integration-lock.json@97523a9ce00231ac883b32178ab48a547eb0dd8f`: `held`, generation 11, owner `994a0d214fb9-root-r3`. The recorded expiry passed, but this does **not** confer ownership or authorization to merge.
- No independent verifier available; self-review is not an independent gate. No merge, lock takeover, fund interaction, real traffic attack, deployment or release.

## Remaining exact-head qualification

1. Inspect draft PR final-head check-runs and hosted workflow statuses (tests, typecheck, lint, static build, Pages/appropriate browser verification). Do not label queued jobs as passed.
2. Repair any concrete source/test CI failures only on this isolated branch, preserving regressions and updating this handoff additively with new SHAs.
3. Obtain genuinely independent submitted review, recheck all PR owners and dependencies, and wait for legitimate integration-lock release or authorized handoff before any merge.
4. Continue the next BUG-ONLY cycle in a distinct unowned package/runtime path; avoid speculative hardening or feature work.
