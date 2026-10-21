# Deviations, assumptions and findings (apps/relayer)

Contract code wins over docs. Items for the lead to confirm or reject.

1. **`chainId` is a top-level field of `POST /v1/sweep`.** The spec body is `{sweep, sweepSig, permit?, quoteToken}`, but
   the `Sweep` struct has no chain id and the relayer serves several chains. The chain also selects the EIP-712 domain.
2. **Fee price inputs are configuration, not oracles (still true: `FEEDS` in `chain-adapters/src/quote.ts` is empty).** The
   native-coin USD price is a fixed operator value (`nativeUsdPrice`) and the stablecoin is fixed at 1.0 USD, so the spec's
   "live ... token price" is NOT implemented. The quote's gas term is operator-set `gasUnits` x `eth_gasPrice` (the price is
   cached up to `gas.quoteCacheSeconds`, default 5 s, to bound RPC cost of unauthenticated quotes). Since the hardening pass
   the real per-order gas estimate is also used, but only as a safety check at send time: after the second simulation the
   `sweep.fee` must cover `gasEstimate x fresh gasPrice x gas.coverPercent` or the sweep is refused (`fee_below_gas_cost`),
   and a gas price that rose more than `gas.maxMovePercent` is refused (`gas_price_moved`). The `GasPriceSource` and
   `TokenPriceSource` interfaces allow an oracle later. No numeric defaults are shipped for the operator economics (no
   invented measurements).
3. **Additional rejection: `sweep.fee` above the 300 bps cap** (`fee_above_cap`). The spec only requires `fee >= quote.fee`;
   the cap is the published policy and what the client refuses (`assertSponsorFeeAcceptable`).
4. **Quote refused when even the capped fee cannot cover raw gas cost** (`amount_too_small`); not in the spec, avoids
   guaranteed-loss sweeps.
5. **Quote token format** `v2.<keyId>.<expiresAt>.<fee>.<mac>` since the hardening pass (item 18; was `v1.<expiresAt>.<fee>.<mac>`); the fee is readable inside the token so the server stays stateless.
   Expired quote is HTTP 410; tampered/malformed is 400; the spec lists no codes for these.
6. **Signature is exactly 65 bytes.** The contract's `ECDSA.recover` also accepts 64-byte EIP-2098 signatures; the
   relayer rejects them in validation. High-s signatures pass recovery here and are rejected by the simulation
   (`invalid_signature` class, as the contract reverts with `ECDSAInvalidSignatureS`).
7. **One in-flight transaction means one per receipt.** The lane slot is held until the receipt (or
   `receiptTimeoutSeconds`), so throughput is about one sweep per block per chain. The HTTP response is sent as soon as the
   transaction is broadcast. After a timeout or send failure the nonce is re-read from the pending count.
8. **Legacy (`gasPrice`) transactions** so the configured cap bounds the price on every chain type. EIP-1559 is not used.
9. **Per-owner rate limit is applied after signature verification** so nobody can exhaust a victim's quota with forged
   requests; `/v1/quote` is limited per IP (IPv6 by /64) and by a global quote budget, not per owner (an owner field in an
   unauthenticated request is not an identity). `X-Forwarded-For` is honoured only from CIDRs listed in `trustProxy`
   (`trustProxyHops` was removed; S3-07).
10. **Mainnet gate.** `chain-adapters` marks mainnets `enabled: false` until manifests exist. The relayer starts a mainnet
    chain only with a valid manifest in `DEPLOYMENTS_DIR` AND `ALLOW_MAINNET=1`, and then does not consult the `enabled`
    flag. No mainnet token is in the adapter allowlist, so mainnet tokens must be listed in the relayer config with
    symbol/decimals/permit, which are NOT verified by this package.
11. **Local development chain 31337** (not in `CHAINS`) is accepted only with `allowDevChain: true`; plain-http RPC
    only for loopback with `allowInsecureLocalhostRpc: true`.
12. **(Resolved, kept for history.)** Optional `policy*` manifest fields used to make `loadDeployment` reject the manifest
    and so stop the relayer; chain-adapters commit `1664d8b` now accepts and validates them (all-or-none), and the relayer
    ignores them. Audit 01 section 5 row 8 recorded the stale text.
13. **Dependencies (unchanged by the hardening pass: Node built-ins and `viem` only):** `viem` and the workspace package `@ghostpay/chain-adapters` only (plus Node built-ins). The
    pre-existing `package.json` pins `@types/node` 26 while `engines` says Node >= 22; left as found. `package.json`
    scripts were edited (`lint --config ../../eslint.config.js`, `build`, `start`), no dependency was added.
14. **`/healthz`** reports `ok` (200), `degraded` (200, some chain `open`/`half_open`), `unhealthy` (503, every chain
    `open`/`half_open`) or `shutting_down` (503); it keeps answering while draining. The spec just says `GET /healthz`. HSTS is
    sent although TLS terminates upstream (harmless there).
15. **Alerts and metrics (G-11, R-08):** a webhook alert hook (`alerts.webhookUrl`, https only, public hosts only, payload
    without secrets or user data, throttled), a 60 s balance monitor and an optional Prometheus `/metrics` endpoint behind an
    optional bearer token. Not shipped: a pager integration, an alert on stuck transactions or daily-budget burn (use the
    metrics for those), delivery retries (one attempt per throttle window).
16. **Coverage scope:** `src/main.ts` (process wiring, signal handlers) is excluded from coverage; its refuse-to-start paths
    were smoke-tested manually against a built `dist`, not by the test suite.
17. **Griefing controls beyond the spec (S3-05/S3-06):** on-chain pre-check (nonce, balance, allowance) and a second simulation
    right before the send; per-owner / per-destination failure budgets; user-attributable failures (including a mined revert
    after two clean simulations) do NOT count toward the breaker, only RPC/send failures do; a half-open probe is released on
    every non-verdict exit and times out (`breaker.halfOpenTimeoutSeconds`). Residual risk: front-run reverts by many fresh
    owners and destinations still cost gas up to the daily budget; private submission or a fee pre-commitment is not implemented.
18. **Quote token is `v2.<keyId>.<exp>.<fee>.<mac>`** (S3-20/S3-21): canonical decimals only, key id derived from the secret,
    optional verify-only previous secret for rotation. The `v1.` format of earlier builds is no longer accepted (outstanding
    quotes expire within `quoteTtlSeconds` anyway). Startup refuses a quote secret equal to, or beginning with, the hot key.
    `apps/web/src/lib/relayerClient.ts` treats the token as an opaque `[A-Za-z0-9._~+/=-]` string, so no client change is needed.
19. **Operations (S3-18):** `feeTo` is mandatory and may not be the hot key (opt-in `allowFeeToHotKey`) or a precompile address;
    secret files must not be symlinks and must be owned by the service user or root; plain-environment secrets are refused under
    `NODE_ENV=production` unless `ALLOW_SECRET_ENV=1`; process-level `uncaughtException`/`unhandledRejection` handlers print a
    fixed class only; per-peer connection cap, body read timeout, `maxHeadersCount`; Dockerfile gained a healthcheck and the
    loopback-publish guidance; the systemd unit gained the sandboxing options from `systemd-analyze security` and uses
    `LoadCredential=` so an unprivileged service user can read root-owned secrets. Not done: automatic fee-bump / cancel of a
    stuck transaction (S3-18 f), digest-pinned base images, a measured `systemd-analyze security` score for the new unit.

## Spec vs code delta list (`docs/APP_AND_RELAYER_SPEC.md` section 3)

| Spec statement | Code | Status |
|---|---|---|
| `POST /v1/quote` fee "using a live gas estimate and token price" | operator `gasUnits` x cached `eth_gasPrice`; native price and stablecoin price are constants (item 2) | Deviates (no oracle) |
| `POST /v1/sweep` body `{sweep, sweepSig, permit?, quoteToken}` | plus top-level `chainId` (item 1) | Deviates |
| quote token "HMAC over the quote" | `v2.<keyId>.<exp>.<fee>.<mac>`, canonical, dual-key rotation (item 18) | Compatible, more specific |
| verifies quote, `fee >= quote`, `feeTo`, allowlists, deadline <= 30 min, signer == owner | same, plus `fee_above_cap` (item 3) | Done + extra |
| "simulates via `eth_call`/`estimateGas`" | pre-check reads, simulation, then a second simulation with fresh gas price immediately before the send (item 17) | Done + stricter |
| "enforces gas price cap and daily budget" | plus gas price move bound, fee-covers-gas check at quote and send time, gas of reverted transactions counted | Done + stricter |
| `GET /healthz`, `GET /v1/info` | `/healthz` has four states (item 14); `GET /metrics` added, off by default (item 15) | Done + extra |
| "rate limits per IP-bucket and per owner address" | per IP (IPv6 /64, XFF only from `trustProxy`), per owner after signature proof, global quote budget, per-owner / per-destination failure budgets | Done + extra |
| "circuit breaker when balance low or error rate high" | yes; half-open probe settles on every path and times out; user errors never count (item 17) | Done |
| "balance alerts" | webhook alert hook + monitor + metrics (item 15) | Done (no pager integration) |
| "Hot key from env or file (mode 600), never logged" | file preferred (no symlink, owner check); env value refused in production unless `ALLOW_SECRET_ENV=1` (item 19) | Done, stricter |
| "IP stored only as a rotating salted hash <= 24 h" | true for the relayer's rate-limit state; the per-peer connection counter holds the peer address while connections are open; the reverse proxy sees raw IPs (see `PRIVACY.md`) | Done, precision added |
| "Failure modes: RPC down (503), revert (422), budget (429/503), replay (409)" | all present, plus 408, 401 (`/metrics`), 429 `failure_budget_exceeded` / `rate_limited_quote` | Done + extra |
| "Compliance hook `PolicyGate`" | unchanged, default allow-all | Done |
| "Node 22, `viem` only plus Node built-ins" | unchanged | Done |
