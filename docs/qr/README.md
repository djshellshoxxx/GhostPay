# QR and device exchange: status and documents

- [USER_GUIDE.md](USER_GUIDE.md): scanning, invoices, multi-part codes, settings transfer, encrypted backup, receipts and camera errors.
- [DEVELOPER_REFERENCE.md](DEVELOPER_REFERENCE.md): payload families, limits, parser rules, multipart, camera, settings v2, secrets boundary and tests.
- [CHAIN_URI_MATRIX.md](CHAIN_URI_MATRIX.md): per-chain payment request formats and validation.
- [PHYSICAL_DEVICE_ACCEPTANCE.md](PHYSICAL_DEVICE_ACCEPTANCE.md): real-device checklist. **All pending.**
- [SECURITY_REVIEW.md](SECURITY_REVIEW.md): AI-assisted adversarial review of this workstream and its dispositions.

## Completion matrix

Pinned to branch `claude/kind-faraday-8qzf6e` (stacked on #113, which contains #98, #95 and `main`). The Oct 23
assessment (`docs/FEATURE-ASSESSMENT-2026-10-23.md`, about 83 %) pre-dates #95 and #98. Each status below was
re-checked against current source, not that assessment.

"Remaining" counts automatable work only. Physical-device acceptance is tracked separately and is 100 % pending for
every row.

| Feature | Implementation (source) | Tests | Status | Remaining |
|---|---|---|---|---|
| Shared payload classification | `apps/web/src/lib/qrClassify.ts` (12 families, fail-closed, delegates to owning parsers) | `qrClassify{,.fuzz}.test.ts` | Implemented and tested | 0 % |
| Invoice QR import in Pay | `views/Pay.tsx` `importInvoiceQr` → `openFragment` → preview → ordinary review; wrong-family hints; multipart | `Pay.invoiceQr.test.tsx` (forged / corrupted / expired / hostile prefix / wrong family / multipart), e2e virtual camera | Implemented and tested | 0 % |
| Invoice QR display | `views/CreateInvoice.tsx` single code, or GPQ1 parts when too long | `CreateInvoice.test.tsx` | Implemented and tested | 0 % |
| EVM payment request | Invoice link (product path). EIP-681 builders exist; plain EIP-681 is named, never paid | payment-uri vectors | Implemented; plain EIP-681 deliberately not a GhostPay payment | 0 % |
| Bitcoin / Solana / TRON request QR | BTC view (`bitcoin:?sp=`), `PlainPaymentRequest` (Solana Pay, GhostPay `tron:`) | view tests, payment-uri vectors | Implemented and tested (test networks) | 0 %; third-party wallet interop unverified |
| Public device pairing (settings) | settings exchange v2 (`packages/qr-exchange/src/settings-exchange.ts`, `lib/settingsExchange.ts`, Settings view): section selection, per-section preview, opt-in, trust confirmation, atomic apply | `settings-exchange.test.ts`, `Settings.exchange.test.tsx` | Implemented and tested | 0 % |
| Public seller pairing | `qr-exchange/src/seller.ts`, `views/SellerPairing.tsx` (#95) | `SellerPairing.test.tsx`, e2e `sellerpairing`, e2e virtual camera | Implemented and tested | 0 % |
| Encrypted keystore backup and transfer | `lib/keystore.ts`, SellerKeys export/import, SECRET frame, optional multipart parts | `SellerKeys*.test.tsx`, e2e `recovery`, `passphrase-vault` | Implemented and tested | 0 % |
| Tag archive and key rotation (spec 08) | `lib/tagArchive.ts`, `lib/tags.ts` (atomic rotation) | `tagArchive*.test.ts`, `tagsConcurrency.test.ts` (crash injection, KATs) | Implemented and tested; file transfer, not QR (by size, up to 20 MB) | 0 % |
| Multipart QR reliability | `Assembler` (`missing()`, expiry), `CameraImporter multipart` (progress, missing list, Start over, refused-session suppression) | `assembler.test.ts`, `multipart.test.ts` (fuzz), `CameraImporter.multipart.test.tsx`, e2e animated scan | Implemented and tested | 0 % |
| Camera lifecycle and UX | `camera.ts` (deviceId, error classes), `CameraImporter` (hidden page, switch, unmount, image import) | `camera.test.ts`, `readers.test.ts`, `CameraImporter.lifecycle.test.tsx`, e2e virtual camera (start-on-click, stop paths, denied) | Implemented and tested in a browser engine | 0 %; real permission UIs unverified |
| Receipt and payment-proof QR | `ReceiptPanel` (seller QR), Pay receipt import bound to the invoice, `PaymentProofQr` | `ReceiptPanel.test.tsx`, `receipts.test.ts`, `PaymentRequestQr.test.tsx`, e2e `receipt-lean`, `flows` | Implemented and tested; a payer proof is export-only by design | 0 % |
| Accessibility | labelled controls, status/alert regions, focus kept on Start over, reduced-motion stepping, axe audits | e2e `accessibility`, `devices` (viewport emulation), unit tests | Implemented; automated checks pass | screen-reader and 200 % text on real devices pending |
| Documentation | this folder, package READMEs, `docs/wiki/QR-and-Devices.md` | n/a | Updated | GitHub wiki publication pending (see wiki page note) |

**Classification: implementation complete, not device-qualified.**

## Explicitly deferred or out of scope

- Network pairing server: not specified; device exchange is QR/paste/file only.
- Fountain-coded animated QR (for example UR/BC-UR): not added. GPQ1 loops, and missed parts are caught on the next pass.
- QR transfer of tag archives: they can be up to 20 MB, beyond the 32 KiB multipart limit, so they move as files.
- Plain EIP-681 payments through GhostPay: these cannot express a stealth payment. They are named, never paid.
