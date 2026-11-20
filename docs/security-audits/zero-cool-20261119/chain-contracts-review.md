# Chain adapter and core contract review

## Completed scope

All **44 unique path/blob versions across 41 paths** assigned to the `chain-adapters` and `contracts` domains have been read. These correspond to **328 path/ref appearances** across the eight pinned source snapshots. `chain-contracts-coverage.json` records each exact blob, commit and source alias; every entry is `reviewed`, with no pending source. Identical files were reviewed once. The three alternate deployment, payment-evidence and RPC versions were reviewed through a complete baseline followed by their complete diffs.

The review covered all five core contract implementations and five interfaces; transaction and signature construction; ABI declarations; deployment validation and signature checking; RPC transport and reconciliation; announcement parsing, pagination and reorganization handling; payment evidence; fee and price calculations; and registry, delegated registry and ENS helpers. Supporting browser call sites were inspected where deployment applicability or privacy behavior required them.

This was a defensive source review. No source repair, exploit construction, reproduction, application test, contract test, network probe, transaction or deployment was performed. Prior audit documents were used to identify known findings, not as evidence that their historical tests pass on these snapshots. Only this worker's three audit-note files were written. Remote publication remains blocked by the coordinator's recorded automatic-review decision.

## Confirmed residual issue

### ZC-CHAIN-01 — Policy-account buffer can be permanently stranded

**Severity:** Low. **Confidence:** High from source. **Status:** Known residual issue, previously recorded as `CONTRACTS-CORE-01`; not a new discovery. **Applicability:** Supporting experimental contract/API, with no enabled production policy deployment established.

`GhostPayPolicyRouter.payERC20WithBuffer` sends the native buffer to the policy account address. The owner EOA does not receive it. `PolicyAccount` only releases native value through a delayed withdrawal to the configured destination; when `limitsRoot` is nonzero, the withdrawal must prove a native-asset leaf. A policy containing no such leaf provides no path to withdraw the buffer. The contract has no rescue path. Where a native leaf exists, withdrawing to the destination still does not directly supply the owner EOA with transaction gas.

The exposure requires use of the policy router's buffer entry point and a policy that cannot withdraw the native asset. It does not let a third party redirect the value. The buffer is bounded by the caller-selected `maxBufferWei`, but that bound does not make the recipient capable of using it.

**Evidence:** Main `c977b5d6723f6822c3b5d86cd6b231712c53c395`, `packages/contracts/src/GhostPayPolicyRouter.sol:161–177` (blob `56f5ef6ef90c6441812f3695da55916ecce352c4`), `packages/contracts/src/PolicyAccount.sol:155–191` and its withdrawal path (blob `1e5eeadfe7ba6e2a68f64e95ef1ca84afe12cbf4`). Both contract blobs are identical on all eight selected refs. The exported `packages/policy-scheme/src/router.ts` still exposes buffer construction on main and release. The browser `preparePolicyPayment` does not supply a buffer, `PINNED_POLICY_DEPLOYMENTS` is empty, and the feature also requires the experimental build flag. Those gates prevent this source finding from being presented as a currently enabled Pages payment-loss path.

**Remediation:** Remove or refuse the buffer entry point for policy accounts unless its semantics are deliberately redesigned. Do not describe native funds deposited into the account as gas available to its owner. If retaining the API, require an explicitly supported native-withdrawal policy and show the destination, delay and funding limitation before authorization. A future contract change requires new deployment and client/manifest coordination; existing immutable deployments cannot be patched in place.

**Regression guidance:** Add ordinary local contract assertions for policies with and without a native leaf, and assert that the client cannot offer an unusable owner-gas buffer. No such check was executed here.

## Residual limitations and hardening observations

These items are recorded separately from the confirmed security finding above. They are not additional claims of reachable fund theft, signature forgery or authentication bypass.

| ID | Observation | Disposition and action |
|---|---|---|
| ZC-CHAIN-O01 | EVM receipt verification still makes match-specific RPC reads by default. | Applies to all eight refs. Main and the main-based ERC-20 snapshot have no bulk-evidence helper. The other six add opt-in cover reads, but `DEFAULT_SCAN_PRIVACY.bulkEvidence` remains `0`; the API intentionally retains per-match reads when disabled. A provider can associate the requested transaction evidence with the scanning session. Treat this as a disclosed privacy tradeoff, and do not describe the newer branches as eliminating it by default. |
| ZC-CHAIN-O02 | Native buffer value is outside the router's token fee and metadata accounting. | Both routers forward `msg.value` without an additional fee on the buffer, while their announcement metadata describes the ERC-20 leg. This existing protocol exception was previously `CONTRACTS-CORE-02`; current source explicitly documents the buffer as fee-free. Consumers must not treat an ERC-20 announcement as a complete account of every native-value movement in the transaction. A product decision is required before imposing a protocol-level cap, charging a separate fee or extending the metadata format. |
| ZC-CHAIN-O03 | A nonzero factory fee can be configured with a fee-token address lacking code. | The factory constructor requires a nonzero fee-token address but only checks code presence on the implementation. `_collectFee` later performs token reads, so an unusable fee-token contract can prevent account deployment, including access to prefunded counterfactual accounts. This is the known `CONTRACTS-CORE-03` deployment-configuration hazard, not an unprivileged configuration change. Preserve deployment-script code checks and consider enforcing the invariant in the constructor for a future deployment. |
| ZC-CHAIN-H01 | Payment calldata decoding omits an independent buffer-value-versus-cap rejection. | `decodePaymentCalldata` decodes `maxBufferWei` but does not reject `tx.value > maxBufferWei`. The builder already checks that relation; the on-chain router also rejects it. No active untrusted-calldata authorization bypass was established. For a more faithful general-purpose preview API, validate the decoded cap independently. |
| ZC-CHAIN-H02 | Main's generic RPC transport leaves ambient fetch policies implicit and accepts non-finite retry configuration. | Main and ERC-20 use the older transport. The other six explicitly omit credentials/referrers, disable caching, and normalize non-finite retry counts to zero. Main's Pages HTML already sets `no-referrer`, so the missing per-request option alone is not evidence of an active referrer leak. Retry options are programmatic configuration; no untrusted browser input supplying `NaN` was established. Keep the existing newer hardening when integrating branches. |
| ZC-CHAIN-H03 | The factory source comment overstates CREATE2 chain separation. | `PolicyAccountFactory` predicts a clone from implementation, salt and deployer, without including chain ID in that address formula. Identical deployment inputs on two chains need not give different addresses. This is a documentation correction: the account's EIP-712 signatures do separately bind chain ID, and the reviewed browser policy verifier checks its selected chain. |

### Privacy evidence and limits

For ZC-CHAIN-O01, the main `apps/web/src/lib/scanClient.ts:386–401` calls `verifyClaimedPayment` for each matched claim; main `packages/chain-adapters/src/payments.ts:284–293` reads that claim's receipt and transaction. On release `417f7c71daf8645e1432f2ec8f070110879b80bd`, `scanClient.ts:469–505` uses `selectEvidenceTargets` and `fetchRouterEvidence` only when bulk evidence is enabled. `apps/web/src/lib/scanPrivacy.ts:60–80` explicitly documents that zero retains per-match reads and sets zero as the default.

The new helper keeps every matched transaction and fills the selection with other page transactions. It is a target count, not a hard cap: an unusually large set of matches can exceed it. Reading every router transaction on a page conceals the selection within that page; repeated partial selections can still narrow the likely matches. The source and the English settings hint describe that limitation. Do not count this as the same claim as the corrected BTC/Solana/TRON automatic balance-query behavior, and do not count it twice if another reviewer records the EVM integration.

### Additional source anchors

- ZC-CHAIN-O02: `GhostPayRouter.sol:132–146`, `GhostPayPolicyRouter.sol:161–177`, and their `_checkMetadata` calls; identical across the selected refs.
- ZC-CHAIN-O03: `PolicyAccountFactory.sol:76–93,128–168`; blob `d456eec25c744e1e992ca786b2f21eefdbdf81a7`, identical across the selected refs. `packages/contracts/DEVIATIONS.md` P16 documents the deployment-script fee-token code requirement; this audit did not execute deployment scripts.
- ZC-CHAIN-H01: `packages/chain-adapters/src/router.ts:251–257,286–299`; blob `2ee7bbdb7832797ce128b71ee31030620e04fabb`, identical across the selected refs. The builder checks the cap at lines 180–183.
- ZC-CHAIN-H02: main RPC blob `60b3505d3bc62089afd1ed4741bea29273ebea8a`; newer blob `1c8d1edc486c70b7ea7fee96ec62c57af00e421e`. The only production changes in this file are the three explicit fetch policies and retry normalization. The deployment parser also gains a real-calendar-day check in the newer six snapshots; that is input-validation hardening without a new payment-integrity finding here.
- ZC-CHAIN-H03: `PolicyAccountFactory.sol` header and `predictAddress`; the clone initialization and signature domains were read in full in `PolicyAccount.sol` and its interface.

## Invariants examined without an additional confirmed defect

The core contracts authenticate sweep and policy orders with chain/contract-bound EIP-712 domains, consume unordered nonces before external calls, and use nonreentrant value-moving entry points. The policy initializer authenticates the CREATE2 deployer/parameters and locks the implementation. Exact token balance deltas reject unsupported transfer behavior. Native sends avoid copying return data. Policy requests capture their destination at acceptance and refuse execution while the current destination differs. The source explicitly does not promise recovery from a lost owner key.

The adapter checks enabled chain, invoice/deployment/client consistency, allowlisted assets, fee arithmetic, canonical payment encoding and preview identity. Receipt verification requires the direct router transaction, successful receipt, exact announcement, canonical block and amount/asset evidence; a balance alone is not credited as payment. The log scanner distinguishes provider faults from malformed public announcement content, bounds accepted work, validates event blocks, and rechecks processed window boundaries. Independent-provider comparison detects disagreement but cannot establish honesty if both sources share a backend or collude.

Manifest signatures are relative to release keys in the obtained bundle. Runtime code hashes authenticate the chain's code relative to the trusted manifest, not the provenance of the bundle itself. The two deployment-verification helpers have different scopes; the generic structured helper checks the policy factory, while the active experimental policy verifier additionally pins implementation, router and announcer code and configuration. The separate policy path's complete pins were inspected; a missing check in an unused generic helper was not promoted to an active policy bypass.

Registry delegation builds frozen public snapshots and delegates explicit signing and authorization validation to caller-provided boundaries. Lookup and ENS paths use the selected RPC and reject malformed values; code-presence probes are not runtime-code authentication. No new authorization bypass was confirmed in these reviewed helpers.

## Validation and handoff

Every `(path, blob, commit)` relationship in this worker's coverage was checked with Git object identity. The 44 entries reconcile exactly to the assigned inventory and contain no pending rows. No dynamic correctness or exploit claim is made. See `chain-contracts-handoff.md` for consolidation guidance.
