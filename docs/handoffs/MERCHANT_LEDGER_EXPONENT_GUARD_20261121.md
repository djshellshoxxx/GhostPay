# GhostPay merchant-ledger — invalid formatting precision guard (2026-11-21)

## Scope and provenance
- Isolated branch: `chatgpt/ghostpay-ledger-exponent-guard-20261121-0313`.
- Exact starting main: `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Ownership claim: `e3142dcfcf846a2d36756c688d624a6ac706a6bb`.
- Test-first regression: `a54f49c4075c3cfc3c6d141c3d18e14161dcbf8e`.
- Production correction: `04a3bc887e8811797e4c64867c8909d76e6f062a`.
- Owned product paths: `packages/merchant-ledger/src/decimal.ts`, `packages/merchant-ledger/src/ledger.test.ts`.
- No independent worker or GitHub review, integration lock takeover, deployment, release, or funds operation.

## Root cause and change
The public `formatMinor(minor, exponent)` helper formatted money without validating `exponent`. Invalid negative, nonintegral, nonfinite and out-of-protocol values could produce incorrect decimal placement or untyped runtime errors. The exported `currencyExponent` helper already enforces integer 0..18 for validated currency overrides. `formatMinor` now applies the identical bounds up front and throws the existing typed `LedgerError('bad-exponent')`, without changing any valid formatting or GhostPay's signed currency-minor-unit policy.

The new dedicated Vitest case rejects negative, fractional, nonfinite, oversized and unexpected JS runtime exponents, and confirms ordinary integer/negative amount formatting at precision 0 and 18.

## Actual verification
- Before the source fix, a **source-equivalent** Node 22 reproduction of the current-main `formatMinor` failed the expected typed-refusal assertion for exponent `-1`. This demonstrates the defect, not a run of repository Vitest.
- After the fix, a **source-equivalent** Node 22 harness passed 127 assertions: ten malformed precision inputs; six representative bigint amounts across every precision from 0..18 (114 combinations); three explicit boundary formatting checks. This is a transcription of the final helper, not a checkout or a package test.
- Repository checkout cannot be performed from the local container because `github.com` DNS lookup fails. Therefore **actual repository Vitest, typecheck, lint, build, full E2E, and security checks were not executed locally**. Hosted exact-head CI must qualify the committed code.
- No behavior was added to production payment flows. No direct exploit or funds-loss claim is made.

## Integration dependencies
- The original held integration lock is on `automation/ghostpay-integration-lock`, generation 11, owner reported as `994a0d214fb9-root-r3`. Expiration does not permit takeover. Main integration is explicitly blocked until current ownership is reconciled under repository rules.
- No exact-path claim was found in the main `docs/ai/ACTIVE_WORK.md` at the starting SHA; a scoped open-PR search revealed no existing `formatMinor` repair. Recheck current branches and PR diffs before promotion.
- Obtain an independent source review, hosted exact-head merchant-ledger tests, typecheck, lint, build and required CI checks. Validate main has not adopted an overlapping fix. Promote by qualified PR merge only when integration ownership and repository requirements are satisfied.

## Next work
1. Inspect exact PR head and hosted job status. Repair any failing test or lint in the isolated branch.
2. Independently review the guard and preservation of the existing fiat 0/2 signed invoice model.
3. If CI, approvals, conflicts and ownership gates all clear, merge and verify code on main; otherwise leave draft with blocker.
