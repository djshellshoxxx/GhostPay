# FC-04: hardening regression tests and receipt follow-ups

Worker fc02 (continuing as the FC-04 implementer), branch `claude/fc04-hardening-tests-20261125`, base `origin/main` `595a184b381980a440165832f51a83e8dfd3e8a8`. Local only until the coordinator approves a push. Experimental, testnet only, not audited.

## 1. Recovered regression tests (donor #271)

Donor: `origin/integration/ghostpay-adapter-qualification-20261119` head `429a4de80b9ec53177b17d89d18ce8ec91a08814` (merge base with main `8f56376427c96881f49590920ff0bf8543ec81b4`). The donor diff touched seven files in `packages/chain-adapters` and `apps/web/src/features/tron`.

| Donor hunk | State on main | Action |
|---|---|---|
| `quote.test.ts` "refuses an absurd price.decimals" (2**31, -1, and in a follow-up commit 31, 1.5, NaN) | missing; the source bound already exists | recovered verbatim |
| `tron/chain.hardening.test.ts` incomplete-page case and strict-range genesis assertion | present, with main's later adaptation (`checkNetwork(..., 'local')`) | none; main kept |
| `tron/fixtures.testutil.ts` full-range block fixture | present | none |
| `deployments.test.ts`, `rpc.test.ts`, `deployments.ts`, `rpc.ts` | main is ahead | not recovered, per instruction |

## 2. Receipt follow-ups (`docs/engineering/SECURITY_FINDINGS.md`)

- RCPT-L1: the throwing-proxy test now returns `undefined` for `then`, records the property names the trap sees, and asserts `status` was among them. `status` is read only by verification itself, so the assertion fails if the `then` line is removed (the promise machinery would then reject the lookup early and `status` would never be read). Counting all reads alone would not guarantee this.
- RCPT-L2: `verify.ts` snapshots `status`, `facts` and each fact field once. Two new tests were written first: one counts reads per accessor (each must be exactly one), one uses a getter whose value changes after the first read.

## Commands and outcomes

All heavy commands ran through the mutex; free RAM at the job start was 332 MB.

- Red run of `src/verify.accessor-boundary.test.ts` against the unfixed `verify.ts`: 2 failed (both RCPT-L2 tests), 9 passed.
- After the fix: `npm test` in `packages/ux-receipts`: 7 files, 164 tests passed; coverage 99.75% statements, 98.29% branches, 98.07% functions, 99.68% lines (thresholds unchanged and not reported as failing).
- `npx tsc -p tsconfig.json --noEmit` and `eslint` in `packages/ux-receipts`: no errors after a first attempt failed on a type narrowing and two unnecessary assertions, fixed in `verify.ts`.
- `npx vitest run src/quote.test.ts --coverage=false` in `packages/chain-adapters`: 23 passed.
- The Tron hardening test file was not changed, so it was not run.
- The RCPT-L1 case was not run against the old trap (the reasoning above is by inspection).
- Not run: whole-repo suites, hosted CI.

## Follow-up commit (review N1 to N3)

- Strengthened the RCPT-L1 and RCPT-L2 tests (status read asserted; exact 7-accessor read set; `chain.status === confirmed`), extended the quote decimals case with 31, 1.5 and NaN, and marked RCPT-L1/L2 fixed on this branch (pending integration, not merged) in `SECURITY_FINDINGS.md`, `REMAINING_WORK.md`, `FEATURE_INTEGRATION_LOG.md`.
- NOT RUN after this commit: two attempts to run `npm test` (ux-receipts), tsc, eslint and the quote test were skipped by the RAM guard (free RAM 236 MB and 275 MB, below 300 MB). The earlier results above are for the previous commit only.
