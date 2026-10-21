# Spec: pay-reconcile: Invoice-to-payment reconciliation via payer proof
Impact 5/5 | Effort M | Score 2.5 | Wave 1 | Depends on: local-store (storage only; this module is pure)
Built in: `packages/ux-flow` (`src/proof.ts`, `src/reconcile.ts`, `src/base64url.ts`). Supersedes the planned `packages/pay-reconcile` name; scaffold was `ux-flow`.

## Problem
The chain carries no invoice id (SPEC_REVIEW A1; ADR-0003), so the seller sees "0.5 ETH from someone" and cannot tell which invoice was paid. Single-use is enforced off-chain only.

## Exists today vs missing
- Payer receipt has invoiceNonce, txHash, net amount (apps/web/src/lib/payExec.ts:142-160); Scan.tsx shows amount only.
- Missing: seller invoice ledger model, matching, proof code, partial/over/duplicate handling (all below).

## Data model (pure, no storage)
- `Invoice {nonce (lowercase hex 16-64), chainId, token (lowercase string), expected: bigint > 0 (net after fee policy), issuedAt, expiresAt (unix s), status, paid: bigint, txs[], confirmedTx?, suggestedTx?, late?}`.
- `Transfer {txHash (lowercase 0x+64 hex), chainId, token, amount: bigint > 0, observedAt}`.
- `Tolerance {absolute: bigint >= 0, bps: int 0..10000}`; effective tolerance = max(absolute, floor(expected*bps/10000)), inclusive.
- Statuses: open, suggested, partial, paid, overpaid, swept, expired, cancelled.

## API (exported from `src/index.ts`)
- `classifyAmount(expected, paid, tol) -> exact|tolerated|partial|over`
- `transition(inv, event, tol) -> Invoice` (events: suggest, payment{transfer, confirmed?}, expire{now}, cancel, sweep). Throws `FlowError INVALID_TRANSITION`.
- `reconcile(invoices, transfers, tol) -> {invoices, outcomes}`; outcomes: suggested | ambiguous | duplicate(repeat-tx|invoice-settled) | unmatched. Deterministic: transfers processed in (observedAt, chainId, txHash) order.
- `encodeProof / decodeProof / MAX_PROOF_LENGTH` (512). Proof = unpadded base64url of canonical JSON `{"v":1,"n":nonce,"c":chainId,"t":txHash}`.
- `confirm(invoices, proofOrCode, transfers, tol) -> {ok:true, invoices, nonce, amountClass, warnings} | {ok:false, error}` errors: BAD_PROOF, UNKNOWN_INVOICE, ALREADY_CONFIRMED, NOT_FOUND, MISMATCH, DUPLICATE_TX, INVALID_TRANSITION.

## Transition table
| from | event | to |
|---|---|---|
| open | suggest | suggested |
| open, suggested, partial, expired, paid, overpaid | payment | partial / paid / overpaid by cumulative paid vs expected+tolerance (expired or observedAt > expiresAt sets `late`) |
| open, suggested, partial | expire (now > expiresAt only) | expired |
| open, suggested | cancel | cancelled |
| paid, overpaid | sweep | swept |
Everything else (payment on cancelled/swept, cancel of partial, ...) is INVALID_TRANSITION. A repeat of an already-applied txHash is a no-op.

## Requirements
1. **PAYRE-1** MUST Heuristic matching never applies money or confirms. A unique candidate becomes `suggested`; several candidates yield `ambiguous` and change nothing. Only exact/tolerated amounts are heuristically matched; partial/over need a proof.
2. **PAYRE-2** MUST decodeProof rejects > 512 chars, non-canonical base64url (padding, wrong alphabet, trailing bits), invalid UTF-8/JSON, extra/missing keys, non-canonical JSON, bad hex/case, bad chain, unknown version; throws only `FlowError`.
3. **PAYRE-3** MUST A nonce confirms once; any later proof for it returns ALREADY_CONFIRMED. A txHash applied to one invoice cannot be applied to another (DUPLICATE_TX).
4. **PAYRE-4** MUST All amounts bigint; compare against invoice net amount; no float anywhere.
5. **PAYRE-5** MUST Candidate/confirm requires same chainId and token; heuristic also requires observedAt in [issuedAt, expiresAt].
6. **PAYRE-6** SHOULD partial and over (and `late`) statuses are distinct and reported by `confirm.amountClass`.
7. **PAYRE-7** SHOULD `confirm` warns TX_BEFORE_ISSUE when the tx was observed before issuedAt.

## Acceptance tests (all implemented in `src/reconcile.test.ts`, `src/proof.test.ts`)
1. **T-1** Two open invoices, equal amounts -> ambiguous, both stay open, inputs not mutated.
2. **T-2** Valid proof -> confirmed/paid; replay (same or different tx) -> ALREADY_CONFIRMED.
3. **T-3** Proof tx not in transfers -> NOT_FOUND.
4. **T-4** fast-check fuzz of decodeProof (strings and bytes): never non-FlowError.
5. **T-5** Underpayment -> partial; top-up -> paid; surplus -> overpaid.
6. **T-6** Tolerance boundaries inclusive; > 2^53 amounts exact.
7. **T-7** Duplicate: repeated tx, second tx onto settled invoice -> duplicate.
8. **T-8** reconcile output independent of input order (property).
Coverage thresholds (95/90/95/95) enforced by vitest config.

## Privacy and security
No network, no clock (times are inputs), no storage. Proof reveals nonce + tx hash to whoever receives it. Deviations: nonce charset is lowercase hex 16-64 (assumption, check against invoice-schema nonce format at wiring); invoices are identified by nonce; "confirmed" = `confirmedTx` set.
