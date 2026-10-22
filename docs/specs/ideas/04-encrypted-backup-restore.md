# Idea 04 (B1): encrypted backup, restore drill and scan-state restore

Status: draft spec | Priority: shortlist #5 (ideas.md) | Effort: M-L (8-11 d) | Owner: apps/web | Date: 2026-10-21
Closes: G-18 (gap-analysis item 8). Builds on: spec 08 (tag archive, key rotation). Prerequisite for: B2, C3, D2.
Plan: [../../remote/plans/ideas/04-encrypted-backup-restore.md](../../remote/plans/ideas/04-encrypted-backup-restore.md)

Facts below were read from the repo on 2026-10-21: `apps/web/src/lib/{keystore,session,tags,idbStore,scanClient,settings}.ts`, `views/{SellerKeys,Scan}.tsx`. Anything not read is marked UNVERIFIED.

## 1. Problem (what is true today)
- Seller keys (spending, viewing, signing: three random 32-byte values; there is **no mnemonic**) live only in memory (`session.ts`). The only durable copy is the user's `ghostpay-keystore.json` (scrypt 2^17 + AES-256-GCM, `keystore.ts`). Lose it and the funds behind every stealth address are gone.
- Client tags are in IndexedDB (`ghostpay-tags`), encrypted under HKDF(viewing key) (`tags.ts`). They are **not** in the keystore, so a new device loses every label.
- Scan cursors are plain JSON in `localStorage` (`ghostpay.scan.checkpoint.v1.<chainId>`). Scan **matches are not persisted** (`app.setMatches`, memory only). Consequence (existing defect, found while writing this spec): "Resume from checkpoint" after a reload shows only payments found *after* the cursor; earlier payments vanish from the UI. Restoring cursors alone would reproduce that bug on a new device. Scan-state restore therefore must carry matches (section 4.4) or must not restore the cursor.
- Nothing proves a backup is readable. No drill exists.

## 2. Goals / non-goals
Goals: (G1) one encrypted file holding keys + tags + scan state + non-secret settings; (G2) a restore drill that proves the file and passphrase work, gating invoice creation until passed or explicitly waived; (G3) restore on a clean browser profile with no previous data; (G4) restoring scan state avoids a full rescan without ever hiding a payment; (G5) 100% client-side.
Non-goals: no server, no sync, no cloud API integration (user saves the file where they like); no mnemonic/SLIP-39 (that is B2); no backup of the wallet (payer) side; no automatic/background backup (a static page cannot run unattended; File System Access API persistent handles are UNVERIFIED and not used); no recovery if both file and passphrase are lost; no compression.

## 3. UX
Entry point: Seller keys > "Backup and restore" panel.
1. **Create backup.** Choose contents (checkboxes: Keys [default on], Labels/tags [on], Scan state [on], Settings [on], RPC URLs [off, warning: may contain API keys]). Passphrase twice, min 12 characters (keystore's 10 stays for legacy files), local strength hint (length + character classes; no network lookup, no third-party library in v1). Button "Generate 6-word passphrase" (EFF large wordlist, 7776 words, about 77 bits; wordlist licence UNVERIFIED, check before bundling). Export needs the session unlocked (keys in memory). Output: download `ghostpay-backup-<yyyymmdd>-<6 random hex>.gpbak` (option "neutral name" `backup-<6 hex>.bin`). After download the UI shows file size, record counts, and fingerprint (first 16 hex of SHA-256 over the whole file) to compare later.
2. **Restore drill** (section 6). Required once per key set; re-offered when tags/scan data changed a lot.
3. **Restore.** On a clean profile: pick file, passphrase, dry-run summary (meta-address fingerprint, N tags, chains + cursors, backup date and app version, "keys differ from the current session" warning if applicable), confirm, commit. Keys go to the in-memory session exactly like `importKeystore`; nothing key-related is written to web storage.
4. **Staleness line**: "Keys: backup valid (keys never change). Labels: 14 added since the last backup. Scan state: 3 days old." Keys section never goes stale unless the user generates new keys.

Copy rules: always say "keep the file and the passphrase separately; neither can be recovered"; never say the backup is "safe in the cloud"; say that a stored file reveals that you use GhostPay and roughly how much data you hold.

## 4. Formats
### 4.1 Container (`GPB`, version 1)
UTF-8 JSON, no whitespace, one object, field order as shown. Extension `.gpbak`, MIME `application/octet-stream`.
```jsonc
{
 "format": "ghostpay-backup", "v": 1,
 "kdf": { "alg": "scrypt", "N": 131072, "r": 8, "p": 1, "salt": "<64 hex = 32 bytes>" },
 "commit": "<64 hex>",                       // HMAC-SHA-256(Kc, canonicalHeader), Kc = HKDF(master,"GhostPay.backup.v1/commit")
 "sections": [ { "id": "info",     "iv": "<24 hex>", "len": 4096, "ct": "<base64url>" },
               { "id": "keys",     ... }, { "id": "tags", ... }, { "id": "scan", ... }, { "id": "settings", ... } ]
}
```
- `master` = scrypt(NFKC(passphrase) as UTF-8, salt, N, r, p, dkLen 32) (same call shape as `keystore.ts`). Defaults N=2^17,r=8,p=1. Writer may use N=2^18 ("strong", offered only when `deviceMemory` is unknown/>=8, UNVERIFIED API) never below 2^17. Reader accepts N in [2^15, 2^20], power of two, r in [1,16], p in [1,4], else rejects before any KDF work. N<2^17 shows a warning.
- Section key = HKDF-SHA-256(ikm=master, salt=empty, info=`"GhostPay.backup.v1/" + id`, L=32), imported as non-extractable AES-GCM (WebCrypto, same pattern as `tags.ts`).
- Per section: fresh random 96-bit IV; AES-256-GCM, 128-bit tag appended to `ct`.
- `canonicalHeader` = the JSON of `{format,v,kdf,sections:[{id,len}...]}` (ids and ciphertext lengths in order, no iv/ct). AAD for section = `"GhostPay.backup.v1|" + canonicalHeader + "|" + id`. So removing, reordering, truncating, swapping sections or changing KDF params fails authentication. `commit` gives key commitment (AES-GCM alone is not key-committing) and one cheap "wrong passphrase or tampered" check after the KDF; the user-visible message is identical for both (as `keystore.ts`).
- **Padding**: plaintext = `u32be(length) || json || zero bytes` padded to the next multiple of 4096 up to 64 KiB, then to the next power of two beyond (hides record counts to a factor of 2). Padding is inside the AEAD.
- Section order fixed: info, keys, tags, scan, settings; absent sections omitted (an export without keys is valid and clearly labelled "data only").
- Limits: file <= 32 MiB; each section <= 24 MiB decoded; reject before allocating (check `len`, base64 length). Unknown `v` or `format`: reject with "made by a newer/different version". Unknown section id: ignore only if id starts with `x-` else reject. Unknown JSON fields inside a known section: reject (strict schema, copy into fresh objects; no prototype pollution).

### 4.2 Section plaintexts (JSON)
- `info`: `{ "createdAt": <unix s>, "app": "<semver+commit>", "counts": {"tags":n,"matches":n}, "metaAddressSha256": "<hex>" }` (hash only; the drill compares it to the key section).
- `keys`: `{ "spendingKey":hex64, "viewingKey":hex64, "signingKey":hex64, "metaAddress":str, "signer":hex66 }` (superset of keystore plaintext; the importer recomputes metaAddress/signer from the three keys and rejects a mismatch).
- `tags` (aligned with spec 08 `TagPayload`): `{ "keyVersion":n, "records":[ {"chainId":n,"stealthAddress":"0x..","announcementId":"0x<64>:<idx>","logIndex":n,"clientLabel":s,"invoiceLabel"?:s,"notes"?:s,"createdAt":n,"updatedAt":n} ] }`. Plaintext tags only; local lookup tokens and local record ciphertexts are NOT exported and are regenerated on import under the target profile's key. Caps: 100k records, label 200, notes 2000 chars (as `tags.ts`).
- `scan`: `{ "chains":[ { "chainId":n, "announcer":"0x..", "cursor":{"nextBlock":"<dec>","last"?:{"number":"<dec>","hash":"0x<64>"}}, "headAtBackup":"<dec>", "matches":[ {"id":"blockHash:logIndex","blockNumber":"<dec>","blockHash":..,"logIndex":n,"txHash"?:..,"schemeId":"<dec>","stealthAddress":..,"caller":..,"ephemeralPublicKey":hex,"metadata":hex,"viaRouter":bool} ] } ] }`. All public chain data; derived from the viewing key so it is only sensitive in aggregate.
- `settings`: subset of `Settings` (`delayMinSec`,`delayMaxSec`,`lockTimeoutMin`,`theme`,`autoClearFragment`,`pinnedSigners`,`relayerUrl`; `rpcUrls` only if ticked). Re-validated with `sanitizeSettings` on restore.

### 4.3 Types (apps/web/src/lib/backup.ts, new)
```ts
export type BackupSectionId = 'info' | 'keys' | 'tags' | 'scan' | 'settings';
export interface BackupOptions { include: Readonly<Record<Exclude<BackupSectionId,'info'>, boolean>>; includeRpcUrls: boolean; kdf?: { N: 131072 | 262144 }; neutralName: boolean; }
export interface BackupPlan { sections: BackupSectionId[]; counts: { tags: number; matches: number; chains: number }; bytesApprox: number; }
export interface RestoreDryRun { createdAt: number; app: string; metaAddressSha256: string; hasKeys: boolean; counts: BackupPlan['counts']; conflicts: { keysDifferFromSession: boolean; tagsNewerLocal: number; cursorsAheadOfBackup: number }; warnings: string[]; }
export function createBackup(src: BackupSource, passphrase: string, opts: BackupOptions, test?: { salt?: Uint8Array; ivs?: Uint8Array[] }): Promise<{ bytes: Uint8Array; fingerprint: string; plan: BackupPlan }>;
export function openBackup(bytes: Uint8Array, passphrase: string): Promise<OpenedBackup>;   // throws UserFacingError, never partial
export function dryRun(o: OpenedBackup, local: LocalState): RestoreDryRun;
export function applyRestore(o: OpenedBackup, mode: 'clean' | 'merge' | 'replace-keys', deps: RestoreDeps): Promise<RestoreReport>;
```
`BackupSource` = {session keys via `unsafeRevealSecret` inside the module only, `TagVault.list()`, checkpoints, in-memory matches, settings}. Revealed key bytes are zeroized in `finally` (as `keystore.ts` does). `openBackup` returns decrypted objects only after every section authenticated and schema-validated.

### 4.4 Scan-state restore rules (the part that can lose money if wrong)
1. A restored cursor is an **optimisation, never a statement of completeness**. Restore sets `nextBlock = max(chainDeployBlock, cursor.nextBlock - (finalityDepth + windowBlocks))` (rewind by finality + one window; dedupe by `id`). Chain constants come from `chains.ts` (Sepolia finalityDepth 64, Base Sepolia 100).
2. The cursor is applied **only together with** that chain's `matches` from the same backup. If `matches` were not exported, the cursor is discarded and the user is told a full rescan is needed.
3. Restored `announcer` must equal the manifest announcer for that chain; otherwise discard that chain's scan state (different deployment).
4. If `cursor.last.hash` is present, the first scan run after restore re-checks that block via `getBlock`; mismatch => fall back to `nextBlock = deployBlock` for that chain (full rescan), using the existing reorg path.
5. Restored matches are shown as "restored, unverified"; payment verification (spec 02: balance and token checks) re-runs before any "paid" status. A backup is not an authority on balances.
6. If the local checkpoint is *ahead* of the backup, keep the local cursor and union matches by `id`.
7. Companion fix (own small task, flagged here because B1 depends on it): persist matches locally (`ScanStateStore` in IndexedDB, AES-GCM under HKDF(viewing key, info `GhostPay/local-scan/v1`)), so reload-resume stops losing matches. Without it the backup can only capture matches that are in memory at export time; the UI must say so.

## 5. Storage and key handling
- Passphrase: typed, held in a local variable, used once, never stored, never logged, never in URL. `autocomplete="off"`; the strength hint runs locally.
- Keys: only inside `backup.ts`/`session.ts`; `SecretScalar` redaction preserved; plaintext JSON buffers zeroized after encrypt/decrypt where the runtime allows (JS strings cannot be zeroized: residual, stated).
- The file never goes through `localStorage`/IndexedDB. Download via `Blob` + object URL, revoked after use (reuse `downloadText` pattern; need a binary variant). No `console` output of any backup material; add a lint/test assertion.
- Drill state in `localStorage` key `ghostpay.backup.drill.v1`: `{ keysFingerprint, backupFingerprint, passedAt, mode }`. Non-secret; tolerate storage failure (then the drill simply shows as not done).
- Restore writes: keys -> in-memory session (`importSession`), tags -> `TagVault` (unlock with restored viewing key; add `putMany` doing one IDB transaction), checkpoints/matches -> stores, settings -> `saveSettings`. Order: validate everything, then commit tags in a single transaction, then the rest; a failure rolls back the IDB transaction and leaves checkpoints/settings untouched (they are written last).
- Interaction with spec 08: B1's container replaces spec 08's `GPA1` *file* (one format, not two). Spec 08's operations (merge policy newest `updatedAt`, `rotateKeys`, `clearAll`, caps) stay. After `rotateKeys` the drill is marked stale. Known mismatches to fix in whichever lands first: spec 08 text says HKDF info `GhostPay/local-tags/v1/enc|lookup` and AAD `GPT1...`, the shipped `tags.ts` uses `.../aes-gcm`, `.../hmac` and AAD `GhostPay/tag/v1|chainId`; keystore min passphrase 10 vs spec 08 12. The code is the truth; B1 does not touch local record encryption, so it is unaffected, but update spec 08 to match the code.

## 6. Restore drill
Purpose: prove a *separately stored copy* can be read and gives the same identity, before money arrives.
Steps (wizard, cannot be skipped by clicking Next):
1. App has just created a backup (or user picks "test an existing backup").
2. App drops the in-memory copy of the passphrase and asks the user to **choose the file again from where they stored it** (file picker; proves it is on disk/cloud/USB and not only in the Downloads blob) and to **type the passphrase again**.
3. `openBackup` runs in full (KDF + all sections). The app compares: `metaAddressSha256` and recomputed meta-address equal the live session; tag count equals; for scan section, cursors parse; then shows a green summary and stores `passedAt`.
4. Optional strong drill ("fresh profile"): button opens a link to the app in a private window instructions + checklist: restore there, compare meta-address fingerprint (first/last 6 chars shown in both). Not verifiable by the app (no cross-profile channel); it is user attested.
Gating: while the drill is not passed for the current key set, "Create invoice" and "Show/copy meta-address" show a blocking banner "No tested backup. If this browser tab closes you lose access to payments." with two buttons: "Back up now" and "I accept the risk" (requires typing `I ACCEPT`; logs `waived` locally, re-prompts every session). The app cannot know whether funds exist, so the gate is on *sharing the receiving identity*, the last point before money can arrive.
What the drill does not prove: that the file survives next year, that the user will remember the passphrase, that the storage location is independent of the device (it asks the question, cannot verify).

## 7. Threat model
| Threat | Handling |
|---|---|
| Offline passphrase guessing on a stolen file | scrypt 2^17 (128 MiB), 12-char minimum, generated 6-word option; strength hint. Cost is bounded, not infinite: a weak passphrase loses. |
| File in cloud/email reveals metadata | padded sizes, neutral filename option, no plaintext createdAt/labels. Still leaks: that the file is a GhostPay backup (magic string `ghostpay-backup`; option to drop it is rejected: needed for safe parsing, and a random-looking blob would not help against a determined analyst), approximate size, upload time. |
| Tampering/section swap/downgrade | AEAD per section with header in AAD, commit tag, bounded KDF params. |
| Malicious/oversized file (DoS) | size/length bounds before allocation, no compression, strict schema, KDF params bounded (scrypt `maxmem` explicit). |
| Weak randomness | WebCrypto `getRandomValues` for salt/IV only. |
| Nonce reuse | one fresh random 96-bit IV per section per file; per-file random salt so keys differ per file; collision risk negligible at this volume. |
| XSS / malicious extension on the page | can read keys in memory or intercept the passphrase. CSP helps; residual stated. Backups do not fix a compromised page. |
| Restore creates money-losing state | rules 4.4 (rewind, tied matches, verify). |
| User restores an old backup over newer data | dry-run, never delete newer local tags, key replacement needs typing the first 6 chars of the current meta-address. |
| Passphrase phishing by lookalike page | out of scope; same as keystore. |
Does NOT hide / does NOT do: it does not hide anything on-chain; it does not protect against a user who stores file and passphrase together; it is not a defence against a compromised browser; it is not synced or automatic; an attacker with the file and the passphrase gets the spend key.

## 8. Failure modes and UX
- Wrong passphrase / modified file: one message "Wrong passphrase, or the backup was modified." No partial state.
- File from a newer version: refuse, show required version. File from an older GhostPay keystore (`ghostpay-keystore.json`): offered through the existing import path (keys only).
- Low-memory device (scrypt 128 MiB fails): catch, explain, keep file; suggest desktop. Do not silently lower N on write; reader accepts down to 2^15.
- Download blocked/Blob unsupported: show "Copy as text (base64url)" fallback (large files discouraged, warn).
- Storage unavailable (private window): drill state not saved, banner remains; tag restore refuses with a clear message (IndexedDB unavailable).
- Quota exceeded during tag import: transaction aborts, nothing partially restored.
- Chain/announcer mismatch: scan section dropped for that chain, others kept, listed in the report.
- Tab closed mid-restore: keys are in memory only; tags either committed fully or not at all.

## 9. Test plan
Unit (vitest, existing `*.test.ts` convention): round trip with 0/1/1000/100k tags and 10k matches (size/time budgets noted, N lowered via test option as in `keystore.test.ts`); every byte-flip class (each header field, each `iv`, `len`, `ct`, `commit`) -> auth/parse failure and zero writes (fake stores assert no calls); section removal/reorder/duplication; KDF-param bounds (N=2^13, 2^21, r=0, p=9 rejected before KDF); strict schema (unknown fields, `__proto__`, wrong types); key mismatch (metaAddress differs from recomputed) rejected; padding sizes; scan rules 4.4 (rewind math, discard when matches missing, announcer mismatch, local-ahead union, hash mismatch fallback); drill state machine (needs re-pick and re-type; waived path); settings sanitize on restore (bad RPC URL dropped).
Known-answer vectors `test-vectors/backup.json`: fixed passphrase, salt, ivs, contents -> expected bytes; verified by an independent implementation (Node `crypto.scrypt` + `webcrypto` HKDF and a Python `cryptography` script kept under `tools/`), as spec 08 requires.
Integration (Playwright, existing setup): create backup -> clear all site data (new context) -> restore -> same meta-address, tags visible, scan resumes with matches present; IndexedDB dump has no plaintext labels; network log shows zero requests with backup bytes (egress test); the drill gate blocks "Create invoice" until passed; fuzz the importer with 10k mutated files (no throw other than `UserFacingError`, no hang > 2 s at test N).
Manual: restore on iOS Safari, Firefox, Chromium; large file on a low-RAM phone.

## 10. Acceptance criteria
- [ ] One `.gpbak` round-trips keys, tags, scan state, settings; restored meta-address identical.
- [ ] KATs match the independent implementation byte for byte.
- [ ] No tamper case writes anything; fuzz clean.
- [ ] Clean-profile Playwright restore green; reload-resume shows previously found matches (needs 4.4 rule 7 or documented limitation in UI).
- [ ] Drill gate works and cannot be passed without re-picking the file and re-typing the passphrase.
- [ ] Copy reviewed: states what the backup does not protect (section 7); user doc `docs/user/backup-and-restore.md` (new, written at implementation time).
- [ ] No backup bytes/passphrase in storage, logs or network (tests).
- [ ] Spec 08 updated to reference this container and the code's real labels.
- [ ] THIRD_PARTY.md entry if the wordlist is bundled.

## 11. Effort and dependencies
Core crypto + container 3 d; section builders/parsers + restore + scan rules 3 d; UI + drill + gating 2-3 d; matches persistence (rule 7) 1-2 d; KATs + Playwright + docs 2 d. Total 8-11 d, one engineer. Depends on: spec 08 tag operations (`putMany`, merge, `rotateKeys` marker), spec 02 payment verification (for "restored, unverified"), existing keystore code (reuse `derive`). Independent of any server.

## 12. Audit checklist
- [ ] KDF/AAD/commit construction reviewed; no key reuse across sections; IV uniqueness.
- [ ] All parsers bounded before allocation; no `eval`-like paths; prototype-pollution tests.
- [ ] Key bytes zeroized; no secret in React state, logs, errors, URLs.
- [ ] Restore atomicity and scan rules 4.4 reviewed by someone other than the author.
- [ ] Gate bypass is explicit and re-prompted; waiver is local only.
- [ ] CSP unchanged (no new origins needed); no new network code in the feature.
- [ ] Copy does not overclaim ("safe", "recoverable").
