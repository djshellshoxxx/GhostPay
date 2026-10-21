import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { decodeBase64Url, encodeBase64Url } from './base64url.js';
import {
  DecryptionError,
  FragmentFormatError,
  FragmentTooLargeError,
  InvoiceError,
  NonCanonicalError,
  SchemaError,
  SigningError,
  UnsupportedError,
  Utf8Error,
} from './errors.js';
import { canonicalize, parseStrictJson } from './json.js';
import {
  PRIVATE_KEYS,
  randomBytes,
  validateInvoice,
  validatePrivatePart,
  type Invoice,
  type RandomSource,
} from './schema.js';
import { verifyInvoiceSignature, type SignedInvoice } from './sign.js';

/** Hard limit on the decoded envelope size (16 KiB). */
export const MAX_DECODED_BYTES = 16_384;
/** Fragment prefix (includes the leading `#`). */
export const FRAGMENT_PREFIX = '#gpi=v1.';
/** Longest acceptable encoded payload: unpadded base64url of 16 KiB. */
const MAX_ENCODED_CHARS = Math.ceil((MAX_DECODED_BYTES * 4) / 3);

const HEX_SIG_RE = /^[0-9a-f]{128}$/;
const KEY_RE = /^[0-9a-f]{64}$/;
const NONCE_RE = /^[0-9a-f]{24}$/;
const CT_RE = /^(?:[0-9a-f]{2}){16,}$/;
const PUBKEY_RE = /^(?:02|03)[0-9a-f]{64}$/;
const AAD_MAGIC = utf8ToBytes('GPI1');

/** How a signed invoice is trusted. `valid-signature` is NOT `trusted-seller`. */
export type TrustLevel = 'invalid-signature' | 'valid-signature' | 'trusted-seller';

export interface Verification {
  /** The embedded signer key signed exactly these canonical bytes. Says nothing about who the signer is. */
  readonly signatureValid: boolean;
  /** `signatureValid` AND the signer key is in the caller's pinned set. Never true for an invalid signature. */
  readonly signerPinned: boolean;
}

/** Result of {@link parseFragment}. */
export interface ParsedInvoice {
  readonly invoice: Invoice;
  readonly signature: string;
  readonly verification: Verification;
  /** Derived from `verification`; UIs must not say "verified seller" unless this is `trusted-seller`. */
  readonly trust: TrustLevel;
  /** Whether the private part was AES-GCM encrypted in the fragment. */
  readonly encrypted: boolean;
}

/** A parse result whose signature checked out against the embedded key (integrity only). */
export type SignatureVerifiedInvoice = ParsedInvoice & {
  readonly verification: { readonly signatureValid: true; readonly signerPinned: boolean };
};
/** A parse result whose signer key is pinned by the caller (the only state that supports "trusted seller"). */
export type TrustedSellerInvoice = ParsedInvoice & {
  readonly verification: { readonly signatureValid: true; readonly signerPinned: true };
  readonly trust: 'trusted-seller';
};

/**
 * Type guard for a valid signature (integrity only).
 *
 * @param p Parse result.
 * @returns Whether the signature is valid.
 * @security Does not establish seller identity.
 * @testVector invoice-v1-sample
 */
export function isSignatureVerified(p: ParsedInvoice): p is SignatureVerifiedInvoice {
  return p.verification.signatureValid;
}

/**
 * Type guard for a pinned signer with a valid signature.
 *
 * @param p Parse result.
 * @returns Whether the seller key is trusted by the caller's pin set.
 * @security Trust is only as good as the pinning source (merchant profile, embed config).
 * @testVector invoice-v1-sample
 */
export function isTrustedSeller(p: ParsedInvoice): p is TrustedSellerInvoice {
  return p.verification.signatureValid && p.verification.signerPinned;
}

export interface EncodeOptions {
  /** Encrypt `lineItems` and `memo` with a fresh AES-256-GCM key placed in the fragment. Default false. */
  readonly encrypt?: boolean;
  readonly rng?: RandomSource;
}

export interface ParseOptions {
  /** Lowercase 66-hex compressed signer keys the caller trusts. */
  readonly pinnedSigners?: readonly string[];
}

function getSubtle(): SubtleCrypto {
  const c = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto;
  if (c?.subtle === undefined) throw new UnsupportedError();
  return c.subtle;
}

/** AAD = "GPI1" || chainId (uint64 BE) || signerPubKey (33 bytes)  (ADR-0005). */
function buildAad(chainId: number, signerHex: string): Uint8Array<ArrayBuffer> {
  const chain = new Uint8Array(8);
  new DataView(chain.buffer).setBigUint64(0, BigInt(chainId));
  return concatBytes(AAD_MAGIC, chain, hexToBytes(signerHex));
}

async function aesGcm(
  mode: 'encrypt' | 'decrypt',
  key: Uint8Array<ArrayBuffer>,
  nonce: Uint8Array<ArrayBuffer>,
  aad: Uint8Array<ArrayBuffer>,
  data: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array> {
  const subtle = getSubtle();
  const k = await subtle.importKey('raw', key, { name: 'AES-GCM' }, false, [mode]);
  const params = { name: 'AES-GCM', iv: nonce, additionalData: aad, tagLength: 128 };
  try {
    const out =
      mode === 'encrypt' ? await subtle.encrypt(params, k, data) : await subtle.decrypt(params, k, data);
    return new Uint8Array(out);
  } catch {
    throw new DecryptionError();
  }
}

function splitInvoice(invoice: Invoice): { pub: Record<string, unknown>; priv: Record<string, unknown> } {
  const pub: Record<string, unknown> = {};
  const priv: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(invoice)) {
    if ((PRIVATE_KEYS as readonly string[]).includes(k)) priv[k] = v;
    else pub[k] = v;
  }
  return { pub, priv };
}

/**
 * Encodes a signed invoice as `#gpi=v1.<base64url(envelope)>`.
 *
 * @remarks Envelope is canonical JSON. Plain form: `{alg:"none",inv,sig}`.
 * Encrypted form: `{alg:"A256GCM",pub,enc:{k,n,c},sig}` where the private part
 * (`lineItems`, `memo`) is AES-256-GCM encrypted via Web Crypto with a random
 * per-invoice 256-bit key and random 96-bit nonce; AAD = `"GPI1" || chainId(u64 BE) || signerPubKey(33)`.
 * The key travels in the fragment (ADR-0005): the link is a bearer secret, and
 * anyone holding it can decrypt. The signature covers the full plaintext invoice.
 * Refuses an invalid signature and anything above 16 KiB decoded.
 *
 * @param signed Invoice with a valid signature.
 * @param options `encrypt` and an injectable RNG for tests.
 * @returns Fragment string including the leading `#`.
 * @throws {SigningError} If the signature is invalid; {@link FragmentTooLargeError} over 16384 bytes.
 * @security The result is a bearer secret. Never log or send it to a server; JS cannot guarantee zeroization of the key.
 * @testVector invoice-v1-sample
 */
export async function encodeFragment(signed: SignedInvoice, options: EncodeOptions = {}): Promise<string> {
  const invoice = validateInvoice(signed.invoice);
  if (!verifyInvoiceSignature({ invoice, signature: signed.signature })) throw new SigningError();
  let envelope: Record<string, unknown>;
  if (options.encrypt === true) {
    const { pub, priv } = splitInvoice(invoice);
    const key = randomBytes(32, options.rng);
    const nonce = randomBytes(12, options.rng);
    const ct = await aesGcm(
      'encrypt',
      key,
      nonce,
      buildAad(invoice.chainId, invoice.signer),
      utf8ToBytes(canonicalize(priv)),
    );
    envelope = {
      alg: 'A256GCM',
      pub,
      enc: { k: bytesToHex(key), n: bytesToHex(nonce), c: bytesToHex(ct) },
      sig: signed.signature,
    };
    key.fill(0);
  } else {
    envelope = { alg: 'none', inv: invoice, sig: signed.signature };
  }
  const bytes = utf8ToBytes(canonicalize(envelope));
  if (bytes.length > MAX_DECODED_BYTES) throw new FragmentTooLargeError();
  return FRAGMENT_PREFIX + encodeBase64Url(bytes);
}

function obj(v: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SchemaError('$envelope');
  const rec = v as Record<string, unknown>;
  const present = Object.keys(rec);
  if (present.length !== keys.length || !keys.every((k) => k in rec)) throw new SchemaError('$envelope');
  return rec;
}

function str(v: unknown, re: RegExp, path: string): string {
  if (typeof v !== 'string' || !re.test(v)) throw new SchemaError(path);
  return v;
}

/**
 * Parses and authenticates a GhostPay invoice fragment without network access.
 *
 * @remarks Fails closed with typed {@link InvoiceError} subclasses. Order: prefix,
 * encoded length, strict canonical base64url, 16384-byte decoded limit, fatal
 * UTF-8, strict JSON (no duplicate or prototype keys, integers only, depth <= 8),
 * canonical-form equality, schema validation, optional AES-GCM decryption, then
 * signature verification. An invalid signature does not throw: it yields
 * `signatureValid: false` and `trust: 'invalid-signature'`, which callers must
 * treat as a hard stop. `signerPinned` is true only when the signature is valid
 * and the signer key is in `options.pinnedSigners`. Strings in the result are
 * inert data; never render them as HTML. This function does not fetch URLs or
 * check expiry (use {@link checkExpiry}).
 *
 * @param fragment Bounded `#gpi=v1.<base64url>` input (e.g. `location.hash`).
 * @param options Optional pinned signer keys.
 * @returns Validated invoice plus verification result.
 * @throws {InvoiceError} Subclass per failure class: format, size, base64url, UTF-8, JSON, schema, canonical, decryption.
 * @security Do not log the fragment or returned private fields. It is a bearer secret readable by any script on the page.
 * @testVector invoice-v1-sample
 */
export async function parseFragment(fragment: string, options: ParseOptions = {}): Promise<ParsedInvoice> {
  if (typeof fragment !== 'string' || !fragment.startsWith(FRAGMENT_PREFIX)) throw new FragmentFormatError();
  const encoded = fragment.slice(FRAGMENT_PREFIX.length);
  if (encoded.length > MAX_ENCODED_CHARS) throw new FragmentTooLargeError();
  const bytes = decodeBase64Url(encoded);
  if (bytes.length > MAX_DECODED_BYTES) throw new FragmentTooLargeError();
  let source: string;
  try {
    source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new Utf8Error();
  }
  const parsed = parseStrictJson(source);
  if (canonicalize(parsed) !== source) throw new NonCanonicalError();

  const root = parsed as unknown;
  if (typeof root !== 'object' || root === null || Array.isArray(root)) throw new SchemaError('$envelope');
  const alg = (root as Record<string, unknown>)['alg'];

  let invoice: Invoice;
  let signature: string;
  let encrypted: boolean;
  if (alg === 'none') {
    const e = obj(root, ['alg', 'inv', 'sig']);
    invoice = validateInvoice(e['inv']);
    signature = str(e['sig'], HEX_SIG_RE, 'sig');
    encrypted = false;
  } else if (alg === 'A256GCM') {
    const e = obj(root, ['alg', 'pub', 'enc', 'sig']);
    signature = str(e['sig'], HEX_SIG_RE, 'sig');
    const enc = obj(e['enc'], ['k', 'n', 'c']);
    const key = str(enc['k'], KEY_RE, 'enc.k');
    const nonce = str(enc['n'], NONCE_RE, 'enc.n');
    const ct = str(enc['c'], CT_RE, 'enc.c');
    const pub = e['pub'];
    if (typeof pub !== 'object' || pub === null || Array.isArray(pub)) throw new SchemaError('pub');
    const p = pub as Record<string, unknown>;
    const chainId = p['chainId'];
    if (typeof chainId !== 'number' || !Number.isSafeInteger(chainId) || chainId < 1)
      throw new SchemaError('chainId');
    const signer = str(p['signer'], PUBKEY_RE, 'signer');
    let plain: Uint8Array;
    try {
      plain = await aesGcm(
        'decrypt',
        hexToBytes(key),
        hexToBytes(nonce),
        buildAad(chainId, signer),
        hexToBytes(ct),
      );
    } catch (err) {
      if (err instanceof InvoiceError) throw err;
      throw new DecryptionError();
    }
    let plainText: string;
    try {
      plainText = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(plain);
    } catch {
      throw new Utf8Error();
    }
    const privParsed = parseStrictJson(plainText);
    if (canonicalize(privParsed) !== plainText) throw new NonCanonicalError();
    const priv = validatePrivatePart(privParsed);
    for (const k of PRIVATE_KEYS) if (k in p) throw new SchemaError('pub');
    invoice = validateInvoice({ ...p, ...priv });
    encrypted = true;
  } else {
    throw new UnsupportedError();
  }

  const signatureValid = verifyInvoiceSignature({ invoice, signature });
  const pinned = options.pinnedSigners ?? [];
  const signerPinned = signatureValid && pinned.some((k) => k.toLowerCase() === invoice.signer);
  const trust: TrustLevel = !signatureValid
    ? 'invalid-signature'
    : signerPinned
      ? 'trusted-seller'
      : 'valid-signature';
  return { invoice, signature, verification: { signatureValid, signerPinned }, trust, encrypted };
}
