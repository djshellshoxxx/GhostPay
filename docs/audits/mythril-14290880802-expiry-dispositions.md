# Mythril artifact 14290880802: dispositions of the three expiry (SWC-116) records

Status: author disposition, independently reviewed 2026-11-18 (see the final section; conditions applied).
Nothing here suppresses or allowlists a finding, changes the runner, or changes production code. Accepting these
dispositions as a Mythril gate exception still requires an owner-approved, finding-specific mechanism.

## Provenance

| Item | Value |
|---|---|
| Workflow run | contract-analysis run 43981233671 (`mythril` matrix job) |
| Artifact | 14290880802: `report.log` SHA-256 `f5a03aea77cff52a996e67202893f6dd51f8b85bce2f9ad8e41a05ebc7f158f8` (283 366 bytes, not truncated); `metadata.json` SHA-256 `3a4a22d1333f6ea606d2788b878589f5f6188dff43c5099fd3538fafadaec36e` |
| Analysed commit | `beb525dddcca103de9eda447b55cddf7ee2f428c` (requested = checkout, runner exit 1) |
| Tool / parameters | Mythril 0.24.8 through `packages/contracts/scripts/mythril-compat.py`, invoked by `packages/contracts/scripts/run-mythril.sh` with its default `--execution-timeout 900 -t 3 --solv 0.8.28`, optimizer 200, `cancun` |
| Sources dispositioned | `src/GhostPaySweepRelayer.sol` SHA-256 `9943c8b4…f080a`, `src/PolicyAccount.sol` SHA-256 `c860fcf7…3c1f9`; byte-identical at `beb525dd` and at this record's base `d39e304a` (`git diff --quiet beb525dd d39e304a -- packages/contracts/src`) |

The report holds 11 records in total (3 Medium, 8 Low); GhostPayRouter and GhostPayPolicyRouter
returned none. That absence is not evidence: the same `block.timestamp > deadline` pattern exists at
`GhostPayRouter.sol:99` and `:211` and `GhostPayPolicyRouter.sol:125` and `:256` (caller transaction
deadlines, not signed orders), and an independent diagnostic GhostPayRouter run executed `TIMESTAMP`
yet reported nothing. Any exception keyed to the three records below must not assume they are the
only possible SWC-116 records. This record covers only the three SWC-116 records below. The eight
PolicyAccountFactory/OpenZeppelin call-path records are dispositioned separately and are not
covered or cleared here.

## The three records (quoted from `report.log`)

| Id | Report location | Contract : function : line | Code (quoted) | SWC | Severity | Bytecode address / sourceMap |
|---|---|---|---|---|---|---|
| EXP-1 | line 6, `issues[0]` | `GhostPaySweepRelayer` : `sweep((address,address,address,address,uint256,uint256,uint256,uint256),bytes)` : 83 | `if (block.timestamp > s.deadline) revert Expired()` | 116 | Low | 785 / `4414:50` |
| EXP-2 | line 13, `issues[0]` | `PolicyAccount` : `requestWithdraw((address,uint256,uint256,uint256,bytes32),(uint256,uint64,bytes32[]),bytes)` : 161 | `if (block.timestamp > w.deadline) revert Expired()` | 116 | Low | 1876 / `8390:50` |
| EXP-3 | line 13, `issues[1]` | `PolicyAccount` : `proposeDestination(address,uint256,uint256,bytes)` : 262 | `if (block.timestamp > deadline) revert Expired()` | 116 | Low | 5077 / `12988:48` |

All three carry the title "Dependence on predictable environment variable" and the description
"A control flow decision is made based on The block.timestamp environment variable. … Don't use any
of those environment variables as sources of randomness and be aware that use of these variables
introduces a certain level of trust into miners." The source maps were re-checked against the
sources: each `offset:length` slice is exactly the quoted statement on the stated line.

### Counterexamples (Mythril `tx_sequence`)

Each sequence has two steps: tx1 deploys the contract's creation code from `0xaffe…affe` (for
PolicyAccount that is the self-locking implementation, not a factory clone), tx2 is one call with
value 0. The tx2 calldata is embedded verbatim in the tests and decodes as follows.

| Id | tx2 origin | Decoded tx2 arguments | Outcome on the real contract |
|---|---|---|---|
| EXP-1 | `0xaaaa…aaaa` | all-zero `Sweep` (deadline 0, amount 0, fee 0), signature offset `0xfc` → empty signature | `Expired` at any timestamp ≥ 1; at timestamp 0 the next guard reverts `InvalidAmount` |
| EXP-2 | `0xaaaa…aaaa` | all-zero `Withdraw` (deadline 0, amount 0) except `limitLeafHash`, `LimitProof` offset 0 (overlaps the head; empty proof), 24-byte zero signature | `Expired` at any timestamp ≥ 1; at timestamp 0 `ZeroAmount` (implementation and clone alike) |
| EXP-3 | `0xdeadbeef…` | `newDestination` 0, deadline `0x55 << 208` (far future), nonce 0, 85-byte signature that overlaps the head | not expired at realistic timestamps → `InvalidDestination`; past that deadline → `Expired` |

Every branch of every counterexample reverts without a state change (no nonce consumed, no request
or proposal stored). The records report reachability of a timestamp-dependent `JUMPI`; none of
them contains a state-changing exploit sequence.

## Expected behaviour (spec)

- Sweep: "`block.timestamp <= deadline`" (`docs/CONTRACTS_SPEC.md:53`); `deadline` is the "Last
  timestamp (inclusive) at which the order is valid" (`src/interfaces/IGhostPaySweepRelayer.sol:15`);
  check order "deadline -> `amount > fee` -> zero/self addresses -> signature -> nonce consumption"
  (`packages/contracts/DEVIATIONS.md:29`).
- Withdraw / ProposeDestination: `deadline` is the "Last timestamp (inclusive) at which the request
  [signed proposal] may be submitted" (`src/interfaces/IPolicyAccount.sol:22`, `:175`); "`deadline`
  bounds only the submission of a signed order, never execution" (`DEVIATIONS.md:93`); the EIP-712
  domain binds chain id and the clone address (`DEVIATIONS.md:84-85`, `src/PolicyAccount.sol:29-31`).
- Timelocks: withdrawals execute after `delay`, destination changes after `2 × delay`, both
  cancellable by the owner (`docs/CONTRACTS_SPEC.md:67`); the factory enforces `delay >= 1 hours`
  (`src/PolicyAccountFactory.sol:36`, audit I-02 in `docs/audits/02-security-review-contracts.md:108`).

## Path traces

**EXP-1, `GhostPaySweepRelayer._authorize` (`src/GhostPaySweepRelayer.sol:80-115`)**, shared by
`sweep` and `sweepWithPermit`: (1) `block.timestamp > s.deadline` → `Expired` (line 83, inclusive
deadline, no grace period); (2) `amount > fee`, zero/self addresses; (3) EIP-712 digest over all
eight fields with domain name/version/chain id/verifying contract, recovered with OpenZeppelin
`ECDSA.recover` (rejects high-s and the zero signer) and compared with `s.owner`; (4) per-owner
bitmap nonce checked and consumed before any external call (lines 111-114). Timestamp is read once
and only gates acceptance; it is not used as randomness and does not feed any amount, recipient or
fee. The relayer has no cancel entry point: an order is dead when its deadline passes or its nonce
is consumed (including by a same-nonce replacement order).

**EXP-2, `PolicyAccount.requestWithdraw` (`src/PolicyAccount.sol:155-201`)**: deadline (line 161)
→ amount/token checks → owner signature over the struct hash under the clone's domain
(`_checkOwner`, line 359) → nonce consumed (`_useNonce`, line 364) → limit proof → stored request
with `executeAfter = block.timestamp + delay` (line 188) and the destination captured at acceptance.
Funds move only in `executeWithdraw`, only to the captured destination (which must still equal the
current one), only from `executeAfter` (line 208), and the owner can cancel until then.

**EXP-3, `PolicyAccount.proposeDestination` (`src/PolicyAccount.sol:255-280`)**: deadline (line
262) → destination checks → one pending proposal at a time → owner signature → nonce consumed →
`effectiveAt = block.timestamp + 2 × delay` (line 273). The change applies only from `effectiveAt`
(line 287) and the owner can cancel until then. Cancelling does not release the nonce.

## Dispositions

| Id | Verdict | Counterevidence | Residual risk |
|---|---|---|---|
| EXP-1 | **Intended behaviour** (true positive of the detector's pattern; not a defect, not a false detection) | Spec requires the inclusive deadline; boundary, replay, cross-chain/cross-relayer, same-nonce revocation and producer-timestamp fuzz tests below; counterexample reverts on both branches | A block producer that can move `block.timestamp` by δ can accept an order up to δ after its wall-clock deadline or refuse it up to δ before. The order's effects are fixed by the signature, so this only stretches or shortens the window in which an irrevocable, owner-signed order may land. An owner who treats wall-clock expiry as revocation and re-signs a *different* nonce can see both orders execute if both are funded; re-signing with the *same* nonce makes them mutually exclusive. |
| EXP-2 | **Intended behaviour** | Inclusive deadline and full `delay` from acceptance at deadline−1/deadline/+1; deadline does not bound execution; late-accepted request still cancellable for the whole delay; replay rejected after expiry and after cancel; cross-chain/cross-clone rejected; fuzz | Same δ stretch for *submission* of an owner-signed order. Any request accepted late still gets exactly `delay` of block time, goes only to the captured destination and stays cancellable. |
| EXP-3 | **Intended behaviour** | Same set for proposals with `2 × delay`; cancel keeps the nonce consumed | Same δ stretch for submission; the proposal still needs `2 × delay` of block time and stays cancellable. |

Not real defects, so no regression-fix commit is proposed and production logic is unchanged. Expiry
is kept.

### Timestamp assumptions (inference, not verified per chain here)

- The contracts apply zero tolerance (`block.timestamp <= deadline`); any skew margin is the
  signer's/client's responsibility. The client review policy treats `deadline <= now` as expired and
  caps lifetime with `maxDeadlineSeconds` (`packages/tx-review/src/review.ts:76-78`), one second
  stricter than the contract. Client nonce selection and deadline margins were not reviewed here.
- On post-Merge Ethereum the block timestamp is fixed by the slot, so the proposer has no timestamp
  choice. L2 sequencers and other EVM chains in `docs/chains/` allow bounded producer latitude whose
  exact bounds were not verified in this lane.
- Not covered by these records: the timelock comparisons and timestamp arithmetic at
  `src/PolicyAccount.sol:188, 208, 273, 287` and the window bucketing at `:378`. Forward skew at
  execution or lagging skew at acceptance shortens the wall-clock timelock by up to the producer's
  latitude (material only if that latitude is a meaningful fraction of `delay`, minimum
  `MIN_DELAY = 1 hours`). Mythril did not report these
  lines; in its model (the implementation, owner zero) no signature can pass `_checkOwner`, so those
  comparisons were not reached at all (`:206` and `:285` revert first;
  `test_exp2_exp3_implementationModelNeverPassesAuthorization`).
  Their absence from the report is therefore not evidence about them.

## Evidence tests

`packages/contracts/test/MythrilExpiryDispositions.t.sol` (contracts `MythrilExpirySweepTest`,
`MythrilExpiryPolicyTest`). Run: `forge test --match-path test/MythrilExpiryDispositions.t.sol -vv`
in `packages/contracts`.

| Id | Tests |
|---|---|
| EXP-1 | `test_exp1_mythrilCounterexample_decodesToZeroDeadlineOrder`, `test_exp1_mythrilCounterexample_bothBranchesRevertWithoutEffect`, `test_exp1_oneSecondBeforeDeadline_sweeps`, `test_exp1_atDeadline_inclusiveOnBothEntryPoints`, `test_exp1_oneSecondAfterDeadline_revertsOnBothEntryPointsWithoutEffect`, `test_exp1_replayAfterExpiry_rejectedByDeadlineThenByNonce`, `test_exp1_expiredUnusedOrder_staysDeadAfterNonceIsReused`, `test_exp1_wrongChainOrRelayerAtDeadline_revertsInvalidSignature`, `test_exp1_sameNonceReplacementRevokesOrderBeforeItsDeadline`, `testFuzz_exp1_producerTimestampOnlyGatesAcceptance` |
| EXP-2 | `test_exp2_mythrilCounterexample_decodesToZeroDeadlineOrder`, `test_exp2_mythrilCounterexample_bothBranchesRevertWithoutEffect`, `test_exp2_oneSecondBeforeDeadline_accepts`, `test_exp2_atDeadline_inclusiveAndStartsFullDelay`, `test_exp2_oneSecondAfterDeadline_revertsWithoutEffect`, `test_exp2_deadlineBoundsSubmissionNotExecution`, `test_exp2_lateAcceptedRequestStaysCancellableForFullDelay`, `test_exp2_replayAfterExpiry_rejectedByDeadlineThenByNonce`, `test_exp2_wrongChainOrCloneAtDeadline_revertsInvalidSignature`, `testFuzz_exp2_producerTimestampOnlyGatesAcceptance` |
| EXP-3 | `test_exp3_mythrilCounterexample_decodesToFarFutureDeadline`, `test_exp3_mythrilCounterexample_bothBranchesRevertWithoutEffect`, `test_exp3_oneSecondBeforeDeadline_accepts`, `test_exp3_atDeadline_inclusiveAndStartsFullTimelock`, `test_exp3_oneSecondAfterDeadline_revertsWithoutEffect`, `test_exp3_deadlineBoundsSubmissionNotExecution`, `test_exp3_lateAcceptedProposalStaysCancellableForFullTimelock`, `test_exp3_replayAfterExpiry_rejectedByDeadlineThenByNonce`, `test_exp3_wrongChainAtDeadline_revertsInvalidSignature`, `testFuzz_exp3_producerTimestampOnlyGatesAcceptance` |
| Scope | `test_exp2_exp3_implementationModelNeverPassesAuthorization` |

The "rewind" steps in the replay tests are test-only (`vm.warp` backwards); they isolate the nonce
as the single-use mechanism and do not model a real chain.

Sensitivity (scratch copies only, production sources untouched): 16 single-change mutants, each
made at least one test above fail, and the unmutated control passed. Per site: exclusive deadline
(`>=`), removed deadline check, one-second grace, deadline check moved after the signature/nonce
step (3 sites × 4); `executeAfter`/`effectiveAt` computed from the signed deadline instead of the
acceptance time (2); `cancel`/`cancelDestination` releasing the nonce (2).

## Local Mythril rerun

Run on 2026-11-18 with the runner's per-contract command and default timeout (`myth analyze
src/<C>.sol --solv 0.8.28 --solc-json <runner config> --execution-timeout 900 -t 3 -o json`), through
the same compatibility wrapper, under `nice -n 10`, on byte-identical sources (hashes above) and the
official solc 0.8.28 build (SHA-256 `9a0fb7e0…636f25`, matching `binaries.soliditylang.org`). The
local toolchain differs from CI in Python (3.13 vs 3.12) and possibly z3, and the host was shared.

| Contract | Wall time | Result |
|---|---|---|
| GhostPaySweepRelayer | 02:26:13–02:28:12 UTC | `success:true`, `error:null`, 1 issue: SWC-116 Low, `sweep`, line 83, address 785, sourceMap `4414:50` (= EXP-1) |
| PolicyAccount | 02:28:12–02:35:00 UTC | `success:true`, `error:null`, 2 issues: SWC-116 Low `requestWithdraw` line 161 / 1876 / `8390:50` and `proposeDestination` line 262 / 5077 / `12988:48` (= EXP-2, EXP-3) |

Both exited 1 (issues present), as in CI. The records reproduce exactly by location and class; no
other issue was reported for either contract. The concrete counterexamples differ (different solver
models: the local EXP-2 trace uses a far-future deadline, the local EXP-3 trace originates from
`0xaffe…`). Replayed on the real contracts in a scratch test, every local counterexample also
reverts: sweep `InvalidAmount` (t=0) / `Expired` (t=1); requestWithdraw `ZeroAmount` (t=0, 1) /
`Expired` (t=2^256−1); proposeDestination `InvalidDestination` (t=0, 1) / `Expired` (t=2^256−1).

## Suppression guidance

Mythril 0.24.8 has no per-SWC exclusion option (`myth analyze --help` lists only the `-m` module
whitelist; see `scripts/run-mythril.sh`). Do not drop the PredictableVariables module through `-m`: it
would apply to all five contracts, hide every future SWC-116 record (including at the unreported
timelock sites above) and also hide SWC-120. If a gate exception is
wanted, it should match exactly contract, function, SWC id, source file and statement (for example
the three `sourceMap`/`code` pairs above) and fail when the code at that location changes. That
decision and its mechanism are outside this record.

## Independent reviewer checklist

1. Re-hash `report.log`/`metadata.json` and confirm the three quoted records and that they are the
   only SWC-116 entries among the 11.
2. Confirm source identity of both contracts between `beb525dd` and the integration head.
3. Read `_authorize`, `requestWithdraw`, `proposeDestination`: deadline inclusive and first, no
   grace period, signature domain binds chain id and verifying contract, nonce consumed before any
   external call, expiry does not consume the nonce, cancel does not release it.
4. Run the test file and check that each test asserts state (balances, nonce bitmap, stored
   request/proposal), not only reverts; optionally repeat one mutant.
5. Decide whether producer timestamp latitude on each supported chain is acceptable against
   `MIN_DELAY = 1 hours` for the unreported timelock sites (188/208/273/287), and whether client
   deadline margins and same-nonce re-signing for sweeps are adequate. Neither is settled here.
6. Confirm no suppression or allowlist was added for these records.

## Independent review (2026-11-18)

Reviewed read-only by a separate agent that did not author this record, at `d4171c7b` (integrated
`1fa4179f`; `packages/contracts/src` tree `dabfd36a` unchanged through the consolidation candidate).
Verdicts: EXP-1, EXP-2 and EXP-3 **agree** (intended behaviour). The reviewer re-verified the report
and metadata hashes, record identity, bytecode PCs and source maps; that each check is inclusive, has
no grace and runs first; that expiry does not consume a nonce; and EIP-712 domain binding per clone
and chain. They reran the 31 tests and six of their own mutants (exclusive bound at each site,
timelock one second early at `:208` and `:287`, deadline removed from the relayer digest), and every
mutant was caught. Conditions applied in this revision: corrected suppression guidance (no
`--exclude-swc` exists), router-absence caveat, and timelock-reachability wording. Separate open item
(Low, documentation): the owner cancel window at the 1h/2h policy timelocks assumes an honest, live
block producer; on OP Stack and Arbitrum a malicious or stalled sequencer can shrink it through
timestamp latitude, censorship or outage. This needs owner-facing documentation and UI guidance; no
contract change addresses producer trust. The Mythril gate remains red; accepting these dispositions
as a gate exception requires the owner's approval of a finding-specific mechanism.
