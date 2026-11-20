# F02 — GhostStore static private storefronts

- Specification version: 1.0; prepared 2026-11-19.
- Branch: `future/f02-ghoststore`.
- Pinned source base: `c977b5d6723f6822c3b5d86cd6b231712c53c395`.
- Status: **SPECIFICATION ONLY; implementation and release remain disabled.**
- Shared requirements: [COMMON.md](../COMMON.md); [module catalog](../README.md).
- This branch specifies a future product; it does not change current beta acceptance, production configuration, custody, fees, or deployed behavior.

## Objective and user journeys

Provide a static merchant catalog and private checkout without a GhostPay commerce backend. Buyers verify catalog terms locally, authorize payment explicitly, and receive fulfillment according to an honest delivery model.

1. Merchant selects a persona, creates product entries and exact asset prices, signs a catalog revision, and exports static files.
2. Buyer imports or visits the catalog, verifies the merchant fingerprint, selects items, and reviews a purchase intent bound to that exact revision.
3. The existing payment flow obtains payer consent. Merchant-side local verification determines whether the order has sufficient finalized payment evidence.
4. Merchant explicitly releases a digital delivery package or arranges a separately consented physical handoff. Buyer verifies delivered content hashes.

**Initial fulfillment is merchant-assisted.** A public static site cannot keep a universal decryption key secret while automatically releasing it only to paid buyers. Autonomous encrypted delivery needs a separately reviewed entitlement protocol; it is not smuggled into this module as a solved problem.

## Provenance and current reuse

Source scope: [original GhostStore proposal](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/docs/future/privacy-first/02-ghoststore.md).

| Verified source | Reuse | Residual gap |
|---|---|---|
| [invoice-schema/src/merchantProfile.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/invoice-schema/src/merchantProfile.ts): `signMerchantProfile`, `verifyMerchantProfile` | Signed merchant provenance | Signed catalog/product revision format |
| [merchant-hooks/src/button.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/merchant-hooks/src/button.ts): `buildPaymentLink`, `buildPaymentButton`, `escapeHtml` | Safe static payment presentation | Cart-to-offer commitment and delivery workflow |
| [merchantTemplate.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/merchantTemplate.ts): `buildMerchantTemplateInvoice` | Existing template-based invoice path | Clearly distinguish merchant-issued invoices from buyer-generated purchase intents |
| [merchant-ledger/src/reconcile.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/merchant-ledger/src/reconcile.ts): `reconcile` | Amount/evidence reconciliation foundation | Order entitlement state and fulfillment deduplication |

These primitives do not establish that a complete storefront or automatic fulfillment is implemented.

## Ownership and module boundaries

Own proposed `apps/web/src/features/future/ghoststore/` and its catalog, cart, order journal, and fulfillment presentation. Product assets are inert content, not executable plugins. All crypto and storage are injected capabilities.

Hard dependencies: [F03 payment links](https://github.com/djshellshoxxx/GhostPay/tree/future/f03-private-payment-links-spec), [F08 merchant identities](https://github.com/djshellshoxxx/GhostPay/tree/future/f08-ghostid), and [P05 encrypted state](https://github.com/djshellshoxxx/GhostPay/tree/future/p05-encrypted-local-state). Core settlement verification must supply invoice-bound evidence; F02 cannot infer settlement from UI events.

Optional: [F07 payouts](https://github.com/djshellshoxxx/GhostPay/tree/future/f07-ghostpayouts) for a separately reviewed refund/payout workflow; [FEE01](https://github.com/djshellshoxxx/GhostPay/tree/future/fee01-modular-fee-policy) for optional approved commerce services. Refunding is never automatic and never trusts a buyer-provided screenshot.

Excluded: account databases, server inventory locks, guaranteed unique stock, embedded merchant scripts, automatic tax/legal advice, custodial escrow, and hidden buyer tracking.

## Proposed contracts and data

```ts
interface CatalogV1 {
  readonly schema: 'ghostpay.catalog/1';
  readonly catalogId: string;
  readonly revision: string;
  readonly merchantFingerprint: string;
  readonly expiresAt: number;
  readonly products: readonly {
    readonly productId: string;
    readonly title: string;
    readonly contentDigest?: string;
    readonly assetId: string;
    readonly chainId: string;
    readonly unitAtomic: string;
    readonly delivery: 'manual-digital' | 'manual-physical';
  }[];
}
interface CartSelectionV1 {
  readonly catalogDigest: string;
  readonly lines: readonly { readonly productId: string; readonly quantity: number }[];
}
interface GhostStoreProvider {
  readonly capability: CapabilityDescriptorV1;
  review(catalog: unknown, cart: CartSelectionV1,
    ctx: OperationContext): Promise<ModuleResult<{ reviewId: string; totalAtomic: string }>>;
  fulfill(orderId: string, deliveryHandle: SecretHandle,
    ctx: OperationContext): Promise<ModuleResult<{ deliveryId: string }>>;
}
```

The signed envelope commits the complete catalog including delivery terms. `unitAtomic` is parsed into `bigint`; integer quantity multiplication checks overflow against the selected asset/provider limit. A cart cannot mix assets or networks in its initial version. Shipping details and digital delivery secrets use P05/P06 scoped secret handles, never public catalog fields.

Private `OrderV1` records bind catalog digest, cart digest, invoice/intent ID, exact gross/net/fee accounting, evidence references, and delivery status. JSON uses decimal strings. A product title is rendered as text. New schema versions must define canonical bytes before signing and reject unknown critical fields.

## Lifecycle and recovery rules

Catalog states: draft → signed → published → superseded/expired. A newer catalog never silently changes a previously reviewed order. Checkout states: cart → review → authorized → submitted/unknown → partial/confirmed → fulfillment-ready → delivered/disputed.

An imported purchase intent proves buyer selection, not merchant acceptance. If policy requires merchant acceptance, checkout pauses for an authenticated merchant invoice. Do not invent a merchant signature from static public data.

Fulfillment readiness requires configured finality plus product/amount/asset binding. Duplicated chain observations do not duplicate delivery. A reorg after delivery records a dispute and preserves evidence; already disclosed content cannot be revoked. Cancellation stops unsent transactions and unreleased packages but cannot undo confirmed chain activity.

Lock or session-epoch change revokes active review and delivery handles. Every delayed callback checks the current order revision and operation context. Reload reads encrypted journal state and requires renewed consent before signing or releasing secrets. Unknown transaction outcomes are reconciled before any replacement payment is considered.

## Validation and proposed limits

- Catalog ≤1 MiB, ≤500 products, ≤50 cart lines, quantity 1–1,000; strict UTF-8 and duplicate-ID rejection.
- Product title ≤120 characters; descriptions plain text ≤2,000 characters. Remote images default disabled and require a separate host-disclosure decision.
- Delivery package metadata ≤64 KiB; large encrypted files are handled through bounded streaming adapters, not loaded into a catalog JSON document.
- Require valid signature, explicit revision, expiry, supported asset/chain pair, positive price, deterministic totals, and canonical content hashes.
- Proposed initial checkout concurrency is one active reviewed order per persona/session. Parallel tabs use P05 revision comparison to reject stale writes.
- Stock labels are advisory unless a separately approved coordinated inventory provider exists. No fabricated “reserved” guarantee.

## Privacy boundary

| Observer | Disclosure | Required mitigation / honest limit |
|---|---|---|
| Catalog host | Products, prices, visits | Static assets only; no buyer-specific query strings |
| Merchant | Chosen order and volunteered shipping data | Explicit field preview; encrypted local retention |
| Content host | Downloads and access timing | User-selected retrieval; hashes authenticate bytes, not privacy |
| Public chain | Amount, sender, timing, withdrawal graph | No claim that storefront encryption hides settlement |
| Recipient of digital goods | Clear delivered content | Copy prevention and revocation are not promised |

## Fee behavior

Review separates product price, any explicit tax field, existing protocol fees, network gas, and optional service charges. F02 does not choose a fee rate or destination. The browser recomputes all arithmetic and binds the exact itemization to consent. Catalog price changes or fee-quote expiry invalidate payment approval. Failure/refund policy must say which charges were actually incurred and which remain uncharged; disabling an optional module cannot secretly add a replacement service.

## Acceptance matrix

| ID | Case | Required result |
|---|---|---|
| F02-A01 | Product price or content hash altered | Catalog authentication rejects |
| F02-A02 | Catalog replaced between cart and signing | Review invalidated; original terms preserved |
| F02-A03 | Mixed asset or wrong-chain cart | Explicit rejection, no automatic conversion |
| F02-A04 | Submitted screenshot supplied as payment | No fulfillment entitlement |
| F02-A05 | Partial, duplicate, or reorg payment | Correct evidence states and no duplicate delivery |
| F02-A06 | Merchant-assisted digital fulfillment | Content digest and intended order verified |
| F02-A07 | Static stock exceeded by two buyers | Advisory limitation shown; no fake reservation |
| F02-A08 | Lock/reload during delivery creation | No stale secret release; journal recoverable |
| F02-A09 | HTML/script product content and hostile URL | Inert text or rejection; no unsolicited network fetch |
| F02-A10 | Physical-shipping form | Separate disclosure consent and encrypted retention |

## Implementation slices and commands

1. Catalog decoder, canonical commitment adapter, and cart arithmetic in owned paths; verify malformed catalogs and immutable revisions.
2. Checkout coordinator integrated through F03/F08; verify purchase-intent provenance and fee review.
3. Encrypted order journal plus manual delivery state machine; verify unknown outcomes, partial payment, replay, and lock.
4. Static export and proposed `apps/web/e2e/future-ghoststore.spec.ts`; verify keyboard/mobile journeys and network disclosure behavior.

Manifest-defined commands below were inspected, **not executed**:

```sh
npm run test -w @ghostpay/merchant-hooks
npm run test -w @ghostpay/invoice-schema
npm run test -w @ghostpay/merchant-ledger
npm run typecheck -w @ghostpay/web
npm run lint -w @ghostpay/web
npm run build -w @ghostpay/web
npm run test:e2e -w @ghostpay/web
```

## Migration, rollout, rollback, owner decisions

Default disabled. Existing payment buttons may be imported as unsigned catalog drafts with explicit provenance; never manufacture historic order entitlement. Use transactional encrypted migrations with an export checkpoint. Rollback disables new checkout/catalog signing but retains existing order recovery and receipt viewing; it must not erase unresolved orders or digital delivery evidence.

Owner decisions: accepted fulfillment modes, inventory wording, tax-field treatment, shipping data retention, eligible chains/assets, refund policy, and whether autonomous delivery merits an independent module. Release requires browser qualification, exact-head evidence, independent review of entitlement logic, and explicit approval; the spec branch alone authorizes none of those actions.
