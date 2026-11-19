# Factory security and deployment safeguard review — 2026-11-18

## Scope and provenance

Reviewer/implementer: `factory_security`, an AI-assisted worker independent of the original
Factory implementation and its historical Mythril disposition reports. This is not an external
audit. The root coordinator owns combined-candidate qualification and approval decisions.

Initial main: `58d89b39b27a66454ebf392bcd35d5c68b57b2f8`.
Task branch: `security/mythril-closure-factory-20261118`.
Original guard reused from PR #217: `9e5cc3789b7b8a3c550ed2680304ab6245ec6676`.
Exact source/test/snapshot port: `4f7a3615`.
Preflight correction and permanent freeze regressions: `7593ea5f62f073cb4c01f435cbb106c2e43a74de`.
Configuration-binding implementation: `b25819a894a96d617a5403f08bd0a786293f5853`.
Gas snapshot: `bdfb6258d00d8e0bdb62bd29533aa770b2032c5e`.

The current main and inspected Pages integration branch had identical `packages/contracts`
inputs. PR #217's deployment guard was absent from main. PR #220's contract-package change was
P3 limitation documentation, not runtime remediation; the root coordinator integrates that text.
No `packages/contracts/src`, vendored library, compiler, fuzz budget, invariant budget or analyzer
setting was changed in this lane. No deployment, finding approval or main merge was performed.

## Findings and implemented safeguards

### F-PREFLIGHT-01: acknowledgment casing could produce a false positive preflight

PR #217 compared acknowledgment addresses case-insensitively in the shell preflight but parsed
the actual deployment acknowledgment with strict EIP-55 spelling. A lowercased acknowledgment
therefore passed preflight and failed the actual deployment. This did not bypass the Solidity
script. The new subprocess regression failed against the ported source, then passed after exact
matching was added. The final nonzero-fee preflight also checks token and recipient EIP-55 spelling
through `cast`, so lowercasing both the token and its acknowledgment does not create a green result.

### F-CONFIG-01: a token address alone did not bind the reviewed deployment configuration

The user's closure directive requires configuration-specific acknowledgment. Retaining a token
address in the environment could otherwise reuse the same attestation for another chain, a
changed token runtime, a different flat fee or another recipient. The deployment script now
requires both:

- `FEE_TOKEN_FREEZE_ACK` equals the exact checksummed `FEE_TOKEN`.
- `FEE_TOKEN_FREEZE_ACK_CONFIG` equals the domain-separated digest below, using the actual current
  `block.chainid`, `feeToken.codehash` and deployment inputs.

```solidity
keccak256(abi.encode(
    keccak256("GhostPay.DeployPolicy.FeeTokenFreezeAck.v1"),
    chainId,
    feeToken,
    tokenCodehash,
    flatFee,
    feeRecipient
))
```

The script exposes the pure `feeTokenFreezeConfigHash` helper. Missing/malformed/mismatched
configuration acknowledgments fail before `vm.startBroadcast()`. Tests change each bound input
independently. An independently computed Foundry `cast` vector pins the ABI encoding and domain.
`MAX_FLAT_FEE` remains a separate mandatory upper-bound check; it is not a factory immutable.
The newly created implementation address is not predictable before script deployment and is not
included in this digest. Review of the built implementation source remains a separate requirement.

The shell preflight recomputes the same digest from read-only chain/code queries and rejects
missing RPC access, missing `cast`, failed reads, malformed code or failed hash/ABI encoding.
It never generates or exports an acknowledgment automatically. A mismatch prints the expected
public digest for review while keeping its exit status nonzero. `FLAT_FEE=0` retains offline
preflight and requires neither acknowledgment. The supported zero-fee script path still requires
a nonzero token address with code at actual script execution; it is not the constructor's wider
zero-token path.

**These fields record operator acknowledgment; they do not certify token safety.** A proxy upgrade,
pause, blacklist, fee switch, sender hook or change to gas cost can occur while the proxy's runtime
codehash stays the same. The token-specific review must cover its implementations, storage-based
switches and administrative powers. Reusing a matching digest is not an approval for a token change.
The guard applies to the recommended deployment scripts; the immutable factory constructor remains
permissionless. There is no new runtime administrator, fee setter or token allowlist.

## Runtime Factory assessment

These are concrete current-source assessments, not activated scanner exceptions. Fresh symbolic
analysis and exact finding identities belong to the analyzer lane.

| Finding | Source assessment | Concrete regression evidence | Residual decision |
|---|---|---|---|
| R4: clone exception model | EIP-1167 PC 30 is GAS. The historical constructor using implementation `address(1)` is rejected by the real code-length check. | `test_R4_cloneRuntimeIsExactEip1167_pc30IsGasNotInvalid`, constructor-model replay, fallback/receive and initialization tests | Legitimate implementation selection remains required. |
| R5: call then initialization | The guard spans fee collection, CREATE2 and initialization. Production `initialize` performs no external message call below the clone's fixed delegatecall. | Reentrant same/other deployments, hostile initialization hook, no-external-call recording, fee rollback on initialization failure | Preserve the guard and initialization call boundary. |
| R6: guard-state reset | The flagged SSTORE is the guard being released after initialization, not unprotected business state. | Exact call/write sequence, reentrant-initializer rejection, next successful zero-fee deployment | No new runtime defect reproduced. |
| R7: balance query | Views execute as STATICCALL; a failing view aborts before clone deployment and rolls back state. | `test_R7_recipientBalanceOfRevertFailsClosedWithFullRollback`, mutating-view test | A permanently broken token view can strand prefunded undeployed accounts. |
| R8: allowance query | Same fail-closed behavior. Repeated identical deployment is rejected before any token call. | Allowance-revert and repeated-deployment replays | Same token-selection/liveness risk as R7. Presence in a fresh symbolic run is a separate question. |
| R9: CREATE2 after fee | Salt binds owner and policy. Front-running creates that same owner's policy. CREATE2 failure reverts the fee. | Front-run policy/fee test, foreign-factory distinction, labelled cheatcode collision/rollback test | Another factory cannot recover value already sent to this factory's undeployed address. |
| R10: external target | Fee-call target is the constructor-set immutable `FEE_TOKEN`, not an arbitrary per-call owner/destination. | 10,000-run call-target fuzz case and exact call sequence | The deployer must choose an appropriate token. |
| R11: return handling | SafeERC20 consumes call success/return data and Factory branches on it. Failure waives only with sufficient prior funds/allowance and unchanged observable state. | False/no-return/noncanonical return, state-mutating false return, insufficient funds/allowance, return bomb and gas-starvation cases | Token-controlled transfer refusal and pathological high-gas/sender-hook behavior can yield fee waivers. This is an economic assumption, not unchecked asset transfer. |

The existing suite retains explicit distinction between ordinary fee calls that pay on every
successful deployment and a test-only 20-million-gas token that can be starved into the waiver.
No hard-coded gas threshold or broader fail-open policy was introduced.

## Permanent freeze-risk tests

The historical audit identified the end-to-end freeze only with a scratch probe. The new
`PolicyAccountFactoryFreezeRisk.t.sol` commits that evidence:

1. Prefund the predicted account, enable a transfer fee, and verify deployment reverts with
   `UnexpectedFeeDelta`, all token effects roll back and the original prefunded address remains
   undeployed. A zero-fee factory deploys a different address and does not recover the old funds.
   Restoring exact token transfers permits the original factory deployment.
2. Break token views after factory configuration and verify the fee-charging factory cannot deploy
   its prefunded account, while a zero-fee factory deploys without querying that token. Token balances
   and allowance are unchanged when views are restored for assertions.

These tests confirm the residual risk rather than asserting it is fixed by documentation or an
acknowledgment. Zero-fee configuration prevents this dependency for newly chosen factory addresses;
it does not rescue already prefunded addresses belonging to a different immutable factory.

## Timing, cancellation and address-domain limits

The existing expiry suites were run unchanged. Deadline checks are inclusive: a valid signature
may be accepted at `block.timestamp == deadline`; one second later is rejected. Nonces, signature
validation and EIP-712 chain/contract isolation remain in place. Timelocks use chain timestamps.
A block producer or sequencer controls inclusion/order within the chain's rules, and a wall-clock
reaction interval is not guaranteed during censorship or downtime.

`cancel` and `cancelDestination` have no timestamp-expiry check. An authenticated cancellation
can still win after maturity while the request/proposal remains pending, but execution can win
the ordering race. Do not describe maturity as an automatic cancellation cutoff.

P3 captures a withdrawal destination at **acceptance**, not signing. A still-unsubmitted Withdraw
signature carries no destination and can be submitted after a destination change until its deadline.
An accepted request blocked by rotation A to B becomes eligible again after B to A, since execution
compares destination equality rather than a rotation epoch. Existing owner authorization is still
required. Avoid signing during a pending rotation and cancel old requests when rotating; changing
this behavior requires a separate typehash/implementation decision, not removal of timestamp checks.

Factory NatSpec's claim that a different chain necessarily yields a different CREATE2 address is
too broad. CREATE2 itself contains no chain ID: identical deployer, implementation/init-code and
salt can produce the same address on another chain. Cross-chain **signature** isolation comes from
EIP-712's chain ID. This review records the correction without changing runtime source identities
while the separate symbolic-analysis campaign is being qualified.

## Validation and evidence boundaries

Native tools: Forge 1.8.5, commit `51a52c59cffd940f76eddd0b4bb1791aa4b5ac7f`, and solc
`0.8.28+commit.7893614a.Linux.g++`. Default Cancun/optimizer 200, fuzz 10,000, invariants 256 x 50
were preserved. Later executions use `--threads 2` to limit contention, without lowering budgets.

| Source | Command / scope | Actual result |
|---|---|---|
| Initial main `58d89b39` (task claim only) | `forge test --match-path 'test/Mythril*Dispositions.t.sol' -vv` | 64 passed, 0 failed, 0 skipped. |
| `7593ea5f` | Full `forge test` | 492 passed, 0 failed, 0 skipped; this precedes configuration-digest implementation. |
| `7593ea5f` test/source bytes | New freeze-risk tests | 2 passed, 0 failed, 0 skipped. |
| Ported #217 plus new casing regression | Node preflight suite before fix | 4 passed, 1 failed: lowercased acknowledgment incorrectly passed. |
| Preflight casing fix | Same Node suite | 5 passed, 0 failed, 0 skipped. |
| Solidity source matching `b25819a8` | `forge test --threads 2 --match-path 'test/Deploy*.t.sol' -vv` | 26 passed, 0 failed, 0 skipped, including all 10 configuration cases. |
| Final Node/shell source `b25819a8` | `node --test scripts/tests/deploy-policy-preflight.test.mjs` | 7 passed, 0 failed, 0 skipped; 5.12 seconds. Uses offline executable cast/RPC fixtures. |
| `b25819a8` | Snapshot generation, unchanged `--no-match-test 'testFuzz|invariant'` | 457 passed, 0 failed, 0 skipped. Only two existing deploy gas entries and 12 new entries changed. |

Formatting, shell syntax, secret scan and diff checks passed on the final source. NatSpec passed
for all four production contracts. The snapshot check initially ran from the repository root and
failed because its default `.gas-snapshot` lookup is relative to cwd even with `--root`; the retry
from `packages/contracts` passed all 457 selected tests and the snapshot comparison. Both attempts
are retained. Raw logs and tool/source identities are in
[`data/mythril-closure-factory-20261118/manifest.json`](data/mythril-closure-factory-20261118/manifest.json).

The final full combined 502-test candidate, coverage, build sizes, Slither, Echidna, Mythril and
hosted security gates are coordinator-owned qualification, not inferred from the earlier 492-test
run. Initial NatSpec invocation lacked Forge on PATH and exited 127; it was retried with the verified
native tools. Independent review of the newly authored deployment safeguards is requested separately.
The owner has not approved R4–R11 finding exceptions through this lane.
