# `@ghostpay/invoice-schema`

GhostPay v1 invoice object, strict JSON, signing, AES-GCM envelope and the `#gpi=v1.` URL-fragment format
(ADR-0002, ADR-0005, ADR-0010). Source: `packages/invoice-schema/src/`. Runtime deps: `@noble/curves` 2.4.0,
`@noble/hashes` 2.4.0, and Web Crypto (`crypto.subtle`) for AES-256-GCM. No UI, RPC or DOM dependency.

## Exports

### Schema (`schema.ts`)

```ts
const MAX_LINE_ITEMS = 50;  const MAX_DESCRIPTION_LENGTH = 200;  const MAX_MEMO_LENGTH = 500; // code points

type AmountPolicy = { readonly mode: 'fiat_quote' } | { readonly mode: 'fixed_token'; readonly tokenAmount: string };
interface Quote { source: string; timestamp: number; expiresAt: number; maxSlippageBps: number }   // unix seconds
interface LineItem { description: string; quantity: string; unitMinorUnits: string }
interface Tax { rateBps: number; minorUnits: string }

interface Invoice {
  readonly v: 1;
  readonly chainId: number;
  readonly schemeId: 1;
  readonly metaAddress: string;          // canonical lowercase 'st:eth:0x' + 132 hex
  readonly nonce: string;                // 16 random bytes, 32 lowercase hex
  readonly fiat: { readonly currency: string; readonly minorUnits: string };   // /^[A-Z]{3}$/ ; decimal string
  readonly token: string;                // 'native' or lowercase 0x address
  readonly amountPolicy: AmountPolicy;
  readonly quote: Quote;
  readonly expiresAt: number;            // unix seconds; expired AT this instant
  readonly lineItems: readonly LineItem[];
  readonly tax: Tax;
  readonly feePolicy: 'payer_pays' | 'seller_pays';
  readonly memo?: string;
  readonly signer: string;               // 33-byte compressed invoice-signing key, 66 lowercase hex
}
type NewInvoice = Omit<Invoice, 'v' | 'schemeId' | 'nonce'>;
type RandomSource = Pick<Crypto, 'getRandomValues'>;

function createInvoice(input: NewInvoice, rng?: RandomSource): Invoice   // fills v, schemeId, nonce; validates
function validateInvoice(value: unknown): Invoice                        // strict, returns a clean copy
function validatePrivatePart(value: unknown): { lineItems: readonly LineItem[]; memo?: string }
```

Validation highlights (`validateInvoice`): unknown or missing keys rejected; `chainId >= 1`; meta-address must be two
distinct on-curve keys in canonical lowercase; `quote.expiresAt >= quote.timestamp`; `expiresAt`, `quote.timestamp`
and `quote.expiresAt` at most 253402300799 (9999-12-31T23:59:59Z, so `Date` code stays total); `maxSlippageBps` and
`tax.rateBps` in `0..10000`; `fiat.minorUnits`/`tax.minorUnits` decimal strings (up to 30 digits); `quantity`
`/^[1-9][0-9]{0,8}$/`; `fixed_token.tokenAmount` `1..2^256-1`; text is NFC, no C0/C1 control characters, no lone
surrogates, length counted in code points. **Totals are not cross-checked** (items + tax vs `fiat.minorUnits`); the
UI must do that (`apps/web/src/lib/invoiceCreate.ts` `computeTotals`, recomputed on the Pay page).
Token addresses are **lowercase only**; an EIP-55 mixed-case token fails with `SchemaError` path `token` (ADR-0010).

### Strict JSON and base64url (`json.ts`, `base64url.ts`)

```ts
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }
function parseStrictJson(text: string): JsonValue   // no duplicate keys, no __proto__/constructor/prototype,
                                                    // integers 0..2^53-1 only, depth <= 8, null-prototype objects
function canonicalize(value: unknown): string       // sorted keys (UTF-16 order), no whitespace, safe non-negative integers only
function encodeBase64Url(bytes: Uint8Array): string // unpadded RFC 4648 section 5
function decodeBase64Url(text: string): Uint8Array<ArrayBuffer>  // rejects '=', '+', '/', whitespace, len%4==1, non-zero trailing bits
```

### Signing (`sign.ts`)

```ts
const SIGNING_DOMAIN = 'GhostPay.Invoice.v1\0';
interface SignedInvoice { readonly invoice: Invoice; readonly signature: string }   // 128 lowercase hex (64-byte compact)

function canonicalInvoiceBytes(invoice: Invoice): Uint8Array   // utf8(canonicalize(validateInvoice(invoice)))
function invoiceDigest(invoice: Invoice): Uint8Array           // keccak256(SIGNING_DOMAIN || canonicalBytes)
function signerPublicKeyHex(signingKey: Uint8Array): string    // 66 hex; SigningError for an invalid key
function signInvoice(invoice: Invoice, signingKey: Uint8Array): SignedInvoice  // low-s, RFC 6979; self-verifies
function verifyInvoiceSignature(signed: SignedInvoice): boolean
```

`signInvoice` refuses if `invoice.signer` is not the public key of `signingKey`. Use a **dedicated** invoice-signing
key, never the stealth spend/view keys (ADR-0002). The signature covers the complete plaintext invoice, including
`lineItems` and `memo`, and is checked after decryption.

### Envelope and fragment (`envelope.ts`)

```ts
const MAX_DECODED_BYTES = 16_384;   const FRAGMENT_PREFIX = '#gpi=v1.';

interface EncodeOptions { readonly encrypt?: boolean; readonly rng?: RandomSource }
interface ParseOptions  { readonly pinnedSigners?: readonly string[] }   // lowercase 66-hex compressed keys
type TrustLevel = 'invalid-signature' | 'valid-signature' | 'trusted-seller'
interface Verification { readonly signatureValid: boolean; readonly signerPinned: boolean }
interface ParsedInvoice { invoice: Invoice; signature: string; verification: Verification; trust: TrustLevel; encrypted: boolean }

function encodeFragment(signed: SignedInvoice, options?: EncodeOptions): Promise<string>
function parseFragment(fragment: string, options?: ParseOptions): Promise<ParsedInvoice>
function isSignatureVerified(p: ParsedInvoice): p is SignatureVerifiedInvoice   // integrity only
function isTrustedSeller(p: ParsedInvoice): p is TrustedSellerInvoice           // signature valid AND signer pinned
```

Parse order (fail closed): prefix -> encoded length -> strict base64url -> 16384-byte limit -> fatal UTF-8 -> strict
JSON -> canonical-form equality (`NonCanonicalError` if the bytes are not exactly `canonicalize(parsed)`) -> envelope
shape -> schema -> optional AES-GCM decrypt -> signature. **An invalid signature does not throw**: you get
`verification.signatureValid === false` and `trust === 'invalid-signature'`; treat that as a hard stop.
`parseFragment` does no network access and does not check expiry; call `checkExpiry`. Wire format:
[byte-layouts.md](../byte-layouts.md#invoice-fragment-and-envelope).

### Expiry (`expiry.ts`)

```ts
interface ExpiryStatus { readonly invoiceExpired: boolean; readonly quoteExpired: boolean; readonly secondsRemaining: number }
function checkExpiry(invoice: Invoice, nowSeconds: number): ExpiryStatus
```

Exclusive: expired when `now >= expiresAt`. The clock is injected; `SchemaError('now')` unless `nowSeconds` is a
non-negative safe integer. Expiry is advisory client policy; nothing on-chain enforces it (ADR-0003).

### Errors (`errors.ts`)

`class InvoiceError extends Error { code: InvoiceErrorCode; path: string | undefined }` with subclasses:

| Class | `code` | Typical cause |
|---|---|---|
| `FragmentFormatError` | `FRAGMENT_FORMAT` | wrong prefix |
| `FragmentTooLargeError` | `FRAGMENT_TOO_LARGE` | > 16384 bytes decoded (16385 rejected) |
| `Base64UrlError` | `BASE64URL` | padding, wrong alphabet, non-canonical |
| `Utf8Error` | `UTF8` | invalid UTF-8 |
| `JsonParseError` | `JSON` | syntax, duplicate or forbidden key, float, depth |
| `SchemaError` | `SCHEMA` | `path` names the offending field, e.g. `token`, `lineItems[3].description` |
| `NonCanonicalError` | `NON_CANONICAL` | valid JSON but not the canonical bytes |
| `DecryptionError` | `DECRYPT` | wrong key, tampering, AAD mismatch |
| `SigningError` | `SIGNING` | key/signer mismatch; refusing to encode an invalidly signed invoice |
| `RandomnessError` | `RANDOMNESS` | no CSPRNG |
| `UnsupportedError` | `UNSUPPORTED` | unknown `alg`, or no `crypto.subtle` |

## Verified example

Executed against `packages/invoice-schema/dist`. The signing key is generated with noble (a dependency of this package).

```ts
import { generateKeySet, encodeMetaAddress } from '@ghostpay/core-crypto';
import {
  createInvoice, signInvoice, signerPublicKeyHex, encodeFragment, parseFragment, checkExpiry,
  isTrustedSeller, InvoiceError,
} from '@ghostpay/invoice-schema';
import { secp256k1 } from '@noble/curves/secp256k1.js';

const seller = generateKeySet();
const metaAddress = encodeMetaAddress(seller);
const signingKey = secp256k1.utils.randomSecretKey();          // dedicated invoice-signing key
const signer = signerPublicKeyHex(signingKey);
const now = Math.floor(Date.now() / 1000);

const invoice = createInvoice({
  chainId: 84532,
  metaAddress,
  fiat: { currency: 'USD', minorUnits: '1000' },
  token: '0x036cbd53842c5426634e7929541ec2318f3dcf7e',        // lowercase only
  amountPolicy: { mode: 'fixed_token', tokenAmount: '10000000' },
  quote: { source: 'chainlink:usdc-usd', timestamp: now, expiresAt: now + 600, maxSlippageBps: 50 },
  expiresAt: now + 3600,
  lineItems: [{ description: 'Widget', quantity: '2', unitMinorUnits: '500' }],
  tax: { rateBps: 0, minorUnits: '0' },
  feePolicy: 'payer_pays',
  memo: 'Order 42',
  signer,
});
const signed = signInvoice(invoice, signingKey);
const fragment = await encodeFragment(signed, { encrypt: true });   // '#gpi=v1.eyJhbGciOiJBMjU2R0NNIi...' (1568 chars here)

const parsed = await parseFragment(fragment, { pinnedSigners: [signer] });
parsed.verification;                 // { signatureValid: true, signerPinned: true }
parsed.trust;                        // 'trusted-seller'
parsed.encrypted;                    // true
isTrustedSeller(parsed);             // true
checkExpiry(parsed.invoice, now);    // { invoiceExpired: false, quoteExpired: false, secondsRemaining: 3600 }

(await parseFragment(fragment)).trust;   // 'valid-signature' (no pin: integrity only)
try { await parseFragment('#gpi=v1.AAAA'); } catch (e) { e instanceof InvoiceError; /* JsonParseError, code 'JSON' */ }
```

## Pitfalls

- **The fragment is a bearer secret.** With `encrypt: true` the AES key travels inside the same fragment, so encryption
  only hides line items from observers of partial data (screenshots, logs of a truncated URL); it is not access control.
- **A valid signature is not a trusted seller.** Only `signerPinned` (key obtained out of band) supports trust. UI copy
  must not say "verified seller" for `valid-signature` (ADR-0002).
- The envelope signature does not bind the ciphertext; anyone can re-encrypt an invoice, but nobody can change the
  plaintext without invalidating the signature (`DEVIATIONS.md` item 1).
- Do not log the fragment or `ParsedInvoice` private fields. Render all strings as text, never as HTML.
- `encodeFragment` is async (Web Crypto). In Node 22 `globalThis.crypto.subtle` exists; in other runtimes a missing
  `subtle` raises `UnsupportedError`.
- Keep `fiat.minorUnits` and `amountPolicy` consistent yourself; the schema does not.

Tests: `schema.test.ts`, `json.test.ts`, `base64url.test.ts`, `sign.test.ts`, `envelope.test.ts`, `expiry.test.ts`,
`fuzz.test.ts` (fast-check parser fuzz). `@noble/ciphers` is a dev dependency used as an independent AES-GCM in tests.
Deviations: `packages/invoice-schema/DEVIATIONS.md`.
