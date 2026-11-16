# Milestone escrow: unaccepted executable design model

This directory supports the authority decision for [specification 17](../../../docs/specs/17-milestone-escrow.md).
It is not a contract, signing format, custody implementation or production API. No application,
package, contract or workflow imports it. It adds no dependency and enables no funds path.
Specification 17 remains design-blocked and is not implementation-complete.

The model adapts the pure transition, explicit authorization oracle and adversarial test patterns
already used by GhostPay's [policy-recovery model](../policy-recovery/model.mjs). Its scope is
separate from guardian recovery and does not select an option in ADR-0028. No upstream escrow
code was imported; the historical [reuse survey](../../../docs/research/reuse/milestone-escrow.md)
does not authorize its previously proposed administrator or shared milestone identifier.

## Explicit proposals, without a default

Every stage requires both `releaseMode` and `disputeMode` at creation. Four combinations can be
compared. These are candidate policies, not accepted product behavior.

| Choice | Modeled authority | Consequence requiring a decision |
| --- | --- | --- |
| `releaseMode: mutual` | Both buyer and seller authorize release after the dispute window | Either party can withhold consent indefinitely, even if work was delivered |
| `releaseMode: timeout` | Anyone may execute release after the window if no dispute was admitted | Buyer must get a dispute included before the deadline; censorship, offline clients and timestamp policy matter |
| `disputeMode: mutual` | Both parties authorize release or refund | Disagreement or lost keys can lock the stage indefinitely; there is no hidden administrator or expiry override |
| `disputeMode: fixed-arbiter` | Both parties may settle; otherwise the arbiter committed at creation chooses release or refund | A compromised arbiter can favor either party; unavailable arbiter plus noncooperation can lock funds |

An arbiter cannot change amount or destination, split funds, replace itself or bypass the release
time lock. Different addresses do not establish independent operators. Refunds before a dispute
require both parties; after a dispute they use the selected resolution authority. The model
contains no buyer-only refund, administrator, emergency pause, recovery role or arbitrary call.

## Transition inventory

All accepted transitions consume exactly one stage nonce and require nondecreasing canonical
inclusion time. The initial `Created` state has no funds. Funding assumes an exact-value token
transfer succeeds atomically. Direct donations, partial funding, fees, rebasing and transfer-tax
tokens are outside this model, not silently accepted token behavior.

| Current state | Command | Preconditions and authority | Result |
| --- | --- | --- | --- |
| Created | fund | Buyer; exact committed positive amount | Funded; full amount enters modeled balance |
| Funded | submit | Seller; evidence commitment | WorkSubmitted; fixes `releaseAt = inclusionTime + disputeWindow` |
| Funded or WorkSubmitted | refund | Buyer and seller | Refunded; full amount goes to committed buyer destination |
| WorkSubmitted | dispute | Either party; `inclusionTime < releaseAt` | Disputed; ordinary release/refund paths are frozen |
| WorkSubmitted | release | `inclusionTime >= releaseAt`; both parties in mutual mode, permissionless in timeout mode | Released; full amount goes to committed seller destination |
| Disputed | resolve | Both parties, or fixed arbiter when configured; release still requires `inclusionTime >= releaseAt` | Resolved; full amount goes to the chosen committed destination |
| Released, Refunded or Resolved | any | None | Rejected; no second payment |

Every unlisted state/command pair rejects. A second submission cannot reset the clock. At the
exact boundary, release is eligible and a new dispute is closed. The stage remains disputed
until a resolution is admitted; passage of time does not create an undisclosed fallback.

## Authorization and replay assumptions

`statement()` is an abstract authorization request. It binds chain, escrow identity, token,
parties, both destinations, amount, terms commitment, both authority modes, fixed arbiter,
dispute window, action payload, stage nonce, admission deadline and prior state snapshot.
Its SHA-256 snapshot is only a deterministic model identifier. It is not an EIP-712 domain,
ABI encoding, signature digest, canonical on-chain hash or recommended signing interface.

The supplied synchronous verifier accepts only the literal result `VALID`. Wrong signer,
duplicate or missing signer, mismatched statement, expired admission, invalid result, thrown
verification and asynchronous result all reject atomically. It represents an authentication
oracle; it does not implement ECDSA, ERC-1271 `staticcall`, return-data limits or reentrancy safety.
Unknown identities are opaque bounded labels, not validated EVM addresses or code identities.

Inclusion time is supplied by the caller and is not part of the signed action payload. It models
canonical admission, not a timestamp selected by a wallet or proof server. The signed deadline
still bounds admission. Permissionless timeout execution has no signature deadline and does
not revalidate earlier signatures. `replay()` requires the caller to provide the complete,
ordered canonical history and an appropriate verifier; it neither queries nor verifies a chain.
After a reorg, rebuild from the canonical prefix. Orphaned release or submission is discarded;
resubmission fixes a new release time and changes the statement for any later release.

Only states created by this model and unchanged snapshots of those states are valid inputs.
There is no untrusted state-import parser. Runtime object mutation, malicious verifier closures,
transaction inclusion, finality, consensus and token execution are outside the model boundary.

## Conservation argument and executable evidence

For every reachable state, `funded = balance + released + refunded` with exact unsigned 256-bit
integers. Initially all four values are zero. Only funding changes `funded`, once, to the
committed amount and adds the same amount to `balance`. Submission and dispute move no value.
One terminal transition sets the full balance to zero and adds that amount to either `released`
or `refunded`, recording one transfer to the matching committed destination. Terminal states
have no successors. Rejection changes no state. These cases preserve conservation, destinations
and at-most-once payout by induction. This argument assumes the modeled exact-value transfer;
it does not prove Solidity or token behavior.

Run with Node >=22 and no external dependencies:

```sh
node --test --experimental-test-coverage scripts/experimental/milestone-escrow/model.test.mjs
node --check scripts/experimental/milestone-escrow/model.mjs
node --check scripts/experimental/milestone-escrow/model.test.mjs
```

The 19-test suite covers all 42 state/action pairs, exact funding, deadline boundaries,
authority variants, duplicate/failed verification, nonce/domain/payload replay, overflow,
atomic failure, terminal finality and canonical replay. Deterministic finite exploration checks
15,444 attempted transitions and 396 reachable states across the four variants, including
different inclusion delays. This is bounded exploration, not a universal protocol proof.
The suite deliberately demonstrates mutual-consent deadlock and the power of a compromised
arbiter instead of asserting liveness or fairness that the policies do not provide.

## Remaining acceptance decisions and work

1. Accept a separate custody/dispute ADR, exact authority choices and what happens when keys,
   counterparties or the arbiter are unavailable. A requirement of guaranteed finite exit
   conflicts with mutual-only resolution; it needs an explicit additional rule and threat model.
2. Define token allowlist, exact-transfer checks, unsolicited transfers, fees, deposit/expiry
   policy, initialization/factory authentication and unsupported-token recovery without adding
   an unapproved administrator. Preserve the no-admin and no-shared-project-id constraints.
3. Specify and review real EIP-712 domains/types, nonce storage, canonical state commitments,
   EOA/ERC-1271 signatures, bounded callbacks and reentrancy protections; implement a separately
   audited contract refinement and malicious-token tests only after the authority decision.
4. Define independently derived stage contexts, bounded encrypted manifests, mandatory backup
   verification, user consent, broadcast/reorg recovery and chain/deployment verification.
   Existing invoice, backup and encryption modules are candidates for reviewed reuse; this model
   does not claim those escrow workflows exist.
5. Complete independent contract/security review, testnet and browser qualification and verified
   deployment evidence before any production fund path. No deployment, audit or release is claimed.
