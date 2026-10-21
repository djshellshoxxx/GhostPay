# @ghostpay/ux-intake

Pure, DOM-free, network-free intake logic for GhostPay. Every parser takes untrusted strings and returns
`Result` (never throws on user input; only invalid developer configuration throws `TypeError`).

| Spec id | Module | Purpose |
| --- | --- | --- |
| `qr-scan` | `payload.ts`, `qr.ts`, `address.ts` | Classify scans (invoice fragment link, `ghostpay:` URI, raw address), size caps, multi-frame reassembly, camera permission view-model |
| `deep-link-share` | `deeplink.ts` | Deep links, Web Share Target params, scheme/host/route allowlists, open-redirect rejection, fragment-safe display and log redaction |
| `nl-amount` | `nlamount.ts` | `twenty usdc`, `1,5 eth`, `1.5k` to exact `bigint` base units with locale-aware separators and homoglyph rejection |

Specs: `docs/remote/usability/specs/{qr-scan,deep-link-share,nl-amount}.md`.
Wiring: `docs/remote/usability/wiring/ux-intake.md`. Audit: `docs/remote/usability/audit-ux-intake.md`.

Invoice fragments are bearer secrets (ADR-0005). Results carry the raw `fragment` only so it can be passed to
`parseFragment`; display and log with `safeDisplay` / `redactForLog`.
