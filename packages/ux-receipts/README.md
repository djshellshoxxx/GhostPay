# @ghostpay/ux-receipts

Pure logic for payment receipts / proof of payment. No DOM, no network, no timers.

- `createReceipt(record, policy)` builds a shareable receipt (selective disclosure; `PRESETS.minimal|standard|full`).
- `canonicalJson`, `sha256Hex` (WebCrypto) give a reproducible integrity digest.
- `parseReceipt` / `verifyReceipt` strictly validate an untrusted receipt; an injected `ChainVerifier` is the only way to corroborate on-chain.
- `renderText` / `renderJson` for sharing; `analyzeDisclosure` for pre-share privacy warnings.

Honest limit: the digest is a checksum, not a signature. A self-consistent receipt proves nothing about a payment.
Key material (spending/viewing/stealth keys, seeds) cannot enter: unknown/key-like fields are rejected and secret-like memos refused.

Docs: docs/remote/usability/specs/ux-receipts.md, wiring/ux-receipts.md, audit-ux-receipts.md.
