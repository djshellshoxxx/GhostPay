# F07 — GhostPayouts private multi-recipient payouts

- Specification version: 1.0; prepared 2026-11-19.
- Branch: `future/f07-ghostpayouts`.
- Pinned source base: `c977b5d6723f6822c3b5d86cd6b231712c53c395`.
- Status: **SPECIFICATION ONLY; implementation and release remain disabled.**
- Shared requirements: [COMMON.md](../COMMON.md); [module catalog](../README.md).
- No current beta scope, fee recipient/rate, production deployment, or custody change is authorized here.

## Objective and user journeys

Prepare, review, and track multiple recipient payments locally without a provider-held payroll database. Each recipient receives an independently bound payment intent, and each execution outcome remains recoverable without risking an automatic duplicate transfer.

1. Operator enters payouts or imports a bounded CSV into a preview-only workspace. Errors identify row/field codes without echoing sensitive values into logs.
2. Operator reviews recipients, exact amounts, asset/network, fees, signing authority, and public linkability. Any intentional duplicate-recipient merge is explicitly shown.
3. The selected signer approves the exact immutable plan, with additional per-transaction confirmation where its capabilities require it.
4. Encrypted local tracking follows each leg independently through submission, unknown response, chain observation, and finality. Operator can cancel unsent legs and reconcile uncertain ones.

The initial execution mode is foreground, sequential, user-controlled sending. Common funding, public values, and timing can link payouts. “Private” describes local records and recipient-address practices, not guaranteed unlinkability.

## Provenance and existing implementation

Source: [original GhostPayouts proposal](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/docs/future/privacy-first/07-ghostpayouts.md).

| Verified source / exports | Reuse | Residual gap |
|---|---|---|
| [merchant-billing/src/payouts.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/merchant-billing/src/payouts.ts): `previewBatch`, `confirmBatch`, `hashItems`, `chunkBatches` | Exact CSV preview, committed plan, deterministic chunks | Execution journal, signer consent, uncertainty recovery |
| [merchant-billing/src/csv.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/merchant-billing/src/csv.ts): `parseCsv`, `assertNoFormula`, `DEFAULT_CSV_LIMITS` | Bounded import and spreadsheet safety | Product-specific budgets and row-level review |
| [merchant-billing/src/address.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/merchant-billing/src/address.ts): `parseEvmAddress`, `parseMetaAddress` | Recipient-format checks | Authenticated recipient identity and supported-route qualification |
| [secret-box/src/index.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/secret-box/src/index.ts): `SecretBox`, `SecretScope` | Scoped secrets | All signer access mediated by P06 |

Deterministic plan/chunk IDs prevent accidental software duplication only when reconciled with evidence. They do not make an arbitrary repeated chain transaction idempotent.

## Ownership and dependencies

Own proposed `apps/web/src/features/future/ghostpayouts/`: import/review UI, plan coordinator, encrypted per-leg journal, and recovery workspace. Shared billing arithmetic remains in its existing package; changes there require a separate coordinated slice.

Hard dependencies: [P05 encrypted state](https://github.com/djshellshoxxx/GhostPay/tree/future/p05-encrypted-local-state), [P06 scoped key roles](https://github.com/djshellshoxxx/GhostPay/tree/future/p06-key-role-separation), [FEE01 fee quotes](https://github.com/djshellshoxxx/GhostPay/tree/future/fee01-modular-fee-policy).

Optional: [P09 gas services](https://github.com/djshellshoxxx/GhostPay/tree/future/p09-noncustodial-gas-services), [P10 private submission](https://github.com/djshellshoxxx/GhostPay/tree/future/p10-private-submission), [T01 staggered sending](https://github.com/djshellshoxxx/GhostPay/tree/future/t01-staggered-transfers). Scheduling is owned by T01, not a second scheduler inside F07.

Excluded: hosted payroll, automatic salary calculation/tax filing, automatic background transfers after browser closure, unreviewed batch contracts, custodial recipient accounts, and treating a CSV label as verified identity.

## Proposed contracts and data

```ts
interface PayoutPlanV1 {
  readonly schema: 'ghostpay.payout-plan/1';
  readonly planId: string;
  readonly revision: string;
  readonly chainId: string;
  readonly assetId: string;
  readonly feeQuoteId: string;
  readonly legs: readonly {
    readonly legId: string;
    readonly recipientRef: string;
    readonly amountAtomic: string;
    readonly intentDigest: string;
  }[];
}
interface PayoutExecutionV1 {
  readonly planId: string;
  readonly legId: string;
  readonly state: 'ready' | 'awaiting-signature' | 'submitted' |
    'unknown' | 'confirmed' | 'failed' | 'cancelled';
  readonly evidenceRef?: string;
}
interface GhostPayoutsProvider {
  readonly capability: CapabilityDescriptorV1;
  preview(input: SecretHandle, ctx: OperationContext):
    Promise<ModuleResult<{ reviewId: string; totalAtomic: string }>>;
  approve(reviewId: string, ctx: OperationContext): Promise<ModuleResult<PayoutPlanV1>>;
  executeNext(planId: string, ctx: OperationContext): Promise<ModuleResult<PayoutExecutionV1>>;
  reconcile(planId: string, ctx: OperationContext): Promise<ModuleResult<readonly PayoutExecutionV1[]>>;
}
```

All proposed types use COMMON contracts. Persist private recipient maps and labels only under P05 encryption. Canonical decimal strings convert to `bigint`; never sum unlike assets. A plan digest binds order, recipient identity, resolved destination, amount, chain, asset, fee quote, and execution policy. No raw signing key is stored in a plan, worker message, or React state.

## Lifecycle and recovery semantics

Draft → validated preview → approved immutable plan → one-leg execution → completed/partially completed/paused. Each leg has its own durable attempt record and transaction correlation. Before crossing the signer/network boundary, verify current session, chain/account, fee limits, approved plan revision, and nonce policy.

Persist a prepared-attempt record before submission. If response delivery fails, mark the leg unknown and preserve all available transaction evidence. Do not create another payment merely because an RPC lookup temporarily returns not found. Replacements require a separately approved nonce/replacement policy and must remain linked to the original economic intent.

Cancel affects only unsent legs. A confirmed leg is immutable financial evidence; a reorg demotes it without losing the attempt. Duplicate observations do not increment paid totals. Insufficient gas, rejected signature, changed provider, or expired quote pauses the plan; no silent alternate relayer is selected.

Lock advances session epoch, revokes signer handles, aborts pending unsent work, and prevents later callbacks from advancing the plan. Reopening restores an encrypted review/recovery view and requires renewed consent to continue. P05 revision comparison prevents two tabs executing the same prepared leg concurrently.

## Validation and proposed budgets

- Preserve stricter existing CSV limits; initial UI cap is 1 MiB, 500 recipients, 200 characters per field, and one chain/asset per plan.
- Reject duplicate destinations by default. If merging is selected, show every merged row, recompute per-recipient caps, and require a new plan digest.
- Proposed max active signer/submission concurrency: one. Bounded chunking is an organizational tool, not permission to send all chunks autonomously.
- Validate asset decimals, positive amount, per-recipient maximum, total maximum, balance plus worst-case quoted gas/fees, and recipient format before approval.
- No floating-point FX or amount arithmetic. Unknown asset metadata blocks execution; it does not guess decimals.
- Recipient authentication is explicit: pinned merchant/meta identity, independently confirmed public address, or unverified with a visible policy decision. Never silently resolve an alias over a network.

## Privacy and leakage

| Observer | Visible relationship | Required handling |
|---|---|---|
| Public chain | Common sender, values, timing, gas funding | Review group-linkability before authorization |
| Recipient | Their own payment and disclosed sender context | No other recipient list in invoice/receipt |
| CSV reader | Names, amounts, recipient mappings | Local import only; encrypted journal and neutral filename |
| Relayer/bundler | Submitted batch/leg metadata | Optional disclosure preview and separate route consent |
| Shared browser session | Plan details while unlocked | Lock clears plaintext views and temporary import buffers |

## Fees and economic behavior

FEE01 must quote a per-leg and aggregate maximum with base protocol, feature, network gas, and third-party charges separated. Existing fee rules remain authoritative. No publisher recipient or rate is selected here. Paid route selection is opt-in; overlapping batching/staggered services cannot double-charge the same module without an approved explicit pricing policy.

A failed unsent leg incurs no fictitious network charge. Actual mined fees remain recorded even if a transfer fails. Retry quotes must disclose already paid versus newly proposed fees. Cancellation/partial-completion receipts account for completed, uncertain, and unattempted legs separately.

## Acceptance matrix

| ID | Case | Required result |
|---|---|---|
| F07-A01 | Formula, bad checksum, excess decimals in CSV | Bounded row errors; no signable plan |
| F07-A02 | Recipient changed after preview | Digest mismatch and approval rejection |
| F07-A03 | Duplicate recipient under reject/merge policies | Correct refusal or explicit exact merged total |
| F07-A04 | Browser crashes after broadcast | Unknown leg recovered without duplicate send |
| F07-A05 | Two tabs execute same next leg | One durable authority owner; stale contender refused |
| F07-A06 | Partial success then cancel | Completed evidence retained; unsent legs cancelled |
| F07-A07 | Quote expires or gas exceeds cap | Pause for fresh review, no hidden fee escalation |
| F07-A08 | Lock during signer/provider await | No stale handoff or subsequent leg execution |
| F07-A09 | Reorg and duplicate observations | Correct demotion and idempotent accounting |
| F07-A10 | T01/P09 unavailable | Explicit capability failure; no automatic route fallback |

## Implementation slices and existing commands

1. Wrap existing CSV preview/plan helpers in the owned product adapter; verify canonical commitments and recipient disclosure.
2. Implement encrypted per-leg authority/journal coordination; verify crashes, tabs, lock, and unknown outcomes.
3. Integrate signer and fee providers; verify exact consent, sequential execution, cancellation, and accounting.
4. Add proposed `apps/web/e2e/future-payouts.spec.ts` and local-chain acceptance using test funds only after implementation approval.

Manifest-defined commands, inspected but **not executed**:

```sh
npm run test -w @ghostpay/merchant-billing
npm run test -w @ghostpay/secret-box
npm run typecheck -w @ghostpay/web
npm run lint -w @ghostpay/web
npm run build -w @ghostpay/web
npm run test:e2e -w @ghostpay/web
```

## Migration, rollback, open decisions

Default disabled. Existing CSV previews import only as drafts; imported completed-status strings do not prove payment. Migration preserves unresolved attempts and verifies plan/evidence correlations. Rollback disables new executions while preserving recovery/export and independent user access to funds.

Owner decisions: supported signer/batch capabilities, recipient confirmation policy, per-plan limits, network/asset scope, replacement-transaction policy, and fee/cancellation economics. Release requires exact-head browser and chain evidence plus independent review of duplicate-payment prevention; current planning helpers alone are insufficient.
