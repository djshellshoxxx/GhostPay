# @ghostpay/relayer

Gas-sponsorship relay for `GhostPaySweepRelayer`. A stealth address that holds ERC-20 tokens but no gas signs an
EIP-712 `Sweep` order; this service quotes a fee (F-SPONSOR, `docs/FEE_SCHEDULE.md`), checks the order, simulates it,
and sends the transaction from a hot key. The contract, not this service, guarantees that destination, amount,
fee and `feeTo` are exactly what the owner signed. Spec: `docs/APP_AND_RELAYER_SPEC.md` section 3.

Node 22, ESM, strict TypeScript, `node:http`, `viem` plus workspace packages (`@ghostpay/chain-adapters` for fee math,
sweep typed data, RPC URL and manifest validation). No other runtime dependency. Deviations from the spec are in
[`DEVIATIONS.md`](./DEVIATIONS.md); what is stored is in [`PRIVACY.md`](./PRIVACY.md).

Scripts (`package.json`): `build`, `typecheck`, `test`, `lint`, `start` (`node dist/main.js`). Wired packages: `@ghostpay/chain-adapters` and `@ghostpay/relayer-guard` (non-wedging breaker, trusted-proxy client address, IPv6 /64 buckets, monotonic flood-proof limiter, loss budget). The challenge module of relayer-guard is **not** wired.

## API

All bodies are `application/json` (max 16 KiB), amounts/uints are decimal strings, unknown keys are rejected.
Errors are `{"error":{"code":"<class>"}}` with a fixed class and nothing else.

| Route | Purpose |
|---|---|
| `GET /healthz` | `{status, chains:[{chainId, breaker, minedReverts}]}`; `degraded` (503) when any chain's breaker is open or half-open (S3-05) or its mined reverts are `sustained` (L5-02), `shutting_down` during shutdown |
| `GET /metrics` | Prometheus text; 404 unless `metricsTokenEnv` is configured, then requires `Authorization: Bearer <token>` |
| `GET /v1/info` | version, fee policy (min 50 bps, cap 300 bps, gas x1.10), quote TTL, deadline window, per chain: `sweepRelayer`, `feeTo`, token allowlist |
| `POST /v1/quote` | `{chainId, token, owner, destination, amount}` -> `{fee, feeTo, expiresAt, quoteToken}` (`fee` decimal string, `expiresAt` unix seconds) |
| `POST /v1/sweep` | `{chainId, sweep:{token,owner,destination,feeTo,amount,fee,deadline,nonce}, sweepSig, permit?:{value,deadline,v,r,s}, quoteToken}` -> `{txHash}` |

`sweepSig` is the 65-byte `r||s||v` EIP-712 signature (domain `GhostPaySweepRelayer`/`1`/chainId/contract).
`permit` present -> `sweepWithPermit` (token must have `permit: true`); absent -> `sweep` (allowance already granted).

`quoteToken` = `v2.<keyId>.<expiresAt>.<fee>.<hmac-sha256>`; the MAC covers chain, token, owner, destination, amount, fee,
`feeTo` and expiry under the server secret, compared in constant time. Stateless; single use is enforced by the contract's
sweep nonce. The key id lets a deployment accept a previous key briefly while new quotes use the current key.

### Sweep checks, in order

chain and token allowlist (`chain_not_supported`, `token_not_supported` 422) -> permit flag/value (`permit_not_supported`,
`permit_value_too_low`) -> `feeTo` equals the relayer's (`fee_to_mismatch`) -> quote token authentic (`invalid_quote` 400),
unexpired (`quote_expired` 410), `sweep.fee >= quote.fee` (`fee_below_quote`), `fee <= 300 bps` (`fee_above_cap`) ->
deadline in `(now+min, now+max]`, max 1800 s (`deadline_too_soon/far`) -> contract static rules (`invalid_order`) ->
signature recovers to `owner` (`invalid_signature`) -> per-owner rate limit (`rate_limited_owner` 429; keyed only by a
proven owner) -> per-owner failure counter (`owner_failure_limit` 429 + `Retry-After`: 3 costly user-attributable
failures per hour, spec 04) -> `PolicyGate` (`policy_denied` 403, `policy_unavailable` 503) -> breaker (`breaker_open` 503) ->
loss budget probe (`loss_budget_exhausted` 429 + `Retry-After`) -> serial per-chain lane: receipt lookups for earlier
timed-out sweeps (never fail the job), gas price cap (`gas_price_too_high` 503), balance floor (`breaker_open`), order state
(`nonce_used`, `insufficient_token_balance`, `insufficient_allowance`), permit ladder (allowance already covers -> the permit
is dropped and plain `sweep` is used; otherwise a permit that has expired or expires before `sweep.deadline` ->
`permit_expired` 422 before simulation), `simulateContract` (revert class: `nonce_used` 409, `expired`, `invalid_signature`,
`token_transfer_failed`, `permit_value_too_low`, `invalid_order`, `simulation_reverted` 422; with a permit still needed a
generic transfer revert is `permit_failed` 422; RPC failure `rpc_unavailable` 503), gas limit (`gas_limit_too_high`), fee
covers the estimated gas (`fee_below_gas_cost` 422), gas price re-read (cap; `gas_price_moved` 503 beyond
`gas.maxMovePercent`), second simulation with the same checks, loss budget reservation (`loss_budget_exhausted` 429), daily
budget (`budget_exhausted` 503 + `Retry-After`) -> send (`send_failed` 503). A mined revert also counts against the owner.

Quote pricing: `gas.griefReserveBps` (default 0, max 5000) is added to the gas term before the F-SPONSOR formula, so the fee
carries a margin for gas lost when an owner drains or revokes first. `quoteTtlSeconds` is at most 60 (default 60).

Other classes: `invalid_*` 400 (field-level validation), `unsupported_media_type` 415, `body_too_large` 413,
`rate_limited_ip` 429, `origin_not_allowed` 403, `queue_full` / `shutting_down` 503, `not_found` 404, `method_not_allowed` 405,
`internal_error` 500.

**Client contract (pre-broadcast classes).** Every 4xx class above is returned before the relayer broadcasts: `send` is
the last step and its failure is `send_failed` 503, and nothing after a successful send returns an error. `nonce_used` 409
can mean the order is already on chain. Errors use the envelope `{ "error": { "code": "<class>" } }`. The web client
releases a relayed-sweep signing lock only for a 4xx with this envelope and a class in
`apps/web/src/lib/relayerClient.ts` `PRE_BROADCAST_CODES` (or `invalid_*` at 400); its test cross-checks that list against
this source. Adding a 4xx after `send`, or reusing a listed class for a post-broadcast condition, breaks that contract.

## Configuration

JSON file (`RELAYER_CONFIG`, default `./relayer.config.json`) plus environment. See `relayer.config.example.json`.
Validation is strict: unknown keys, wildcard or non-https origins, plain-http or credentialed RPC URLs, non-stable tokens,
missing economics all stop startup.

Deployment manifests are validated against the configured chain and must have a valid compact low-s secp256k1 signature
over the shared structured `manifestDigest`. Set `GHOSTPAY_RELEASE_PUBKEYS` to a comma-separated allowlist of up to eight
compressed public keys (66 hex characters each, no `0x`). Missing keys, unsigned manifests, and legacy raw-text
signatures stop startup. The web build and ops monitor use the same manifest digest and key format.

| Env | Meaning |
|---|---|
| `RELAYER_KEY_FILE` or `RELAYER_KEY` | 32-byte hot key (hex). A file must be regular, non-symlink, owned by the service user or root, and have no group/world permission bits (`chmod 600`). Production environment values require `ALLOW_SECRET_ENV=1`. Never logged. |
| `QUOTE_SECRET_FILE` or `QUOTE_SECRET` | 32-128 byte HMAC secret (hex), same file rules. A rotation can preserve outstanding quotes briefly with the previous-secret variables below. |
| `QUOTE_SECRET_PREVIOUS_FILE` or `QUOTE_SECRET_PREVIOUS` | Optional prior quote secret accepted for verification only. Remove it after `quoteTtlSeconds` to finish rotation. |
| `ALLOW_SECRET_ENV=1` | Explicit opt-in required to load a secret directly from an environment variable when `NODE_ENV=production`. |
| `RELAYER_CONFIG`, `DEPLOYMENTS_DIR` | config path; directory with `<chainId>.json` deployment manifests (default `../../deployments`) |
| `ALLOW_MAINNET=1` | required, in addition to a valid manifest, for any non-testnet chain id |
| `<name from rpcUrlEnv>` | RPC URL kept out of the file (API keys) |
| `allowFeeToHotKey` | Defaults to `false`; set `true` only when fee proceeds are intentionally sent to the signing key. `feeTo` must be explicit otherwise, and zero/precompile recipients are rejected. |

Per chain: `rpcUrl`|`rpcUrlEnv`, `sweepRelayer` (optional; taken from the manifest when present, must match it if both),
`feeTo` (required unless `allowFeeToHotKey: true`), `tokens` (each `usdStable: true`; symbol/decimals/permit come from the
chain-adapters allowlist or must be given), `nativeUsdPrice`, `gasUnits`, `maxGasLimit`, `maxGasPriceWei`,
`dailyBudgetWei`, `minBalanceWei`. Operator numbers (`gasUnits`, `nativeUsdPrice`, caps, budget) have no defaults on
purpose and must be set from your own measurements. The example file's values are placeholders, not measurements.

Fee: `sponsorFee(amount, gasUnits * eth_gasPrice converted at nativeUsdPrice with the stablecoin fixed at 1.0)` from
chain-adapters = `clamp(max(gas x 1.10, 50 bps), cap 300 bps)`. If the cap cannot cover raw gas cost the quote is refused
(`amount_too_small`). At send time, the relayer reads token balance/allowance/nonce, simulates twice, checks the actual
estimated gas cost against `gas.coverPercent` (default 100%), and refuses if `eth_gasPrice` moves more than
`gas.maxMovePercent` (default 25%) between simulations. Quote gas prices are cached for `gas.quoteCacheSeconds` (default 3).
Non-stable tokens are unsupported in v1.

## Run

```
npm run build -w @ghostpay/relayer
RELAYER_KEY_FILE=/etc/ghostpay/hot.key QUOTE_SECRET_FILE=/etc/ghostpay/quote.secret \
RELAYER_CONFIG=/etc/ghostpay/relayer.config.json node apps/relayer/dist/main.js
```

HTTPS is terminated by the host (reverse proxy); list its IPs or CIDRs in `trustedProxies` so the rate-limit bucket can
use `X-Forwarded-For` only when the socket peer is trusted. An empty list ignores that header. `SIGTERM`/`SIGINT` start a
graceful shutdown: stop listening, refuse new work, let queued and in-flight transactions settle, force-close after
`shutdownGraceSeconds`. Deployment: `Dockerfile` (distroless, non-root; build from the repo root) and
`deploy/ghostpay-relayer.service`.

To rotate the quote secret, deploy the new value as `QUOTE_SECRET_FILE` and the old value as
`QUOTE_SECRET_PREVIOUS_FILE`. New quotes use the new key; old quotes remain valid until their normal expiry. After
`quoteTtlSeconds`, remove the previous-secret setting and restart. The previous key is verify-only and must differ from the
current key.

## Threat notes

- **Privacy-preserving by construction, not by promise:** logs can only carry `requestId, route, status, chainId, txHash,
  errorClass`; raw IPs are hashed with a rotating in-memory salt; nothing is persisted. See `PRIVACY.md`. The relayer
  and its RPC provider do see owner, destination and amount of each sweep (inherent; documented).
- **Cannot redirect funds:** the order is signed by the stealth key and verified on-chain; the relayer can only decline
  or delay. A malicious operator can censor and can observe, and can send a sweep later than the user expected
  (deadline <= 30 min bounds that).
- **Drain protection:** per-IP and per-owner token buckets (bounded LRU), simulation before every send, gas price cap,
  gas limit cap, per-chain daily budget, balance floor, error-rate breaker with half-open probe, one in-flight transaction
  per chain with a bounded queue, 16 KiB body cap, header/request timeouts, connection cap.
- **Quote integrity:** HMAC binds the whole order; tampering or replaying across chains/tokens/owners fails.
- **Not covered:** per-owner limits apply to `/v1/sweep` only (quotes are unauthenticated, IP-limited only); a distributed
  attacker with many IPs is bounded by the budget, queue and breaker, not by rate limits; in-memory state means a restart
  resets limits and budget counters (the daily budget is then per process-day, not persisted); there is no sanctions
  screening unless the operator supplies a `PolicyGate` (default allows all, ADR-0006).
- **Hot key:** keep the balance low (the `minBalanceWei` floor opens the breaker). The key is used only to sign these
  transactions; the contract moves tokens `owner -> destination/feeTo` and never holds them.

## Tests

`npm test -w @ghostpay/relayer` (vitest, coverage thresholds 95/90/95/95 enforced). Unit and in-process HTTP tests
use an injected fake chain client; `src/chain.test.ts` drives the real viem client against a fake JSON-RPC transport;
`src/e2e.anvil.test.ts` deploys the compiled `GhostPaySweepRelayer` and `PermitToken` from `packages/contracts/out` on a
local anvil and sweeps through the relayer (skipped when anvil or the artifacts are missing; `ANVIL_BIN` overrides
`/home/user/tools/foundry/anvil`; run `forge build` first). The anvil test uses throwaway keys and `anvil_setBalance`. CI sets `REQUIRE_ANVIL=1` for this workspace (`ts-test-relayer`), but `e2e.anvil.test.ts` does not read that variable yet (only `packages/policy-scheme` does), so a missing anvil still skips there.

## Unverified

No test against a public testnet RPC; no load test; Docker image and systemd unit were not built or run in the authoring
sandbox; mainnet behaviour (manifest + `ALLOW_MAINNET`) is covered by config tests only; gas units in the example config
are placeholders.

## Abuse controls and operations (relayer-guard wiring)

- `trustedProxies` (CIDR list, default empty) replaces `trustProxyHops`. `X-Forwarded-For` is honoured only when the socket peer is listed, walked right to left; a broken chain gets `400 invalid_client_address`. Buckets are IPv4 /32 and IPv6 /64, hashed with the rotating salt (S3-07).
- Breaker: every admission is a permit settled on every path; user-attributable results (simulation revert, nonce used, caps) are neutral; an RPC failure on any in-lane read, the gas price included, counts as a failure (L5-10), while the gas price cap (`gas_price_too_high`) stays neutral; `breaker.probeTimeoutSeconds` expires a stuck probe (S3-05). A mined revert after a passing simulation is charged to `lossBudget` (per network bucket and per destination, plus global; `429 loss_budget_exhausted`) and does not feed the breaker (S3-06).
- Loss budget (L5-02, L5-04): each sweep makes one reservation that charges its destination, its network bucket and that bucket's group (IPv4 /24, IPv6 /48), each up to `perKeyWei`, and the global cap once. A quarter of `globalWei` is kept for sweeps whose keys and groups lost nothing in the current window, so sources that keep losing cannot refuse everyone. Keys and groups live in two tables of `maxKeys` entries that evict only entries from an earlier window; while a table is full of live entries, newcomers share one overflow entry per kind (destination, network), counted by `relayer_loss_budget_overflow_total`. Mined reverts that reach the breaker's own thresholds (at least `breaker.minSamples` reverts making up at least `breaker.failureRatio` of the last `breaker.windowSize` mined sweeps within `lossBudget.windowSeconds`) send a `mined_revert_rate` alert and report `minedReverts: "sustained"` and `degraded` on `/healthz`, without opening the breaker.
- `rateLimit.quoteGroupPerMinute/Burst` (default 60 per minute, burst 20): `/v1/quote` budget per client IPv4 /24 or IPv6 /48 (`429 rate_limited_ip`), checked before `rateLimit.quoteGlobalPerMinute/Burst`, the process-wide `/v1/quote` budget (`429 rate_limited_global`, counted as `relayer_quote_budget_denied_total` and alerted as `quote_budget_exhausted`), which only a well-formed quote request spends (L5-03). Keep the group values well below the global ones. The quote-path gas price is reused for `gas.quoteCacheSeconds` (3 s) and concurrent quotes that find it cold share one lookup.
- Open item (RELAYER-01): enough networks together can still exhaust the global quote budget and so refuse every quote, and with it every relayed sweep; each network group only buys `quoteGroupPerMinute` of it. The durable fix, pricing the fee at sweep time so that quotes need no global budget, is not implemented.
- Alerts: `alertWebhookUrlEnv` names an env var holding an https URL; JSON `{kind, chainId, text}` is posted on breaker open, low balance, loss/daily budget exhaustion, mined reverts, a sustained mined-revert rate (`mined_revert_rate`), receipt timeouts and a refusing global quote budget (`quote_budget_exhausted`) (de-duplicated per kind and chain, 60 s). No request data is ever included.
- Receipt timeouts (L5-06): a sweep whose receipt is not seen within `queue.receiptTimeoutSeconds` counts as a breaker failure (its permit was settled at broadcast, so the failure is recorded directly) and sends a `receipt_timeout` alert. Its daily-budget and loss reservations are kept, and the start of each later job on that chain looks its receipt up again (`eth_getTransactionReceipt`, at most 8 per chain, dropped after 24 h): once mined it is settled like any receipt (unused budget returned, a revert charged). Open item: nothing replaces (fee bump) or cancels a stuck transaction; the lane moves on after the timeout with the nonce re-read from the pending count.
- Metrics (`/metrics`): `relayer_http_requests_total`, `relayer_sweeps_total`, `relayer_breaker_transitions_total`, `relayer_mined_reverts_total`, `relayer_receipt_timeouts_total`, `relayer_loss_budget_denied_total`, `relayer_loss_budget_overflow_total`, `relayer_quote_budget_denied_total`, `relayer_owner_failures_total`, `relayer_permit_skipped_total`, gauges `relayer_breaker_state` (0 closed, 1 half_open, 2 open), `relayer_daily_budget_used_wei`, `relayer_queue_pending`.
- Unverified: nothing here has run behind a real proxy, Prometheus or webhook receiver.
