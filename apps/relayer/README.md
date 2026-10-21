# @ghostpay/relayer

Gas-sponsorship relay for `GhostPaySweepRelayer`. A stealth address that holds ERC-20 tokens but no gas signs an
EIP-712 `Sweep` order; this service quotes a fee (F-SPONSOR, `docs/FEE_SCHEDULE.md`), checks the order, simulates it,
and sends the transaction from a hot key. The contract, not this service, guarantees that destination, amount,
fee and `feeTo` are exactly what the owner signed. Spec: `docs/APP_AND_RELAYER_SPEC.md` section 3.

Node 22, ESM, strict TypeScript, `node:http`, `viem` plus workspace packages (`@ghostpay/chain-adapters` for fee math,
sweep typed data, RPC URL and manifest validation). No other runtime dependency. Deviations from the spec are in
[`DEVIATIONS.md`](./DEVIATIONS.md); what is stored is in [`PRIVACY.md`](./PRIVACY.md).

## API

All bodies are `application/json` (max 16 KiB), amounts/uints are decimal strings, unknown keys are rejected.
Errors are `{"error":{"code":"<class>"}}` with a fixed class and nothing else.

| Route | Purpose |
|---|---|
| `GET /healthz` | `{status, chains:[{chainId, breaker}]}`. `ok` (200): every breaker closed. `degraded` (200): some chain is `open` or `half_open`. `unhealthy` (503): no chain can serve (all `open`/`half_open`). `shutting_down` (503): draining. Use it as the readiness probe |
| `GET /metrics` | Prometheus text format; **off by default** (`metrics.enabled`), optional bearer token. See "Metrics" |
| `GET /v1/info` | version, fee policy (min 50 bps, cap 300 bps, gas x1.10), quote TTL, deadline window, per chain: `sweepRelayer`, `feeTo`, token allowlist |
| `POST /v1/quote` | `{chainId, token, owner, destination, amount}` -> `{fee, feeTo, expiresAt, quoteToken}` (`fee` decimal string, `expiresAt` unix seconds) |
| `POST /v1/sweep` | `{chainId, sweep:{token,owner,destination,feeTo,amount,fee,deadline,nonce}, sweepSig, permit?:{value,deadline,v,r,s}, quoteToken}` -> `{txHash}` |

`sweepSig` is the 65-byte `r||s||v` EIP-712 signature (domain `GhostPaySweepRelayer`/`1`/chainId/contract).
`permit` present -> `sweepWithPermit` (token must have `permit: true`); absent -> `sweep` (allowance already granted).

`quoteToken` = `v2.<keyId>.<expiresAt>.<fee>.<hmac-sha256>`; the MAC covers the key id, chain, token, owner,
destination, amount, fee, `feeTo` and expiry under the server secret, compared in constant time. Numbers are canonical
decimals: a leading zero anywhere makes the token invalid (one string per quote). `keyId` is 8 hex characters derived from
the secret, so a rotation can keep verifying tokens signed with the previous secret (see "Rotating the quote secret").
Stateless; single use is enforced by the contract's sweep nonce.

### Sweep checks, in order

chain and token allowlist (`chain_not_supported`, `token_not_supported` 422) -> permit flag/value (`permit_not_supported`,
`permit_value_too_low`) -> `feeTo` equals the relayer's (`fee_to_mismatch`) -> quote token authentic (`invalid_quote` 400),
unexpired (`quote_expired` 410), `sweep.fee >= quote.fee` (`fee_below_quote`), `fee <= 300 bps` (`fee_above_cap`) ->
deadline in `(now+min, now+max]`, max 1800 s (`deadline_too_soon/far`) -> contract static rules (`invalid_order`) ->
signature recovers to `owner` (`invalid_signature`) -> per-owner rate limit (`rate_limited_owner` 429; keyed only by a
proven owner) -> per-owner / per-destination failure budget (`failure_budget_exceeded` 429 + `Retry-After`) -> `PolicyGate` (`policy_denied` 403, `policy_unavailable` 503) -> breaker -> serial per-chain lane:
gas price cap (`gas_price_too_high` 503), balance floor (`breaker_open`), **on-chain pre-check** with no gas spent:
nonce already used (`nonce_used` 409), owner token balance below `amount` (`insufficient_token_balance` 422), allowance
below `amount` when no permit is attached (`insufficient_allowance` 422) -> `simulateContract` (revert class:
`nonce_used` 409, `expired`, `invalid_signature`, `token_transfer_failed`, `permit_value_too_low`, `invalid_order`,
`simulation_reverted` 422; RPC failure `rpc_unavailable` 503) -> gas limit (`gas_limit_too_high`) -> `sweep.fee` must cover
the gas cost at `gas.coverPercent` (`fee_below_gas_cost` 422) -> daily budget (`budget_exhausted` 503 + `Retry-After`) ->
**fresh gas price and a second simulation immediately before sending**: price rose more than `gas.maxMovePercent`
(`gas_price_moved` 503), state changed since the first simulation (revert class as above, and the source gets a strike),
fee check repeated at the new price -> send (`send_failed` 503).

Other classes: `invalid_*` 400 (field-level validation), `unsupported_media_type` 415, `body_too_large` 413,
`rate_limited_ip` / `rate_limited_quote` 429 (the latter is the global `/v1/quote` budget), `request_timeout` 408
(body not received within `server.bodyTimeoutMs`), `unauthorized` 401 (`/metrics`), `origin_not_allowed` 403, `queue_full` / `shutting_down` 503, `not_found` 404, `method_not_allowed` 405,
`internal_error` 500.

## Configuration

JSON file (`RELAYER_CONFIG`, default `./relayer.config.json`) plus environment. See `relayer.config.example.json`.
Validation is strict: unknown keys, wildcard or non-https origins, plain-http or credentialed RPC URLs, non-stable tokens,
missing economics all stop startup.

| Env | Meaning |
|---|---|
| `RELAYER_KEY_FILE` or `RELAYER_KEY` | 32-byte hot key (hex). A file must be a regular file (not a symlink), owned by the service user or root, with no group/world permission bits (`chmod 600`), or startup is refused. Never logged. |
| `QUOTE_SECRET_FILE` or `QUOTE_SECRET` | 32-128 byte HMAC secret (hex), same file rules. Must differ from the hot key (and must not start with its bytes): startup is refused otherwise. |
| `QUOTE_SECRET_PREVIOUS_FILE` or `QUOTE_SECRET_PREVIOUS` | optional; the old secret, accepted for **verification only** during a rotation window |
| `NODE_ENV=production`, `ALLOW_SECRET_ENV=1` | with `NODE_ENV=production`, secrets passed as plain environment values are refused (they leak via `/proc/<pid>/environ` and `docker inspect`) unless `ALLOW_SECRET_ENV=1`; use the `*_FILE` variables |
| `RELAYER_CONFIG`, `DEPLOYMENTS_DIR` | config path; directory with `<chainId>.json` deployment manifests (default `../../deployments`) |
| `ALLOW_MAINNET=1` | required, in addition to a valid manifest, for any non-testnet chain id |
| `<name from rpcUrlEnv>` | RPC URL kept out of the file (API keys) |

Per chain: `rpcUrl`|`rpcUrlEnv`, `sweepRelayer` (optional; taken from the manifest when present, must match it if both),
`feeTo` (**required**: earned fees must not accumulate on the hot key. It must not equal the hot-key address, the zero
address or a precompile address (0x...01..ff) unless you opt in to the hot key with top-level `allowFeeToHotKey: true`;
the example file ships a placeholder that deliberately fails validation), `tokens` (each `usdStable: true`; symbol/decimals/permit come from the
chain-adapters allowlist or must be given), `nativeUsdPrice`, `gasUnits`, `maxGasLimit`, `maxGasPriceWei`,
`dailyBudgetWei`, `minBalanceWei`. Operator numbers (`gasUnits`, `nativeUsdPrice`, caps, budget) have no defaults on
purpose and must be set from your own measurements. The example file's values are placeholders, not measurements.

Fee: `sponsorFee(amount, gasUnits * eth_gasPrice converted at nativeUsdPrice with the stablecoin fixed at 1.0)` from
chain-adapters = `clamp(max(gas x 1.10, 50 bps), cap 300 bps)`. If the cap cannot cover raw gas cost the quote is refused
(`amount_too_small`). Non-stable tokens are unsupported in v1.

Top-level options added by the hardening pass (all optional; defaults in parentheses):

| Key | Meaning |
|---|---|
| `trustProxy` (`[]`) | CIDRs of reverse proxies. `X-Forwarded-For` is honoured **only** when the TCP peer is inside one of them; the client is then the rightmost entry that is not itself a trusted proxy. Empty or a non-proxy peer: the header is ignored (spoofing it has no effect). `/0` networks are refused. Replaces the removed `trustProxyHops`. IPv6 clients are rate-limited by /64. |
| `rateLimit.quotePerMinute`, `quoteBurst` (300, 60) | global budget for `/v1/quote` shared by all callers, on top of the per-IP limit; quote gas prices are also cached `gas.quoteCacheSeconds` (5) |
| `breaker.halfOpenTimeoutSeconds` (30) | a half-open probe that has not resolved by then re-opens the breaker |
| `abuse.ownerMaxFailures`, `destinationMaxFailures`, `windowSeconds` (3, 5, 3600) | costly failures (mined revert, state changed between the two simulations, owner cannot cover the amount) allowed per owner / per destination per window before further sweeps are refused with 429 `failure_budget_exceeded` |
| `gas.coverPercent` (100) | `sweep.fee` must be at least this percent of the gas cost, at quote time and again at send time |
| `gas.maxMovePercent` (25) | reject (`gas_price_moved`) when the gas price rose more than this between job start and send |
| `server.*` | `headersTimeoutMs` (10000), `requestTimeoutMs` (15000), `keepAliveTimeoutMs` (5000), `bodyTimeoutMs` (5000, slow-body 408), `maxConnections` (1024), `maxConnectionsPerIp` (64; per peer, IPv6 by /64; trusted proxies exempt), `maxHeadersCount` (50; surplus headers are dropped by Node) |
| `metrics.enabled`, `metrics.bearerTokenEnv` | see "Metrics" |
| `alerts.webhookUrl` or `alerts.webhookUrlEnv`, `alerts.cooldownSeconds` (900) | see "Alerts" |

## Alerts and metrics

### Alerts (low balance, error rate)

Set `alerts.webhookUrl` (or `alerts.webhookUrlEnv` to keep the URL, which may embed a token, out of the file). The relayer
POSTs a small JSON document when:

| `kind` | `severity` | When |
|---|---|---|
| `low_balance` | `critical` | hot-key balance is below `minBalanceWei` (the breaker also opens) |
| `balance_warning` | `warning` | balance is below twice `minBalanceWei` |
| `error_rate` | `critical` | RPC/send failures opened the circuit breaker |

Payload, in full: `{"source":"ghostpay-relayer","kind":"low_balance","severity":"critical","chainId":11155111,"at":"<ISO time>"}`.
It contains no keys, addresses, amounts, URLs or user data. Each kind/chain pair is sent at most once per
`alerts.cooldownSeconds`; delivery is fire-and-forget (failures are logged by class only, never the URL). A background
monitor polls the balance every 60 s, so the low-balance alert does not depend on user traffic.

SSRF safety: the URL must be `https`, carry no credentials, and name a public host (no `localhost`, single-label names,
`.local`/`.internal`/`.lan`..., or private/loopback/link-local/CGNAT/multicast/documentation IP literals); this is checked
at startup. At connection time the resolver result is checked again and the connection is refused if **any** returned
address is non-public (DNS rebinding defence). Redirects are not followed, there is a 5 s timeout, and no
`Authorization` header is sent (put a token in the URL path of your webhook if the receiver needs one). Slack-compatible
receivers expect a `text` field: put a small adapter (or an ntfy/Alertmanager-webhook bridge) in front.
The in-code interface is `AlertSink { notify(alert) }`, so a different transport can be injected via `buildRelayer({ alertSink })`.

### Metrics

`"metrics": {"enabled": true, "bearerTokenEnv": "METRICS_TOKEN"}`; the variable must hold 32-256 URL-safe characters and
requests need `Authorization: Bearer <token>` (constant-time compare; 401 otherwise; IP rate limited like other routes).
Without a token, metrics may only be enabled on a loopback listen host and a request carrying `X-Forwarded-For` is refused,
but do not rely on that: block `/metrics` at the reverse proxy unless the scraper is on the same trust boundary.
Series (counters unless noted): `ghostpay_relayer_http_requests_total{route,status}`,
`ghostpay_relayer_errors_total{class}`, `ghostpay_relayer_sweeps_total{chain,result}` (sent, reverted, send_failed,
receipt_timeout), `ghostpay_relayer_failed_gas_wei_total{chain}`, `ghostpay_relayer_alerts_total{kind}`, and gauges
`ghostpay_relayer_breaker_state{chain}` (0 closed, 1 half_open, 2 open), `ghostpay_relayer_hot_balance_wei{chain}`,
`ghostpay_relayer_daily_budget_used_wei{chain}`, `ghostpay_relayer_daily_budget_limit_wei{chain}`,
`ghostpay_relayer_queue_pending{chain}`. There are no address, IP, hash or amount labels; the series count is capped.
Suggested alerts: `breaker_state > 0` for 5 minutes, `rate(failed_gas_wei_total)` above your tolerance,
`hot_balance_wei < 2 * minBalanceWei`.

### Rotating the quote secret

1. Generate a new 32+ byte secret; keep the old one. 2. Deploy with `QUOTE_SECRET_FILE` = new and
`QUOTE_SECRET_PREVIOUS_FILE` = old. New quotes carry the new key id; quotes signed under the old key still verify.
3. After `quoteTtlSeconds` (at most 600 s) remove `QUOTE_SECRET_PREVIOUS_FILE` and restart. The relayer refuses to start if a
secret equals the hot key, starts with its bytes, or if previous equals current.

## Run

```
npm run build -w @ghostpay/relayer
RELAYER_KEY_FILE=/etc/ghostpay/hot.key QUOTE_SECRET_FILE=/etc/ghostpay/quote.secret \
RELAYER_CONFIG=/etc/ghostpay/relayer.config.json node apps/relayer/dist/main.js
```

**Always run behind a TLS-terminating reverse proxy** (nginx, Caddy, a cloud load balancer) that also applies per-IP
connection and request limits; the built-in caps (`server.*`) are a backstop, not a substitute. Bind the relayer to
loopback or a private network (in a container publish the port on `127.0.0.1` only) and list the proxy's network in
`trustProxy` so rate limits see the real client; without it `X-Forwarded-For` is ignored. `SIGTERM`/`SIGINT` start a graceful
drain: `/healthz` answers `shutting_down` (503) and keeps answering, new work is refused with `Connection: close`, queued
and in-flight transactions settle, and everything is force-closed after `shutdownGraceSeconds`. A stuck transaction is
not replaced or cancelled (no fee-bump routine): the lane waits `receiptTimeoutSeconds`, re-reads the pending nonce and
carries on; watch `queue_pending` and the hot-key nonce. Deployment: `Dockerfile` (distroless, non-root; build from the repo root) and
`deploy/ghostpay-relayer.service`.

## Threat notes

- **Privacy-preserving by construction, not by promise:** logs can only carry `requestId, route, status, chainId, txHash,
  errorClass`; raw IPs are hashed with a rotating in-memory salt; nothing is persisted. See `PRIVACY.md`. The relayer
  and its RPC provider do see owner, destination and amount of each sweep (inherent; documented).
- **Cannot redirect funds:** the order is signed by the stealth key and verified on-chain; the relayer can only decline
  or delay. A malicious operator can censor and can observe, and can send a sweep later than the user expected
  (deadline <= 30 min bounds that).
- **Drain protection:** per-IP (IPv6 by /64, `X-Forwarded-For` only from configured proxies), per-owner and global-quote
  token buckets (bounded LRU), on-chain pre-check of nonce/balance/allowance, simulation immediately before every send (twice,
  with a fresh gas price), gas price cap and move bound, gas limit cap, fee-covers-gas check at quote and send time,
  per-chain daily budget that counts the gas of reverted transactions, per-owner and per-destination failure budgets,
  balance floor, error-rate breaker with a self-resolving half-open probe (user errors never count against it), one in-flight
  transaction per chain with a bounded queue, 16 KiB body cap, header/request/body timeouts, connection caps.
  Residual risk (S3-06): an attacker with many funded one-time addresses and many destinations can still make the relayer pay
  gas for a bounded number of front-run reverts; the cost is capped by the daily budget and failure budgets, not eliminated
  (private transaction submission and a fee pre-commitment would be needed to remove it).
- **Quote integrity:** HMAC binds the whole order; tampering or replaying across chains/tokens/owners fails.
- **Not covered:** per-owner limits apply to `/v1/sweep` only (quotes are unauthenticated: IP-limited plus a global budget); a distributed
  attacker with many IPs is bounded by the budget, queue and breaker, not by rate limits; in-memory state means a restart
  resets limits and budget counters (the daily budget is then per process-day, not persisted); there is no sanctions
  screening unless the operator supplies a `PolicyGate` (default allows all, ADR-0006).
- **Hot key:** keep the balance low (the `minBalanceWei` floor opens the breaker). The key is used only to sign these
  transactions; the contract moves tokens `owner -> destination/feeTo` and never holds them.

## Tests

`npm test -w @ghostpay/relayer` (vitest, coverage thresholds 95/90/95/95 enforced). Unit and in-process HTTP tests
use an injected fake chain client; `src/chain.test.ts` drives the real viem client against a fake JSON-RPC transport;
`src/e2e.anvil.test.ts` deploys the compiled `GhostPaySweepRelayer` and `PermitToken` from `packages/contracts/out` on a
local anvil and sweeps through the relayer (skipped when anvil or the artifacts are missing, **unless `REQUIRE_ANVIL=1`, in
which case a missing anvil or missing `forge build` output fails the run**; `ANVIL_BIN` overrides
`/home/user/tools/foundry/anvil`; run `forge build` in `packages/contracts` first). The anvil test uses throwaway keys and `anvil_setBalance`.

## Unverified

No test against a public testnet RPC; no load test; Docker image and systemd unit were not built or run in the authoring
sandbox; mainnet behaviour (manifest + `ALLOW_MAINNET`) is covered by config tests only; gas units in the example config
are placeholders.
