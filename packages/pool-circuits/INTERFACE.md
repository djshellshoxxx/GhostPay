# `@ghostpay/pool-circuits` interface (public-signal order, witness inputs, verifier ABI)

Status: **frozen for swarm 10** (2026-10-21). Consumers: `packages/pool-contracts` (ProofLib, verifiers),
`packages/pool-sdk` (witness input builder, Poseidon, LeanIMT mirror), `packages/pool-prover`.
Any change here is a breaking change and must be announced to those packages.

> **INSECURE DEV CEREMONY.** The proving/verifying keys produced by `scripts/ceremony-dev.sh` come from a
> deterministic, public-entropy setup. Anyone can recompute the toxic waste and **forge proofs that drain any
> pool using these verifiers**. Testnet / local anvil only. See `README.md` and
> `docs/remote/privacy-specs/audit-pool-circuits.md`.

Field: BN254 scalar field `P = 21888242871839275222246405745257275088548364400416034343698204186575808495617`.
All public signals are field elements `< P`. The snarkjs Solidity verifier rejects any signal `>= P` (`checkField`).

## 1. Hash definitions (circomlib Poseidon, BN254, same constants as `poseidon-lite` 0.3.0)

| Name | Definition | Poseidon arity (t) |
|---|---|---|
| `nullifierHash(n)` | `Poseidon([n])` | 1 (t=2) |
| `precommitment(n, s)` | `Poseidon([n, s])` | 2 (t=3) |
| `commitment(value, label, pre)` | `Poseidon([value, label, pre])` | 3 (t=4) |
| LeanIMT node | `Poseidon([left, right])` | 2 (t=3) |

LeanIMT (zk-kit semantics): a node with no right sibling is **propagated unchanged** to the next level (no hash).
In the circuit an empty sibling is encoded as `0`. State-tree leaves are `commitment`s. ASP-tree leaves are raw
`label`s (not hashed). Tree of size 1 has depth 0 and root = leaf.

## 2. Withdraw circuit `Withdraw(32)` (`circuits/main/withdraw32.circom`)

### Public signals, in snarkjs `publicSignals` / Solidity `_pubSignals` order (9)

| Index | Name | Kind | Contract must check |
|---|---|---|---|
| 0 | `newCommitmentHash` | output | insert into state tree (also when change value is 0) |
| 1 | `existingNullifierHash` | output | not spent; mark spent (shared set with ragequit) |
| 2 | `withdrawnValue` | input | `> 0`; pays `withdrawnValue - relayerFee` to recipient |
| 3 | `stateRoot` | input | `isKnownRoot(stateRoot)` (64-root window) |
| 4 | `stateTreeDepth` | input | `<= 32` (circuit also enforces `<= 32`) |
| 5 | `aspEnabled` | input | `0` or `1` (circuit enforces boolean) |
| 6 | `ASPRoot` | input | if `aspEnabled == 0`: `== 0` (circuit enforces too); else published by `aspPublisher` |
| 7 | `ASPTreeDepth` | input | if `aspEnabled == 0`: `== 0` (circuit enforces too); else `<= 32` |
| 8 | `context` | input | `== uint256(keccak256(abi.encode(withdrawal, SCOPE))) % P` |

Solidity index constants (for `ProofLib`):

```solidity
uint256 constant W_NEW_COMMITMENT = 0;
uint256 constant W_NULLIFIER_HASH = 1;
uint256 constant W_WITHDRAWN_VALUE = 2;
uint256 constant W_STATE_ROOT = 3;
uint256 constant W_STATE_DEPTH = 4;
uint256 constant W_ASP_ENABLED = 5;
uint256 constant W_ASP_ROOT = 6;
uint256 constant W_ASP_DEPTH = 7;
uint256 constant W_CONTEXT = 8;
```

### Witness input names (JSON keys passed to `snarkjs.groth16.fullProve`)

All values are decimal strings or bigints `< P`. Arrays have length exactly 32.

| Key | Visibility | Meaning |
|---|---|---|
| `withdrawnValue` | public | amount leaving the pool, `< 2^128` |
| `stateRoot` | public | LeanIMT root of the state tree containing the existing commitment |
| `stateTreeDepth` | public | `0..32`; every `stateSiblings[i]` with `i >= stateTreeDepth` must be `0` |
| `aspEnabled` | public | `0` or `1` |
| `ASPRoot` | public | ASP LeanIMT root over labels, or `0` when `aspEnabled = 0` |
| `ASPTreeDepth` | public | `0..32`, or `0` when `aspEnabled = 0` |
| `context` | public | see table above |
| `label` | private | label of the existing note (unchanged in the change note) |
| `existingValue` | private | value of the existing note, `< 2^128` |
| `existingNullifier` | private | nullifier of the existing note |
| `existingSecret` | private | secret of the existing note |
| `newNullifier` | private | nullifier of the change note, `!= existingNullifier` |
| `newSecret` | private | secret of the change note |
| `stateSiblings[32]` | private | LeanIMT siblings bottom-up, `0` = no sibling |
| `stateIndex` | private | the leaf's real position in the tree (`< 2^32`), **not** zk-kit's compressed `generateProof().index`; bit `i` must be `0` where `stateSiblings[i] == 0` (always true for the real position) |
| `ASPSiblings[32]` | private | as above for the ASP tree; **all `0` when `aspEnabled = 0`** |
| `ASPIndex` | private | as above; **`0` when `aspEnabled = 0`** |

Circuit statement: `newCommitmentHash = Poseidon(existingValue - withdrawnValue, label, Poseidon(newNullifier, newSecret))`,
`existingNullifierHash = Poseidon(existingNullifier)`, `Poseidon(existingValue, label, Poseidon(existingNullifier, existingSecret))`
is a leaf of the tree with root `stateRoot`, `withdrawnValue < 2^128`, `existingValue < 2^128`,
`existingValue - withdrawnValue < 2^128` (no field wrap), and, if `aspEnabled = 1`, `label` is a leaf of the tree with root `ASPRoot`.

## 3. Ragequit circuit `CommitmentHasher()` (`circuits/main/commitment.circom`)

### Public signals (4)

| Index | Name | Kind |
|---|---|---|
| 0 | `commitment` | output |
| 1 | `nullifierHash` | output |
| 2 | `value` | input |
| 3 | `label` | input |

Witness inputs: `value`, `label` (public), `nullifier`, `secret` (private).
Statement: `commitment = Poseidon(value, label, Poseidon(nullifier, secret))`, `nullifierHash = Poseidon(nullifier)`.
The circuit does **not** prove tree membership: the contract must check that `commitment` is a known leaf,
that `depositorOf(label) == msg.sender`, and must mark `nullifierHash` spent in the **same** set as withdraw.

## 4. Verifier ABI (snarkjs 0.7.6 Groth16 template, contract name rewritten)

Files: `verifiers/WithdrawVerifier.sol` (contract `WithdrawVerifier`), `verifiers/RagequitVerifier.sol`
(contract `RagequitVerifier`). `SPDX-License-Identifier: GPL-3.0`, `pragma solidity >=0.7.0 <0.9.0`.
The only change from `snarkjs zkey export solidityverifier` output is the contract name and a prepended
INSECURE DEV CEREMONY comment block; `scripts/check-verifiers.sh` diff-checks this.

```solidity
function verifyProof(
    uint256[2] calldata _pA,
    uint256[2][2] calldata _pB,
    uint256[2] calldata _pC,
    uint256[9] calldata _pubSignals      // RagequitVerifier: uint256[4]
) public view returns (bool);
```

Selectors: `verifyProof(uint256[2],uint256[2][2],uint256[2],uint256[9])` and `...uint256[4])`
(exact 4-byte values are listed in `verifiers/SELECTORS.txt` after build). Returns `false` (does not revert) on an
invalid proof or a public signal `>= P`. A pool should call it through an `IGroth16Verifier`-style interface with
the matching array length and revert `InvalidProof()` on `false`.

### snarkjs proof JSON to calldata

```text
pA = [proof.pi_a[0], proof.pi_a[1]]
pB = [[proof.pi_b[0][1], proof.pi_b[0][0]], [proof.pi_b[1][1], proof.pi_b[1][0]]]   // G2 coords SWAPPED
pC = [proof.pi_c[0], proof.pi_c[1]]
pubSignals = publicSignals (order above)
```

This is what `snarkjs zkey export soliditycalldata` / `groth16.exportSolidityCallData` emits.
Fixtures with this layout: `fixtures/withdraw-*.json`, `fixtures/ragequit-*.json`
(`{ pA, pB, pC, pubSignals, input, note }`, decimal strings).

## 5. Artifacts

`build/` (gitignored, regenerate with `npm run build -w @ghostpay/pool-circuits`):
`withdraw32.wasm`, `withdraw32.r1cs`, `withdraw32_final.zkey`, `commitment.wasm`, ... Committed:
`verifiers/*.sol`, `vkeys/*.json`, `fixtures/*.json`, `SHA256SUMS` (hashes of wasm, r1cs, zkey).
The dev ceremony is deterministic, so a rebuild with the pinned circom/snarkjs/circomlib reproduces the same
zkey and verifier bytes (checked by `scripts/check-verifiers.sh`).
