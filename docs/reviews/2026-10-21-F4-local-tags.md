# Phase B review: F4 local encrypted tags

Date: 2026-10-21. Reviewer: documentation author (self-run; not independent). Roadmap: Feature 4. Related audits: 01 (F4-1..F4-6, G-18), 03 (S3-08, S3-16).

## Scope reviewed

`apps/web/src/lib/tags.ts` (`TagVault`), `idbStore.ts` (IndexedDB store), the Scan view's tag UI and lock handling, Settings (idle-lock minutes).

## What the feature does

Sellers attach a private label to a detected payment. Records are AES-GCM encrypted with keys derived (HKDF-SHA-256, per-profile salt, non-extractable) from the viewing key; the lookup token is an HMAC, not a plain hash; each write uses a fresh 96-bit IV; the chain id is bound as AAD. The store holds ciphertext only. The vault locks after idle time or when the tab closes, and can be wiped. `announcementId = blockHash:logIndex` replaces the roadmap's `transactionHash` (the adapters do not keep tx hashes).

## Evidence (existing tests)

| Check | Test |
|---|---|
| Save, find, list, remove | `tags.test.ts`: "saves, finds, lists and removes tags"; "updating a tag keeps its record id and created time" |
| Ciphertext only in the store | "stores ciphertext only: no label, address, or key material appears in the store" |
| Fresh IV per write, keyed lookup token | "uses a fresh IV for each write and a keyed (not plain-hash) lookup token" |
| Lock / unlock / wrong key | "locks, refuses use while locked, and unlocks again with the same key"; "refuses a different viewing key" |
| Key bytes zeroised | "zeroizes the viewing key bytes it consumes" |
| Chain binding, tamper detection | "binds the chain id as AAD: a record moved to another chain does not decrypt"; "detects tampered ciphertext" |
| Wipe | "wipes everything, even while locked, and then starts a fresh profile" |
| Payload validation | "validates payloads" |
| Real IndexedDB holds ciphertext, in a real Worker under the CSP | Playwright: "scans in a real Web Worker under the CSP, finds my payment, and stores tags only as ciphertext" |
| UI: locked vault message, tag flow | `Scan.test.tsx`: "scans in a worker, lists my payments, supports encrypted tags and lets me pick one to sweep"; "keeps tags locked and says so when the vault rejects the viewing key" |

## Checklist (Roadmap F4)

- [x] Random record ids, HMAC lookup, per-record IV, ciphertext-only storage (tested).
- [x] Lock on inactivity and tab close; wipe (tested at unit level; idle timer wiring is covered by the Scan view, not by a browser-level timing test).
- [x] Unlocked-session caveat documented in the UI and in [receive-and-scan](../user/receive-and-scan.md).
- [ ] Export **only** an encrypted archive; import with round-trip tests: **not built** (audit F4-4). Consequence: tags are lost with site data.
- [ ] Key rotation / re-encrypt after compromise; profile-salt rotation: **not built** (F4-5).
- [ ] XSS while locked / unlocked tests: not present (F4-6).
- [ ] No plaintext in logs/backups: the app has no `console.*` calls (grep in audit 01), browser backups of IndexedDB are not analysed.

## Residual risks and gaps

1. **Record splicing (S3-16, Low, Open):** ciphertexts are bound to the chain but not to their record id, so one record's ciphertext can be swapped into another id within a chain by someone with write access to the store (local malware). Metadata such as timestamps and counts is in clear.
2. **Tags derive from the viewing key.** Anyone with the viewing key can decrypt all tags; anything running in the page while unlocked can read them.
3. **No portability or backup;** wiping site data loses them.
4. **Idle lock:** the vault locks; the *seller keys* stay in memory until wiped or the tab closes (web DEVIATIONS item 11).
5. **Not tested:** IndexedDB quota failures, concurrent tabs, browsers other than Chromium.

## Verdict

Cryptographic design is sound for a local-only convenience. Treat as non-durable. Do not claim backup, sync or rotation.
