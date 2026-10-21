# Privacy spec: Own shielded-pool exit on EVM (`@ghostpay/shielded-pool`)

Status: **spec, not built**. Date: 2026-10-21. Branch `claude/remote-extensions-1`. Scope: **testnet-only proof of concept** (local anvil `31337`, Ethereum Sepolia `11155111`, Base Sepolia `84532`). Nothing here has run against a real chain, wallet, prover or relayer.

Evidence tags: **[R]** repo file read this run; **[P]** primary source fetched 2026-10-21 (retrieval date for every URL in section 15); **[S]** secondary source; **[U]** unverified (memory or inference; verify before relying on it).

Read for this spec: `README.md`, `docs/CONTRACTS_SPEC.md`, `docs/remote/anonymization-research.md` (5.1, 5.4, 5.8, 6.1, 6.2, 10), `docs/remote/onion-i2p-research.md`, `docs/remote/modules-needed.md`, `docs/remote/security-specs/privacy-ops.md`, sibling specs `privacy-specs/{hygiene,amount-blurring,payer-hiding}.md`, `packages/contracts/{foundry.toml,src/GhostPayRouter.sol,src/interfaces/*}`, `packages/core-crypto/src/index.ts`, `apps/relayer/package.json`.

**Conflict with prior research, recorded once.** `anonymization-research.md` 5.4 recommends "Do not build an own pool" (tiny crowd, largest audit surface, legal profile) [R]. The owner has overridden this for a testnet PoC that offers every valid method as a user option. This spec builds it and keeps the research's warnings as normative UI copy and risks. A third-party pool integration (0xbow Privacy Pools, Railgun) is a separate option and not specified here.

**Legal (deferred by owner, noted once, does not block):** operating a pool, ASP or withdrawal relayer, and fees on anonymization, are the risk pattern in `anonymization-research.md` section 12 [R]. PoC charges no GhostPay fee, is testnet-only by constructor guard, and runs no production ASP or relayer. Licence compatibility (section 4.6) is a separate, technical item and is listed as an open question.

## 1. Goal

Ship, testnet-only, an immutable, admin-free Privacy-Pools-style shielded pool and its client stack so a user can choose:

| Option id | Name | One line |
|---|---|---|
| `SP-EXIT` | Private exit | Seller's stealth address `S1` deposits its balance into the pool; later withdraws (ZK membership proof) via a relayer to a fresh self-derived stealth destination `D_i`. |
| `SP-PAY` | Pay from pool | Payer with a pool note withdraws directly to the seller's one-time stealth address `S1`; the **pool contract** emits the ERC-5564 announcement, so the payer's address never appears. |
| `SP-RQ` | Ragequit | Original depositor withdraws publicly (no ZK membership, no privacy). Always available. |

Sub-options per withdrawal: association set `none | publisher:<addr>`; submitter `relayer:<url> | self`; amount plan `whole | denom-split` (delegates to `@ghostpay/amount-blur`); deposit gas `direct | buffer | permit-sponsored`.

## 2. Threat addressed and what it does NOT protect

Addressed (mechanism, not a measured guarantee):
- **T1 (L3/L4/L5, `anonymization-research.md` [R])**: payer or public following `S1 -> W`. After `SP-EXIT`, the on-chain graph shows `S1 -> Pool` and `Pool -> D_i`; the proof hides which deposit funded `D_i`.
- **T2 (sender privacy, research 6.2)**: with `SP-PAY` the seller and public see `Pool -> S1` and an announcement whose `caller` is the pool, not the payer.
- **T3 exit gas funding**: relayer pays withdrawal gas, reimbursed from the withdrawn value; `D_i` needs no prior funding.
- **T4 dissociation**: with `aspMode = publisher`, a withdrawal proves its deposit label is in a set chosen by a publisher (e.g. "excludes known-bad deposits"), per Buterin et al. 2024 (doi:10.1016/j.bcra.2023.100176) [S, cited in research 5.1].

Does NOT protect (each line MUST appear in UI copy, SP-UI-2):
- **N1 crowd**: the anonymity set is only the deposits in *this* GhostPay testnet pool for that token. On a testnet with a handful of users it is effectively **no anonymity**. The PoC demonstrates the mechanism, not privacy (research 10.3 [R]; Wang et al. WWW '23 heuristics reduce effective sets ~27-46% [S]).
- **N2 deposit is public**: `S1 -> Pool` is visible; the payer learns "my payment entered the pool". `Deposited` shows depositor, value and label.
- **N3 amount and timing**: depositing X and withdrawing X soon after is matchable. Mitigation is client-side only (denominations, partial withdrawals, delays).
- **N4 fingerprint**: "router payment then deposit from the same stealth address" marks a GhostPay seller exit (research 6.1 [R]). Pool, registry and relayer addresses are public labels.
- **N5 relayer and network**: the relayer sees recipient, value, fee, proof and client IP; RPC sees IP and queried addresses (privacy-ops PA3/PA5 [R]). Tor transport is out of scope here (see `privacy-specs/network-privacy.md`).
- **N6 ASP**: a publisher can exclude anyone, lag, or be wrong; choosing a publisher discloses that choice on-chain in `Withdrawn`. `aspMode = none` gives a larger set but no dissociation claim.
- **N7 ragequit / reuse**: `SP-RQ`, withdrawing to an address linked to `S1`, `W`, the payer, or an exchange account, or consolidating several `D_i`, re-links (hygiene HY-CON [R]).
- **N8 soundness**: a leaked phase-2 toxic waste or a circuit bug allows forged proofs and **draining the pool**. The PoC ceremony is local and insecure by construction (section 4.5).
- **N9 mainnet**: not in scope; contracts refuse other chain ids (SP-CON-1).

## 3. Primary-source facts used

- **0xbow `privacy-pools-core`** (Apache-2.0 LICENSE [P]): circuits in circom `pragma circom 2.2.0`, Poseidon from circomlib, LeanIMT inclusion; commitment `= Poseidon(value, label, Poseidon(nullifier, secret))`, nullifier hash `= Poseidon(nullifier)`; withdrawal proves state-tree inclusion, ASP-tree inclusion of `label`, `Num2Bits(128)` on `withdrawnValue` and `existingValue - withdrawnValue`, `existingNullifier != newNullifier`, emits `newCommitmentHash` (change note) and `existingNullifierHash`; binds `context` by `context * context` [P: `packages/circuits/circuits/withdraw.circom`, `commitment.circom`]. Contract: `label = keccak256(abi.encodePacked(SCOPE, ++nonce)) % SNARK_SCALAR_FIELD`; `context == keccak256(abi.encode(withdrawal, SCOPE)) % SNARK_SCALAR_FIELD`; `msg.sender == withdrawal.processooor`; state-root sliding window `ROOT_HISTORY_SIZE = 64`, `MAX_TREE_DEPTH = 32`; ASP root must equal `ENTRYPOINT.latestRoot()`; `ragequit` only by `depositors[label]` [P: `packages/contracts/src/contracts/{PrivacyPool,State}.sol`]. Their `Entrypoint` is a **proxy with Owner and Postman roles**, holds the ASP root, fees and "protocol upgrades and access control" [P: contracts README]. Deps: `poseidon-solidity 0.0.5`, `@zk-kit/lean-imt.sol 2.0.0`, `snarkjs 0.7.5`, `circomlib 2.0.5`, `circomkit 0.3.2`, Hermez `powersOfTau28_hez_final_16.ptau` [P: package.json files]. README lists a Sepolia deploy script [P]. Audit report: **not found** this run [U].
- **Privacy Pools trusted setup** [S: L2BEAT ZK catalog]: phase 1 from Perpetual Powers of Tau contribution 80; phase 2 closed March 2025 with ~514 contributions.
- **circom** GPL-3.0 (`COPYING`) [P]; latest release v2.2.3 (changelog 2025-10-24) [P: GitHub releases page]; v2.2.1 added `--constraint_assert_dissabled`, replaced by `--sanity_check` in v2.2.3 [P]. Release binary `circom-linux-amd64` reachable from the sandbox [P, HTTP 200].
- **snarkjs** 0.7.6 (npm latest, 2026-01-12), GPL-3.0 [P]. Supports Groth16, PLONK, FFLONK (Beta); "Groth16 requires a trusted ceremony for each circuit. PLONK and FFLONK do not" [P README]. Ceremony commands `zkey contribute | verify | beacon`, phase-1 `powersoftau ...` [P]. Hermez ptau table with blake2b hashes, e.g. power 16 (64k constraints) `6a6277a2f74e1073...efec125` [P README]; host `circom.info` was **blocked by the sandbox proxy** this run.
- **snarkjs Solidity verifier template** has `SPDX-License-Identifier: GPL-3.0`, `pragma solidity >=0.7.0 <0.9.0`, and `checkField` on every public signal [P: `templates/verifier_groth16.sol.ejs`].
- **circomlib** 2.0.5: repo `LICENSE` is **LGPL-3.0**, npm `license` field says **GPL-3.0** [P both]; treat as GPL-3.0 until resolved. `circomlibjs` 0.1.7 GPL-3.0 [P npm].
- **Noir**: `@noir-lang/noir_js` latest `1.0.0-rc.6` (2026-10-20), `MIT OR Apache-2.0`; Noir README: "early development. It has not been reviewed or audited. It is not suitable to be used in production. Expect bugs!" [P]. `@aztec/bb.js` 5.2.1 MIT; aztec-packages Apache-2.0 [P]. UltraHonk Solidity verifier existence and gas: [U].
- **Libraries**: `@zk-kit/lean-imt.sol` 2.0.1 MIT, `@zk-kit/lean-imt` 2.2.5 MIT, zk-kit.solidity repo MIT [P]; `poseidon-solidity` 0.0.5 MIT; `poseidon-lite` 0.3.0 MIT; `circomkit` 0.3.4 MIT; `circom2` (WASM circom) 0.2.23 GPL-3.0 [P npm]. Byte-equality of `poseidon-lite` with circomlib Poseidon: [U], enforced by test SP-SDK-3.
- **EIP-196/197** Final; **EIP-1108** Final: `ECADD 0x06` 150 gas, `ECMUL 0x07` 6 000, pairing `0x08` `34 000*k + 45 000` [P]. Groth16 verify = 4-pair check `181 000` + `~6 150` per public signal (derived, excludes calldata and Solidity overhead). **EIP-2537** (BLS12-381) Final [P]; unused (snarkjs targets bn128).
- ERC-5564 announcer `0x55649E01...45564`, `SCHEME_ID = 1`, metadata layout and router rules [R: CONTRACTS_SPEC 1].

## 4. Architecture

### 4.1 Flows

```
SP-EXIT
P --GhostPayRouter.payERC20--> S1                                    (public, as today)
S1 --deposit(value, precommitment)--> Pool                           (public; gas: direct | buffer | permit-sponsored)
          ... delay, optional ASP root publication ...
Relayer --withdraw(W, proof)--> Pool --(value - fee)--> D_i, --fee--> relayer   (link hidden by proof)
          change note stays in pool (partial withdrawals)

SP-PAY
Payer (holds note) --> Relayer --withdraw(W{recipient=S1, announce=(R, metadata)}, proof)--> Pool
Pool --> S1 (value - fee);  Pool --ANNOUNCER.announce(1, S1, R, metadata)-->  (caller = Pool)

SP-RQ
depositor --ragequit(proof of commitment opening)--> Pool --full value--> depositor
```

### 4.2 Contracts (all: Solidity `0.8.28`, EVM `cancun`, OZ 5.x, no owner, no proxy, no pause, no `delegatecall`, no arbitrary external call, immutable config, full NatSpec; same bar as `GhostPayRouter` [R])

- `GhostPayShieldedPool` (abstract) + `GhostPayShieldedPoolERC20` (MUST) + `GhostPayShieldedPoolNative` (SHOULD). One pool per asset. Optional fixed denomination per deployment (`DENOMINATION`, `0` = variable value).
- `WithdrawVerifier`, `RagequitVerifier`: snarkjs-generated Groth16 verifiers; addresses immutable in the pool.
- `GhostPayAssociationSetRegistry`: permissionless; any address publishes roots for itself. No admin; replaces 0xbow's role-gated Entrypoint root.
- External calls allowed: asset token (`SafeERC20`), the two verifiers (`staticcall` via `view`), the immutable `ANNOUNCER`, the immutable `REGISTRY`, and value transfers to `recipient`/`relayer`/`feeTo`.
- No GhostPay protocol fee. No vetting fee. Relayer fee is chosen and signed into the proof by the withdrawer.

### 4.3 Circuits (fork of 0xbow circuits, Apache-2.0, attributed)

- `commitment.circom`: unchanged semantics (ragequit circuit). Public: `value`, `label`; outputs `commitment`, `nullifierHash`.
- `withdraw.circom` `Withdraw(32)`: 0xbow logic plus one public input `aspEnabled`:
  - `aspEnabled * (1 - aspEnabled) === 0` (boolean);
  - ASP inclusion constrained as `aspEnabled * (ASPRoot - ASPRootChecker.out) === 0`;
  - everything else as 0xbow (state inclusion, `Num2Bits(128)` x2, nullifier inequality, change commitment, `context` squared).
- Public signal order (circom puts outputs first) MUST be fixed and documented in `ProofLib`: `[newCommitmentHash, existingNullifierHash, withdrawnValue, stateRoot, stateTreeDepth, aspEnabled, ASPRoot, ASPTreeDepth, context]` (9 signals).
- `merkleTree.circom`: 0xbow LeanIMT inclusion, depth parameter 32.

### 4.4 Off-chain components

- `@ghostpay/shielded-pool` (TS SDK, non-GPL): note derivation, Poseidon (`poseidon-lite`), LeanIMT mirror (`@zk-kit/lean-imt`), event sync, witness input builder, `Withdrawal` encoding and `context`, relayer client, crowd estimate, option table.
- `@ghostpay/shielded-pool-prover` (GPL-isolated): wraps `snarkjs.groth16.fullProve` with circuit WASM + zkey; runs in a Web Worker or Node. Loaded only when the user picks a pool option.
- `apps/pool-relayer`: Node `node:http` + viem service, same structure as `apps/relayer` [R], uses `@ghostpay/relayer-guard`.
- `asp-cli` (in the SDK package `bin/`): builds a label set from `Deposited` events plus a policy file, writes `set.json`, publishes the root to the registry. Testnet demo publisher only.

### 4.5 Toolchain choice

| Toolchain | Setup | Maturity [evidence] | Licence | EVM verify | Decision |
|---|---|---|---|---|---|
| circom 2.2.3 + snarkjs 0.7.6 **Groth16** | Universal ptau + **per-circuit phase 2** | Used by 0xbow mainnet pool [P], Tornado/Semaphore lineage [U] | GPL-3.0 tools; circomlib LGPL/GPL conflict [P] | ~181k + 6.15k/public signal (derived [P]) | **PoC default** |
| circom + snarkjs PLONK / FFLONK | ptau only, no phase 2 [P] | FFLONK "Beta" [P]; PLONK verifier gas higher [U] | same | higher [U] | Fallback if ceremony is the blocker (same circuits; Q4) |
| Noir 1.0.0-rc.6 + Barretenberg UltraHonk | universal SRS [U] | README: not audited, not for production [P] | MIT/Apache-2.0 [P] | Solidity verifier [U], gas [U] | Spike only (`SP-CIR-9`), not in PoC acceptance |
| gnark (Go), halo2 (Rust) | Groth16/PLONK; KZG [U] | [U] | Apache-2.0 / MIT-Apache [U] | [U] | Not chosen: no circuit reuse from 0xbow |

Rationale: reuse of audited-in-production-shaped 0xbow circuits [P structure; audit status U], direct EVM verifier generation, cheapest verification. Cost: per-circuit ceremony and GPL toolchain.

**PoC ceremony (insecure, testnet-only):** phase 1 = Hermez `powersOfTau28_hez_final_16.ptau` verified against the blake2b hash in the snarkjs README if fetchable; else a locally generated `powersoftau new bn128 16` with 3 contributions + beacon, **labelled INSECURE-LOCAL**. Phase 2: `groth16 setup`, >= 2 contributions (two different machines/people when possible), `zkey beacon` with a published future testnet block hash, `zkey verify` transcript committed. Mainnet would require a public multi-party phase 2; out of scope.

### 4.6 Licensing (technical, per package)

- Circuits derived from 0xbow: Apache-2.0 notice + attribution kept in `packages/shielded-pool-circuits/NOTICE`.
- circomlib include (Poseidon, comparators): GPL-3.0 (npm) / LGPL-3.0 (repo) → `shielded-pool-circuits` is treated as GPL-3.0.
- Generated verifiers carry `SPDX-License-Identifier: GPL-3.0` [P template] → kept in their own files, not merged into pool sources; pool calls them through `IGroth16Verifier`.
- snarkjs runtime is GPL-3.0 → only in `shielded-pool-prover`.
- The repo is `UNLICENSED` [R: README "Licence"]; distributing GPL-derived artefacts under `UNLICENSED` is an owner decision (Q1). The PoC keeps GPL code in two isolated packages so the decision does not force a rewrite.

## 5. Package and directory ownership for the build

### 5.1 New (owned by this spec; nothing else writes here)

```
packages/shielded-pool-circuits/          (no npm workspace scripts that run on `npm test` unless circom present; see SP-CIR-8)
  package.json            name @ghostpay/shielded-pool-circuits, private, scripts: build, setup:dev, test
  NOTICE, README.md, DEVIATIONS.md
  circuits/commitment.circom, merkleTree.circom, withdraw.circom, main/withdraw32.circom, main/commitment.circom
  scripts/install-circom.sh      pinned v2.2.3 binary, sha256 pinned in file, refuses mismatch
  scripts/ceremony-dev.sh        phase 1 check / local gen, phase 2 contribute x2, beacon, verify, export
  ceremony/transcript.md         hashes of every ptau/zkey, contributor names, beacon block
  artifacts/                     withdraw.wasm, withdraw_final.zkey, withdraw.vkey.json, (same for commitment) + SHA256SUMS
  test/*.test.ts                 vitest + snarkjs witness/prove/verify; negative cases (8.1)

packages/shielded-pool-contracts/        Foundry project, own foundry.toml (copy packages/contracts/foundry.toml settings)
  foundry.toml, remappings.txt   OZ + forge-std remapped to ../contracts/lib (read-only reuse); lib/poseidon-solidity, lib/lean-imt.sol vendored with LICENSE
  src/GhostPayShieldedPool.sol, GhostPayShieldedPoolERC20.sol, GhostPayShieldedPoolNative.sol
  src/GhostPayAssociationSetRegistry.sol
  src/lib/ProofLib.sol, src/lib/PoolConstants.sol
  src/interfaces/IGhostPayShieldedPool.sol, IGhostPayAssociationSetRegistry.sol, IGroth16Verifier.sol
  src/verifiers/WithdrawVerifier.sol, RagequitVerifier.sol   (generated; GPL-3.0 header; regenerated by script, diff-checked in CI)
  script/DeployPool.s.sol        testnet only; writes deployment JSON
  test/*.t.sol, test/*.fuzz.t.sol, test/*.invariant.t.sol, test/mocks/*, test/fixtures/proofs/*.json
  DEVIATIONS.md, README.md

packages/shielded-pool/                  @ghostpay/shielded-pool (TS, UNLICENSED like siblings)
  package.json, tsconfig*.json, vitest.config.ts   copy packages/secret-box layout [R]
  src/index.ts, notes.ts, poseidon.ts, tree.ts, sync.ts, inputs.ts, withdrawal.ts, relayerClient.ts,
      crowd.ts, options.ts (SP_OPTION_INFO), copy.ts (UI strings), asp.ts, errors.ts
  bin/asp-cli.ts
  src/*.test.ts, src/vectors.test.ts (cross-language vectors), src/properties.test.ts (fast-check)

packages/shielded-pool-prover/           @ghostpay/shielded-pool-prover (GPL-3.0 isolated)
  src/index.ts (prove/verify), src/worker.ts, src/index.test.ts

apps/pool-relayer/                        @ghostpay/pool-relayer
  src/main.ts, server.ts, service.ts, quote.ts, validate.ts, chain.ts, log.ts, config.ts, *.test.ts, e2e.anvil.test.ts
  PRIVACY.md, README.md

test-vectors/shielded-pool.json           generated by packages/shielded-pool/scripts/gen-vectors.mjs (new file only)
```

### 5.2 Edits to existing code (separate; small; owners/other agents)

| File | Edit |
|---|---|
| `apps/web/src/...` (settings, sweep view, pay view) | Option picker (section 6.5), prover worker load, honest copy, crowd warning |
| `packages/chain-adapters/src/config/chains.ts`, `deployments.ts`, `deployments/schema.json` | Optional `shieldedPools[]`, `associationSetRegistry`, verifier code hashes per testnet; manifest read-back of pool bytecode hash |
| core scanner (`apps/web` scan client) | Accept announcements whose `caller` is a manifest pool address (no logic change if the scanner ignores `caller` [U, check]) |
| `THIRD_PARTY.md` | circom, snarkjs, circomlib, poseidon-solidity, lean-imt(.sol), poseidon-lite, circomkit entries |
| `docs/user/privacy-limits.md` | N1-N9 summary |
| root `package.json` | none (workspaces glob already covers `packages/*`, `apps/*` [R]) |

No edit to `packages/contracts/src/*` or the router. The router is not part of any pool flow (research 6.1 [R]).

## 6. Interfaces

### 6.1 `IGhostPayShieldedPool`

```solidity
// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

interface IGhostPayShieldedPool {
    struct Withdrawal {
        address recipient;        // D_i (SP-EXIT) or S1 (SP-PAY); != 0, != this
        address relayer;          // msg.sender MUST equal relayer, unless relayer == address(0) (anyone)
        uint256 relayerFee;       // paid to feeTo from withdrawnValue; <= withdrawnValue * MAX_RELAYER_FEE_BPS / 10_000
        address feeTo;            // != 0 if relayerFee > 0
        uint256 deadline;         // block.timestamp <= deadline
        address aspPublisher;     // address(0) iff proof.aspEnabled == 0
        bytes   announce;         // empty, or abi.encode(bytes ephemeralPubKey, bytes metadata) for SP-PAY
    }
    struct WithdrawProof { uint256[2] pA; uint256[2][2] pB; uint256[2] pC; uint256[9] pubSignals; }
    struct RagequitProof { uint256[2] pA; uint256[2][2] pB; uint256[2] pC; uint256[4] pubSignals; } // [commitment, nullifierHash, value, label]
    struct DepositAuth { address owner; uint256 value; uint256 precommitment; address feeTo; uint256 sponsorFee;
                         uint256 deadline; uint256 nonce; }
    struct PermitSig { uint256 value; uint256 deadline; uint8 v; bytes32 r; bytes32 s; }

    event Deposited(address indexed depositor, uint256 commitment, uint256 label, uint256 value, uint256 precommitment);
    event Withdrawn(address indexed recipient, uint256 value, uint256 relayerFee, uint256 spentNullifier,
                    uint256 newCommitment, address indexed aspPublisher, uint256 aspRoot);
    event Ragequit(address indexed depositor, uint256 commitment, uint256 label, uint256 value);

    error WrongChain(); error ZeroAddress(); error InvalidValue(); error InvalidPrecommitment(); error Expired();
    error InvalidRelayer(); error FeeTooHigh(); error ContextMismatch(); error InvalidTreeDepth(); error UnknownStateRoot();
    error AspMismatch(); error UnknownAspRoot(); error InvalidProof(); error NullifierSpent(); error NotDepositor();
    error InvalidCommitment(); error InvalidAnnounce(); error UnexpectedBalanceDelta(); error NativeTransferFailed();
    error InvalidSignature(); error NonceUsed(); error DepositCapExceeded(); error TreeFull(); error NoDirectETH();

    // ERC20 pool: pulls `value` from msg.sender. Native pool: value == msg.value.
    function deposit(uint256 value, uint256 precommitment) external payable returns (uint256 commitment, uint256 label);
    // ERC20 pool only. Sponsor submits; owner (e.g. S1) signs EIP-712 DepositAuth; depositor recorded = owner.
    function depositWithPermit(DepositAuth calldata a, bytes calldata authSig, PermitSig calldata permit)
        external returns (uint256 commitment, uint256 label);
    function withdraw(Withdrawal calldata w, WithdrawProof calldata p) external;
    function ragequit(RagequitProof calldata p) external;

    function ASSET() external view returns (address);            // address(0) for native
    function SCOPE() external view returns (uint256);            // keccak256(abi.encode(address(this), block.chainid, ASSET)) % P
    function DENOMINATION() external view returns (uint256);     // 0 = variable
    function MAX_DEPOSIT() external view returns (uint256);
    function MAX_RELAYER_FEE_BPS() external view returns (uint256);
    function ASP_GRACE_SECONDS() external view returns (uint256);
    function ANNOUNCER() external view returns (address);
    function REGISTRY() external view returns (address);
    function WITHDRAW_VERIFIER() external view returns (address);
    function RAGEQUIT_VERIFIER() external view returns (address);
    function currentRoot() external view returns (uint256);
    function currentTreeDepth() external view returns (uint256);
    function currentTreeSize() external view returns (uint256);
    function isKnownRoot(uint256 root) external view returns (bool);
    function nullifierSpent(uint256 nullifierHash) external view returns (bool);
    function depositorOf(uint256 label) external view returns (address);
    function DOMAIN_SEPARATOR() external view returns (bytes32);
}
```

Constants (`PoolConstants`): `SNARK_SCALAR_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617` [U: standard bn254 r; test against `checkField` constant in the generated verifier], `ROOT_HISTORY_SIZE = 64`, `MAX_TREE_DEPTH = 32`, `MAX_VALUE = 2**128 - 1`. EIP-712 domain `name "GhostPayShieldedPool"`, `version "1"`; `DEPOSIT_AUTH_TYPEHASH = keccak256("DepositAuth(address owner,uint256 value,uint256 precommitment,address feeTo,uint256 sponsorFee,uint256 deadline,uint256 nonce)")`.

Constructor: `(address asset, IERC5564Announcer announcer, IGhostPayAssociationSetRegistry registry, IGroth16Verifier withdrawVerifier, IGroth16Verifier ragequitVerifier, uint256 denomination, uint256 maxDeposit, uint256 maxRelayerFeeBps, uint256 aspGraceSeconds)`; reverts `WrongChain` unless `block.chainid ∈ {31337, 11155111, 84532}`; all addresses non-zero except `asset` on native; `maxRelayerFeeBps <= 1_000`; `aspGraceSeconds <= 1 days`; `maxDeposit <= MAX_VALUE`.

Withdraw rule order: `nonReentrant` → deadline → relayer/msg.sender → fee bounds → `context == uint256(keccak256(abi.encode(w, SCOPE))) % P` → depths `<= 32` → `isKnownRoot(stateRoot)` → ASP check (6.2) → `withdrawnValue > 0` → `verifyProof` → spend nullifier (revert `NullifierSpent`) → insert `newCommitmentHash` (also when change is 0, as 0xbow) → transfer `withdrawnValue - relayerFee` to `recipient` and `relayerFee` to `feeTo` with balance-delta checks → if `announce` non-empty, validate as router rules (33-byte key prefix 02/03, 57-byte metadata, `metadata[1:5]` = `0xa9059cbb` and `metadata[5:25] == ASSET` (ERC20) or native markers, `metadata[25:57] == withdrawnValue - relayerFee`) and call `ANNOUNCER.announce(1, recipient, key, metadata)` → emit `Withdrawn`.

Deposit rules: `0 < value <= MAX_DEPOSIT`; `DENOMINATION == 0 || value == DENOMINATION`; `0 < precommitment < P`; label/commitment as 0xbow; `depositorOf[label] = msg.sender` (or `a.owner`); balance-delta check (rejects fee-on-transfer); tree size `< 2**32`. `depositWithPermit`: ECDSA (OZ, rejects high-s) signer == `a.owner`; nonce bitmap consumed before external calls; `permit` in `try/catch` (as `GhostPaySweepRelayer` [R]); pulls `value + sponsorFee` from owner, `sponsorFee` to `feeTo`.

### 6.2 `IGhostPayAssociationSetRegistry`

```solidity
interface IGhostPayAssociationSetRegistry {
    event RootPublished(address indexed publisher, uint256 indexed root, uint64 index, string uri);
    error InvalidRoot();
    function publish(uint256 root, string calldata uri) external;                 // publisher = msg.sender; 0 < root < P
    function latest(address publisher) external view returns (uint256 root, uint64 publishedAt, uint64 index);
    function supersededAt(address publisher, uint256 root) external view returns (uint64); // 0 if latest or never
    function wasPublished(address publisher, uint256 root) external view returns (bool);
}
```

Pool ASP check: if `aspEnabled == 0`: require `aspPublisher == 0 && ASPRoot == 0 && ASPTreeDepth == 0`. Else require `aspPublisher != 0`, `wasPublished(publisher, ASPRoot)`, and (`ASPRoot == latest(publisher).root` or `block.timestamp - supersededAt <= ASP_GRACE_SECONDS`). The publisher is public in `Withdrawn` (that is the disclosure). Set contents (`set.json`: `{version, pool, chainId, labels[], policy, generatedAtBlock}`) are fetched from `uri`; client recomputes the root and refuses mismatch.

### 6.3 TypeScript SDK (`@ghostpay/shielded-pool`)

```ts
export type SpOption = 'SP-EXIT' | 'SP-PAY' | 'SP-RQ';
export type AspMode = { kind: 'none' } | { kind: 'publisher'; publisher: Address; setUri: string };
export type Submitter = { kind: 'relayer'; url: string } | { kind: 'self' };
export type DepositGas = 'direct' | 'buffer' | 'permit-sponsored';

export interface Note { chainId: number; pool: Address; index: number; value: bigint; label: bigint;
                        nullifier: bigint; secret: bigint; leafIndex?: number; spent?: boolean }
export function deriveNoteSecrets(withSeed: <T>(f: (seed: Uint8Array) => T) => T,
                                  chainId: number, pool: Address, index: number): { nullifier: bigint; secret: bigint };
//   poolSeed = HKDF-SHA256(ikm=seed, salt="ghostpay/shielded-pool/v1", info=u32be(chainId)||pool, 32)
//   nullifier = OS2IP(HKDF-Expand(poolSeed, "n"||u32be(index), 64)) mod P ; secret likewise with "s"; retry if 0
export function precommitment(n: { nullifier: bigint; secret: bigint }): bigint;     // Poseidon(nullifier, secret)
export function commitment(value: bigint, label: bigint, pre: bigint): bigint;       // Poseidon(value, label, pre)
export function nullifierHash(nullifier: bigint): bigint;                            // Poseidon(nullifier)
export class PoolTree { insert(leaf: bigint): void; root(): bigint; depth(): number; proof(i: number): { siblings: bigint[]; index: number } }
export function syncPool(rpc: PoolRpc, pool: Address, fromBlock: bigint): Promise<{ tree: PoolTree; deposits: DepositEvt[]; withdrawals: WithdrawEvt[] }>;
export function recoverNotes(withSeed: ..., synced: Synced, maxIndex?: number /*200*/): Note[];
export function encodeWithdrawal(w: Withdrawal): Hex;
export function contextOf(w: Withdrawal, scope: bigint): bigint;                     // keccak256(abi.encode(w, SCOPE)) mod P
export function buildWithdrawInputs(a: { note: Note; tree: PoolTree; asp?: { labels: bigint[] }; withdrawnValue: bigint;
                                        newNote: { nullifier: bigint; secret: bigint }; context: bigint }): WithdrawCircuitInputs;
export function buildSpPayAnnounce(sellerMeta: string, rng: RandomSource, token: Address, netValue: bigint): { recipient: Address; announce: Hex };
//   uses deriveStealthPayment from @ghostpay/core-crypto [R]; metadata layout = router layout
export function estimatePoolCrowd(synced: Synced, value: bigint, windowSec: number): { deposits: number; label: 'none'|'tiny'|'small'|'larger' };
export interface SpOptionInfo { option: SpOption; hides: string[]; doesNotHide: string[]; whoSees: Record<string, string[]>;
                                needsRelayer: boolean; needsProver: boolean; testnetOnly: true }
export const SP_OPTION_INFO: Record<SpOption, SpOptionInfo>;
export class ShieldedPoolError extends Error { code: 'WRONG_CHAIN'|'ROOT_MISMATCH'|'ASP_SET_MISMATCH'|'NOTE_SPENT'|'CROWD_TOO_SMALL'|'FEE_TOO_HIGH'|'VECTOR_MISMATCH'|'BAD_RECIPIENT' }
```

Seed source: SP-EXIT uses the seller's spending secret via `@ghostpay/secret-box` scope (as hygiene HY-DST [R]); SP-PAY payer without GhostPay keys uses a random 32-byte pool seed stored in the encrypted keystore export.

Prover (`@ghostpay/shielded-pool-prover`): `prove(kind: 'withdraw'|'commitment', inputs, artifacts: { wasmUrl, zkeyUrl, sha256: {wasm, zkey} }): Promise<{ proof: Groth16Proof; publicSignals: string[] }>`; `verify(vkey, proof, publicSignals): Promise<boolean>`. Artifacts verified by SHA-256 before use.

### 6.4 Pool relayer HTTP API (`apps/pool-relayer`)

- `GET /v1/info` → `{ chainIds, pools[], relayer, feeTo, maxFeeBps, version }`.
- `POST /v1/quote {chainId, pool, withdrawnValue}` → `{ relayer, feeTo, relayerFee, deadline }` (stateless; fee = gas estimate x price x (1 + margin) converted at a configured testnet rate).
- `POST /v1/relay {chainId, pool, withdrawal, proof}` → `{ txHash }`. Validation: chain and pool in manifest allowlist; `withdrawal.relayer == own address`; fee >= quote formula at current price; local `snarkjs` verify (cheap reject) then `eth_call` simulation; submit; rate limit and breaker via `@ghostpay/relayer-guard`.
- Logs: privacy-ops PO-LOG-1 allowlist [R]; no persistence of body, recipient, IP.

### 6.5 User-visible options (UI / CLI)

Settings group "Shielded pool (testnet PoC)". Disabled unless manifest has a pool for the chain. Per action:

| Control | Values | Default |
|---|---|---|
| Method | `SP-EXIT` on sweep view; `SP-PAY` on pay view; `SP-RQ` on note list | off |
| Association set | `none` / publisher picker (address + set URI) | `none` |
| Submit via | relayer URL / self (warns: gas funding links the submitter) | relayer |
| Amount plan | whole / denominations (`@ghostpay/amount-blur` `planSplit`, `denom`) | denominations |
| Delay | min/max hours, random | 24-72 h |
| Deposit gas | direct / buffer / permit-sponsored | permit-sponsored if token has ERC-2612 |
| Destination (SP-EXIT) | fresh self-stealth `D_i` (hygiene `deriveFreshDestination`) / custom address (warning) | fresh |

Before signing, the UI shows: crowd estimate, who sees what (`SP_OPTION_INFO.whoSees`), relayer fee, ASP publisher disclosure, and the fixed line "Test pool: anonymity set is only other testnet users."

## 7. Requirements (numbered, testable)

### General (`SP-GEN`)
- SP-GEN-1 (MUST) All pool contracts revert `WrongChain` in the constructor unless `block.chainid ∈ {31337, 11155111, 84532}`; SDK, prover, relayer and UI refuse other chain ids (`WRONG_CHAIN`).
- SP-GEN-2 (MUST) No GhostPay fee on any pool step (deposit, withdraw, ragequit, relay). Grep test: no `FEE_RECIPIENT` / GhostPay fee address in pool contracts or relayer config.
- SP-GEN-3 (MUST) `SP_OPTION_INFO[*].hides` never contains `'deposit'`, `'depositor'`, `'ip'` or `'anonymity'`; `doesNotHide` contains N1-N9 ids. Unit test.
- SP-GEN-4 (MUST) Every new dependency has an exact pin and a `THIRD_PARTY.md` row; GPL-3.0 code only in `shielded-pool-circuits`, `shielded-pool-prover` and `src/verifiers/*` (licence-scan test over `node_modules` reachable from `@ghostpay/shielded-pool` and `apps/web` non-pool chunks).

### Circuits (`SP-CIR`)
- SP-CIR-1 (MUST) circom pinned to v2.2.3 binary with sha256 check; compile with `--O2 --sanity_check` [P flag]; no `--constraint_assert_dissabled`.
- SP-CIR-2 (MUST) Withdraw circuit enforces: commitment preimage, state inclusion, `aspEnabled` boolean, conditional ASP inclusion, `Num2Bits(128)` on `withdrawnValue` and remainder, `existingNullifier != newNullifier`, change commitment with same label, `context` bound.
- SP-CIR-3 (MUST) Negative tests: each constraint in SP-CIR-2 has a witness that violates only it and fails to generate/verify.
- SP-CIR-4 (MUST) `circomspect` run with zero unresolved warnings (or each justified in `DEVIATIONS.md`) [U: tool licence/version to pin].
- SP-CIR-5 (MUST) Public-signal order test: snarkjs `publicSignals` indices match `ProofLib` getters for a known witness.
- SP-CIR-6 (MUST) Ceremony transcript lists every ptau/zkey hash; `snarkjs zkey verify` passes in CI against committed r1cs + ptau; zkey and wasm SHA-256 in `SHA256SUMS`; generated verifiers byte-identical to `zkey export solidityverifier` output.
- SP-CIR-7 (MUST) Artifacts and transcript labelled `INSECURE-LOCAL` or `TESTNET-CEREMONY`; the prover refuses artifacts without a label.
- SP-CIR-8 (SHOULD) `npm test` skips circuit compilation when circom is absent and runs proof tests from committed artifacts.
- SP-CIR-9 (SHOULD) Noir spike: same withdraw statement in Noir, measure proving time (browser, Node) and verifier gas; report only, not wired in.

### Contracts (`SP-CON`)
- SP-CON-1 (MUST) No owner, role, proxy, pause, `selfdestruct`, `delegatecall`, upgrade or setter; all config `immutable`/`constant` (static check + test reading storage layout).
- SP-CON-2 (MUST) `withdraw` reverts on: expired deadline; `msg.sender != relayer` when `relayer != 0`; fee above `MAX_RELAYER_FEE_BPS` or `> withdrawnValue`; `context` mismatch (any field of `Withdrawal` changed); depth > 32; unknown state root; ASP rule violation (6.2); invalid proof; spent nullifier; `recipient` zero or `this`.
- SP-CON-3 (MUST) A relayer or front-runner cannot change `recipient`, `relayerFee`, `feeTo`, `aspPublisher` or `announce` without invalidating the proof (fuzz each field).
- SP-CON-4 (MUST) Nullifier single-use across `withdraw` and `ragequit`.
- SP-CON-5 (MUST) Invariant: pool asset balance `>=` sum of unspent note values tracked by the test ghost; equals it for standard tokens.
- SP-CON-6 (MUST) Balance-delta checks on every pull/push; fee-on-transfer and rebasing mocks revert `UnexpectedBalanceDelta`; no-return and returns-false tokens handled by `SafeERC20`.
- SP-CON-7 (MUST) `nonReentrant` on all state-changing entry points; reentrant-token and reentrant-recipient (native) mocks cannot double-spend.
- SP-CON-8 (MUST) `depositWithPermit`: sponsor cannot alter `precommitment`, `value`, `sponsorFee`, `feeTo`; front-run permit does not block; nonce single-use; high-s rejected.
- SP-CON-9 (MUST) `announce` path: validation identical to router metadata rules [R]; the announcement `caller` is the pool; empty `announce` emits no announcement.
- SP-CON-10 (MUST) Ragequit only by `depositorOf(label)`; requires commitment in state; pays full value; emits `Ragequit`.
- SP-CON-11 (MUST) State-root window: root accepted for the next 63 inserts, rejected after 64.
- SP-CON-12 (MUST) `DENOMINATION != 0` pools reject other deposit values; `MAX_DEPOSIT` enforced.
- SP-CON-13 (SHOULD) Gas snapshot for deposit, depositWithPermit, withdraw (with/without announce, with/without ASP), ragequit, publish.
- SP-CON-14 (MUST) Differential: Solidity `PoseidonT3/T4` and on-chain LeanIMT root equal SDK and circuit values on `test-vectors/shielded-pool.json`.

### Registry (`SP-ASP`)
- SP-ASP-1 (MUST) Anyone can publish; roots are per publisher; no address can publish for another; `root == 0` or `>= P` reverts.
- SP-ASP-2 (MUST) `supersededAt` set on next publish; pool grace rule tested at `grace - 1`, `grace`, `grace + 1`.
- SP-ASP-3 (MUST) `asp-cli` output root equals `PoolTree` root over `set.json.labels`; client refuses a set whose recomputed root differs (`ASP_SET_MISMATCH`).
- SP-ASP-4 (SHOULD) `asp-cli` policy modes: `all`, `allowlist <file>`, `denylist <file>`, `min-age <blocks>`.

### SDK / prover (`SP-SDK`)
- SP-SDK-1 (MUST) Note secrets derive deterministically from the seed (6.3) and are recoverable by `recoverNotes` after wiping local state.
- SP-SDK-2 (MUST) Seed material only inside `secret-box` scopes; never logged, never sent to relayer or RPC (egress test per privacy-ops AT-PO-1 [R]).
- SP-SDK-3 (MUST) Poseidon (`poseidon-lite`) equals circomlib Poseidon for >= 1 000 random vectors (via witness calc) and committed vectors; mismatch throws `VECTOR_MISMATCH` at load.
- SP-SDK-4 (MUST) SDK verifies synced tree root equals `currentRoot()` before proving (`ROOT_MISMATCH`).
- SP-SDK-5 (MUST) Prover checks artifact SHA-256 before loading; runs in a Worker in the browser.
- SP-SDK-6 (MUST) Before any SP-EXIT/SP-PAY withdrawal, compute `estimatePoolCrowd`; if `deposits < minCrowd` (default 50) the UI requires an explicit second confirmation (`CROWD_TOO_SMALL`).
- SP-SDK-7 (MUST) Default SP-EXIT recipient is a fresh hygiene `D_i`; the SDK refuses a recipient equal to the note's depositor, any known `S1`, or a destination already used (`BAD_RECIPIENT`, hygiene HY-CON ledger [R]).
- SP-SDK-8 (SHOULD) Amount plan via `@ghostpay/amount-blur`; withdrawal never equals the deposit value exactly unless the user selects `whole`.
- SP-SDK-9 (SHOULD) Selective disclosure export: `{label, commitment, leafIndex, depositTx}` JSON for a third party; off by default.

### Relayer (`SP-REL`)
- SP-REL-1 (MUST) Relays only to manifest pools on allowlisted chains; rejects `withdrawal.relayer != self`.
- SP-REL-2 (MUST) Rejects invalid proofs locally before simulation; simulates before sending; never signs anything but the `withdraw` tx.
- SP-REL-3 (MUST) Logs only PO-LOG-1 fields; no disk persistence; per-IP / global limits via `relayer-guard`.
- SP-REL-4 (MUST) `PRIVACY.md` lists what the relayer sees (recipient, value, fee, proof, IP, timing).
- SP-REL-5 (SHOULD) Fee quote stateless and reproducible from `/v1/info` parameters.

### UI (`SP-UI`)
- SP-UI-1 (MUST) Options hidden unless the manifest lists a pool for the current chain.
- SP-UI-2 (MUST) Before signing, show N1-N9 lines from `copy.ts` and the "test pool" line; snapshot test.
- SP-UI-3 (MUST) No UI or doc string says "anonymous", "untraceable" or "unlinkable" (string scan, privacy-ops PO-COR-4 [R]).
- SP-UI-4 (MUST) Self-submit option warns that the submitter address must be funded and that funding links it.

## 8. Test plan

1. **Circuits** (vitest + snarkjs, from `packages/shielded-pool-circuits`): positive withdraw (partial, full, `aspEnabled` 0/1, depth 1, 2, 20); negative per SP-CIR-3 (wrong secret, wrong leaf index, wrong ASP sibling with `aspEnabled=1`, `aspEnabled=2`, `withdrawnValue > existingValue` (field wrap), `withdrawnValue = 2^128`, equal nullifiers, altered `context`); commitment circuit vectors; public-signal order; `circomspect`.
2. **Contracts** (Foundry, `packages/shielded-pool-contracts`): unit per SP-CON; fuzz 10 000 runs on `Withdrawal` field tampering, deposit values, fee bounds; invariants (balance vs ghost notes, nullifier single-use, root window, registry monotone index); mocks reused by copy from `packages/contracts/test/mocks` [R] (standard, no-return, returns-false, fee-on-transfer, reentrant, permit, blacklisting); real-proof fixtures from `test/fixtures/proofs/*.json` (generated by the circuits package, verified by the generated verifiers); verifier `checkField` test with a public signal `>= P`; gas snapshot; mutation run with gambit (available in sandbox tools [R: `/tmp/claude-0/tools/gambit`]).
3. **Cross-language vectors**: `test-vectors/shielded-pool.json` (Poseidon T2/T3/T4, LeanIMT roots for sizes 1..33, label/context examples) checked by TS, circuit witness and Solidity.
4. **SDK**: deterministic derivation, recovery, sync with reorg simulation (drop last N events), input builder vs circuit, `contextOf` vs Solidity `abi.encode`, crowd estimate, option table invariants (SP-GEN-3), recipient guard.
5. **Relayer**: unit (validation, fee, logging allowlist), `e2e.anvil.test.ts` like `apps/relayer` [R].
6. **End-to-end (anvil)**: script `packages/shielded-pool/scripts/e2e-anvil.mjs`: deploy announcer (CC0 ref), router, mock permit token, verifiers, registry, pool; P pays S1 via router; S1 `depositWithPermit` via sponsor; ASP publishes; withdraw via relayer to `D_i` with ASP, then a second partial with `none`; SP-PAY to a new seller stealth address and seller scan finds it with `checkAnnouncement` [R core-crypto]; ragequit of a third deposit; double-spend and tamper attempts revert.
7. **Testnet (Sepolia, Base Sepolia)**: deploy via script, manifest entry, one full SP-EXIT and SP-PAY cycle; record tx hashes and gas in `packages/shielded-pool-contracts/DEVIATIONS.md`.
8. **Leakage note** (D-13 [R]): count testnet deposits per token/day and report the crowd; no privacy claim.

## 9. PoC acceptance criteria

1. `forge test` green in `packages/shielded-pool-contracts` (unit, fuzz 10 000, invariants) with real Groth16 proof fixtures.
2. `npm test -w @ghostpay/shielded-pool -w @ghostpay/shielded-pool-prover -w @ghostpay/pool-relayer` green; circuit tests green where circom is installed.
3. Anvil E2E (8.6) passes from a clean checkout with one command.
4. Ceremony transcript and `SHA256SUMS` committed; `zkey verify` passes; artifacts labelled.
5. Deployed on at least one testnet; manifest validated; one SP-EXIT and one SP-PAY tx pair recorded.
6. UI shows all options of 6.5 with honest copy (SP-UI-2/3) and blocks on non-testnet chains.
7. Licence scan (SP-GEN-4) passes; `THIRD_PARTY.md` rows added.
8. Gas table and measured browser proving time (one desktop browser) recorded.

## 10. Effort

| Part | Size |
|---|---|
| Circuits fork + `aspEnabled` + tests + dev ceremony | M |
| Pool + registry contracts + Foundry suites | M |
| SDK (notes, tree, sync, inputs, options) | M |
| Prover package | S |
| Pool relayer | M |
| `asp-cli` | S |
| Web UI edits (other owners) | M |
| Noir spike (optional) | S-M |
| **Total** | **L** |

## 11. Risks

| Risk | Impact | Mitigation in PoC |
|---|---|---|
| Trusted setup compromised (toxic waste) | Forged proofs drain pool | Testnet-only guard, `MAX_DEPOSIT`, labelled insecure ceremony; mainnet needs public MPC (out of scope) |
| Under-constrained circuit / missing range check (e.g. remainder wrap mod P) | Inflation, double-spend | Fork 0xbow constraints, per-constraint negative tests, circomspect, review against 0xbow diff |
| Public input not reduced mod P | Nullifier aliasing | snarkjs `checkField` [P] + test; pool computes `context` mod P |
| Groth16 proof malleability | None for funds if nullifier is the replay key | Replay keyed by nullifier, not proof bytes; test re-randomised proof cannot re-spend |
| Poseidon / LeanIMT mismatch TS vs circom vs Solidity | Unprovable notes, stuck funds | Cross-language vectors (SP-CON-14, SP-SDK-3); ragequit fallback |
| Immutable bug | Cannot fix | Testnet-only; redeploy new pool + manifest |
| Tiny crowd, fingerprinting | No real privacy | Crowd gate, honest copy (N1, N4) |
| Relayer censorship / IP logging | Liveness, metadata | Self-submit option, multiple relayer URLs, ragequit |
| ASP misuse | Exclusion, disclosure | `none` mode always available; publisher choice explicit |
| Sponsored deposit precommitment substitution | Theft | EIP-712 `DepositAuth` signed by owner (SP-CON-8) |
| Licence (GPL-3.0 toolchain and verifier vs `UNLICENSED` repo) | Distribution blocker | Package isolation (4.6); owner decision Q1 |
| Browser proving cost (depth 32, ~64k constraints [P: ptau 16 used by 0xbow]) | UX | Worker, Node CLI fallback, measure |
| Noir immaturity | Not production-ready per its README [P] | Spike only |
| Legal (deferred) | Project-level | Noted once at top; no fee, testnet only |

## 12. Open questions

- Q1. Licence: accept GPL-3.0 for circuits/prover/verifiers, or reimplement Poseidon/comparators under a permissive licence? Resolve circomlib LGPL (repo) vs GPL (npm) [P].
- Q2. `ASP_GRACE_SECONDS` default (proposal 600 s on testnet) and whether old roots should be accepted at all.
- Q3. One pool per token with variable value, or also fixed-denomination pools per token (`DENOMINATION`)? PoC deploys one variable pool per test token plus one fixed (e.g. 100 units) for comparison.
- Q4. If the phase-2 ceremony is unacceptable even for testnet, switch to snarkjs PLONK (no phase 2) at higher verify gas [U]?
- Q5. Phase-1 source: Hermez ptau host `circom.info` blocked here; mirror location and hash verification path.
- Q6. Does the web scanner filter announcements by `caller`? If yes, add manifest pool addresses (edit in 5.2).
- Q7. Should SP-EXIT deposits use the payer-hiding 7702 delegate or only the ERC-2612 `depositWithPermit` path? PoC: permit path only.
- Q8. Compare with depositing into 0xbow's own Sepolia deployment [P: deploy script exists; live address U] as a third-party option in a separate spec.
- Q9. 0xbow audit reports: locate and read before reusing their circuits beyond testnet [U].

## 13. Non-goals

Mainnet deployment; private in-pool transfers (Railgun-style); multi-asset notes; governance; GhostPay-run production ASP or relayer; Tor transport; recursive proofs.

## 14. Glossary

`S1` stealth address receiving a router payment; `D_i` fresh self-derived destination (hygiene HY-DST); `P` bn254 scalar field modulus; label = per-deposit id; precommitment = `Poseidon(nullifier, secret)`; ASP = association set publisher.

## 15. Sources (all retrieved 2026-10-21)

- 0xbow privacy-pools-core: https://raw.githubusercontent.com/0xbow-io/privacy-pools-core/main/LICENSE ; .../README.md ; .../packages/circuits/README.md ; .../packages/circuits/circuits/withdraw.circom ; .../packages/circuits/circuits/commitment.circom ; .../packages/circuits/package.json ; .../packages/contracts/README.md ; .../packages/contracts/src/contracts/PrivacyPool.sol ; .../packages/contracts/src/contracts/State.sol ; .../packages/contracts/src/interfaces/IPrivacyPool.sol ; .../packages/contracts/package.json ; .../packages/contracts/remappings.txt [P]
- L2BEAT ZK catalog, Privacy Pools trusted setup: https://l2beat.com/zk-catalog/privacy-pools [S, via search result summary; page not fetched]
- circom: https://raw.githubusercontent.com/iden3/circom/master/COPYING ; https://github.com/iden3/circom/releases [P]
- snarkjs: https://raw.githubusercontent.com/iden3/snarkjs/master/COPYING ; https://raw.githubusercontent.com/iden3/snarkjs/master/README.md ; https://raw.githubusercontent.com/iden3/snarkjs/master/templates/verifier_groth16.sol.ejs [P]
- circomlib: https://raw.githubusercontent.com/iden3/circomlib/master/LICENSE ; https://raw.githubusercontent.com/iden3/circomlib/master/package.json [P]
- Noir: https://raw.githubusercontent.com/noir-lang/noir/master/README.md ; LICENSE-MIT, LICENSE-APACHE [P]; https://noir-lang.org/docs/ (DNS failure in sandbox)
- Aztec/Barretenberg: https://raw.githubusercontent.com/AztecProtocol/aztec-packages/master/LICENSE [P]
- zk-kit.solidity: https://raw.githubusercontent.com/privacy-scaling-explorations/zk-kit.solidity/main/LICENSE [P]
- npm registry metadata (version, licence, publish time): https://registry.npmjs.org/{poseidon-solidity,@zk-kit/lean-imt.sol,@zk-kit/lean-imt,snarkjs,circomlib,circomkit,circomlibjs,@noir-lang/noir_js,@aztec/bb.js,poseidon-lite,circom2,circom_tester} [P]
- EIPs: https://raw.githubusercontent.com/ethereum/EIPs/master/EIPS/eip-196.md ; eip-197.md ; eip-1108.md ; eip-2537.md [P]
- Buterin, Illum, Nadler, Schär, Soleimani 2024, doi:10.1016/j.bcra.2023.100176; Wang et al. WWW '23, doi:10.1145/3543507.3583217 [S, as cited in `anonymization-research.md`; not re-fetched]
