# @ghostpay/pool-sdk

## Seed backup format and compatibility (SEC-16 / PS-10)

New `exportSeedEncrypted` backups use **version 2**. They contain only `v`, `logN`, `salt`, `iv`, and `ct`.
The salt is 16 random bytes and the AES-GCM IV is 12 random bytes. `createPoolSeed` generates 32-byte seeds;
the backup API preserves the note SDK's supported variable-length seeds within an explicit 16..512-byte bound.
Binary fields use canonical padded base64. `ct` is the encrypted seed followed by the 16-byte GCM tag.

Version 2 derives a 32-byte key with scrypt over the UTF-8 encoding of the NFKC-normalized passphrase,
`N = 2 ** logN`, `r = 8`, and `p = 1`. New writes default to `logN = 17`; the optional test override is
restricted to integers 14 through 18. Use the default for real backups. New exports apply the existing
portable-keystore passphrase checker, including its 14-character minimum and strength assessment.
No new passphrase is accepted merely because it has eight characters.

AES-256-GCM authenticates the following UTF-8 JSON array, with no extra whitespace:

```text
["ghostpay/pool-seed/v2",logN,"<salt base64>","<iv base64>"]
```

This binds the seed-specific version/domain and KDF/header parameters. Changing a version, cost, salt,
or nonce cannot turn an existing backup into a different valid envelope. The key is imported into WebCrypto
as non-extractable. Owned password/key byte buffers and temporary seed copies are wiped on success and
failure; immutable JavaScript strings and engine-internal copies still cannot be reliably erased.

Imports validate the small envelope and canonical field lengths before any KDF work, accept no unknown
fields, and cap scrypt at `N = 2 ** 18` with an explicit 512 MiB allocation ceiling. The input is bounded
to 1,024 string code units and the passphrase to 1,024 code units before and after normalization.
Malformed data, unsupported costs, bad authentication, and non-seed plaintext return the same coarse
`STORE_CORRUPT` error without returning partial state or input text.

Existing **version 1** backups remain readable for integer `logN` values 10 through 18. Their original
password bytes are used without normalization, their original `ghostpay/pool-notes/v1` AAD is preserved,
and old short passwords are accepted for recovery. Export strength rules apply only to new writes.
Version 1 files requesting costs 19 or 20, or seeds above 512 bytes, are refused before KDF allocation; those
unusually expensive/large legacy files require a separate controlled offline recovery environment.
Legacy 16-, 31-, 33-, 64- and 512-byte seeds remain readable. Old readers do not understand version 2.
The note-store format and pool payment/withdrawal protocol are unchanged.

The compatibility tests independently generate legacy data and decrypt new data with `node:crypto`.

Client SDK for the GhostPay **testnet-only** shielded pool (spec: `docs/remote/privacy-specs/shielded-pool.md`).
Private, ESM, `UNLICENSED`. Not audited. Nothing here has touched a public chain.

Chains: local anvil `31337`, Ethereum Sepolia `11155111`, Base Sepolia `84532`. Every exported entry point that takes a
chain id refuses anything else (`WRONG_CHAIN`).

## What it does

| Module | Purpose |
|---|---|
| `notes` | Deterministic note secrets from a seed (HKDF-SHA256, see below); `precommitment`, `commitment`, `nullifierHash` over Poseidon bn254 |
| `poseidon` | `poseidon-lite` wrappers with a known-answer check against circomlib vectors on first use (`VECTOR_MISMATCH`) |
| `tree` | `PoolTree`: LeanIMT mirror; proofs are returned as one slot per level (0 = no sibling) as the circuit expects |
| `sync` | `syncPool` event-sourced mirror (deposits, withdrawals incl. zero-value change leaves, ragequits), chunked `getLogs`, reorg rollback, `assertRootMatches` |
| `recover` | `recoverNotes`: rebuild all notes (and change-note chains) from seed + chain after wiping local state |
| `inputs` | `Withdraw(32)` witness input and expected public signals (order per `packages/pool-circuits/INTERFACE.md`), ragequit inputs |
| `withdrawal` | `Withdrawal` struct, `encodeWithdrawal`, `contextOf` (`keccak256(abi.encode(w, SCOPE)) % P`) |
| `flows` | `planDeposit`, `prepareWithdrawal` (SP-EXIT / SP-PAY with all client guards), `prepareRagequit` (SP-RQ), calldata encoders |
| `announce` | `buildSpPayAnnounce`: stealth recipient + `abi.encode(key, metadata)` for the pool's ERC-5564 announcement |
| `asp` | association-set tree and `verifyAspSet` (`ASP_SET_MISMATCH`) |
| `store` | encrypted note store (AES-256-GCM, key HKDF from the seed; no secrets are stored), passphrase seed backup (scrypt), random pool seed in a `SecretBox` |
| `relayerClient` | `PoolRelayerClient` (`info`, `quote`, `relay`); only public data can be sent |
| `options` | `SP_OPTION_INFO`, `LIMIT_COPY` (N1-N9), `TEST_POOL_LINE`, banned-wording regex |
| `wire` | strict JSON wire parsers shared with `@ghostpay/pool-relayer`, snarkjs proof to calldata (G2 swap) |

## Note derivation (SP-SDK-1)

```
poolSeed  = HKDF-SHA256(ikm=seed, salt="ghostpay/shielded-pool/v1", info=u32be(chainId)||pool(20), 32)
nullifier = OS2IP(HKDF-Expand(poolSeed, "n"||u32be(index), 64)) mod P      (secret: tag "s")
```

A zero result retries with a one-byte counter appended to `info` (probability about 2^-254; see DEVIATIONS). The seed is only
ever handed to `deriveNoteSecrets` through a `withSeed(f)` callback, for example `(f) => secretBox.use(f)` with
`@ghostpay/secret-box`. SP-EXIT callers pass a scope of the seller's spending secret; SP-PAY payers without GhostPay keys use
`createPoolSeed()`.

## Honest limits (copy is in `options.ts`)

The crowd is only this test pool; deposits are public; amount/timing can be matched; the relayer and RPC see metadata; an
association-set publisher is a trusted party; ragequit and address reuse re-link; the dev ceremony is insecure. No string in
this package claims anonymity, untraceability or unlinkability (test `SP-UI-3`).

## Scripts

`npm run build -w @ghostpay/pool-sdk`, `npm test -w @ghostpay/pool-sdk` (vitest, coverage thresholds 95/90/95/95),
`npm run lint -w @ghostpay/pool-sdk`.

Integration: see `docs/remote/privacy-specs/wiring/pool-sdk.md`. Self review: `docs/remote/privacy-specs/audit-pool-sdk.md`.
