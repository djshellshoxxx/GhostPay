# @ghostpay/invoice-schema

GhostPay v1 invoice object, canonical serialization, signing and URL-fragment envelope
(ADR-0002 signing, ADR-0005 encryption, DEVELOPER_SPECIFICATION Module C). No UI, RPC or DOM dependencies;
runtime deps are `@noble/curves` and `@noble/hashes` only, and AES-256-GCM uses Web Crypto (`crypto.subtle`).

## Usage

```ts
import { createInvoice, signInvoice, encodeFragment, parseFragment, checkExpiry,
         isTrustedSeller } from '@ghostpay/invoice-schema';

const invoice = createInvoice({ chainId, metaAddress, fiat, token, amountPolicy, quote,
                                expiresAt, lineItems, tax, feePolicy, memo, signer });
const signed = signInvoice(invoice, invoiceSigningKey);          // dedicated key, never spend/view keys
const fragment = await encodeFragment(signed, { encrypt: true }); // '#gpi=v1.<base64url(envelope)>'

const parsed = await parseFragment(location.hash, { pinnedSigners: [merchantSignerKey] });
parsed.verification;            // { signatureValid, signerPinned }
checkExpiry(parsed.invoice, Math.floor(Date.now() / 1000));
if (isTrustedSeller(parsed)) { /* only now may the UI say the seller key is pinned */ }
```

### Requiring a known seller

A valid signature proves that the embedded key signed these invoice bytes. It does not identify the seller:
someone else can sign a different invoice naming their own payment address. Obtain a seller key through a
trusted channel before pinning it. A caller that requires an already known seller can opt into rejection:

```ts
const parsed = await parseFragment(location.hash, {
  pinnedSigners: [merchantSignerKey],
  requirePinnedSigner: true,
});
// Every returned invoice has trust === 'trusted-seller'. Still check expiry and payment policy.
```

This option applies to both `parseFragment` and `openFragment`, for plaintext, encrypted and passphrase
links. It throws `InvalidSignatureError` (`INVALID_SIGNATURE`) if the signature does not verify, before
checking the pins. A valid signature from a key outside the pin set throws `UntrustedSignerError`
(`UNTRUSTED_SIGNER`). Missing or empty pins trust nobody. Pins compare case-insensitively as compressed
66-character hex keys, without a `0x` prefix. Only an absent option or explicit `false` disables the guard;
other values from untyped callers enforce it. Earlier format, schema and decryption errors retain their types.

The shared parser does not choose an expected seller for the caller. When checking one seller, pass only that
seller's pinned key. Supplying several keys means **any** of them is permitted; a caller must not pass its whole
address book when it intends to authenticate one selected seller.

Without a passphrase, `openFragment` can return `needsPassphrase` before the policy is checked. Its header
is unauthenticated; it is not a trusted invoice. Reuse the same required-pinning policy when opening the
decrypted invoice. The default parser still returns signature/trust information for review; callers must
block `invalid-signature` results. Browser callers choose whether to require a selected pinned identity; adding
this shared option never opts a user in automatically.

### Verification failures

`MissingSignatureError` (`MISSING_SIGNATURE`, path `sig`) distinguishes a recognized signed container without its
signature from an invalid signature. A malformed signature field remains `SchemaError` with path `sig`; an otherwise
well-formed signature that does not verify yields `signatureValid: false`, or `InvalidSignatureError` under the strict
pin policy. Missing signer fields, unsupported signer encodings and other malformed invoice values still fail schema
validation. Unknown positive numeric envelope or invoice versions and unknown envelope algorithms give `UnsupportedError`.
Supported body versions remain 1 and 2 inside envelope prefix `#gpi=v1.`; `alg: "none"` means no encryption, never no signature.

`VerificationUnavailableError` (`VERIFICATION_UNAVAILABLE`) means a required local Web Crypto operation is unavailable
or interrupted. It cannot be represented as a valid or invalid cryptographic signature. Plaintext invoice signature
verification uses noble and works without Web Crypto; encrypted invoices need Web Crypto to recover the signed payload.
Missing Web Crypto, failed AES key import and an aborted/unsupported AES operation give this fixed error instead of
exposing provider exception text. Wrong passphrases and failed GCM authentication retain their existing indistinguishable
decryption errors. A passphrase prompt remains unauthenticated and must not be displayed as a verified invoice.

See [the signer verification specification](../../docs/specs/INVOICE_SIGNER_VERIFICATION.md) for the authenticated field
set, compatibility rules and trust boundaries.

### Passphrase-protected links (ADR-0020)

```ts
const fragment = await encodeFragment(signed, { passphrase });   // alg "A256GCM-PW", scrypt N=2^17
const r = await openFragment(location.hash);                       // no KDF work yet
if (r.status === 'needsPassphrase') {
  // r.header = { chainId, signer, kdf } is UNAUTHENTICATED: show as "claimed" only.
  const again = await openFragment(location.hash, { passphrase: typed }); // WrongPassphraseError on failure
}
```

`parseFragment(hash, { passphrase })` works too; without a passphrase it throws `PassphraseRequiredError`.
Supplying a passphrase for a link that is not passphrase-protected throws `PassphraseUnexpectedError` (a swapped link
must not look "unlocked"). Passphrase: NFKC, at least 10 code points, at most 1024 UTF-8 bytes, no lone surrogates
(`PassphrasePolicyError`). Wrong passphrase and any tampering of header, KDF parameters, salt, nonce or ciphertext all
give the single `WrongPassphraseError`.

## Format

- Canonical JSON: sorted keys, no whitespace, NFC strings, safe non-negative integers only (large values are
  decimal strings), UTF-8. The parser rejects duplicate keys, `__proto__`/`constructor`/`prototype`, floats, huge
  numbers, NaN, deep nesting, and any input that is not byte-for-byte the canonical form.
- Signature: ECDSA secp256k1 (low-s, 64-byte compact) over `keccak256("GhostPay.Invoice.v1\0" || canonicalBytes)`,
  verified against the embedded `signer` key. It covers the complete plaintext invoice, including private fields.
- Envelope: `{alg:"none",inv,sig}` or `{alg:"A256GCM",pub,enc:{k,n,c},sig}` encoded as unpadded canonical base64url.
  Encrypted: random 256-bit key and 96-bit nonce per encryption, `AAD = "GPI1" || chainId (u64 BE) || signerPubKey (33 bytes)`.
- Passphrase envelope: `{alg:"A256GCM-PW",chainId,signer,kdf:{N,r,p,s},enc:{n,c}}` (s, n, c are strict base64url).
  Plaintext is canonical `{inv,sig}`: the whole invoice (amount, meta-address, token, line items) and the signature are
  encrypted; only chainId, signer and KDF parameters are in clear. Key = scrypt(NFKC(passphrase), 16-byte random salt,
  N in {2^15, 2^16, 2^17}, r=8, p=1, 32 bytes). AAD = `"GPI1-PW\0" || chainId (u64 BE) || signer (33) || N || r || p
  (u32 BE each) || salt`. The parser rejects any other N/r/p before deriving, so a link costs at most one 2^17 scrypt.
- Limit: 16384 decoded bytes (16385 is rejected). Errors are typed subclasses of `InvoiceError` with fixed messages.

## Security notes

- **The fragment is a bearer secret** in `none`/`A256GCM` mode. The AES key is inside it, so anyone holding the link can
  read the invoice. Encryption only keeps line items away from casual observers of partial data; it is not access control.
- **Passphrase mode is only as strong as the passphrase.** Anyone with the link can run an offline guessing attack at
  scrypt cost (2^17 by default). Use a long random passphrase and send it on a different channel from the link.
  It hides the invoice from people who see only the link; it does not authenticate the seller (pin the signer for that),
  does not hide chainId/signer, and leaks the approximate invoice size. JS strings cannot be zeroized: the library zeroes
  its own passphrase bytes, derived key and plaintext buffers best effort only.
- **A valid signature is not a trusted seller.** It proves the embedded key signed these bytes. Only
  `signerPinned` (key matches a pin you obtained out of band) supports trust; `isTrustedSeller` encodes that in the type.
  Bare links offer an integrity self-check only. UI wording must not say "verified seller".
- **JavaScript cannot guarantee zeroization** of keys or plaintext; the invoice-signing key is a plain `Uint8Array` you own.
- Decoded strings are inert data: render as text, never as HTML. Never log the fragment or parsed private fields.
- Expiry is client-side policy only (ADR-0003); `checkExpiry` takes an injected clock and expiry is exclusive.
- Coverage thresholds and fuzzing give regression confidence, not a security proof. No external audit.

## Scripts

`npm run build | typecheck | test | lint` (from this directory).

Status: used by `apps/web` and `chain-adapters`; no external audit. Deviations: [`DEVIATIONS.md`](./DEVIATIONS.md).

## Text hygiene (S3-12)

Strict parsing (`validateInvoice`, `validatePrivatePart`, `parseFragment`) rejects, in every free-text field (line-item
`description` and `memo`), with a `ForbiddenCharacterError` (a `SchemaError` subclass, `code: 'FORBIDDEN_CHARACTER'`, `path` = the field):

- bidirectional controls U+202A-202E, U+2066-2069, U+200E, U+200F, U+061C;
- zero-width and invisible characters U+200B-200D, U+2060, U+FEFF, U+00AD (also U+180E, U+2028, U+2029);
- Unicode tag characters U+E0000-E007F;
- all other C0/C1 control characters (U+0000-001F, U+007F-009F), except that a line feed `\n` is allowed in `memo` only.

Lone surrogates and non-NFC text still raise plain `SCHEMA`. The error message never echoes the offending character.
Consumers should still render text as text; `apps/web` keeps its display sanitiser as defence in depth for already-stored data.
