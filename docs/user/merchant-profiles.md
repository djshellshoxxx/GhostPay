# Merchant profiles in the full application

A merchant profile is a public document signed by an invoice-signing key. Its signature proves that key signed the
fields; it does not independently identify a business. Profile trust never changes the separate invoice review or
payment authorization.

## Load and check a profile

1. Open **Merchant profile**, enter the merchant's HTTPS profile URL, and review the network disclosure.
2. Choose **Load profile**. This contacts that server and exposes your IP address and the requested path/query.
   GhostPay omits cookies and referrers, refuses redirects, disables caching, and stops requests after ten seconds or
   more than 8192 response bytes. CORS must allow the checkout origin. The signed profile must list its source origin.
3. Review the signed name, signer fingerprint and full signer key. A forged, malformed, expired or oversized profile
   is rejected. Editing the URL or choosing Cancel aborts a pending load; a stale response cannot replace the display.
4. Verify the full signer key through an independent channel. Enter it in the confirmation field and choose
   **Remember verified key for this origin**. The key and HTTPS origin are stored unencrypted in this browser.
5. A later different key produces an identity-change warning. The old key remains saved. Independently verify a
   rotation before explicitly forgetting the old key and confirming the replacement. Storage or browser-lock failure never grants
   trust. Other tabs' storage events and returning focus refresh the displayed pin.

Inline profiles show their signature disclosure, but cannot save an origin key because the inline document has no
HTTPS source binding. Saved keys are local preferences, not a certificate authority, encrypted backup or proof of
merchant identity. Another application on the same browser origin can change that storage; use a dedicated origin.
Writes and removals use nonwaiting Web Locks shared by this origin; a busy or unsupported lock refuses the change.
The profile and displayed key are checked again inside the lock. These preferences do not protect against a compromised checkout, browser, or device.

## Templates and embedding

Signed templates show the exact currency, amount in currency minor units, and validity duration. Large amounts stay
as decimal strings. Template selection does not change an existing invoice or authorize payment. The independently signed invoice is
the payment request; the payer does not have the merchant's signing key.

When the merchant has already loaded the matching seller keys, **Create a merchant invoice from this template**
provides an explicit local issuance action. It requires a verified recoverable backup or the existing backup waiver.
Choose a network/payment asset allowed by both the signed profile and the application's enabled allowlist, enter the
fixed token amount, and choose who pays fees. The template fiat amount and fixed token amount remain separate: a USD
`amountMinor` of `50000` means USD 500.00; a chosen 1.25 USDC means 1,250,000 token base units. No automatic exchange
rate or fiat conversion is inferred. The existing invoice format supports at most 30 minor-unit digits; larger signed
templates are shown but cannot be issued as current-format invoices and are never truncated. The UI displays the exact template duration and preserves it in the new invoice.

A profile signed with `allowAmount: true` permits a decimal amount request in the template currency. The SDK's
`data-amount="500.25"` becomes a request for USD 500.25 when the selected template currency is USD. Invalid precision,
nonpositive amounts, exponent/padded formats and requests without signed permission are refused. A matching merchant
must explicitly sign a new invoice to adopt the request. It cannot mutate or authorize an existing payer invoice.
Editing any issuance field clears the prior output. Key/profile changes, expired profiles, stale actions and lost
backup evidence abort the result. Only the independent new signed link is presented; private keys remain inside the
checkout's existing session signing path and are never sent to the merchant page.

The version 2 embed SDK accepts `data-profile-url="HTTPS_PROFILE_URL"` instead of `data-profile="BASE64URL_PROFILE"`.
`data-template="template_id"` selects a template from that signed profile. Optional `data-amount` requires that template
and profile; the checkout checks the signed permission and currency precision. The SDK only forwards those values; loading
still requires the payer's action. Both profile forms together are rejected. The checkout URL parameters are `gpmu`
for a remote URL, `gpm` for an inline profile, `gpt` for a template and `gpa` for an unsigned decimal amount request. Do not place secrets in the public profile URL.

Popup remains the default. Remote-profile URLs always open a popup immediately in the user's click gesture, even
when iframe mode was requested. Explicit loading cannot fit safely into the inline-profile handshake timeout. The iframe deployment flag and server
`frame-ancestors` allowlist remain mandatory; a profile or saved key does not authorize an embedding origin.
The frozen version 1 SDK is unchanged. Review and regenerate your version 2 SRI hash before changing its deployed file.

This feature is retained in the full application. It is excluded from the lean static EVM beta. Real merchant-host,
external wallet and browser/device acceptance and release SDK hash publication remain separate gates.
