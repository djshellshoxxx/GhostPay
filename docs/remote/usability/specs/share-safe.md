# Spec: share-safe: Safe link sharing (passphrase-split, unfurl-safe, print card)
Impact 4/5 | Effort M | Score 2 | Build wave 0 | Depends on: none

## Problem
The invoice link is a bearer secret and its decryption key is inside it (envelope.ts:162-183); pasting it into a chat gives the chat provider everything, and previews/history copy it (CreateInvoice.tsx:191 warning only).

## Exists today (verified in repo) vs missing
- apps/web/src/views/CreateInvoice.tsx:188-197 link + QR + warning.
- apps/web/src/components/QrView.tsx SVG download.
- packages/invoice-schema/src/envelope.ts:95,171 key in fragment, option encrypt.
- index.html:8 referrer no-referrer.
- Missing: everything described under Design.

## Design
Share options: (a) Split mode: public link carries signed public part only; private part (line items, memo) delivered as a separate "details code" or passphrase-encrypted blob the payer pastes (scrypt + AES-GCM, same format family as backup). Requires a schema-compatible envelope variant: share-safe produces a v1 link with enc.k REMOVED and a separate key string; payer app joins them (pure client concat before parseFragment, so invoice-schema is untouched). (b) QR-only / print card layout with amount and expiry text (CSS print sheet). (c) Preview hygiene: app serves generic OG/Twitter text only (no per-invoice content possible since fragment is never sent). (d) Link size meter with 16 KiB limit and QR fit check.

## Privacy and security impact
Splitting means one channel compromise no longer reveals details; advice text says use two channels. Never uses link shorteners or any server. Print card contains the link: warn about printers/spoolers.

## Build ownership
- NEW package: `packages/share-safe` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/share-safe`.
- Public API (exports from `src/index.ts`):
- `splitLink(link: string): {publicLink: string; keyCode: string}  // keyCode = base32 groups with checksum`
- `joinLink(publicLink, keyCode): string`
- `checkKeyCode(s): boolean (checksum)`
- `sizeReport(link): {bytes; limit; qrFits}`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

## UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/views/CreateInvoice.tsx (share mode radio, key code display)
- apps/web/src/views/Pay.tsx (key code input when fragment has enc stub)
- apps/web/src/styles/app.css (print rules)
- Add `@ghostpay/share-safe` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

## Requirements
1. **SHARE-1** MUST joinLink(splitLink(x))==x for every valid encrypted v1 link.
2. **SHARE-2** MUST publicLink without keyCode never decrypts (parseFragment fails with DECRYPT, not partial text).
3. **SHARE-3** MUST Key code has a checksum so typos are detected before decrypt.
4. **SHARE-4** MUST No network request is made by any share function.
5. **SHARE-5** MUST Unencrypted links are refused for split mode with a clear message.
6. **SHARE-6** SHOULD Group key code in 4-char blocks, case-insensitive entry, ambiguity-free alphabet (no 0/O/1/I).

## Acceptance tests
1. **T-1** Round trip on fixtures from invoice-schema test vectors.
2. **T-2** Flip one key-code character -> checkKeyCode false.
3. **T-3** Fuzz: arbitrary strings to joinLink never throw non-typed errors.
4. **T-4** Parsing publicLink alone yields DECRYPT error code.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.
