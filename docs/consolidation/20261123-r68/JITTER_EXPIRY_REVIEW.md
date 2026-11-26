# R68 source-pinned review — monotonic invoice-expiry rollback

Checked 2026-11-23 UTC. Parent owner [PR #274](https://github.com/djshellshoxxx/GhostPay/pull/274), exact head `a4c6f945adef0438bfd0b347fb7c11057e3973ce`. Protected main at review: `8ddb344973e80b8e1eda6821e970ee6a2b808b29`. Owner source `apps/web/src/lib/jitter.ts` blob `9845576adfb522c17db145b1772276f66523180c`; owner regression blob `ff652c1d81720c9e45157479058e6b7b0edcaad2`.

This independent test-only branch adds `apps/web/src/lib/jitter.expiry-qualification.test.ts` to exercise integer/fractional boundary transitions, monotonic rollback floor, Send-now under rollback, simultaneous expiry/readiness, nonfinite clocks and terminal-state invariants using injected clocks and no real network or funds. It **does not edit** `jitter.ts` or the owner's existing `jitter.test.ts`. It is intended as a stacked draft follow-up for owner review, not permission to merge main.

## Independent source question (not an established payment exploit)

The scheduler's `check()` reevaluates expiration only while status is `waiting`. Once it returns `ready`, later `check()` or `sendNow()` will not mark it `expired`, even after wall time advances past invoice expiry. Exact source reasoning: `if (this.status === 'waiting') { if (this.invoiceExpired()) ... }`. This might be a deliberate one-shot handoff to a caller that separately validates invoice expiry. **No signing or broadcast bypass is inferred**. The source owner was notified in [#274 comment](https://github.com/djshellshoxxx/GhostPay/pull/274#issuecomment-7106602537) and should establish the intended terminal-status contract with an end-to-end invoice gate test before main merge.

## Gates

PR #274 exact head has only four successful check-runs at inspection, not complete full browser/security acceptance. The test-only branch requires its own exact-head hosted CI, independent review, and owner coordination before integration. No local repository Vitest, lint, TypeScript or browser execution is claimed. Parent application code, cryptography, custody, privacy/Pages/Tor, and release triggers were unchanged. No deployment, real funds, main merge, force-push or owner-branch update.
