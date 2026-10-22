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
