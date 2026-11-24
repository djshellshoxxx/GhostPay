# BUG-ONLY handoff — hygiene bufferDust runtime bigint validation (2026-11-22)

## Scope and source pins

- Repository: `djshellshoxxx/GhostPay`; branch: `automation/20261122-r11/bug/hygiene-bufferdust-runtime-types`.
- Live `main` observed before work: `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Instructions inspected on that main: `AGENTS.md@c7260f4fc81c572ac9787d8325e54463b8fcb35a`, `docs/ai/WORKFLOW.md@37f625bb62b2b2479a0492495abbf34f55fee943`, `docs/ai/HANDOFF.md@95a9c272dc6019697a72db088b717fa0d271dc84`, `docs/ai/ACTIVE_WORK.md@7c88f2618257fcfc8b62555343221f6813e98e65`.
- Additive branch-only ownership claim commit: `a923d3aafe88f72b3c6c1b910108e191515efd5a`.
- Failing regression committed BEFORE source repair: `0dfa3569a528b9f55d09df5002cd02ac50f82713` (`packages/hygiene/src/buffer.runtime-types.test.ts`).
- Minimal source repair committed afterward: `7d53f7280044b9cdf06aadd0c781755aacda4d1d` (`packages/hygiene/src/buffer.ts`).
- Baseline source blob `buffer.ts@b315a0c8feb0325bf16bd495b764f5c559da4494`, companion `errors.ts@bd65796a7d14831d16aadd57f7009428b5d8bfef`; repaired source blob `buffer.ts@b76f9235ccc9095c6538e6e97a8250db74072d37`.

## Confirmed defect and root cause

The exported `bufferDust(paid, gasUsed, effectiveGasPrice)` checked input sign but **not runtime bigint type**, despite its API using bigint amounts and the package's typed `HygieneError('INVALID_INPUT')` contract. JavaScript relational comparisons coerce untyped values: `bufferDust(false, 2n, 3n)`, `bufferDust(NaN, 2n, 3n)`, `bufferDust(null, 2n, 3n)` and `bufferDust(undefined, 2n, 3n)` returned `0n` as if dust were exhausted. Numeric/string `paid` values and malformed `gasUsed`/`effectiveGasPrice` yielded native `TypeError` instead of `HygieneError`. These are concrete observable source/runtime failures, not a claim of live on-chain exploit.

Minimal repair: reject any non-bigint among the three parameters using existing `fail('INVALID_INPUT', 'non-bigint amount')` before comparisons/multiplication. Existing negative-bigint errors, valid subtraction and zero-floor behavior are preserved. No external dependencies or app policy changes.

## Observed verification (explicitly scoped)

- Exact original and fixed source texts reconstructed and verified by `git hash-object` against the GitHub blob hashes above. Companion `errors.ts` blob also matches.
- TypeScript 5.8.3 standalone compilation of these two extracted files with NodeNext module resolution passed both before and after repair.
- Node.js 22.16.0 source-matched **20-assertion** runtime replay: **12 failures / 8 passes before**, **20 passes / 0 failures after**. Invalid cases include number, string, boolean, NaN, Infinity, null, undefined, malformed gas and malformed price; neighboring checks include exact bigint arithmetic, a zero floor, and three typed negative-bigint errors.
- Regression is committed in Vitest form but **repository Vitest was NOT executed locally**. Full workspace lint, typecheck, build, browser runtime checks and independent review were **NOT** executed locally. Hosted GitHub Actions on the FINAL draft-PR head must qualify these gates. The standalone Node replay is not a substitute.

## Ownership, external dependencies and held integration lease

- At selection, inspected changed-file inventories of **all 238 then-open PRs** across three GitHub pagination pages. None touched `packages/hygiene/src/buffer.ts` or the dedicated `packages/hygiene/src/buffer.runtime-types.test.ts`. Existing shared `buffer.test.ts` was deliberately left unchanged. PR #372 claims `packages/hygiene/src/ledger.ts`, so its path was avoided.
- Live PR [#390](https://github.com/djshellshoxxx/GhostPay/pull/390) at `b655bc273a6704c9c140287b8adcdf4085b91882`: exact-head CI, Pages, Hosting kit, Beta acceptance and CLI qualification completed successfully. All returned relevant browser/web tests succeeded. Submitted independent GitHub review count **0**. The branch is owned by a different worker and was left untouched.
- The integration metadata ref `automation/ghostpay-integration-lock` at `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79` has status `held`, generation 11, owner `994a0d214fb9-root-r3`. Recorded expiry passed, but do NOT treat this as a release, ownership transfer or merge authorization.
- No PR merged, no lock modified, no deployment/release/contract/fund interaction and no external traffic attack.

## Outstanding gates and subsequent handoff

1. Check the final draft PR's exact head; wait for all required hosted CI, native browser (if applicable) and static build/test qualification. Repair only reproducible failures in owned paths.
2. Obtain genuinely independent reviewer verification; coordinator self-review alone does not qualify merge.
3. Recheck current main, branch ownership, changed-file inventory, PR dependencies and the integration lock before **any** integration. Do not overwrite PR #390, #372 or any other worker's paths.
4. Keep this task BUG-ONLY; later rounds should rotate to a different unowned existing-functionality defect.
