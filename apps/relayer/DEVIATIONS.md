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
   relayer rejects them in validation. High-s signatures pass recovery here and are rejected by the simulation
   (`invalid_signature` class, as the contract reverts with `ECDSAInvalidSignatureS`).
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

## Audit round 3 fixes (apps audit part, 2026-10-21)

17. **N-01 admission control.** `sweep` now runs a stateless `simulateSweep` (`eth_call`) OUTSIDE the serial lane, with at most 8
    concurrent pre-simulations (`503 busy`), so junk sweeps from throw-away keys are answered `422` without ever taking a lane slot.
    A client (IP as seen by the server) may hold at most `ceil(0.75 * queue.maxPending)` lane slots (`429 rate_limited_ip`). Valid sweeps
    are simulated twice (pre-check plus in-lane, which stays authoritative). A failed pre-simulation counts as an operational failure for
    the breaker, and re-opens it immediately when it was the post-cooldown probe. Not done: caching gas price/balance reads, a
    `balanceOf(owner)` precondition read, and a trusted-proxy allowlist (see 20).
18. **N-02 fee floor at send time.** The lane re-prices `gasUnits * currentGasPrice` into token units and refuses `422 fee_below_cost`
    when the signed fee is lower. `quoteTtlSeconds` ceiling (600) is unchanged.
19. **N-03 / N-07.** Unparseable request targets answer `400 invalid_url`. Startup now refuses a `sweepRelayer` with no code on the RPC
    (`eth_getCode`). The bytecode-hash comparison was added later (see 21); periodic `eth_chainId` re-checks are still not done.
20. **N-08 config.** `trustProxyHops > 0` requires a loopback `listen.host` (127.x, `::1`, `localhost`); a reverse proxy on the same
    host is the supported topology. There is still no `trustedProxies` allowlist, so container deployments that must bind `0.0.0.0`
    cannot use `trustProxyHops` and fall back to the socket address.

21. **Manifest read-back at startup (N-07 remainder, 2026-10-21).** `ChainRuntimeConfig.manifest` keeps the validated manifest when one
    exists for the chain. `buildChainClients` then runs `verifyManifest` + `assertManifestVerified` (router `FEE_RECIPIENT`/`ANNOUNCER`/
    `FEE_BPS`, runtime code hashes of router and sweep relayer, announcer code) on the verified RPC and refuses to start with
    `MANIFEST_READBACK_FAILED` (stderr names the failed checks, no chain values; log lines `manifest_readback_failed`/`_ok`). The code hash is
    the POST-immutable runtime hash, as chain-adapters defines it. Limits: one RPC (no second-provider cross-check), done once at startup
    (no periodic re-check, so a later upgrade of a proxy-less contract is not noticed until restart), manifest signature not verified. Configs
    that name `sweepRelayer` without a manifest (dev/test only; mainnet requires a manifest) keep the older "has code" check and log
    `manifest_unverified` (warn). The anvil end-to-end test is still skipped here and does not cover the read-back.

