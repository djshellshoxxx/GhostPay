# Spec: receipts: Seller-signed receipts and proof-of-payment export
Impact 4/5 | Effort M | Score 2 | Build wave 2 | Depends on: local-store, pay-reconcile

## Problem
Payers have only a local JSON receipt (Pay.tsx:552) that the seller never signed; sellers issue nothing; disputes rely on screenshots.

## Exists today (verified in repo) vs missing
- apps/web/src/lib/payExec.ts:142-160 payer receipt (unsigned).
- packages/invoice-schema/src/sign.ts signing with the invoice-signing key.
- apps/web/src/views/Pay.tsx:552-557 confirm + download.
- Missing: everything described under Design.

## Design
Receipt v1 = canonical JSON {kind, v, invoiceNonce, chainId, txHash, token, net, issuedAt, signer} signed with the seller invoice-signing key (domain-separated "GhostPay/receipt/v1"). Verifier (offline, pure) checks signature, optional pinned signer, and optional on-chain tx lookup via user RPC. Printable HTML/plain-text rendering without line-item data unless the seller opts in. Payer-side "proof of payment" = tx hash + invoice nonce + seller receipt.

## Privacy and security impact
Receipt contains amount, tx and nonce; no new on-chain data. Opt-in to include line items. Signature proves seller key control, not identity (same caveat as invoices).

## Build ownership
- NEW package: `packages/receipts` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/receipts`.
- Public API (exports from `src/index.ts`):
- `issueReceipt(p: ReceiptPayload, signingKey: SecretScalar): SignedReceipt`
- `verifyReceipt(r: unknown, opts: {pinnedSigners?}): VerifyResult`
- `renderReceiptText(r): string`
- `encode/decode (canonical, size-bounded)`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

## UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/views/Scan.tsx (Issue receipt on a confirmed match)
- apps/web/src/views/Pay.tsx (Import/verify seller receipt)
- Add `@ghostpay/receipts` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

## Requirements
1. **RECEI-1** MUST Canonical encoding identical across runs (reuse invoice-schema canonical JSON).
2. **RECEI-2** MUST Domain separation prevents invoice signature being replayed as receipt signature.
3. **RECEI-3** MUST verifyReceipt never trusts unsigned fields; unknown keys rejected.
4. **RECEI-4** MUST Issuing requires status "confirmed" from pay-reconcile.
5. **RECEI-5** MUST Signing key never leaves SecretScalar handling.
6. **RECEI-6** SHOULD Receipt number (monotonic per profile) stored in ledger.

## Acceptance tests
1. **T-1** Tamper any field -> INVALID_SIGNATURE.
2. **T-2** Invoice signature bytes re-labelled as receipt -> fail.
3. **T-3** Pinned signer mismatch -> verified but not trusted.
4. **T-4** Canonical output stable against fixture.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.
