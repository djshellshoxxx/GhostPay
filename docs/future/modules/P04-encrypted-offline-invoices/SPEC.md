# P04 — Encrypted authenticated offline invoices

> **Specification only.** Documentation and branch creation authorized on 2026-11-19. Implementation, merge, activation, deployment and release are outside this task. Default disabled. No executed-test or qualification claim.

| Field | Value |
|---|---|
| Module | `P04` / `encrypted-offline-invoices` |
| Branch | `future/p04-encrypted-offline-invoices` |
| Baseline commit | `c977b5d6723f6822c3b5d86cd6b231712c53c395` |
| Source tree | `2634456ffa35681e799f71b72bb907f946a77618` |
| Hard dependencies | [P06](https://github.com/djshellshoxxx/GhostPay/blob/future/p06-key-role-separation/docs/future/modules/P06-key-role-separation/SPEC.md), [P11](https://github.com/djshellshoxxx/GhostPay/blob/future/p11-metadata-timing-policy/docs/future/modules/P11-metadata-timing-policy/SPEC.md) |
| Optional integrations | None |
| Shared contracts | [COMMON.md](../COMMON.md); [inventory](../README.md) |

All API sketches are proposed, not current exports. Common types are `OperationContext` (operationId/sessionEpoch/signal/deadlineMs), `ModuleResult<T>`, `CapabilityDescriptorV1`, and opaque nonserializable `SecretHandle`. Use bigint internally and bounded decimal strings in JSON.

## 1. Objective and provenance

Create, authenticate, encrypt and exchange invoices locally without a hosted merchant account or invoice database. Recipients can validate the exact payment intent, distinguish signer authenticity from merchant identity and see what a bearer link reveals. Offline preparation must not imply current chain, price or deployment verification.

Sources: [issue #284 P04](https://github.com/djshellshoxxx/GhostPay/issues/284), [issue #283 Track A](https://github.com/djshellshoxxx/GhostPay/issues/283), and [architecture 5f](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/docs/future/privacy-architecture/5f.md). P06 supplies independent invoice-signing capability; P11 supplies metadata minimization. F03 owns link/QR workflow presentation and consumes this provider without a reverse import.

## 2. Existing implementation and remaining delta

- [Invoice exports](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/invoice-schema/src/index.ts) includes `createInvoice`, `validateInvoice`, `canonicalInvoiceBytes`, `signInvoice`, `verifyInvoiceSignature`, `encodeFragment`, `parseFragment`, `openFragment` and trust-level helpers.
- [Passphrase policy](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/invoice-schema/src/passphrase.ts) exports bounded scrypt settings; retain its reviewed formats rather than introducing another encryption primitive.
- [Invoice creation](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/invoiceCreate.ts) and [fragment handling](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/fragment.ts) are current browser integration points.
- [QR package](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/qr-exchange/src/index.ts) is retained transport work; this module returns typed encoded payloads and never owns a duplicate QR renderer.
- [Session](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/session.ts) separates invoice signing from viewing/spending and enforces stale-session guards.

The delta is a versioned provider facade, explicit offline validation state, privacy-minimal field selection and bounded import/export acceptance across consumers. Existing signed/encrypted envelopes remain canonical; documentation alone changes no format.

## 3. Scope and owned state

Own invoice construction/opening adapters, minimal draft schema and local validation results. Exclude merchant identity directories, fiat feed querying, transaction sending, automatic remote profile fetching and recovery formats. P11 is a pure policy input; it never receives signing keys. P06 signs only the canonical bounded invoice domain.

Drafts stay in memory unless a consumer explicitly stores them through P05; P04 has no direct P05 dependency and accepts an optional generic persistence port only at the consumer layer. Sensitive fields never become URL query/path values, analytics events or request diagnostics.

## 4. Proposed data and API

```ts
interface InvoiceDraftV1 {
  version: 1; chainId: string; assetId: string;
  amountAtomic: string;
  expiresAt: string; // Canonical unsigned decimal UTC epoch milliseconds.
  recipientMetaAddress: string;
  metadataPolicyId: string;
  privateFields?: Readonly<Record<string, string>>;
}
interface InvoiceArtifactSummaryV1 {
  version: 1; canonicalDigest: string; artifactDigest: string; encodedBytes: number;
  validation: 'offline-structural';
  disclosureCodes: readonly string[];
}
interface PreparedInvoiceV1 {
  version: 1; artifact: SecretHandle;
  summary: InvoiceArtifactSummaryV1;
}
interface InvoiceExportPreviewV1 {
  version: 1; previewId: string; canonicalDigest: string; artifactDigest: string;
  sinkId: string;
  medium: 'url' | 'qr' | 'file'; encodedBytes: number;
  sessionEpoch: number; disclosureCodes: readonly string[];
  expiresAt: string; // Canonical unsigned decimal UTC epoch milliseconds.
}
interface OfflineInvoiceProvider {
  prepare(draft: InvoiceDraftV1, signer: SecretHandle,
    ctx: OperationContext): Promise<ModuleResult<PreparedInvoiceV1>>;
  open(artifact: SecretHandle, passphrase: SecretHandle | undefined,
    ctx: OperationContext): Promise<ModuleResult<OpenedInvoice>>;
  previewExport(artifact: SecretHandle, medium: 'url' | 'qr' | 'file',
    sink: InvoiceArtifactSink, ctx: OperationContext): ModuleResult<InvoiceExportPreviewV1>;
  authorizeExport(previewId: string, approvedArtifactDigest: string,
    ctx: OperationContext): ModuleResult<InvoiceExportGrant>;
  export(artifact: SecretHandle, grant: InvoiceExportGrant,
    sink: InvoiceArtifactSink, ctx: OperationContext):
      Promise<ModuleResult<{ published: boolean }>>;
  revokeArtifact(artifact: SecretHandle): void;
  capability(): CapabilityDescriptorV1;
}
```

The facade version does not rename existing signed invoice versions or change signature bytes. `SecretHandle` holds the bearer envelope in a provider-owned scope; no public result exposes an `envelope: string`. F03 supplies an imported bounded artifact handle, which remains untrusted until P04 validates it. `OpenedInvoice` returns a minimal authentication/expiry summary plus scoped handles for private fields, never decrypted notes or a bearer fragment in a general public result.

`InvoiceExportGrant` is a provider-issued, nonserializable, single-use authority bound to artifact digest, selected medium/sink, operation and session epoch. `InvoiceArtifactSink` is a closed reviewed renderer/download/clipboard adapter, not an arbitrary plugin callback. The preview captures the selected sink identity and exact encoded `artifactDigest`; `canonicalDigest` identifies invoice semantics and cannot substitute for the artifact-byte digest. Only that explicitly approved sink receives transient bearer bytes; it cannot return them through the result. Previewing, serializing a summary or knowing its ID does not authorize export. Revoke handles/grants on lock, expiry, cancellation and disposal; a cloned/forged object never passes provider registration checks.

Both `expiresAt` fields use canonical unsigned decimal UTC epoch milliseconds with bounded range and exact integer parsing. Adapt legacy signed invoice expiry in UTC seconds through exact conversion: refuse non-second-aligned draft expiry instead of rounding or extending it. Existing signed bytes remain unchanged. This network-free provider returns only `offline-structural` preparation status; current payment eligibility is computed separately by the consumer after manifest, chain and quote checks. Metadata minimization happens before canonicalization/signing; no signed field is removed afterward.

## 5. Lifecycle and failure rules

1. Choose asset/network, exact amount, expiry and privacy-minimal metadata locally.
2. Validate schema and key role; show which content is public, encrypted, or available to any link holder.
3. Capture operation/session and sign canonical bytes with invoice-authentication capability.
4. Encrypt using the existing approved envelope and fresh randomness when selected. Recheck session before publishing.
5. Preview the selected artifact/medium, obtain `authorizeExport` after an explicit gesture, then consume that grant at the approved sink. Previews never auto-copy or auto-download secrets. Recheck artifact digest, session, expiry and sink binding immediately before releasing transient bytes.
6. Import through bounded strict parsing and decrypt locally. Reject tampering before installing any draft or identity pin.
7. Before payment, a consumer rechecks expiry, selected chain, verified manifest and applicable quote; offline success is insufficient.

Lock/cancel/seller replacement disposes temporary bytes and prevents late export. Clock movement cannot silently extend signed expiry. Reorg does not mutate invoice bytes; it changes later payment evidence. An encrypted link containing its own decryption secret is a bearer artifact, not recipient authentication.

## 6. Proposed bounds

Respect the existing invoice parser's 16 KiB decoded envelope budget and stricter per-field limits. Draft input: 32 KiB before normalization; no more than 50 line items, 2 KiB optional text per field or 8 KiB optional text total, subject to current lower limits. Reject duplicate/prototype keys, excessive depth and unsupported versions.

Run one expensive KDF per tab operation, cap accepted parameters to existing policy before allocation, and apply a 30-second user-cancellable operation budget. Imported files are bounded before reading fully. Rendering is text-only; remote images, fonts or profile URLs never load automatically. Proposed budgets need browser/mobile benchmarking.

## 7. Privacy and trust matrix

| Observer / failure | Exposure | Required treatment |
|---|---|---|
| Bearer-link holder | All decryptable invoice contents | Explicit bearer disclosure; separate-secret mode if supported |
| Host/referrer | Path/query and navigation metadata | Fragment-only sensitive transport; clear fragment promptly |
| Wallet/RPC | Payment fields when execution begins | Separate consumer disclosure and selected endpoint policy |
| Invoice signer | Key control, not real-world identity | Distinguish signature verification from identity trust |
| Browser/clipboard | Displayed/copied content | Explicit copy, minimal retention and lock redaction |
| Tampered envelope | Substitution or cost amplification | Authenticate, bound parsing/KDF and reject atomically |

## 8. Pricing policy

Offline creation, opening, minimization and encrypted exchange remain free local functionality. A normal protocol payment may still carry its existing fee, shown by the payment consumer. No fee is incurred for encryption toggles or opening a link. Optional future paid merchant services require their own defined service and consent; P04 sets no new recipient or price.

## 9. Acceptance cases

- **P04-A01:** Offline preparation/opening succeeds with network completely disabled and emits no requests.
- **P04-A02:** Canonical existing vectors remain byte-identical when no new policy is selected.
- **P04-A03:** Minimization removes only optional fields before signing; required amounts, chain and fee terms remain authenticated.
- **P04-A04:** Wrong passphrase/tampering/oversize parameters fail without partial draft installation.
- **P04-A05:** Spend/view keys cannot be used as invoice-authentication handles.
- **P04-A06:** Lock/cancel/key replacement during KDF prevents download, clipboard writes and late rendering.
- **P04-A07:** Expired/offline invoices cannot become payment-eligible without current checks.
- **P04-A08:** Bearer and separately conveyed secret modes have truthful exposure labels.
- **P04-A09:** URL/history/referrer/log traces contain no unintended private fields.
- **P04-A10:** Legacy encrypted invoices round-trip across supported browsers; actual device export/import is separately recorded.
- **P04-A11:** Preparation/opening summaries contain no bearer envelope or decrypted private fields; artifact handles cannot be serialized or reused after disposal.
- **P04-A12:** Export preview alone, forged grant, changed artifact/medium, or an already consumed grant produces no clipboard/download/render side effect.
- **P04-A13:** Exact UTC-millisecond to legacy-second conversion preserves signed expiry; nonaligned/ambiguous times refuse without extending invoice lifetime.

## 10. Slices and future verification

Slice 1 inventories current formats and freezes compatibility vectors. Slice 2 adds offline-state and metadata-policy adapters. Slice 3 integrates P06 scoped signing/cancellation. Slice 4 independently verifies imports, browser exchange and full/lean artifact boundaries.

Existing future checks, **not executed here**:

```bash
npm run test -w @ghostpay/invoice-schema
npm run typecheck -w @ghostpay/invoice-schema
npm run lint -w @ghostpay/invoice-schema
npm run test -w @ghostpay/qr-exchange
npm run test -w @ghostpay/web
npm run build -w @ghostpay/web
```

## 11. Migration, rollback and decisions

Keep existing envelopes readable and exported formats explicit. Unknown versions are refused without speculative repair. Rollback restores the previous facade while preserving encrypted artifacts and original drafts. Decide any new signed metadata fields via a compatibility ADR before implementation; never retrofit signatures. P04 cannot replace spec 18 recovery or silently convert signed merchant identity trust.
