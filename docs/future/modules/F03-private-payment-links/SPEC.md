# F03 — Private payment request interchange

Status: owner-authorized implementation, 2026-11-19; separate feature branch.
Branch: `future/f03-private-payment-links`.
Baseline: `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`.

## Outcome and existing foundations

A seller downloads the invoice already created in GhostPay. A payer opens the file locally and
reviews exactly the same signed intent as its link or QR. This completes the missing file
interchange path in `docs/future/privacy-first/03-private-payment-links.md`.
Existing signed envelopes, encryption/passphrase options, multipart QR, signer pins, supported
assets, expiry and explicit transaction approval remain authoritative. No new crypto is needed.

## Version 1 file and public API

The UTF-8 JSON object has exactly these keys:

```json
{"format":"ghostpay-payment-request","version":1,"fragment":"#gpi=v1.<unchanged-envelope>"}
```

Use `ghostpay-request.gpr.json` and MIME `application/json`. Include no origin, labels, timestamp,
separate payment fields, passphrase, trusted-seller claim or decrypted invoice copy.

In `@ghostpay/invoice-schema` add:

- `serializePaymentRequestFile(fragment: string): string`.
- `parsePaymentRequestFile(text: string): PaymentRequestFile`, returning the three readonly fields.
- `MAX_PAYMENT_REQUEST_FILE_BYTES` (24 KiB), `PAYMENT_REQUEST_FILE_NAME`, and a typed fixed-message
  error for safe UI handling. Constants for format/version may also be exported.

Reuse `parseStrictJson` and canonical base64url decoding. Reject missing/duplicate/unknown/
forbidden keys, wrong types or versions, invalid prefixes/encodings and oversized input.
Keep the existing 16 KiB decoded-envelope limit. Check character/UTF-8 bounds before JSON work.
Permit formatting whitespace around outer JSON, but never trim, normalize, reconstruct or re-sign
the fragment. Serialization preserves it byte-for-byte. Both functions are synchronous, DOM-free,
without network/storage/signing. Transport parsing is not invoice authentication; `openFragment`
continues to verify schema, cryptography, signer status and passphrase requirements.

## Browser acceptance

1. Add explicit download beside copy-link and QR after invoice creation; export the original
   `visibleCreated.fragment`. Use the existing safe download helper and generic filename.
2. Add dedicated request-file selection inside the existing invoice import disclosure. Check
   declared size before reading, actual bytes afterward, and strict UTF-8. MIME/extension are hints.
3. Stage the unchanged fragment through the existing QR preview/open boundary. Selection alone
   must not connect a wallet, authorize RPC, navigate, persist an import history or submit payment.
4. Preserve explicit opening and ordinary full payment review. A parsed file is not a verified
   seller. Invalid signatures never enable payment. Passphrase files use existing unlock behavior.
5. Invalidate stale reads/previews on replacement, invalid replacement, clear, disclosure close,
   hidden page, unmount, session/lock, build-profile or parent scope change. Same-file retry works.
6. Preserve current lean/full supported-invoice restrictions and link/QR/paste behavior.

## Privacy and threat boundaries

Wrapping adds no encryption: the file has the same disclosure as its original link. A fragment
carrying its own decryption key is readable by its holder; passphrases travel separately. Download
history, local backups, syncing and forwarding can retain files. Existing public-chain and wallet
visibility do not change. Never log contents or include invoice details in filenames/errors.

The absent origin permits opening in another compatible GhostPay deployment without fetching
the source host. Users must independently trust that app. Do not claim arbitrary third-party
wallets understand this format, that request files prove payment, or that requests enforce global
single-use. No analytics, server lookup, QR-host allowlist relaxation or settlement changes.

## Evidence and completion gate

Codec tests cover exact ordinary/encrypted/passphrase preservation, strict schema/encoding/size
boundaries, deterministic serialization and secret-free diagnostics. Independent integration
tests open real signed invoices from URL, multipart QR and files and compare digest/signature/
terms. Tampering is refused by the existing canonical invoice boundary.

Browser tests cover download/import/review, passphrase, bad/oversized files, same-file retries,
all cancellation/supersession boundaries and no network/wallet side effects. Run original affected
package tests/coverage/typecheck/lint/build, scoped web tests and static build. Run actual supported
browsers where available; document gaps without treating DOM tests as browser execution.

After implementation, fresh workers audit specification, standards and defensive privacy/security.
Repair verified defects and obtain follow-up review. Keep source-pinned outcomes and successor
instructions. Deployment, main merge and release qualification remain separate.
