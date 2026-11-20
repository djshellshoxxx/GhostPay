# F09 — GhostPOS private in-person checkout

- Specification version: 1.0; prepared 2026-11-19.
- Branch: `future/f09-ghostpos`.
- Pinned source base: `c977b5d6723f6822c3b5d86cd6b231712c53c395`.
- Status: **SPECIFICATION ONLY; implementation and release remain disabled.**
- Shared requirements: [COMMON.md](../COMMON.md); [module catalog](../README.md).
- Existing beta requirements and fee policies remain separate; this document does not activate a product.

## Objective and user journeys

Let a merchant prepare and follow an in-person QR checkout on a local browser without a centralized POS operator, buyer account, cloud printer, or hosted transaction database. The terminal must separate request issuance, observed payment, and final settlement clearly enough for an operator to decide whether to release goods.

1. Merchant enters a sale total, selects an allowed asset/network and short validity window, then issues a fresh signed invoice and QR.
2. Customer scans or imports the request, independently reviews the merchant fingerprint and exact payment terms, and authorizes payment on their own device.
3. Terminal obtains payment evidence through its explicitly selected scan provider and displays pending, partial, sufficient-but-unconfirmed, or final status.
4. Operator closes the sale, optionally exports a local receipt, and starts another sale without a page refresh or retained customer data.

Offline invoice preparation is supported only by available local provider capabilities. Offline finality verification is not claimed. A screenshot, customer wallet “submitted” message, or unverified webhook never marks a sale settled.

## Source provenance and reuse

Source proposal: [GhostPOS](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/docs/future/privacy-first/09-ghostpos.md).

| Existing source / export | Reuse | Future work |
|---|---|---|
| [merchant-hooks/src/pos.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/merchant-hooks/src/pos.ts): `posReduce`, `INITIAL_POS_STATE`, `buildQrPayload` | Pure terminal-session reducer and QR payload bounds | Evidence-qualified checkout orchestration and operator UI |
| Same file: `MIN_SESSION_TTL`, `MAX_SESSION_TTL`, `MAX_QR_BYTES` | Existing 30–900 second window and 2,953-byte payload ceiling | Explicit capability-dependent rendering and expiry handling |
| [PaymentRequestQr.tsx](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/components/PaymentRequestQr.tsx) | Current request QR presentation | Session cleanup and multi-sale interaction |
| [merchant-ledger/src/reconcile.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/merchant-ledger/src/reconcile.ts): `reconcile` | Exact amount reconciliation | Evidence identity, finality, late payment, and reorg states |
| [qr-exchange/src/index.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/qr-exchange/src/index.ts) | Existing local QR exchange mechanisms | Accessible import alternative and camera lifecycle integration |

`posReduce` accepts internal incremental payment events and has absorbing terminal states. Its `paid` state is not cryptographic payment evidence. Preserve its contract through an adapter rather than feeding unverified or cumulative totals into it.

## Ownership and dependencies

Own proposed `apps/web/src/features/future/ghostpos/`: checkout screen, sale coordinator, evidence adapter, operator history, and receipt handoff.

Hard providers: [F03 private links](https://github.com/djshellshoxxx/GhostPay/tree/future/f03-private-payment-links-spec), [P03 local scanning](https://github.com/djshellshoxxx/GhostPay/tree/future/p03-local-stealth-scanning), [P05 encrypted local state](https://github.com/djshellshoxxx/GhostPay/tree/future/p05-encrypted-local-state). Optional [F08 GhostID](https://github.com/djshellshoxxx/GhostPay/tree/future/f08-ghostid) provides managed merchant personas; optional [FEE01](https://github.com/djshellshoxxx/GhostPay/tree/future/fee01-modular-fee-policy) handles any separately approved add-on.

F09 never owns scanning transport, signing keys, or invoice cryptography. Excluded: cashier access to spending keys by default, automatic refunds, customer identity capture, guaranteed offline settlement, recurring billing, and remote POS management.

## Proposed contracts and data model

```ts
interface PosSaleV1 {
  readonly schema: 'ghostpay.pos-sale/1';
  readonly saleId: string;
  readonly sessionId: string;
  readonly revision: string;
  readonly invoiceDigest: string;
  readonly chainId: string;
  readonly assetId: string;
  readonly dueAtomic: string;
  readonly expiresAt: number;
  readonly state: 'awaiting' | 'partial' | 'pending-finality' |
    'final' | 'expired' | 'cancelled' | 'disputed';
}
interface PosEvidenceV1 {
  readonly saleId: string;
  readonly observationId: string;
  readonly chainRef: string;
  readonly amountAtomic: string;
  readonly canonical: boolean;
  readonly finality: 'unverified' | 'observed' | 'final';
}
interface GhostPosProvider {
  readonly capability: CapabilityDescriptorV1;
  prepare(input: unknown, ctx: OperationContext): Promise<ModuleResult<{ reviewId: string }>>;
  issue(reviewId: string, ctx: OperationContext): Promise<ModuleResult<PosSaleV1>>;
  observe(saleId: string, ctx: OperationContext): Promise<ModuleResult<readonly PosEvidenceV1[]>>;
  close(saleId: string, expectedRevision: string,
    ctx: OperationContext): Promise<ModuleResult<{ archivedSaleId: string }>>;
}
```

COMMON operation/result/handle rules apply. Amount strings are canonical atomic units; internal arithmetic uses `bigint`. Sale IDs are random local identifiers without buyer identity. The encrypted journal stores invoice binding and evidence references; sensitive QR payloads are accessed through F03 scoped handles and are not embedded in logs or public status URLs.

## State lifecycle, failures, and recovery

Opening a terminal starts idle; issuing creates exactly one active sale. Evidence is deduplicated by chain transaction/output identity before converting its newly accepted delta into legacy POS events. Cumulative totals never become repeated deltas. Sufficient amount before finality is displayed as pending-finality, not final.

Expire/cancel closes new request presentation and clears its QR. Late funds are still recorded against the archived invoice in a review queue; they cannot resurrect the old sale or count toward the next one. Overpayment is shown exactly and requires a separately approved refund decision.

Reorg after a sale closes creates a dispute on the durable sale evidence. It does not rewrite the old reducer into a fictional new unpaid checkout. Network loss shows last verified status and the time/coverage of evidence; restoration reconciles before changing the settlement label.

Lock aborts scans and revokes invoice/QR handles. Camera tracks, object URLs, temporary images, and visible notes are released. Session epoch, sale revision, and operation ID must match before any callback updates the active screen. Reload restores encrypted evidence into a review state, never automatically opens a fresh signer request. Only one tab may own active issuance for a terminal profile under P05 coordination.

## Validation and proposed budgets

- Preserve existing 30–900-second session TTL and QR byte ceiling. A request too large for the selected error-correction capacity offers a file/link alternative; never truncate it.
- Initial UI allows one active sale per terminal, 100 recent summary rows, and an encrypted archive budget of 10,000 sales before explicit archival review.
- Asset/network support must match the provider descriptor; no optimistic fiat conversion or inferred token decimals.
- Proposed scan refresh budget: no more than one active bounded scan operation, and at most one refresh every five seconds when foreground and authorized. Provider policy may be stricter.
- Clock rollback or large jump invalidates freshness-dependent actions until explicit refresh/review. Expiry uses the invoice/provider clock policy, not an animated countdown alone.
- No buyer name, email, phone, or address field in the default sale model. Optional merchant notes are local encrypted text with a proposed 500-character cap.

## Privacy and leakage model

| Surface / observer | Remaining visibility | Required response |
|---|---|---|
| Nearby people/cameras | Visible sale QR, amount, merchant | Short-lived display, clear on close/lock, no donor history screen |
| Merchant | In-person encounter and payment evidence | No default customer profile or unnecessary retention |
| Public chain | Sender/value/time and withdrawal graph | Honest labels; fresh addresses do not hide encounter timing |
| RPC provider | Approved scanning requests | P03 policy; no customer identifier requests |
| Receipt/printer recipient | Deliberately exported details | Local download/print preview; no cloud printer integration by default |

## Fee behavior

The customer sees itemized existing protocol fees and network gas before payment, and the merchant sees expected net/gross accounting. A local checkout screen introduces no automatic POS surcharge. Optional paid services require explicit FEE01 quotes and independent consent; missing quotes block only that service. Quote changes invalidate review. Fee rates, recipients, refund economics, and physical-goods release policy remain owner decisions.

## Acceptance matrix

| ID | Scenario | Required result |
|---|---|---|
| F09-A01 | Two consecutive sales without reload | Unique sessions, correct focus, no inherited approval or evidence |
| F09-A02 | Wallet screenshot or unsigned event | No final/paid settlement indication |
| F09-A03 | Replayed or cumulative payment observations | Exact one-time deltas; no duplicated total |
| F09-A04 | Partial and overpaid sale | Accurate amounts and explicit operator action |
| F09-A05 | Expired QR paid late | Archived late-payment review, no next-sale credit |
| F09-A06 | Offline terminal | No false finality; last evidence state visible |
| F09-A07 | Lock during scan/QR generation | Camera and sensitive display cleared; late callback ignored |
| F09-A08 | Reorg after goods released | Durable disputed state and evidence retained |
| F09-A09 | QR exceeds selected capacity | Safe link/file alternative, no payload alteration |
| F09-A10 | Two terminal tabs issue concurrently | One active authority; stale operation refused |
| F09-A11 | Keyboard/mobile operator flow | Accessible amount entry, status announcements, and cancel controls |

## Implementation slices and existing commands

1. Adapter from verified evidence to POS state in owned paths; test incremental/deduplicated amounts and terminal semantics.
2. P05 sale journal and single-owner lifecycle; test late payments, reorg disputes, crash/reload, and lock.
3. Issuance/review/QR UI using F03; test expiry, second sale, printing disclosure, and offline labels.
4. Proposed `apps/web/e2e/future-ghostpos.spec.ts`; qualify physical camera/printing workflows separately from emulation.

Manifest-defined commands are documented, **not executed**:

```sh
npm run test -w @ghostpay/merchant-hooks
npm run test -w @ghostpay/merchant-ledger
npm run test -w @ghostpay/qr-exchange
npm run typecheck -w @ghostpay/web
npm run lint -w @ghostpay/web
npm run build -w @ghostpay/web
npm run test:e2e -w @ghostpay/web
```

## Migration, rollout, rollback, owner decisions

Default disabled. Existing POS reducer state imports as advisory history until corresponding invoice/chain evidence is validated. Never upgrade a legacy `paid` string to finality. Schema migration preserves closed-sale records and unresolved funds. Rollback disables new terminal issuance but retains history, recovery, and ordinary invoice payment access.

Owner decisions: supported finality policies and cashier key roles, release-of-goods wording, receipt defaults, archival policy, physical device matrix, and supported networks/assets. Exact-head browser/evidence tests and operator acceptance are required before a release proposal.
