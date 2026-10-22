# @ghostpay/ux-vault

Local-first encrypted address book, multi-profile vault and encrypted backup/import. Pure logic: no DOM, no network, no timers. WebCrypto only (PBKDF2-HMAC-SHA256 600k iterations + AES-256-GCM).

```ts
const vault = createVault({ storage, now: () => Date.now() });   // storage: { get(key), put(key, bytes) }
const session = await vault.createProfile({ password, publicLabel: 'Personal' });
await session.mutate((book, env) => { const r = addContact(book, { label, address, network: 'eth' }, env); return { book: r.book, result: r.contact }; });
const blob = await session.exportBackup(backupPassword);            // Uint8Array, backupToText(blob) for copy/paste
const report = await session.importBackup(blob, backupPassword, { mode: 'merge' });
```

- Storage receives only ciphertext plus a plaintext profile index (`id` + `publicLabel`).
- Authentication failures (wrong password, tamper) are indistinguishable: `UNLOCK_FAILED` / `DECRYPT_FAILED`, one constant message.
- Envelope: `GPVT | ver | purpose | iterations | profileId | salt | nonce | ciphertext+tag`; everything before the nonce is AAD.
- `kdf.minIterations` below the default is for tests only.

Specs: `docs/remote/usability/specs/vault.md`; wiring: `docs/remote/usability/wiring/ux-vault.md`; audit: `docs/remote/usability/audit-ux-vault.md`.
