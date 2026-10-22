# ADR-0020: Passphrase-protected invoice links (`A256GCM-PW`)

Status: Proposed. Date: 2026-10-22. Package: `packages/invoice-schema` (`src/passphrase.ts`, `src/envelope.ts`).
Extends ADR-0002 (signing) and ADR-0005 (fragment encryption). **Not audited.**

## 1. Context

In `A256GCM` links (ADR-0005) the AES key is inside the fragment, so the link is a bearer secret: anyone who sees it
(chat backups, screenshots, QR photos, shoulder surfing) can read the invoice. Users asked for a passphrase that makes a
leaked link useless on its own.

## 2. Decision

1. **Same prefix, new `alg`.** The fragment stays `#gpi=v1.<base64url(canonical JSON)>`; the envelope's `alg` is
   `"A256GCM-PW"`. One strict outer parser (size cap, canonical base64url, fatal UTF-8, strict canonical JSON) serves
   every mode. Parsers built before this ADR reject the new `alg` with `UnsupportedError` (fail closed). A distinct
   prefix was rejected: it would add a second outer grammar for no security gain, because the mode is authenticated
   through the AAD anyway.
2. **Envelope**: `{alg, chainId, signer, kdf:{N,r,p,s}, enc:{n,c}}`. `s` (16-byte salt), `n` (12-byte nonce) and `c`
   (ciphertext||tag) are strict canonical base64url, not hex, to keep links and QR codes small (sample invoice: 1347 chars
   plain, 1818 `A256GCM`, 2079 `A256GCM-PW`).
3. **Whole body encrypted.** Plaintext = canonical `{inv, sig}`: amount, meta-address, token, quote, expiry, line items,
   memo and the signature. Only `chainId` and `signer` (needed for the AAD and for a "claimed" prompt) and the KDF
   parameters are in clear. After decrypt, the inner `inv.chainId`/`inv.signer` must equal the header.
4. **KDF**: `scrypt(NFKC(passphrase) as UTF-8, salt, N, r=8, p=1, dkLen=32)` via `@noble/hashes@2.4.0` `scryptAsync`,
   the same library and version as the web keystore (`apps/web/src/lib/keystore.ts`). Default N = 2^17 (keystore value).
5. **DoS bound**: N is in the envelope but the parser accepts only N in {2^15, 2^16, 2^17}, r = 8, p = 1, checked before
   any derivation; `maxmem` is set to exactly `128*r*(N+p+1)`. A crafted link costs at most one 2^17 scrypt (~128 MiB,
   about 0.7 s on a desktop in Node), and only once the user submits a passphrase.
6. **AAD** = `"GPI1-PW\0" || chainId (u64 BE) || signer (33 bytes) || N || r || p (u32 BE each) || salt (16)`. Changing
   the header, swapping parameters inside the allow-list, or changing salt/nonce/ciphertext fails GCM. Relabelling to
   `A256GCM`/`none` fails the structural check (different key sets).
7. **Signature unchanged**: still ADR-0002 over the full plaintext invoice, verified after decrypt. A passphrase holder
   who alters and re-encrypts the invoice gets `invalid-signature`.
8. **API**: `encodeFragment(signed, {passphrase, scryptN?})`; `parseFragment(hash, {passphrase})` (throws
   `PassphraseRequiredError` without one); `openFragment(hash, opts)` returns
   `{status:'ok', parsed} | {status:'needsPassphrase', header}` without KDF work so the UI can prompt.
   `ParsedInvoice.passphraseProtected` reports the mode.
9. **Errors**: wrong passphrase and any pre-authentication tampering give one `WrongPassphraseError` with one fixed
   message. Policy failures (`PassphrasePolicyError`: under 10 code points after NFKC, over 1024 UTF-8 bytes, lone
   surrogates, non-string) are checked before KDF and depend only on the typed passphrase, so they reveal nothing
   about the link. A passphrase supplied for a non-PW link is refused (`PassphraseUnexpectedError`) so a substituted
   plain link cannot look "unlocked".
10. **Zeroization**: passphrase bytes, derived key and plaintext buffers are `fill(0)`ed in `finally`. Best effort
    only: JS strings, Web Crypto internals and GC copies cannot be cleared.

## 3. Consequences and limits

- Security reduces to passphrase entropy against an **offline** attacker who has the link: each guess costs one
  scrypt at the chosen N. A 10-character human phrase is weak; UIs should suggest a generated passphrase (for example
  5+ random words) and send it on a different channel from the link or QR code.
- Not hidden: chainId, signer key (links a seller's invoices to each other), KDF cost, approximate invoice size.
- Not provided: seller authentication (still requires a pinned signer), forward secrecy, rate limiting.
- Phones: 2^17 may take several seconds in pure JS; `scryptAsync` yields to the event loop. Sellers may pick 2^15/2^16.
- `apps/web` has no prompt UI or error text for the new codes yet; until it does, a PW link shows the generic
  "invoice was rejected" path (fail closed).

## 4. Alternatives rejected

- Argon2id: stronger memory hardness, but would add a dependency or WASM; scrypt is already used and reviewed in-repo.
- Encrypting only `lineItems`/`memo` as in ADR-0005: leaves amount and pay-to address readable from a leaked link,
  which is what users want to hide.
- PBKDF2 via Web Crypto: no memory hardness.
