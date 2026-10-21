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

## Format

- Canonical JSON: sorted keys, no whitespace, NFC strings, safe non-negative integers only (large values are
  decimal strings), UTF-8. The parser rejects duplicate keys, `__proto__`/`constructor`/`prototype`, floats, huge
  numbers, NaN, deep nesting, and any input that is not byte-for-byte the canonical form.
- Signature: ECDSA secp256k1 (low-s, 64-byte compact) over `keccak256("GhostPay.Invoice.v1\0" || canonicalBytes)`,
  verified against the embedded `signer` key. It covers the complete plaintext invoice, including private fields.
- Envelope: `{alg:"none",inv,sig}` or `{alg:"A256GCM",pub,enc:{k,n,c},sig}` encoded as unpadded canonical base64url.
  Encrypted: random 256-bit key and 96-bit nonce per encryption, `AAD = "GPI1" || chainId (u64 BE) || signerPubKey (33 bytes)`.
- Limit: 16384 decoded bytes (16385 is rejected). Errors are typed subclasses of `InvoiceError` with fixed messages.

## Security notes

- **The fragment is a bearer secret.** The AES key is inside it, so anyone holding the link can read the invoice.
  Encryption only keeps line items away from casual observers of partial data; it is not access control.
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
