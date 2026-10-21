# Research: client-side privacy leaks and device safety

Retrieval date for all sources: 2026-10-21. Branch `claude/remote-extensions-1`. Repo claims cite audit IDs (S3-xx) and files; `docs/remote/audits/*` (haiku) not relied on. Nothing here was tested in a real browser; the app has never run against a real wallet (README).

## 0. Method and reachability

Read: README, `docs/remote/modules-needed.md`, `docs/remote/research/safety-user-protection.md`, `docs/audits/03` (S3-03), `apps/web/public/_headers`, `apps/web/index.html`, `apps/web/src/lib/{fragment,idbStore,settings,defaultServices,keystore,release,manifest,relayerClient}.ts`, `docs/remote/onion-i2p-research.md`, `docs/remote/privacy-specs/hygiene.md`, `docs/remote/usability/specs/{pwa-offline,share-safe}.md`.

Verified by fetch:
- Clear-Site-Data: `https://raw.githubusercontent.com/w3c/webappsec-clear-site-data/main/index.src.html`. `cache`, `cookies`, `storage` (localStorage, sessionStorage, IndexedDB, WebSQL, service worker registrations), `executionContexts` (reload open contexts). Secure-context only.
- Referrer Policy: `https://raw.githubusercontent.com/w3c/webappsec-referrer-policy/main/index.src.html`. "Strip url for use as a referrer": fragment, username, password stripped.
- W3C Fingerprinting Guidance: `https://raw.githubusercontent.com/w3c/fingerprinting-guidance/gh-pages/index.html`. Prefer standardized/nulled values over randomization; limit precision; make local state clearable; active fingerprinting is detectable.
- Permissions-Policy: `https://raw.githubusercontent.com/w3c/webappsec-permissions-policy/main/index.bs`. Header maps features to allowlists. Feature names (e.g. clipboard-read) not in that file: unverified.
- Tor Browser manual security levels (WebSearch snippet only, page not fetched): `https://tb-manual.torproject.org/security-settings`. Safest = JavaScript off by default on all sites; Safer = JS off on non-HTTPS; Wasm disabled via NoScript at Safer/Safest; changing individual prefs adds fingerprint entropy.
- Slack unfurl docs (snippet only): `https://docs.slack.dev/messaging/unfurling-links-in-messages/`. Slack crawls detected links server-side.

Unreachable / 404 (path guesses or blocks): `w3c/webappsec-referrer-policy/main/index.bs`, `w3c/ServiceWorker/.../index.bs`, `w3c/ServiceWorker/main/docs/index.bs` (404, so SW update-check/updateViaCache behavior is **unverified** here). Not fetched at all, hence **unverified**: Tor Browser storage behavior (IndexedDB in Safest, permanent private browsing), Chromium/Firefox history-sync internals, Telegram/WhatsApp/Signal/iMessage preview-fetch behavior, Android/iOS screenshot and recents-blanking APIs, Firefox/Chromium extension permission docs, Sentry/GlitchTip scrubbing docs, WebAuthn PRF.

## 1. What the repo already does (do not rebuild)

- Invoice in `location.hash` (`#gpi=v1.`); fragment never sent to host; removed from the bar by `history.replaceState` (`fragment.ts:20`). Paste-link path exists.
- `Referrer-Policy: no-referrer` header plus `<meta name="referrer">` (`index.html:7`); `referrerPolicy:'no-referrer'` on manifest/release/relayer fetches (`manifest.ts:27`, `release.ts:15`, `relayerClient.ts:37`).
- CSP: `script-src 'self'`, `frame-ancestors 'none'`, `worker-src 'self'`; Permissions-Policy denies camera, mic, geolocation, USB, HID, serial, payment etc. COOP same-origin.
- `/index.html` no-cache, `/deployments/*` no-store, `/assets/*` immutable.
- No analytics/telemetry rule (`SECURITY.md`), bundle scan `apps/web/scripts/scan-bundle.mjs`.
- Keystore export: scrypt N=2^17 + AES-GCM (`keystore.ts`). IndexedDB tag store holds ciphertext only (`idbStore.ts`). Settings in `localStorage` (`ghostpay.settings.v1`, non-secret).
- Open and relevant: S3-03 (fragment lands in on-disk History DB; PoC-10), S3-04, S3-13 (import scrypt cost uncapped), share-safe spec (not built), pwa-offline spec (not built; opt-in, default off).

## 2. Findings

### 2.1 Link previews and chat apps (invoice URLs)
- Fragment is not sent in HTTP requests by browsers, and Referrer Policy strips it (verified). So a server-side unfurler that fetches the URL sees only the app origin: the key is not leaked to the preview *fetcher*. Whether each chat *client* or its backend logs/stores the full pasted string is outside our control: the chat provider receives the full link as message text. That is the real leak (share-safe Problem statement). Per-app unfurl behavior unverified.
- Mitigation is therefore link structure, not headers: do not put the decryption key in the pasted URL (passphrase-split / two-channel) or make the shared string a reference only. Already specced in `share-safe.md`; this report ranks it.
- Add `<meta property="og:*">` generic tags and no per-invoice values server-side (none exist; static host cannot vary). Keep it that way: any future edge function that echoes invoice data into OG tags would break the model.
- UI: after "Copy link", show warning "pasting into chat gives the provider the key"; offer "Copy link without key + show key separately".

### 2.2 URL fragment handling / browser history (S3-03)
- `replaceState` does not remove the History DB row (audit PoC-10). Browser history sync copies it to the vendor.
- Client options: (a) make QR/clipboard/paste primary; (b) detect non-empty `location.hash` at load and show a persistent banner "this link is in your browser history; open invoices in a private window next time" with a one-click "I understand"; (c) key-out-of-URL design (two-step): first navigation carries only a short ID plus nothing secret, key entered/scanned separately; (d) for payer-initiated links, `window.open` from a PWA is not a mitigation.
- Cannot be cured after navigation. Residual risk remains for any scheme where the URL contains a secret.

### 2.3 Storage (localStorage / IndexedDB / clear-on-exit)
- Today: settings plaintext in localStorage (non-secret by design); tag store ciphertext in IndexedDB. Key material for sessions is not confirmed persisted; seller keys are kept in memory and exported via encrypted keystore (README/`keystore.ts`). Check for any persistence of decrypted invoices (e.g. Pay view history): unverified, needs a code audit pass.
- Encryption at rest in-browser protects only against offline disk readers when the wrapping key is *not* in the same profile. A non-extractable `CryptoKey` stored in IndexedDB does not stop same-profile malware or XSS (they can call `subtle.decrypt`). Real protection needs a user secret (passphrase-derived key held in memory) or WebAuthn PRF (unverified; not fetched).
- Clear-on-exit: a `Clear-Site-Data: "cache", "storage"` response header on a dedicated `/logout` or `/wipe` path (verified semantics) is a stronger wipe than app-level delete, because it also removes SW registrations and caches. Host needs header control (`_headers`; not on GitHub Pages). App-level fallback: `indexedDB.deleteDatabase`, `localStorage.clear`, `caches.delete`, `registration.unregister`.
- Browsers can also evict or not persist storage; `navigator.storage.persist()` is the opposite of what a privacy mode wants. Do not call it in shared-device mode.

### 2.4 Service worker / caching
- No SW today (pwa-offline spec only). Risks if added: stale SW pins a vulnerable/compromised version (modules-needed rank 1 manifest auth and S3-04 make this worse: a poisoned release stays resident); caching a navigation response that contains a fragment URL; cache key by URL with query; precache poisoning from a compromised host; SW is persistent XSS-like foothold if the origin is ever compromised (can serve altered script until update; update-check semantics unverified here, 404 on spec).
- The existing spec requirements PWAOF-1..5 (same-origin, no query/fragment, opt-in, explicit update, remove button) are right. Add: SW script must be served `Cache-Control: no-cache`; display version+hash from the precache list; refuse registration in shared-device mode; a kill-switch path (`/sw-kill.js` that unregisters and `Clear-Site-Data`).
- Recommend NOT shipping the SW until manifest authentication (S3-01) and release signing exist.

### 2.5 Fingerprinting
- The app contacts: its own host, user-chosen RPC, user-chosen relayer. Fingerprint surface = what those parties and the host can infer: User-Agent, `Accept-Language`, TLS, request timing, RPC method pattern, quote buffer (hygiene L9: gas buffer fingerprints client; `grid125` default is the right mitigation).
- Active fingerprinting by the app itself: avoid `navigator.hardwareConcurrency`, canvas, `screen`, `Intl` locale reads unless needed. W3C guidance: prefer identical behavior over randomization (verified). Randomizing (e.g. jitter) is acceptable for network timing only.
- Add a CI lint (ESLint `no-restricted-properties`) banning `navigator.userAgent*`, `navigator.plugins`, `hardwareConcurrency`, `deviceMemory`, `canvas.toDataURL`, `AudioContext`, `getBattery`, `RTCPeerConnection` in `apps/web/src`, and extend `scan-bundle.mjs` to flag them in the output bundle (including dependencies, e.g. QR libraries, wallet libs).
- Wallet providers: injected `window.ethereum` / EIP-6963 discovery reveals the installed wallet set to any page script; only call discovery after user clicks "Connect" (verify `wallet.ts`; unverified here).
- Locale-dependent formatting (`toLocaleString`) is local; do not send locale or timezone to relayer. Relayer request already minimal (verify against `apps/relayer/PRIVACY.md`).

### 2.6 Screenshots, shoulder surfing, QR safety
- Seller key pages and keystore passphrase display: add "hide sensitive" default (mask amounts/addresses until tap), auto-blur on `visibilitychange` hidden and after N seconds idle, so app-switcher snapshots and OS screen recording get a blank view. Web cannot block screenshots (no FLAG_SECURE equivalent in browsers); say so honestly.
- Seed/keystore export: never render raw key material; show only as downloaded encrypted file. Confirm no "reveal key" element exists (code check needed).
- QR: payer scans a QR that opens `https://app/#gpi=...`. Risks: lookalike domain QR (quishing), QR image kept in camera roll/cloud photos, QR screenshot shared. Controls: show host name large on the Pay page and compare to "official host list" from release info (needs hosting decision); keep QR generation SVG, local, no third-party QR API (confirmed by CSP `img-src 'self' data:`); add "this QR contains the key; delete after payment" text; short-expiry invoices (invoice `expires` field if present: check schema).
- Scanner: camera denied by Permissions-Policy (`camera=()`), so in-app QR scanning is impossible today; if added, set `camera=(self)` only on that route and stop tracks immediately after decode. Prefer OS camera app.

### 2.7 Extension / malware threat model
- Browser extensions with `<all_urls>` and content-script access read DOM, fragment and clipboard, modify what the user sees (address swap, amount swap), and can read localStorage/IndexedDB of the page origin. CSP does not constrain extension content scripts. No web-app mitigation is complete.
- Feasible partial controls: (1) wallet is the trusted display: ensure every critical value (recipient, amount, token, chain) is also visible in the wallet's own confirmation (router calldata decoding exists; direct transfers do not, see tx-review spec); (2) show recipient/amount in at least two independently rendered places (page + QR/summary) so a single DOM tweak is less likely to hit both: weak against a determined extension; (3) recommend a clean browser profile / no extensions for seller key operations (docs only); (4) shared "paranoid" mode: do key operations in a Worker with no DOM, still reachable by extensions that hook `crypto.subtle`: documentation of limits is mandatory.
- Clipboard hijack (address replacement): after copy, re-read is not possible without permission; instead display address with first/last 6 + checksum and require typed confirmation of the last 4 chars for first-time destinations (ties to address-safety spec).
- OS-level malware (keylogger, screen capture, clipboard monitor) is out of scope; state it in `docs/user/privacy-limits.md`.

### 2.8 Tor Browser compatibility
- Safest level disables JS by default (verified via manual snippet); the app is a React SPA and cannot work without JS. Document: use Safer (HTTPS sites keep JS; Wasm off). Does the app use Wasm? Check dependencies (`@noble/*` pure JS; QR/others unknown): add a CI check `no WebAssembly.instantiate` in bundle, so Safer works.
- Required APIs under Tor Browser: `crypto.subtle` (needs secure context; `.onion` over HTTP is treated as potentially trustworthy per the Secure Contexts spec per `onion-i2p-research.md` W1, so check), IndexedDB (availability in Tor Browser private-by-default mode: unverified), `localStorage` (session-only; unverified), `navigator.serviceWorker` (not available in private windows in Firefox: unverified). App must degrade gracefully: catch `indexedDB.open` failure (partly: `idbStore.ts` rejects "IndexedDB unavailable"), show "storage unavailable: nothing will persist; export keystore before closing".
- Do not alter behavior for Tor detection (fingerprint signal). Do not request `window.screen` size, fonts, or WebGL. Stay within defaults; Tor recommends not tweaking prefs (verified snippet).
- RPC/relayer from Tor: user configures `.onion` or HTTPS endpoints; CSP `connect-src https: wss:` blocks `http://*.onion` RPC (insecure). Document or add an explicit per-origin allow in Settings for `http://*.onion` (CSP would need `http:` which weakens policy; alternative: serve app from `.onion` and have RPC over HTTPS only). Owner decision.
- Test matrix: add a manual checklist doc and a Playwright Firefox project (README says Firefox e2e never run).

### 2.9 Shared-device mode
- Add Settings toggle "Shared device / public computer": (a) no persistent storage writes (memory-only store implementing `TagStore`), (b) no SW registration, (c) no `navigator.storage.persist`, (d) idle lock + auto-wipe at 5 min, (e) `beforeunload` wipe + Clear-Site-Data on "End session", (f) disable keystore auto-restore, (g) hide history of pasted links, (h) clear clipboard best-effort after copy (`navigator.clipboard.writeText('')` after 60 s; requires focus; best effort), (i) banner that browser history still holds opened links (S3-03).
- Recommend a URL parameter-free toggle (persisting the toggle itself is fine: it is non-secret).
- Residual: keystrokes, extensions, browser history/downloads (the keystore file lands in Downloads), cache of downloaded QR SVG.

### 2.10 Analytics-free telemetry options
- Principle: none by default; any diagnostics opt-in per event, user sees exact payload, no IP retention, no stable ID.
- Options ranked: (1) none + user-initiated "Copy diagnostics" (JSON, scrubbed, user pastes into an issue) — zero infrastructure; (2) self-hosted counters via relayer `/metrics` aggregate only (operator-side, already planned); (3) privacy-preserving aggregation (e.g. Prio/DAP, IETF DAP draft; unverified, not fetched) — over-engineered for a pre-launch app; (4) third-party SaaS analytics — reject (CSP `connect-src` broadness already a risk; every beacon is a third party seeing IP and referrer).
- `connect-src 'self' https: wss:` is broad because RPC/relayer are runtime data: any compromised dependency could exfiltrate to any HTTPS host. Narrowing is impossible with user-chosen RPC; mitigation = build-time bundle scan (exists) plus lockfile hygiene. Option: on pages that do not need network (create invoice, view keystore) meta-CSP cannot be tightened per-route in one document; consider a separate `/offline.html` entry with `connect-src 'none'` for key operations (seller key generation and keystore export), served with its own header. Effort M, strong.

### 2.11 Crash reporting without leaks
- Default: no automatic reporting. Window `error`/`unhandledrejection` handler shows a screen with a scrubbed text blob the user can copy: error name, message class (allowlist of our `UserFacingError` codes), app version/hash, route name without hash/query, browser family only. No stack frames with argument values, no `location.href` (contains the key), no `localStorage`, no state.
- Scrub rules must be allowlist-based, not regex redaction (S3-08 shows redaction bypass in `SecretBytes`; PoC-01). Error messages from libraries (viem RPC errors include request bodies and addresses) must be mapped, not forwarded.
- If an opt-in sender is ever added: POST to the project's own endpoint only (not Sentry SaaS), `referrerPolicy:'no-referrer'`, `credentials:'omit'`, no IP logging at the edge, batch with random delay, payload shown before send. Self-hosted Sentry/GlitchTip scrubbing options: unverified.
- Also set `Error.stackTraceLimit` modestly in prod and ensure sourcemaps are not shipped (check `vite.config.ts` `build.sourcemap`; unverified).

## 3. Recommendations

| # | Threat | Change (file/package) | Effort | Residual risk | Priority | Owner decision / cost |
|---|---|---|---|---|---|---|
| R1 | Invoice key leaks to chat provider/history (S3-03, share-safe) | Implement `share-safe` spec: key-split link, "copy without key", warnings in `apps/web/src/views/CreateInvoice.tsx`; fragment banner in `App.tsx`/`fragment.ts` | M | Provider still sees whatever is pasted; History DB row for opened full links | High | UX choice on two-channel flow |
| R2 | Shared/public computer leaves keys, invoices, SW behind | Shared-device mode: memory-only `TagStore`, wipe on end/idle, no SW/persist; `lib/settings.ts`, `idbStore.ts`, new `lib/sessionMode.ts` | M | Extensions, keyloggers, browser history, Downloads | High | No |
| R3 | Local wipe incomplete (SW, caches, IDB) | `/wipe` route + `Clear-Site-Data: "cache","storage"` in `public/_headers`; app-level fallback wipe button in Settings | S | Needs header host; not on GitHub Pages; backups elsewhere | High | Hosting decision (header control) |
| R4 | Telemetry/exfil via dependency | Keep no-telemetry; extend `scripts/scan-bundle.mjs` to flag `navigator.sendBeacon`, fixed third-party hosts, fingerprinting APIs, `WebAssembly`; ESLint restricted-properties | S | Obfuscated or dynamic URL construction | High | No |
| R5 | Crash reports leak link/keys | Allowlist-only crash screen with copyable scrubbed blob; no auto-send; global handler in `main.tsx`; ensure no sourcemaps | S | User may paste raw console into an issue | Medium | No |
| R6 | Extension DOM tampering/address swap | Docs in `docs/user/` (clean profile for key ops); two-place display; typed last-4 confirmation for first-time destination (address-safety spec) | S-M | A malicious extension defeats all page-side display | Medium | No |
| R7 | Screenshot/shoulder-surf/app-switcher | Mask-by-default sensitive fields, blur on `visibilitychange`, idle blank | S | OS screenshots/cameras still possible | Medium | No |
| R8 | QR quishing/lookalike host, QR in photo roll | Large host display on Pay page vs release host list; QR text "delete after paying"; local SVG only | S | User ignores host; depends on hosting being fixed | Medium | Hosting/domain decision |
| R9 | SW pins compromised/old build | Defer SW until S3-01/S3-04 fixed; then implement PWAOF-1..5 plus `no-cache` SW script, version+hash display, kill route | M | SW persistence across origin compromise; update-check semantics unverified | Medium (defer) | No |
| R10 | Fingerprinting by app/dependencies | ESLint ban list (see 2.5); delay EIP-6963 discovery until click; keep `grid125` buffer rounding | S | Network-level (IP, TLS, timing) unaffected | Medium | No |
| R11 | Tor Browser breakage | CI check no Wasm; storage-unavailable UX; Tor checklist doc `docs/operators/tor-browser-checklist.md`; decide `.onion` RPC story | M | IndexedDB/SW behavior in Tor unverified; JS-off Safest unsupported | Medium | Decision on http `.onion` connect-src |
| R12 | Key ops on a page that can reach any HTTPS host | Separate no-network entry (`keys.html`, CSP `connect-src 'none'`) for seller key generate/export/import | M | Same-origin storage shared with main app; extensions | Medium | No |
| R13 | At-rest storage vs disk readers | Wrap IDB records with a key from a user passphrase (memory-only) or WebAuthn PRF (unverified); do not rely on non-extractable key alone | M-L | Same-profile malware reads decrypted state in session | Low-Med | UX: passphrase prompt each session |
| R14 | Opt-in diagnostics | If ever wanted: user-reviewed payload to project-owned endpoint only | M | Operator still sees IP unless proxied | Low | Service/cost, owner decision |
| R15 | Cap keystore import cost (S3-13) | Reject `N>2^20` / `r*N` memory bound in `keystore.ts` | S | DoS only | Low | No |

## 4. Ranked roadmap

| Rank | Item | Effort | Needs owner/cost? | When |
|---|---|---|---|---|
| 1 | R4 bundle-scan and lint bans (no beacons, no fingerprint APIs, no Wasm) | S | No | before testnet |
| 2 | R1 share-safe key-split link and fragment warnings | M | UX decision | before testnet |
| 3 | R2 shared-device mode | M | No | before testnet |
| 4 | R3 `/wipe` + Clear-Site-Data and in-app fallback | S | Header-capable host | before testnet |
| 5 | R5 allowlist crash screen, no sourcemaps | S | No | before testnet |
| 6 | R7 sensitive-field masking and visibility blur | S | No | before mainnet |
| 7 | R6 destination typed confirmation and user docs | S-M | No | before mainnet |
| 8 | R8 host display vs release list | S | Domain/hosting | before mainnet |
| 9 | R12 no-network key page | M | No | before mainnet |
| 10 | R11 Tor Browser checklist, storage-unavailable UX | M | `.onion` decision | before mainnet |
| 11 | R10 EIP-6963 on click, lint extensions | S | No | before mainnet |
| 12 | R9 service worker (only after S3-01/S3-04) | M | No | later |
| 13 | R13 at-rest wrapping | M-L | UX | later |
| 14 | R15 keystore import cap | S | No | any |
| 15 | R14 opt-in diagnostics | M | Service/cost | only if requested |

Unverified list (all items above not marked verified): per-app preview behavior, Tor storage behavior, SW update semantics, WebAuthn PRF, DAP, Sentry scrubbing, EIP-6963 call timing in `wallet.ts`, presence of sourcemaps, persistence of decrypted invoice data in views.
