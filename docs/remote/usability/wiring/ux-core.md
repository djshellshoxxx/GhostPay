# UI wiring plan: ux-core (errors, net-status, local-store, kbd-palette, theme-pack)

Add `"@ghostpay/ux-core": "*"` to `apps/web/package.json` (once). Apply the five items serially in this order; shared hot files are `state.tsx`, `App.tsx`, `lib/services.ts`, `lib/settings.ts`.

## 1. ux-errors
- `apps/web/src/lib/errors.ts`: keep `userMessage` signature. Add `export function guidanceFor(error: unknown, ctx): Guidance` = `recover(codeOf(error), ctx)`; `UserFacingError` keeps its own message and gets the generic steps only. Callers pass `phase:'prepare'` only where the code path provably precedes signing (Pay: before `signer.sign`).
- `components/Common.tsx`: new `<ErrorNotice error ctx/>`: summary (role="alert"), "What to do" `<ol>` of `steps` (action buttons map: `open-settings-rpc` -> `setView('settings')` + focus RPC field, `reload` -> `location.reload()`, `open-troubleshooting` -> link to docs anchor `docAnchor`, `go-online` none), retry line from `retryLine`, "Copy diagnostics" button writing `diagnostics(code, APP_VERSION)` to the clipboard.
- Replace `userMessage` rendering in Pay, Scan, Sweep, Settings, SellerKeys, CreateInvoice.
- i18n keys: `err.<CODE>.summary|cause`, `step.<name>` (all in `listCodes()` and the `Step.key` set).
- E2E: unplug RPC -> Pay shows "Your RPC could not be reached" with a Settings button; copy diagnostics contains only `code:` and `version:`.

## 2. net-status
- `state.tsx`: `ViewId` += `'status'`; hold `NetState` via `useReducer(reduceNet)`; `navigator.onLine` + `online/offline` window events dispatch `browser-online/offline`. `configure` dispatched when settings change.
- New `views/Status.tsx`: button "Check connection (contacts your RPC and relayer)"; on press run probes (fetch with 8 s `AbortController` timeout, chain-id check, block timestamp via `eth_getBlockByNumber`, relayer `/healthz`) and dispatch `probe` events. Render `summarize()` banner, per-chain rows, skew. Copyable report built from state: "RPC for <chain name>: reachable/..." (no hosts).
- Settings: link "Open status" after the RPC Test. Top banner in `App.tsx` for `offline`, `no-rpc` only (no probing on load).
- i18n: `status.*`; reuse `err.OFFLINE` etc. via `summarize().errorCode`.
- E2E: block RPC host -> after two presses Status shows "rpc-down"; app makes zero requests on load when no button pressed.

## 3. local-store
- `lib/services.ts`/`defaultServices.ts`: `store: Store` created with `fromWebStorage(localStorage)` wrapped in try/catch (blocked storage -> `MemoryBackend` and a `STORAGE_BLOCKED` notice).
- Layer B (still to build): IndexedDB `KvBackend`, profile id/salt, unlock with viewing key calling `deriveSealKey` per collection, vault idle lock drops sealers. Until then only non-sensitive collections (templates, preferences) use the plain backend; ledger/contacts wait for sealing.
- `views/Scan.tsx`: persist matches after scan via `putMany` into a sealed `ledger` collection keyed by `lookupToken`.
- Handle `StoreError` through `storeErrorToAppCode` -> `<ErrorNotice>`.
- E2E: reload keeps contacts; corrupt one record in DevTools -> list shows the rest plus a "1 record could not be read" notice.

## 4. kbd-palette
- `components/Palette.tsx`: dialog (`role="dialog" aria-modal`, focus trap, Esc closes, focus restored to opener), input `role="combobox" aria-expanded aria-controls aria-activedescendant={view.activeDescendant}`, `ul role="listbox"` of `view.options` (`aria-selected`), live region with `view.announcement`; ArrowUp/Down/Home/End via `moveActive`; Enter runs the action: `navigate` -> `setView(view)` only after checking the view is in `ORDER`.
- `App.tsx`: one `keydown` listener: `parseChord(registry, chordRef, ev, performance.now(), {typing: isTypingTarget(ev.target), modalOpen})`; `command` -> dispatch action; `pending` shows a small "g..." hint; set `aria-keyshortcuts` and title hints (`shortcutLabel`) on nav buttons. Help dialog from `shortcutHelp`.
- i18n: `cmd.<id>.title`, `cmd.<id>.keywords` (ranking then runs on translated strings).
- E2E: typing "g" in the invoice field does not navigate; Ctrl+K opens; Esc returns focus.

## 5. theme-pack
- `lib/settings.ts`: `theme: ThemeId`; `sanitizeSettings` uses `themeAttr`.
- `App.tsx`: effect sets `document.documentElement.dataset.theme = themeAttr(theme)` (system -> current behaviour); if `themeCssHref(theme)` is defined and `isSameOriginThemeHref`, ensure exactly one `<link id="gp-theme-css" rel="stylesheet">` (replace href, remove when switching away). Built-in light/dark/high-contrast CSS lives in app CSS generated from `cssFor` at build (script) or copied; add a CI check that app CSS values equal `THEMES` tokens.
- `public/themes/cypher.css` + font (from docs/remote/pages-theme), no animations, `@media (prefers-reduced-motion: reduce)` guard. Extend `scripts/scan-bundle.mjs` allowlist for that single path.
- `Settings.tsx`: `<select>` over `THEMES` plus system, swatch from `tokens`.
- E2E: choose cypher -> exactly one same-origin link; stored `"evil"` -> system.
