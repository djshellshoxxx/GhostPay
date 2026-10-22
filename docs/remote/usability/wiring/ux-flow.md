# Wiring plan: @ghostpay/ux-flow

Add `@ghostpay/ux-flow` to `apps/web/package.json`; no other deps. Apply one feature at a time (shared hot files: state.tsx, App.tsx, lib/services.ts).

## pay-reconcile
- `apps/web/src/lib/payExec.ts`: after submit, `encodeProof({nonce: invoiceNonce, chainId, txHash})` into the receipt (`receipt.proof`).
- `apps/web/src/views/Pay.tsx`: show proof code with "Copy payment proof" and a warning that it reveals the tx hash and nonce to the recipient.
- Seller side (needs local-store): persist `Invoice[]` at invoice creation (`CreateInvoice.tsx`, `newInvoice`; expected = net after fee policy, token lowercased). `Scan.tsx`: map scan matches to `Transfer`, run `reconcile` on load, render chips for `suggested`/`ambiguous`; "Paste payment proof" input calls `confirm`; map error codes to i18n keys `reconcile.err.<CODE>` and statuses to `reconcile.status.<status>` (partial/overpaid/late shown with distinct badges); `TX_BEFORE_ISSUE` -> `reconcile.warn.txBeforeIssue`. A suggested chip must require an explicit seller click that calls `transition(..., {type:'payment', transfer})` (unconfirmed) - never automatic.
- e2e: two equal invoices -> two chips, none confirmed; paste valid proof -> paid; paste again -> already-confirmed message.

## policy-undo
- New `lib/undoQueue.ts` holding an `UndoQueue(() => Date.now())` (clock injected only here), persisted via `snapshot()` / `restore()` in local-store. Policy edit forms submit with `delayMs` (default 60 s) and show a toast "Undo" button with `remainingMs`; a 1 s UI tick re-renders. Copy: "This is a local grace period. Anything already sent on-chain cannot be undone here." i18n `undo.*`.

## embed-snippet
- `CreateInvoice.tsx` Embed tab after link creation: label input, variant select, two checkboxes, textarea from `makeSnippet(link, location.origin, opts)` in try/catch (map BAD_* to messages), copy button, bearer-link warning (`embed.warn.public`).
- e2e: DOMParser round trip (one button, one script); hostile label.

## embed-return (blocked on schema field `returnOrigin`)
- `Pay.tsx` post-submit: if `isAllowedReturn(invoice, target)` render "Return to merchant" anchor to `buildReturnUrl(...)` with `rel="noopener noreferrer"`; otherwise render nothing. Verify seller signature via `checkSignedReturn` using the existing invoice-signature verifier as the callback.
