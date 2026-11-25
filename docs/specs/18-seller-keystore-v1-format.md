# 18b — Legacy seller keystore v1 (descriptive reference for independent recovery)

**Status:** Describes an existing format; it changes nothing. The writer and GhostPay's reader are
`packages/ux-vault/src/keystore-portable.ts` (the same codec in the browser and the CLI). The GhostPay-independent reader
is `scripts/recovery/stealth-export-recover.mjs`. Where this document and that codec differ, the codec is the format and
this document must be fixed. [Spec 18](18-stealth-keypair-export.md) keeps this format as is ("Legacy keystore
compatibility"). The `ghostpay-stealth-*` formats in [18a](18-stealth-keypair-export-formats.md) never reuse or
reinterpret it.

**What the file is:** the seller keystore that Seller keys downloads as `ghostpay-keystore.json` (*Back up
(encrypted)*, **Download encrypted keystore**). It holds the seller's three secrets: the scheme-1 spending and viewing
keys and the invoice-signing key.

## 1. File

- UTF-8 JSON text, at most 8192 bytes. Writers use `JSON.stringify(file, null, 2)`: two-space indentation, keys in the
  order of section 2, no trailing newline. Every valid file is printable ASCII.
- Strict JSON: a repeated key is rejected, and an unknown or missing key at any level is rejected.
- A byte-order mark is not part of the format. GhostPay's app reads a selected file with `Blob.text()`, which drops one
  leading UTF-8 byte-order mark, so a keystore that an editor re-saved with one still imports. The reference script
  drops exactly one leading mark from a keystore file too. Its reading functions take the text without it.

## 2. Header

| Key | Value |
|---|---|
| `v` | The integer `1`. A file with any other integer `v` is a different keystore version: it is reported as unsupported and never reinterpreted. |
| `kdf` | `"scrypt"` |
| `kdfParams` | `{ "N", "r", "p", "salt" }`. `N` is a power of two from 2^14 to 2^18; `r` is 1 to 8; `p` is 1 or 2. Writers use N = 2^17, r = 8, p = 1. `salt` is 16 to 64 bytes (writers use 16). |
| `cipher` | `"AES-256-GCM"` |
| `iv` | 12 bytes |
| `meta` | `{ "metaAddress", "signer" }`, the seller's public identity. `metaAddress` is `st:eth:0x` followed by the 33-byte compressed spending public key and the 33-byte compressed viewing public key: two distinct valid secp256k1 points. `signer` is the 33-byte compressed invoice-signing public key. |
| `ciphertext` | AES-256-GCM output: the encrypted body followed by its 16-byte tag. GhostPay's codec accepts 17 to 1024 bytes here and checks the body after decryption. Every file GhostPay writes holds exactly 258 bytes (242-byte body + tag), and the reference reader requires that length. |

Every hex value (`salt`, `iv`, `ciphertext`, both `meta` values) is lowercase, without a `0x` prefix. The meta-address
must already be in this canonical form, so an upper-case copy is rejected.

The header is readable without the passphrase. Anyone who holds the file can read the seller's meta-address and
invoice signer. It is bound into the encryption (section 4), so it is authenticated only when the file decrypts.

## 3. Body

The plaintext is exactly:

```text
{"spendingKey":"<64 hex>","viewingKey":"<64 hex>","signingKey":"<64 hex>"}
```

Each value is a secp256k1 private key k with 1 ≤ k < n, as 64 lowercase hex digits without `0x`. GhostPay has written
exactly this text since the keystore's first version (`1f7ab710`, 2026-10-21).

GhostPay's codec parses the body as strict JSON with exactly these three keys, in any order. The reference reader
accepts only the written form, so the secrets never become JavaScript strings, which cannot be wiped. A body in another
key order is the one input the two readers treat differently. GhostPay has never written one.

## 4. Key derivation and encryption

1. key = scrypt(UTF-8(NFKC(passphrase)), salt, N, r, p, dkLen = 32).
2. AES-256-GCM with the 12-byte `iv`, a 128-bit tag, and additional authenticated data:

   ```text
   UTF-8("GhostPay.keystore.v1|" + metaAddress + "|" + signer + "|" + N + "|" + r + "|" + p)
   ```

   `N`, `r` and `p` are written as decimal integers.

The salt and IV are not in the additional data. Changing either one changes the derived key or the nonce, so tag
verification fails. A wrong passphrase and a modified file produce the same error by design.

## 5. Checks after decryption

A reader accepts the keys only when all of these hold:

- each key is in range (section 3);
- the spending and viewing public keys form exactly `meta.metaAddress`, so the two keys differ (section 2 already
  requires two distinct points there; GhostPay's codec also checks it directly);
- the invoice-signing public key equals `meta.signer`;
- the invoice-signing key differs from both the spending key and the viewing key.

Otherwise it refuses the file and discards the decrypted bytes.

## 6. What the file does and does not contain

- It contains no list of payments, announcements or chains. To recover one payment's one-time key you need that
  payment's announcement (its ephemeral public key and one-time address), from a scan or a block explorer. The scheme-1
  derivation is ADR-0001; 18a section 5 describes it for the master backup, and it is the same here.
- Unlike the Spec 18 master backup, it contains the invoice-signing key. The reference reader checks that key and wipes
  it. It never returns or prints it. Restoring invoice signing means importing the file into GhostPay.

## 7. Reference reader error codes

| Code | Meaning |
|---|---|
| `tooLarge` | The file is larger than 8192 bytes. |
| `invalidFile` | Not a valid v1 keystore: bad JSON, characters, keys or values; KDF bounds; ciphertext length; or a decrypted body that is not the section 3 text or holds an out-of-range key. |
| `unsupportedVersion` | An integer `v` other than 1. |
| `wrongPassphraseOrModified` | Tag verification failed: a wrong passphrase, or a changed header, salt, IV or ciphertext. |
| `sellerKeysDoNotMatch` | The file decrypted, but its keys do not match the meta-address and signer (section 5). |
| `wrongMetaAddress` | `--expected-meta-address` names a different seller. It is checked from the header, before the passphrase is read. |

GhostPay's codec refuses the same inputs with its own messages, except for the body case in section 3.

## 8. Vectors

`test-vectors/seller-keystore-v1.json` holds TEST-ONLY vectors, written by `test-vectors/generate-seller-keystore.mjs`
with `node:crypto` and noble only. It contains two valid files and 26 refusals, each with its reference code. The
consumer is `scripts/recovery/seller-keystore-recover.test.mjs`. It checks that GhostPay's codec and the reference reader
agree on every vector, and that files written by GhostPay's codec open in the reference reader.
`scripts/recovery/seller-keystore-recover.fuzz.test.mjs` mutates these files (seeded with `FUZZ_SEED`, deeper with
`FUZZ_SCALE`). It checks that the reader never accepts a header the codec refuses, beyond the ciphertext length in
section 2.
