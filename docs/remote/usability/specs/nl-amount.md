# Spec nl-amount: natural-language amounts

Package: `packages/ux-intake` (`nlamount.ts`, `text.ts`).

## Requirements
- R1 Input: string <= 128 chars. Outputs `bigint` base units, canonical `normalized` decimal, symbol, decimals; never floating point, never rounds (`too-many-decimals`).
- R2 Forms: digits (`20 usdc`, `1.5 ETH`), multiplier (`1.5k`, `2 thousand`, `3m`, `1b`, also `1.5 k`), English words (`twenty-five`, `one hundred and five`, `two million`, `one point five`). Grammar is strict (`twenty hundred`, `five five`, `thousand` alone rejected).
- R3 Separators: with `locale` from a static table (`en,ja,zh,ko,he,th,hi` dot/comma; `de,es,it,nl,pt,id,tr,da,el,ro,hr` comma/dot; `fr,ru,pl,cs,sv,nb,fi,uk,hu,sk,bg` comma/space incl. NBSP and narrow NBSP; `de-CH` dot with apostrophe or U+2019) the locale decides and is enforced. Unknown locale gives `unsupported-locale`. Without locale: `1,5` is a decimal; `1,234` and `1.234` (one separator followed by exactly three digits after a 1-3 digit lead without leading zero) are `ambiguous-separator`; repeated separators or mixed `1,234.56` / `1.234,56` are unambiguous. Groups must be exactly 3 digits (lakh style rejected).
- R4 Rejected: sign/parentheses/`minus`, exponent, leading zero, leading/trailing separator, currency symbols, `5kusdc`, extra tokens, zero (unless `allowZero`), > 30 digits, > 2^128-1 or `maxBase`.
- R5 Homoglyph defence, in order: invisible/control/bidi (`invisible-char`), letters from two scripts (`mixed-script`, Han/Kana/Hangul merged), any other non-ASCII incl. fullwidth and Arabic-Indic digits (`non-ascii`). Only NBSP, narrow NBSP, U+2019 pass, and only as group separators.
- R6 Asset allowlist (`AssetSpec` symbol, decimals 0..18, lowercase aliases); config is validated (reserved words, duplicates) and throws `TypeError`. Missing asset needs `defaultAsset`.

## Acceptance tests
Numeric table in `src/nlamount.test.ts`, e.g. `20 usdc` -> 20000000, `1,5 eth` -> 1500000000000000000, `1.5k usdc` -> 1500000000, `1,234 usdc` ambiguous, `en` 1234000000 vs `de` 1234000, `1 234,56 usdc` (fr) -> 1234560000, `usdс` (Cyrillic) mixed-script; fast-check: canonical decimals round-trip exactly for 0/6/8/18 decimals, arbitrary strings never throw and only emit allowlisted symbols, every `a{sep}bbb` is ambiguous.
