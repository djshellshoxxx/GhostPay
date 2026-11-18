# Mythril re-evaluation of the eleven dispositioned records (2026-11-18, task E1)

Status: AI-assisted re-evaluation by an agent that did not author the earlier dispositions. **This is not an external
audit.** Nothing here suppresses, allowlists or weakens a finding, changes the Mythril runner, any workflow or any
contract. The Mythril gate stays red; accepting any disposition as a gate exception still needs an owner-approved,
finding-specific mechanism. No real exploitable issue was found (no contract patch, no failing regression test).

Earlier records re-evaluated: [expiry](mythril-14290880802-expiry-dispositions.md) (EXP-1 to EXP-3, also called R1 to
R3) and [factory](mythril-14290880802-factory-dispositions.md) (R4 to R11). They were treated as claims, not authority;
each claim below is marked **verified here**, **CI evidence** (read from a GitHub Actions job log) or **transcribed**
(taken from the earlier record because this lane could not reach the bytes).

## 1. Inputs and what was and was not reachable

| Item | Value |
|---|---|
| Worktree | branch `secrec-local`, HEAD `c487f0fe649e24a1e89f1f8fd0d82e90a3441c62` (candidate `71abc7e55c25d45b206ac47e5ddd24e072805710` + #204) |
| Contract trees (verified here, `git rev-parse <rev>:<path>`) | `packages/contracts/src` `dabfd36a`, `lib` `b10191d5`, `foundry.toml` `59bf7337` identical at `beb525dd`, `d91ae16a`, `7a620ff1`, `71abc7e5` and HEAD; `packages/contracts/scripts` `5a285465` and `.github/workflows/contract-analysis.yml` `ab4b881d` identical at `d91ae16a`, `7a620ff1`, `71abc7e5`, HEAD. `git diff --stat 7a620ff1 71abc7e5 -- packages/contracts` is empty |
| Runner changes since the analysed baseline `beb525dd` (verified here) | `run-mythril.sh`: comment lines 4-7 only (the old `--exclude-swc` advice was replaced by the correct statement that 0.24.8 has no such flag). `contract-analysis.yml`: `release.yml` added to PR paths, `cancel-in-progress` limited to pull requests. The command line `myth analyze "src/$f.sol" --solv 0.8.28 --solc-json "$conf" --execution-timeout "$timeout" -t 3 -o json` (run-mythril.sh:22), the default timeout 900 (:12), the solc JSON config (:15-18: OpenZeppelin remapping, optimizer enabled 200 runs, `cancun`) and the contract order (:20) are unchanged |
| Analyzer and compiler (CI evidence) | `Mythril version v0.24.8` and `Switched global version to 0.8.28` in the mythril job logs of runs 43981233671 (`beb525dd`, job 133697930698), 44231986631 (`d91ae16a`, job 134559059159) and 44242366379 (`7a620ff1`, job 134593129954); installed with `pip install 'mythril==0.24.8' 'solc-select==1.2.0' 'setuptools<81'` on Python 3.12 (contract-analysis.yml:50, :66). Transitive dependencies (z3-solver and others) are not pinned |
| Mythril source read (verified here, read only, not executed) | PyPI sdist `mythril-0.24.8.tar.gz` sha256 `6631ffaad0342c9b2a6b82dbe12106ab38512be45b6c8e0a364e9d4cb146874a` (matches the PyPI JSON digest) |
| Source sha256 (verified here) | `src/GhostPaySweepRelayer.sol` `9943c8b4b5ac8d765ec01870b6b334a10ba7aa8c7815b071cdb2ef90c1ef080a`; `src/PolicyAccount.sol` `c860fcf73e3cd9babd8f53b125cc02864ee28f68e59b15740b2b9a66f263c1f9`; `src/PolicyAccountFactory.sol` `7dfc32591bf991a060988a86fcdbe109155c321199c6c8a43b1f72dfe35fb94e`; OpenZeppelin 5.6.1 `utils/ReentrancyGuard.sol` `94e409e8…bb2fbc8`, `proxy/Clones.sol` `06c768a2…ffafce6`, `token/ERC20/utils/SafeERC20.sol` `c2394cb2…f81bca3`. The first two equal the prefixes/suffixes in the expiry record |

**Blocked, not worked around:**

1. *Mythril artifacts.* `gh run download` for runs 44242366379 (artifact 14401394561), 44231986631 (14398747387) and
   43981233671 (14290880802), and later 44248573915 (14404534228), failed: the artifact blob hosts
   (`productionresultssa31`, `…sa10`, `…sa2`, `…sa16`
   `.blob.core.windows.net`) are refused by this session's egress policy (proxy `connect_rejected`, 403). Job logs are
   reachable but the runner writes the report only to `report.log` (contract-analysis.yml:81), not to the log. So
   **no report record was re-parsed from artifact bytes in this lane.** The eleven records below (contract, function,
   SWC, severity, PC, source map) are **transcribed** from the earlier records (artifact 14290880802, report sha256
   `f5a03aea…7f158f8`); the claims that `7a620ff1` produced the same eleven (report `4f6cc97b…`) and `d91ae16a` ten
   without R8 (report `475b27ec…`) come from [PROMOTION_PACKET.md](../handoffs/consolidation-20261118/PROMOTION_PACKET.md)
   and are unverified here. Uploaded zip digests (CI evidence, not report hashes): `beb525dd` `e78964b7…5162e`,
   `d91ae16a` `a5ea87cc…85f6`, `7a620ff1` `d1cfff43…4cea`.
2. *Compiler.* `forge build` fails here (`error sending request for url
   (https://binaries.soliditylang.org/linux-amd64/list.json)`, tunnel refused) and no solc 0.8.28 exists on this host.
   Bytecode identity and the PC-to-opcode decodes in the earlier records were therefore **not re-verified**, and the
   Foundry tests were **not run locally**; their results are CI evidence (below).
3. *Latest run.* Contract analysis 44248573915 on `71abc7e5`: Echidna success, Mythril failure (exit 1); its Mythril
   artifact 14404534228 is equally unreachable (section 6).

## 2. Verified here without a compiler

- **Source maps.** The `offset:length` of each expiry record slices exactly the quoted statement in the current file:
  `GhostPaySweepRelayer.sol` `4414:50` = line 83 `if (block.timestamp > s.deadline) revert Expired()`;
  `PolicyAccount.sol` `8390:50` = line 161 `if (block.timestamp > w.deadline) revert Expired()`; `12988:48` = line 262
  `if (block.timestamp > deadline) revert Expired()`. R4's `1864:8148` in `PolicyAccountFactory.sol` is the whole
  contract body (line 29 `contract PolicyAccountFactory is ReentrancyGuard {` to the closing brace; the file is 10013
  bytes). The OpenZeppelin lines cited by R6, R9, R10/R11 are, in the vendored 5.6.1 files: `ReentrancyGuard.sol:99`
  `…value = ENTERED;` (the NOT_ENTERED write is `:105`), `Clones.sol:104` `instance := create2(value, 0x09, 0x37, salt)`,
  `SafeERC20.sol:227` `success := call(gas(), token, 0, 0x00, 0x64, 0x00, 0x20)`, with the result consumed at `:230`
  and `:239`.
- **Mythril 0.24.8 behaviour (from its source).** JSON schema (`analysis/report.py` `Issue.as_dict`: `swc-id`,
  `contract`, `function`, `severity`, `address`, `sourceMap`, `filename`, `lineno`, `tx_sequence`); a record whose
  source line cannot be resolved is downgraded to Low with "reported for internal compiler generated code"
  (`_set_internal_compiler_error`, which explains R4's Low severity); `interfaces/cli.py` has no SWC exclusion
  option, only `-m/--modules`; the state-change module (`state_change_external_calls.py`) hooks `CALL`,
  `DELEGATECALL`, `CALLCODE`, `SSTORE`, `SLOAD`, `CREATE`, `CREATE2` (not `STATICCALL`), and rates "user defined"
  call targets Medium and fixed ones Low; `unchecked_retval.py` post-hooks every call and reports at `STOP`/`RETURN`;
  `exceptions.py` reports `INVALID` or a `Panic(0x01)` revert as SWC-110; `multiple_sends.py` (SWC-113) is Low;
  `dependence_on_predictable_vars.py` (SWC-116) pre-hooks `JUMPI`.
- **No assertion path.** No `assert(` in `src/*.sol` or in the OpenZeppelin files they import, and no use of
  `Panic.ASSERT` anywhere in the vendored OpenZeppelin 5.6.1 tree.
- **Factory storage.** `PolicyAccountFactory` declares only constants and immutables (`:33-45`); its only storage
  write can be the ERC-7201 reentrancy-guard slot of the inherited `ReentrancyGuard`.

## 3. Regression tests (CI evidence)

CI 44242366118, job `contracts-test` (134593217469), checked out `refs/remotes/pull/203/merge` = `735bf0e` (merge of
`7a620ff1` into `main` `cfaebeea`; contracts tree identical to HEAD) and ran `forge test`: **34 suites, 490 tests
passed, 0 failed**, including `test/MythrilExpiryDispositions.t.sol:MythrilExpiryPolicyTest` **21 passed**,
`:MythrilExpirySweepTest` **10 passed** and `test/MythrilFactoryDispositions.t.sol:MythrilFactoryDispositionsTest`
**33 passed** (fuzz tests at 10,000 runs). The same counts (490 passed, 0 failed; 21, 10 and 33) are in CI
44248573953 (24/24 jobs success), job `contracts-test` (134617249220), on `533c590` (merge of the candidate
`71abc7e5` into `cfaebeea`). Each of the 31 distinct test names cited in section 4 printed `[PASS]` exactly once in
both logs (checked by script). Local reproduction (`forge test --match-path test/MythrilExpiryDispositions.t.sol`,
`… MythrilFactoryDispositions.t.sol` in `packages/contracts`) was blocked by the compiler download (section 1).

## 4. Per-record re-evaluation

Common to all records: analyzer Mythril 0.24.8, solc 0.8.28, optimizer 200, `cancun`, `--execution-timeout 900 -t 3`;
the reported location fields are transcribed; the source text at each location is verified here. "Agree" means this
lane reaches the same disposition from the current source independently of the earlier reasoning.

### EXP-1 (R1): `GhostPaySweepRelayer.sweep` — SWC-116, Low

| Field | Value |
|---|---|
| Location | `src/GhostPaySweepRelayer.sol:83` in `_authorize` (shared by `sweep` and `sweepWithPermit`); PC 785, sourceMap `4414:50` |
| Reproduction | Mythril deploys the relayer, then one call whose path branches on `TIMESTAMP` at the deadline `JUMPI`. Reproduces whenever the module reaches that `JUMPI` (an earlier local rerun reproduced it) |
| Exploitability | Attacker: a block producer with timestamp latitude δ (none on post-Merge Ethereum; bounded but not verified per chain on L2 sequencers). Precondition: an owner-signed sweep order. Impact: the order may land up to δ after its wall-clock deadline or be refused up to δ before it. Token, owner, destination, fee recipient, amount, fee, deadline and nonce are fixed by the EIP-712 signature (`:94-109`, domain binds chain id and the relayer address); the nonce is consumed before any external call (`:111-114`). No effect on funds beyond what the owner signed, none on keys, none on fees. `block.timestamp` is never used as randomness or as an amount |
| Tests | the nine `test_exp1_…` tests listed in the expiry record and `testFuzz_exp1_producerTimestampOnlyGatesAcceptance` in `test/MythrilExpiryDispositions.t.sol` (`MythrilExpirySweepTest`): 10/10 PASS in CI |
| Disposition | Benign: intended inclusive signed-deadline check (spec `docs/CONTRACTS_SPEC.md:53`, `IGhostPaySweepRelayer.sol:15`) |
| Independent conclusion | **Agree.** Residual unchanged: owners must re-sign with the same nonce to revoke, because the relayer has no cancel |

### EXP-2 (R2): `PolicyAccount.requestWithdraw` — SWC-116, Low

| Field | Value |
|---|---|
| Location | `src/PolicyAccount.sol:161`; PC 1876, sourceMap `8390:50` |
| Reproduction | Mythril analyses the self-locking implementation (owner zero, and `ECDSA.recover` never returns zero), so no path passes `_checkOwner`; the deadline `JUMPI` is the timestamp branch it reaches first |
| Exploitability | Same producer latitude δ for the *submission* of an owner-signed withdrawal. Acceptance stores `executeAfter = block.timestamp + delay` (`:188`) and the destination current at acceptance (`:194`); funds move only in `executeWithdraw` after `executeAfter` (`:208`), only to that destination (`:210-212`), and the owner can `cancel` until then. A late-accepted request still gets the full delay. No effect on funds, keys or fees |
| Tests | the nine `test_exp2_…` tests listed in the expiry record, `testFuzz_exp2_producerTimestampOnlyGatesAcceptance` and the scope test `test_exp2_exp3_implementationModelNeverPassesAuthorization` (`MythrilExpiryPolicyTest`): PASS in CI |
| Disposition | Benign: intended inclusive deadline (`IPolicyAccount.sol:22`, `DEVIATIONS.md:93`) |
| Independent conclusion | **Agree.** The timelock comparisons at `:208`, `:287` and the window bucketing at `:378` were not reached by Mythril (implementation model); their absence from the report is not evidence, as the earlier record says |

### EXP-3 (R3): `PolicyAccount.proposeDestination` — SWC-116, Low

| Field | Value |
|---|---|
| Location | `src/PolicyAccount.sol:262`; PC 5077, sourceMap `12988:48` |
| Reproduction | As EXP-2 |
| Exploitability | Same δ for submission of a signed proposal; the change applies only after `2 × delay` from acceptance (`:273`, `:287`) and stays cancellable; one pending proposal at a time (`:266`); cancelling keeps the nonce consumed. No effect on funds, keys or fees |
| Tests | the nine `test_exp3_…` tests listed in the expiry record and `testFuzz_exp3_producerTimestampOnlyGatesAcceptance` (`MythrilExpiryPolicyTest`): PASS in CI |
| Disposition | Benign: intended inclusive deadline (`IPolicyAccount.sol:175`) |
| Independent conclusion | **Agree.** The L2 cancel-window caveat (REVIEW_FINDINGS R-09) is producer trust, not this record |

### R4: modelled clone `0x72c6…5015` fallback — SWC-110, Low

| Field | Value |
|---|---|
| Location | Clone account created by `PolicyAccountFactory.deploy`, PC 30; sourceMap `1864:8148:26` = the whole factory contract (no line, hence Low) |
| Reproduction | Model only: every factory record's transaction 0 solved `implementation_ = address(1)` (transcribed), which the real constructor rejects (`PolicyAccountFactory.sol:88` `ImplementationHasNoCode`) |
| Exploitability | None found. On chain the clone runtime is fixed by `Clones.cloneDeterministic` over the immutable implementation: the 45-byte EIP-1167 code where PC 30 is `GAS` and PC 31 `DELEGATECALL`; it contains no `INVALID`, and no `Panic(0x01)` path exists in `PolicyAccount` or its OpenZeppelin code (section 2). No effect on funds, keys or fees |
| Tests | `test_R4_cloneRuntimeIsExactEip1167_pc30IsGasNotInvalid`, `test_R4_mythrilCloneAccountAddressIsCreateNonceZeroOfModelFactory`, `test_R4_mythrilImplementationModelIsRejectedByConstructor`, `test_R4_cloneFallbackRevertsWithoutPanic_receiveAccepts`, `test_R4_R5_doubleInitAndImplementationInitRevert`, `test_replay_allMythrilCreationStepsAreInfeasible` (`test/MythrilFactoryDispositions.t.sol`): PASS in CI |
| Disposition | False positive (analyzer model artifact) |
| Independent conclusion | **Agree.** The model-internal mechanism remains an inference, as the earlier record says. Reading Mythril's source confirms the two ingredients it cites: the CREATE/CREATE2 handler copies init code from memory and stops at the first symbolic byte (`laser/ethereum/instructions.py` create helper; `ConcreteCalldata.concrete` returns the memory bytes unchanged, symbolic ones included), and the disassembler emits `INVALID` for any byte it cannot map; an out-of-range `CODECOPY` leaves memory untouched (`_code_copy_helper`). It does not by itself determine the opcode Mythril saw at PC 30. The verdict does not depend on the mechanism: the real code at that PC is `GAS` |

### R5: `PolicyAccountFactory.deploy` — SWC-107, Medium (initialize CALL after the fee call)

| Field | Value |
|---|---|
| Location | `src/PolicyAccountFactory.sol:117` `PolicyAccount(payable(account)).initialize(...)`; PC 999 |
| Reproduction | `FEE_TOKEN` symbolic in the constructor and solved to Mythril's attacker address (hence "user defined", Medium), fee non-zero; the fee `transferFrom` CALL (`:135`, SafeERC20 `:227`) precedes the clone CREATE2 and the `initialize` CALL |
| Exploitability | Attacker: whoever controls `FEE_TOKEN` code (only the factory deployer chooses it; it is immutable, `:41`, `:90`) or a fee token with sender hooks. `deploy` is `nonReentrant` (`:103`), so a callback cannot re-enter `deploy` with any salt; during the fee call the clone does not exist, the implementation is locked (`PolicyAccount.sol:123`, `:133`), and only this factory can create at the predicted address; `initialize` authenticates its caller by recomputing the CREATE2 address (`PolicyAccount.sol:140-143`) and makes no external call. Impact: at most a failed deployment or a fee waiver (fee revenue only, AUD24-02). No effect on account funds, keys or parameters |
| Tests | `test_R5_R9_reentrantFeeTokenCannotReenterBeforeCreate2OrInitialize`, `test_R5_R9_feeCallbackCannotPreInitialiseHijackOrBlockTheClone`, `test_R5_initializeFailureAfterFeePullRollsBackFee`, `test_R5_foreignCloneCannotBeInitialisedByThirdParty`, `test_R5_initializeIssuesNoExternalCallBelowTheClone`, `test_R5_R6_R9_R10_exactCallOrderAndOnlyGuardWrites`, `test_replay_R5_R9_R10_attackerTokenWithMythrilArguments`: PASS in CI |
| Disposition | Benign: intended order (fee first, documented `:22-27`), no exploitable reentrancy |
| Independent conclusion | **Agree**, conditional on two invariants that any change must keep: `nonReentrant` on `deploy`, and no external call in `PolicyAccount.initialize` |

### R6: `PolicyAccountFactory.deploy` — SWC-107, Low (guard write after the initialize CALL)

| Field | Value |
|---|---|
| Location | `ReentrancyGuard.sol:99` as attributed by the optimizer; PC 1170 `SSTORE` (transcribed decode: the NOT_ENTERED write of `_nonReentrantAfter`) |
| Reproduction | Fee 0, so the only call is `initialize` on the fresh clone (a "fixed" target, Low) |
| Exploitability | None. Independently of the PC decode, the factory has no storage except the guard slot (section 2), so the flagged write is a guard write; the guard is held during `initialize`, and a re-entering clone reverts. No effect on funds, keys or fees |
| Tests | `test_R6_guardIsHeldDuringInitialize_reentryFromCloneReverts`, `test_R6_feeFreeDeployMakesNoTokenCallAndReleasesGuard`, `test_R5_R6_R9_R10_exactCallOrderAndOnlyGuardWrites`: PASS in CI |
| Disposition | False positive (the mitigation itself) |
| Independent conclusion | **Agree** |

### R7: `PolicyAccountFactory.deploy` — SWC-113, Low (`balanceOf(FEE_RECIPIENT)`)

| Field | Value |
|---|---|
| Location | `src/PolicyAccountFactory.sol:131`; PC 1668 (STATICCALL) |
| Reproduction | Fee non-zero; the read follows `balanceOf(msg.sender)` (`:130`) |
| Exploitability | Attacker: the fee-token issuer or upgrade admin, or a broken token. If the view reverts permanently, every fee-charging `deploy` of that immutable factory reverts (fail closed, full rollback); counterfactual funds at undeployed addresses of that factory stay frozen until the token works again. Not reachable by an ordinary caller; no effect on deployed accounts, keys or fee amounts |
| Tests | `test_R7_recipientBalanceOfRevertFailsClosedWithFullRollback`, `test_R7_R8_feeReadsAreStaticCalls_mutatingReadsFailClosed`, `test_R7_R8_feeTokenWithoutCodeFailsClosed_feeFreeFactoryUnaffected`: PASS in CI |
| Disposition | Benign: intended fail-closed behaviour, with the design residual N1 (REVIEW_FINDINGS R-11, Medium conditional) |
| Independent conclusion | **Agree.** N1 remains an owner decision before any production scheme-2 deployment; it is not exposed while scheme 2 is undeployed |

### R8: `PolicyAccountFactory.deploy` — SWC-113, Low (`allowance`) — timeout-dependent

| Field | Value |
|---|---|
| Location | `src/PolicyAccountFactory.sol:132`; PC 1781 (STATICCALL) |
| Reproduction | 3-step sequence repeating identical `deploy` arguments (transcribed). **Timeout-dependent:** reported at `beb525dd` (run 43981233671) and, per the promotion packet, at `7a620ff1` (44242366379); absent at `d91ae16a` (44231986631) and in an earlier local rerun, on byte-identical source, runner and compiler. Runner step wall times (CI evidence): 48m22s, 49m10s and 47m52s respectively; `71abc7e5` (44248573915) took 45m57s and its record set is not readable here |
| Exploitability | As R7 (fail closed on a failing `allowance`). The 3-step path itself is infeasible on chain: the repeated identical `deploy` reverts `AlreadyDeployed` (`:111`) before any token call |
| Tests | `test_R8_allowanceRevertFailsClosedWithFullRollback`, `test_R7_R8_feeReadsAreStaticCalls_mutatingReadsFailClosed`, `test_replay_R7_R8_secondIdenticalDeployRevertsBeforeAnyTokenCall`: PASS in CI |
| Disposition | Benign: intended fail-closed behaviour; residual N1 as R7 |
| Independent conclusion | **Agree.** Any disposition mechanism must treat an absent R8 as normal and must still fail on a new record (section 5) |

### R9: `PolicyAccountFactory.deploy` — SWC-107, Medium (CREATE2 after the fee call)

| Field | Value |
|---|---|
| Location | `Clones.sol:104` `create2`, reached from `PolicyAccountFactory.sol:116`; PC 2887 |
| Reproduction | As R5 |
| Exploitability | As R5. Front-running a deployment with the victim's exact parameters creates the victim's own policy (salt binds owner, destination, delay, root: `:109`); the victim's call then reverts `AlreadyDeployed` before any fee. A CREATE2 failure reverts the fee. No effect on funds, keys or fees beyond R5 |
| Tests | `test_R9_frontRunSameSaltDeploysVictimPolicy_victimPaysNothing`, `test_R9_create2FailureAfterFeeCallRevertsAtomically`, `test_R9_otherFactoryWithSameImplementationCannotOccupyAddress`, `test_R5_R9_*` (2), `test_R5_R6_R9_R10_exactCallOrderAndOnlyGuardWrites`: PASS in CI |
| Disposition | Benign: intended order |
| Independent conclusion | **Agree** (same invariants as R5) |

### R10: `PolicyAccountFactory.deploy` — SWC-107, Low (call to a "user-supplied" address)

| Field | Value |
|---|---|
| Location | `SafeERC20.sol:227` `call`, reached from `PolicyAccountFactory.sol:135`; PC 2978 |
| Reproduction | `FEE_TOKEN` symbolic at construction |
| Exploitability | None for callers: the target is the immutable `FEE_TOKEN`; no `deploy` argument selects a call target (`owner` and `destination` are never called). Deployer trust: a malicious `FEE_TOKEN` can block deployments or grant waivers, nothing more. No effect on funds or keys |
| Tests | `testFuzz_R10_callTargetsAreFixedForAnyCallerInput` (10,000 runs), `test_R5_R6_R9_R10_exactCallOrderAndOnlyGuardWrites`, `test_replay_R5_R9_R10_attackerTokenWithMythrilArguments`: PASS in CI |
| Disposition | False positive (the premise "caller-chosen target" is false) |
| Independent conclusion | **Agree** |

### R11: `PolicyAccountFactory.deploy` — SWC-104, Medium (unchecked return value)

| Field | Value |
|---|---|
| Location | `SafeERC20.sol:227`, reached from `PolicyAccountFactory.sol:135` (`trySafeTransferFrom`); PC 2978 |
| Reproduction | Two `deploy` calls from different senders; the solver lets the `transferFrom` success bit be 0 or 1 on paths that still `RETURN` |
| Exploitability | The return value is checked: `and(success, eq(mload(0), 1))` (`SafeERC20.sol:230`), the no-return-data rule (`:239`) and the branch at `PolicyAccountFactory.sol:135`. The flagged path is the documented waiver (`:22-27`, `:150-163`): a refused transfer while the payer could pay and nothing moved. Attacker: any caller, when `FEE_TOKEN` refuses its transfer (pause, blacklisted payer, sender hooks per AUD24-02, or a `transferFrom` that burns more than about 3.9M gas behind one proxy / 7.7M without, so it can be gas-starved). Impact: a fee-free deployment, i.e. fee revenue only; the factory holds no assets or approvals; no effect on account funds or keys |
| Tests | `test_R11_*` (8, including `test_R11_residual_gasHungryFeeTokenCanBeStarvedIntoWaiver` and `test_R11_gasStarvationOfOrdinaryFeeTransferNeverWaives`) and `test_replay_R11_twoCallerSequenceWaivesOnlyBecauseTokenReturnsFalse`: PASS in CI |
| Disposition | False positive as "unchecked"; the reachable path is the intended waiver |
| Independent conclusion | **Agree.** `FEE_TOKEN` must not have sender hooks; the gas bounds were measured by earlier lanes and not re-measured here (no compiler) |

**Summary:** 11 of 11 agree (EXP-1 to EXP-3 benign-intended; R4, R6, R10, R11 false positives; R5, R7, R8, R9
benign-intended with stated invariants or residual N1). R4's model mechanism stays an inference, and no verdict depends
on it. No record is a real exploitable defect against the current source, so no failing-before/passing-after test
applies.

## 5. Timeout dependence and determinism

R8 is the only record known to come and go on byte-identical inputs. The cause is the bounded symbolic search
(`--execution-timeout 900` per contract, `-t 3`) plus solver nondeterminism; the job also installs Mythril's transitive
dependencies unpinned, so the z3 build can differ between runs. Consequences: a run with fewer records is not evidence
that a finding went away, a passing Mythril run would not prove complete exploration (run-mythril.sh:3), and any
finding-specific mechanism must fail on a new or moved record but tolerate a known record being absent. Pinning
Mythril's dependency set would reduce drift; that is a workflow change for the owner, not made here.

## 6. Latest run on the candidate head

Contract analysis 44248573915 (`71abc7e5`, pull request): Echidna job 134613402183 **success** at 06:20:40Z (artifact
14403996094). Mythril job 134613402317 (CI evidence): checkout `HEAD is now at 71abc7e`, `Mythril version v0.24.8`,
solc 0.8.28; runner step 06:08:55Z to 06:54:52Z (45m57s), **exit code 1** (failure, as expected while any record
exists); artifact 14404534228 uploaded (17069 bytes, zip sha256 `0ce79648…9edf95`). Run conclusion: failure.

Its download failed the same way (`productionresultssa16.blob.core.windows.net`, egress 403), so **its records are
not parsed here**. Circumstantial only: the zip is 17069 bytes, the same size as the `7a620ff1` artifact reported
to hold the eleven records, while `beb525dd` (eleven) is 17030 and `d91ae16a` (ten) is 16578. That is not evidence of
record identity. An owner or a session with artifact access must compare it with section 4.

## 7. Release gate (verified here, read-only)

The release cannot proceed while Mythril is red, and analyses exactly the tagged commit:

- `release.yml:16-18` runs only on pushed `v*` tags. `verify` (`:28-93`) checks the tag signature against the
  default-branch trust root and that the tag points at `HEAD` and is reachable from the default branch (`:39-66`).
  `.github/release-signers/allowed_signers` currently holds no key line, so every release fails closed here today.
- `contract-analysis` (`:97-101`) `needs: verify` and calls the same reusable workflow (`uses:
  ./.github/workflows/contract-analysis.yml`, read-only, no secrets, no `if:`). In a `workflow_call` from a tag push,
  `github.event.pull_request.head.sha` is empty, so the checkout ref and `REQUESTED_COMMIT` are `github.sha`, the
  tagged commit (`contract-analysis.yml:39`, `:43`); `cancel-in-progress` is false for non-PR events (`:20-22`).
- In the reusable workflow the runner's exit status is the step's exit status (`contract-analysis.yml:80-83`;
  run-mythril.sh sets status 1 on any issue, tool error, non-zero `myth` exit or malformed JSON, `:22-33`, `:36`), and
  the evidence is collected and uploaded even after a failure (`:84-96`) with `requestedCommit`, `checkoutCommit`,
  `analysisOutcome` and `runnerExitCode` (`collect-analysis-report.py:33-46`).
- `build` has `needs: [verify, contract-analysis]` (`release.yml:105`) and no `if:`, so with default `success()`
  semantics a failed, cancelled or skipped Mythril job skips `build` and therefore `draft-release` (`:207`
  `needs: build`). Independently, `build` downloads this run's `contract-analysis-mythril-${{ github.sha }}` artifact
  (`:149-156`, no run id or token) and the gate step (`:157-173`) requires `analysisOutcome == "success"`,
  `runnerExitCode == 0`, `reportPresent`, `requestedCommit == GITHUB_SHA` and `checkoutCommit == HEAD` for both
  analyzers before any build or attestation.
- Tests: `node --test scripts/tests/contract-analysis-workflow.test.mjs scripts/tests/mythril-runner.test.mjs`
  **26/26 passed** here (job graph, step order, and the gate rejecting failed, cancelled, skipped, wrong-commit,
  malformed and absent evidence).

Residuals: the release path has not been exercised on a real tag (REVIEW_FINDINGS R-06); it relies on GitHub's
default `needs` semantics and on `main` being reviewed, and `main` has no branch protection (R-07, owner action).

## 8. Disposition checker (unwired; wiring needs an owner decision)

`scripts/contract-analysis/mythril-disposition-check.mjs`, tested by `scripts/tests/mythril-disposition-check.test.mjs`.
It is **not referenced by any workflow, release gate, npm script or the runner** (a test asserts this), and it does
not alter `run-mythril.sh`, which stays red on any issue. Its test file is picked up by the existing
`node --test scripts/tests/*.test.mjs` glob (`ci.yml:193`) only as a unit test with synthetic fixtures; it never reads
a real report or a disposition file.

What it checks, given a disposition file, one `report.log`, the repository root and runtime bytecode files:

- the report has exactly `expectedAnalyses` documents, each `success: true, error: null`;
- every reported issue matches exactly one record by (contract, function, SWC id, PC, severity), and the record's
  optional `sourceMap`, `filename` and `lineno` still equal the issue's; anything else fails as `UNDISPOSITIONED` or
  `LOCATION_CHANGED`;
- for every record: each listed source file's sha256 (`SOURCE_CHANGED`/`SOURCE_MISSING`); the runtime bytecode sha256
  of the named contract, which must be supplied (`BYTECODE_UNVERIFIED`/`BYTECODE_CHANGED`); the compiler version,
  optimizer runs and EVM version read from `run-mythril.sh` (`COMPILER_CHANGED`); the Mythril version read from
  `contract-analysis.yml` (`ANALYZER_CHANGED`);
- only `benign-intended` and `false-positive` dispositions are accepted (a real finding must be fixed), and the file
  must name an owner approval;
- a record absent from the run is a note (marked when `timeoutDependent`), not a failure.

Results here: 11/11 tests passed; six single-change mutants of the checker (skip the source hash, pass undispositioned
issues, pass missing bytecode, ignore the analyzer pin, ignore tool errors, allow a "real" disposition) each made at
least one test fail, and the unmutated control passed. Field names follow the Mythril 0.24.8 source; the checker has
**not** yet been run against a real `report.log` because no artifact was reachable here.

**No disposition file is committed.** Populating one needs the exact report strings (the `function` signatures, the
R4 contract string) and runtime bytecode hashes produced by solc 0.8.28 with the runner's JSON settings, none of which
this lane could obtain. Wiring the checker into any gate, and choosing who may approve a disposition file, are owner
decisions. Note also that the Codex automation's path policy (`ghostpay-codex-cloud.yml`, `scripts/tests/*`) bars
agent PRs from editing these test files; this change needs a human-reviewed merge.

## 9. Owner actions

1. Decide the Mythril policy (unchanged from PROMOTION_PACKET blocker 2): keep releases blocked, or approve a
   finding-specific mechanism such as the unwired checker above, including who signs `ownerApproval` and how runtime
   bytecode hashes are produced.
2. From a machine with artifact access: `gh run download 44248573915 -R djshellshoxxx/GhostPay -D <dir>` and
   `gh run download 44242366379 …`; record `sha256sum report.log` and confirm the records match section 4 (expected
   eleven, or ten without R8).
3. Decide residual N1 (fee-token freeze) before any production scheme-2 deployment (REVIEW_FINDINGS R-11).
4. Optionally pin Mythril's transitive dependencies to reduce run-to-run drift (section 5).
