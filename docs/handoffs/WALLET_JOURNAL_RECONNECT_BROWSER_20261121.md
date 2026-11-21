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

## Published implementation and consolidation checkpoint

- Draft [#352](https://github.com/djshellshoxxx/GhostPay/pull/352), directly stacked on #348 head `26b45165c1d6de9e23f5b943ed46f3aa0908f45c` (itself stacked on #336).
- QA edits: `5960979d35b82232a61a41248a3c47bad7e3f664` (Devnet), `9002a10bb36d054edb2db26a6fc06b7acc4c4a53` (Pages). Registry: `71e428add04dcd5e3ba8dd7535675124d60c30d9`.
- Previous real-chain E2E failed on exact head #348. The repaired assertions have **not** been executed locally. Newly published #352 workflows were queued on inspection; pending outcomes are not passes. Production code remains unchanged.
- [420-branch incremental ledger](BRANCH_DELTA_420_WALLET_JOURNAL_20261121.json) committed at `c90eb832251dfb01dcfd363617d2f9004445e91d`: paged 100/100/100/100/20/0; reconciles the 392-name historical baseline and the prior 26-name delta against two new exact-SHA branch comparisons, all at main `aec179910c39081d820396409ff3139ff2264132`. Historic 392 heads and prior 26 heads were **not revalidated in this cycle**, and 300-file truncated compare results are not used to assert semantic uniqueness.
- Integration overlap: #336 and broad #307 both change the E2E files. Keep #352 in its current dependency chain, never bulk merge the main comparison (459 ahead and 76 behind); only the four-file incremental PR #352 patch is under review.
- **Reconciled #329:** a fresh PR read confirms it **was already merged on 2026-11-20 at 23:28:42 UTC**, merge commit `784b445f6bc5c641e8e85d4e28b730e044791f40`. Its source head `cff631b5c32a86adfa2d79c342e497e91a8573a5` is an ancestor of current main `aec179910c39081d820396409ff3139ff2264132` (compare: 0 behind/33 ahead from donor to main). Its five workflows were successful. An attempted ready-for-review transition was rejected, but no modification to #329 was made in this run. Treat it as merged/redundant, **not** a pending candidate.
- No mainline code merge, deployment, release, or custody/fee/relayer behavior change in this cycle.

## Next checkpoint

1. Read exact latest head and all required workflows of #352; fix only demonstrated failures with test-first changes. Pay special attention to matching account+chain on the Pay view and temporary privacy-reveal UI.
2. After #352 green and independently reviewed, integrate the incremental test edits into #348/#336 without duplicate ownership. Re-run Pages/Beta/browser acceptance on the combined exact head.
3. Exclude already-merged #329 from the actionable queue. Compare other candidates to exact current main and check review, CI, ownership and integration lock before any selective merge.
4. Reconcile overlapped #307 receipt/backup/privacy/Pay tests semantically; do not treat diff stats or a partial 300-file listing as evidence of recoverability.
