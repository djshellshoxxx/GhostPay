# Deadline, timelock and chain assumptions

Review date: 2026-11-18 (America/Los_Angeles). This review preserves the current
`packages/contracts/src` tree `dabfd36a98424a4184ee7e267e12815763d1157f` and the existing
expiry/Factory regression suites. It does not qualify a live deployment or accept a chain's
operational risk. Compiler/analyzer identities and fresh results are recorded separately in the
closure evidence.

## Contract behavior verified in source and regression tests

Sweep, withdrawal-request and destination-proposal deadlines are inclusive: an otherwise valid
signed action may be accepted at `block.timestamp == deadline`, and is rejected after it.
Authorization, domain separation and nonce consumption remain required. Removing timestamp
checks would remove a signed-order protection; no such change is proposed for SWC-116.

A withdrawal deadline bounds submission/acceptance of the signed request. It is not an expiry
for executing an already accepted withdrawal. The withdrawal delay starts at acceptance, and a
destination change matures after twice the configured delay. The Factory minimum delay is one
hour. These are intervals in chain timestamps, not guarantees of a wall-clock cancellation
opportunity or transaction inclusion.

Authenticated cancellation remains possible while a request/proposal is pending, including after
its maturity time. Once execution is eligible, cancellation and execution can race for inclusion.
No documentation should imply an automatic cancellation cutoff at maturity or guaranteed ordering.

The signed Withdraw structure does not bind a destination at signing. Acceptance captures the
then-current destination. An accepted request blocked by rotation from A to B can become eligible
again after B to A, because execution compares destination equality rather than a rotation epoch.
These documented P3 limitations retain existing owner authorization. A destination/epoch-bound
signature redesign requires a separate compatibility and policy decision.

The original `MythrilExpiryDispositions.t.sol` suite covers boundary/replay/signature/domain and
timelock/cancellation behavior. Its model traces show timestamp-dependent branches; they do not
demonstrate unauthorized transfer. Findings absent from one bounded symbolic run are not proof
that other timestamp-dependent functions were explored.

## Chain-specific constraints

These are primary-source constraints checked on the review date, not blanket support approvals.
The deployment script's built-in testnet list and an operator's `ALLOWED_CHAIN_IDS` are admission
controls, not certification of chain timing, finality or censorship assumptions.

| Chain family | Verified external constraint | Consequence for this review |
|---|---|---|
| Ethereum proof of stake, including Ethereum testnets | Consensus validates execution-payload timestamp against the slot's computed time. See [Ethereum consensus specification, execution payload processing](https://github.com/ethereum/consensus-specs/blob/master/specs/bellatrix/beacon-chain.md#execution-payload). | A proposer cannot freely choose another valid timestamp for the same slot. Inclusion delay, skipped slots and reorganization remain distinct issues; the contracts do not promise timely inclusion. |
| OP Stack chains using the cited derivation rules | Timestamp advances by the configured L2 block interval and is constrained by the L1 origin. Fjord sets maximum sequencer drift to 1,800 seconds; empty-batch rules apply when the ordinary bound is exceeded. See [derivation](https://specs.optimism.io/protocol/derivation.html#overview) and [Fjord](https://specs.optimism.io/protocol/fjord/derivation.html). | This drift is a relation to an L1 origin, not a guaranteed cancellation or wall-clock accuracy budget. Check the actual chain's active forks and parameters before using it in a deployment assessment. |
| Base after Denim | Base documents mainnet activation on November 5, 2026 and Sepolia on October 21, 2026. Native blocks use a 200 ms cadence, while EVM `block.timestamp` remains in whole seconds. Its rollup implementation selects a six-hour maximum sequencer drift after Denim. See [Base upgrade documentation](https://docs.base.org/upgrades/denim/overview) and [Base rollup configuration](https://github.com/base/base/blob/main/crates/common/genesis/src/rollup.rs). | Do not apply an old two-second block-count assumption or a generic OP/Fjord 30-minute parameter to current Base without checking its own rules. GhostPay's second-based comparisons are unchanged; no live Base timing/availability qualification was performed. |
| Arbitrum | Official documentation describes nondecreasing sequencer timestamps with stated bounds of 24 hours in the past and one hour in the future. Force-included messages use the greater of the inbox timestamp and the previous child-chain timestamp. See [Arbitrum block timestamps](https://docs.arbitrum.io/arbitrum-essentials/arbitrum-vs-ethereum/block-numbers-and-time#block-timestamps-arbitrum-vs-ethereum). | Do not infer a wall-clock reaction guarantee from the Factory's one-hour minimum. Verify deployed chain configuration, inclusion paths and operational assumptions separately. |
| Polygon and any other admitted EVM chain | No chain-specific timestamp, sequencer/validator or forced-inclusion configuration was qualified in this work. | Adding a chain ID is insufficient evidence for policy-scheme activation. Keep that deployment decision pending a chain-specific review. |

These sources describe different mechanisms. The review does not add their numerical bounds
together or convert a bound relative to an L1 origin into a free sequencer clock adjustment.
Source URLs track upstream documents; changes to chain forks, consensus parameters or inclusion
mechanisms require re-review. No production RPC endpoint or deployed Factory was supplied for
configuration readback.

## Address identity is separate from signature identity

[EIP-1014](https://eips.ethereum.org/EIPS/eip-1014) derives a CREATE2 address from the deployer,
salt and init-code hash; chain ID is absent. Thus equal deployer, implementation/init-code and
salt can yield the same address across chains. The Factory NatSpec's broader statement that any
different chain necessarily gives a different address is not a valid general guarantee. EIP-712
chain/contract domain separation protects the signatures, a different property tested by the
expiry suite. This correction is recorded here while preserving the runtime source for analysis.

## Decisions retained for the owner

Any finding exception must name the exact reviewed finding/source/configuration. It does not
approve a live chain, a short signing deadline, the one-hour minimum as a wall-clock guarantee,
or a fee-token deployment. The owner should separately decide whether to retain P3 destination
semantics and which chain-specific liveness/timing assumptions are acceptable. None of those
decisions is inferred from the engineering authorization.
