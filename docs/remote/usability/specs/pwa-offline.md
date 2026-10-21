# Spec: pwa-offline: Installable PWA and offline mode
Impact 4/5 | Effort M | Score 2 | Build wave 0 | Depends on: none

## Problem
Not installable (index.html has no manifest/icon: line 17 icon data:,); creating invoices and reviewing already-opened links should work offline, but a reload offline fails.

## Exists today (verified in repo) vs missing
- apps/web/index.html:5-17 CSP meta, worker-src self allowed.
- All invoice build/parse is local (invoiceCreate.ts, pay.ts review).
- docs/remote/pages-prototype.md: Pages host has no header control; base path /GhostPay/.
- Missing: everything described under Design.

## Design
Service worker (same-origin, scope = app base) with a precache of the hashed build asset list, cache-first for those, network-only for everything else (RPC, relayer, manifests fetched fresh with fallback to last-good clearly labelled). Fragments never reach SW (not in request URLs). Update flow: on new version, show "Update available (hash abc…)" and require click; the release-hash widget (Home.tsx) still hashes the running script. webmanifest with name, icons, display standalone. The SW file and manifest are static files emitted by the build; `scan-bundle` allowlist updated.

## Privacy and security impact
SW pins an old version until updated: shown with version and hash, with a "Remove offline copy" button (unregister + caches.delete). Cache holds public assets only; no keys, links or responses from RPC/relayer.

## Build ownership
- NEW package: `packages/pwa-shell` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/pwa-shell`.
- Public API (exports from `src/index.ts`):
- `buildPrecacheList(distFiles: {path; bytes}[]): PrecacheEntry[]  // with SHA-256`
- `swPlan(routes): decision table (cache-first | network-only)`
- `shouldCache(url: URL, appOrigin): boolean`
- `versionLabel(entries): string`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

## UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/index.html (link manifest)
- apps/web/public/ (manifest, sw.js built by package)
- apps/web/src/main.tsx (register after load, opt-in)
- apps/web/src/views/Settings.tsx (Offline copy: enable/remove)
- apps/web/scripts/scan-bundle.mjs (allow sw.js)
- Add `@ghostpay/pwa-shell` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

## Requirements
1. **PWAOF-1** MUST shouldCache is false for any cross-origin URL and for any URL with a query string or fragment.
2. **PWAOF-2** MUST SW never caches POST or responses to RPC/relayer URLs.
3. **PWAOF-3** MUST Registration is opt-in (user toggle), default off.
4. **PWAOF-4** MUST Update requires explicit user click; stale SW cannot silently serve a different version than shown.
5. **PWAOF-5** MUST "Remove offline copy" fully unregisters and clears caches.
6. **PWAOF-6** SHOULD Offline banner and disabled network-dependent buttons with reason.

## Acceptance tests
1. **T-1** shouldCache(https://rpc.example/x) false; same-origin /assets/index-abc.js true; same-origin with ?x false.
2. **T-2** buildPrecacheList hashes every file once, deterministic order.
3. **T-3** Playwright offline: create invoice link works after enable + reload.
4. **T-4** After remove, navigator.serviceWorker.getRegistrations() is empty.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.
