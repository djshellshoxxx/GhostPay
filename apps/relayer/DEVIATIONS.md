# Deviations, assumptions and findings (apps/relayer)

Contract code wins over docs. Items for the lead to confirm or reject.

1. **`chainId` is a top-level field of `POST /v1/sweep`.** The spec body is `{sweep, sweepSig, permit?, quoteToken}`, but
   the `Sweep` struct has no chain id and the relayer serves several chains. The chain also selects the EIP-712 domain.
2. **Fee price inputs are configuration, not oracles.** `chain-adapters` ships an empty Chainlink feed registry, so
   the native-coin USD price is a fixed operator value (`nativeUsdPrice`), the stablecoin is fixed at 1.0 USD, and
   the gas estimate is operator-set `gasUnits` x live `eth_gasPrice` (not a per-order estimate). The `GasPriceSource` and
   `TokenPriceSource` interfaces allow an oracle later. No numeric defaults are shipped for these (no invented measurements).
3. **Additional rejection: `sweep.fee` above the 300 bps cap** (`fee_above_cap`). The spec only requires `fee >= quote.fee`;
   the cap is the published policy and what the client refuses (`assertSponsorFeeAcceptable`).
4. **Quote refused when even the capped fee cannot cover raw gas cost** (`amount_too_small`); not in the spec, avoids
   guaranteed-loss sweeps.
5. **Quote token format** `v2.<keyId>.<expiresAt>.<fee>.<mac>` (fee readable inside the token so the server stays stateless;
   a verify-only previous key can be configured for one quote-TTL rotation window).
   Expired quote is HTTP 410; tampered/malformed is 400; the spec lists no codes for these.
6. **Signature is exactly 65 bytes.** The contract's `ECDSA.recover` also accepts 64-byte EIP-2098 signatures; the
   relayer rejects them in validation. High-s signatures pass recovery here and are rejected by the simulation
   (`invalid_signature` class, as the contract reverts with `ECDSAInvalidSignatureS`).
7. **One in-flight transaction means one per receipt.** The lane slot is held until the receipt (or
   `receiptTimeoutSeconds`), so throughput is about one sweep per block per chain. The HTTP response is sent as soon as the
   transaction is broadcast. After a timeout or send failure the nonce is re-read from the pending count. A receipt
   timeout is recorded as a breaker failure and alerted; the transaction's reservations are kept until a later job's
   receipt lookup finds it (L5-06). Fee bumping or cancelling a stuck transaction is not implemented.
8. **Legacy (`gasPrice`) transactions** so the configured cap bounds the price on every chain type. EIP-1559 is not used.
9. **Per-owner rate limit is applied after signature verification** so nobody can exhaust a victim's quota with forged
   requests; `/v1/quote` is limited per client network only (per IP, per /24 or /48 group, and process-wide).
10. **Mainnet gate.** `chain-adapters` marks mainnets `enabled: false` until manifests exist. The relayer starts a mainnet
    chain only with a valid manifest in `DEPLOYMENTS_DIR` AND `ALLOW_MAINNET=1`, and then does not consult the `enabled`
    flag. No mainnet token is in the adapter allowlist, so mainnet tokens must be listed in the relayer config with
    symbol/decimals/permit, which are NOT verified by this package.
11. **Local development chain 31337** (not in `CHAINS`) is accepted only with `allowDevChain: true`; plain-http RPC
    only for loopback with `allowInsecureLocalhostRpc: true`.
12. **Manifest incompatibility found:** `deployments/README.md` now documents optional `policy*` manifest fields, but
    `loadDeployment`/`validateManifest` in `chain-adapters` rejects unknown keys, so a manifest containing them makes the relayer
    refuse to start until chain-adapters is updated. Not changed here (out of ownership).
13. **Dependencies:** `viem` and the workspace package `@ghostpay/chain-adapters` only (plus Node built-ins). The
    pre-existing `package.json` pins `@types/node` 26 while `engines` says Node >= 22; left as found. `package.json`
    scripts were edited (`lint --config ../../eslint.config.js`, `build`, `start`), no dependency was added.
14. **`/healthz`** answers 503 when every chain breaker is open or during shutdown (orchestrator-friendly); the spec just says
    `GET /healthz`. HSTS is sent although TLS terminates upstream (harmless there).
15. **Balance alerts** are limited to a log event (`breaker_tripped_low_balance`) and the breaker; there is no pager/metrics
    integration.
16. **Coverage scope:** `src/main.ts` (process wiring, signal handlers) is excluded from coverage; its refuse-to-start paths
    were smoke-tested manually against a built `dist`, not by the test suite.

## relayer-guard wiring (audit S3-05, S3-06, S3-07)

- `trustProxyHops` was removed in favour of `trustedProxies` (CIDR list): a hop count cannot tell a real proxy from a client that reached the port directly. Operators must migrate their config; an unknown `trustProxyHops` key is rejected at startup with an error that names it and points to `trustedProxies` (L5-07). The compose recipe in `deploy/` trusts its pinned backend subnet (L5-05).
- A mined revert after a passing simulation is treated as attacker-attributable (neutral for the breaker) and charged to the loss budget. A genuine relayer-side revert (for example wrong gas) therefore no longer opens the breaker; it shows up as `relayer_mined_reverts_total` and as `mined_revert` alerts instead. There is no re-simulation at the inclusion block to tell the two apart.
- Loss budget keys: client network bucket (IPv4 /32, IPv6 /64, grouped by /24 and /48) and destination, hashed with the rotating salt. Rotation (default daily) forgets the accounting; the per-window default is 1 hour. Defaults (0.005 / 0.05 native units) are not tuned for any chain. One reservation per sweep charges the global cap once (it used to be charged per key, so it tripped at half the configured loss, L5-02). The quarter of `globalWei` kept for clean sources and the mined-revert-rate thresholds (the breaker's) are constants, not config; neither is tuned.
- The challenge module of relayer-guard is not wired.
- Secret files reject symlinks and ownership outside the service user/root; production environment secrets require
  `ALLOW_SECRET_ENV=1`. Process-level failures print only a fixed class to avoid exposing RPC URLs.
- The alert webhook accepts only HTTPS public DNS/IP targets and checks all DNS answers again at connection time; redirects
  are not followed, preventing internal-address and DNS-rebinding targets.
- `/metrics` and the alert webhook have only been exercised with fakes (no Prometheus scrape, no real webhook receiver). `/healthz` now reports `degraded` for any non-closed breaker.
- `getGasPrice` on the quote path is cached for 3 s (not on the sweep path).

## Permit griefing (spec 04, relayer side)

- Fallback ladder is server-side and needs no client change: when the owner's allowance already covers the amount the permit is dropped and plain `sweep` is used (a front-run permit therefore succeeds); an expired permit with short allowance is refused (`permit_expired`) before simulation, and so is one whose deadline is before the sweep deadline (L5-01: the permit is outside the sweep signature and the quote MAC and the contract swallows a failed permit, so a permit that lapsed before inclusion was a mined revert the relayer paid for; no margin is added because clients sign `permit.deadline == sweep.deadline`); a generic transfer revert while the permit is still needed is reported as `permit_failed`. The relayer does not rebuild the token's EIP-712 domain (it has no domain name/version), so `sig_invalid` and `nonce_consumed` are not told apart: both are `permit_failed`.
- The per-owner failure counter reuses `FailureBudgets` with the owner key only (`destinationMax: 0`): a destination key would let anyone block a victim's destination with self-signed failing orders, and destinations are already covered by `lossBudget`. 3 strikes per hour; `nonce_used` is not a strike (honest retries). Constants, not config.
- `gas.griefReserveBps` defaults to 0 (UNVERIFIED, to be tuned per chain); it raises the gas term only and stays bounded by the 300 bps cap.
- `quoteTtlSeconds` is now capped at 60 (was default 120, max 600); configs above 60 are refused at startup. `relayer.config.example.json` updated.
- Option C (`PermitSkipped` event) needs a contract change and is not done. The anvil owner-drains-first / front-run e2e was not run here.

## Hardening restored after the 84c2c185 merge (R07, lost-fix scan)

- Logging is best effort (R07-3): `createLogger` drops a line whose sink throws, and `main.ts` writes through
  `createStdoutSink(process.stdout)`, which swallows stream `'error'` events (EPIPE, ENOSPC) and synchronous write
  errors. A failing log destination therefore loses lines instead of exiting the process. Lost lines are not counted
  or retried. An exit would keep only what the state journal persists (daily budget, unsettled transactions); the
  rate-limit buckets, loss budget, owner failure counter and breaker window are memory-only by design (PRIVACY.md).
- Per-peer connection cap (LF-6f25385ce-1, S3-18): `server.maxConnectionsPerIp` (default 64, 1..1024) bounds the open
  connections of one peer (IPv4 address, IPv6 /64) under the server-wide 1024. A connection over the cap is destroyed
  on accept, before any request is read, and counted as `relayer_connections_refused_total` (no log line, no address).
  Trusted proxies are exempt, so behind a proxy the per-client connection limit belongs to the proxy. The counter is
  keyed by an HMAC under a random per-process key and holds an entry only while that peer has an open connection.
- Per-client lane cap (LF-074edb61e-4, LF-2789f780b-2): `queue.maxPerClient` (default
  `min(maxPending, max(2, ceil(maxPending / 4)))`, 1..`maxPending`) bounds the sweeps one client network bucket (IPv4
  address, IPv6 /64, salted) holds, `429 client_queue_full`. The ticket is taken synchronously right after the cheap
  synchronous checks and before the first await (signature recovery), and is held until the lane job settles (receipt
  included), so concurrent requests cannot overshoot it. The map holds an entry only while a ticket is held. A salt
  rotation gives a client a fresh key, so at a rotation one client can briefly hold twice the cap. Clients that spread
  over many /64s or IPv4 addresses are bounded by `queue.maxPending`, the rate limits and the loss budget, not by this cap.
- No out-of-lane pre-simulation (LF-29de09c05-1, LF-2789f780b-3): the historical design ran a bounded `eth_call`
  before the lane (8 per chain, 2 per client, `503 busy`). Today's lane reads gas price, balance and the order state
  (owner balance, allowance, nonce) before any simulation, so a sweep from an unfunded throw-away key is refused after
  three cheap reads without simulating. The per-client fairness that the pre-simulation sub-limit gave is provided by
  the per-client ticket above, which also covers the awaits before the lane (signature recovery, `PolicyGate`). Not
  restored: a pre-simulation would add one `eth_call` per sweep and change the documented check order. Residual: a
  flood of doomed sweeps from many client buckets still occupies lane slots for a few reads each and can make honest
  sweeps get `503 queue_full`.
- Quote-path RPC failures (LF-074edb61e-1): a failed `/v1/quote` gas price read records one breaker failure through an
  unvalidated permit, so an outage that only quotes see still opens the breaker and degrades `/healthz`. Successful
  quote reads are not recorded (they would dilute send and receipt failures in the window), so isolated read
  failures accumulate until sweep outcomes push them out of the `breaker.windowSize` window. The quote path has no
  funding read today; source-check and price-feed refusals stay neutral on both paths, as in the lane.
- `feeTo` pinned to the manifest (R07-2, LF-2d64ee5c3-2): with a signed deployment manifest for the chain, a `feeTo`
  (or the hot key under `allowFeeToHotKey`) that is not the manifest's top-level `feeRecipient` stops startup. The web
  client refuses quotes whose `feeTo` differs, so such a relayer could only ever refuse. Without a manifest (testnet,
  dev chain) `feeTo` is the operator's choice. `deploy/config/relayer.config.example.json` (outside this directory)
  carries a placeholder `feeTo`; an operator with a manifest must set it to the manifest's recipient.
