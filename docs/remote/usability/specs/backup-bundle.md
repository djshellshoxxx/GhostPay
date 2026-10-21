# Spec: backup-bundle: Encrypted full backup and restore
Impact 5/5 | Effort M | Score 2.5 | Build wave 1 | Depends on: local-store

## Problem
Clearing browser data loses tags, settings, checkpoints (docs/user/troubleshooting.md: "Tags gone ... There is no encrypted export yet"); keystore backup covers keys only.

## Exists today (verified in repo) vs missing
- apps/web/src/lib/keystore.ts scrypt N=2^17 + AES-GCM keystore export/import (SellerKeys.tsx:56 download).
- docs/remote/modules-needed.md rank 11 (backup/recovery Partial); import cost uncapped (audit S3-13).
- Missing: everything described under Design.

## Design
One versioned JSON envelope: {magic, v, kdf params, salt, nonce, ciphertext} holding a manifest of sections (settings, checkpoints, local-store dump, templates, contacts, profile meta, optionally the keystore). Passphrase -> scrypt (same params floor as keystore.ts) -> AES-256-GCM, AAD = magic||v||section-list. Import validates every section with its codec before applying; applies atomically (stage then swap); shows a diff summary (counts) and requires explicit merge/replace choice. KDF parameters on import are bounded (N<=2^20, r,p caps) to prevent DoS.

## Privacy and security impact
Bundle never contains seller secrets unless the user ticks "include keys" (default off; keystore already exists). Passphrase strength meter reuses passphraseProblem. File is local only; no cloud sync. Warn that a backup containing the ledger reveals commercial history if passphrase is weak.

## Build ownership
- NEW package: `packages/backup-bundle` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/backup-bundle`.
- Public API (exports from `src/index.ts`):
- `createBackup(sections: SectionData, passphrase: string, opts?: KdfOpts): Promise<string>`
- `inspectBackup(text): {v; sections: string[]; kdf}  // no decryption`
- `restoreBackup(text, passphrase): Promise<SectionData>`
- `applyPlan(current, restored, mode: "merge"|"replace"): Plan`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

## UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/views/Settings.tsx (Backup & restore fieldset)
- apps/web/src/lib/services.ts (expose sections)
- Add `@ghostpay/backup-bundle` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

## Requirements
1. **BACKU-1** MUST KDF parameter bounds enforced before any scrypt call.
2. **BACKU-2** MUST Wrong passphrase and tampered ciphertext are indistinguishable errors.
3. **BACKU-3** MUST Unknown section ids are ignored, not applied; unknown major version rejected.
4. **BACKU-4** MUST Restore is atomic: failure leaves existing data untouched.
5. **BACKU-5** MUST Passphrase min policy equals keystore.ts passphraseProblem.
6. **BACKU-6** SHOULD Embed a SHA-256 of plaintext sections inside the ciphertext for corruption detection.
7. **BACKU-7** SHOULD Dry-run restore preview.

## Acceptance tests
1. **T-1** Round trip equality of all sections.
2. **T-2** N=2^25 in header -> rejected without running scrypt.
3. **T-3** Bit flip anywhere -> DECRYPT error.
4. **T-4** Restore with failing section codec leaves store unchanged (spy on writes).
5. **T-5** Bundle without keys section contains no 64-hex secret known to the test.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.
