# Audit: ux-i18n

## Threat model
Untrusted inputs: user-supplied labels/addresses/memos interpolated into messages; Accept-Language / stored locale preference; glossary search queries; text passed to term linking; (future) community-supplied catalogs. Assets: UI integrity (no script injection, no spoofed address display), availability (no hang/crash). No secrets handled; no network, timers, or global state.

## Findings
| # | Sev | Finding | Evidence | Status |
|---|-----|---------|----------|--------|
| 1 | High (prevented) | HTML injection through interpolated values | tests: escaped by default, property test | Fixed by design: value escaping default `html` |
| 2 | High (prevented) | Bidi/zero-width spoofing in displayed values (Trojan Source style) | sanitizeValue tests | Fixed: stripped |
| 3 | Medium | Prototype-key lookups (`__proto__`, `constructor`) | translator and select tests | Fixed: `Object.hasOwn`, key allow-list |
| 4 | Medium | Template/parse DoS | length 2000, depth 4, value cap 1000, link text cap 10k, query cap 100, Accept-Language cap 1 KiB | Fixed |
| 5 | Low | Double escaping if UI uses `html` mode into React text nodes | doc only | Mitigation: wiring says use `text` for text nodes |
| 6 | Low | Syllable/reading-level is an English heuristic | tests show approximate | Accepted; hint only |
| 7 | Low | Catalog templates are trusted; a malicious catalog could embed misleading text (not markup) | n/a | Unverified: catalogs must be bundled/reviewed, not fetched |

## Fixes made during build
Regex escapes for bidi ranges; syllable rule for `-ted/-ded`; locale tests corrected where `bad` is a valid 3-letter language.

## Unverified / limitations
- Behaviour depends on the host ICU data (plural categories, `de` month names); tests ran on one Node 22 build.
- Not integrated into apps/web; no screen-reader or axe testing performed.
- Contrast: opaque sRGB hex only; no alpha blending or APCA.
- Only English content; `ar`/`ru` tested only for plural and RTL logic.
- Focus-order validator is geometric heuristic over supplied data, not a real DOM.
- Branch coverage gaps remain in defensive branches (catalog.ts ~92%).
