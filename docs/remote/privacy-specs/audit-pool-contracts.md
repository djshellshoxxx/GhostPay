# Adversarial self-review: `packages/pool-contracts`

Date 2026-10-21, branch `claude/remote-extensions-10`. **AI-assisted self-review by the authoring agent. Not an
independent audit.** Scope: `src/**` (pool core, ERC-20 and native pools, ASP registry, `PoolLeanIMT`, `ProofLib`,
`PoolConstants`, interfaces), `script/DeployPool.s.sol`, and how the pool uses the generated verifiers of
`packages/pool-circuits` and the vendored `poseidon-solidity`. Circuits and the ceremony are reviewed in
[`audit-pool-circuits.md`](audit-pool-circuits.md). Evidence tags: **[T]** Foundry test that ran and passed this session
(file::test); **[S]** Slither run; **[E]** Echidna run; **[R]** reasoning only; **[U]** unverified.

---

## 0. Read first: what makes this pool unsafe outside a testnet

> 1. **Forgeable verifier keys (inherited, Critical on any value-bearing chain).** The only verifiers tested here are
>    `packages/pool-circuits/verifiers/*` from a deterministic public-beacon dev ceremony. Anyone can produce a proof the
>    verifier accepts for any public signals, i.e. any nullifier hash, any `withdrawnValue`, any known root, and empty the
>    pool. The contract cannot detect this: soundness is entirely the circuit's and the setup's. Mitigations in this
>    package: testnet-only constructor guard (`WrongChain`) [T `GhostPayShieldedPool.t.sol::test_constructor_wrongChain`],
>    `MAX_DEPOSIT` cap, no GhostPay fee, immutable (a fix means a new pool). Status: **accepted for the testnet PoC**.
> 2. **The model verifiers in `test/mocks/PoolMocks.sol` accept whatever the test registers** (or everything with
>    `acceptAll`). Every unit/fuzz/invariant result below is "given a sound verifier". The real-verifier behaviour is covered
>    separately by `RealProof.t.sol` with proofs made by snarkjs from the circuits package.
> 3. **No privacy claim.** Deposits are public (`Deposited` names the depositor), the testnet crowd is tiny (spec N1-N9).

## 1. Findings

| Id | Severity (testnet PoC) | Title | Status |
|---|---|---|---|
| C-1 | Critical on mainnet / accepted on testnet | Forgeable dev-ceremony verifier drains the pool | Accepted, guarded (section 0) |
| L-1 | Low | Root-window griefing: 64 cheap inserts invalidate pending proofs | Open (design, as 0xbow) |
| L-2 | Low | Tokens that become lossy or are clawed back make the pool insolvent for the last withdrawers | Documented; payouts revert, no over-payment |
| L-3 | Low | Deploy-time trust in verifier, hasher, registry and announcer addresses | Mitigated by KAT + read-back; clients must pin codehashes |
| I-1 | Info | ASP publisher can invalidate proofs by publishing new roots (grace window only) | By design (spec N6) |
| I-2 | Info | Tree full (2^32 leaves) blocks ZK withdrawals; ragequit still works | Accepted |
| I-3 | Info | Off-curve proof points make the verifier burn all forwarded gas | Relayer must pre-verify |
| I-4 | Info | Read-only reentrancy window: ERC-20 deposit records state before pulling tokens | Accepted (no external consumer relies on mid-call views) |
| I-5 | Info | `SCOPE` fixed at deployment: a chain split that keeps the contract replays proofs on both sides | Accepted (testnet) |
| I-6 | Info | Fixed-denomination pools do not constrain withdrawal amounts | By design (partial withdrawals) |
| I-7 | Info | Slither informational / false positives | Triaged (section 4) |
| I-8 | Info | Licence: GPL-3.0 verifiers compiled into this package's test `out/` | Owner decision |

### C-1 Forgeable verifier

See section 0. Evidence that the pool accepts exactly what the verifier accepts: [T] `RealProof.t.sol::test_realWithdrawWithAsp`
(real proof accepted), `test_realProof_tamperedSignalOrPointRejected` (any changed signal or point -> `InvalidProof`),
`GhostPayShieldedPool.fuzz.t.sol::testFuzz_tamperedSignalRejected`. With `acceptAll` the pool pays any proof that passes
the cheap checks (by construction of the mock). Remediation for anything beyond a testnet: public multi-party phase 2,
independent circuit audit, redeploy with new verifiers (the addresses are immutable).

### L-1 Root-window griefing

`isKnownRoot` accepts the last 64 roots and every deposit **and** every withdrawal inserts one leaf. An attacker can make
64 minimum deposits (value 1 base unit each, about 300k gas each, ~19M gas total, refundable through ragequit) between a
user's proof generation and inclusion, and the user's withdrawal reverts `UnknownStateRoot` and must be re-proved.
[T] `test_rootHistoryWindow` (accepted after 63 inserts, rejected after 64), `invariant_rootHistory`. Same design as
0xbow `State.sol` (`ROOT_HISTORY_SIZE = 64`). Funds are never at risk. Remediation options (owner): larger window
(e.g. 256; cost is storage only with the mapping design, see DEVIATIONS B1), a minimum deposit, or a time-based window.

### L-2 Lossy / clawback tokens

The ERC-20 pool checks exact balance deltas on every pull and push, so a fee-on-transfer token cannot be deposited and a
token that turns lossy later cannot be withdrawn (reverts, nothing is paid). [T] `test_feeOnTransferRejected`,
`test_tokenTurnsLossyAfterDeposit` (also clawback below the notes' total: the last payout reverts),
`test_blacklistedRecipientRevertsAtomically` (nullifier stays unspent). The pool never pays more than its balance, but a
token whose balance can shrink (rebasing down, admin burn) leaves the last notes unbacked. Accepted: such tokens are
unsupported (README). Value conservation for standard tokens: [T] `invariant_valueConservation` (balance == sum of
unspent model notes) and [E] `echidna_value_conserved`.

### L-3 Deploy-time trust

All external dependencies are immutable constructor arguments. A deployer who passes a malicious verifier or hasher
controls the pool. Mitigations: the constructor runs Poseidon known-answer tests (`Poseidon(1,2)`, `Poseidon(1,2,3)`)
[T] `test_constructor_hasherKnownAnswer` (constant hasher, swapped hashers, code-less hasher all revert); the deploy script
deploys the hashers itself, refuses code-less verifiers and reads every immutable back [T] `DeployPool.t.sol::test_deployScript`.
A hasher that passes the KAT but differs elsewhere, or a verifier that accepts everything, is not detectable on-chain:
clients must compare `codehash` of `WITHDRAW_VERIFIER()`, `RAGEQUIT_VERIFIER()`, `POSEIDON_T3()`, `POSEIDON_T4()` with
the manifest (wiring doc section 2).

### I-1 ASP publisher churn

A withdrawal with `aspEnabled = 1` needs the root to be the publisher's latest or superseded at most `ASP_GRACE_SECONDS`
ago [T] `test_asp_graceBoundaries` (grace-1 and grace accepted, grace+1 rejected), `test_asp_latestRootAccepted`,
`test_asp_mismatches` (root published by someone else, `aspEnabled = 2`, inconsistent zero fields). A publisher that
republishes often shortens the usable life of proofs; `aspEnabled = 0` is always available. The chosen publisher is
public in `Withdrawn` (spec N6).

### I-2 Tree full

At `2^32` leaves deposits and withdrawals (change-note insert) revert `TreeFull`; ragequit inserts nothing and still pays
[T] `test_treeFull`, `test_treeFull_ragequitStillWorks` (state forced with `stdstore`). Not reachable in practice.

### I-3 Off-curve proof points

The snarkjs verifier calls the bn254 precompiles with almost all remaining gas; an off-curve point makes the precompile
fail and consume it. [T] `RealProof.t.sol::test_offCurvePointBurnsSubmitterGas`: 2 946 814 of 3 000 000 forwarded gas
burnt vs 303 982 for an on-curve wrong proof. Only the submitter pays and the call reverts atomically. A relayer must
verify the proof off-chain (including curve membership) before submitting (wiring doc, `pool-relayer` row).

### I-4 Read-only reentrancy window

`deposit` records the leaf, label and depositor before `transferFrom` (checks-effects-interactions). A hook token can
observe `isLeaf(c) == true` before the pool's balance rose. All state-changing entry points are `nonReentrant`
[T] `NativeAndReentrancy.t.sol::test_erc20_reentrantToken` (re-entering withdraw / deposit from pull and push hooks
fails with `ReentrancyGuardReentrantCall`), `test_native_reentrantRecipient` (re-entering withdraw with another valid
proof, with the same nullifier, or deposit from the recipient's `receive` all fail; balances unchanged). Only an
external contract reading pool views from inside a token hook could be misled; none exists.

### I-5 Chain split

`SCOPE = keccak256(abi.encode(pool, chainid_at_deploy, asset)) % P` is an immutable, as in 0xbow. If a chain split kept
the same contract on both sides, a proof would be valid on both. Cross-chain replay between distinct deployments is
impossible (`SCOPE` and the roots differ) [T] `test_withdraw_contextMismatchPerField` (proof bound to another pool's
`SCOPE` rejected), `DepositWithPermit.t.sol::test_crossPoolReplayRejected` (EIP-712 domain uses the live chain id).

### I-6 Denomination

`DENOMINATION != 0` restricts deposits only [T] `test_deposit_denomination`; withdrawals may be partial. Uniform
withdrawal amounts are a client policy (`amount-blur`).

## 2. Properties checked (what an attacker would try)

| Attack | Result | Evidence |
|---|---|---|
| Double spend via withdraw, via ragequit, or across both | `NullifierSpent` | [T] `test_withdraw_checks`, `test_ragequit_happyPath`, `test_ragequit_afterWithdrawSameNullifier`, `invariant_noAttackSucceeds`, [E] `echidna_no_attack_succeeds` |
| Replay a real proof; replay a malleated real proof `(-A, -B, C)` | verifier accepts the malleated proof, pool rejects (`NullifierSpent`) | [T] `RealProof.t.sol::test_realWithdrawWithAsp` |
| Relayer / front-runner changes recipient, relayer, fee, feeTo, deadline, ASP publisher or announce | `ContextMismatch` (or an earlier check) and no funds move | [T] `test_withdraw_contextMismatchPerField`, `testFuzz_tamperedWithdrawalNeverPays` (10 000 runs), `RealProof.t.sol::test_realProof_tamperedWithdrawalFieldRejected` |
| Submit someone else's relayer-bound proof | `InvalidRelayer` | [T] `testFuzz_relayerBinding` |
| Fee above cap / fee with zero or pool `feeTo` | `FeeTooHigh` / `InvalidRecipient` | [T] `test_withdraw_feeBounds`, `testFuzz_feeBound` |
| Withdraw against a stale root (> 64 inserts old) or an unknown / zero root | `UnknownStateRoot` | [T] `test_rootHistoryWindow`, `test_withdraw_depthAndRoot`, `invariant_noAttackSucceeds` (stale-root action), [E] |
| Depth signal > 32 | `InvalidTreeDepth` | [T] `test_withdraw_depthAndRoot` |
| Non-canonical public signal (`x + P`) | verifier returns false | [T] `RealProof.t.sol::test_verifierCheckField` (all 9 withdraw and 4 ragequit signals) |
| Change commitment `0`, `>= P`, or an existing leaf | `InvalidLeaf` | [T] `test_withdraw_invalidChangeLeaf` |
| Ragequit by a non-depositor / unknown label / commitment not in tree / zero value | `NotDepositor` / `InvalidCommitment` / `InvalidValue` | [T] `test_ragequit_checks`, `RealProof.t.sol::test_realRagequit`, `invariant_noAttackSucceeds` (foreign ragequit), [E] |
| Reentrancy (token hooks, native recipient) | `ReentrancyGuardReentrantCall`; no extra payout | [T] section I-4 tests |
| Fee-on-transfer, false-return, no-return, blacklist, lossy-later, clawback tokens | revert / works (no-return) | [T] section L-2 tests, `test_falseReturnRejected`, `test_noReturnTokenWorks` |
| Sponsor alters any `DepositAuth` field, replays, uses high-s, wrong signer, other pool/chain | `InvalidSignature` / `NonceUsed`; nonce not burnt by failures | [T] `DepositWithPermit.t.sol` (9 tests) |
| Front-run the ERC-2612 permit | deposit still succeeds | [T] `test_frontRunPermitDoesNotBlock` |
| Announce with wrong key prefix/length, metadata length, marker, asset, gross instead of net | `InvalidAnnounce` | [T] `test_announce_invalid`, `testFuzz_announceAmount`, `test_native_announceMarker` |
| Announcement attribution | `Announcement.caller == pool`; none when `announce` empty | [T] `test_announce_validEmitsWithPoolAsCaller`, `test_announce_emptyEmitsNothing` |
| Deploy on mainnet / L2 mainnets | `WrongChain` (pools and registry) | [T] `test_constructor_wrongChain` |
| Admin / upgrade / delegatecall / selfdestruct | none in bytecode; storage layout pinned | `scripts/check-static.sh` (ran, all OK) |
| Poseidon / LeanIMT mismatch with circuit and SDK | equal | [T] `PoseidonAndTree.t.sol` (64 T3 + 51 T4 circomlibjs vectors, 70 `@zk-kit/lean-imt` roots, fuzz vs zk-kit Solidity), `SharedVectors.t.sol` (repo vectors), `RealProof.t.sol` (on-chain commitments and root equal the circuit's) |

## 3. Evidence (runs made for this delivery)

All with forge 1.x from `/home/user/tools`, `FOUNDRY_SOLC=/home/user/tools/solc` (0.8.28), on 2026-10-21.

- `forge build`: compiles with **no compiler or lint warnings** (lint scope `src/`).
- `forge fmt --check`: clean.
- `forge test` (default profile: 10 000 fuzz runs, invariants 256 runs x 50 calls): **10 suites, 82 test entries,
  0 failed** (forge reports the 4 invariants of `GhostPayShieldedPoolInvariantTest` as one entry: 256 runs, 12 800 handler
  calls, 0 reverts; each attack action (double spend, foreign ragequit, stale root) was called about 1 600 times with 0
  successes). Every `testFuzz_*` ran 10 000 cases, including `testFuzz_leanIMT_differential` (up to 40 inserts each).
  `.gas-snapshot` written with `forge snapshot --no-match-test "testFuzz|invariant"` (73 tests).
- `scripts/check-natspec.sh`: `GhostPayShieldedPoolERC20` OK (70 ABI entries), `GhostPayShieldedPoolNative` OK (59),
  `GhostPayAssociationSetRegistry` OK (8).
- `scripts/check-static.sh`: vocabulary OK, no `DELEGATECALL`/`SELFDESTRUCT`/`CALLCODE` opcode in the three deployed
  bytecodes, storage layouts equal the pinned lists.
- Gas (Foundry EVM, real verifiers): withdraw with ASP and fee 520 859; ragequit 305 316; deposit about 300k typical
  (77k for Poseidon T4 plus about 30k per hashed level), 1.27M at depth 32; registry `publish` about 94k.
- Echidna 2.2.7 (release binary), `test/echidna/EchidnaPool.sol`, `echidna.yaml` (seed 20261021, 4 workers, seqLen 40),
  pool constructed on a local anvil by `EchidnaFixture.s.sol` and forked over RPC, `--test-limit 20000`: **20 099 calls;
  `echidna_value_conserved`, `echidna_no_attack_succeeds`, `echidna_tree_size_tracks_inserts`,
  `echidna_current_root_known` passing; `echidna_canary_no_withdrawals` failed as intended** (shrunk to
  `deposit(0,0); withdraw(0,0,0)`, proving withdrawals are reached). Limits: small campaign (RPC-forked execution ran at
  about 13 calls/s), corpus stayed at 4 sequences / 20 830 instructions, mock verifiers. Treat as a smoke-level
  complement to the Foundry invariants, not as deep coverage.

## 4. Slither triage (0.11.6, `slither . --filter-paths "lib|test|script|\.\./contracts/lib"`)

`--fail-medium --exclude-informational --exclude-low`: **exit 0** [S]. Suppressed in source with a rationale comment:

| Detector | Location | Verdict |
|---|---|---|
| `locked-ether` (Medium) | `GhostPayShieldedPoolERC20` | False positive: `deposit` is payable only for the shared interface and reverts on any `msg.value`; `receive` reverts. |
| `unused-return` (Medium) | `_checkAsp` ignores `publishedAt`, `index` of `registry.latest` | Intended. |
| `timestamp` (Low) | `withdraw` deadline, `_checkAsp` grace | Intended; second-level drift irrelevant. |

Remaining informational results (not suppressed): `naming-convention` (spec-mandated upper-case getters),
`assembly` (metadata parsing; native payout without return-data copy), `unused-state` (marker constants used by the
other subclass), `unimplemented-functions` on `GhostPayShieldedPoolERC20` (false positive: every listed function is
implemented and called by the tests, e.g. `DOMAIN_SEPARATOR` in `test_domainSeparator`; Slither appears to mis-resolve
the interface diamond `IGhostPayShieldedPoolERC20 is IGhostPayShieldedPool`).

## 5. Not verified / limits of this review

- No independent review; the same agent wrote and reviewed the code. No formal verification, no mutation testing.
- Soundness of the circuits and of the ceremony is out of scope here (see `audit-pool-circuits.md`); every pool property
  assumes a sound verifier.
- No deployment to Sepolia / Base Sepolia (instructed not to deploy); gas only on the Foundry EVM.
- The end-to-end flow with the SDK, prover and relayer over a local anvil was reported by the pool-sdk/relayer agent
  (`audit-pool-sdk.md` section 5) using this package's `out/`; not re-run by this agent.
- Echidna's EVM is fixed at chain id 1, so the harness fuzzes a pool constructed on a local anvil through an RPC fork;
  the constructor itself is covered only by Foundry tests.

---

## Independent AI review (opus)

Date 2026-10-21. **Second-pass review by a separate AI agent (Claude Opus), not a professional audit.** Scope: `src/**`,
`script/DeployPool.s.sol`, tests, against spec `shielded-pool.md` and `packages/pool-circuits/INTERFACE.md`.

**C-1 confirmed with a working exploit: the pool is forgeable by design with the dev-ceremony verifiers.**
`test/ForgedProof.t.sol` [T, `forge test --match-path test/ForgedProof.t.sol`: 2 passed] recomputes the phase-2 delta
from the public beacon (only delta is needed; see the circuits doc's independent section) and builds proofs on-chain:
- `test_forgedWithdrawDrainsPool`: an address with no deposit withdraws the full balance of three honest deposits with an
  invented nullifier hash and change commitment against `currentRoot()`.
- `test_forgedRagequitDrainsPool`: the thief deposits 1 unit, then ragequits its own label with `value` = pool balance.
  The contract only checks `depositorOf(label)`, `value <= MAX_VALUE` and leaf existence; value soundness is purely the
  proof's. This is the cheapest drain path and needs no ASP or root-window cooperation.
Mitigations remain the `WrongChain` guard and `MAX_DEPOSIT`; nothing on-chain can detect a forged proof.

Checked, no new exploitable issue found (given a sound verifier) [R, existing tests T]:
- Public-input binding: `context = keccak256(abi.encode(w, SCOPE)) % P` covers recipient, relayer, fee, feeTo, deadline,
  aspPublisher, announce; `SCOPE` covers pool, chain id, asset; `withdrawnValue`, roots, ASP fields are public signals.
  `pool-sdk/src/withdrawal.ts` encodes the same tuple. Label `keccak256(abi.encodePacked(SCOPE, n)) % P` matches spec.
- ABI / signal order: `ProofLib` indices equal `INTERFACE.md` and the vkeys (`nPublic` 9 / 4); deploy script wires
  `WITHDRAW_VERIFIER` / `RAGEQUIT_VERIFIER` into the matching typed slots and reads them back.
- Non-canonical inputs: verifier `checkField` rejects `>= P`, so nullifier hashes, roots and labels used as mapping
  keys are canonical; `context` and labels are reduced `% P`; precommitment and leaves checked `< P`.
- Root history: `_rootSize` keyed by root with size stamp; window 64 inserts (L-1 stands). Size-1 root = leaf is
  consistent with the circuit (depth 0). ASP: enabled must be exactly 0/1, publisher non-zero iff enabled, grace logic
  correct including re-publication.
- Ragequit authorization: `msg.sender == depositorOf(label)`, shared nullifier set with withdraw, leaf must exist.
  Change notes inherit the label, so the original depositor (if it knows the change-note secrets) can ragequit them:
  by design (0xbow).
- Tokens / reentrancy: exact balance deltas on every pull and push, `nonReentrant` on every entry point, state before
  transfers; fee-on-transfer and lying tokens revert (L-2 stands for negative rebases).
- Deposit griefing: front-running a deposit with the victim's precommitment creates a note the attacker cannot spend
  (shares the victim's nullifier); it only burns the attacker's funds. Duplicate change commitments cannot be planted
  (label is contract-assigned).
- Relayer fee: a proof with `relayer = address(0)` is publicly submittable and can be front-run by anyone, but payouts are
  context-bound, so the only effect is the original submitter's reverted (gas-wasting) tx. Info; relayed proofs should
  set `relayer`.
- Nits (not changed): rule order differs slightly from spec 6 (value check before fee/context); harmless.
No source file was modified by this review; only `test/ForgedProof.t.sol` was added (full suite: 84 passed, dev profile).
