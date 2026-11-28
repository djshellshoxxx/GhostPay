# 18 — Requirement 3q: Browser-only stealth keypair export and independent recovery

**Status:** The single-payment browser export is under review against the [versioned formats](18-stealth-keypair-export-formats.md) and [independent recovery procedure](../user/recover-stealth-payment-keys.md). PR #539 tracks the remaining Spec 18 integration and release qualification.
**Priority:** Core seller portability, before beta exit.
**Scope:** ERC-5564 scheme-1 EVM one-time addresses. Bitcoin BIP-352, contract accounts, ERC-4337 and EIP-7702 have different custody/key models and are excluded until separately specified.
**Existing integration:** `packages/core-crypto/src/stealth.ts` (`checkAnnouncement`, `deriveStealthSecret`); seller scan/payment details; encrypted local vault and backup. No remote key-generation, account or recovery backend.
**Canonical source:** This document is the single canonical specification of requirement 3q. [Future privacy architecture 5k](../future/privacy-architecture/5k.md) cross-references it and adds no second requirement, format, priority or gate; where any text differs, this document governs. Count the feature once, as spec 18.

## Purpose
The seller may export and independently use the one-time spending key for any discovered, cryptographically matched EVM stealth address. Seller keys, exports and encryption remain entirely inside the user's browser. The buyer derives only the public destination, ephemeral public key and view tag — **never** the seller's private key.

## Required user flows
1. **Export a single payment keypair:** Seller opens Scan > Payment details > Export keypair. Require vault unlock/re-authentication and explicit confirmation. Verify scheme, chain and on-chain announcement; independently derive the public address from the private key and compare against the announced address. Offer encrypted JSON by default, public-only JSON, and deliberately gated raw hex private-key export for compatible third-party EVM wallets.
2. **Encrypted bulk export:** Export all *discovered and validated* distinct EVM one-time keys as an encrypted, bounded archive. Include count, chain and selected scope. Never automatically download plaintext secrets or offer bulk plaintext exports.
3. **Master stealth-key backup:** Separate action to export encrypted master **spending and viewing** secrets with derivation scheme/version and portability instructions. Explain that master keys can recover discoverable past and future scheme-1 payments. Never include master keys in payment-level archives.
4. **Independent restoration:** Permit offline/locally performed decryption and validation via documented, stable file format and reference recovery instructions/test vectors. Support loading an encrypted export through a freshly opened browser application without requiring the original installation, site, host or account.
5. **Unsupported cases:** For malformed/unmatched announcements, wrong scheme/chain, locked vault, wrong passphrase and non-EOA policy accounts, refuse private-key export. A derived key/address match does **not** imply payment confirmation or finality: label them separately.

## Versioned data model
Define strict schema for `ghostpay-stealth-public-v1`, `ghostpay-stealth-keypair-v1` and `ghostpay-stealth-master-v1`.
Public fields: `format`, `version`, `schemeId`, `chainId`, `stealthAddress` (EIP-55), `publicKey` (compressed/uncompressed field explicitly indicated), `ephemeralPublicKey`, `viewTag`, `announcement` locator (transaction hash/log index), `exportedAt`. Unavailable transaction metadata must be omitted, not invented.
Secret payload: exact 32-byte derived EVM private scalar for a single keypair; for master backup, spending and viewing secret scalars and required derivation metadata. Validate scalar bounds, public-key correspondence and scheme before export/import.
Encrypted envelope: versioned KDF algorithm/parameters/salt, authenticated encryption algorithm/nonce, ciphertext and auth tag; bind public header as AAD, use fresh cryptographically secure randomness. Select parameter bounds using the existing vault crypto strategy, test in desktop and mobile browsers, and document future migration. Never put secret bytes in filename, URL, storage logs or unencrypted export metadata.
Raw export: lowercase or standardized `0x` + 64-hex string, explicitly identified as a private key (not a seed phrase), and only after a second confirmation; show/import compatibility limitations without automatic wallet connections.

## Security and privacy invariants
- No automatic plaintext key export at scan time or when a buyer generates an address.
- No API, RPC, relayer, telemetry, analytics, logging, clipboard, crash report or URL-fragment transmission of secret material.
- Browser-based and compatible with static HTTPS and Tor onion hosting; no mandatory GhostPay-operated service.
- Never store raw export material unencrypted in IndexedDB/localStorage; redact UI and clipboard by default; best-effort in-memory wiping. Browser downloads may leave copies on disk and be indexed/backed up by the operating system; warn before plaintext export.
- Never export the buyer's ephemeral secret (it is deliberately discarded), or assume the buyer owns the seller's derived private key.
- Avoid claiming a generic external wallet can directly recognize stealth payments: the per-payment EVM private key is importable where an EOA import is supported; the master pair needs scheme-compatible recovery tooling.
- Private-key export cannot authorize contract-account funds unless their explicit authority model independently permits it.
- Use limits on archive size/count and reject duplicate/conflicting records, malformed formats and unsupported versions without partial import.
- Allow exporting a key even after its associated funds were spent, with a clear label: the private key remains capable of controlling any future deposits to that address.

## Next-phase portability scope (owner-approved)
The owner-approved next-phase portability scope (consolidation gameplan; recorded here 2026-11-18) has eleven requirements. Eight are already normative above and are not restated: scheme-1 EVM EOAs only (Scope; flow 5); encrypted export by default plus public-only export (flow 1); encrypted-only, bounded bulk export (flow 2; invariants); a separate master backup (flow 3); spent-key eligibility (invariants); independent recovery without the original installation, site, host, account or GhostPay service (flow 4; invariants); key ownership labelled separately from payment confirmation/finality (flow 5); reuse of existing derivation and vault primitives (Existing integration; Implementation boundaries). Three were implied or only partly stated and are explicit here:
- **Raw export is single-key only**, after re-authentication and a second confirmation (flow 1; Raw export). There is no raw or plaintext bulk archive and no raw master-key export.
- **Out-of-scope key models are refused.** A private-key export request for a Bitcoin BIP-352 output, an ERC-4337/AA or EIP-7702 account, or a policy/contract account fails closed; out-of-scope cases are never handled by attempting an export.
- **Legacy keystore compatibility.** The existing encrypted seller keystore (`v: 1`, scrypt + AES-256-GCM over the spending, viewing and invoice-signing keys; shared browser/CLI codec `packages/ux-vault/src/keystore-portable.ts`) remains exportable and importable unchanged. The `ghostpay-stealth-*` formats are separately identified and never reuse or reinterpret that schema; the master backup is distinct from the legacy three-key keystore.

## Implementation boundaries
Create a narrowly scoped typed export/import module reusing existing approved key wrappers, KDF and AEAD primitives; keep crypto boundary separate from UI. Introduce seller-only export controls on payment details, separate bulk-export and master-backup entry points, stable documentation and reference vectors. Do not weaken `deriveStealthSecret` verification, change GhostPayRouter, modify deployment defaults, enable new networks, or add server processing.

## Acceptance tests (required)
- Seller keys exposes **Recover from a file** in a fresh session. A single local file picker recognizes an existing three-key seller keystore, a master stealth backup, a payment-key export, or a public payment record by its validated envelope. Show its scope before a passphrase is requested. Public records expose no passphrase or backup-verification action.
- A file selection alone never derives, installs, replaces or downloads keys. Loading a three-key keystore requires an explicit action in an empty session and recovers the invoice-signing identity. Master backups retain their distinct signing-key behavior and replacement confirmations. File changes, locks and stale reads must retire prior inputs. Reject unsupported, mixed-format, duplicate-field and oversized envelopes.
- Known EIP-5564 vector: derived private key produces exactly the advertised public key and checksummed address.
- Single encrypted keypair export/import across new browser sessions; wrong passphrase, tampering, wrong chain/scheme and malformed files fail closed.
- Raw 32-byte EVM key interoperates with at least one independently implemented EVM wallet tool under a local test chain without real funds.
- Public-only export contains no secret bytes; encrypted single/bulk/master files never expose them in plaintext.
- Bulk archive of multiple payments: deterministic ordering, duplicate handling, versioned schema, safe bounds and atomic import.
- Master backup recovers addresses for known historic announcements, including an address omitted from the original payment-level archive.
- Browser tests prove no secret-bearing fetch, analytics, URL, log, storage or clipboard operations; downloads require deliberate gestures and locked vault refuses.
- Playwright Chromium plus Firefox/WebKit where supported; mobile-browser file download/import acceptance recorded separately; offline documented recovery proof.
- Preserve exact-head CI, provenance and independent source review. No release-complete claim before verification.

## Definition of done
Implementation, tests, documentation, user guide and independently reproducible recovery are integrated and qualified on an exact SHA. External device/browser/wallet acceptance remains explicitly pending until real evidence is recorded. This approved requirement is NOT an approval to merge, deploy or publish.
