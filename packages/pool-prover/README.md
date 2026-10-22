# @ghostpay/pool-prover

Local Groth16 prover wrapper (snarkjs 0.7.6) for the GhostPay testnet pool. **GPL-3.0 isolated package**: snarkjs is
GPL-3.0; the repo is `UNLICENSED`. That is an OWNER DECISION and is not resolved here. Keep this package out of any bundle that
is not the pool option chunk.

- `prove({ kind: 'withdraw' | 'commitment', chainId, inputs, artifacts, expectedSignals? })`: witness stays in process; errors never contain inputs.
- `verify(kind, vkey, proof, publicSignals)`: false on any problem (fail closed); used by the relayer as a cheap pre-check.
- `loadArtifacts`: loads wasm and zkey (https, loopback http, `file:`, absolute path), checks SHA-256 against the supplied hashes and requires a ceremony label `INSECURE-LOCAL` or `TESTNET-CEREMONY` (SP-CIR-7). No hash, no proof.
- `handleWorkerRequest` + `src/worker.ts`: Web Worker / worker-thread protocol (`{ id, req }` in, `{ id, ok, result | code }` out).
- `terminateProver()`: stops ffjavascript threads so a Node process can exit.
- Chain guard: `WRONG_CHAIN` for anything but 31337 / 11155111 / 84532.

Circuit contract: `packages/pool-circuits/INTERFACE.md` (9 withdraw signals, 4 ragequit signals).
