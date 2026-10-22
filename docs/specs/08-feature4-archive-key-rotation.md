# 08 Feature 4: encrypted archive export/import and key rotation

Priority P1 | Effort M (5-7 d) | Owner: apps/web | Deps: none
Sources: Roadmap Feature 4 (4A/4B); keystore (scrypt 2^17 + AES-GCM); gap-analysis item 8 (G-18).

## 1. Data formats
Local record (existing intent): `EncryptedTagRecord` per Roadmap, with `keyVersion: number` added.
Key hierarchy: `K_root` = HKDF-SHA-256(viewKeyBytes32, salt=profileSalt(16B random), info="GhostPay/local-tags/v1") -> `K_enc` (AES-256-GCM, non-extractable) and `K_lookup` (HMAC-SHA-256) via distinct info labels `.../enc`, `.../lookup`. Lookup token = HMAC(K_lookup, chainId||stealthAddress||txHash||logIndex).
AAD for records: `"GPT1" || schemaVersion || chainId || keyVersion || recordId`.

Archive file `ghostpay-tags-YYYYMMDD.gpa` (binary, JSON header + ciphertext):
```
magic "GPA1" | u8 kdf(1=scrypt) | N=2^17,r=8,p=1 | salt(16) | iv(12) | ciphertext(AES-256-GCM of canonical JSON {version:1, createdAt, keyVersion, records:[TagPayload...]}) | tag(16)
AAD = magic || kdf params || salt
```
Plaintext records are re-encrypted under the archive key (passphrase-derived, min 12 chars + zxcvbn-class strength meter UNVERIFIED lib choice, or generated recovery phrase); archive does not contain view key, HMAC lookup tokens are regenerated on import. Size cap 20 MB; record cap 100k.

## 2. Operations
- `exportArchive(passphrase)`: requires unlocked profile and re-auth; streams; reports record count and SHA-256 of file for user check.
- `importArchive(file, passphrase, mode: 'merge'|'replace')`: parse with strict schema, reject unknown magic/version, bounds-check lengths before allocation, dry-run summary (count, conflicts) before commit, atomic IndexedDB transaction, merge conflict policy = newest `updatedAt`.
- `rotateKeys(reason)`: new `profileSalt` and `keyVersion+1`; decrypt each record with old key, re-encrypt with new in batches inside a transaction journal (`rotationState` store) so a crash resumes; after completion delete old-version records and old salt; old backups remain readable only with their own passphrase. Mandatory after suspected view-key compromise (view key itself must be replaced: rotation of tag keys does not protect past exposure).
- `clearAll()` double-confirm.

## 3. Threats
Weak passphrase -> offline attack (scrypt params, strength gate, copy); malformed archive DoS/zip-bomb (no compression, caps); nonce reuse (fresh random IV per encryption; per-archive key so one-time use); crash mid-rotation (journal); plaintext leak in downloads/logs (Blob only, no filenames with labels, no console); import overwriting newer data (dry-run + merge rule); XSS reading unlocked state (CSP; residual stated).

## 4. Tests
Round trip (1, 1000, 100k records); wrong passphrase; truncated/modified bit in every field -> auth failure with no partial write; kill-and-resume rotation (fault injection); IndexedDB dump shows no plaintext labels; fuzz importer; locked-vault refusal; deterministic KAT vectors in `test-vectors/tags.json`.

## 5. Acceptance
- [ ] Roadmap F4 checklist all ticked. - [ ] KATs cross-checked with a second implementation (node webcrypto). - [ ] Rotation survives crash at every step. - [ ] Docs: user guide for backups and honest limits.
