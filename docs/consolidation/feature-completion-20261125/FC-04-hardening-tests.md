# FC-04: hardening regression tests and receipt follow-ups

Worker fc02 (continuing as the FC-04 implementer), branch `claude/fc04-hardening-tests-20261125`, base `origin/main` `595a184b381980a440165832f51a83e8dfd3e8a8`. Local only until the coordinator approves a push. Experimental, testnet only, not audited.

## 1. Recovered regression tests (donor #271)

Donor: `origin/integration/ghostpay-adapter-qualification-20261119` head `429a4de80b9ec53177b17d89d18ce8ec91a08814` (merge base with main `8f56376427c96881f49590920ff0bf8543ec81b4`). The donor diff touched seven files in `packages/chain-adapters` and `apps/web/src/features/tron`.

| Donor hunk | State on main | Action |
|---|---|---|
| `quote.test.ts` "refuses an absurd price.decimals" (2**31 and -1) | missing; the source bound already exists | recovered verbatim |
| `tron/chain.hardening.test.ts` incomplete-page case and strict-range genesis assertion | present, with main's later adaptation (`checkNetwork(..., 'local')`) | none; main kept |
| `tron/fixtures.testutil.ts` full-range block fixture | present | none |
| `deployments.test.ts`, `rpc.test.ts`, `deployments.ts`, `rpc.ts` | main is ahead | not recovered, per instruction |

## 2. Receipt follow-ups (`docs/engineering/SECURITY_FINDINGS.md`)

- RCPT-L1: the throwing-proxy test now returns `undefined` for `then` and counts guarded reads, so the proxy actually reaches the property-read guard (the old `then` trap rejected the async lookup before verification read it).
- RCPT-L2: `verify.ts` snapshots `status`, `facts` and each fact field once. Two new tests were written first: one counts reads per accessor (each must be exactly one), one uses a getter whose value changes after the first read.

## Commands and outcomes

All heavy commands ran through the mutex; free RAM at the job start was 332 MB.

- Red run of `src/verify.accessor-boundary.test.ts` against the unfixed `verify.ts`: 2 failed (both RCPT-L2 tests), 9 passed.
- After the fix: `npm test` in `packages/ux-receipts`: 7 files, 164 tests passed; coverage 99.75% statements, 98.29% branches, 98.07% functions, 99.68% lines (thresholds unchanged and not reported as failing).
- `npx tsc -p tsconfig.json --noEmit` and `eslint` in `packages/ux-receipts`: no errors after a first attempt failed on a type narrowing and two unnecessary assertions, fixed in `verify.ts`.
- `npx vitest run src/quote.test.ts --coverage=false` in `packages/chain-adapters`: 23 passed.
- The Tron hardening test file was not changed, so it was not run.
- The RCPT-L1 case was not run against the old trap; its assertion `guardedReads > 0` is what makes it non-vacuous.
- Not run: whole-repo suites, hosted CI.
