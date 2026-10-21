# Stryker killer tests: adoption status

Source: `docs/remote/assurance/stryker-killers/` (written against scratch copies, see [stryker.md](./stryker.md)). The files in that directory are kept as the original record; the adopted copies live in each package.

| Killer file | Adopted as | Notes |
|---|---|---|
| `core-crypto.killers.test.ts` | `packages/core-crypto/src/core-crypto.killers.test.ts` | new test file, no source edit |
| `invoice-schema.killers.test.ts` | `packages/invoice-schema/src/invoice-schema.killers.test.ts` | new test file, no source edit |
| `policy-scheme.killers.test.ts` | `packages/policy-scheme/src/policy-scheme.killers.test.ts` | new test file, no source edit |
| `chain-adapters.killers.test.ts` | `packages/chain-adapters/src/chain-adapters.killers.test.ts` | new test file, no source edit |
| `btc-silent-payments.killers.test.ts` | `packages/btc-silent-payments/src/btc-silent-payments.killers.test.ts` | new test file, no source edit |
| `relayer-guard.killers.test.ts` | `packages/relayer-guard/src/relayer-guard.killers.test.ts` | one assertion updated: `retryAfterMs()` while half-open with a probe in flight is now a nonzero floor (audit M-4 fix), was `0` when the killer was written |
| `secret-box.killers.test.ts` | `packages/secret-box/src/secret-box.killers.test.ts` | unchanged |
| `relayer-app.killers.test.ts` | **not adopted** | `apps/relayer` is owned by another swarm; copy the file into `apps/relayer/src/` and fix its types/lint there (19 tests) |

Changes made while adopting (tests only): type annotations and narrowing so the files pass `tsc` and the repo's strict `eslint`; no assertion was removed or weakened and no test was skipped.

Not done: the mutation scores in `stryker.md` were **not re-measured** after adoption. Stryker is not installed in the repo, and the report (finding T1) says `@stryker-mutator/vitest-runner@10.0.0` runs zero tests with the repo's `vitest@5.0.5`, so a re-run needs the scratch setup with `vitest@4.1.x`. The scores in `stryker.md` therefore remain those measured on the scratch copies. The relayer-guard and secret-box sources changed after those measurements (audit round fixes), so their numbers may differ.
