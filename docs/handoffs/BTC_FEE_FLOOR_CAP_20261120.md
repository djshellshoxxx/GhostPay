# GP-BUG-12 — fail closed on incompatible Bitcoin fee-rate cap and minimum

Date: 2026-11-20. Owner: independent GhostPay engineering continuation.
Branch: `automation/20261120/bug/btc-fee-floor-config`. Frozen current-main base: `aa3df1cb37274fae73af0ca957183c15c51b62d3`.

## Provenance / nonduplication

- Confirmed audit finding: `docs/notes/bugcheck-2026-11-19/FINDINGS.md`, GP-BUG-12; `details/chain-contracts.md`, CC-03.
- The exact `packages/metadata-hardening/src/btc.ts` blob `6f89002a040cd4d35f506a09a42d2d1f50a93982` is shared by main and checked candidate heads #307 (`2876b7db`), #278 (`417f7c71`), and #264 (`bf510471`). None contains this fix.
- Existing main test `btc.test.ts` retains all original controls; the new regression uses a separate filename to avoid changing owned test files.
- There were no GitHub PR search hits for GP-BUG-12 or Bitcoin fee normalization at the time of work.

## Test-first commits

1. `77200f560577294a305132ae5fbe8446f259497e`: new `packages/metadata-hardening/src/btc.fee-policy.test.ts` tests impossible `minRate=1, cap=0.8`, invalid explicit caps (0, negative, NaN, infinities), and valid cap/round-up fallback.
2. `00795f318c7975e5ca5bb98cf30a13e01876eabb`: source repair. Validate supplied cap as finite and positive, reject cap below minRate as `POLICY_REJECTED`, refuse nonfinite normalized outputs, preserve previously supported finite clamp-to-cap when cap >= minRate and the unrounded input is within cap.

Final file blob pins before handoff:
- `btc.ts`: `88baf602d4dc0f17425509ac6a050b74fd1cae24`.
- `btc.fee-policy.test.ts`: `cd20187e69cb539651de65dc55d1deebd18c3147`.

## Scope and qualification limitations

- This is exported optional Bitcoin testnet PoC helper/API correctness, not evidence of a current lean Pages fund-loss exploit.
- No changes to chain/network guards, contracts, key custody, fees charged by GhostPay, wallet signing, browser privacy controls, dependencies, CI workflows, or release configuration.
- The tests-only source is expected to fail the new incompatible-policy assertions; **repository Vitest, lint, typecheck, build and hosted CI have not executed in this coordinator environment**. Do not call this PR green before exact-head CI and separate source/test review.
- No main merge, release, deployment, live RPC, wallet use or funds transfer.

## Next qualification / integration

1. Run `npm --workspace @ghostpay/metadata-hardening test`, `typecheck`, `lint`, `build` with the repository lockfile, and evaluate exact-head hosted CI. Verify tests-only expected RED and final GREEN.
2. Recheck the current main blob and overlapping PR heads. Merge this isolated feature only if the current source is still compatible and qualification passes.
3. Preserve branch-census tracking in #330. Do not reclassify its 138 candidate branches as unique implementations without exact-head semantic/patch-equivalence comparisons.
