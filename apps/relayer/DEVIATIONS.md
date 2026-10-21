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
5. **Quote token format** `v1.<expiresAt>.<fee>.<mac>` (fee readable inside the token so the server stays stateless).
   Expired quote is HTTP 410; tampered/malformed is 400; the spec lists no codes for these.
6. **Signature is exactly 65 bytes.** The contract's `ECDSA.recover` also accepts 64-byte EIP-2098 signatures; the
   relayer rejects them in validation. High-s signatures and `v` of 0/1 are rejected up front as `invalid_signature`
   (the contract's OpenZeppelin `ECDSA.recover` reverts on both), before any RPC call; previously they recovered fine here
   and failed only in the simulation. The permit signature is the token's business and is not checked.
7. **One in-flight transaction means one per receipt.** The lane slot is held until the receipt (or
   `receiptTimeoutSeconds`), so throughput is about one sweep per block per chain. The HTTP response is sent as soon as the
   transaction is broadcast. After a timeout or send failure the nonce is re-read from the pending count.
8. **Legacy (`gasPrice`) transactions** so the configured cap bounds the price on every chain type. EIP-1559 is not used.
9. **Per-owner rate limit is applied after signature verification** so nobody can exhaust a victim's quota with forged
   requests; `/v1/quote` is IP-limited only.
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
17. **Fee recipient vs manifest.** With a deployment manifest loaded, `feeTo` must equal the manifest `feeRecipient`
    (docs/FEE_SCHEDULE.md) and defaults to it; startup is refused otherwise. The earlier hot-key default now only applies
    to chains without a manifest (dev chain). `docs/APP_AND_RELAYER_SPEC.md` only says `sweep.feeTo == relayer feeTo`, which
    still holds. The example config no longer sets `feeTo`.
18. **Funding pre-check before the lane.** `POST /v1/sweep` reads the owner's token balance (and allowance, unless a permit
    is supplied) before taking a lane slot, so fresh signing keys with no funds cannot occupy the lane or probe the breaker.
    Costs two `eth_call`s per accepted-so-far request (bounded by the IP limiter). A funded owner who can still make the
    simulation revert can use the lane; that is covered by the owner and IP limits only.
19. **Fee vs gas is re-checked at send time** (RA-FG-3). Inside the lane the signed `fee` must still be at least the gas
    cost of one sweep (configured gas units x current `eth_gasPrice`, converted like the quote) or the sweep is refused with
    `fee_below_gas` (422, before the simulation, not counted by the breaker). A quote carries a 10 % margin (more for small
    amounts, where the 50 bps floor dominates), so ordinary gas noise passes; a larger rise inside the quote TTL makes the
    client re-quote. Replaces the earlier "absorb it, bounded by the cap and budget" behaviour.
20. **Breaker probe.** A half-open probe that ends without an RPC outcome (gas cap, budget, gas limit) gives its slot back
    (`releaseProbe`); a user-caused simulation revert counts as success. `/healthz` reports `degraded` unless some chain is closed.
21. **Gas-price and funding RPC failures feed the breaker.** `eth_gasPrice` (quote or sweep) and the pre-lane funding
    check failing now count as operational failures, so a dead RPC opens the breaker and `/healthz` turns 503/`degraded`
    instead of staying `ok` while every client waits out the RPC timeout.
22. **Mined reverts.** After a reverted receipt the sweep is re-simulated once: if that reverts too (order consumed by a
    front-runner, expired) it is logged `mined_revert_front_run` and does NOT count against the breaker (RA-CB-5); otherwise
    (`mined_revert`, or the re-simulation itself failed) it counts as before. The relayer still pays the gas of a front-run
    revert; that loss is bounded only by `dailyBudgetWei`.
23. **Receipt timeout.** The lane slot is released as before, but the daily-budget reservation is now reconciled off-lane:
    up to two more receipt waits; a receipt releases the unused part, none releases the whole reservation
    (`receipt_unresolved`). A transaction that lands after that is unaccounted (at most one transaction's gas each). Releases
    for a previous UTC day are dropped. Nothing is reconciled once shutdown has begun (budget is process-local).
24. **Per-client lane cap.** `queue.maxPerClient` (default 3/4 of `maxPending`, min 1) bounds the lane slots one hashed
    client IP can hold; beyond it `client_queue_full` (429). It limits one address, not a botnet or a proxy collapsing all
    users into one address (`trustProxyHops` 0 behind a proxy).
25. **Client IP.** `X-Forwarded-For` is honoured only with `trustProxyHops > 0`, using the rightmost-trusted entry, and only
    if it is an IP literal (IPv4-mapped IPv6 folded to IPv4); `trustProxyHops > 0` with a public-IP `listen.host` is refused
    at startup. Wildcard binds are still allowed (containers), so keeping the port unreachable except via the proxy stays
    the operator's duty. IPv6 clients are still keyed per full address, not per /64.
26. **Logging is best effort.** A throwing sink, an `'error'` event on stdout (ENOSPC, EPIPE) or a destroyed stream drops the
    line instead of crashing the process.
27. **Slow clients.** Node checks `headersTimeout`/`requestTimeout` only every `connectionsCheckingInterval` (30 s by
    default); it is now 1 s, so 10 s/15 s are enforced within about a second. `maxConnections` stays 1024 with no per-IP
    connection cap: do that at the proxy/firewall.
