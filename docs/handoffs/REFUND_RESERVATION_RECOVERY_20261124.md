# Submitted refund reservation recovery — 2026-11-24

## Source and scope

- Branch: `integration/refund-reservation-20261124`.
- Base: `79c7ff73efbaf9efde5ec8cfc0e8fff08d4fad0b`.
- Verified source and test tree: `9ce85c56390695bdc9593e162dfd2e44fc33984a`.
- Donor branch: `nodata/practical-johnson-e0fbpm`, preserved at
  `85cc394451313e24104ef7089379e720b4e70526`.
- Existing regression donor: `aa0bee225464ebf42b88351ea71c54b21e497a59`,
  recovered as `89b9a8e0fbc05880297cb79d9acf56d4e380b1ee`.
- Production correction donor: `46d8e17fc70cb5bda89afbb4a942c2158871e992`,
  recovered as `f275e811cf741420923356c493704af59fb88635`.

Both recoveries retain the original author, commit message, coauthor, and
`cherry picked from commit` attribution. No conflicts occurred. Only comments
differ from the recovered source and test: references to the donor's unfinished
`RefundBook` and lifecycle module were replaced with the current API's limits.
All existing regression assertions are unchanged.

## Resulting behavior

`transitionRefund` permits `submitted -> confirmed`, but rejects
`submitted -> failed`. A submitted plan therefore keeps counting against the
original payment's refundable amount even when its outcome is uncertain.
`planned -> failed` still releases a never-submitted plan's reservation.
Confirmation, same-state replay, and the cumulative cap retain their existing
behavior.

The existing refund specification now matches those transitions and records
that this plan-only API accepts caller assertions without verifying chain
evidence. It cannot resolve a submitted refund's failure using verified
evidence. This is a reservation correction, not refund execution support.

The donor's larger lifecycle and settlement-policy implementation, exports,
error codes, tests, claims, and unfinished integration remain on its original
branch. They were not imported or altered.

## Local verification

Executed against the final source and regression tree above:

| Command | Result |
| --- | --- |
| `node scripts/build-workspaces.mjs --workspace @ghostpay/merchant-billing` | Passed; built invoice-schema, merchant-hooks, and merchant-billing from this checkout. |
| `npm run test -w @ghostpay/merchant-billing` | Passed: 13 files, 292 tests, including the two existing donor regressions. |
| `npm run typecheck -w @ghostpay/merchant-billing` | Passed. |
| `npm run lint -w @ghostpay/merchant-billing` | Passed. |
| `npm run ci:scan-secrets` | Passed. |
| `git diff --check 79c7ff73efbaf9efde5ec8cfc0e8fff08d4fad0b..HEAD` | Passed. |

Coverage: statements 99.69% (662/664), branches 99.66% (589/591), functions
100% (88/88), lines 99.8% (511/512). Existing package thresholds passed without
configuration changes.

Environment: Node 24.22.3, npm 11.19.1, Vitest/coverage-v8 5.0.5,
TypeScript 5.9.3, ESLint 10.15.0, and noble hashes/curves 2.4.0.
Third-party dependencies were reused from the coordinator's external
installation. All 68 `@ghostpay` workspace links point into this isolated
checkout; resolution of merchant-billing and both internal dependencies was
checked explicitly. No dependency manifest or lockfile changed. npm emitted
the existing unknown `http-proxy` environment-setting warning; commands exited
successfully.

## Integration limits

No remote reference, PR, or merge was changed by this worker. Independent
review, final combined qualification, and promotion belong to the root
coordinator. This scoped run did not execute browser, Anvil, CLI, or hosted CI
checks and does not claim that refund execution is implemented. No new attack
or vulnerability reproduction tests were introduced.
