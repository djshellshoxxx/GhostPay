# Wiring plan: ux-links -> apps/web

Package is pure; the web app owns rendering, storage, clipboard and QR drawing.

## Files / components (proposed)
- `apps/web/src/features/links/ReceiveLinkPanel.tsx`: form (amount, asset, memo, expiry) -> `createPaymentRequest` -> `buildQrPayload`. Draw QR with the app's existing QR renderer (not in this package); if `LinkError QR`, show "shorten memo".
- `features/links/PayLinkScreen.tsx`: route `/pay#...` and deep link `ghostpay:`; call `requestFromUri(uri, nowSeconds())`; show amount, asset, `fingerprint(target)`, memo as plain text, expiry countdown; expired -> disabled pay button. On parse failure show generic "Invalid link" (map `LinkError.code` to i18n, never raw message).
- `features/links/HandleBook.tsx`: add/list/remove, `findLookalikes` warning banner before save and before pay; import/export via `parseBook`/`serializeBook`.
- `features/links/TipPage.tsx`: render `TipPageModel`; preset buttons open `PayLinkScreen` with `preset.uri`; custom field uses `tipUri`.
- `features/links/RequestList.tsx`: statuses via `requestStatus` with the receiver's observed payments.

## State
- `requests: PaymentRequest[]` and `HandleBook` persisted locally (encrypted vault store, not localStorage plaintext). Clock: one `nowSeconds()` helper injected everywhere. Secrets (`#k=`) kept in memory only; strip fragment (`redactUri`) before any log, history entry or error report; call `history.replaceState` to remove the fragment after reading it.

## i18n keys
`links.invalid`, `links.expired`, `links.tooLarge`, `links.secretInQuery`, `links.confirmRecipient`, `links.fingerprint`, `request.status.{pending,paid,paid_late,expired,cancelled}`, `handle.reason.{TOO_SHORT,TOO_LONG,INVISIBLE,CONFUSABLE_NON_ASCII,NON_ASCII,INVALID_CHARS,BAD_EDGE,DOUBLE_SEPARATOR,ALL_DIGITS,LOOKS_LIKE_ADDRESS,RESERVED,LOOKALIKE_RESERVED}`, `handle.lookalikeWarning`, `tip.goal.{progress,reached,closed,overBy}`.

## E2E ideas
- open a link with `?secret=` -> blocked screen; open valid link -> fingerprint shown; expiry boundary with a fake clock; QR for a 140-char emoji memo shows the shorten message; import a book with `аlice` -> rejected; tip page makes zero network requests (assert via request interception).
