# Wiring: `@ghostpay/pool-circuits` (swarm 10 → swarm 4)

Status: built 2026-10-21 on `claude/remote-extensions-10`, **not wired anywhere**. Testnet PoC.
**INSECURE DEV CEREMONY**: keys and verifiers are forgeable by anyone (public beacon only). Nothing
below may be pointed at a chain other than 31337 / 11155111 / 84532.

Contract of record: [`packages/pool-circuits/INTERFACE.md`](../../../../packages/pool-circuits/INTERFACE.md).

## 1. What other packages consume

| Consumer | Consumes | How |
|---|---|---|
| `packages/pool-contracts` | `verifiers/WithdrawVerifier.sol`, `verifiers/RagequitVerifier.sol` | Copy byte-for-byte into `src/verifiers/` (keep the GPL-3.0 header and the INSECURE banner). A CI step should `diff` them against `packages/pool-circuits/verifiers/`. Pool calls `verifyProof(uint256[2],uint256[2][2],uint256[2],uint256[9|4])` and reverts `InvalidProof()` on `false`. |
| `packages/pool-contracts` | public-signal indices | `ProofLib` constants exactly as INTERFACE.md section 2 (`W_NEW_COMMITMENT = 0` … `W_CONTEXT = 8`) and ragequit `[commitment, nullifierHash, value, label]`. |
| `packages/pool-contracts` | `fixtures/*.json` | Verifier-level fixtures (`pA`, `pB` already G2-swapped, `pC`, `pubSignals`). For pool-level tests with a real state root / label / context, generate inputs in the test and prove via `node packages/pool-circuits/scripts/prove.mjs withdraw <input.json>` (forge `ffi`, opt-in profile) after `npm run build:circuits`. |
| `packages/pool-contracts` | `test-vectors/shielded-pool.json` | `contract.scope`, `contract.labels`, `contract.context` were computed with viem from the spec formulas; the contract tests must assert equality (SP-CON-14) and report any mismatch (the contract is authoritative, then regenerate vectors). Poseidon T2/T3/T4 and LeanIMT roots for `poseidon-solidity` / `lean-imt.sol` differential tests. |
| `packages/pool-sdk` | witness keys, hash definitions, LeanIMT layout | `buildWithdrawInputs` output keys must equal INTERFACE.md section 2. `stateIndex`/`ASPIndex` = real leaf position (not zk-kit's compressed proof index). ASP disabled ⇒ `ASPRoot = ASPTreeDepth = ASPIndex = 0` and all `ASPSiblings = 0` (the circuit rejects anything else). Vectors in `test-vectors/shielded-pool.json` (`withdrawExample`) must reproduce. |
| `packages/pool-prover` | `build/withdraw32_js/withdraw32.wasm`, `build/withdraw32_final.zkey`, commitment equivalents, `SHA256SUMS` | Load artefacts only after SHA-256 matches `packages/pool-circuits/SHA256SUMS`; refuse artefacts without the INSECURE label (SP-CIR-7). Use `toVerifierCalldata` (or equivalent) which also rejects non-canonical signals. |
| `apps/pool-relayer` | `vkeys/withdraw32.vkey.json` | Local pre-check with `snarkjs.groth16.verify` (0.7.6 rejects signals `>= P`, tested) before `eth_call` simulation. Pin snarkjs exactly: that check is version-dependent. |

## 2. Exact edits in existing code (for swarm 4; not made here)

| File | Edit |
|---|---|
| root `package.json` | none: `packages/*` workspace glob already includes it. |
| `.github/workflows/ci.yml` | New job `pool-circuits`: install circom via `bash packages/pool-circuits/scripts/install-circom.sh`, `npm run build:circuits -w @ghostpay/pool-circuits`, `npm run check:verifiers -w @ghostpay/pool-circuits` (fails if committed verifiers/vkeys/SHA256SUMS drift), `REQUIRE_CIRCUITS=1 npm test -w @ghostpay/pool-circuits`, `forge test` in `packages/pool-circuits/foundry` (with `solc_version`). The `ts-test` `rest` matrix entry runs the package without circom: witness/proof tests skip, fixture tests still run. The ceremony takes several minutes; cache `packages/pool-circuits/build/pot15_final.ptau` keyed on the script hash. |
| `THIRD_PARTY.md` | Rows from `docs/remote/third-party-additions.md` (circomlib, snarkjs, ffjavascript, circom, 0xbow circuits). |
| `docs/user/privacy-limits.md` | Add: "Test pool proofs use an insecure development setup; anyone can forge withdrawals. Testnet only." (spec N8). |
| `apps/web` | Only through `pool-prover` / `pool-sdk`; never import `@ghostpay/pool-circuits` into the main bundle (GPL isolation; `snarkjs` stays in the prover chunk). |

## 3. Not done / open

- circomspect not run (DEVIATIONS D-8).
- No real (multi-party) ceremony; no Hermez phase 1 (host blocked).
- Browser proving time not measured.
- Licence: OWNER DECISION (GPL-3.0 material under an UNLICENSED repo).
