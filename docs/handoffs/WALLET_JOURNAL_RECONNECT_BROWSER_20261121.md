# GhostPay — consent-scoped wallet journal browser qualification (2026-11-21 UTC)

## Ownership / scope before edits
- Repository: `djshellshoxxx/GhostPay`; target static browser-only GitHub Pages beta.
- Main at discovery: `aec179910c39081d820396409ff3139ff2264132`.
- Parent PR: [#348](https://github.com/djshellshoxxx/GhostPay/pull/348), head `26b45165c1d6de9e23f5b943ed46f3aa0908f45c`; stacked through #336. Do not independently merge this stack into main.
- Isolated task branch: `test/ghostpay-wallet-attempt-reveal-after-reconnect-20261121`, created from that exact parent SHA.
- Owned product paths **tests only**: `apps/web/e2e/pages-devnet.spec.ts`, `apps/web/e2e/devnet-journey.spec.ts`. Owned notes: this handoff. No runtime, contract, dependency, RPC, CI, deployment, or fee changes.
- Worker: single connected GitHub engineering assistant; no independent verifier present.

## Verified failure evidence
- [Pages run 44844067142](https://github.com/djshellshoxxx/GhostPay/actions/runs/44844067142), failed job `136659351713`: page reload followed by navigation to Pay still carries a hash in the session journal but **does not display** it without the account/chain context. `pages-devnet.spec.ts:412` incorrectly expects it before reconnection. 10 passed, one failed, five did not run in the Pages real-devnet suite.
- [Beta run 44844067221](https://github.com/djshellshoxxx/GhostPay/actions/runs/44844067221), failed job `136659351651`: equivalent assertion in `devnet-journey.spec.ts:142` and `:271` fails. Library and CLI phases passed, browser phase failed.
- Source `apps/web/src/components/WalletAttempts.tsx`: `visible` is empty without supplied account+chain; warning and connect-to-reveal instructions remain visible; each attempt is scoped to the actual wallet session and optionally visual privacy reveal. **Do not undo this protection** or display hashes before explicit wallet disclosure.

## Acceptance
1. After reload and before renewed consent, both browser suites assert that the historical hash is not rendered and that reconnect instructions appear.
2. After reopening the original invoice and explicitly reconnecting the same account/chain, the journal again displays that exact hash without making a new payment.
3. Original duplicate-submission and nonce protections, chain checks, privacy gates, network isolation, and transfer assertions stay intact.
4. Run exact-head Pages, Beta, CI and hosting workflows; do not claim tests passed until hosted results actually finish. Parent #348 and #336 require their own refreshed qualification.

## Qualification / handoff
Status: isolated ownership recorded before test edits. Last known #348 Pages and Beta checks fail as above; CI queued and Hosting passed. Implementation and exact-head verification pending. No merge, deployment or release.
