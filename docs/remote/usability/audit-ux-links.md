# Audit: ux-links

## Threat model
Attacker controls: link/QR text, imported handle books, memos/titles shown to a payer, and can craft look-alike handles. Goals: leak a secret to a server, redirect funds, spoof identity, crash/DoS the parser, pollute objects.

## Findings and fixes
| # | Sev | Finding | Evidence | Status |
| - | - | - | - | - |
| 1 | High | Secret in query would reach servers/logs | `SECRET_IN_QUERY` tests (12 spellings) | Rejected on parse; builder has no query secret path |
| 2 | High | Homograph handles (Cyrillic `а`, fullwidth, `l`/`1`/`I`) | handle.test.ts | Non-ASCII rejected; skeleton collision refused at add/import |
| 3 | Med | Bidi/zero-width memo spoofing | text tests | Rejected (Cc/Cf/Zl/Zp/Co/Cn, NFC required) |
| 4 | Med | Malleable encodings (`%7e`, `1.50`, `+`) cause duplicate-looking links | uri/amount tests | Canonical-only |
| 5 | Med | Prototype pollution / getters via JSON import | request/book tests | `exactRecord` rejects unknown keys, accessors, symbols, odd prototypes |
| 6 | Low | Oversize input DoS | length caps first (2048 URI, 512 KiB book, 1000 entries) | Fixed |
| 7 | Low | Forged "never expires" links | far-future test | Payer rejects > 365 d |
| 8 | Info | Errors could echo secrets | message test | Fixed strings only |

## Unverified / limits
- QR capacity table typed from memory of ISO/IEC 18004 byte-mode figures; anchors v1, v2, v40 are tested, intermediate versions are not independently verified against a QR library. Verify before relying on exact `minVersion`.
- Meta-address is shape-checked only; curve validity not checked here.
- Confusable table is a small curated subset, not full Unicode TR39; the ASCII-only rule is the real defence. Skeleton is aggressive and will reject some legitimate handles (e.g. `rn`/`m`).
- Handles are not unique across users; they are local labels.
- Expiry and status are advisory (clock supplied by caller; not on-chain).
- No tests for actual UI wiring; apps/web not touched.
