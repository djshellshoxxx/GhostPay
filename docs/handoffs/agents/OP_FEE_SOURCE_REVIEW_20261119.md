# Independent OP fee source review — 2026-11-19

## Review result and source

Reviewer: `contract_security`, independently of `workflow_fixes`' implementation.
The OP fee-accounting runtime at
`0aef3a254da123c4ec2d873bc0490cf22c739709` passes the scoped source review: no
blocking new fee-accounting, signing-authority, reservation or privacy defect
was identified. Runtime files remain identical through test checkpoint
`0b7fbfbaedaef688ce337f1ecfe3d7940bdfa4da` and documentation checkpoint
`6d23e5b69bf6b2c4a56b2a4527d64aa6fa74aad5`.

A separate inherited receipt-status defect was reproduced during this review.
The coordinator assigned its correction within the existing receipt-validation
scope. That narrow repair at
`2af11e3816d3b9de93df5fab4d35e39c68447a9b` now also passes independent source
review, with 97/97 passing in its final focused selection. The subsequent
TypeScript argument-expression correction at
`de253aaf7f4139c8778b73cd7a9e052f9438e91e` is independently reviewed as preserving
the same runtime requests. Complete repository/static qualification remains a
separate gate.

The [source/probe manifest](evidence/op-fee-source-review-20261119/manifest.json)
records exact Git blobs and SHA-256 hashes for the reviewed runtime, surrounding
validation, journal, loss-budget and chain-catalog sources, plus tests and docs.
The [machine review](OP_FEE_SOURCE_REVIEW_20261119.json) separates accepted
invariants, the reproduced residual, worker-reported checks and reviewer work.
No files in the implementation owner's worktree were edited.

## Fee envelope and signature accounting

The quote does not yet have a final order nonce, deadline, authorization
signature or optional permit. The helper therefore bounds the size of the
unsigned legacy transaction, rather than pricing the compression of a
zero-filled hypothetical transaction. Sweep authorization signatures are
exactly 65 bytes under existing admission rules; the remaining ABI fields have
fixed width. A permit-capable token selects the larger shape. RLP framing,
destination, zero native value, chain ID and EIP-155 signing fields are included;
the variable transaction integers have conservative 32-byte bounds.

After signing, `checkSigned` parses the actual legacy transaction, requires the
configured chain ID and signature fields, and reconstructs its unsigned RLP
from those exact fields. It submits the unsigned bytes to `getL1Fee`, allowing
the oracle to add signature overhead once. This matches the inspected
[GasPriceOracle source at 06de20f1](https://github.com/ethereum-optimism/optimism/blob/06de20f199ebf615649bc0f9caf4c1cd176c1e8a/packages/contracts-bedrock/src/L2/GasPriceOracle.sol):
the size estimator and Fjord fee path account for unsigned inputs. The source
is Git blob `ab6cdcf80c4fe4336aa0711d91982bc282c96f77`, independently fetched for
this review.

Both additional fee components receive the existing twofold reserve margin.
The helper does not duplicate an Isthmus/Jovian numeric formula: it asks
`getOperatorFee` for the actual signed gas limit before broadcast. Missing,
reverting or malformed getters cause refusal. A real zero result is accepted.
This deliberately requires supported getters rather than inferring a fork or
zero fee from an exception.

The upper-size oracle is a practical compression estimate, and the twofold
margin is policy. Neither guarantees arbitrary future fee movement. The docs
at `6d23e5b6` preserve those limits and separate public OP-chain acceptance from
local controlled transports.

## Reservation, final guard and settlement

| Boundary | Reviewed behavior |
|---|---|
| Quote | Execution cost plus additional reserve enters the existing token conversion and sponsor-fee policy. Cache/coalescing is bounded to two shapes per configured chain. Independent oracle-failure streaks cannot be cleared by healthy gas-price reads. |
| In-lane pricing | Each simulation obtains a fresh reserve for the actual selected entrypoint. If permit fallback drops the permit, that smaller actual shape is used. Quote cache is not reused for sends. |
| Admission | Both fee-coverage checks include extra fees. Daily and loss budgets reserve `gasLimit × signed gasPrice + extra` before nonce acquisition. Existing fee caps and signed quote fields are unchanged. |
| Signed transaction | The exact-byte fee recheck precedes the synchronous signed-hash journal hook and RPC broadcast. The held reserve cannot silently increase. An insufficient reserve or failed lookup is a definite pre-handoff refusal. |
| Final freshness | Order and feed deadlines are checked again in the final synchronous hook after the new asynchronous reads. The persisted signed hash remains derived from the actual raw transaction. |
| Ambiguous outcome | A possibly broadcast transaction keeps its reservations and nonce-reconciliation state. Failed/missing OP fee data in a receipt remains unsettled through the immediate, late-receipt and unknown-send paths. |
| Actual cost | Settlement uses execution gas at the signed legacy gas price, receipt L1 fee and operator fee for actual gas used. It does not apply the reserve multiplier a second time. |
| Overages | `DailyBudget.settle` records same-day actual cost above the held reserve even beyond the configured cap; remaining capacity is zero. Existing `LossReservation.settle` also records actual reverted cost above its estimate. |
| Rollover | Existing day/window rules remain: a prior-day daily settlement cannot debit or refund new-day reservations; the loss-budget implementation separately attributes late losses under its established window rules. |
| Privacy and authority | No owner, destination, token, amount, fee, signature or raw transaction is added to the journal/log schema. No signing domain, contract order, wallet authority, dependency or provider is added. |
| Non-OP | Estimation returns zero and signed/receipt helpers make no oracle requests. Valid non-OP transaction pricing and receipt behavior remain execution-only. |

The reservation model remains an admission estimate rather than a hard cap on
future chain-imposed cost. Recording an overage after inclusion prevents it
from being silently omitted from subsequent budget decisions.

## Receipt block and fee validation

The chain client checks the receipt transaction hash against the requested
hash. For OP receipts it requires bounded nonnegative L1 fee and gas-used
values, validates the block-hash shape, and queries the operator fee with
`{ blockHash: receipt.blockHash, requireCanonical: true }`. That binds the read
to the receipt block instead of whatever block is latest. The installed viem
2.57.19 call implementation supports that EIP-1898 request shape; the worker's
controlled transport test asserts the actual wire parameter.

The independently inspected
[op-geth state transition at 79e9d244](https://github.com/ethereum-optimism/op-geth/blob/79e9d244748a1201fe686ca8a882b5fe7e173348/core/state_transition.go)
computes effective operator cost with the same gas-used value it returns in
the execution result, and refunds the difference from the gas-limit cost.
Its Git blob is `d8c52238c610d85fe92f6ed6e07aafe99afa13fd`. This supports using
receipt gas usage for the operator lookup rather than charging the entire
pre-execution reserve. The generic production viem receipt formatter preserves
the extra `l1Fee` field; the helper handles a canonical RPC quantity or an
already formatted bigint.

Canonicality is checked by the configured RPC at the time of the lookup.
Neither this change nor this review establishes independent RPC honesty,
future finality, oracle deployment identity, availability of historical state,
or acceptance on a real OP network. Missing support refuses or leaves the send
unsettled; it is not silently treated as zero.

## Reproduced inherited issue: receipt status

**ID:** `R07-RECEIPT-STATUS-1`. **Severity:** Low; malformed-response robustness
and accounting classification. **Owner:** `workflow_fixes`, explicitly
authorized by the coordinator to correct it within the R07 receipt scope.
**Status:** corrected and independently reviewed at `2af11e38`, with the
focused final source qualification recorded below.

At both the pre-implementation `a6bcaf38c4aa1f1dfc21e593816b4ac1a980ab1e`
checkpoint and runtime `0aef3a25`, `createViemChainClient.getReceipt` accepts a
receipt whose status is missing or unknown, if the other required coordinates
and fee fields are present. The production viem formatter maps missing status
to `null` and unknown `0x2` or noncanonical `0x02` to `undefined`. Those values
survive the client's return type assertion.

At the initial checkpoint, the service tested only timeout and OP fee
completeness before settlement, then used `status === 'success'` to choose
success; any other value fell into the
mined-revert branch. Source tracing shows an incomplete receipt can therefore
be removed from pending bookkeeping and attributed as a mined loss/owner
strike rather than retained for later valid receipt data. The OP cost fields
are still counted. This did not reproduce a new fee omission or refund bypass,
and it predates the OP change, but it is a concrete invalid-input acceptance
defect.

The independent [probe result](evidence/op-fee-source-review-20261119/op-receipt-status-probe.json)
retains eight cases: a valid `0x1` control plus missing, `0x2` and `0x02` status
for both exact source checkpoints. It records source hashes, Node/viem versions
and actual client results. The
[original harness](evidence/op-fee-source-review-20261119/op-receipt-status-probe.mjs)
transpiles the pinned source into its own scratch directory and uses only a
fake transport. It does not sign or broadcast a transaction, access a real RPC,
edit the owner's workspace, run a package test suite or perform a TypeScript
typecheck. Exit was zero under a 256-MiB Node cap and the shared qualification
mutex. Original harness paths are retained as raw evidence.

The worker first committed the independent regression set at
`f3c0c795c7f9366cde982dc8e28e0cc1dd6870c2`. Its
[RED command receipt](evidence/op-fee-source-review-20261119/op-receipt-status-red.json)
and [raw log](evidence/op-fee-source-review-20261119/op-receipt-status-red.log)
show **16 failed, 8 valid controls passed and 38 unselected**, exit 1. The
negative cases cover missing, null, `0x2` and `0x02` across both receipt methods
and both OP/non-OP chains. Valid success and reverted controls remain explicit.

Repair `2af11e38` adds `isMinedStatus`, which accepts only literal `success` or
`reverted`. Both lookup and wait check that predicate after transaction-hash
binding and before the OP fee helper. Invalid lookup throws the existing fixed
`rpc_failure`; invalid wait returns the existing timeout summary. Reservations
therefore remain unsettled rather than being classified as mined loss.
Independent final-delta source review: **PASS**. There is no change to signing,
fee calculation, budget formulas, journal contents or valid non-OP behavior.

The implementation owner's
[GREEN command receipt](evidence/op-fee-source-review-20261119/op-fees-final-targeted.json)
and [raw log](evidence/op-fee-source-review-20261119/op-fees-final-targeted.log)
bind **97/97 passed**, exit 0, 19.589 seconds to exact source `2af11e38`.
The selection includes all 62 OP/status cases plus chain, restart and required
Anvil files. The reviewer inspected those receipts; the reviewer did not rerun
the package selection. `R07-RECEIPT-STATUS-1` is closed in the scoped runtime
and tests, with final repository qualification still separate.

## Subsequent TypeScript call-shape correction

The package build exposed that the optional object spread used in `opFees.read`
did not satisfy viem's TypeScript discriminated union. Commit `de253aaf` changes
only that argument expression to whole-object branches. For an undefined block
hash the argument remains `{ to, data }`; otherwise it remains
`{ to, data, blockHash, requireCanonical: true }`. Independent source review:
**PASS**, with no change to runtime fields, canonicality, ordering, request
count, validation or fallback behavior. Its exact source hash is retained in
the manifest. The 97-test receipt predates this type-expression correction and
is not relabeled as execution at the later source; its build/static evidence
belongs in the implementation owner's packet.

## Qualification boundary

The reviewer inspected the full changed runtime and surrounding reservation,
validation, journal, RPC formatter and OP primary sources. The reviewer also
executed the independent eight-case status probe and reviewed the actual
status RED/final focused GREEN receipts above. The earlier author full relayer
run at `6d23e5b6` passed 556/556 with unchanged coverage thresholds and measured
96.98% statements, 92.92% branches, 98.2% functions and 98.77% lines. That is
pre-status-fix evidence, not a full-suite pass at the final source. Its original
296.016-second command/log remain owned by the implementation worker's packet.
Later build/static qualification remains separate, and earlier resource-killed
static attempts are not converted into passes by this review.

No production OP-chain, external RPC, deployment, full repository, new fuzz or
independent external audit qualification is claimed. This document records an
independent team source review, not a merge or release approval.
