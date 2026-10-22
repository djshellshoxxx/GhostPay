# @ghostpay/pool-relayer

Withdrawal relayer for the GhostPay **testnet** shielded pool. A package, not an app. HTTP-agnostic core plus a small `node:http`
entry. Private, `UNLICENSED`, not audited, never run on a public network.

## Core: `PoolRelayerService`

- `quote({chainId, pool, withdrawnValue})`: stateless fee `gasEstimate * min(gasPrice, cap) * (1 + marginBps) * rate`, rounded up. All parameters are in `/v1/info`, so a client can recompute it (SP-REL-5).
- `relay({chainId, pool, withdrawal, proof})`: checks in this order: per-client rate limit (cost 5), pool allowlist, `withdrawal.relayer == own address`, `feeTo == configured`, ASP flag consistency, fee <= cap, fee >= quote at current price minus `slackBps`, deadline margin, `context == keccak256(abi.encode(w, SCOPE)) % P`, state root known, nullifier unspent, **local Groth16 verification** (`@ghostpay/pool-prover`), loss budget, circuit breaker, `estimateGas` simulation, send, wait. Only `withdraw` is ever sent (SP-REL-2).
- Abuse controls from `@ghostpay/relayer-guard`: `GuardedBreaker` (simulation reverts and request errors are neutral, only operational failures count), `TokenBucketLimiter`, `LossBudget` (mined reverts are charged to the client bucket), trusted-proxy client address (`resolveClientIp`, `bucketKey`).
- One send at a time per chain (nonce safety).
- Chain guard: configuration refuses chains other than 31337 / 11155111 / 84532; `/v1/*` bodies with another chain id get `wrong_chain`; `verifyChain()` checks `eth_chainId` against the configured id at start.

## Server (`src/main.ts`)

`node:http`, routes `/healthz`, `/v1/info`, `/v1/quote`, `/v1/relay`; 16 KiB body cap; CORS allowlist (default none); security headers. Environment variables are documented at the top of `src/main.ts`. The hot key is read from `POOL_RELAYER_KEY` and removed from `process.env` after parsing. Use testnet-only keys.

## Tests

`npm test -w @ghostpay/pool-relayer` (coverage thresholds 95/90/95/95). `chain.test.ts` runs the viem port against an in-test fake JSON-RPC node. `e2e.anvil.test.ts` runs the real flow on local anvil when `anvil`, `packages/pool-contracts/out` and the circuit artifacts are present; it skips otherwise (and says so).

Privacy: see `PRIVACY.md`. Deviations: `DEVIATIONS.md`.
