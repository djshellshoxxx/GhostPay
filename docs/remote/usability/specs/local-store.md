# Spec: local-store: Encrypted local store (ledger, templates, contacts, profiles namespace)
Impact 5/5 | Effort M | Score 2.5 | Build wave 0 | Depends on: none

## Problem
Only tags persist (encrypted). Scan matches are memory-only (state.tsx matches; Scan.tsx:70 app.setMatches([])), issued invoices, receipts and contacts vanish on reload, blocking dashboards, exports, reconciliation and templates.

## Exists today (verified in repo) vs missing
- apps/web/src/lib/tags.ts HKDF(viewing key)->AES-GCM + HMAC lookup, IdbTagStore apps/web/src/lib/idbStore.ts (tags only, DB "ghostpay-tags").
- apps/web/src/lib/scanClient.ts:149 plain checkpoints in localStorage keyed by chain only (no profile namespace).
- apps/web/src/lib/session.ts:29 single in-memory key session.
- Missing: everything described under Design.

## Design
Generic typed collections over IndexedDB with the tags.ts crypto pattern: per-profile random salt, HKDF(viewing key, info="GhostPay/local-store/v1/<collection>") -> AES-256-GCM non-extractable key, HMAC lookup tokens, AAD binds {schemaVersion, collection, profileId}. Collections: ledger (matches, receipts), invoices (issued metadata, no secrets), templates, contacts. Versioned migrations; quota-error handling; lock/unlock reuses vault idle lock. Profile id is a random 16-byte value, giving namespace for later multi-profile. Existing tag vault migrates in place (read old DB, rewrite, keep old until user confirms).

## Privacy and security impact
Ciphertext only on disk; collection names and sizes are visible to local attackers (documented). Never stores spending/signing keys. Unlock requires keys in memory. Wipe API deletes DB. No network.

## Build ownership
- NEW package: `packages/local-store` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/local-store`.
- Public API (exports from `src/index.ts`):
- `openStore(idb: IDBFactory|MemoryBackend, profileId): Store`
- `store.unlock(viewingKey: Uint8Array): Promise<void>; lock(); wipe()`
- `store.collection<T>(name, codec): {put(id,v); get(id); list(filter?); delete(id); count()}`
- `codec = {version: number; parse(unknown): T; migrate(from: number, raw): unknown}`
- `exportRaw(): Promise<EncryptedDump>; importRaw(d) (consumed by backup-bundle)`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

## UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/lib/services.ts + defaultServices.ts (add store to Services)
- apps/web/src/App.tsx (lock on idle, as vault today)
- apps/web/src/views/Scan.tsx (persist matches after scan)
- Add `@ghostpay/local-store` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

## Requirements
1. **LOCAL-1** MUST All records encrypted with a fresh 96-bit IV; AAD mismatch makes decryption fail (tamper test).
2. **LOCAL-2** MUST Wrong viewing key cannot decrypt; unlock verifies via check record like tags.ts.
3. **LOCAL-3** MUST Keys derived with distinct HKDF info per collection.
4. **LOCAL-4** MUST Schema parse rejects unknown fields; migrations are pure and tested.
5. **LOCAL-5** MUST Works against MemoryBackend (tests) and real IndexedDB.
6. **LOCAL-6** MUST Never writes plaintext, raw addresses or unkeyed hashes.
7. **LOCAL-7** SHOULD Quota/ storage-eviction detection with navigator.storage.persist() request (user gesture).
8. **LOCAL-8** SHOULD Bulk put in one transaction.

## Acceptance tests
1. **T-1** Round trip put/get/list per collection.
2. **T-2** Flip one ciphertext byte -> get throws DECRYPT, other records unaffected.
3. **T-3** Swap ciphertext between two records -> AAD failure.
4. **T-4** Scan raw IDB dump (memory backend): no occurrence of any known plaintext address/label.
5. **T-5** Migration v1->v2 fixture converts and re-encrypts.
6. **T-6** Concurrent puts keep consistent counts.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.
