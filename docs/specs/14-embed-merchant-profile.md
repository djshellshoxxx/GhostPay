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
