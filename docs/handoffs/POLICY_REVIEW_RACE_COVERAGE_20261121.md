# GhostPay policy review-revocation follow-up — 2026-11-21 UTC

## Scope and source
- Repo: djshellshoxxx/GhostPay.
- Task branch: `test/ghostpay-policy-review-races-20261121-r1`; exact parent PR #375 head at creation: `2e0aff8490086a54fadd52c2fa4d802605b7920e`.
- Parent stack: #375 → #374 → #368 → #362 → #357; inherited original GP-BUG-07 fix from #345.
- Baseline main observed at start: `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Claim commit: `5713cabc619630acca29bfff33bf79b0d35f7248`; regression implementation commit: `e456f2e2314a22ea3a5c66a510015f6b2d0449e6`.
- Owned source: new `apps/web/src/features/policy/PolicyPay.reviewRaces.test.tsx`; additive claim in `docs/ai/ACTIVE_WORK.md` and this handoff. No existing runtime source, test assertions, dependencies, chain/contracts, fees or deployment configuration changed.

## Added regression scenarios
1. Payee meta-address edited while a previously reviewed native payment is paused in wallet `eth_accounts` recheck: no `eth_sendTransaction`; revocation message.
2. Token edited under the same race: no wallet transaction; revocation message.
3. User re-reviews identical inputs while an old send is still pending: old authorization invalidated; no wallet transaction.
4. ERC-20 approval mined and verified, then amount edited during the *payment* wallet recheck: only the original approval wallet transaction is allowed; no policy payment, and UI must disclose the already-mined approval and remaining router allowance.

All tests use the existing jsdom/MockWallet/fakeChain fixtures. No real wallet, payment, secret or RPC endpoint is used. Browser edits cannot retract a request already delivered to a wallet.

## Verification
Local checkout and Vitest execution unavailable because the current local container cannot resolve github.com (git ls-remote reported 'Could not resolve host: github.com'). The newly committed test suite is **not claimed as passing** until hosted exact-head CI reports its result. No independent source review or GitHub approval has occurred here.

Next: run the existing web Vitest suite and ts-lint/typecheck on this child exact head via GitHub Actions, inspect failure logs and fix actual defects without weakening assertions. Require complete CI, Pages/Hosting/Beta gates and fresh independent review before child integration; this test-only PR is intentionally stacked on draft #375 and must not be merged independently into main. Recheck parent/head, current main, downstream overlaps and held generation-11 integration lock. No force push, merge, release or deployment.
