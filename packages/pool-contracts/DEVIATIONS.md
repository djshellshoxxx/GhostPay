# Deviations from `docs/remote/privacy-specs/shielded-pool.md` (and choices where it is silent)

Each item is a deliberate choice; the lead should confirm or reject it. Spec section numbers in brackets.

## Layout and naming

- **D1. Package path `packages/pool-contracts/`** (spec 5.1 says `packages/shielded-pool-contracts/`). Path chosen by the
  swarm-10 coordinator; sibling packages are `pool-circuits`, `pool-sdk`, `pool-prover`, `pool-relayer`.
- **D2. Generated verifiers are not copied into `src/verifiers/`** [5.1, 4.6]. Tests and the deploy flow import them from
  `packages/pool-circuits/verifiers/` through the remapping `pool-circuits-verifiers/` (`allow_paths` in `foundry.toml`).
  The pool only knows `IWithdrawVerifier` / `IRagequitVerifier`. Result: this package contains **no GPL-3.0 source**, and
  there is exactly one copy of each verifier (no drift to diff-check). `wiring/pool-circuits.md` suggested a byte copy; the
  remapping makes that unnecessary. If the owner prefers a copy, copy byte-for-byte and add a CI `diff`.
- **D3. Two verifier interfaces** (`IWithdrawVerifier` 9 signals, `IRagequitVerifier` 4 signals) instead of one
  `IGroth16Verifier` [6.1]: the two generated contracts have different `verifyProof` signatures (selectors `0xc542c93b`,
  `0x5fe8c13b`, `pool-circuits/verifiers/SELECTORS.txt`).
- **D4. Constructor takes a `PoolConfig` struct** [6.1 lists positional args] and **two extra immutables**,
  `poseidonT3` / `poseidonT4` (see D5). 11 positional arguments hit stack limits and are error-prone in scripts.
- **D5. Poseidon is called as a contract, not linked.** `poseidon-solidity` 0.0.5 exposes `hash` as a `public pure`
  library function whose assembly reads its input at memory `0x80` and ends with `return(0, 0x20)`; it only works as an
  external call. A linked library call compiles to `DELEGATECALL` (verified with solc 0.8.28 `--opcodes`), which the
  "no delegatecall" bar forbids. The libraries are deployed unmodified as standalone contracts and called through
  `IPoseidonT3` / `IPoseidonT4` (`STATICCALL`). The constructor runs a known-answer test (`Poseidon(1,2)`,
  `Poseidon(1,2,3)`, circomlib reference values) and reverts `InvalidConfig` on a wrong hasher. `scripts/check-static.sh`
  asserts no `DELEGATECALL` opcode in the deployed bytecode.
- **D6. `PoolLeanIMT` instead of `@zk-kit/lean-imt.sol` `InternalLeanIMT`** [5.1 "vendored lean-imt.sol"]: a port of
  `_insert` / `_has` / `_root` (MIT header kept, attribution in NatSpec) that hashes through the immutable hasher. The
  original is vendored unmodified under `lib/lean-imt/` and used only as the differential reference in tests
  (`PoseidonAndTree.t.sol`: fuzz + 70 reference roots; `SharedVectors.t.sol`: 33 roots).
- **D7. `depositWithPermit`, `nonceUsed`, `DOMAIN_SEPARATOR` live in `IGhostPayShieldedPoolERC20`** [6.1 has them in the
  base interface]. The native pool has no permit; putting them in the base would force a reverting stub.
- **D8. Additional views and event:** `isLeaf(leaf)`, `depositNonce()`, `POSEIDON_T3()`, `POSEIDON_T4()`,
  `ROOT_HISTORY_SIZE`, `MAX_TREE_DEPTH`, `MAX_TREE_SIZE`, `DEPOSIT_AUTH_TYPEHASH`, and
  `event LeafInserted(uint256 index, uint256 leaf, uint256 root)` (as 0xbow `State.sol`), so clients can rebuild the tree
  from one event type. The spec ABI is a strict subset (the `pool-sdk` ABI parses unchanged).
- **D9. Extra errors:** `InvalidConfig` (constructor bounds / hasher KAT), `InvalidRecipient` (recipient zero/pool;
  non-zero fee with zero/pool `feeTo`; non-zero sponsor fee with zero/pool `feeTo`), `InvalidLeaf` (change commitment
  `0`, `>= P` or already a leaf). `NonceUsed` / `InvalidSignature` are declared on the ERC-20 interface.
  `ProofLib` accessor names are lower camel case (`aspRoot`, `aspTreeDepth`).

## Behaviour

- **B1. Root history is a mapping `root => tree size when it became current`** instead of a 64-slot ring buffer [3,
  0xbow `State.sol`]. A root is known iff `size - sizeAtRoot < 64`: accepted for the next 63 inserts, rejected after the
  64th (SP-CON-11, tested at both boundaries and by an invariant). O(1) instead of up to 64 `SLOAD`s. A repeated root
  (needs a Poseidon collision) would only extend its own validity.
- **B2. Withdraw check order** [6.1]: deadline -> relayer -> recipient -> `0 < withdrawnValue <= 2**128-1` -> fee ->
  context -> depths -> state root -> ASP -> announce layout -> verify -> effects -> transfers -> announce -> event. The
  spec puts `withdrawnValue > 0` after the ASP check; moving cheap checks first changes only which error a doubly-invalid
  call reports. The `<= 2**128-1` bound duplicates the circuit's `Num2Bits(128)` (defence in depth).
- **B3. `aspEnabled > 1` reverts `AspMismatch`** in the contract even though the circuit already forces a boolean.
- **B4. Ragequit requires `value > 0`** (`InvalidValue`); a zero-value change note has nothing to return. Check order:
  depositor -> value -> commitment is a leaf -> verify -> spend -> pay.
- **B5. Registry re-publication** [6.2 silent]: publishing the current latest root again bumps `index` and
  `publishedAt` and does not supersede it; publishing an older root makes it latest again and clears its `supersededAt`.
  `index` is a 1-based per-publisher counter. `uri` is emitted, not stored. The registry has the same chain guard.
- **B6. Superseded-root grace** uses `block.timestamp - supersededAt <= ASP_GRACE_SECONDS` (inclusive, tested at
  `grace - 1`, `grace`, `grace + 1`). With `ASP_GRACE_SECONDS = 0` a superseded root is accepted only in the block that
  superseded it.
- **B7. `depositWithPermit` sponsor fee transfer** uses an exact balance-delta check on `feeTo`; consequently
  `feeTo == owner` with a non-zero fee reverts `UnexpectedBalanceDelta` (a self-payment is meaningless).
- **B8. `deposit` is `payable` on the ERC-20 pool** (shared interface) and reverts `InvalidValue` on any `msg.value`.
- **B9. Announce decoding:** `abi.decode(announce, (bytes, bytes))`; malformed ABI reverts without a custom error
  (the field is bound by the proof, so only the withdrawer can submit it). Native pool metadata uses marker `0xeeeeeeee`
  and asset `0xEeee...EEeE` (same as `GhostPayRouter.NATIVE`).
- **B10. Base `ReentrancyGuard` (storage)**, as `packages/contracts` (DEVIATIONS item 11 there).

## Tooling

- `foundry.toml` commits `solc_version = "0.8.28"`; runs here used `FOUNDRY_SOLC=/home/user/tools/solc`.
- `[lint] ignore = ["test/**", "script/**"]`: forge lint runs on production sources only (tests use cheatcodes by design).
- Echidna's EVM runs at chain id 1 and supports neither `chainId` nor `etch` cheatcodes (both tried; hevm 0.54.2 internal
  error). The harness therefore forks a pool constructed on a **local** anvil (`EchidnaFixture.s.sol`, `rpcUrl`).
- `vm.setEnv` is process-global, so the deploy-script checks are one sequential test (`DeployPool.t.sol`).

## Not implemented here (spec items owned elsewhere or deferred)

- SP-CON-13: `.gas-snapshot` holds whole-test gas (`forge snapshot --no-match-test "testFuzz|invariant"`), not per-function
  figures; per-call gas of the real-verifier withdraw / ragequit is logged by `RealProof.t.sol` (README, audit doc).
- Mutation testing (gambit) not run.
- Testnet deployment (spec 8.7, acceptance 5): **not done by instruction** ("do not deploy anywhere").
