# F10 — Private recurring invoices and subscriptions

- Specification version: 1.0; prepared 2026-11-19.
- Branch: `future/f10-private-recurring`.
- Pinned source base: `c977b5d6723f6822c3b5d86cd6b231712c53c395`.
- Status: **M1 staged-plan and local-review adapter implemented on this branch; complete product and release remain disabled.**
- Shared requirements: [COMMON.md](../COMMON.md); [module catalog](../README.md).
- Existing beta requirements and fee policies remain separate; this document does not activate a product.

Implementation continuation, 2026-11-20: the owner authorized future-feature development.
The first bounded adapter milestone consumes existing UTC schedule helpers and adds strict
browser snapshot intake and explicit local period review. It is not mounted in the app.
See [HANDOFF.md](HANDOFF.md) for source pins, executed checks, narrower implemented
contracts, and the P04/P05 integration and browser work still required.

## Objective and user journeys

Extend existing merchant billing with a private browser workflow for locally scheduled invoices and voluntary renewals. A subscription is a schedule and records; it is never permission for GhostPay or a merchant to pull funds from a payer.

1. Merchant creates an encrypted plan with explicit cadence, price, invoice template, and reminder policy.
2. While the app is open and unlocked, merchant previews due periods and explicitly issues invoices through the existing authenticated invoice provider.
3. Merchant views local reminders and may deliberately export one to a chosen communication channel. No email/chat message is sent automatically.
4. Payer independently reviews and authorizes every renewal. Merchant records verified settlement and can pause, resume, cancel, or revise future terms.

The browser being closed means no local reminder delivery or invoice issuance is guaranteed. Catch-up after reopening must be bounded and reviewed. This module does not introduce a background server, persistent signer, token allowance, or scheduled transfer service.

## Provenance and source reuse

Source proposal: [private recurring invoices](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/docs/future/privacy-first/10-private-recurring.md).

| Existing source / exports | Reuse | Future gap |
|---|---|---|
| [merchant-billing/src/schedule.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/merchant-billing/src/schedule.ts): `periodStart`, `periodAt`, `periodIndexAt`, `listPeriods`, `MAX_PERIOD_INDEX` | UTC-anchored deterministic cadence and bounded horizon | Calendar explanation and local browser scheduling UX |
| [merchant-billing/src/subscription.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/merchant-billing/src/subscription.ts): `createSubscription`, `advance`, `markPaid`, `pause`, `resume`, `cancel`, `prorateChange` | Non-custodial invoice/reminder state machine | Encrypted durable workflow, exact issuance consent, evidence adapter |
| [merchant-billing/src/operator-state.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/merchant-billing/src/operator-state.ts): `validateSnapshot`, `logicalId`, `MAX_RECORDS` | Strict snapshot/outbox validation and deterministic event IDs | Browser-safe persistence adapter; do not copy CLI file-path fields into browser state |
| [invoice-schema/src/index.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/invoice-schema/src/index.ts): `createInvoice`, `signInvoice`, `encodeFragment` | Existing authenticated invoice path | Renewals consume P04 rather than implementing another signer |

Existing monthly scheduling derives each date from the original UTC anchor and clamps month-end dates without cumulative drift. Preserve this behavior unless a separate versioned cadence change is approved.

## Ownership and dependencies

Own proposed `apps/web/src/features/future/private-recurring/`: plan forms, due-period previews, encrypted outbox, local reminder view, and voluntary-renewal status.

Hard dependencies: [P04 authenticated invoices](https://github.com/djshellshoxxx/GhostPay/tree/future/p04-encrypted-offline-invoices), [P05 encrypted local state](https://github.com/djshellshoxxx/GhostPay/tree/future/p05-encrypted-local-state). Optional [F03 link exchange](https://github.com/djshellshoxxx/GhostPay/tree/future/f03-private-payment-links-spec) provides additional share formats; optional [FEE01](https://github.com/djshellshoxxx/GhostPay/tree/future/fee01-modular-fee-policy) provides separately approved service pricing.

Excluded: automatic direct debits, perpetual approvals, hosted cron jobs, notification-provider integration by default, legal subscription enforcement, background transfers, and reimplementation of existing schedule arithmetic.

## Proposed model and interface

```ts
interface RecurringPlanV1 {
  readonly schema: 'ghostpay.recurring-plan/1';
  readonly planId: string;
  readonly revision: string;
  readonly anchorSeconds: number;
  readonly cadence: { readonly kind: 'weekly' | 'monthly'; readonly every: number }
    | { readonly kind: 'custom'; readonly seconds: number };
  readonly templateRef: string;
  readonly assetId: string;
  readonly amountAtomic: string;
  readonly displayTimeZone: string;
  readonly status: 'active' | 'paused' | 'cancelled';
}
interface RecurringOutboxV1 {
  readonly eventId: string;
  readonly planId: string;
  readonly periodIndex: number;
  readonly kind: 'invoice' | 'reminder';
  readonly artifactRef: string;
  readonly status: 'prepared' | 'issued' | 'exported' | 'void';
}
interface PrivateRecurringProvider {
  readonly capability: CapabilityDescriptorV1;
  previewDue(planId: string, nowSeconds: number, ctx: OperationContext):
    Promise<ModuleResult<{ reviewId: string; periods: readonly number[] }>>;
  issue(reviewId: string, ctx: OperationContext):
    Promise<ModuleResult<readonly RecurringOutboxV1[]>>;
  previewReminder(eventId: string, ctx: OperationContext):
    Promise<ModuleResult<{ disclosureId: string }>>;
  setState(planId: string, revision: string, action: 'pause' | 'resume' | 'cancel',
    ctx: OperationContext): Promise<ModuleResult<RecurringPlanV1>>;
}
```

These are proposed contracts using COMMON types. Existing fiat-minor plan values and token-atomic renewal values must remain distinct typed quantities; conversion needs an explicit valid quote and cannot be inferred from the field name. All calculations use `bigint`; JSON stores canonical decimal strings. `displayTimeZone` affects presentation only, not UTC billing arithmetic.

Outbox artifacts and contact aliases are encrypted. Invoice signing keys remain scoped provider handles; payer spending authority is never stored with the merchant plan. IDs derive only from approved local plan/period identity and do not become public global customer identifiers.

## Lifecycle and recovery

Plan: draft → previewed → active → paused/resumed/cancelled. Period: due → issuance-preview → issued → unpaid/partial/final/late/void. Reminder: due-local → preview → user-exported; exported is not proof the customer received it.

`advance` computes eligible work; the product layer must not automatically send all returned invoices or reminders. Persist prepared outbox entries transactionally before making artifacts available. Deterministic logical IDs prevent duplicate issuance across restarts and tabs. A failed export remains available for explicit retry without generating a second invoice for the period.

Price/template changes create a new plan revision and effective future boundary. Already issued invoices retain their signed terms; they cannot silently change when the form is edited. Pause and cancellation do not reverse payments or erase recovery records. Catch-up never bills unapproved historical periods simply because the clock jumps forward.

Lock, session change, cancellation, and clock anomalies revoke current review. Every delayed provider result checks operation ID, session epoch, plan revision, and outbox state before commit. Reopening reconstructs due work from persisted UTC anchors and shows a bounded catch-up preview. It does not restore prior signing consent or send notifications.

## Validation and proposed budgets

- Reuse existing cadence constraints: weekly/monthly every 1–24; custom interval 3,600 seconds to 366 days; bounded period horizon from `MAX_PERIOD_INDEX`.
- Initial product cap: 100 active plans, ≤24 periods in any catch-up preview, and one active issuance operation per profile. Default one invoice per explicit issue action.
- Preserve existing reminder ordering/limits; proposed UI exposes no more than 12 reminder offsets per plan and labels them relative to the UTC due date.
- Validate time-zone names for presentation, safe-integer timestamps, positive exact prices, template/asset compatibility, and quote expiry before issuing an invoice.
- New snapshots reject duplicate plan-period/event IDs and mismatched invoice nonces, chain, asset, amount, or template revision.
- Long sleep, clock rollback, and large forward jump require fresh due-work review. Timer callbacks are advisory triggers, not payment authority.

## Privacy and leakage table

| Observer / event | Remaining information | Required behavior |
|---|---|---|
| Merchant | Local schedule, customer alias, renewal status | Encrypted local state; no central subscription database |
| Email/chat provider selected by user | Deliberately exported reminder contents | Disclosure preview; no automatic send or contact lookup |
| Public chain | Repeated amounts/timing may link renewals | Honest explanation; do not call cadence obfuscation anonymity |
| Shared device | Visible due list while unlocked | Lock clears plaintext schedule and contact details |
| Recipient of invoice | Necessary payment and chosen merchant fields | Minimize optional recurring-plan/customer identifiers |

## Fee behavior

Creating plans and local reminders adds no new protocol charge. Each renewal payment follows its own reviewed invoice/fee policy; consent to one renewal cannot authorize later fees. Optional paid services require separately approved quotes and clear itemization. Price or fee updates invalidate pending reviews without rewriting prior invoices. No automatic late fee, penalty, refund, fee recipient, or rate is introduced by this spec.

## Acceptance matrix

| ID | Case | Required result |
|---|---|---|
| F10-A01 | Jan 31 monthly anchor across leap/non-leap years | Feb clamp then return to anchor day; no cumulative drift |
| F10-A02 | Display timezone/DST changes | Same UTC periods and exact due instants |
| F10-A03 | App closed across many periods | Bounded catch-up preview; no background charges |
| F10-A04 | Repeated advance/restart/two tabs | One invoice per approved plan-period identity |
| F10-A05 | Price changed after invoice issuance | Existing signed terms unchanged |
| F10-A06 | Pause/resume/cancel around boundary | Deterministic future work; no erased evidence |
| F10-A07 | Lock during invoice signing/export | No late artifact or outbox mutation under stale authority |
| F10-A08 | Clock rollback or forward jump | Explicit refresh/review rather than blind mass issuance |
| F10-A09 | Reminder exported twice | Same logical reminder; no claim of recipient delivery |
| F10-A10 | Wallet pays one renewal | No persistent debit authorization or automatic next payment |
| F10-A11 | Unsupported snapshot/duplicate event ID | Import rejected without partial mutation |

## Implementation slices and existing commands

1. Browser plan/snapshot adapter over existing schedule/subscription helpers; verify UTC semantics and strict schemas.
2. P05 outbox and due-preview coordinator; verify idempotency, tabs, restart, clock anomalies, and cancellation.
3. P04 issuance and reminder disclosure UI; verify exact revision consent and no automatic network/send behavior.
4. Proposed `apps/web/e2e/future-recurring.spec.ts` and deterministic calendar fixtures; add accessible keyboard/mobile plan editing.

Manifest scripts verified by inspection; **not executed for these specifications**:

```sh
npm run test -w @ghostpay/merchant-billing
npm run test -w @ghostpay/invoice-schema
npm run test -w @ghostpay/ux-vault
npm run typecheck -w @ghostpay/web
npm run lint -w @ghostpay/web
npm run build -w @ghostpay/web
npm run test:e2e -w @ghostpay/web
```

## Migration, rollout, rollback, and decisions

Default disabled. Import existing subscription snapshots using strict validators, dropping no required history and converting operator-only filesystem fields through an explicit browser adapter. Imported plans begin paused until the user reviews scope and future issuance. Encrypted migration preserves event identities and has a recoverable pre-migration checkpoint.

Rollback disables new plan issuance while keeping existing invoices, receipts, and unpaid-period history readable. Owner decisions: token versus fiat-denominated plans, default reminder offsets, catch-up policy, allowed share channels, retention, and any future paid service. Keep automatic delegated spending out of scope until separately specified and reviewed; a recurring invoice never grants spending authority.
