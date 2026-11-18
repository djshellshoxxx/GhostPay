# 14 Feature 2 embed: signed merchant profile, postMessage mode

Priority P3 | Effort M (5-7 d) | Owner: apps/web + embed SDK | Deps: ADR-0002 (signer pinning), ADR-0015 (hosting) before any public use
Sources: Roadmap Feature 2 (2A/2B); gap-analysis (Feature 2 partial).

## 1. Formats
Merchant profile (JSON, signed with ADR-0002 invoice-signing key):
```json
{"v":1,"merchantId":"<base32 of signer pubkey hash>","name":"...","signer":"0x..pubkey","chains":[8453],"tokens":["USDC"],"templates":[{"id":"t1","amountMinor":"50000","currency":"USD","expires":1800}],"origins":["https://shop.example"],"sig":"..."}
```
Profile retrieved from merchant URL (CORS, https only, size <= 8 KB) or embedded as fragment; payer UI shows signer fingerprint and "unverified identity" unless user pinned it. Attributes `data-template` selects a template; `data-amount` free-form allowed only if profile `allowAmount`. SDK `ghostpay-embed-v1.js`: createElement/textContent only; opens popup (default) or sandboxed iframe (`sandbox="allow-scripts allow-same-origin allow-popups"`, review) only if checkout `frame-ancestors` allowlist includes the merchant origin.
postMessage protocol: `{t:'gp:init'|'gp:status'|'gp:done', n:<128-bit nonce>, v:1, data}`; parent verifies `event.origin === CHECKOUT_ORIGIN` and `event.source === iframe.contentWindow`; checkout verifies origin against profile `origins`; nonce single-use; size cap 2 KB; completion payload `{status, chainId, txHash}` only.
## 2. Threats
As Roadmap 2B: XSS via attributes (strict parsing, fuzz), spoofed messages, clickjacking, supply-chain (versioned URL + SRI + published hash), malicious profile changing amounts (signature + payer-visible canonical fields + expiry), referrer leakage (`no-referrer`). Residual: compromised checkout origin; merchant lookalike buttons.
## 3. Tests
Fuzz attributes and message schema; malicious parent page; origin mismatch; replayed nonce; popup blocked; profile with bad signature/over-size/expired; Playwright with hostile host page.
## 4. Acceptance
- [ ] Roadmap F2 checklist ticked. - [ ] SDK hash published in release. - [ ] No secrets reachable by merchant DOM. - [ ] Default stays popup.


## Implementation continuation — 2026-11-16

The full-profile checkout now provides explicit remote HTTPS loading, signed-field/template presentation and
user-confirmed origin/key pins with change warnings. See `docs/user/merchant-profiles.md` for request boundaries,
local-storage limits and SDK attributes. Inline profiles retain the key-control-only disclosure. Templates never
modify or authorize a separately signed invoice. Matching loaded merchant keys can explicitly issue a new invoice from a selected template, including a signed
`allowAmount`-permitted decimal request. Release SDK hash publication and external merchant/browser acceptance remain open. This does not authorize a
profile or local pin as an iframe, business-identity, invoice or payment credential.


## Merchant issuance and the remaining profile-only checkout decision

The existing seller authority model permits local template issuance: the loaded invoice-signing key must match the
verified profile, and its backup must be recoverable and verified (or the seller must already have typed the existing
waiver). The merchant explicitly selects an enabled, profile-allowed chain/asset, fixed token amount and fee policy.
`buildInvoiceLink` signs a fresh independent invoice. Template fiat minor units are preserved separately from token units. The existing invoice v1/v2 protocol caps fiat
and line-item minor units at 30 decimal digits. Profiles may contain 39 digits; those larger values remain visible but
invoice issuance refuses them explicitly without clipping, rounding or expanding the signed invoice wire format. Template duration is preserved in exact seconds. Optional
`data-amount` is a bounded decimal currency request; only signed `allowAmount` permits it. Neither profile display nor
an amount request changes an existing payer invoice.

The SDK still requires `data-invoice`. A public profile alone cannot produce today's valid invoice: profile v1 has
no stealth meta-address/destination, no fee policy, no token-address binding or pricing policy, and its signature uses
`GhostPay.MerchantProfile.v1` rather than the invoice signature domain. A token symbol and fiat amount do not supply
those missing authorizations. Reusing the profile signature as an invoice signature would fail verification and must
not be introduced.

Two concrete expansion choices remain for unattended attribute-only checkout:

1. Keep the current signature model and define an authenticated per-order invoice issuance transport. A merchant
   signing service would retain signing authority; specify service custody, request authentication, response bounds,
   order replay/idempotency and merchant availability before wiring it. The new local issuance flow requires no such
   service and already generates usable `data-invoice` links.
2. Define a new signed profile/payment-intent schema that binds the stealth meta-address, exact permitted chain/token
   addresses, fee authority, pricing/quote limits, nonce/order semantics and expiry, plus an explicit payer verifier
   compatible with that new authorization domain. This changes payment authority and requires schema/threat-model
   approval; adding fields or bypassing the existing invoice verifier is not an implementation detail.

No new custody service, signing credential, profile-authorized payment verifier, or destination/fee default was
silently selected. This is the exact remaining scope decision; it does not block merchant-side local issuance.
