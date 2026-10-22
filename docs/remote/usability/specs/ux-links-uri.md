# ux-links-uri: payment links and QR payload

## Requirements
- R1 `buildPaymentUri` emits `ghostpay:<meta>[?amount&asset&chain&exp&memo in that fixed order][#k=<secret>]`; equal inputs give identical bytes.
- R2 Secrets (22-86 base64url chars) appear only in the fragment. Any query key matching key/secret/seed/priv/token/pass/mnemonic/sig/auth, or equal to `k`/`gpi`, fails with `SECRET_IN_QUERY`.
- R3 Parsing is strict: max 2048 chars (checked first), printable ASCII only, scheme case-insensitive, unknown/duplicate/empty params rejected, percent-escapes must be canonical uppercase and minimal, raw `+` rejected, amount canonical (no trailing zeros, >0, <=18 decimals), asset `[A-Z][A-Z0-9]{1,11}`, chain/exp positive integers without leading zeros, memo 1..140 code points without control/bidi/zero-width/unassigned characters.
- R4 Errors have fixed messages and never echo input.
- R5 `checkQrCapacity(payload, ecc)` returns UTF-8 byte size, minimum QR version (byte mode, ISO 18004 table), `fits`, and heuristic `density` (<=v10 good, <=v25 dense, else very-dense). `buildQrPayload` rejects payloads above `maxVersion` (default 25).
- R6 `redactUri` replaces the fragment for logs.

## Acceptance tests (uri.test.ts)
canonical vector; round-trip of arbitrary graphemes; fuzz never throws non-LinkError; 12 secret-key spellings rejected; 36 malformed-link cases with exact codes; worst-case URI (140 four-byte memo chars + secret) < 2048; capacity anchors v1/v2/v40 for L/M/H and overflow by one byte; UTF-8 byte counting; table monotonicity.
