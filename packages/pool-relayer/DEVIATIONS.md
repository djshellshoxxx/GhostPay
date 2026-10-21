# Deviations from the spec

1. Package at `packages/pool-relayer` (spec: `apps/pool-relayer`), as assigned.
2. Quote is stateless but the relay endpoint accepts a fee up to `slackBps` (default 10 %) below the current quote, so a quote survives
   gas-price drift. The spec says "fee >= quote formula at current price" exactly.
3. Cheap rejection uses `@ghostpay/pool-prover` `verify` (snarkjs) with the committed verification key supplied at start-up
   (`POOL_RELAYER_VKEY`); there is no key-hash pinning.
4. Error body is `{ "error": { "code": "..." } }` as in `apps/relayer`. `PoolRelayerClient` accepts both shapes.
5. `/v1/relay` returns `{ txHash, status: 'confirmed' | 'pending' }`; a mined revert is a 502 `mined_revert`.
6. Fee conversion rate per pool is an operator-set rational (`rate: num/den` asset units per wei); there is no price oracle.
7. No persistence, no nonce store: one in-process lane per chain.
8. `main.ts` is excluded from coverage and has not been executed against a public network.
