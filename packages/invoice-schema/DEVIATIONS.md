# Deviations and design decisions (invoice-schema)

1. **Signature scope.** DEVELOPER_SPECIFICATION says the signature covers "canonical public fields plus ciphertext hash".
   This package signs `keccak256("GhostPay.Invoice.v1\0" || canonical(full plaintext invoice))` (task/ADR-0002 text) and
   binds the ciphertext through the GCM tag plus `AAD = "GPI1" || chainId || signer`. Because the AES key travels in the
   same fragment, anyone can re-encrypt, but nobody can alter the plaintext without invalidating the signature. A
   ciphertext-hash binding would make a signature specific to one envelope; if the owner wants that, it needs an ADR.
2. **Invalid signatures do not throw** in `parseFragment`; they return `signatureValid: false` / `trust: 'invalid-signature'`
   (task text). Callers must treat that as a hard stop. Every structural problem does throw.
3. **Field choices the spec left open** (no ADR yet): `amountPolicy = {mode:'fiat_quote'} | {mode:'fixed_token', tokenAmount}`,
   `feePolicy = 'payer_pays' | 'seller_pays'`, `tax = {rateBps, minorUnits}`, line item = `{description, quantity, unitMinorUnits}`,
   times are unix seconds, token addresses and all hex are lowercase (no EIP-55 in the invoice, so one encoding per value).
   Totals are not cross-checked (sum of items + tax vs `fiat.minorUnits`); the UI must do that.
4. **Envelope field names** (`alg`, `inv`, `pub`, `enc.{k,n,c}`, `sig`) and hex-in-JSON ciphertext are this package's choice.
5. **Meta-address** is validated locally (canonical lowercase, two distinct on-curve keys) without depending on core-crypto.
6. **@noble/ciphers** is a dev dependency only: it is used by tests as an independent AES-GCM implementation.
7. TypeScript 5.9.3 (typescript-eslint does not yet support 7.x).
8. **Passphrase links (ADR-0020)** keep the `#gpi=v1.` prefix and select the mode by `alg: "A256GCM-PW"`; older parsers
   fail closed with `UnsupportedError`. Unlike `A256GCM`, the whole invoice and the signature are inside the ciphertext and
   `s`/`n`/`c` are base64url (not hex) to keep links and QR codes small. Header/plaintext mismatch of chainId or signer is
   a `SchemaError` (reachable only by someone who knows the passphrase).
9. **Passphrase minimum** is the keystore's value (10) but counted in Unicode code points after NFKC, where the keystore
   counts UTF-16 units of the raw string; so NFKC-equivalent inputs always get the same verdict. Upper cap 1024 UTF-8 bytes.
10. **Errors after authentication are specific.** Only the GCM failure is collapsed into `WrongPassphraseError`; UTF-8,
    JSON, canonical and schema errors after a successful decrypt keep their own types because reaching them already
    requires the passphrase, so they are not an oracle for guessing it.
11. **`ParsedInvoice` gained `passphraseProtected: boolean`** (additive). New error codes: `PASSPHRASE_REQUIRED`,
    `PASSPHRASE_UNEXPECTED`, `PASSPHRASE_POLICY`, `PASSPHRASE`. The web application now provides dedicated messages and create/open passphrase prompts; browser regressions cover wrong and correct passphrases.
12. **Runtime dependency unchanged**: scrypt is `@noble/hashes@2.4.0` `scryptAsync`, the version `apps/web` keystore uses.

13. **Text hygiene (S3-12) is enforced at parse time** with `ForbiddenCharacterError` (`FORBIDDEN_CHARACTER`, subclass of `SchemaError`). U+180E, U+2028 and U+2029 are rejected in
   addition to the listed set (the web display sanitiser already treated them as invisible). `memo` may contain `\n`; no other field may. This is a behaviour change: memos with a line feed
   used to be rejected, and invoices containing the listed characters that older builds accepted are now rejected.
14. **Invoice v2 (`bufferPolicy`, spec 13, ADR-0024).** `Invoice.v` is now `1 | 2`; v2 adds the required public field
    `bufferPolicy {accepted, maxWei, minWei, refund: 'none'}` and v1 must not carry it. `createInvoice` emits v2 only when a
    policy is given, so v1 links, signatures and vectors are unchanged. The signature domain string stays
    `GhostPay.Invoice.v1\0` (it names the signing scheme, and `v` is inside the signed canonical invoice); the envelope stays
    `#gpi=v1.`. Older parsers reject v2 at `v` (fail closed). The policy is enforced by the payer app only, not on-chain.
