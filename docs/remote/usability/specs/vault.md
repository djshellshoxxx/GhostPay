# Spec: ux-vault (address book, profiles, backup)

Package: `packages/ux-vault`. All acceptance tests below are implemented in `src/*.test.ts`.

## V1 Encrypted address book
Requirements
- Contact = id (128-bit hex), label, address, network slug, tags (max 16, `[a-z0-9_-]{1,32}`), note (500), createdAt/updatedAt from injected clock. Max 5000 contacts.
- Label: NFKC, whitespace collapsed, 1-64 code points; control, zero-width, bidi-override, private-use, unassigned characters rejected. Address: 1-128 printable ASCII, no whitespace. Chain checksum validation is out of scope (chain adapters).
- Duplicate key = network + canonical address (EVM `0x` and bech32 lowercased; base58 case-sensitive). Exact duplicates throw `DUPLICATE`.
- `analyzeCandidate` returns findings sorted by severity: `exact-address` (block), `lookalike-address` (high: same first/last 4 body chars, or equal length with Hamming <= 3), `confusable-label`, `mixed-script-label` (medium), `duplicate-label` (low). `findDuplicateGroups` scans a whole book via hash buckets.
- `searchContacts`: AND over whitespace terms against label/note/address/tags (case-insensitive substring, no regex), AND tag filter, network filter, sort label|recent|created, deterministic tiebreak.
Acceptance: contacts.test.ts, confusables.test.ts (e.g. `Alice` ~ `A1ice` ~ Cyrillic `Аlice`; `0xabcd...1234` vs `0xabcd...1299` flagged).

## V2 Multi-profile
- Each profile: random 128-bit id, own salt, own PBKDF2-derived non-extractable AES-GCM key, own storage key. Max 16.
- Plaintext index holds only `{id, publicLabel}` (<= 40 chars, user-visible hint).
- `unlock` failure for wrong password, unknown id, malformed id or tampered ciphertext is the same `UNLOCK_FAILED` with the same message. Missing profile runs a dummy KDF.
- Moving ciphertext between profile slots fails (profile id in AAD, checked against slot).
- `changePassword(current, next)` re-proves current password, new salt. `lock()` drops key and book; further calls throw `LOCKED`.
- Writes are serialised; a failed storage write leaves in-memory state unchanged.
Acceptance: vault.test.ts "profiles".

## V3 Backup / import
- Blob = same envelope with purpose `backup`, fresh salt+nonce, backup password (min 10 chars, may differ from profile password). Payload `{schema:2, exportedAt, contacts}`. Text form `GPVB1.<base64url>`.
- Import order: size cap (16 MiB) -> header structure (CORRUPT / UNSUPPORTED_VERSION) -> KDF policy bounds -> AES-GCM auth (DECRYPT_FAILED) -> JSON -> migration -> strict validation -> merge -> persist. Nothing is applied before everything passes.
- Migration: ordered steps keyed by schema number; v1 (`entries[{id,name,address,chain,tag,ts}]`) -> v2 implemented; newer schema fails closed.
- Merge rules: (1) same id+address, identical -> unchanged; differing fields -> `onConflict` newer (default; ties keep local) | local | incoming, tags unioned. (2) same id but different address is never applied unless `onConflict: 'incoming'`. (3) different id, same address -> local kept, tags unioned. (4) new -> added with look-alike warnings. Overflow -> `LIMIT`, nothing applied. Replace mode swaps the book and reports removed ids.
Acceptance: schema.test.ts, vault.test.ts "backup and import".

## Crypto acceptance
- Independent decryption of a produced blob with `node:crypto` (PBKDF2 + AES-256-GCM, AAD = first 42 bytes) succeeds.
- Flipping any byte at offsets >= 10 yields the identical `DECRYPT_FAILED` message; iteration count is AAD-bound; iterations outside [minIterations, 10M] are rejected before any KDF work.
