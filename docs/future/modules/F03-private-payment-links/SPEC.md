# F03 — Private payment links and QR exchange

- Specification version: 1.0; prepared 2026-11-19.
- Branch: `future/f03-private-payment-links-spec`.
- Pinned source base: `c977b5d6723f6822c3b5d86cd6b231712c53c395`.
- Status: **SPECIFICATION ONLY; implementation and release remain disabled.**
- Shared requirements: [COMMON.md](../COMMON.md); [module catalog](../README.md).
- This branch specifies a future product; it does not change current beta acceptance, production configuration, custody, fees, or deployed behavior.

## Objective and journeys

Make one validated payment request portable across a link, QR image, and downloaded file while preserving authenticity, exact terms, explicit wallet consent, and private metadata handling. The product layer coordinates existing invoice and QR providers; it does not introduce another invoice cryptosystem.

1. Recipient chooses one-time invoice or reusable request policy, verifies the disclosure preview, and deliberately shares one representation.
2. Payer imports that representation. Parsing, authentication, expiry, asset support, and selected signer-pin policy are evaluated before a payment review appears.
3. Payer reviews chain, asset, amount, destination, fee, and wallet disclosures. Every changed term requires renewed approval.
4. A second incoming request replaces the current review only through an explicit state transition; it cannot inherit a prior request's approval.

Reusable policy, unsigned request, and signed invoice are separate trust categories. QR format recognition is not authentication. A signature confirms authorship under a key, not real-world identity or final settlement.

The independently active branch `future/f03-private-payment-links` is preserved. This dedicated spec branch uses the `-spec` suffix to avoid overwriting that concurrent implementation; all source-reuse claims below remain pinned to the stated base.

## Source provenance and reuse inventory

Scope: [original payment-link proposal](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/docs/future/privacy-first/03-private-payment-links.md).

| Existing source and exports | Reuse | Future gap |
|---|---|---|
| [invoice-schema/src/index.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/invoice-schema/src/index.ts): `encodeFragment`, `parseFragment`, `openFragment`, `isSignatureVerified`, `isTrustedSeller` | Canonical authenticated `#gpi=v1.` handling | Cross-medium review lifecycle and explicit trust labels |
| [payment-uri/src/index.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/payment-uri/src/index.ts): `buildInvoiceLink`, `parseInvoiceLink`, `parsePaymentUri` | Existing URI families and boundaries | Capability-gated wallet conversion without semantic loss |
| [merchant-hooks/src/link.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/merchant-hooks/src/link.ts): `assertPaymentLink`, `assertBaseUrl` | Allowed static link construction | Share policy and normalized origin display |
| [qr-exchange/src/index.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/qr-exchange/src/index.ts) | Existing camera, multipart, and rendering surfaces | Import transaction context and resource cleanup |
| [qrPayload.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/qrPayload.ts): `parsePublicMetaQr` | Public receiving metadata validation | Prevent public metadata being confused with signed invoice authority |

## Scope and dependencies

Own proposed `apps/web/src/features/future/private-payment-links/`: import coordinator, share chooser, review model, trust explanation, and cross-medium parity tests. Existing `AppShell`, Pay, QR, and invoice parsers remain shared surfaces; integrations require explicit ownership coordination.

Hard provider: [P04 encrypted authenticated invoices](https://github.com/djshellshoxxx/GhostPay/tree/future/p04-encrypted-offline-invoices). Optional providers: [P09 gas services](https://github.com/djshellshoxxx/GhostPay/tree/future/p09-noncustodial-gas-services) and [P10 private submission](https://github.com/djshellshoxxx/GhostPay/tree/future/p10-private-submission). An unavailable optional provider leaves the request reviewable and blocks only the selected execution route.

Excluded: centralized URL shorteners, invoice lookup services, auto-connect wallet on import, silent chain switching, automatic payment after scanning, broadening chain support, and advertising bearer links as confidential to their holders.

## Proposed interface and data model

```ts
interface ImportedRequestV1 {
  readonly schema: 'ghostpay.request-view/1';
  readonly requestId: string;
  readonly payloadDigest: string;
  readonly source: 'url' | 'qr' | 'file' | 'paste';
  readonly trust: 'unsigned' | 'signature-valid' | 'pinned-signer';
  readonly purpose: 'single-invoice' | 'reusable-policy';
  readonly chainId: string;
  readonly assetId: string;
  readonly amountAtomic?: string; // Required for single-invoice; selected later for reusable policy.
  readonly expiresAt: number;
}
interface PaymentLinksProvider {
  readonly capability: CapabilityDescriptorV1;
  inspect(input: SecretHandle, source: ImportedRequestV1['source'],
    ctx: OperationContext): Promise<ModuleResult<ImportedRequestV1>>;
  prepareShare(requestId: string, medium: 'url' | 'qr' | 'file',
    ctx: OperationContext): Promise<ModuleResult<{ shareHandle: SecretHandle }>>;
  review(requestId: string, ctx: OperationContext):
    Promise<ModuleResult<{ reviewId: string }>>;
}
```

`SecretHandle` is opaque and nonserializable; provider-scoped callbacks expose bearer material only to the selected rendering/download action and dispose it afterward. Public review objects contain no passphrase, private key, note plaintext, or full invoice fragment. `payloadDigest` identifies exact validated bytes; it is not a public tracking identifier. Persisted history requires an approved encrypted-state provider and explicit retention choice.

A single-invoice view requires an amount. A reusable-policy view has no signable review until an explicit choice satisfies authenticated bounds; absence is never interpreted as zero. Money is parsed from canonical decimal strings into `bigint`; asset decimals are provider-verified. Converting an invoice into a wallet URI must prove the wallet URI preserves required chain/asset/amount semantics; otherwise that route is unavailable.

## Lifecycle and failure semantics

Import states: idle → bounded input → decoding → authentication/passphrase-needed → ready/unsupported/invalid. Review states: ready → reviewed → signer-requested → submitted/unknown → observed/final/failed.

Passphrase prompts occur only after bounded envelope validation and never claim signature validity before decryption/authentication succeeds. Cancellation closes camera tracks, temporary object URLs, pending decoders, and retained buffers. On lock or visibility policy expiry, invalidate the session epoch and clear sensitive render state.

Every asynchronous import holds `{operationId, sessionEpoch, signal, deadlineMs}`. A newer import supersedes old callbacks. Approval binds the imported digest and wallet context; edits, pin changes, chain changes, provider revocation, or expiry clear it. Retrying a wallet prompt is distinct from retransmitting an uncertain transaction.

Remove sensitive URL fragments through the existing safe history path after capture, preserving unrelated path/query/history state. Failure to clean history is visible and prevents a false “cleared” claim. Back navigation and repeated same-view imports must not resurrect old payment approval.

## Validation and proposed budgets

- Respect existing `MAX_DECODED_BYTES`, `MAX_URI_LENGTH`, `MAX_INVOICE_LINK_LENGTH`, and QR provider limits. Never raise parser ceilings merely to make a QR fit.
- Proposed imported-file ceiling: the smaller of provider envelope limit and 1 MiB; reject before expensive decryption or image decoding.
- Permit one active import and one signer prompt per session. Proposed image decode deadline: 10 seconds with abort and cleanup; mobile measurements may justify a revised explicit budget.
- Strict primitive types, canonical UTF-8/base64url/JSON, duplicate-field rejection, known schema and encryption algorithm, finite safe-integer times, and amount bounds.
- Validate selected origin before rendering a share link. No credentials, plaintext secrets in queries, or unapproved external resource references.
- A reusable policy must be labeled reusable and generate a fresh payment intent; a local “used” marker is not a universal prevention of public-chain replay.

## Privacy and threat model

| Surface | Disclosure / limitation | Requirement |
|---|---|---|
| Browser history/clipboard | Bearer material may be retained | Explicit copy action and history cleanup; no guarantee of OS erasure |
| Messaging previews | Recipient or messaging software may inspect links | No shortener or preview fetch; explain bearer access |
| Camera/image import | Nearby people and images can expose QR | Permission-on-demand, local decode, track cleanup |
| Wallet and RPC | Account, transaction terms, network metadata | Preview disclosure; no extra lookup solely for presentation |
| Invoice signer | Reused key links requests | Show trust accurately; optional identity separation belongs elsewhere |

## Fee behavior

Creating, parsing, printing, and importing local requests do not themselves create a protocol charge. Execution preserves the existing fee policy; optional gas/private-submission quotes are separately itemized. No quote can change signed payment terms silently. Unknown fees, expired quotes, different recipients, or unsupported wallet fee semantics fail closed. This spec approves no fee schedule or recipient.

## Acceptance matrix

| ID | Scenario | Expected verification |
|---|---|---|
| F03-A01 | URL, file, QR for identical invoice | Same digest, trust, and exact payment terms |
| F03-A02 | Truncation, duplicate fields, tampering | Rejection before wallet/network side effect |
| F03-A03 | Wrong password then valid password | No false authentication or residual secret state |
| F03-A04 | Second link arrives during first decode | Only newest context may install a review |
| F03-A05 | Chain/account/pin changes after review | Approval revoked synchronously |
| F03-A06 | Unsupported wallet URI conversion | Route unavailable; original request remains intact |
| F03-A07 | Camera cancelled or page locked | Streams and temporary resources disposed |
| F03-A08 | Wallet response uncertain | No automatic new transfer; original attempt retained |
| F03-A09 | History replacement throws | Honest cleanup state; no swallowed privacy failure |
| F03-A10 | Request expires during signing preparation | No stale transaction handoff |
| F03-A11 | Repeated same-view requests | Correct focus and fresh review without hard reload |

## Implementation slices and existing commands

1. Implement common import/view contract and cross-medium fixtures in owned feature paths; cover strict trust distinctions.
2. Integrate cancellable decoding and history lifecycle, preserving existing shared parser tests.
3. Add share chooser and wallet handoff guards; verify no semantic loss and quote invalidation.
4. Add proposed `apps/web/e2e/future-payment-links.spec.ts` for sequential imports, keyboard access, mobile camera alternatives, and egress capture.

Commands exist in inspected package manifests; **not run for these specs**:

```sh
npm run test -w @ghostpay/invoice-schema
npm run test -w @ghostpay/payment-uri
npm run test -w @ghostpay/qr-exchange
npm run typecheck -w @ghostpay/web
npm run lint -w @ghostpay/web
npm run build -w @ghostpay/web
npm run test:e2e -w @ghostpay/web
```

## Rollout and open decisions

Keep disabled until provider contracts and all matrix cases qualify. Continue accepting existing supported `#gpi=v1.` formats through their current parser; new outer metadata is additive and cannot bypass old authentication. Migration must preserve original bytes/digest and never re-sign imported invoices. Rollback returns to existing payment entry points while retaining pending transaction evidence and independent recovery.

Owner decisions: permitted base origins, initial wallet URI formats, reusable-policy UX, default retention, camera availability matrix, and whether imported unpinned signatures require a stronger confirmation step. Browser and external-wallet acceptance must be recorded at an exact commit; no compatibility claim follows from this design alone.
