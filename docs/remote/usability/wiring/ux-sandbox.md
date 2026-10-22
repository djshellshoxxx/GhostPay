# Wiring plan: ux-sandbox (apps/web)

Nothing is wired yet. The package makes no network calls and has no storage.

## Files and components
- `apps/web/src/state/sandbox.ts`: one `Sandbox` instance built with `crypto.getRandomValues` as `rng` and `Date.now` as `clock`. Expose `mode`, `enter`, `exit`, `reset` through the existing store. Do NOT persist mode or any sandbox data (reload returns to real mode, which is the safe default).
- `SandboxBanner.tsx`: renders `bannerFor(state)` at the top of the layout, `role=status`, sticky. Not dismissible.
- Theme: set `document.documentElement.dataset.visual = state.visual`. CSS `[data-visual="test-distinct"]` must change the frame, accent and background hatch so a screenshot is never mistaken for real.
- `TestBadge`: prefix `t(labelPrefixKey)` on every amount, address and tx row while in test mode.
- `FaucetPanel.tsx`: `buildFaucetGuidance(address, sourcesFromConfig)`; sources from build config only. Render host text and open with `rel="noopener noreferrer"`, `target="_blank"`, and show the `unverified` warning. Copy button copies the address only.
- `SandboxControls.tsx`: Enter, Exit and Reset buttons (Reset behind `sandbox.reset.confirm`).

## Guard placement (mandatory)
- Every persistence or export/import path for real profiles calls `assertNoTestData(payload)` first (vault write, backup export, receipts, CSV).
- Every real send/receive path calls `assertSameDomain(...profiles)`.
- Real address inputs inside sandbox screens: `assertNoRealData(form, looksRealAddress)` using the app's real validator.
- Telemetry stays off; sandbox events are never logged.

## i18n keys
All in `SANDBOX_I18N_KEYS` (en/xx files must define each). Params: `address`, `count`.

## E2E ideas
Enter sandbox shows banner and distinct theme; drip, wait, 3 mined blocks gives balance; second drip shows rate-limit; reload returns to real mode with no sandbox data; real export while in sandbox is refused; exit empties the sandbox.
