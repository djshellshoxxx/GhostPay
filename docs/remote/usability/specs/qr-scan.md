# Spec qr-scan: scanned-payload parsing and chunk reassembly

Package: `packages/ux-intake` (`payload.ts`, `qr.ts`, `address.ts`). No camera code; the UI feeds decoded QR text.

## Requirements
- R1 Classify one scanned string as `invoice-link` (`https://<allowed host>/<path>#gpi=v1.<b64url>` or bare `#gpi=v1.…`), `payment-uri` (`ghostpay:<addr>[?amount&asset&chain&label]`) or `address`.
- R2 Hygiene before parsing: string only; outer ASCII whitespace trimmed; empty rejected; per-scan cap 4096 chars; control/invisible/bidi and any non-ASCII rejected; inner whitespace rejected.
- R3 Invoice links: https only, exact lowercase host match, no userinfo, no port, no query, path `^/[A-Za-z0-9/_-]{0,63}$`, fragment prefix `#gpi=v1.` (mirrors `packages/invoice-schema/src/envelope.ts`), body base64url, at most 21 846 chars (ceil(16384*4/3)).
- R4 `ghostpay:` URIs: params `amount` (canonical decimal, no leading zeros), `asset` (`[A-Z][A-Z0-9]{1,11}`, optional allowlist), `chain` (positive integer), `label` (<= 64 chars, no control, single script). Unknown or repeated params, `#`, and `//` authority rejected.
- R5 Addresses: EVM `0x`+40 hex (all-zero rejected; mixed case flagged `checksumUnverified`), bech32/bech32m with verified checksum and HRP in `bc,tb,bcrt,sp,tsp`.
- R6 Multi-frame: `gpc1:<id 6-16 [a-z0-9]>:<i>/<n>:<data>`, `2<=n<=16`, data <= 2048 chars. One transfer at a time; other id gives `chunk-session-mismatch`; identical repeat is `duplicate`; differing body or changed total is `chunk-conflict`; TTL 60 s from the first frame (injected clock) then restart; joined text capped at 22 358 chars, may not start with `gpc1:`, and is classified like a single scan.
- R7 Permission view-model for `granted|denied|prompt|unavailable`: scanner shown only when granted, `prompt` never auto-starts capture, paste fallback always offered, i18n key `intake.camera.<state>`; DOMException name mapping (`NotAllowedError`/`SecurityError` denied, others unavailable).
- R8 `safeDisplay` never contains the invoice fragment.

## Acceptance tests (implemented in `src/*.test.ts`)
1. Link, bare fragment, URI with all params, EVM, bech32 and bech32m vectors parse (payload.test, address.test).
2. Rejections: wrong host, `host.evil`, `host@evil`, userinfo, port, http, query, bad path, wrong version, empty/oversize fragment, Cyrillic host, `javascript:`/`data:`/`file:`/`intent:`.
3. 5000-char link split into 3 frames, delivered out of order, completes; progress reports `missing`.
4. Duplicate / conflict / mismatch / TTL / oversize / nested-chunk / garbage-join cases.
5. fast-check: any 2..16-way split in rotated reverse order reassembles.
6. Permission table and transitions.
