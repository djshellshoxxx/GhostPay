# FEE01 — Modular fee quotes, authorization and accounting

| Field | Value |
|---|---|
| Module | FEE01 / modular-fee-policy |
| Feature branch | future/fee01-modular-fee-policy |
| Source commit | c977b5d6723f6822c3b5d86cd6b231712c53c395 |
| Specification date | 2026-11-19 |
| Status | Detailed specification only; future capability remains off |
| Hard dependencies | [P06](https://github.com/djshellshoxxx/GhostPay/blob/future/p06-key-role-separation/docs/future/modules/P06-key-role-separation/SPEC.md) |
| Optional integrations | [P17](https://github.com/djshellshoxxx/GhostPay/blob/future/p17-private-fee-outputs/docs/future/modules/P17-private-fee-outputs/SPEC.md), [P19](https://github.com/djshellshoxxx/GhostPay/blob/future/p19-optional-fee-gateway/docs/future/modules/P19-optional-fee-gateway/SPEC.md) |

[Shared contracts](../COMMON.md) and the [catalog](../README.md) are normative. APIs, budgets and planned paths below are proposed requirements, not current exports or executed qualification. Existing source paths are explicitly identified as reuse inputs. This branch authorizes no implementation, pricing, release or deployment.

## Objective and product contract

Provide one shared policy engine for independently selectable feature prices, transparent quotes, exact consent and reconciliation. It must prevent accidental duplicate charging when product workflows compose privacy providers. Fees are calculated only for applicable approved services or transactions; merely selecting a local privacy setting is not a chargeable event.

A user sees the base protocol fee, selected feature add-ons, third-party charges and network gas separately before authorization. A changed module selection, network, asset, recipient, price, execution plan or policy version invalidates the old quote. Unapproved prices or recipients make a paid route unavailable; they are never silently guessed.

## Provenance and existing behavior

Requirements derive from [Privacy Suite fee section](https://github.com/djshellshoxxx/GhostPay/issues/284), [issue #288 C](https://github.com/djshellshoxxx/GhostPay/issues/288), and the [P19 owner addendum](https://github.com/djshellshoxxx/GhostPay/issues/284#issuecomment-7020857691).

| Baseline source | Existing function | Reuse and future delta |
|---|---|---|
| [fee schedule](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/docs/FEE_SCHEDULE.md) | Current fee scope, limits and disclosure | Preserve existing router policy; future add-ons require new decisions |
| [chain-adapters fees](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/chain-adapters/src/fees.ts) | routerFee/routerNet/grossForNet, sponsor checks | Reuse integer arithmetic and existing caps; do not fork base fee calculation |
| [ux-fees preview](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/ux-fees/src/preview.ts) | buildFeePrivacyPreview and per-asset totals | Extend presentation through a versioned quote contract |
| [payer-sponsor types](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/payer-sponsor/src/sponsor/types.ts) | Existing scoped service quote/request types | Research reuse only; not a ready general fee-policy authority |
| [privacy-pipeline index](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/privacy-pipeline/src/index.ts) | Plan digest and resumable execution boundaries | Bind quotes to the exact composed economic plan |

The baseline router fee is 25 basis points, floor-rounded on the gross amount. This spec does not change it, copy historical proposed prices into new modules, select a recipient, or claim client arithmetic enforces a fee on every possible external payment path.

## Ownership and provider boundaries

FEE01 owns schedule validation, deterministic applicability, line deduplication/bundling, integer math, caps, quote digest, consent scope and accounting states. P06 supplies a dedicated scoped authorization role. P17 optionally constructs fee settlement outputs; P19 optionally verifies service entitlements. They are consumers through injected ports, not imports required to calculate a quote.

Products supply module selections and economic intent; providers supply capability/cost facts. FEE01 never holds spending/viewing keys, sends money, substitutes the destination, chooses a bridge or runs a mandatory server. On-chain enforcement belongs to a separately approved adapter/contract. Gateway enforcement covers only that gateway's service. Local open-client features cannot be universally paywalled by browser logic.

## Proposed policy, quote and consent model

~~~ts
interface FeeRuleV1 {
  readonly moduleId: ModuleId;
  readonly serviceId: string;
  readonly chargingEvent: 'transaction' | 'leg' | 'service';
  readonly formulaId: string;
  readonly formulaParameters: Readonly<Record<string, DecimalUnits>>;
  readonly capUnits: DecimalUnits;
  readonly asset: AssetRefV1;
  readonly recipientPolicyDigest: Digest;
  readonly overlapGroup?: string;
  readonly bundleId?: string;
}
interface FeeScheduleV1 {
  readonly schema: 'ghostpay.fee-schedule/v1';
  readonly version: string;
  readonly authorityManifestDigest: Digest;
  readonly formulaRegistryDigest: Digest;
  readonly validFromMs: number;
  readonly validUntilMs: number;
  readonly rules: readonly FeeRuleV1[];
  readonly signature: string;
}
interface FeeQuoteV1 {
  readonly schema: 'ghostpay.fee-quote/v1';
  readonly quoteDigest: Digest;
  readonly operationDigest: Digest;
  readonly scheduleDigest: Digest;
  readonly selectedModules: readonly ModuleId[];
  readonly itemizedLinesRef: RecordRef;
  readonly maximumTotalsByAsset: Readonly<Record<string, DecimalUnits>>;
  readonly expiresAtMs: number;
  readonly consentNonce: string;
}
interface FeePolicyProvider {
  quote(intentRef: RecordRef, schedule: FeeScheduleV1, ctx: OperationContext):
    Promise<ModuleResult<FeeQuoteV1>>;
  validateConsent(quote: FeeQuoteV1, consentRef: RecordRef, ctx: OperationContext):
    Promise<ModuleResult<{ authorized: true; operationDigest: Digest }>>;
  reconcile(quoteDigest: Digest, evidenceRef: RecordRef, ctx: OperationContext):
    Promise<ModuleResult<RecordRef>>;
}
~~~

Abbreviated line references resolve to immutable locally retained quote bytes. Every line contains category, module/service/event ID, asset, exact amount or authorized maximum, calculation basis, rounding rule, recipient commitment, applicability, included/excluded bundle status and failure/refund policy. A public receipt uses selective disclosure; it must not expose private invoice content.

Signatures authenticate schedules only against an independently trusted authority manifest, never against an arbitrary key embedded in the schedule. A recipient may be a validated public address or protocol-supported private commitment, but the authorization must bind the exact approved beneficiary. Server configuration cannot replace that beneficiary.

Each versioned formula ID resolves through an immutable allowlisted formula registry whose digest is bound into the signed schedule. Every rule carries complete authenticated, schema-decoded parameters in canonical field order; rational coefficients use explicit bounded integer numerator/positive denominator fields. Unknown formulas, extra/missing parameters, zero denominators and out-of-range coefficients reject. Registry algorithms are reviewed build code, never downloaded executable expressions or dynamic evaluation. A cap bounds a charge but cannot substitute for a fully specified formula and parameters. No concrete new rate is selected by this schema.

## Deterministic accounting rules

1. Validate all selected module IDs and eligible capabilities; reject unknown pricing rules rather than silently ignore them.
2. Expand chargeable events from the approved economic plan. Local-only controls generate no fee line absent a separately accepted genuine paid service.
3. Apply explicit bundle/overlap rules once. Selecting a product and its provider cannot automatically bill twice for the same service.
4. Calculate each line using bigint/rational arithmetic and documented rounding. Preserve existing base-fee boundary behavior.
5. Sum by exact asset/network; never add incompatible units. Optional fiat display has a separately dated rational quote and is not the settlement authority.
6. Check per-line, per-event, per-asset and operation-wide maxima, then canonically bind the result to the operation/policy/recipient digests.
7. Revalidate at each chargeable event. Expired or changed plans require fresh review; unused consent cannot authorize additional legs.
8. Reconcile actual fees and gas from validated evidence. Unknown outcomes stay unknown; refund claims require an enforceable approved policy.

T01/T02 must define whether a proposed charge is per plan, leg or service. That decision is currently unresolved. The quote preview must show the maximum entire route cost before the first authorized leg, and separately show exact current-leg limits.

## State machine and recovery

Policy unavailable → valid → quote-ready → reviewed → consented → event-pending/unknown → reconciled, expired or cancelled-unsent. Consent stores only a scoped reference and non-secret digest evidence. Account, chain, beneficiary, scope, schedule or total changes invalidate authorization.

A late provider response after lock/epoch change cannot publish a quote or charge. Persist event accounting before an external effect, then reconcile on reload. A dropped response cannot create another entitlement or repeat a fee. Reorg moves confirmed receipt evidence back to pending and pauses dependent service grants where necessary.

Partial completion retains successful leg charges and spent gas distinctly from unused/add-on amounts. Cancellation never promises reversal of already-settled charges. Recovery export must allow the user to inspect what was authorized and observed without exposing spending secrets.

## Bounds and validation

Proposed v1 limits: 64 rules, 32 selected modules, 128 fee lines, 8 assets and 128 KiB canonical schedule/quote content; lower consumer limits take precedence. Reject negative/overflow amounts, fractional base units, unknown formula versions, duplicate event IDs, conflicting bundle membership, untrusted signers and invalid validity windows.

A proposed default quote lifetime is at most five minutes, shortened by protocol/plan deadlines; final durations and schedule maxima require approval. Time changes and browser suspension force expiry checks. No unbounded approval, dynamic arbitrary recipient or uncapped multiplier is allowed.

## Privacy and trust analysis

| Party or failure | Required control | Residual limitation |
|---|---|---|
| Publisher/fee recipient | Only authorized fee outputs and minimal receipts | Public fee values/time may correlate payments |
| Gateway/relayer | Verify exact policy/quote, no recipient override | Operator sees IP/service timing and authorized request data |
| Tampered client/storage | Signed policy plus exact transaction enforcement | Browser-only enforcement cannot govern copied clients |
| Price provider | Explicit asset/rate/time and bounded validity | Market movement can invalidate a quote |
| Bundle error | Deterministic overlap IDs and independent arithmetic tests | Complex products need reviewed charging-event definitions |
| Unknown settlement | Evidence-based reconciliation before retry | Delayed finality can postpone service delivery |

## Acceptance matrix

| ID | Scenario | Required outcome |
|---|---|---|
| FEE01-A01 | Baseline 399/400-unit boundaries | Existing router arithmetic preserved |
| FEE01-A02 | Product plus provider selection | Shared service charged once per explicit overlap rule |
| FEE01-A03 | Free local privacy toggle | No fee or mandatory gateway dependency |
| FEE01-A04 | Missing rate/recipient/cap approval | Paid route unavailable with a precise reason |
| FEE01-A05 | Beneficiary/chain/asset mutation | Signature/quote/consent invalidated before effect |
| FEE01-A06 | Expired quote or suspended browser | Fresh review required; no stale authorization |
| FEE01-A07 | Replay on another plan/leg | Rejected; consent nonce/event scope enforced |
| FEE01-A08 | Two assets/FX display | Separate integer totals; display rate cannot alter settlement |
| FEE01-A09 | Partial T01/T02 execution | Successful charges, unused lines and gas itemized correctly |
| FEE01-A10 | Unknown receipt/reorg | No duplicate charge or unsupported entitlement |
| FEE01-A11 | Unapproved schedule signer | Rejected even if embedded signature is mathematically valid |
| FEE01-A12 | Private-fee route unsupported | No silent public payment or fee bypass |
| FEE01-A13 | Gateway absent | Free/local quote-independent features and recovery still work |
| FEE01-A14 | Out-of-range/bundle-conflicting data | Deterministic bounded rejection |
| FEE01-A15 | Trace and logs | No decrypted invoices, keys or identifying purchase history |
| FEE01-A16 | Contract/provider enforcement comparison | Actual authorized amounts/recipient match quote; no browser-only proof claim |

## Implementation slices and existing checks

1. Record owner decisions and charging-event matrix; reconcile the existing fee schedule and all consumer math.
2. Add versioned strict policy/line/quote schemas and independent integer boundary/property vectors in the provider lane.
3. Add deterministic bundle/cap/consent logic with fake policy authorities and synthetic identities.
4. Integrate previews with F18/T01/T02, including lock, changed-plan, expiry and partial-failure journeys.
5. Design a separately reviewed enforcement adapter; qualify quote-to-settlement equivalence on local fixtures and approved testnet scope.
6. Add selective receipt/accounting migration and independent economics/privacy review before enablement.

Existing commands, not executed by this documentation task:

~~~bash
npm run test -w @ghostpay/chain-adapters
npm run test -w @ghostpay/ux-fees
npm run typecheck -w @ghostpay/ux-fees
npm run lint -w @ghostpay/ux-fees
npm run test -w @ghostpay/privacy-pipeline
npm run test -w @ghostpay/payer-sponsor
~~~

## Migration, rollback and outstanding owner decisions

Read existing receipts under their original schedule semantics. Never retrospectively add charges or silently rewrite policy versions. Disabling a new schedule blocks new paid quotes while preserving receipt inspection, dispute evidence and user recovery. Signed historical records remain available with their original verification material.

Decisions required: prices and published maxima per feature; recipient and trust/policy authority; event granularity for T01/T02; bundles; supported assets/networks; free versus paid optional services; enforcement architecture; gas/refund policy; fee privacy; and release version. No values or activation are chosen by this branch.

