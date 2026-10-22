# Spec: onboarding: Onboarding wizard with safe defaults
Impact 5/5 | Effort M | Score 2.5 | Build wave 1 | Depends on: ux-glossary, net-status

## Problem
First run shows 8 tabs and a blank Settings page; payments need an RPC the user must find (no default RPC built in, Settings.tsx:71), a manifest, keys, a backup; steps are not ordered.

## Exists today (verified in repo) vs missing
- apps/web/src/views/Home.tsx:20-60 three role cards.
- apps/web/src/views/SellerKeys.tsx generate/import/export.
- apps/web/src/views/Settings.tsx RPC + relayer fields.
- DEFAULT_SETTINGS lib/settings.ts:19-29 (no RPC, delay 120-900 s, autoClearFragment true).
- Missing: everything described under Design.

## Design
Role-based checklist state machine (Seller | Payer), each step with done-predicate computed from app state: [choose role] -> [pick network (testnet default)] -> [RPC: explain options (own node, provider, Tor via network-privacy spec); no preselected vendor; test via net-status] -> [seller: generate keys -> download encrypted keystore (must pass passphrase policy; "I saved it" requires a re-import test) -> optional local-store setup] -> [payer: wallet detect]. Progress persisted as booleans in localStorage (per-viewer convenience, try/catch). Safe defaults table lives in the package and is the single source for DEFAULT_SETTINGS deltas. Skippable at any step; wizard never auto-reopens after dismissal (Help view can reopen).

## Privacy and security impact
Wizard never suggests a specific RPC vendor or sets one silently. States, per-RPC trade-offs in neutral language (provider sees IP and queried addresses). Does not store any key, passphrase or URL.

## Build ownership
- NEW package: `packages/onboarding` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/onboarding`.
- Public API (exports from `src/index.ts`):
- `steps(role: Role): Step[]`
- `nextStep(role, s: Snapshot): StepId|"done"`
- `type Snapshot = {hasRpc: Record<number,boolean>; hasKeys; keystoreVerified; walletFound; manifestLoaded; networkChosen}`
- `SAFE_DEFAULTS: Readonly<SettingsPatch>`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

## UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/views/Home.tsx (checklist card)
- apps/web/src/views/Onboarding.tsx (new)
- apps/web/src/state.tsx + App.tsx (ViewId, first-run flag)
- apps/web/src/views/SellerKeys.tsx (emit keystoreVerified)
- Add `@ghostpay/onboarding` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

## Requirements
1. **ONBOA-1** MUST Never preselect or hard-code an RPC URL.
2. **ONBOA-2** MUST Seller path cannot reach "done" until a keystore was exported AND re-imported (verification) or the user explicitly ticks "I accept losing funds if keys are lost".
3. **ONBOA-3** MUST Testnet is the default network while mainnets are disabled and a banner is shown (mode-guard).
4. **ONBOA-4** MUST Every step is skippable and resumable; keyboard operable; focus moves to the step heading.
5. **ONBOA-5** MUST No step writes secrets to storage.
6. **ONBOA-6** SHOULD Offer "Practice with a sample invoice" (mode-guard).
7. **ONBOA-7** SHOULD Estimate time per step.

## Acceptance tests
1. **T-1** nextStep for a new seller returns "network" then "rpc" then "keys" in order.
2. **T-2** Snapshot with keys but keystoreVerified=false -> not done.
3. **T-3** Storage throwing on access -> wizard still works in-memory.
4. **T-4** Playwright: complete seller path on mock RPC; no request to non-user hosts (network log).
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.
