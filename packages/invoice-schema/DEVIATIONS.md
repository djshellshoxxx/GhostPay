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
8. **Text hygiene (S3-12) is enforced at parse time** with `ForbiddenCharacterError` (`FORBIDDEN_CHARACTER`, subclass of `SchemaError`). U+180E, U+2028 and U+2029 are rejected in
   addition to the listed set (the web display sanitiser already treated them as invisible). `memo` may contain `\n`; no other field may. This is a behaviour change: memos with a line feed
   used to be rejected, and invoices containing the listed characters that older builds accepted are now rejected.
