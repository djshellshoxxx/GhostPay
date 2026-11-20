# Fresh successor handoff

The code audit preserved original branch ownership and found two concrete next tasks. Do not redo the completed narrow uniqueness assessment unless an input head changes.

## 1. Receipt status repair

- Start from the latest coordinated candidate containing #298's hash correlation. Recheck active wallet-privacy ownership because `wallet.ts` also contains currently advancing connection changes.
- Reproduce `wallet.receiptStatusAudit.test.ts.txt` under the original web Vitest configuration. `verification.json` pins the audit's baseline and #298 probe outcomes.
- Add the minimal guard accepting only status `0n` or `1n`, with the existing typed unexpected-shape error for every other quantity. Preserve hash correlation, valid status zero/one, pending null receipts, and current destination behavior unless a separately justified policy change is authorized.
- Promote the independent cases to a permanent regression; add a consumer regression that malformed status retains the original broadcast hash and submitted journal entry and does not offer another send.
- Run affected wallet, payExec and payment acceptance tests plus scoped typed lint and web typecheck. Obtain separate review. Never infer full browser/CI qualification from these checks.

## 2. Diagnose the actual hosted full-browser failure

The coordinator reports #295 head `4493793ad2c438fcc0f45f96851eac8967cb607a` has a failed `e2e (full)` job while other exact-head checks remain queued. Root holds job IDs in `live-ci-start.json`. Read the actual failure logs and head/merge-tree identity first; no diagnosis is claimed here. Preserve assertions, timeouts, coverage and security gates, reproduce the failed journey, and repair only the demonstrated cause in an isolated branch.

## Ownership and consolidation

The original `/workspace/scratch/0a7bc3583588/GhostPay` privacy branches continued advancing during this audit. They are active lanes, not abandoned work. Root handles integration and source publication. No local or remote source ref was changed by this audit. `source-blobs.json`, `branch-inputs.json`, and `local-recovery-inputs.json` identify the frozen comparisons; every differing current head requires a fresh check.
