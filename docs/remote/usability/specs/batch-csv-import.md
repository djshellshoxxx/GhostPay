# Spec: batch CSV payee import

Package: `@ghostpay/merchant-billing` (`csv.ts`, `address.ts`, `payouts.ts`). Status: implemented.

## Flow
`previewBatch(csv, options)` -> user reviews rows, total, and `previewHash` -> `confirmBatch(preview, confirmedHash)` -> `PayoutPlan` -> `chunkBatches`. No payment object exists before confirm. Confirm recomputes the hash from the preview contents and compares it to both the stored hash and the hash the user confirmed, so any edit between preview and confirm fails.

## Requirements
1. Parser: RFC 4180 subset. LF/CRLF, quoted fields with `""`, one optional BOM, comma only. Rejects: blank lines, ragged rows, stray or unterminated quotes, text after a closing quote, newline inside a field, lone CR, control characters, bidi and zero-width characters. Limits: 1 MiB (UTF-8 bytes), 5000 rows, 200 chars per field.
2. Header exactly `destination,amount,label`.
3. Formula-injection guard on free text: after leading spaces, first character `= + - @ TAB CR` is rejected. Label class is restricted to letters, digits, space and `. , ' _ ( ) / & : # -`, max 64. Export helper `csvEscapeCell` prefixes `'`.
4. Destination: EIP-55 address (mixed case must checksum; lowercase only with explicit option; uppercase never; ASCII only so homoglyphs fail) or canonical `st:eth:` meta-address with valid curve points. Zero address rejected.
5. Amount: plain decimal, at most token decimals, min and per-recipient max.
6. Dedupe: case-insensitive on destination; `reject` (default) or `merge` (summed, re-checked against max).
7. Errors contain row number, field and fixed code only, never cell content.

## Acceptance tests (`csv.test.ts`, `address.test.ts`, `payouts.test.ts`)
- EIP-55 reference vectors accepted; one flipped letter rejected; Cyrillic "a" and fullwidth digits rejected.
- `1250.75` at 6 decimals = 1_250_750_000; `5.0000001`, `1e6`, `-5` rejected.
- `=cmd`, `@SUM(A1)`, `\t=1`, `  =x` rejected.
- Duplicate A (checksum and lowercase forms) rejected; merge gives 5 + 7 = 12 USDC.
- Tampered item, total, or wrong hash at confirm throws.
