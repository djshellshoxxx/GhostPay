# Relayer (gas sponsorship)

Authoritative sources: [`apps/relayer/README.md`](../../apps/relayer/README.md) (API, checks, configuration),
[`apps/relayer/PRIVACY.md`](../../apps/relayer/PRIVACY.md), [`docs/operators/relayer-runbook.md`](../operators/relayer-runbook.md),
[`docs/specs/04-permit-griefing-fallback.md`](../specs/04-permit-griefing-fallback.md). This page only navigates them.

Status: implementation complete for the in-scope relayer spec, **externally unqualified** (no public-testnet run, no load
test, no professional audit). See [`docs/audits/26-relayer-completion.md`](../audits/26-relayer-completion.md).

## For users

- A stealth address that holds stablecoins but no gas can still be swept: you sign a sweep order, the relayer pays the gas
  and takes a fee (minimum 0.5 %, maximum 3 % of the amount, never more than the published cap). The contract, not the
  relayer, enforces the destination, amount, fee and fee recipient you signed. The relayer can refuse or delay, not
  redirect.
- A returned transaction hash means "broadcast", not "paid": the app waits for the on-chain receipt.
- What the messages mean:

| Relayer class | What happened | What you can do |
|---|---|---|
| `permit_expired` | The permit lapses before the sweep deadline | Sign again |
| `permit_nonce_consumed` | The permit's nonce was already used (by you, or a front-runner) and no allowance covers the sweep | Sign a new permit, or sweep directly |
| `permit_signature_invalid` | The token rejects the permit signature | Sweep directly (you pay gas) or approve once |
| `permit_unsupported_token` / `permit_not_supported` | The token has no standard ERC-2612 permit | Approve once, then sweep, or sweep directly |
| `permit_failed` | The permit looks valid but the transfer would fail | Check the balance; sweep directly |
| `insufficient_allowance` / `insufficient_token_balance` | Nothing to sweep with the current allowance or balance | Approve, or check the address |
| `quote_expired` / `fee_below_quote` | The quote is older than 60 s or the fee changed | Request a new quote |
| `gas_price_moved` / `gas_price_too_high` | Gas moved too much between checks | Retry later |
| `budget_exhausted` / `breaker_open` / `loss_budget_exhausted` | The relayer is protecting its funds | Retry after `Retry-After`, or sweep directly |
| `send_unsettled` / `state_unavailable` | The relayer is reconciling an earlier transaction or cannot record state | Retry after `Retry-After` |
| `send_failed` | The broadcast outcome is unknown | Do not re-sign a different order; check the chain first |

The relayer never retries a refused permit silently, and never replaces the destination, amount, token, chain or fee
recipient.

## For developers and operators

- Code: `apps/relayer/src` (`service.ts` relay logic; `stateStore.ts` restart journal; `chain.ts` viem client;
  `ops.ts` operator CLI). Shared logic: `packages/chain-adapters` (fee math, sweep typed data, `classifyPermit`,
  `diagnoseSignedPermit`), `packages/relayer-guard` (breaker, limiter, loss budget).
- Restart safety: the daily budget and every transaction that may still spend gas are journaled (`state.file`); a restart
  never reuses a nonce that a signed transaction may hold. Table in the README, "Restart safety".
- Run tests: `npm run build:libs`, `cd packages/contracts && forge build`, then `REQUIRE_ANVIL=1 npm test -w @ghostpay/relayer`.
- Container smoke test (local anvil only): `bash apps/relayer/deploy/smoke-anvil.sh`.
- Operator commands (read-only): `node dist/ops.js check-config | state | health | reconcile-report`.
- Single instance per hot key. Multiple replicas need shared atomic coordination, which does not exist yet.
