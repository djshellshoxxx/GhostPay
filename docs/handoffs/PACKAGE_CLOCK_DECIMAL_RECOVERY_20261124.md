# Merchant-profile clock and payment-URI precision recovery — 2026-11-24

## Source and provenance

- Branch: `integration/package-clock-decimal-recovery-20261124`.
- Base: `84e5128dbe86d2061106e5e167e3272b5dee8958`.
- Qualified source commit: `c6f53413dc28a560e50cce75da3aedb5331b7d1f`.
- Qualified source tree: `14f9c87819cc54d98b2b2b8c1b87e96559e98980`.
- #268 donor: `ddfc8cfafa44b09103ced821f160c1d37fdfe552`, branch
  `automation/20261119T095600Z/bug/merchant-profile-clock`; retained as the
  second parent of merge `7708d081288067c0adb8a07464b509d83e6482c2`.
- #313 donor: `c48c9917708ea86ea1a82a9d5d44f3add9876c98`, branch
  `automation/20261120T0641Z/bug/payment-uri-decimal-options`; retained as the
  second parent of merge `c6f53413dc28a560e50cce75da3aedb5331b7d1f`.

Both complete original heads and all their commits, authorship, existing
regressions, claims, and handoffs are preserved. Ownership and acceptance were
recorded before code integration. Both merges conflicted only in
`docs/ai/ACTIVE_WORK.md`; `git merge-file --union` retained the claims, with no
base registry line removed. All four production/regression files exactly match
their respective donor blobs. No production or test conflict required editing.

## Resulting behavior

Merchant-profile verification rejects non-finite or negative caller clocks with
the existing `format` result before expiry evaluation. Existing valid-clock and
expired-profile behavior is preserved.

Payment-URI decimal parsing validates integer precision in the existing 0–77
domain before decimal arithmetic. Invalid options use the existing typed
`INVALID_AMOUNT` channel; valid decimal round trips are preserved. No format,
dependency, wallet, RPC, contract, or deployment behavior is added.

## Verification

The following checks executed against the qualified source commit above. This
handoff is the only subsequent change.

| Command | Result |
| --- | --- |
| `npm run build -w @ghostpay/invoice-schema -w @ghostpay/payment-uri` | Both passed. |
| `npm run typecheck -w @ghostpay/invoice-schema -w @ghostpay/payment-uri` | Both passed. |
| `npm run lint -w @ghostpay/invoice-schema -w @ghostpay/payment-uri` | Both passed. |
| `npm run test -w @ghostpay/invoice-schema` | 13 files and 730 tests passed; full coverage run, 165.20 seconds. |
| `npm run test -w @ghostpay/payment-uri` | 8 files and 233 tests passed; full coverage run. |
| `npm run ci:scan-secrets` | Passed. |
| Base-to-head `git diff --check` | Passed. |

| Package | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| invoice-schema | 98.09% (826/842) | 97.76% (568/581) | 100% (110/110) | 99.26% (674/679) |
| payment-uri | 97.55% (559/573) | 97.13% (542/558) | 100% (48/48) | 99.11% (446/450) |

All existing coverage thresholds passed without configuration changes. No new
test cases were written. The existing donor regressions ran as part of each
complete package suite; no vulnerable baseline was executed.

Environment: Node 24.22.3, npm 11.19.1, Vitest/coverage-v8 5.0.5,
TypeScript 5.9.3, ESLint 10.15.0. Third-party dependencies reuse the
coordinator's external installation. All 68 `@ghostpay` links point into this
isolated worktree, and both target packages resolve to their local build output.
The coordinator's 65 library output directories were copied locally before
rebuilding the two changed packages. Vitest caches are local to this worktree;
no other checkout's build output or cache was updated. npm emitted the existing
unknown `http-proxy` environment-setting warning; all commands exited zero.

## Optional quote-test disposition

The requested conditional #271 test recovery was inspected and omitted because
the behavior is already covered by
`packages/chain-adapters/src/quote.guards.test.ts`: the maintained test rejects
negative, above-maximum, fractional, and non-finite price precision before
exponentiation. The historical two-assertion case duplicates the negative and
above-maximum guard behavior, although it uses a larger out-of-range number.
`quote.ts` and all chain-adapter tests remain unchanged; no new chain-adapter
execution or qualification is claimed by this task.

## Remaining integration gates

The root coordinator owns independent review, final combined qualification,
and promotion. This worker changed no remote refs or other worktrees. Browser
checks, full-repository checks, hosted CI, and main promotion were not performed
as part of this scoped package recovery. Original donor branches remain intact.
