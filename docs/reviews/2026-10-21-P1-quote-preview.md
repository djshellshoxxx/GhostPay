# Phase B review: P1 quote and payment preview

Date: 2026-10-21. Reviewer: documentation author (self-run; not independent). Playbook: Proposal 1 (quote and preview), APP_AND_RELAYER_SPEC section 1 view 4. Related audits: 01 (P1-1..P1-4, G-03, G-04, A-04, A-12), 03 (S3-01, S3-19), ADR-0012.

## Scope reviewed

`apps/web/src/lib/pay.ts` and `payExec.ts` (review, calldata equality gate, execution), `packages/chain-adapters/src/fees.ts`, `quote.ts` (Chainlink reader and conversion), `router.ts` (calldata builders and `assertPreviewMatchesCalldata`), and the Pay view.

## What the feature does

The Pay page builds one preview object (chain, token, one-time destination, gross, fee, net, expiry, quote source and time, fee recipient from the manifest). The wallet transaction is built from the same object; before sending, the final calldata is decoded and compared with the preview; after sending, the transaction is re-read through the user's RPC and compared again. Expired invoices and quotes, unknown chains and tokens, mainnets, bad totals and invalid signatures block payment.

## Evidence (existing tests)

| Check | Test |
|---|---|
| Fee maths and boundaries | `fees.test.ts`: "dust 399 delivers fully; 400 delivers 399", "overflow boundary mirrors the contract panic...", "properties: fee+net=gross, floor bound, fee<gross", "is minimal and sufficient" (`grossForNet`) |
| Preview computed correctly | `pay.test.ts`: "computes gross, 0.25 % fee and net (seller pays)", "payer-pays grosses up so the seller nets the invoice amount", "blocks totals that do not add up" |
| Blockers | "blocks expired invoices and expired fiat quotes", "blocks mainnets (disabled) and unknown chains", "blocks tokens that are not allowlisted", "blocks an invalid signature", "says payments are disabled when no manifest is loaded (absent or invalid)" |
| Preview equals calldata | "REFUSES when the calldata was mutated after the preview was made", "REFUSES a changed target, value, or a different preview than the reviewed amounts", "REFUSES when token or chain in the preview differ from the invoice" |
| Wallet mutation after send | `payExec.test.ts`: "REFUSES (reports) a wallet that mutates the transaction before broadcasting", "catches a wallet that redirects value or the destination", "catches a wallet that lies about the chain"; Playwright "refuses when the wallet mutates the transaction" |
| Fiat quotes | `quote.test.ts`: "accepts a healthy round", "boundary: age exactly maxAge is ok, +1 is stale", "zero / negative / oversized answers", "round integrity", "decimals", "fails closed when the feed read throws...", "rounds up for the payer and down for the seller", "property: payer amount >= seller amount ..."; `pay.test.ts`: "fiat-quote invoices need an RPC and a configured feed (fail closed)", "converts fiat with a fresh feed, rounding up for the payer" |
| Signature wording | `pay.test.ts`: "never says \"verified seller\"; shows the key and \"not pinned\"", "describes a pinned key as pinned, still not as a legal identity" |

## Checklist

- [x] Preview built from the object the wallet call is built from.
- [x] Final calldata decoded and asserted equal; independent re-read of the transaction through the user RPC.
- [x] Stale/expired quote blocks payment; rounding direction tested; decimals handled.
- [x] Fail closed on parse errors.
- [ ] **Quote source is real:** `FEEDS` is empty (ADR-0012): the fiat path is unit-tested only with an injected feed; with real config it refuses.
- [ ] **Preview parity with the compiled router is executed:** until the anvil differential test lands (in progress), parity rests on shared vectors and a source regex (audit A-04; `FEE_SCHEDULE.md` section 4).
- [ ] **Manifest is trusted:** the equality gate compares against the same manifest value, so a poisoned manifest passes every check (S3-01, **High**, in progress).
- [ ] Included vs final receipts: status is only included/reverted/unconfirmed (audit P1-3).
- [ ] Approval timing: approval is sent before the final preview and left in place after an abort (S3-19).

## Residual risks and gaps

1. S3-01 dominates: the preview proves "the transaction matches what the manifest said", not "the manifest is right".
2. The independent re-read needs the payer's own RPC. A payer with no RPC gets an honest "could not verify" message, not a block.
3. Only mock wallets and mock RPC were used (audit W-14).
4. Token behaviour is assumed from the allowlist; no real token was exercised through the client.

## Verdict

The mechanism is well tested against mocks and is the right design. It is not an end-to-end guarantee until manifests are authenticated and a real testnet run exists.
