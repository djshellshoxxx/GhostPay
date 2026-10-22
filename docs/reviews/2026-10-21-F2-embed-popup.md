# Phase B review: F2 embed (popup variant)

Date: 2026-10-21. Reviewer: documentation author (self-run; not independent). Roadmap: Feature 2. Related audits: 01 (F2-1..F2-5, G-19), 03 (S3-10, S3-11).

## Scope reviewed

`apps/web/public/ghostpay-embed-v1.js` (66 lines, no dependencies), its tests in `apps/web/src/embed.test.ts` and one Playwright test, and the header policy in `apps/web/public/_headers`.

## What the feature does

A merchant page includes the script and marks a button with a `data-invoice` attribute holding a full invoice link. A click opens the GhostPay checkout in a `noopener` popup. The link must be https (or localhost) and on the **same origin as the script**. There is no iframe mode, no `postMessage` channel, and no completion callback, so the merchant page learns nothing about the result.

The roadmap's design (`data-amount/currency/token/chain/merchant-id`, signed merchant profile, sandboxed iframe, origin-checked messages) is **not built** (audit F2-2, F2-3, F2-4, I-12). The reason for popup-only is partly GitHub Pages' lack of `frame-ancestors` (SPEC_REVIEW A11); on a header-capable host an iframe mode could be added, and nothing here does that.

## Evidence (existing tests)

| Check | Test |
|---|---|
| Opens a `noopener` popup for a same-origin v1 link | `embed.test.ts`: "opens the checkout in a noopener popup for a same-origin v1 invoice link" |
| Button without invoice is disabled; attribute text never rendered as markup | "disables a button with no invoice attribute and never renders attribute text as markup" |
| No network APIs, no HTML injection, no dynamic code, no globals | "is dependency free: no network APIs, no HTML injection, no dynamic code, no globals" |
| Popup opens for same origin and refuses other origins (real browser) | Playwright `e2e/flows.spec.ts`: "opens the checkout popup for a same-origin link; refuses other origins" |
| App cannot be framed | `public/_headers`: `frame-ancestors 'none'`, `X-Frame-Options: DENY` (text-asserted by `scan-bundle.mjs`; never tested on a real host) |

## Checklist (Roadmap F2)

- [x] Zero dependencies, DOM APIs only (tested by source scan in the unit test).
- [x] Attribute values never become markup (tested).
- [x] Anti-clickjacking for the checkout app via headers (config only; GitHub Pages cannot enforce it).
- [ ] Fuzz tests for data attributes and message schema: no fuzzing; there is no message schema.
- [ ] Malicious parent / spoofed message tests: n/a, no channel, so no negative tests either.
- [ ] Publish SDK hash, SRI and CSP examples: not done (S3-10: the script is served from a mutable, versioned-looking URL with `max-age=3600`, no integrity publication).
- [ ] Signed merchant profile: no format exists.

## Residual risks and gaps

1. **Same-origin restriction makes the SDK unusable for merchants on other origins in the intended way.** The script is loaded cross-origin by merchants (`Cross-Origin-Resource-Policy: cross-origin`) but may only open links on *its own* origin. Whether this matches merchant needs was not tested with a real merchant page (web DEVIATIONS "Unverified").
2. **Supply chain of a merchant's page.** A merchant who loads the SDK without SRI trusts the host forever; a compromised host can ship a malicious SDK that opens a lookalike site. The SDK file has no published hash.
3. **Popup phishing.** A popup shows a URL the merchant controls; users must check it. The invoice link is a bearer secret placed in the merchant's page source.
4. **No completion signal** means merchants must reconcile payments by scanning (and today must check balances, S3-02).
5. **Cache:** `max-age=3600` means a bad SDK release lingers for an hour.

## Disclosure

No user-facing guide exists for the embed (merchants only). Add one when the feature is hosted.

## Verdict

Safe enough as a minimal popup launcher on testnets. It is Feature 2 in name only: do not advertise merchant profiles, iframe checkout or callbacks.
