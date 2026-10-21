# Spec: profiles: Multiple seller profiles
Impact 3/5 | Effort L | Score 0.8 | Build wave 2 | Depends on: local-store, backup-bundle

## Problem
One in-memory key session (session.ts:29); checkpoints are keyed by chain only (scanClient.ts:149); sellers with several brands/businesses must reload keystores and mix local data.

## Exists today (verified in repo) vs missing
- apps/web/src/lib/session.ts:26-40 singleton current/publicSummary.
- apps/web/src/lib/scanClient.ts:149-180 checkpoint keys chain-only.
- apps/web/src/lib/tags.ts per-profile salt (one profile today).
- Missing: everything described under Design.

## Design
Profile = {id, name, metaAddressPublic, createdAt}. Registry holds names and ids only, in localStorage (no secrets; users should pick neutral names). Switching clears the in-memory session (zeroize) before loading the next keystore; all stores/checkpoints namespaced by profile id. Profiles are isolated: no cross-profile search. Invoice schema has no seller name, so profile name is local-only.

## Privacy and security impact
Profile names are plaintext locally (warn: use neutral names). Switching wipes secrets from memory. No cross-profile linkage data stored.

## Build ownership
- NEW package: `packages/profiles` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/profiles`.
- Public API (exports from `src/index.ts`):
- `createProfile(name): Profile`
- `namespace(profileId, key): string`
- `switchPlan(current?, next): Step[]  // zeroize, unlock, load`
- `validateName(s)`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

## UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/lib/session.ts (profile-aware install)
- apps/web/src/lib/scanClient.ts (namespaced checkpoint keys)
- apps/web/src/views/SellerKeys.tsx (profile switcher)
- apps/web/src/lib/defaultServices.ts
- Add `@ghostpay/profiles` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

## Requirements
1. **PROFI-1** MUST Switching profiles zeroizes the previous session before the next is installed.
2. **PROFI-2** MUST Checkpoints/ledger keys include profile id; test proves no read across profiles.
3. **PROFI-3** MUST Migration: existing data becomes profile "Default" without loss.
4. **PROFI-4** MUST Profile names length-bounded, NFC, no control characters.
5. **PROFI-5** SHOULD Per-profile idle lock.

## Acceptance tests
1. **T-1** Two profiles: checkpoint saved in A is invisible in B.
2. **T-2** Switch spy: zeroize called before install.
3. **T-3** Migration fixture preserves tags and checkpoint.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.
