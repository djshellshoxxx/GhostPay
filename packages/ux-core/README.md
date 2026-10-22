# @ghostpay/ux-core

Pure, UI-free usability logic for GhostPay (no DOM, no network, no timers, no analytics). Specs: `docs/remote/usability/specs/{ux-errors,net-status,local-store,kbd-palette,theme-pack}.md`.

| Module | Exports (main) | Purpose |
| --- | --- | --- |
| `errors.ts` | `recover`, `listCodes`, `codeOf`, `retryLine`, `diagnostics` | Error code -> plain-language summary, cause, recovery steps, retry safety |
| `netstate.ts` | `initNetState`, `reduceNet`, `summarize`, `clockSkewSec`, `backoffMs` | Online/offline and RPC/relayer reachability state machine over injected probe results |
| `store.ts` | `createStore`, `MemoryBackend`, `fromWebStorage`, `deriveSealKey`, `createAesGcmSealer`, `lookupToken`, `StoreError` | Namespaced, versioned, migratable key-value collections; quota handling; optional AES-GCM sealing |
| `palette.ts` | `COMMANDS`, `createRegistry`, `detectConflicts`, `rank`, `parseChord`, `isTypingTarget`, `paletteView`, `a11yLabel` | Shortcut registry, fuzzy ranking, chord parsing, a11y labels |
| `theme.ts` | `THEMES`, `validateTheme`, `contrastRatio`, `cssFor`, `themeAttr`, `parseThemeJson` | Theme tokens, WCAG contrast, injection-proof CSS variables |

Security notes: every module treats its input as untrusted; no function echoes caller strings into user-visible text; store key names cannot carry secrets; theme CSS is generated only from regex-validated tokens. See `docs/remote/usability/audit-ux-core.md`.

Dev: `npm run typecheck && npm run lint && npm test` (coverage thresholds 95/90/95/95).
