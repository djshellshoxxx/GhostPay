# P17 — Privacy-preserving fee settlement outputs

> **Specification only.** Documentation and branch creation authorized on 2026-11-19. Implementation, merge, activation, deployment and release are outside this task. Default disabled. No executed-test or qualification claim.

| Field | Value |
|---|---|
| Module | `P17` / `private-fee-outputs` |
| Branch | `future/p17-private-fee-outputs` |
| Baseline commit | `c977b5d6723f6822c3b5d86cd6b231712c53c395` |
| Source tree | `2634456ffa35681e799f71b72bb907f946a77618` |
| Hard dependencies | [P14](https://github.com/djshellshoxxx/GhostPay/blob/future/p14-shielded-payments/docs/future/modules/P14-shielded-payments/SPEC.md), [FEE01](https://github.com/djshellshoxxx/GhostPay/blob/future/fee01-modular-fee-policy/docs/future/modules/FEE01-modular-fee-policy/SPEC.md) |
| Optional integrations | None |
| Shared contracts | [COMMON.md](../COMMON.md); [inventory](../README.md) |

All API sketches are proposed, not current exports. Common types are `OperationContext` (operationId/sessionEpoch/signal/deadlineMs), `ModuleResult<T>`, `CapabilityDescriptorV1`, and opaque nonserializable `SecretHandle`. Use bigint internally and bounded decimal strings in JSON.

## 1. Research objective and provenance

Determine how a compatible shielded settlement protocol can pay an explicitly authorized fee output without unnecessarily publishing a direct merchant-payment-to-publisher-revenue link. Preserve exact fee consent and value conservation. Private fee settlement is a scoped property, not a universal promise that operators, recipients or chain observers cannot correlate transactions.

Sources: [issue #284 P17 and per-feature pricing](https://github.com/djshellshoxxx/GhostPay/issues/284), its [P19 owner addendum](https://github.com/djshellshoxxx/GhostPay/issues/284#issuecomment-7020857691), and [architecture 5j](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/docs/future/privacy-architecture/5j.md). FEE01 owns the accepted quote/schedule/recipient authorization; P14 owns compatible settlement and proof rules. P17 chooses neither rates nor recipients.

## 2. Existing implementation and remaining gap

- [Current protocol fee math](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/chain-adapters/src/fees.ts) is existing baseline policy; preserve it until an explicit owner-approved change.
- [External-pool exports](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/external-pools/src/index.ts) exposes `assertAccounting` and `feeFloor`; use accounting conventions only after checking their precise existing semantics.
- [Pool SDK](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/pool-sdk/src/index.ts) exports `commitment`, `nullifierHash`, `encodeWithdrawal`, `contextOf`, `maxFee`, `assertSignals`, and encrypted note-storage helpers.
- [Pool relayer](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/pool-relayer/src/index.ts) exports `quoteFee`, `minAcceptableFee` and `feeCap`; these are retained testnet service rules, not an approved future modular price schedule.
- [Pipeline fee assumptions](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/privacy-pipeline/src/steps.ts) is historical composition logic to reconcile, never a second source of new fee authority.

The missing work is an accepted private-output protocol/recipient-key model, proof-bound quote integrity and independently measured revenue-linkage behavior. No current confidential fee mechanism or production proof is claimed.

## 3. Scope and key authority

Own fee-output preparation/validation adapters and the relationship between an accepted quote and the exact settlement output. Exclude pricing, discounts, fee composition, publisher payout policy, new pools, remote provers and customer custody. No optional future dependencies are required.

Publisher keys may decrypt or spend **only the publisher's own authorized fee output**. They cannot derive customer notes, sweep customer balances, change destinations, recover customer keys or hold customer exit permission. Separate fee-receiving, release-signing and service-authorization keys. User witnesses remain client-side.

## 4. Proposed data and API

```ts
interface PrivateFeePlanV1 {
  version: 1; quoteDigest: string; policyVersion: string;
  settlementProtocol: string; protocolVersion: string;
  asset: AssetRefV1; amountAtomic: string;
  recipientCommitment: string; recipientKeyVersion: string;
  operationDigest: string; outputCommitment: string;
}
interface PrivateFeeReceiptV1 {
  version: 1; planDigest: string;
  status: 'prepared' | 'pending' | 'verified' | 'reorged' | 'unknown';
  settlementEvidenceRef?: string;
}
interface PrivateFeeProvider {
  prepare(quote: AcceptedFeeQuote, settlement: SettlementContext,
    ctx: OperationContext): Promise<ModuleResult<PrivateFeePlanV1>>;
  verify(plan: PrivateFeePlanV1, evidence: unknown,
    ctx: OperationContext): Promise<ModuleResult<PrivateFeeReceiptV1>>;
  capability(): CapabilityDescriptorV1;
}
```

The quote supplies exact module lines, asset, amount, caps, rounding and recipient commitment; P17 must not recalculate prices differently. Bind operation, policy, recipient key version, output commitment and protocol domain in the reviewed proof/public inputs. Minimize publicly revealed quote metadata without weakening enforceability.

## 5. Lifecycle and conservation rules

1. Confirm P14 supports a fee output with the required confidentiality and verification properties.
2. Validate FEE01's accepted quote and independently authenticated recipient authorization.
3. Create fresh output randomness locally; never reuse customer note secrets or a stable payer identifier.
4. Produce the fee output as part of the authorized value-conserving settlement operation where the protocol supports atomicity.
5. Verify input value equals customer outputs, exact authorized fees and other declared protocol terms for each asset.
6. Confirm settlement using canonical evidence; a recipient acknowledgement alone is insufficient.
7. Reorg invalidates receipt status and reconciles output/nullifier state before any new charge.

For transparent or incompatible protocols, report this mode unavailable; do not claim frontend encryption hides public ETH/ERC-20 fees. A public alternative requires separate review and consent. Zero-fee quotes create no synthetic fee output. Unknown submission cannot authorize a replacement fee.

Lock/cancel during proof preparation wipes witnesses and discards stale output plans. After broadcast, UI cancellation cannot undo settlement. Recipient-key rotation invalidates stale plans according to approved policy, without granting the publisher authority over customer outputs or retroactively altering their fee consent.

## 6. Proposed bounds and proof requirements

Limit a plan to one settlement asset, at most 32 accepted fee lines and four fee-recipient outputs; stricter protocol limits prevail. Public plan/quote metadata is capped at 64 KiB. Proof/encrypted-output caps are explicitly inherited from the selected protocol, validated before allocation, and recorded in capability descriptors.

Require binding/hiding commitments, exact range/value conservation, domain separation, output uniqueness, authorization and replay/nullifier correctness. No custom circuit is assumed. Client proof generation has explicit cancellable time/memory budgets benchmarked on supported mobile devices; exceeding them leaves the mode unavailable, never selects a remote witness service.

## 7. Privacy and authority matrix

| Observer / failure | Exposure or authority | Required treatment |
|---|---|---|
| Public chain | Commitment counts, protocol, timing and possible fee class | Measure leakage; avoid universal privacy claim |
| Fee recipient | Own note value and receipt/redemption context | Narrow recipient keys; no customer viewing/spend access |
| Operator/service | Quote/module/amount correlation | Minimize fields and persistent identifiers |
| Public fee redemption | Revenue timing/amount and consolidation links | Document explicit redemption/batching leakage |
| Recipient-key substitution | Unauthorized revenue diversion | Policy-bound authenticated key version and commitment |
| Small fee domain | Guessing amounts from public metadata | Analyze inference; hashing alone is not confidentiality |

Batching fee collection may reduce or increase correlations; it is a separately reviewed publisher workflow, not automatic protection. A revenue key compromise affects only fee outputs under the selected protocol, never customer principal.

## 8. Pricing and accounting policy

FEE01 is the sole owner of price composition, fee caps, bundling, recipient choice and consent. P17 consumes exact accepted results. Exact rates and recipient remain unresolved; a required unknown fee configuration is unavailable. Distinguish protocol fees from gas and independent operator charges. Refunds and partial settlement follow the accepted accounting policy; P17 cannot invent reimbursement authority.

## 9. Acceptance cases

- **P17-A01:** Exact accepted quote matches output value/asset/recipient without independent repricing.
- **P17-A02:** Altered policy, recipient key, output commitment or operation digest invalidates authorization.
- **P17-A03:** Value-conservation and range properties reject omitted/extra fees and inflation.
- **P17-A04:** Replayed proofs or duplicate outputs cannot charge or credit the same authorization twice.
- **P17-A05:** Publisher fee keys cannot decrypt or spend customer-note fixtures.
- **P17-A06:** Unsupported transparent settlement refuses private-fee mode without silent fallback.
- **P17-A07:** Lock/session change during proving prevents stale proof/output publication.
- **P17-A08:** Reorg or unknown submission triggers reconciliation, not another charge.
- **P17-A09:** Zero-fee schedules create no unnecessary output or tracking marker.
- **P17-A10:** Redemption, batching, small-amount inference and service correlation are measured and disclosed.

## 10. Slices and future verification

Slice 1 selects compatible protocol/recipient-key semantics and comparative leakage criteria. Slice 2 creates exact-quote accounting fixtures. Slice 3 adds isolated local/testnet output/proof adapters after ADR approval. Slice 4 requires independent cryptographic/contract review, output recovery and redemption-leakage qualification.

Confirmed future commands, **not run here**:

```bash
npm run test -w @ghostpay/pool-sdk
npm run typecheck -w @ghostpay/pool-sdk
npm run lint -w @ghostpay/pool-sdk
npm run test -w @ghostpay/external-pools
npm run test -w @ghostpay/pool-relayer
```

Existing testnet artifacts and development ceremony material cannot qualify valuable funds.

## 11. Migration, rollback and decisions

Version every output format and recipient-key policy. Rollback disables new private fee plans but preserves existing customer/fee note recovery and settlement reconciliation. Never migrate transparent receipts into claimed confidential ones. Resolve selected protocol, recipient authentication/rotation, proof public inputs and fee redemption policy before implementation. No new fee recipient, rate, contract or deployment is authorized.
