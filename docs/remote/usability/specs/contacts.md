# Spec: contacts: Encrypted contacts and labelled destinations
Impact 3/5 | Effort S | Score 3 | Build wave 1 | Depends on: local-store

## Problem
Pinned seller keys are bare hex in a plain-text textarea (Settings.tsx:19,111); sweep destination is free text (Sweep.tsx:253); no labels, no poisoning protection.

## Exists today (verified in repo) vs missing
- apps/web/src/lib/settings.ts:12,19 pinnedSigners plain in localStorage (max 50).
- apps/web/src/views/Pay.tsx:48 pinned usage.
- docs/remote/specs/address-safety.md (lookalike/poisoning checks).
- Missing: everything described under Design.

## Design
Contact = {id, label, kind: signer|destination, value, note, createdAt}. Signers: label + compressed key; sync into the pin set passed to parseFragment (settings.pinnedSigners migrated here, old field kept readable). Destinations: label + address with a "reuse links your wallets" flag; hygiene prefers fresh destinations, so UI lists them as "known wallets" and warns on use. Duplicate/lookalike detection delegated to address-safety when available (prefix/suffix collision check implemented locally as fallback).

## Privacy and security impact
Encrypted at rest (local-store); labels never leave device; export only via backup-bundle.

## Build ownership
- NEW package: `packages/contacts` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/contacts`.
- Public API (exports from `src/index.ts`):
- `addContact/validate(c): Problem[]`
- `pinSet(contacts): string[]`
- `lookalike(addr, contacts): Contact[]  // same first4+last4`
- `codec for local-store`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

## UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/views/Settings.tsx (pins section reads contacts)
- apps/web/src/views/Sweep.tsx (destination picker)
- apps/web/src/views/Pay.tsx (signer label display)
- Add `@ghostpay/contacts` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

## Requirements
1. **CONTA-1** MUST Signer value validated as 66-hex 02/03 compressed point.
2. **CONTA-2** MUST Destination addresses stored lowercase and EIP-55 verified when mixed case.
3. **CONTA-3** MUST lookalike() flags any distinct address sharing first4+last4 hex.
4. **CONTA-4** MUST Migration copies settings.pinnedSigners without deleting until confirmed.
5. **CONTA-5** SHOULD Show label next to the key short-hex on Pay.

## Acceptance tests
1. **T-1** Mixed-case address with bad checksum rejected.
2. **T-2** Two addresses sharing 0xabcd…1234 flagged.
3. **T-3** pinSet output equals legacy pins after migration.
4. **T-4** Invalid compressed key rejected.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.
