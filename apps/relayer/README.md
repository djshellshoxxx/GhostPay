# @ghostpay/relayer

Gas-sponsorship relay for `GhostPaySweepRelayer`. A stealth address that holds ERC-20 tokens but no gas signs an
EIP-712 `Sweep` order; this service quotes a fee (F-SPONSOR, `docs/FEE_SCHEDULE.md`), checks the order, simulates it,
and sends the transaction from a hot key. The contract, not this service, guarantees that destination, amount,
fee and `feeTo` are exactly what the owner signed. Spec: `docs/APP_AND_RELAYER_SPEC.md` section 3.

Node 22, ESM, strict TypeScript, `node:http`, `viem` plus workspace packages (`@ghostpay/chain-adapters` for fee math,
sweep typed data, RPC URL and manifest validation). No other runtime dependency. Deviations from the spec are in
[`DEVIATIONS.md`](./DEVIATIONS.md); what is stored is in [`PRIVACY.md`](./PRIVACY.md).

Scripts (`package.json`): `build`, `typecheck`, `test`, `lint`, `start` (`node dist/main.js`). Wired packages: only `@ghostpay/chain-adapters`; `@ghostpay/relayer-guard` (breaker, limiter, challenge) is **not** used by this app.

## API

All bodies are `application/json` (max 16 KiB), amounts/uints are decimal strings, unknown keys are rejected.
Errors are `{"error":{"code":"<class>"}}` with a fixed class and nothing else.

| Route | Purpose |
|---|---|
| `GET /healthz` | `{status, chains:[{chainId, breaker}]}`; 503 when every chain's breaker is open or during shutdown |
| `GET /v1/info` | version, fee policy (min 50 bps, cap 300 bps, gas x1.10), quote TTL, deadline window, per chain: `sweepRelayer`, `feeTo`, token allowlist |
| `POST /v1/quote` | `{chainId, token, owner, destination, amount}` -> `{fee, feeTo, expiresAt, quoteToken}` (`fee` decimal string, `expiresAt` unix seconds) |
| `POST /v1/sweep` | `{chainId, sweep:{token,owner,destination,feeTo,amount,fee,deadline,nonce}, sweepSig, permit?:{value,deadline,v,r,s}, quoteToken}` -> `{txHash}` |

`sweepSig` is the 65-byte `r||s||v` EIP-712 signature (domain `GhostPaySweepRelayer`/`1`/chainId/contract).
`permit` present -> `sweepWithPermit` (token must have `permit: true`); absent -> `sweep` (allowance already granted).

`quoteToken` = `v1.<expiresAt>.<fee>.<hmac-sha256>`; the MAC covers chain, token, owner, destination, amount, fee,
`feeTo` and expiry under the server secret, compared in constant time. Stateless; single use is enforced by the contract's
sweep nonce.

### Sweep checks, in order

chain and token allowlist (`chain_not_supported`, `token_not_supported` 422) -> permit flag/value (`permit_not_supported`,
`permit_value_too_low`) -> `feeTo` equals the relayer's (`fee_to_mismatch`) -> quote token authentic (`invalid_quote` 400),
unexpired (`quote_expired` 410), `sweep.fee >= quote.fee` (`fee_below_quote`), `fee <= 300 bps` (`fee_above_cap`) ->
deadline in `(now+min, now+max]`, max 1800 s (`deadline_too_soon/far`) -> contract static rules (`invalid_order`) ->
signature recovers to `owner` (`invalid_signature`) -> per-owner rate limit (`rate_limited_owner` 429; keyed only by a
proven owner) -> `PolicyGate` (`policy_denied` 403, `policy_unavailable` 503) -> breaker -> serial per-chain lane:
gas price cap (`gas_price_too_high` 503), balance floor (`breaker_open`), `simulateContract` (revert class: `nonce_used`
409, `expired`, `invalid_signature`, `token_transfer_failed`, `permit_value_too_low`, `invalid_order`,
`simulation_reverted` 422; RPC failure `rpc_unavailable` 503), gas limit (`gas_limit_too_high`), daily budget
(`budget_exhausted` 503 + `Retry-After`) -> send (`send_failed` 503).

Other classes: `invalid_*` 400 (field-level validation), `unsupported_media_type` 415, `body_too_large` 413,
`rate_limited_ip` 429, `origin_not_allowed` 403, `queue_full` / `shutting_down` 503, `not_found` 404, `method_not_allowed` 405,
`internal_error` 500.

## Configuration

JSON file (`RELAYER_CONFIG`, default `./relayer.config.json`) plus environment. See `relayer.config.example.json`.
Validation is strict: unknown keys, wildcard or non-https origins, plain-http or credentialed RPC URLs, non-stable tokens,
missing economics all stop startup.

| Env | Meaning |
|---|---|
| `RELAYER_KEY_FILE` or `RELAYER_KEY` | 32-byte hot key (hex). A file must be a regular file with no group/world permission bits (`chmod 600`) or startup is refused. Never logged. |
| `QUOTE_SECRET_FILE` or `QUOTE_SECRET` | 32-128 byte HMAC secret (hex), same file rules. Changing it invalidates outstanding quotes. |
| `RELAYER_CONFIG`, `DEPLOYMENTS_DIR` | config path; directory with `<chainId>.json` deployment manifests (default `../../deployments`) |
| `ALLOW_MAINNET=1` | required, in addition to a valid manifest, for any non-testnet chain id |
| `<name from rpcUrlEnv>` | RPC URL kept out of the file (API keys) |

Per chain: `rpcUrl`|`rpcUrlEnv`, `sweepRelayer` (optional; taken from the manifest when present, must match it if both),
`feeTo` (default: the hot-key address), `tokens` (each `usdStable: true`; symbol/decimals/permit come from the
chain-adapters allowlist or must be given), `nativeUsdPrice`, `gasUnits`, `maxGasLimit`, `maxGasPriceWei`,
`dailyBudgetWei`, `minBalanceWei`. Operator numbers (`gasUnits`, `nativeUsdPrice`, caps, budget) have no defaults on
purpose and must be set from your own measurements. The example file's values are placeholders, not measurements.

Fee: `sponsorFee(amount, gasUnits * eth_gasPrice converted at nativeUsdPrice with the stablecoin fixed at 1.0)` from
chain-adapters = `clamp(max(gas x 1.10, 50 bps), cap 300 bps)`. If the cap cannot cover raw gas cost the quote is refused
(`amount_too_small`). Non-stable tokens are unsupported in v1.

## Run

```
npm run build -w @ghostpay/relayer
RELAYER_KEY_FILE=/etc/ghostpay/hot.key QUOTE_SECRET_FILE=/etc/ghostpay/quote.secret \
RELAYER_CONFIG=/etc/ghostpay/relayer.config.json node apps/relayer/dist/main.js
```

HTTPS is terminated by the host (reverse proxy); set `trustProxyHops` to the number of trusted proxies so the rate-limit
bucket uses the right client address (0 = use the socket address and ignore `X-Forwarded-For`). `SIGTERM`/`SIGINT` start a
graceful shutdown: stop listening, refuse new work, let queued and in-flight transactions settle, force-close after
`shutdownGraceSeconds`. Deployment: `Dockerfile` (distroless, non-root; build from the repo root) and
`deploy/ghostpay-relayer.service`.

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
