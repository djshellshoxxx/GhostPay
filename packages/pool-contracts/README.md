# `packages/pool-contracts`: GhostPay shielded pool (testnet PoC)

Solidity 0.8.28 (EVM `cancun`, optimizer 200), Foundry, OpenZeppelin 5.6.1 and forge-std remapped read-only from
`../contracts/lib`. Spec: [`docs/remote/privacy-specs/shielded-pool.md`](../../docs/remote/privacy-specs/shielded-pool.md)
sections 6.1, 6.2 and 7 (SP-CON, SP-ASP). Circuit interface of record:
[`packages/pool-circuits/INTERFACE.md`](../pool-circuits/INTERFACE.md). Deviations: [`DEVIATIONS.md`](./DEVIATIONS.md).
Self-review: [`docs/remote/privacy-specs/audit-pool-contracts.md`](../../docs/remote/privacy-specs/audit-pool-contracts.md).
Wiring: [`docs/remote/privacy-specs/wiring/pool-contracts.md`](../../docs/remote/privacy-specs/wiring/pool-contracts.md).

> **Testnet only. Not anonymous.** The constructor reverts outside chain ids 31337, 11155111 and 84532. The
> verifiers this pool is tested with come from an **INSECURE dev ceremony**: anyone can forge proofs and drain
> any pool that uses them. The anonymity set is only the deposits in this test pool. Nothing here was deployed.

| Contract | Purpose |
|---|---|
| `src/GhostPayShieldedPool.sol` | Abstract core: deposit, withdraw (membership proof, relayer fee, optional association set, SP-PAY announcement), ragequit; LeanIMT state tree; 64-root window; nullifier set; immutable config; testnet chain guard. |
| `src/GhostPayShieldedPoolERC20.sol` | ERC-20 pool + `depositWithPermit` (EIP-712 `DepositAuth` signed by the owner, ERC-2612 permit in `try/catch`, bitmap nonces), exact balance-delta checks. |
| `src/GhostPayShieldedPoolNative.sol` | Native-asset pool (`msg.value == value`, assembly payout without return-data copy). |
| `src/GhostPayAssociationSetRegistry.sol` | Permissionless ASP root registry: each address publishes roots for itself; `latest`, `supersededAt`, `wasPublished`. |
| `src/lib/PoolLeanIMT.sol` | Port of zk-kit `InternalLeanIMT` insert/has/root (MIT) hashing through an immutable Poseidon contract via `STATICCALL`. |
| `src/lib/ProofLib.sol`, `src/lib/PoolConstants.sol` | Public-signal accessors (order = INTERFACE.md) and constants (P, 64 roots, depth 32, `2**128 - 1`, KATs). |
| `src/interfaces/` | `IGhostPayShieldedPool` (+ `IGhostPayShieldedPoolERC20`), `IGhostPayAssociationSetRegistry`, `IWithdrawVerifier` / `IRagequitVerifier`, `IPoseidonT3` / `IPoseidonT4`, `IERC5564Announcer` (CC0 copy). |
| `script/DeployPool.s.sol` | Testnet-only deploy (Sepolia / Base Sepolia; anvil with `ALLOW_LOCAL=1`), env driven, reads every immutable back. **Not run against any network.** |

No owner, role, proxy, pause, setter, `selfdestruct`, `delegatecall` or arbitrary call exists (`scripts/check-static.sh`
checks vocabulary, deployed opcodes and storage layout). There is no GhostPay fee anywhere; the only fees are the
relayer fee chosen and proven by the withdrawer and the optional sponsor fee signed by a `depositWithPermit` owner.

## Flows (summary)

- **Deposit** `deposit(value, precommitment)`: `label = keccak256(abi.encodePacked(SCOPE, ++nonce)) % P`,
  `commitment = PoseidonT4(value, label, precommitment)` appended to the LeanIMT; `depositorOf[label] = msg.sender`.
- **Withdraw** `withdraw(w, proof)`: checks in this order: deadline, relayer binding, recipient, `0 < withdrawnValue <= 2**128-1`,
  fee cap and `feeTo`, `context == keccak256(abi.encode(w, SCOPE)) % P`, depths `<= 32`, known state root, ASP rule, announce
  layout, Groth16 verify; then spends the nullifier, inserts the change commitment, pays `withdrawnValue - fee` to `recipient`
  and `fee` to `feeTo`, optionally calls `ANNOUNCER.announce(1, recipient, key, metadata)` (caller = pool).
- **Ragequit** `ragequit(proof)`: only `depositorOf(label)`; commitment must be a leaf; commitment-circuit proof; spends the
  same nullifier set; pays the full note value to the depositor.
- **ASP rule**: `aspEnabled == 0` requires publisher, root and depth all zero; `aspEnabled == 1` requires a publisher that
  published the root, and the root is its latest or was superseded at most `ASP_GRACE_SECONDS` ago.

## Commands

```bash
export FOUNDRY_SOLC=/path/to/solc-0.8.28   # offline sandbox only; CI uses solc_version from foundry.toml
forge build                                # zero warnings (forge lint runs on src/ only)
forge fmt --check
forge test                                 # default: 10 000 fuzz runs, invariants 256 x 50
FOUNDRY_PROFILE=dev forge test             # quick loop
forge test --match-contract RealProof -vv  # real Groth16 proofs + generated verifiers (prints gas)
scripts/check-natspec.sh                   # NatSpec completeness of the three deployable contracts
scripts/check-static.sh                    # no admin vocabulary / DELEGATECALL / SELFDESTRUCT; storage layout pinned
slither . --filter-paths "lib|test|script|\.\./contracts/lib" --fail-medium --exclude-informational --exclude-low
```

Fixture regeneration (both deterministic):

```bash
node scripts/gen-vectors.mjs <dir with circomlibjs@0.1.7 + @zk-kit/lean-imt@2.2.5> > test/fixtures/poseidon-vectors.json
node scripts/gen-proof-fixtures.mjs 0xA4AD4f68d0b91CFD19687c881e50f3A00242828c 0x1d1499e622D69689cdf9004d05Ec547d650Ff211 \
  > test/fixtures/proofs/pool-e2e.json      # needs packages/pool-circuits/build (npm run build:circuits)
```

Echidna (local only, see `echidna.yaml` header): the pool is constructed on a local anvil by
`test/echidna/EchidnaFixture.s.sol`, because Echidna's EVM runs at chain id 1, which the constructor refuses.

### Compiler setting

`foundry.toml` commits `solc_version = "0.8.28"`. The build sandbox cannot download compilers, so every command here
was run with `FOUNDRY_SOLC=/home/user/tools/solc` (a local static 0.8.28). Nothing machine-specific is committed.

## Test suites

| File | Covers |
|---|---|
| `test/GhostPayShieldedPool.t.sol` | constructor (chain guard, zero addresses, config bounds, hasher KAT), deposit rules, malicious tokens (fee-on-transfer, false-return, no-return, turns-lossy, clawback, blacklist), every withdraw check, per-field context binding, root window (63 / 64), ASP rule and grace boundaries, announce validation, ragequit, tree full |
| `test/DepositWithPermit.t.sol` | SP-CON-8: signed fields, front-run permit, replay, high-s, wrong signer, cross-pool/cross-chain replay |
| `test/NativeAndReentrancy.t.sol` | native pool; reentrant recipient (withdraw / same nullifier / deposit), gas-burning and reverting recipients, ERC-777-style token hooks on pull and push |
| `test/GhostPayShieldedPool.fuzz.t.sol` | SP-CON-3 field and public-signal tampering, relayer binding, fee bound, deposit bounds, announce amount |
| `test/GhostPayShieldedPool.invariant.t.sol` | value conservation, nullifier set = model, no double spend / stale root / foreign ragequit, root window |
| `test/GhostPayAssociationSetRegistry.t.sol` | SP-ASP-1/2 registry side |
| `test/PoseidonAndTree.t.sol` | Poseidon T3/T4 vs circomlibjs (100+ vectors), LeanIMT vs `@zk-kit/lean-imt` (70 roots) and differential vs zk-kit Solidity |
| `test/SharedVectors.t.sol` | `test-vectors/shielded-pool.json` (Poseidon, notes, 33 LeanIMT roots, scope/labels/context with a pool deployed at the vector address) |
| `test/RealProof.t.sol` | real proofs (withdraw with ASP, ragequit) through the generated verifiers; tampering, malleated proof replay, `checkField` |
| `test/DeployPool.t.sol` | deploy script in memory (chain allowlist, code checks, read-back) |

Results of the runs made for this delivery are in the self-review document, section "Evidence".

## Known limitations

- **Soundness = circuits + setup.** A broken circuit or a known toxic waste lets anyone mint withdrawals. The dev ceremony keys are public by construction.
- **Unsupported tokens:** fee-on-transfer, rebasing, tokens that can turn lossy, blacklisting tokens (payout to a blacklisted
  recipient reverts), tokens whose balance can be clawed back (the pool can become insolvent for the last withdrawers).
- **Gas:** deposit costs about 77k (Poseidon T4) plus about 30k per tree level that needs a hash (about 300k typical, up to
  1.3M at depth 32). Real-verifier withdrawal with ASP about 521k, ragequit about 305k (measured in `RealProof.t.sol`).
- **Invalid curve points burn the submitter's gas:** the generated verifier forwards almost all gas to the pairing
  precompile; malformed proof points make the call consume it (only the submitter pays; relayers must verify off-chain first).
- **Accidental transfers are lost:** no rescue path (forced ETH, tokens sent directly).
- **No privacy claim:** deposits are public (`Deposited` shows depositor, value, label); see spec N1-N9.
