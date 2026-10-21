# Audit: ux-vault

## Scope and threat model
Assets: contact labels/addresses/notes (privacy; integrity of payee addresses = funds safety). Attackers: (A) holds a copy of storage or a backup file (offline guessing, tampering); (B) supplies a malicious backup (address swap, DoS, injection); (C) co-resident page script / malware with memory access (out of scope); (D) UI spoofing via look-alike labels/addresses (address poisoning).

## Design
PBKDF2-HMAC-SHA256 (600k default; header min 210k; max 10M) -> AES-256-GCM, random 16-byte salt and 96-bit nonce per seal, 128-bit tag. AAD = magic, format version, purpose, iterations, profile id, salt. Keys are non-extractable CryptoKeys; password byte buffers and plaintext buffers zeroed after use (best effort; JS strings cannot be wiped). No dependency added; `@ghostpay/secret-box` not used because package.json may not change.

## Findings
| # | Sev | Finding | Evidence | Status |
|---|---|---|---|---|
| 1 | High | Backup could silently re-point an existing payee id to an attacker address (newer timestamp) | schema.test "address swap is never applied by default" | Fixed: address changes only with explicit `incoming` policy; reported as conflict |
| 2 | High | Tampered header could force huge/low iteration counts (DoS / downgrade) | envelope.test | Fixed: bounds checked before KDF; iterations in AAD |
| 3 | Med | Failure-cause oracle (wrong password vs missing profile vs tamper) | vault.test "fail identically" | Fixed: one error code+message; dummy KDF for missing profile |
| 4 | Med | Blob swapped between profiles/purposes | vault.test isolation, purpose test | Fixed: AAD + slot id check + purpose check |
| 5 | Med | Invisible/bidi/homoglyph labels and addresses | contacts/confusables tests | Mitigated: rejected in labels and addresses, skeleton/mixed-script warnings |
| 6 | Med | Untrusted JSON (prototype pollution, extra fields, dup ids, oversized) | schema.test | Fixed: own-property reads, field whitelist, limits, dup checks |
| 7 | Low | Profile `publicLabel` and profile count are plaintext metadata | design | Accepted; documented, UI warning in wiring plan |
| 8 | Low | Ciphertext length leaks approximate contact count | design | Accepted; no padding |
| 9 | Low | No online rate-limit/lockout (offline attacker unaffected anyway) | design | UI-owned; PBKDF2 cost is the real defence |
| 10 | Info | Merge has no tombstones: deletions do not propagate through merge imports | design | Use replace mode to mirror deletions |

## Unverified / limits
- Strength of user passwords is only length-checked (>= 10 code points).
- Look-alike and homoglyph detection is heuristic (small homoglyph table, not full UTS #39); it warns, it cannot prove safety.
- Zeroization is best effort; strings and V8 copies of decrypted data may persist in memory. Nonce uniqueness relies on the platform CSPRNG (random 96-bit; fine below ~2^32 writes per key; changing password re-salts).
- Test iterations are 1000 for speed; real-world 600k timing and IndexedDB behaviour were not exercised. No browser/WebCrypto implementation other than Node 22 was tested.
- No external review. Concurrent multi-tab writes to the same storage are not coordinated (last write wins); the UI should use a lock (e.g. Web Locks) per profile.
