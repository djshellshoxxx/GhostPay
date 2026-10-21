# Audit: ux-presets

## Threat model
Assets: preset contents (payees, amounts, memos); integrity of pay-again drafts. Adversaries: someone with read/write access to local storage (malware-free disk/profile access, extensions with storage access), malicious imported data, a compromised address-risk/fee source (out of scope, inputs are injected). Out of scope: a compromised page/JS context (can use the live key), key derivation and key storage (caller's job).

## Findings
| # | Sev | Finding | Status |
|---|-----|---------|--------|
| 1 | Medium | Cross-session rollback or deletion of the blob is undetectable (attacker restores an older valid ciphertext). Only in-instance rollback is detected. | Documented; mitigate by persisting the revision in a separate trusted place (e.g. vault) |
| 2 | Medium | Pay-again could silently pay a swapped address. | Fixed: draft uses the freshly resolved address; any difference from the record is a `block` flag; never auto-sends |
| 3 | Low | Decryption error oracle. | Fixed: one code and message for all open failures; tested over every byte flip |
| 4 | Low | Wrong key could overwrite data on save. | Fixed: failed load aborts the write; tested |
| 5 | Low | Blob moved between slots. | Fixed: slot in AAD |
| 6 | Low | Spoofed text (bidi overrides, control chars) in label/memo. | Fixed: rejected at validation |
| 7 | Low | Random 96-bit IV under one key: collision risk negligible below ~2^32 writes per key. | Accepted; rotate the key long before |
| 8 | Info | Concurrent tabs can interleave read-modify-write (serialization is per instance). | Unverified/unmitigated; use a Web Lock in the adapter if multi-tab |
| 9 | Info | Storage reveals blob size (approximate preset count) and write timing. | Accepted |

## Verified by tests
Tamper of any byte, wrong key, wrong slot, truncation/extension, bad version, malformed/duplicate plaintext all give identical failure; fee tolerance edge cases exact in bigint; throwing injected callbacks fail closed.

## Unverified
Not tested in browsers (only Node WebCrypto); no timing analysis (constant-time behaviour relies on the platform's GCM); caller's key derivation, memory wiping of the caller's key bytes (we copy before import and cannot wipe CryptoKey); address-risk and fee sources are trusted inputs; chain-specific address syntax is the injected validator's responsibility.
