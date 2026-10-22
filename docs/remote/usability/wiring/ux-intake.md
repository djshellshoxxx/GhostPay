# Wiring plan: ux-intake in apps/web

Library calls only; no DOM in the package. Names below are proposals (verify against the current apps/web tree before implementing).

## Files and components
- `apps/web/src/intake/policy.ts`: exports `PAYLOAD_POLICY` (`allowedHosts` from build config, lowercase), `ASSETS` (`AssetSpec[]` from the chain registry), `LINK_POLICY`.
- `apps/web/src/intake/ScanDialog.tsx`: wraps the (separate) camera decoder; on each decoded string calls `addScan(state, text, PAYLOAD_POLICY, Date.now())` (clock injected here, not in the package). Shows `received/total` and `missing` for chunk progress; on `complete`/`payload` stops the camera immediately.
- `apps/web/src/intake/CameraPermission.tsx`: renders `permissionViewModel(state)`; state from `navigator.permissions.query({name:'camera'})` mapped to `queried` events plus `getUserMedia` rejections via `permissionFromErrorName`. Never calls `getUserMedia` without a click.
- `apps/web/src/intake/PasteField.tsx`: same `classifyPayload` path; always visible (fallback).
- `apps/web/src/intake/useIncomingLink.ts`: on load `parseDeepLink(location.href, LINK_POLICY)`; for invoice links pass `payload.fragment` to `parseFragment` (invoice-schema), then `history.replaceState(null, '', path)` to drop the fragment from the address bar and history.
- `apps/web/src/routes/share-target.tsx`: handles the manifest `share_target` (see below) with `parseShareTarget(location.search, LINK_POLICY)`, then `replaceState` to `/share-target`.
- `apps/web/src/intake/AmountField.tsx`: free-text amount input; on blur `parseNlAmount(text, {assets: ASSETS, locale: i18n.language, defaultAsset})`; shows echo "20.00 USDC" for explicit confirmation; shows `ambiguous-separator` as "Did you mean 1,234 or 1.234?" with two buttons that rewrite the text unambiguously.

## Manifest / service worker
- `manifest.webmanifest` `share_target`: `action: /share-target`, `method: GET`, params `title,text,url`. Prefer a service worker `fetch` handler that serves the SPA shell for `/share-target` without a network round trip, so a shared invoice link (fragment-in-query) never reaches the server; document that the static host logs must not retain query strings.
- Response header `Referrer-Policy: no-referrer` (`REQUIRED_REFERRER_POLICY`) and `<meta name="referrer" content="no-referrer">`; all outbound links `rel="noreferrer noopener"`.
- `protocol_handlers`: `web+ghostpay` -> `/pay?uri=%s` is NOT used (would put the URI in a query); register `/pay` and call `parseDeepLink` on the full URL instead; pass the raw handler URL through `parseDeepLink`, which normalises `web+ghostpay:`.

## State
`scanState: AssemblyState | null` (component state, memory only, never persisted), `permission: PermissionState`, `incoming: Incoming | null` (hold `fragment` only until `parseFragment` completes, then drop).

## i18n keys
`intake.camera.{granted,denied,prompt,unavailable}`, `intake.error.<code>` for every code via `errorKey(code)` (codes are listed by the `*ErrorCode` types), `intake.scan.progress` ("{received} of {total} parts"), `intake.scan.missing`, `intake.share.fragmentInQuery` (warning for `fragment-in-query`), `intake.amount.confirm`, `intake.amount.ambiguous`.

## Logging
Every `console`/telemetry-adjacent string passes `redactForLog`; never log `Incoming`/`Payload` objects (they hold the raw fragment).

## e2e ideas (Playwright)
1. Open `/pay#gpi=v1.…` with a request interceptor: assert no request URL/header (incl. Referer) contains `gpi`; after parse, `location.hash === ''`.
2. Share target with `url=` invoice link: warning shown; address bar cleaned; no network call for the route (service worker).
3. Three-QR sequence (fake decoder feeding frames out of order, duplicates, a foreign id): progress UI, mismatch error, reset button.
4. Permission denied path shows settings help plus paste field; unavailable shows only paste.
5. `?next=//evil.test` and `?redirect=https://evil.test` links land on an error screen, never navigate.
6. Amount field: `1,234 usdc` in a no-locale context shows disambiguation; `usdс` (Cyrillic) shows a mixed-script error.
