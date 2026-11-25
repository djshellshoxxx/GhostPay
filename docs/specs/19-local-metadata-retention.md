# 19 Local metadata retention controls (#287 item 4, v1.1 Beta)

Source: [issue #287](https://github.com/djshellshoxxx/GhostPay/issues/287) item 4. Ported onto main from the
`v11-04-retention` work of the 2026-11-20 privacy candidate line (`8c196d12`, `5a9d3fba`, `47fd706f`, `6bc2b3ee`,
`9442492a`; the specification text is `docs/privacy-release/v11-04-retention.md` on
`resume/receipt-retention-tor-fixture-20261124`). Those branches are preserved unchanged.

## Contract

- Only proven nonessential metadata is eligible; anything not on the allowlist stays protected.
- A user-configurable, device-local preference that starts **off**. Manual cleanup previews the category and count and
  needs explicit confirmation. A confirmation binds the registry revision; a stale, replayed or cancelled plan clears
  nothing.
- Never delete, automatically or manually: encrypted vaults, sole-copy keys, backups, pending or unknown attempts,
  recovery records, signer pins, or anti-reuse, duplicate, reorg, tombstone or other security evidence. No origin-wide
  clear. Timers run only while the page is open.

## Implemented: on-screen presentation copies (this slice)

| Category | What is closed | What stays | Code |
|---|---|---|---|
| Invoice preview | The generated invoice result on Create invoice (link, Copy, QR); a link not yet copied cannot be shown again | Form inputs, seller keys, the invoice registration and every saved record; links already shared remain valid | `CreateInvoice.tsx` (`useInvoicePreviewRetention`) |
| Payment proof preview | The shown proof QR and text for a payment whose local receipt is `included` | The payment result, transaction hash, receipt copy and download, invoices, vaults, journals and backups. Pending, reverted or unverified proofs are never enrolled | `PaymentRequestQr.tsx` (`PaymentProofQr`), `Pay.tsx` (`proofSource`) |

- `lib/metadataRetention.ts`: one registry per category, holding only clear callbacks (no record data or storage
  handle), bounded to 32 registrations.
- Preferences are stored under `ghostpay.invoice-preview-retention.v1` and `ghostpay.proof-preview-retention.v1`. Values
  are `{"delay":0|300000|900000|3600000}`. Anything else, oversized or ambiguous reads as off.
- Consent for invoice previews never authorizes proof cleanup.
- Controls sit next to each preview (`MetadataRetentionControls`), with preview, count, confirm and cancel. Settings
  shows the two preferences only (`manual={false}`), because no preview is on screen there. The controls re-read the
  preference on window focus and drop an open confirmation if the preference changed in another tab.
- Feedback is accessible: each outcome appears in an always-mounted polite live region; focus returns to the preview
  button after confirm or cancel; an expiry, which happens without user action, is announced next to the closed
  preview (`retention.expired`, `retention.proof.expired`).
- The invoice preview is the only on-page copy of a new link (its passphrase fields are already cleared). The scope,
  confirmation and expiry texts say to copy the link first, because this page cannot show it again.

## Not implemented here

- **Persistent timestamp cleanup** (invoice registration time and receipt archive time in the encrypted reconciliation
  vault; donors #383, #587, #609). It changes the vault document format (older versions cannot open a cleaned vault)
  and needs its own review against current main's reconciliation code.
- **Merchant template issuer adapter.** That screen is full-profile only, beside deferred merchant features, and is
  excluded from the beta.
- The tab-scoped address-reuse history (`ghostpay.destination-review.v1`, #674) is advisory data. It is cleared when
  the tab closes and is not a retention category.
