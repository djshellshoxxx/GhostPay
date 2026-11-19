# Deviations, assumptions and findings (apps/relayer)

Contract code wins over docs. Items for the lead to confirm or reject.

1. **`chainId` is a top-level field of `POST /v1/sweep`.** The spec body is `{sweep, sweepSig, permit?, quoteToken}`, but
   the `Sweep` struct has no chain id and the relayer serves several chains. The chain also selects the EIP-712 domain.
2. **Native price source is explicitly configured.** Each chain selects exactly one of fixed `nativeUsdPrice` or
   `nativeUsdFeed`, which uses the existing sourced native-symbol/USD registry entry and refuses a missing entry.
   Feed mode validates round data, decimals and freshness and never falls back to the fixed price; the stablecoin
   conversion still assumes 1.0 USD. Quotes use configured `gasUnits` and live gas price, while execution performs
   fresh per-order simulations. OP L1/operator reserves are also included as described below. No feed address or
   price source is inferred or activated by default; live feed/depeg qualification remains an operator prerequisite.
3. **Additional rejection: `sweep.fee` above the 300 bps cap** (`fee_above_cap`). The spec only requires `fee >= quote.fee`;
   the cap is the published policy and what the client refuses (`assertSponsorFeeAcceptable`).
4. **Quote refused when even the capped fee cannot cover raw gas cost** (`amount_too_small`); not in the spec, avoids
   guaranteed-loss sweeps.
5. **Quote token format** `v2.<keyId>.<expiresAt>.<fee>.<mac>` (fee readable inside the token so the server stays stateless;
   a verify-only previous key can be configured for one quote-TTL rotation window).
   Expired quote is HTTP 410; tampered/malformed is 400; the spec lists no codes for these.
6. **Signature is exactly 65 bytes.** The HTTP parser requires `r || s || v`; admission requires low `s` and
   `v` equal to 27 or 28 before any chain call. A malformed or noncanonical signature is refused as
   `invalid_signature` instead of consuming a simulation (LF-074edb61e-7).
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
12. **Optional policy manifest fields are supported.** The validated nested `policy` object is accepted; unknown keys
    remain rejected. Startup readback checks the implementation and factory runtime hashes when that object is present,
    as well as the router/relayer hashes, router fee fields and known-chain canonical announcer. An explicitly configured
    secondary must agree on those reads. This validates deployment metadata; it does not add a policy-account relay method.
13. **Dependencies:** `viem`, `@ghostpay/chain-adapters`, `@ghostpay/relayer-guard` and `@ghostpay/metadata-hardening`,
    plus Node built-ins. `package.json` currently pins `@types/node` 26 while `engines` says Node >= 22; executable
    compatibility is qualified with the configured Node version rather than inferred from type-package versioning.
14. **`/healthz`** answers 503 when every chain breaker is open or during shutdown (orchestrator-friendly); the spec just says
    `GET /healthz`. HSTS is sent although TLS terminates upstream (harmless there).
15. **Balance alerts** emit the fixed `low_balance` alert and `breaker_tripped_low_balance` log event; breaker transitions
    also update metrics. The optional configured HTTPS/HMAC webhook can deliver alerts, while the default sink is silent.
    Real webhook delivery and Prometheus scraping remain separate operational acceptance; no pager service is assumed.
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
- Option C (`PermitSkipped` event) needs a contract change and is not done. The current required-Anvil selection includes
  permit front-running, owner-sweeps-first loss accounting and restart coverage; it passed as part of the 246-case
  combined run at `6fe060e3`. This is local controlled-chain evidence, not public-chain acceptance.

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
- Quote-path RPC failures (LF-074edb61e-1): `breaker.minSamples` consecutive failed `/v1/quote` gas price reads, with
  no good read in between, trip a closed breaker, so an outage that only quotes see still opens it and degrades
  `/healthz`. Quote reads are kept out of the breaker's count window: their successes would dilute send and receipt
  failures, and failures alone would pile up there with no time decay (isolated blips hours apart would open it).
  Residual: a flaky RPC whose quote reads fail often but never `minSamples` times in a row does not open the breaker
  from the quote path; in-lane reads still count each failure. Quote failures neither take the half-open probe nor
  extend an open breaker's cooldown. The quote path has no funding read today; source-check and price-feed refusals
  stay neutral on both paths, as in the lane.
- `feeTo` pinned to the manifest (R07-2, LF-2d64ee5c3-2): with a signed deployment manifest for the chain, a `feeTo`
  (or the hot key under `allowFeeToHotKey`) that is not the manifest's top-level `feeRecipient` stops startup. The web
  client refuses quotes whose `feeTo` differs, so such a relayer could only ever refuse. Without a manifest (testnet,
  dev chain) `feeTo` is the operator's choice. `deploy/config/relayer.config.example.json` (outside this directory)
  carries a placeholder `feeTo`; an operator with a manifest must set it to the manifest's recipient.
- OP Stack total fees (R07-4, implemented in the dedicated 2026-11-19 follow-up): quotes, fee coverage and both
  reservations now include twice the oracle's L1-data/operator fee estimate. Quotes bound unsigned legacy RLP size
  through `getL1FeeUpperBound`; send-time checks price the actual selected sweep shape and recheck the exact signed
  transaction's unsigned envelope before broadcast. Actual receipt L1 fees and canonical-receipt-block operator
  fees are charged once at settlement, including overages; missing data keeps reservations held. The existing
  predeploy, 2x margin, configured RPC, quote ABI, fee cap and journal privacy are preserved. No fork fee formula is
  duplicated. Residuals: the size oracle is a practical compression estimator; the margin cannot guarantee future
  fee movements; OP RPCs must supply L1 receipt fees, all required getters and canonical-block calls. Missing or
  reverting getters fail closed, including older deployments without `getOperatorFee`. Local controlled OP RPC
  tests and non-OP Anvil tests do not qualify a public OP chain. See README's R07-4 section and the scoped evidence
  packet for exact tests, sources and remaining external acceptance.
- Receipt-status admission (inherited R07 error-path defect, separately reproduced and corrected during review):
  viem can format missing/unknown RPC status as null/undefined despite its declared receipt type. Both receipt
  methods now require exact `success`/`reverted` before any fee read or settlement. Malformed status leaves the
  transaction unsettled on OP and non-OP chains; valid success/revert behavior is preserved. This predates R07-4.
