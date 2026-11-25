# FC-02: Sweep balance consent and quote/signing lifecycle

Worker fc02, branch `claude/fc02-sweep-consent-20261125`, base `origin/main` `f18e8c0c949459f6ecbe8d2c6d71ea208a6d160f`. Draft PR #649. Experimental, testnet only, not audited.

## Provenance

- Donor: PR #534, `origin/codex/ghostpay-sweep-balance-integration-20261123`, head `5c93c3b172cd002f1cdc68232b1a0f3335aadb76`, merged with `git merge --no-ff` (merge commit `5613341b`). Donor history is intact.
- #534 contains #252 `4085622463411d3ba27f4efb7b73a70575170535` (balance consent) and selected #272 lifecycle commits `ab40d79a`, `9e4ec2da`, `a67d0975`.
- Only merge conflict: `docs/ai/ACTIVE_WORK.md`, resolved by union; FC-02 claim added at the top.

## Three-property review of the merged tree (`apps/web/src/views/Sweep.tsx`, `apps/web/src/lib/scanPrivacy.ts`)

1. No balance RPC without consent. The only caller of `readBalance` is `onReadBalance`, bound to the Read button; the former mount effect that read the balance automatically is gone. `scanPrivacy.ts` disclosure text (`sweepOnRequest`, plain `sweepHow`) now says the read happens only on request in every transport mode.
2. Review change invalidates signing. `balanceScope` and `quoteScope` (memoised on selection, chain, token, provider, RPC factory, session, balance, destination, mode, relayer, manifest, services) clear the quote and bump operation counters on any change. `onRelay` and `sweepDirectly` call `assertReviewCurrent()` at start, after each await, and inside `onBeforeHandoff` before the journal lock is written or the network handoff happens. Post-handoff edits do not clear `beginSweepAttempt` evidence (tests below).
3. Current-main behaviour preserved. Main's Sweep.test.tsx and e2e changes merged without loss; the focused suites pass (see Commands).

## Changes beyond the merge (review follow-ups L1 to L3)

- L1: before any click the balance row shows "not read yet" (`sweep.balanceNotRead`); "unknown" only after a request. A request with no RPC for the chain sends nothing and shows `sweep.balanceRead.noRpc`.
- L2: a changed review during signing now says `sweep.reviewChanged` ("The review changed; nothing was sent. Review and sign again.") instead of the vault-cancelled text. The Read button is disabled while `busy`.
- L3: user docs updated: `docs/user/privacy-limits.md`, `docs/user/sweep-and-gas-privacy.md`, `docs/user/troubleshooting.md`.
- New keys in all four catalogs (English text in ar, es, ja, per catalog convention), `securityKeys.ts` (`sweepReviewAndOutcomes`), and the `i18n-use` marker in Sweep.tsx.
- Tests added: not-read-yet and no-RPC notice (Sweep.privacy.test.tsx); review-changed message for relayed and direct, Read disabled while busy, out-of-order read results (latest wins), handoff evidence retained after a balance refresh and after an app lock (Sweep.quoteLifecycle.test.tsx). Existing "balance changed during signing" cases now invalidate the balance with an idle app lock because the Read button is disabled while signing; they still assert nothing is sent and the journal is unchanged.
- The new tests were written before the implementation; a separate failing run was not captured because the shared machine queue made a second full run impractical.

## Commands and outcomes

See the PR description for the final per-command results at the head.

## Known limitations (no change made)

- N1: scope is derived at render time; a hardening option would be to derive it only in handlers.
- N2: `scanPrivacy.disclosure.sweepAuto` is now an unused key (kept for catalog stability).
- N3: the disclosure row does not mention the token contract address.
- N4: ar, es, ja entries are English drafts (no runtime effect while `REVIEWED_LOCALES` is empty).
- Playwright and full-coverage suites were not run locally; hosted CI is authoritative. Active Codex PRs #586 and #610 also touch Sweep.tsx and are not integrated here.
