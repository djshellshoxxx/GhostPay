# Wiring: `packages/pool-contracts` (swarm 10 → swarm 4)

Status: built 2026-10-21 on `claude/remote-extensions-10`, **not deployed anywhere, not wired anywhere**. Testnet PoC
(constructor refuses chain ids other than 31337 / 11155111 / 84532). The verifiers it is tested with come from the
**INSECURE dev ceremony** of `packages/pool-circuits`: anyone can forge proofs and drain a pool that uses them.

Contracts of record: `packages/pool-contracts/src/interfaces/IGhostPayShieldedPool.sol`,
`IGhostPayAssociationSetRegistry.sol`. Circuit interface of record: `packages/pool-circuits/INTERFACE.md` (public-signal
order identical to `src/lib/ProofLib.sol`). Deviations from the spec ABI: `packages/pool-contracts/DEVIATIONS.md` D1-D9.

## 1. ABI facts consumers rely on

| Item | Value |
|---|---|
| Pool constructor | `constructor(PoolConfig c)`, `PoolConfig = (address asset, IERC5564Announcer announcer, IGhostPayAssociationSetRegistry registry, IWithdrawVerifier withdrawVerifier, IRagequitVerifier ragequitVerifier, IPoseidonT3 poseidonT3, IPoseidonT4 poseidonT4, uint256 denomination, uint256 maxDeposit, uint256 maxRelayerFeeBps, uint256 aspGraceSeconds)`; ERC-20 pool needs `asset` with code, native pool needs `asset == 0`. |
| Hashers | `poseidon-solidity` 0.0.5 `PoseidonT3` / `PoseidonT4` **deployed as contracts** (artifacts `out/PoseidonT3.sol/PoseidonT3.json`, `out/PoseidonT4.sol/PoseidonT4.json`); the pool checks `Poseidon(1,2)` / `Poseidon(1,2,3)` at construction. |
| `SCOPE` | `uint256(keccak256(abi.encode(address(pool), block.chainid, asset))) % P` (spec formula; `abi.encode`, not `encodePacked`). Verified against `test-vectors/shielded-pool.json` (`SharedVectors.t.sol`). |
| `label` | `uint256(keccak256(abi.encodePacked(SCOPE, depositNonce))) % P`, nonce 1-based. |
| `context` | `uint256(keccak256(abi.encode(Withdrawal, SCOPE))) % P`, `Withdrawal` = spec 6.1 tuple (same as `pool-sdk` `contextOf`). |
| Events | `Deposited`, `Withdrawn`, `Ragequit` exactly as spec 6.1, plus `LeafInserted(uint256 index, uint256 leaf, uint256 root)` for every appended leaf (deposits and change notes). |
| Extra views | `isLeaf(uint256)`, `depositNonce()`, `POSEIDON_T3()`, `POSEIDON_T4()`, `ROOT_HISTORY_SIZE` (64), `MAX_TREE_DEPTH` (32), `MAX_TREE_SIZE` (2^32); ERC-20 pool: `DEPOSIT_AUTH_TYPEHASH`, `DOMAIN_SEPARATOR()`, `nonceUsed(owner, nonce)`. |
| Sponsored deposit | `depositWithPermit(DepositAuth a, bytes authSig, PermitSig permit)` on the ERC-20 pool only; EIP-712 domain `("GhostPayShieldedPool", "1", chainId, pool)`; 65-byte low-s ECDSA signature by `a.owner`; nonce bitmap (`nonce >> 8` word, `nonce & 0xff` bit). |
| Errors | the spec 6.1 list, plus `InvalidConfig`, `InvalidRecipient`, `InvalidLeaf`; `InvalidSignature` and `NonceUsed` are declared on the ERC-20 extension interface. |
| Root window | a root is accepted for the next 63 inserts and rejected after the 64th (deposits **and** withdrawals insert). |

## 2. Exact edits in existing code (for swarm 4; not made here)

| File | Edit |
|---|---|
| `.github/workflows/ci.yml` | New job `pool-contracts` (copy of `contracts-test`): `working-directory: packages/pool-contracts`; `forge fmt --check`; `forge build` (must print no warnings); `forge test` (default profile: 10 000 fuzz runs, invariants 256 x 50; needs no circom: real-proof fixtures and the verifier sources in `packages/pool-circuits/verifiers/` are committed); `scripts/check-natspec.sh`; `scripts/check-static.sh`. Slither job copy with `working-directory: packages/pool-contracts` and `--filter-paths "lib|test|script|\.\./contracts/lib"`. Add the path filter `packages/pool-contracts/**`, `packages/pool-circuits/verifiers/**`, `test-vectors/shielded-pool.json` to the `changes` job. |
| `packages/pool-sdk/src/abi.ts` | Add `event LeafInserted(uint256 index, uint256 leaf, uint256 root)`, `function isLeaf(uint256) view returns (bool)`, `function depositNonce() view returns (uint256)`, the custom errors (`InvalidConfig`, `InvalidRecipient`, `InvalidLeaf`, `InvalidSignature`, `NonceUsed`, and the spec list) so viem can decode reverts, and the ERC-20 extension `depositWithPermit((address,uint256,uint256,address,uint256,uint256,uint256),bytes,(uint256,uint256,uint8,bytes32,bytes32))`, `nonceUsed(address,uint256)`, `DOMAIN_SEPARATOR()`. Optional: sync the tree from `LeafInserted` (one event type, ordered by `index`) instead of merging `Deposited` + `Withdrawn`. |
| `packages/pool-sdk` (DepositAuth signing) | EIP-712 types `DepositAuth(address owner,uint256 value,uint256 precommitment,address feeTo,uint256 sponsorFee,uint256 deadline,uint256 nonce)`, domain `{ name: 'GhostPayShieldedPool', version: '1', chainId, verifyingContract: pool }`. The permit signed alongside should allow `value + sponsorFee`. |
| `packages/pool-relayer` | Before `eth_call` simulation, run the local Groth16 verify **and** reject proofs whose `pA`/`pB`/`pC` are not valid curve points (a malformed point makes the on-chain verifier consume all forwarded gas, see audit I-3). Cap the gas limit of the submitted tx (about 700k for withdraw with ASP and announce). |
| `packages/chain-adapters/src/config/deployments.ts`, `deployments/schema.json` | Optional `shieldedPools[]` per testnet: `{ pool, kind: 'erc20' \| 'native', asset, registry, poseidonT3, poseidonT4, withdrawVerifier, ragequitVerifier, announcer, denomination, maxDeposit, maxRelayerFeeBps, aspGraceSeconds, deployBlock, codehashes: { pool, poseidonT3, poseidonT4, withdrawVerifier, ragequitVerifier } }` and `associationSetRegistry`. Manifest read-back must compare the immutables (`ASSET()`, `REGISTRY()`, `WITHDRAW_VERIFIER()`, `RAGEQUIT_VERIFIER()`, `POSEIDON_T3()`, `POSEIDON_T4()`, `ANNOUNCER()`) and the codehashes with the manifest; clients must refuse a pool whose verifier codehash differs from the one built from `packages/pool-circuits/verifiers/`. |
| `apps/web` scan client | Accept announcements whose `caller` is a manifest pool address (spec Q6); metadata layout is the router layout (57 bytes; ERC-20 marker `0xa9059cbb` + token, native marker `0xeeeeeeee` + `0xEeee…EEeE`; amount = `withdrawnValue - relayerFee`). |
| Deployment (owner action, not done) | Deploy the two generated verifiers from `packages/pool-circuits/verifiers/` (`forge create`), then `ANNOUNCER=… WITHDRAW_VERIFIER=… RAGEQUIT_VERIFIER=… MAX_DEPOSIT=… [ASSET=…] forge script script/DeployPool.s.sol --rpc-url <sepolia> --broadcast --account <keystore>`. The script refuses chains other than 11155111 / 84532 (31337 with `ALLOW_LOCAL=1`) and reads every immutable back. Record addresses, codehashes and deploy block in the manifest. |
| `THIRD_PARTY.md` | Rows appended to `docs/remote/third-party-additions.md` (poseidon-solidity 0.0.5, @zk-kit/lean-imt.sol 2.0.1, circomlibjs generator-only, Echidna/Slither tools). |
| `docs/user/privacy-limits.md` | Add: "The test pool's withdrawal proofs come from an insecure development setup: anyone can forge a withdrawal and empty the pool. Test tokens only." |

## 3. Owner decisions

- **Licence (spec Q1):** the pool sources are `UNLICENSED` (plus the MIT-attributed `PoolLeanIMT` port and vendored MIT
  libraries). The GPL-3.0 verifiers are separate contracts in `packages/pool-circuits`; this package only imports them in
  tests and its `out/` therefore contains compiled GPL artifacts. Whether deploying GPL verifier bytecode next to UNLICENSED
  pool bytecode is acceptable is an owner decision (not resolved here).
- **Root window size and ASP grace** (spec Q2): 64 roots, grace chosen per deployment (`<= 1 day`, default 600 s in the
  deploy script). Deposit spam can push a pending proof's root out of the window (audit L-1).
- **Legal:** deferred by the owner (spec header); noted once.

## 4. Not verified

No testnet or mainnet deployment; no real wallet or RPC provider; no independent audit; gas measured on the Foundry EVM
only; mutation testing not run; Echidna run locally against a forked local anvil (see the audit doc for the exact numbers).
