# @ghostpay/ux-links

Pure, dependency-free logic for sharing and receiving payments. No DOM, network, analytics or global timers; clock and randomness are injected.

| Module | Purpose |
| --- | --- |
| `uri.ts` | Build/parse `ghostpay:` URIs. Secrets only in `#k=` fragment; strict canonical encoding; secret-looking query keys rejected. |
| `qr.ts` | QR byte-mode capacity check and minimum version (no rendering). |
| `request.ts` | Payment requests (amount/asset/memo/expiry), validation, status, link bridge. |
| `handle.ts`, `book.ts` | Local pay-me handles, anti-homograph skeleton check, immutable address book with strict JSON import. |
| `tip.ts` | Tip/donation page view-model: presets, goal progress in exact integer math. |

Link format: `ghostpay:<st:eth:0x...>[?amount=&asset=&chain=&exp=&memo=][#k=<base64url secret>]`.

Errors are `LinkError` with a fixed `code`; messages never contain input. Meta-addresses are shape-checked only (curve validity is `@ghostpay/core-crypto`'s job).

Specs and plans: `docs/remote/usability/` (`specs/ux-links-*.md`, `wiring/ux-links.md`, `audit-ux-links.md`).
