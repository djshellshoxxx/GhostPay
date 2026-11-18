# Mythril artifact 14290880802: PolicyAccountFactory record dispositions

Status: author disposition, independently reviewed 2026-11-18 (see the final section; conditions applied).
Do not treat as a suppression approval; residual (a) needs an owner decision before any production scheme-2
deployment.

## Scope and provenance

- Workflow run: contract-analysis 43981233671, artifact 14290880802, Mythril 0.24.8.
- Report SHA-256 `f5a03aea77cff52a996e67202893f6dd51f8b85bce2f9ad8e41a05ebc7f158f8`. Metadata: commit
  `beb525dddcca103de9eda447b55cddf7ee2f428c`, exit 1, not truncated.
- The report has 11 records: 3 Medium and 8 Low. This document covers the eight records on the
  `PolicyAccountFactory` analysis. They are the last JSON line of that analysis, numbered R4 to R11 in report
  order. All three Medium records are in this set: R5, R9 and R11. R1 to R3 are SWC-116 timestamp records
  on `GhostPaySweepRelayer` and `PolicyAccount`. They are reviewed separately and are not covered here.
- The source is unchanged from `beb525dd` to the reviewed base `d39e304a`:
  `git diff beb525dd d39e304a -- packages/contracts/{src,lib,foundry.toml,remappings.txt,scripts}` and
  `contract-analysis.yml` show no changes. OpenZeppelin is vendored at 5.6.1.
- Bytecode identity: `src/PolicyAccountFactory.sol` was recompiled with the runner's settings (solc 0.8.28,
  optimizer 200, cancun, standard JSON as Mythril builds it). The output is byte-identical to the creation
  code inside Mythril's transaction 0 up to the CBOR metadata hash (first difference at byte 3764 of 3807).
  The PCs below therefore refer to the exact analysed bytecode.

## Mythril's model, shared by all eight records (verified)

The solved constructor arguments sit after the 3807-byte creation code in step 0 of every `tx_sequence`.
They are not replayable on a real chain:

- `implementation_ = address(1)`, the ecrecover precompile, in all eight records. The real constructor
  reverts with `ImplementationHasNoCode` (`PolicyAccountFactory.sol:88`). A local rerun solved the same value.
- `FEE_TOKEN` is a symbolic constructor argument, not a parameter of `deploy`. Mythril calls a call target
  "user-defined" when the solver can set it to its attacker actor `0xdead…beef`. That is what it did for
  R5, R9 and R10. On a deployed factory `FEE_TOKEN` is an immutable chosen once by the deployer
  (`DeployPolicy.s.sol:47-61` requires it to be set and to have code). No `deploy` caller can change it.
- With a symbolic salt, Mythril places the CREATE2 clone at its own synthetic address
  `0x72C6…5015 = CREATE(0x0901…B51F, nonce 0)`. It does not use the keccak address that
  `predictDeterministicAddress` computes. So across transactions the model does not connect the
  `AlreadyDeployed` check (`:111`) to the created clone.

## Per-record dispositions

| Record | Contract:function:line (PC) | SWC | Severity | Verdict | Evidence tests (`packages/contracts/test/MythrilFactoryDispositions.t.sol`) |
|---|---|---|---|---|---|
| R4 | `0x72c6…5015` (modelled clone):fallback:none (PC 30) | 110 | Low | False positive (model artifact) | `test_R4_cloneRuntimeIsExactEip1167_pc30IsGasNotInvalid`, `test_R4_mythrilCloneAccountAddressIsCreateNonceZeroOfModelFactory`, `test_R4_mythrilImplementationModelIsRejectedByConstructor`, `test_R4_cloneFallbackRevertsWithoutPanic_receiveAccepts`, `test_R4_R5_doubleInitAndImplementationInitRevert` |
| R5 | PolicyAccountFactory:deploy:117 `initialize` CALL (PC 999) | 107 | Medium | Intended behavior; no exploitable reentrancy | `test_R5_R9_reentrantFeeTokenCannotReenterBeforeCreate2OrInitialize`, `test_R5_R9_feeCallbackCannotPreInitialiseHijackOrBlockTheClone`, `test_R5_initializeFailureAfterFeePullRollsBackFee`, `test_R5_foreignCloneCannotBeInitialisedByThirdParty`, `test_R5_R6_R9_R10_exactCallOrderAndOnlyGuardWrites`, `test_replay_R5_R9_R10_attackerTokenWithMythrilArguments` |
| R6 | PolicyAccountFactory:deploy:ReentrancyGuard.sol:99 (PC 1170 SSTORE) | 107 | Low | False positive (the guard release itself) | `test_R6_guardIsHeldDuringInitialize_reentryFromCloneReverts`, `test_R6_feeFreeDeployMakesNoTokenCallAndReleasesGuard`, `test_R5_R6_R9_R10_exactCallOrderAndOnlyGuardWrites` |
| R7 | PolicyAccountFactory:deploy:131 `balanceOf(FEE_RECIPIENT)` (PC 1668) | 113 | Low | Intended fail-closed behavior; residual DoS noted | `test_R7_recipientBalanceOfRevertFailsClosedWithFullRollback`, `test_R7_R8_feeReadsAreStaticCalls_mutatingReadsFailClosed`, `test_R7_R8_feeTokenWithoutCodeFailsClosed_feeFreeFactoryUnaffected` |
| R8 | PolicyAccountFactory:deploy:132 `allowance` (PC 1781) | 113 | Low | Intended fail-closed behavior; residual DoS noted. The 3-step path cannot be reproduced concretely | `test_R8_allowanceRevertFailsClosedWithFullRollback`, `test_R7_R8_feeReadsAreStaticCalls_mutatingReadsFailClosed`, `test_replay_R7_R8_secondIdenticalDeployRevertsBeforeAnyTokenCall` |
| R9 | PolicyAccountFactory:deploy:Clones.sol:104 `create2` (PC 2887) | 107 | Medium | Intended behavior; no exploitable reentrancy or front-run | `test_R9_frontRunSameSaltDeploysVictimPolicy_victimPaysNothing`, `test_R9_create2FailureAfterFeeCallRevertsAtomically`, `test_R9_otherFactoryWithSameImplementationCannotOccupyAddress`, `test_R5_R9_*`, `test_R5_R6_R9_R10_exactCallOrderAndOnlyGuardWrites` |
| R10 | PolicyAccountFactory:deploy:SafeERC20.sol:227 `call` (PC 2978) | 107 | Low | False positive (target is the immutable `FEE_TOKEN`, not caller input) | `testFuzz_R10_callTargetsAreFixedForAnyCallerInput` (10,000 runs), `test_R5_R6_R9_R10_exactCallOrderAndOnlyGuardWrites`, `test_replay_R5_R9_R10_attackerTokenWithMythrilArguments` |
| R11 | PolicyAccountFactory:deploy:SafeERC20.sol:227 `call` (PC 2978) | 104 | Medium | False positive as "unchecked"; the flagged path is the intended fee waiver | `test_R11_falseReturnWithFunds_waivesWithoutAnyBalanceChange`, `test_R11_falseReturnWithoutFunds_revertsFeeTransferFailed`, `test_R11_noReturnDataToken_collectsExactFee_insufficientAllowanceReverts`, `test_R11_nonCanonicalTrue_movingFundsReverts_notMovingWaives`, `test_R11_revertingTransferWithReturnDataBomb_waivesWithBoundedCopy`, `test_R11_revertingTransferWithInsufficientAllowance_doesNotWaive`, `test_R11_gasStarvationOfOrdinaryFeeTransferNeverWaives`, `test_R11_residual_gasHungryFeeTokenCanBeStarvedIntoWaiver`, `test_replay_R11_twoCallerSequenceWaivesOnlyBecauseTokenReturnsFalse` |

No record is a real defect. There is no fix commit, and no production code was changed.

### Real call path (verified from source and bytecode)

`deploy` (`PolicyAccountFactory.sol:101-123`) runs in this order:

1. `nonReentrant` writes guard slot `0x9b77…5f00` from 1 to 2 (PC 1326).
2. Input checks. `predicted.code.length != 0` reverts `AlreadyDeployed` before any token call.
3. `_collectFee` (`:128-164`):
   - STATICCALL `balanceOf(payer)` (PC 1527), `balanceOf(recipient)` (PC 1668) and `allowance` (PC 1781).
   - CALL `transferFrom` through `trySafeTransferFrom` (PC 2978).
   - Success branch: two more balance STATICCALLs, which must show exact deltas.
   - Failure branch: three STATICCALLs, which must show nothing changed, then the funds checks.
4. CREATE2 of the EIP-1167 clone of the immutable implementation (PC 2887).
5. CALL `initialize` on the clone (PC 999). The clone DELEGATECALLs the implementation, which makes no
   external call (`PolicyAccount.sol:130-152`).
6. Events, then `_nonReentrantAfter` writes the guard from 2 to 1 (PC 1132-1170).

The factory's only mutable storage is the guard slot. `test_R5_R6_R9_R10_exactCallOrderAndOnlyGuardWrites`
records the state diff and checks the full sequence: the 8 factory-issued calls and creates in order, with
exact calldata, zero value and no call to `owner` or `destination`; the single DELEGATECALL (clone to
implementation); and exactly two factory storage writes, guard 1 to 2 then 2 to 1.

### R4 (SWC-110, Low): Exception State in `0x72c6…5015` fallback, PC 30

Mythril quote: "An assertion violation was triggered … This issue is reported for internal compiler
generated code." Its sourceMap `1864:8148:26` spans the whole factory contract, and the transaction
sequence is creation, then `deploy(0x1, 0xFFFFfb5f…2600, 3600, 0)`, with fee 0.

Verified:
- `0x72c6…5015` is Mythril's allocation for the factory-created account, which is the clone.
- Mythril source-maps that account's PC 30 against the factory's own map (`report.py:148-176`). PC 30 of the
  factory is a dispatcher DUP1. This is why the record reads "compiler generated".
- In the real clone, PC 30 is `GAS` and PC 31 is `DELEGATECALL`. The runtime is the exact 45-byte EIP-1167
  code and contains no `INVALID`.
- Neither `PolicyAccount` nor the OpenZeppelin code it uses contains an `assert`, so `Panic(0x01)` cannot
  be produced.
- Mythril's disassembler emits `INVALID` for a non-concrete byte. Feeding it a clone with byte 30 symbolic
  produced `INVALID` at PC 30. Its CREATE/CREATE2 handler also truncates init code at the first symbolic
  memory byte (`instructions.py:1755-1762`).

Inference, not traced instruction by instruction: in the model, the clone's byte 30 was not concrete. Its
memory word is `or(shl(120, symbolic implementation), 0x5af4…)`. The implementation it solved, address(1),
is rejected by the constructor.

Counterevidence:
- Calling the clone with unknown selectors or short calldata reverts with empty data, not a Panic.
- `receive` accepts native coin.
- A second `initialize`, including one from the factory, and an `initialize` on the implementation both
  revert with `AlreadyInitialized`.

Residual risk: none identified on a correctly constructed factory.

### R5 (SWC-107, Medium): state access after an external call, at `initialize` (`:117`)

Mythril quote: "Write to persistent state following external call … to a user defined address." The
transaction is creation with `FEE_TOKEN = 0xdead…beef`, then `deploy(0x1, 0xFFFFfb5f…2600, 524560, 0)`.

Per the module (`state_change_external_calls.py`), the annotated external call is the fee `transferFrom`
CALL (PC 2978). The later accesses are the CREATE2 (R9) and the `initialize` CALL (R5, PC 999).
Balance/allowance reads are STATICCALL, which this module does not annotate.

The ordering "fee first, then clone" is documented at `:22-27` and is intended.

Counterevidence:
- A hostile fee token that re-enters `deploy` (same salt and a different salt) gets
  `ReentrancyGuardReentrantCall` both times.
- During the fee call the clone does not exist. A call to its address has no effect. Initialising the
  implementation reverts with `AlreadyInitialized`. Pre-funding the address does not block CREATE2. The
  final account has exactly the caller's owner, destination, delay and root, and the fee is charged once.
- An `initialize` revert after the fee pull rolls back the fee and the clone.
- A clone made by another deployer cannot be initialised by a third party (`UnauthorizedInitializer`).

Residual risk: safety depends on keeping `nonReentrant` on `deploy` and on `initialize` making no external
calls. Mutation M1 below shows the tests catch removal of the guard.

### R6 (SWC-107, Low): state access after an external call at ReentrancyGuard.sol:99

Mythril quote: "Write to persistent state following external call … to a fixed address." The model has
fee 0, so the only CALL is `initialize` on the fresh clone.

The bytecode at PCs 1132-1170 is `PUSH2 ret; PUSH1 0x01; PUSH32 guardSlot; SSTORE`, reached in a straight
line after `LOG2 AccountDeployed`. It is `_nonReentrantAfter` writing NOT_ENTERED. The optimizer attached
line 99's location (`= ENTERED`). The real ENTERED write is at PC 1326.

The flagged write is therefore the mitigation itself.

Counterevidence:
- A test-only implementation whose `initialize` re-enters `deploy` reverts with
  `ReentrancyGuardReentrantCall`. This shows the guard is held throughout the window.
- A fee-free deploy makes exactly two calls (CREATE2 and `initialize`), never touches the token, releases
  the guard and allows the next deploy.

Residual risk: none.

### R7 and R8 (SWC-113, Low): multiple calls in one transaction (`:131`, `:132`)

Mythril quote: "This call is executed following another call … It is possible that the call never gets
executed if a prior call fails permanently."

These records are true as facts about the code: the reads follow other calls. The factory relies on
`FEE_TOKEN`'s view functions and fails closed when they fail.

Counterevidence:
- If `balanceOf(recipient)` or `allowance` reverts, `deploy` reverts with no clone and no balance or
  allowance change.
- Reads use STATICCALL. A token whose "view" mutates state makes the read fail, and nothing changes.
- A fee token address with no code reverts `deploy`. With `FLAT_FEE == 0` no token call is made.
- R8's sequence repeats identical `deploy` arguments. Concretely the repeat reverts with `AlreadyDeployed`
  before any token call, so that 3-step path cannot occur on a real chain.
- The local rerun did not reproduce R8.

Residual risk (accepted by design, for the reviewer to confirm):
- If `FEE_TOKEN`'s `balanceOf` or `allowance` ever revert permanently, for example after a broken
  upgradeable-token upgrade, every fee-charging `deploy` reverts. Counterfactual funds at undeployed
  addresses of that immutable factory would stay locked until the token works again.
- The fee waiver covers transfer failures only (`:22-27`). It does not cover failing views.
- The same freeze follows from a transfer that **succeeds with an unexpected balance delta**
  (`UnexpectedFeeDelta`, `:140-146`), for example a USDT-style transfer-fee switch turned on or a lossy
  token upgrade: every fee-charging `deploy` reverts. There is no recovery path through another factory
  or a direct clone, because the deployer is part of the CREATE2 address and the factory has no admin;
  only the token issuer reversing the change recovers those funds (independent review N1; scratch probe
  `test_probe_feeSwitchFreezesCounterfactualFunds`). Exposure today is none: scheme 2 is not deployed on
  any public chain. Before any production scheme-2 deployment the owner must choose between a zero-fee
  factory for upgradeable or fee-switch tokens and a specified change making `_collectFee` fail open on
  view failures and wrong deltas (a public-behaviour change requiring a spec update).
- The constructor does not check `FEE_TOKEN` for code. `DeployPolicy.s.sol:61` does.

### R9 (SWC-107, Medium): CREATE2 after an external call (Clones.sol:104)

The mechanism is the same as R5, with the same transaction sequence.

Counterevidence:
- A front-runner who deploys the victim's exact parameters only creates the victim's own policy. The salt
  binds owner, destination, delay and root. The victim's call then reverts with `AlreadyDeployed` and is
  not charged.
- A CREATE2 failure after the fee call reverts the whole transaction with `FailedDeployment`, including the
  fee. The address collision is simulated with a cheatcode, because only this factory can deploy there.
- Another factory using the same implementation gets different addresses and cannot squat the address.

Residual risk: as R5.

### R10 (SWC-107, Low): external call to a user-supplied address (SafeERC20.sol:227)

The target is `FEE_TOKEN`, fixed at deployment. The record's premise, an address chosen by the caller, is
false.

Counterevidence: a fuzz test over 10,000 arbitrary `(owner, destination, delay, root, caller)` inputs found
that every call target is `FEE_TOKEN` (six calls) or the fresh clone (CREATE2 and `initialize`). `owner` and
`destination` are never called.

Residual risk: whoever deploys the factory must choose a benign token. A malicious `FEE_TOKEN` can still
block deployments or choose to fail and grant waivers. It cannot re-enter or change account parameters.

### R11 (SWC-104, Medium): unchecked return value (SafeERC20.sol:227)

Mythril quote: "The return value of a message call is not checked." The flagged sequence is two `deploy`
calls from `0xaaaa…` and `0xdead…` with destinations `…48` and `…49`.

The return value is checked in three places:
- It is consumed at PC 2979-2991 (`and(success, eq(mload(0), 1))`, `SafeERC20.sol:230`).
- It is consumed again by the no-return-data rule (`:239`).
- `PolicyAccountFactory.sol:135` branches on the result.

`unchecked_retval.py` flags any CALL whose success can be both 0 and 1 on a path that still RETURNs. That
is the documented waiver: a refused transfer while the payer could pay, with no observable change.

Counterevidence:
- A token that returns false with funds available waives the fee with no balance change. The same token
  with an underfunded payer reverts with `FeeTransferFailed`.
- A token with no return data, and a sufficient allowance, collects the exact fee and emits no
  `FeeWaived`. With the allowance at 0, the same token reverts with `FeeTransferFailed`.
- A token that returns a non-canonical true (`2`) after moving funds reverts with `UnexpectedFeeDelta` and
  rolls back. The same token without moving funds waives.
- A token that reverts with a 128 KiB return-data bomb waives safely, because at most 32 bytes are copied.
- A reverting transfer with too little allowance does not waive.
- Gas sweep from 150k to 900k with a token whose `transferFrom` burns 500k gas: every success paid the fee
  and none waived.
- Measured with a scratch harness, not committed: with a `transferFrom` that never completes, the smallest
  call gas at which `deploy` still succeeds through the waiver is 7,879,539. That implies about 123k gas
  remaining after the fee call (1/64, EIP-150).
- Starving the fee call into a waiver therefore needs a `transferFrom` that costs more than about
  63 x 123k, roughly 7.7M gas, **for a token without a proxy and `limitsRoot = 0`**. The independent
  review measured 7,854,789 (root 0) and 9,128,389 (root non-zero) call gas without a proxy; behind one
  delegatecall proxy (USDC-style) the reverting proxy returns its unspent 1/64, so the minimum call gas
  drops to 3,992,584 (root 0) or 4,634,376 (root non-zero) and the inner `transferFrom` need only burn
  about 3.9M gas. This remains unreachable for standard stablecoins (about 50k gas for `transferFrom`).
- `test_R11_residual_gasHungryFeeTokenCanBeStarvedIntoWaiver` demonstrates that boundary with a
  test-only 20M-gas token.

Residual risk: by design, any `FEE_TOKEN` that refuses transfers while the payer has funds yields fee-free
deployments. Gas starvation is reachable only for such pathological tokens, not for standard stablecoins.
The waiver is caller-controllable for a fee token with sender hooks (AUD24-02,
`docs/audits/26-contract-security-review-2026-11.md:46`), so `FEE_TOKEN` must not have sender hooks; harm is
limited to fee revenue because the factory holds no assets or approvals.

## Regression sensitivity (mutation check, scratch copy only)

Each mutation was applied to a scratch copy, never to this branch. The new suite fails for every one:

| Mutation | Failing tests |
|---|---|
| M1: drop `nonReentrant` | 3 |
| M2: waive although balances changed | 1 |
| M3: waive without funds | 4 |
| M4: drop `AlreadyDeployed` | 2 |
| M5: drop the implementation code check | 2 |
| M6: collect the fee after `initialize` | 5 |
| M7: allow double `initialize` | 2 |
| M8: ignore the `trySafeTransferFrom` result | 8 |

## Local Mythril rerun

The rerun used the runner's parameters: `myth analyze src/PolicyAccountFactory.sol --solc-json <runner
config> --execution-timeout 900 -t 3 -o json`, under `nice -n 10` with a 2700 s bound.

Deviations from the CI run:
- `--solv 0.8.28` was omitted, to avoid a compiler download. The PATH `solc` is 0.8.28 from solc-select.
- Python 3.13 and z3 4.12.5 were used instead of the CI host's Python 3.12.

Results:
- `success: true`, rc 1, 7 issues, after 15m08s.
- R4, R5, R6, R7, R9, R10 and R11 were reproduced with identical SWC, PC, severity and line. All used
  2-step sequences and again solved `implementation_ = address(1)`.
- R8 (PC 1781) was not reproduced. Symbolic search under a timeout is not deterministic, and its CI
  sequence was 3-step.

## Suppression guidance

Do not exclude SWC-104, SWC-107, SWC-110 or SWC-113 globally with `--exclude-swc`. That would hide future
real findings in every analysed contract, including `PolicyAccount` and the routers.

A suppression, if adopted, should be keyed to these exact records:
- contract `PolicyAccountFactory` (or `0x72c6…5015` for R4)
- function `deploy`
- the exact PC or source line and the SWC id
- this compiler and source hash

It should be re-reviewed whenever `PolicyAccountFactory.sol`, the OpenZeppelin pin or the compiler settings
change.

## Independent reviewer checklist

1. Recompute the report SHA-256. Re-extract R4 to R11 with their PCs, lines and sequences.
2. Confirm the bytecode identity claim. Recompile with Mythril's settings, compare against step 0 of a
   `tx_sequence`, and check that the PCs map to the cited lines (1170 is the NOT_ENTERED SSTORE).
3. Run `forge test --match-path test/MythrilFactoryDispositions.t.sol -vv`. Read the mocks: the hostile
   tokens and the test-only implementations are not production code, and the cheatcode collision is
   labelled as simulated.
4. Decide whether the R7/R8 residual (permanently failing fee-token views block all fee-charging
   deployments of an immutable factory) is acceptable for the chosen fee token on each chain.
5. Confirm the R11 waiver bound is acceptable: a fee-token `transferFrom` must cost more than about 7.7M
   gas (no proxy, root 0) or about 3.9M gas (behind one delegatecall proxy) before gas starvation can force
   a waiver. Re-measure if `deploy` or `initialize` change cost.
6. Confirm that `nonReentrant` on `deploy` and the absence of external calls in `PolicyAccount.initialize`
   remain invariants for future changes.

## Independent review (2026-11-18)

Reviewed read-only by a separate agent that did not author this record, at `2d54ab60` (contracts `src`, `lib`
and `script` unchanged from `beb525dd`). It re-verified the report hash and record completeness (exactly eight
factory records, PCs decoded), checked bytecode identity independently (forge runtime equals the analysed runtime
bytes `[0:3296]`), reran the 32 tests and the `nonReentrant` mutant, and probed fee-switch and proxy-gas cases.
Verdicts: R4, R6, R9 and R10 **agree**; R5, R7/R8 and R11 **agree with conditions**, applied in this revision:
residual (a) widened to the wrong-delta case (N1, Medium, conditional, not exposed while scheme 2 is
undeployed); a test now proves `initialize` issues no external call below the clone
(`test_R5_initializeIssuesNoExternalCallBelowTheClone`, which fails on the reviewer's `destination_.call("")`
mutant while the other 32 tests pass); the gas bound is corrected for proxied tokens (N3); and AUD24-02 is
cross-referenced (N4). The residual-(a) decision belongs to the owner before any production scheme-2 deployment.
No analyzer suppression is adopted; the Mythril gate remains red.
