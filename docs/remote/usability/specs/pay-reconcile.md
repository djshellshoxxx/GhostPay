# Spec: pay-reconcile: Invoice-to-payment reconciliation via payer proof
Impact 5/5 | Effort M | Score 2.5 | Build wave 1 | Depends on: local-store

## Problem
The chain carries no invoice id (SPEC_REVIEW A1; ADR-0003), so the seller sees "0.5 ETH from someone" and cannot tell which invoice was paid; single-use is enforced only off-chain.

## Exists today (verified in repo) vs missing
- apps/web/src/lib/payExec.ts:142-160 payer receipt includes invoiceNonce, txHash, net amount.
- apps/web/src/views/Scan.tsx:147-152 describe(match) shows amount only.
- docs/SPEC_REVIEW.md:9 (A1) removed on-chain invoiceId deliberately.
- Missing: everything described under Design.

## Design
(1) Seller ledger records each issued invoice (nonce, token, expected net amount, expiry, status). (2) Heuristic suggestions: unmatched scan matches proposed against open invoices by token + exact expected net within [issued, expiry] window; ambiguity shown, never auto-confirmed. (3) Exact path: payer "proof code" = base64url{nonce, chainId, txHash} (+ optional seller-signature challenge not needed); seller pastes it, the package verifies against a scanned match whose announcement tx equals txHash. Match status: open -> suggested -> confirmed -> swept. (4) Expiry/replay: a nonce already confirmed rejects second proof.

## Privacy and security impact
No new on-chain data. Proof code reveals tx hash and nonce to whoever receives it (the seller, over the user's chosen channel); UI warns. Does not link payer wallet beyond what chain already shows.

## Build ownership
- NEW package: `packages/pay-reconcile` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/pay-reconcile`.
- Public API (exports from `src/index.ts`):
- `suggestMatches(open: IssuedInvoice[], matches: LedgerMatch[]): Suggestion[]`
- `encodeProof(p: {nonce; chainId; txHash}): string; decodeProof(s): Proof (strict, size-bounded)`
- `confirm(ledger, proof, matches): Result  // verifies txHash == match tx and token/amount within invoice`
- `status machine: transition(inv, event)`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

## UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/views/Scan.tsx (suggestion chips, "Paste payment proof")
- apps/web/src/views/Pay.tsx (show proof code after submit)
- apps/web/src/lib/payExec.ts (receipt gains proof)
- Add `@ghostpay/pay-reconcile` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

## Requirements
1. **PAYRE-1** MUST Never auto-confirm an ambiguous heuristic match.
2. **PAYRE-2** MUST decodeProof rejects >512 bytes, non-canonical base64url, bad hex, and unknown versions.
3. **PAYRE-3** MUST A nonce can be confirmed once; second proof returns ALREADY_CONFIRMED.
4. **PAYRE-4** MUST Amount comparison uses bigint and the invoice net after fee policy.
5. **PAYRE-5** MUST Match requires same chainId and token.
6. **PAYRE-6** SHOULD Ledger shows partial/over payments distinctly.
7. **PAYRE-7** SHOULD Warn when proof tx predates invoice issue time.

## Acceptance tests
1. **T-1** Two open invoices with equal amounts -> both suggested, none confirmed.
2. **T-2** Valid proof for match tx -> confirmed; replay -> ALREADY_CONFIRMED.
3. **T-3** Proof with txHash not in matches -> NOT_FOUND.
4. **T-4** Fuzz decodeProof: never throws non-ProofError.
5. **T-5** Underpayment -> status "partial".
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.
