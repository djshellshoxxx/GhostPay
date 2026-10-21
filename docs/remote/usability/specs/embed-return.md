# Spec: embed-return: Embed completion signal and return-to-merchant
Impact 2/5 | Effort M | Score 1 | Build wave 2 | Depends on: embed-snippet, pay-reconcile

## Problem
Because the popup uses noopener there is no completion callback (embed header lines 1-14); merchants cannot know a payer finished.

## Exists today (verified in repo) vs missing
- apps/web/public/ghostpay-embed-v1.js (noopener, noreferrer popup).
- payer receipt/proof (payExec.ts:142).
- Missing: everything described under Design.

## Design
No postMessage back-channel (would let any opener learn payer state). Instead: after payment the payer sees a "Copy payment proof" code and an optional user-clicked "Return to merchant" button whose target origin must equal a returnOrigin listed inside the signed public invoice (needs optional schema field; if schema stays frozen use memo-free local config in Create page that renders an extra QR/button only for the seller's own site). Merchant verifies proof with pay-reconcile server-side or in a merchant tool using their own RPC.

## Privacy and security impact
No cross-origin messaging; return is a user-initiated navigation with a proof code in the URL FRAGMENT only (never query). Allowed origin set is bound by the seller signature.

## Build ownership
- NEW package: `packages/embed-return` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/embed-return`.
- Public API (exports from `src/index.ts`):
- `buildReturnUrl(returnOrigin: string, proof: string): string  // fragment only`
- `isAllowedReturn(inv: {returnOrigin?: string}, target: string): boolean`
- `verifyProofOffline(proof, expected): Result`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

## UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/views/Pay.tsx (post-submit return button)
- packages/invoice-schema (optional field returnOrigin; owned by schema maintainers, separate change)
- Add `@ghostpay/embed-return` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

## Requirements
1. **EMBED-1** MUST Return URL carries data only in the fragment.
2. **EMBED-2** MUST Only https origins exactly equal to the signed returnOrigin are allowed (no wildcards, no redirects).
3. **EMBED-3** MUST Without the schema field the feature is hidden (feature flag).
4. **EMBED-4** MUST Proof size-bounded and decoded strictly.
5. **EMBED-5** SHOULD Provide a reference merchant verifier snippet (Node, own RPC).

## Acceptance tests
1. **T-1** isAllowedReturn false for lookalike origin and for http.
2. **T-2** buildReturnUrl output has no "?" and ends in #proof=...
3. **T-3** Schema fixture with returnOrigin signed -> accepted; tampered -> signature invalid.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.
