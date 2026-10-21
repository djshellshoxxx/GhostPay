# Spec: local-store: Local data store (ledger, templates, contacts, profiles)
Impact 5/5 | Effort M | Score 2.5 | Build wave 0 | Depends on: none
Status: abstraction + sealing helpers built in `packages/ux-core/src/store.ts` (swarm 7). IndexedDB backend, unlock/lock lifecycle, tag-vault migration and raw export are NOT built (Layer B).

## Problem
Only tags persist. Scan matches, issued invoices, receipts and contacts vanish on reload, blocking exports, reconciliation and templates.

## Exists today (verified in repo)
- apps/web/src/lib/tags.ts HKDF(viewing key) -> AES-GCM + HMAC lookup; IdbTagStore (tags only).
- apps/web/src/lib/scanClient.ts plain checkpoints in localStorage keyed by chain only.
- apps/web/src/lib/session.ts single in-memory key session.

## Design
**Layer A (built): `createStore({backend, namespace})`.**
- Backends are injected: `KvBackend {get,set,remove,keys}` (async). Provided: `MemoryBackend(quota?)`, `fromWebStorage(storage)`.
- Key format `gp1:<namespace>:<collection>:<id>`. Names `^[a-z][a-z0-9-]{0,23}$`; ids `^[A-Za-z0-9_-]{1,64}$`.
- No secrets in key names: names containing secret/mnemonic/seed/passphrase/password/private/spend/signing/wif/viewing/token are refused; ids may not start with `0x` or contain 32+ hex chars (addresses, hashes, keys). Use `lookupToken(hmacKey, collection, id)` (HMAC-SHA-256, 16 bytes, base64url) as the id for sensitive lookups.
- No secrets in values: any property named like a key/secret/seed/password (`privateKey`, `spendKey`, `viewingKey`, `mnemonic`, ...) or `__proto__/constructor/prototype` is refused on write and on read; depth 12, 20 000 nodes, no cycles, JSON types only, default 256 KiB per record.
- Versioned envelope: `{v, d}` plain or `{v, s}` sealed. `CollectionDef {name, version, parse, migrations}`; `migrations[n]` maps n to n+1 (pure). Reads migrate in memory and write back best-effort. Records with `v` greater than the code's version fail with `FUTURE_VERSION` and are never overwritten.
- Errors: `StoreError.code` in `INVALID_NAME INVALID_ID SECRET_REJECTED INVALID_VALUE TOO_LARGE QUOTA_EXCEEDED UNAVAILABLE IO_ERROR CORRUPT DECRYPT FUTURE_VERSION MIGRATION_FAILED SEALER_REQUIRED`. Backend errors are classified by `name`/`code` (`QuotaExceededError`, `NS_ERROR_DOM_QUOTA_REACHED`, 22, 1014 -> quota; `SecurityError` -> unavailable) and their message is discarded. `storeErrorToAppCode` maps to `STORAGE_QUOTA|STORAGE_BLOCKED|STORAGE_CORRUPT`.
- Collection API: `put get delete ids list count putMany`. `list` returns `{items, failed[]}` so one bad record never hides the rest. All operations on a store are serialised (consistent counts under concurrency). `putMany` restores previous values on failure. `wipe()` removes only this namespace; `usage()` reports key count and size.
- Sealing: `deriveSealKey(viewingKey, profileSalt, collection)` = HKDF-SHA-256 with `info="GhostPay/local-store/v1/<collection>"`, non-extractable AES-256-GCM key. `createAesGcmSealer(key, randomBytes)` seals with a fresh 96-bit IV (injected CSPRNG) and AAD `gp1|<ns>|<collection>|<id>|<version>`; output base64url(iv||ct). Swapping ciphertext between records, changing the stored version or using another collection's key fails with `DECRYPT`.

**Layer B (not built): ** `openStore(idb, profileId)` over IndexedDB implementing `KvBackend` (single transaction for `putMany`), random 16-byte profile id and per-profile salt, check record for wrong-key detection on unlock, idle lock via the vault, `navigator.storage.persist()` on user gesture, in-place migration of the existing tag vault (keep old DB until the user confirms), `exportRaw/importRaw` for backup-bundle.

## Privacy and security impact
Sealed collections hold ciphertext only. Collection names, record counts, ids and sizes are visible to a local attacker (documented limitation). Spending and signing keys are never stored. No network.

## Requirements
1. **LOCAL-1** MUST Fresh 96-bit IV per seal; AAD mismatch makes open fail.
2. **LOCAL-2** MUST Wrong viewing key cannot open sealed records (`DECRYPT`).
3. **LOCAL-3** MUST Distinct HKDF info per collection.
4. **LOCAL-4** MUST Parsers reject unknown fields (helper `hasOnlyKeys`); migrations are pure; failed migration leaves stored data untouched.
5. **LOCAL-5** MUST Works with MemoryBackend, Storage-like and (Layer B) IndexedDB through the same interface.
6. **LOCAL-6** MUST Never write plaintext secrets, raw addresses in key names, or unkeyed hashes as ids.
7. **LOCAL-7** SHOULD Quota/unavailable detection mapped to user guidance (done); persist request (Layer B).
8. **LOCAL-8** SHOULD `putMany` all-or-restore (best effort; single IDB transaction in Layer B).
9. **LOCAL-9** MUST Future-version records are never overwritten.
10. **LOCAL-10** MUST Corrupt records are reported by id and do not affect others.

## Acceptance tests (`store.test.ts`)
1. **T-1** CRUD/list/count round trip; namespaces isolated; `wipe` leaves foreign keys.
2. **T-2** flip one ciphertext char -> `DECRYPT`, sibling record readable.
3. **T-3** copy ciphertext of r2 into r1 -> `DECRYPT`; tamper version -> `DECRYPT`.
4. **T-4** memory dump of a sealed collection contains neither a known label nor a known address.
5. **T-5** v1 -> v2 fixture converts, writes back at v2 (and re-seals); missing/throwing migration -> `MIGRATION_FAILED`, bytes unchanged.
6. **T-6** 50 concurrent puts over 30 ids -> count 30.
7. **T-7** quota exceeded leaves previous data byte-identical; error code maps to `STORAGE_QUOTA`.
8. **T-8** secret-name matrix (`privateKey`, `seedPhrase`, nested `secret`, `0x`+40 hex id, 32-hex id, `__proto__`) all refused, backend stays empty.
Layer B tests (real fake-indexeddb, tag-vault migration, lock/unlock) belong to the wiring session.
