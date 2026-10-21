# `@ghostpay/pool-circuits`

> # INSECURE DEV CEREMONY
> The Groth16 keys and Solidity verifiers built here come from a **deterministic setup with a
> public beacon and no secret contribution**. Anyone can recompute the toxic waste and **forge
> proofs that drain any pool using these verifiers**. Testnet / local anvil only (31337,
> 11155111, 84532). Not audited. Before anything holds value: public phase 1, public
> multi-party phase 2, and an independent circuit audit.

circom 2.2.3 circuits for the GhostPay testnet shielded pool (spec:
[`docs/remote/privacy-specs/shielded-pool.md`](../../docs/remote/privacy-specs/shielded-pool.md)),
forked from 0xbow privacy-pools-core (Apache-2.0, see `NOTICE`), plus small TypeScript helpers
that mirror the circuits (hashes, LeanIMT path layout, witness JSON, verifier calldata).

- **Interface (public-signal order, witness keys, verifier ABI): [`INTERFACE.md`](INTERFACE.md)**
- Differences from the spec: [`DEVIATIONS.md`](DEVIATIONS.md)
- Adversarial self-review: [`docs/remote/privacy-specs/audit-pool-circuits.md`](../../docs/remote/privacy-specs/audit-pool-circuits.md)
- Wiring for other packages: [`docs/remote/privacy-specs/wiring/pool-circuits.md`](../../docs/remote/privacy-specs/wiring/pool-circuits.md)

## Layout

| Path | What |
|---|---|
| `circuits/commitment.circom` | `CommitmentHasher`: commitment, nullifier hash (ragequit circuit) |
| `circuits/merkleTree.circom` | `LeanIMTInclusionProof(maxDepth)` |
| `circuits/withdraw.circom` | `Withdraw(maxTreeDepth)` with `aspEnabled` |
| `circuits/main/withdraw32.circom`, `circuits/main/commitment.circom` | main components |
| `scripts/install-circom.sh` | pinned circom v2.2.3 linux-amd64, sha256 checked |
| `scripts/build.sh` | compile (`--O2 --sanity_check`) then `ceremony-dev.sh` |
| `scripts/ceremony-dev.sh` | **INSECURE DEV CEREMONY**: ptau, zkey, vkey, Solidity verifiers, `SHA256SUMS`, transcript |
| `scripts/check-verifiers.sh` | diff committed verifiers/vkeys against a fresh snarkjs export; `sha256sum -c SHA256SUMS` |
| `scripts/gen-vectors.mjs` | writes `test-vectors/shielded-pool.json` (deterministic) and `fixtures/*.json` (proofs) |
| `scripts/prove.mjs` | prove one witness JSON, print calldata JSON (for forge `ffi` or scripts) |
| `verifiers/` | generated `WithdrawVerifier.sol`, `RagequitVerifier.sol` (GPL-3.0), `SELECTORS.txt` |
| `vkeys/`, `fixtures/`, `SHA256SUMS`, `ceremony/transcript.txt` | committed outputs |
| `build/` | gitignored: r1cs, wasm, zkey, ptau |
| `src/` | TS helpers (`poseidon-lite`, LeanIMT mirror, `buildWithdrawInputs`, `toVerifierCalldata`) |
| `test/` | witness, proof and fixture tests |
| `foundry/` | verifier smoke tests against the fixtures (forge) |

## Constraint counts (circom 2.2.3, `--O2`, circomlib 2.0.5)

| Circuit | Non-linear | Linear | Public in | Public out | Private in | Wires |
|---|---|---|---|---|---|---|
| `Withdraw(32)` | 17 904 | 0 | 7 | 2 | 72 | 17 842 |
| `CommitmentHasher` | 714 | 0 | 2 | 2 | 2 | 719 |

Rough split for `Withdraw(32)`: 64 x Poseidon(2) for the two LeanIMT paths (~15.4k), 2 x
CommitmentHasher (~1.4k), 3 x Num2Bits(128) (384), Num2Bits(32) x2, depth checks, muxes.
Fits `2^15` powers of tau. Groth16 verification gas (EIP-1108 maths): ~181k + ~6.15k per public
signal; measured in `foundry/` (see audit doc).

## Build and test

```bash
export PATH=/path/to/circom-2.2.3:$PATH      # or: bash scripts/install-circom.sh && export PATH=$PWD/.tools:$PATH
npm run build:circuits -w @ghostpay/pool-circuits   # compile + INSECURE DEV CEREMONY (several minutes)
npm run check:verifiers -w @ghostpay/pool-circuits  # committed verifiers == snarkjs export, SHA256SUMS ok
npm run build -w @ghostpay/pool-circuits && node packages/pool-circuits/scripts/gen-vectors.mjs
npm test -w @ghostpay/pool-circuits                 # unit + witness + proof + fixture tests
cd packages/pool-circuits/foundry && FOUNDRY_SOLC=/path/to/solc-0.8.28 forge test
```

Without `build/` the witness and proof tests **skip with a warning** and only the unit tests and
committed-fixture tests run. `REQUIRE_CIRCUITS=1` turns the skip into a failure (use in CI where
circom is installed).

Because the dev ceremony is deterministic, `build:circuits` on a clean checkout with the pinned
tools reproduces the committed `SHA256SUMS` exactly. With `POOL_CEREMONY_CONTRIBUTE=1` it does not
(random contributions), and the verifiers, vkeys and fixtures must be recommitted together.

## Licence (OWNER DECISION)

circomlib (GPL-3.0 per npm, LGPL-3.0 per repo), snarkjs-generated verifiers (GPL-3.0) and the
0xbow-derived circuits (Apache-2.0) make this package GPL-3.0 in substance, while the repository is
`UNLICENSED`. Not relicensed here; see `NOTICE` and spec Q1. The TS helpers in `src/` depend only on
`poseidon-lite` (MIT).
