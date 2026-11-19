# 18a — Stealth key export file formats (normative reference for spec 18 / requirement 3q)

**Status:** Normative format reference for [spec 18](18-stealth-keypair-export.md). Implementation status is recorded in
the feature ledger, not here. Where this document and spec 18 differ, spec 18 governs and this document must be fixed.

**Scope:** ERC-5564 scheme-1 EVM one-time addresses only (secp256k1, ADR-0001 hashing). GhostPay checks for empty
account code before exporting payment private keys. Recovery for Bitcoin BIP-352, ERC-4337,
EIP-7702-delegated and policy/contract accounts remains outside this feature's scope; these formats do not specify
their authorization or recovery procedures.

These formats are deliberately independent of the legacy seller keystore (`v: 1`, `GhostPay.keystore.v1` AAD domain,
`packages/ux-vault/src/keystore-portable.ts`). They never reuse or reinterpret that schema, and the invoice-signing key
never appears in any of them.

## 1. Common rules (all formats)

1. **Encoding.** UTF-8 JSON text containing only printable ASCII (U+0020–U+007E) plus `\n`, `\r`, `\t` whitespace.
   Any other character anywhere in the file is rejected. Parsers use strict JSON (duplicate keys rejected) and exact
   key sets: an unknown or missing key at any level is rejected. Exporters write pretty JSON (2-space indent, keys in
   the order shown in this document, no trailing newline), so the reference vectors are byte-reproducible.
2. **Hex.** Every key, point, hash, salt, IV and ciphertext is `0x` + lowercase hex with an even number of digits.
   Addresses are EIP-55 checksummed (`0x` + 40 hex) and must equal their own checksum form.
3. **Integers.** `version`, `schemeId`, `chainId`, `count`, `logIndex`, `N`, `r`, `p`, `dkLen`, `tagLength` are JSON
   integers (safe integers, non-negative). `blockNumber` is a decimal string without leading zeros (`"0"` allowed)
   and at most 2^64 - 1, because block numbers are 64-bit.
4. **Time.** `exportedAt` is RFC 3339 UTC with whole seconds: `YYYY-MM-DDTHH:MM:SSZ`.
5. **Canonical form.** `canonical(x)` is the JSON serialization with object keys sorted by code point, no insignificant
   whitespace, integers in decimal, strings as `JSON.stringify` writes them (identical to Python
   `json.dumps(x, sort_keys=True, separators=(",", ":"))` for these ASCII-only values). It is implemented by
   `canonicalize` in `@ghostpay/invoice-schema`.
6. **Size limits (bytes of the file text).** public record 4,096; keypair file 1,048,576; master file 8,192. Larger
   input is rejected before JSON parsing.
7. **Filenames.** Fixed and secret-free: `ghostpay-stealth-public.json`, `ghostpay-stealth-keypair.json` (one payment),
   `ghostpay-stealth-keypairs.json` (archive), `ghostpay-stealth-master.json`, `ghostpay-stealth-private-key.txt`.
   No address, key, chain or time ever appears in a filename.

## 2. `ghostpay-stealth-public-v1` — public payment record (no secrets)

```json
{
  "format": "ghostpay-stealth-public-v1",
  "version": 1,
  "schemeId": 1,
  "chainId": 11155111,
  "stealthAddress": "0x<EIP-55>",
  "publicKey": { "encoding": "secp256k1-compressed", "value": "0x02|03<64 hex>" },
  "ephemeralPublicKey": "0x02|03<64 hex>",
  "viewTag": "0x<2 hex>",
  "announcement": {
    "blockHash": "0x<64 hex>",
    "blockNumber": "<decimal>",
    "logIndex": 0,
    "transactionHash": "0x<64 hex>"
  },
  "exportedAt": "2026-11-18T00:00:00Z"
}
```

- `chainId` is a positive safe integer: the chain the scan found the announcement on (S3-15: never relabelled).
- The chain label records scan provenance. It is authenticated inside an encrypted file; standalone public records and raw-key
  files carry no authentication. Neither the private scalar nor its EVM address derivation includes a chain ID:
  the same key derives the same address on EVM networks using these address rules. An expected-chain check enforces
  import context without restricting the key's signing authority to that chain.
- `publicKey.encoding` is the literal `"secp256k1-compressed"`; `value` is the 33-byte compressed point of the one-time
  key. A parser checks it is a valid curve point **and** that `keccak256(uncompressed(value)[1:])[12:]` equals
  `stealthAddress`. So even a public-only file is internally consistent.
- `ephemeralPublicKey` is the announcement's 33-byte compressed `R` (a valid curve point).
- `viewTag` is the announced metadata byte `metadata[0]`. It is a scan filter only. A deep-scan payment (announced tag
  differs from the derived tag) is still the seller's when the derived address matches; such payments are eligible.
- `announcement.transactionHash` is present only when the provider supplied a validated hash; it is omitted, never
  invented. `blockHash` + `logIndex` is the stable locator (`ScannedAnnouncement.id`).
- A derived key/address match is **ownership**, not payment confirmation or finality. The record deliberately carries
  no receipt status.
- A public-only record is not authenticated: it carries no secret and no MAC. Apart from the `publicKey` /
  `stealthAddress` binding above, its fields are only as trustworthy as the place the file came from. Inside an
  encrypted file the same record is authenticated as part of the header.

## 3. Encryption envelope (shared by the keypair and master formats)

```json
"kdf": { "name": "scrypt", "N": 131072, "r": 8, "p": 1, "dkLen": 32, "salt": "0x<32 hex>" },
"cipher": { "name": "AES-256-GCM", "iv": "0x<24 hex>", "tagLength": 128 },
"ciphertext": "0x<hex>"
```

- **KDF.** `key = scrypt(NFKC(passphrase) as UTF-8, salt, N, r, p, dkLen=32)`. Exporters use N=2^17, r=8, p=1 (the
  keystore profile, APP_AND_RELAYER_SPEC §1) and a fresh 16-byte salt from `crypto.getRandomValues`. Importers accept
  N a power of two in [2^14, 2^18], r in [1, 8], p in [1, 2], dkLen exactly 32, salt 16–64 bytes; anything else is
  rejected **before** any KDF work (a crafted file cannot make the tab allocate gigabytes). The raw derived key is
  imported as a non-extractable WebCrypto AES-GCM key and then wiped. The owned UTF-8 passphrase buffer is wiped on
  success and on KDF or key-import failure. JavaScript strings and engine-internal copies cannot be reliably erased.
- **AEAD.** AES-256-GCM, a fresh 12-byte IV per file, 128-bit tag appended to the ciphertext (WebCrypto layout).
- **AAD (domain separation).** `AAD = UTF-8(DOMAIN + "\n" + canonical(header))`, where `header` is the whole file
  object **without** `ciphertext`, and `DOMAIN` is `GhostPay.stealth-keypair.v1` or `GhostPay.stealth-master.v1`.
  Every public field (including KDF parameters, salt, IV, chain, scope, count and every payment record) is therefore
  authenticated; changing an authenticated header value makes decryption fail. JSON whitespace and object-key order
  are canonicalized and do not change the authenticated values.
- **Plaintext.** `canonical(body)` (see each format): lowercase hex, no whitespace. Importers require the decrypted
  plaintext to be exactly that text; anything else is rejected. Because every body has a fixed canonical length, the
  ciphertext length is fixed too (body plus the 16-byte tag: keypair 17 + 69 * count + 16 bytes, master 166 + 16 bytes)
  and a file with any other ciphertext length is rejected before the KDF. After decryption the plaintext buffer is wiped.
- **Passphrase policy.** The keystore policy (`passphraseProblemMessage`: at least 14 characters and the strength
  estimator). Wrong passphrase and tampering are indistinguishable by design (one error).
- **Failure is atomic.** Any failure (bounds, parse, KDF, authentication, body shape, scalar range, key/address
  mismatch, duplicate, conflict, wrong expected chain) rejects the whole file; no record or key is returned and every
  decrypted secret is wiped.

## 4. `ghostpay-stealth-keypair-v1` — encrypted payment keys (single or bulk archive)

```json
{
  "format": "ghostpay-stealth-keypair-v1",
  "version": 1,
  "scope": "single",
  "chainId": 11155111,
  "count": 1,
  "payments": [ { "format": "ghostpay-stealth-public-v1", "...": "..." } ],
  "kdf": { "...": "..." },
  "cipher": { "...": "..." },
  "ciphertext": "0x..."
}
```

- `scope`: `"single"` (exactly one payment, the per-row export), `"selected"` (a user-chosen subset) or
  `"all-discovered"` (every discovered and validated distinct payment of the chain).
- `count` equals `payments.length`, 1 ≤ count ≤ 1,024. Every entry is a valid `ghostpay-stealth-public-v1` record whose
  `chainId` equals the file's `chainId`.
- **Ordering and uniqueness.** Entries are sorted by `stealthAddress` lowercased (ascending); a repeated
  `stealthAddress` is rejected (`duplicate`).
- **Body.** `{"privateKeys": ["0x<64 hex>", ...]}` in the same order as `payments`. Each key is a scalar k with
  1 ≤ k < n (secp256k1 order) whose compressed public key equals that entry's `publicKey.value` and whose address
  equals its `stealthAddress`.
- **Export-time deduplication.** Several scan matches can share one one-time address (F1 router replay). Exporters
  keep one entry per `stealthAddress`: identical address and ephemeral key -> one entry, keeping the locator with the
  lowest (`blockNumber`, `logIndex`), ties broken by the lower `blockHash` and then by the lower canonical record, so the
  result does not depend on input order; same address with a different ephemeral key -> refused as a conflict (it cannot
  arise from correct scheme-1 derivation).
- **Import.** An importer may require an expected chain; a different `chainId` is rejected (`wrongChain`). Master keys
  never appear in this format.

## 5. `ghostpay-stealth-master-v1` — encrypted master spending and viewing keys

```json
{
  "format": "ghostpay-stealth-master-v1",
  "version": 1,
  "schemeId": 1,
  "derivation": "eip5564-scheme1-adr0001",
  "metaAddress": "st:eth:0x<66 hex spend><66 hex view>",
  "spendingPublicKey": "0x02|03<64 hex>",
  "viewingPublicKey": "0x02|03<64 hex>",
  "exportedAt": "2026-11-18T00:00:00Z",
  "kdf": { "...": "..." },
  "cipher": { "...": "..." },
  "ciphertext": "0x..."
}
```

- `derivation` `"eip5564-scheme1-adr0001"` means: S = p_view·R (33-byte compressed), s_h = keccak256(S), view tag =
  s_h[0], one-time key p_stealth = (p_spend + int(s_h)) mod n, address = keccak256(uncompressed(P_stealth)[1:])[12:].
- `metaAddress` must equal `encodeMetaAddress(spendingPublicKey, viewingPublicKey)`; the spending and viewing public
  keys must be distinct. Independent readers enforce this before decryption as well.
- **Body.** `{"spendingKey": "0x<64 hex>", "viewingKey": "0x<64 hex>"}`. Each scalar is in range and its compressed
  public key equals the header key.
- The master pair recovers every discoverable past and future scheme-1 payment to this meta-address, including
  payments omitted from any payment-key archive. It needs scheme-compatible tooling (GhostPay or the reference
  recovery script); a generic wallet cannot use it directly. The invoice-signing key is never included.

## 6. Raw single private key text (`ghostpay-stealth-private-key.txt`)

Offered for one payment only, after re-authentication **and** a second confirmation. There is no raw bulk or raw
master export.

```text
GhostPay one-time payment private key
This is a single EVM private key, not a seed phrase or recovery phrase.
It controls only the address below, including any future deposits to it.
Anyone who has this key can spend funds at this address.

Chain ID: 11155111
Address: 0x<EIP-55>
Private key: 0x<64 lowercase hex>
```

The text is ASCII with LF line endings, exactly the lines above (one empty line after the warnings) and a final LF.

The key is importable into an EVM wallet that supports private-key (EOA) import. Importing it does not let a wallet
discover other stealth payments.

## 7. Authorization and lifecycle rules (browser)

- **Combined-key boundary.** A one-time payment private key alone controls its address. A holder of the private viewing
  key can use the payment's public announcement to compute the scheme-1 tweak and subtract it from that one-time
  private key, recovering the master spending key modulo the secp256k1 curve order. Export and import warnings must
  disclose this boundary before revealing payment private keys. Never give those keys to a watch-only party that
  holds the private viewing key. Encryption protects the file at rest; it does not remove this relationship after decryption.
- Secret exports (encrypted keypair, archive, raw key, master backup) require re-authentication that proves the
  user knows a credential for the **currently loaded** keys: the passphrase of the encrypted vault holding them, or a
  keystore backup file of the same keys with its passphrase. Having no vault is never treated as success.
- Public-only export needs no re-authentication (it contains no secret) but still needs a deliberate gesture.
- An export is bound to the session revision, the loaded keys, the chain of the scan match and the operation that
  started it. Idle lock, wipe, key replacement, chain switch, closing the panel or a newer operation cancels it; a
  result that completes after cancellation is discarded and its secrets wiped, never downloaded.
- Nothing is downloaded or revealed automatically when a payment is discovered. Secrets are never written to
  IndexedDB/localStorage/sessionStorage, the URL, the clipboard, logs or any network request.
- Backup generation, download initiation, user-confirmed retention, and successful recoverability verification are
  different states. Starting a browser download is not proof of retention. The post-export verification flow requires
  the user to select their retained file, checks it is the exact generated encrypted export, then authenticates and
  validates every recovered key. A cancelled, failed, replaced or stale operation cannot become verified.
- Verification without import disposes recovered private material before reporting success. It does not install
  master keys, replace a session, or authorize a later import. A verified payment archive covers only its listed
  addresses. A verified master file omits the invoice-signing key, so it must not mark a whole seller-session backup
  as verified or remove the safeguards protecting the only copy of that signing key.
- Before a payment-key export (encrypted keypair, archive or raw key) every stealth address in it is checked with
  `eth_getCode` at `latest` through the client the scan used (the user-selected RPC, or the private scan endpoint when
  one is configured; no fallback): non-empty code (a contract or EIP-7702 delegation) refuses the export; a failed or
  malformed check refuses it too (fail closed). One refused address refuses the whole archive. The master backup names
  no stealth address and has no such check.
- This code check defines the supported export path; it does not assess future account state or account-specific
  recovery authority. An exported key may retain authority after delegation:
  [EIP-7702 allows delegated EOAs to originate transactions](https://eips.ethereum.org/EIPS/eip-7702#transaction-origination).
  No delegated-account or contract-account recovery path is qualified by this feature.

## 8. Reference vectors and independent recovery

- Vectors: `test-vectors/stealth-export.json` (generated by `test-vectors/generate-stealth-export.mjs` from the
  public scheme-1 test keys, fixed salts/IVs and N=2^14 — **test-only** parameters).
- Reference recovery: `scripts/recovery/stealth-export-recover.mjs`, implemented with `node:crypto` (scrypt,
  AES-256-GCM) and `@noble/curves`/`@noble/hashes` only, without importing any GhostPay package, so the formats are
  provably recoverable without GhostPay.
- `--expected-chain` checks the chain identifier in payment archives, public records and raw-key files, including
  header-only inspection. This checks the recorded chain; it is not an on-chain balance or finality check. Master
  backups are chain-neutral, so combining them with that option is refused instead of silently ignoring it.
- Fresh-environment acceptance copies only the reference script and its two noble dependencies into a temporary
  directory, permits the child process to read only that directory, and opens every supported format. This verifies
  recovery without repository files, GhostPay packages, browser state or website access.
- The reference reader wipes owned file buffers and piped passphrase buffers on success and failure, including an
  interrupted input stream. This is best-effort cleanup; immutable strings and engine-internal copies remain outside
  that guarantee.

## 9. Future migration

A new version gets a new `format` identifier and a new AAD domain; readers never reinterpret an older identifier.
Raising the scrypt cost only changes header values within the import bounds; raising the bounds is a new reader
release, documented here first.
