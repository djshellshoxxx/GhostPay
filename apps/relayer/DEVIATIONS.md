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

## relayer-guard wiring (audit S3-05, S3-06, S3-07)

- `trustProxyHops` was removed in favour of `trustedProxies` (CIDR list): a hop count cannot tell a real proxy from a client that reached the port directly. Operators must migrate their config; an unknown `trustProxyHops` key is rejected at startup.
- A mined revert after a passing simulation is treated as attacker-attributable (neutral for the breaker) and charged to the loss budget. A genuine relayer-side revert (for example wrong gas) therefore no longer opens the breaker; it shows up as `relayer_mined_reverts_total` and as `mined_revert` alerts instead. There is no re-simulation at the inclusion block to tell the two apart.
- Loss budget keys: client network bucket (IPv4 /32, IPv6 /64) and destination, hashed with the rotating salt. Rotation (default daily) forgets the accounting; the per-window default is 1 hour. Defaults (0.005 / 0.05 native units) are not tuned for any chain.
- The challenge module of relayer-guard is not wired.
- `/metrics` and the alert webhook have only been exercised with fakes (no Prometheus scrape, no real webhook receiver). `/healthz` now reports `degraded` for any non-closed breaker.
- `getGasPrice` on the quote path is cached for 3 s (not on the sweep path).
