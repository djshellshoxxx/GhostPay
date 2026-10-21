# Deviations from the spec

1. Name/location: `packages/pool-prover` (spec: `@ghostpay/shielded-pool-prover`).
2. The default engine passes wasm and zkey to snarkjs as in-memory buffers (`{ type: 'mem' }`) after the hash check, so the bytes that
   were hashed are the bytes that are used.
3. The Worker entry (`src/worker.ts`) is thin glue excluded from coverage; the handler it calls is tested.
4. Browser proving time was not measured (no browser run). Node timing is recorded in the audit doc if the e2e ran.
5. `snarkjs` has no type declarations; `src/snarkjs.d.ts` declares only the two functions used.
