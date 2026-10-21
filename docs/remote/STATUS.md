# Remote extensions: check status

Branch: `claude/remote-extensions-1`. Real numbers from local runs. Nothing skipped unless listed below.

## Packages and apps

| Package | Typecheck | Lint | Tests (pass / fail / skip) | Coverage: stmts / branch / funcs / lines |
|---|---|---|---|---|
| packages/core-crypto | pass | pass | 54 / 0 / 0 (7 files) | 98.95 / 98.01 / 100 / 98.75 |
| packages/invoice-schema | pass | pass | 174 / 0 / 0 (7 files) | 99.36 / 99.27 / 100 / 99.48 |
| packages/chain-adapters | pass | pass | 216 / 0 / 0 (10 files) | 98.45 / 98.45 / 95.87 / 99.5 |
| packages/btc-silent-payments | pass | pass | 299 / 0 / 0 (18 files) | 97.71 / 95.82 / 98.5 / 99.4 |
| packages/policy-scheme | pass | pass | 53 / 0 / 7 (4 files, 1 skipped) | 98.06 / 95.89 / 100 / 99.67 |
| apps/relayer | pass | pass | 192 / 0 / 1 (5 files, 1 skipped) | 98.36 / 96.28 / 99.33 / 98.93 |
| apps/web | pass | pass | 320 / 0 / 0 (29 files) | 95.64 / 91.51 / 92.5 / 97.47 |

Test counts are vitest totals. Coverage is vitest v8 `All files` row.

## Contracts (packages/contracts)

- `forge test`: 18 suites, 368 passed, 0 failed, 0 skipped. Runtime ~69s.
- `forge fmt --check`: FAIL. 3 files need formatting:
  - `test/echidna/EchidnaRouter.sol`
  - `test/echidna/EchidnaSweep.sol`
  - `test/echidna/EchidnaPolicy.sol`

## Failures

- apps/web, before build (typecheck, lint, test all failed): workspace packages resolved via `dist`, which was not built. Errors:
  - typecheck: `src/App.tsx(2,32): error TS2307: Cannot find module '@ghostpay/chain-adapters' or its corresponding type declarations.`
  - lint: `'RpcClient' is an 'error' type that acts as 'any'` (unresolved imports, cascade)
  - test: `Failed to resolve entry for package "@ghostpay/chain-adapters"`, 23 suites failed to load.
  - Fix: `npm run build:libs`. After that, apps/web typecheck, lint, and test all pass (table above shows post-build numbers).
- contracts `forge fmt --check`: see above. Not fixed (no source edits in this run).

## Skipped / not run

- `npm ci`: not run, `node_modules` already present.
- Nothing skipped for time. Longest step: contracts `forge test` (~69s), core-crypto tests (~60s).
- apps/web `test:e2e` (Playwright): not run, not in scope.
- `npm run build` (full): not run, only `build:libs` to produce `dist` for web.
- Pre-existing skips inside test suites: relayer 1 file skipped; policy-scheme 7 tests skipped.
