# ADR-0028: Policy recovery authority and a non-renewable challenge model

Date: 2026-11-09. Status: **Unaccepted candidate; executable design model only.**
Source: PR #89 `cfc7b0f3325a550df830584e86db4c38bcc9d6b2`.

This supplements [ADR-0027](ADR-0027-policy-end-to-end-gates.md) and the historical
[ADR-0014 / ADR-0023 records](ADR-LOG.md). The current `PolicyAccount` implementation
has no owner recovery function. Its deployed semantics, factory, fees, deployment pins,
ordinary invoices and disabled experimental boundary remain unchanged.

The implementation in `scripts/experimental/policy-recovery` is a standalone JavaScript
authority/timing model. No application, package, contract or workflow imports it. This ADR
does not select production recovery parameters or accept the authority trade-off below.

## Four different recovery problems

| Problem | Available material and operation | What it establishes |
| --- | --- | --- |
| Policy-record restore | Restore the bounded public policy record, or search bounded candidate policy preimages | Recovers destination/delay/limit leaves and derivation inputs; provides no seller secret or authorization |
| Seller-key backup restore | Decrypt/restore the seller backup, then rederive the account owner from the announcement | Recovers existing signing authority if the backup and required unlock material survive |
| Pending-operation recovery | Replay complete canonical request/execution/cancellation history, scoped to seller/chain/deployment/account | Recovers on-chain operations after reload; an unknown wallet outcome must remain locked until resolved |
| Actual owner-key loss | Existing owner keys and usable backups are unavailable | Current contracts cannot rotate owner; a new accepted contract design and a surviving independent authority are required |

Loss of both the owner backup and the chosen recovery authority remains unrecoverable in
every authority option that requires one of them. The model does not decrypt backups or
recover private keys.

## Why the ADR-0023 bound fails

ADR-0023 only permits a proposal after `now >= lastOwnerActionAt + T_rec` and resets
`lastOwnerActionAt` on accepted owner actions. For any positive `T_rec`, an attacker
acting every `T_rec - 1` time units maintains `now - lastOwnerActionAt < T_rec` forever.
No proposal is admitted, so a cancellation limit is never reached. The executable test
reproduces this for 10,000 inactivity periods; the invariant explains the unbounded trace.

A revised design needs a recovery authority which the compromised owner cannot veto
indefinitely. That necessarily changes who has the final authority when the keys disagree.

## Concrete owner decision

| Option | Final authority and availability | Consequence |
| --- | --- | --- |
| A. Retain current owner-only contract | Owner or surviving seller-key backup; no additional authority | No actual key-loss recovery; a compromised owner can continue griefing and eventually rotate destination |
| B. Destination-priority challenge, modeled here | Current destination can initiate owner rotation at any time; owner can object once for a fixed grace period | Finite post-admission bound against the owner; a compromised or malicious destination gains ownership and can repeatedly freeze withdrawals |
| C. Independently committed guardian threshold | A separate recovery quorum, with a non-renewable challenge once quorum authorizes | Availability depends on quorum; quorum compromise can take control; needs new policy commitments, privacy analysis, onboarding and a separately modeled authority design |

**Decision required:** whether the destination is allowed to override an active owner,
or whether an independent quorum is required. The modeled candidate B is concrete enough
to evaluate this decision; its existence is not acceptance. Parameter values, authentication
format and contract revision still require review if B is selected.

Candidate B gives the destination stronger authority than receiving withdrawals. A thief
holding only the destination key can recover to their own owner key, then use that key to
propose a later destination rotation under the normal delay. A malicious destination can
also repeatedly recover to different controlled keys and keep withdrawals frozen. The
old claim that destination recovery adds no theft or availability path is therefore not
valid for this candidate. Two adversarial tests deliberately demonstrate these consequences.

## Candidate B authority and state machine

Let `W > 0` be a fixed recovery challenge period and `G >= 0` a fixed objection grace
period committed by the authenticated implementation/profile. They are symbolic in the
model; the small test values are not deployment recommendations.

| State / command | Authority and preconditions | Atomic effect |
| --- | --- | --- |
| Counterfactual → initialize | Authenticated factory, exact predicted clone identity and committed initial owner/destination/policy | Initialize once; implementation itself stays locked |
| Idle → begin recovery | Valid **current destination** authorization for exact new owner, scope, epochs, nonce and admission deadline; no pending recovery | Record admission `t0`, fixed `D = t0 + W`, `Dmax = t0 + W + G`; cancel pending destination rotation; increment withdrawal epoch |
| Pending → owner objection | Current owner, exact recovery epoch; unused objection; `now < D` | Set `D = Dmax` once; preserve `t0` and `Dmax` |
| Pending → owner activity | A valid owner heartbeat represents activity that does not change authority or move value | Record activity; preserve every recovery timer |
| Pending → cancel / replace recovery | No authority can cancel, restart or replace an admitted recovery | Reject; original timer and candidate survive |
| Pending → request/execute withdrawal or propose/execute destination change | Frozen while recovery is pending | Reject; funds remain at the account |
| Pending → execute recovery | Anyone, `now >= D`; recorded destination and destination epoch still match | Set new owner; increment owner/withdrawal epochs; clear recovery; preserve destination, limits and balances |

There is intentionally no indefinite owner veto or destination cancellation after admission.
A mistaken replacement owner therefore cannot be corrected during the challenge by the
old owner; the destination can initiate a subsequent recovery after completion. This is
another availability/UX cost requiring explicit acceptance. Candidate B is inappropriate
if a reversible challenge is a product requirement without another authority to resolve it.

### Destination rotation and transaction order

Canonical transaction order chooses the current destination. Recovery admitted first clears
an existing destination proposal and freezes new rotations. Destination rotation executed
first changes authority; the former destination's signature then fails, even if previously
valid. Each rotation increments a destination epoch, so rotating away and back never revives
old authorizations or withdrawal requests.

The guarantee below starts at valid canonical recovery admission. It does **not** guarantee
that an original destination retains authority while an already-mature owner rotation is
included first. A destination must get its recovery admitted before the competing rotation
executes. No claim of unconditional recovery from initial key compromise is made.

### Signatures, nonces and ERC-1271

The abstract authorization statement binds action, exact arguments, chain, clone, factory,
implementation, policy commitment, owner epoch, destination epoch, recovery epoch, nonce
and deadline. Owner and destination nonce spaces are distinct and persist across recovery.
Failed authentication consumes no nonce and changes no pending operation. An admitted
authorization consumes its nonce once; signatures from an earlier owner/authority epoch
cannot be replayed even if the address later becomes current again.

Only successful verification admits a proposal. Wrong signer, false/invalid magic result,
reverting ERC-1271 call and expired authorization all fail closed. A future Solidity revision
must use bounded `staticcall`, bounded return data, strict ERC-1271 magic-value handling and
reentrancy protections; the JavaScript oracle does not implement those EVM guarantees.

At admission the authorization becomes a committed on-chain decision. Permissionless
execution performs no external signature revalidation. A contract destination changing its
ERC-1271 result or reverting later cannot veto execution. The signature deadline limits
**admission**, not execution; otherwise the destination could create a pending operation
that becomes permanently unexecutable after expiry.

### Pending withdrawals and initialization

An incremented withdrawal epoch invalidates pre-recovery requests in O(1) contract work;
no iteration over an attacker-grown request set is required. Old requests may remain in
storage for history, but execution must compare epochs. New requests and executions are
frozen while pending. After completion only newly authorized requests from the new owner
can execute, to the unchanged current destination and under unchanged limits/window state.

The model keeps requests as an array for inspection and abstracts away token amounts,
balances, proofs, nonces specific to the existing implementation and rolling-window math.
It is not validation of those withdrawal boundaries. An eventual contract revision must
preserve limit/window accounting across recovery; recovery cannot reset spending headroom.

Counterfactual funding confers no authority. Initialization must authenticate the correct
factory/implementation and the CREATE2 preimage, initialize the clone exactly once and lock
the implementation. The model receives the predicted address from an explicit oracle;
its tests reject mismatched commitments but do not prove CREATE2 derivation, bytecode identity,
factory fee availability or safe initialization on the EVM. No recovery is possible before
the correct clone is successfully deployed and initialized. Current non-upgradeable accounts
do not gain this behavior through a client update or a new implementation deployment.

## Conditional finite bound and proof

After a valid recovery is admitted at canonical timestamp `t0`, define
`Dmax = t0 + W + G`. For every reachable pending state:

1. Admission sets `D = t0 + W <= Dmax`.
2. A valid objection sets `D = Dmax` once. Further objections fail.
3. Owner activity, failed operations, cancellation and replacement attempts never change
   `t0` or `Dmax`, never set `D > Dmax` and never remove the pending proposal.
4. Authority/destination changes and value-moving operations are frozen. The recorded
   destination invariant therefore remains true until completion.
5. At `now >= Dmax`, execution's state/time preconditions hold. No owner or destination
   signature, transaction or external callback is needed for execution.

This induction applies to arbitrarily many modeled owner actions; it is separate from the
finite exploration test. If canonical time advances and a valid execution is included within
`L` time units of eligibility, the completion bound is **`t0 + W + G + L`**. An owner cannot
extend it through the modeled actions. Without a chain-inclusion/liveness bound, the model
proves eventual **eligibility**, not a finite wall-clock inclusion deadline. Consensus failure,
censorship, deep reorgs, unavailable deployment and compromised recovery authority remain
outside that liveness guarantee.

After a reorg, replay only canonical events. If admission is orphaned, discard its timer and
result; it grants no current recovery authority. Re-inclusion establishes a new canonical
`t0`. The restart/reorg test exercises state replay; it does not establish RPC completeness,
finality policy or light-client verification.

## Executable evidence and limits

Run from the repository root, using Node >=22 and no external dependencies:

```sh
node --test scripts/experimental/policy-recovery/model.test.mjs
```

The focused suite has 19 tests, covering the inactivity counterexample, hostile activity,
one-time objection, repeated cancellation, destination ordering and former authority,
domain/epoch/nonce replay, ERC-1271 failures and later revocation, pending withdrawals,
clone initialization, counterfactual commitments, restart/reorg replay and destination
compromise consequences. Its finite exploration examines 812 adversarial transitions
and 120 final states for the chosen small periods/action alphabet. That bounded search
supports the transition inventory; the induction above supplies the unbounded model claim.

Local validation on Node 24.22.1 passed all 19 tests with zero skips, both `node --check`
commands and `git diff --check`. Temporary mutations were detected: resetting the recovery
timer on owner activity failed 2 tests; extending from objection time failed 4; removing
withdrawal-epoch invalidation failed 1; retaining former-destination authority failed 1.
The model suite was restored and rerun successfully after those separate mutation runs.

No Solidity prototype was added. No contract compilation/Anvil test, ECDSA/EIP-712 vector,
ERC-1271 contract test, CREATE2 derivation test, external audit or browser journey is claimed
for this model. Existing production contracts do not implement it.

| Boundary | Status after this change | Next concrete evidence |
| --- | --- | --- |
| Inactivity design flaw | Reproduced; analytical counterexample and executable trace | Retain counterexample in any revised implementation review |
| Candidate authority/timing | Implemented and locally tested as an isolated model | Owner choice between A/B/C; review freeze and destination-compromise trade-offs |
| Conditional bound | Model induction and finite adversarial exploration | Contract refinement proof/tests including timestamp arithmetic and gas-bounded transitions |
| Authorization primitives | Abstract fail-closed oracle behavior modeled | Domain/type review, ECDSA and ERC-1271 real contracts, malformed/large return data and reentrancy tests |
| Clone/counterfactual path | Commitment checks modeled | Exact revision vectors, code-identity authentication, deployment/initialization tests and existing-account migration design |
| Complete product recovery | Design-blocked; current contracts lack it | Accepted authority design, CONTRACTS_SPEC update, separate experimental contract PR, independent audit, then qualified client/deployment work |

The next contract work must stay on a separate experimental branch until the authority
decision is accepted. Independent deployment authentication, payment verification,
withdrawal-history persistence and localization can continue while that decision is open.
