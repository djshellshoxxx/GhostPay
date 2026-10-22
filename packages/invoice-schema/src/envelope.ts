import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { decodeBase64Url, encodeBase64Url } from './base64url.js';
import {
  DecryptionError,
  FragmentFormatError,
  PassphraseRequiredError,
  PassphraseUnexpectedError,
  WrongPassphraseError,
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
import {
  PASSPHRASE_ALG,
  SALT_BYTES,
  SCRYPT_DEFAULT_N,
  SCRYPT_P,
  SCRYPT_R,
  buildPassphraseAad,
  derivePassphraseKey,
  isAllowedScrypt,
  passphraseToBytes,
  type ScryptParams,
} from './passphrase.js';

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
const B64_SALT_RE = /^[A-Za-z0-9_-]{22}$/;
const B64_NONCE_RE = /^[A-Za-z0-9_-]{16}$/;
/** At least a 16-byte GCM tag plus one byte of plaintext. */
const B64_CT_RE = /^[A-Za-z0-9_-]{23,}$/;

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
  /** Whether any part of the invoice was AES-GCM encrypted in the fragment (`A256GCM` or `A256GCM-PW`). */
  readonly encrypted: boolean;
  /** Whether the whole invoice was encrypted under a passphrase-derived key (`A256GCM-PW`, ADR-0020). */
  readonly passphraseProtected: boolean;
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
  /**
   * Passphrase-protect the link (`A256GCM-PW`, ADR-0020): the whole invoice and signature are encrypted
   * under scrypt(NFKC passphrase, random salt); only chainId, signer and KDF parameters stay in clear.
   * Implies encryption; combining it with `encrypt: false` is refused. Share the passphrase out of band.
   */
  readonly passphrase?: string;
  /** scrypt N for passphrase mode: 2^15, 2^16 or 2^17 (default 2^17). Only valid with `passphrase`. */
  readonly scryptN?: number;
}

export interface ParseOptions {
  /** Lowercase 66-hex compressed signer keys the caller trusts. */
  readonly pinnedSigners?: readonly string[];
  /** Passphrase for an `A256GCM-PW` link. Supplying one for any other link is refused. */
  readonly passphrase?: string;
}

/** Clear-text header of a passphrase-protected link. UNAUTHENTICATED until the passphrase decrypts it. */
export interface PassphraseHeader {
  readonly chainId: number;
  readonly signer: string;
  readonly kdf: ScryptParams;
}

/** Result of {@link openFragment}: either a parsed invoice, or a request to prompt for the passphrase. */
export type OpenFragmentResult =
  | { readonly status: 'ok'; readonly parsed: ParsedInvoice }
  | { readonly status: 'needsPassphrase'; readonly header: PassphraseHeader };

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
  if (options.passphrase !== undefined) {
    if (options.encrypt === false) throw new UnsupportedError();
    envelope = await encodePassphraseEnvelope(invoice, signed.signature, options.passphrase, options);
  } else if (options.scryptN !== undefined) {
    throw new UnsupportedError();
  } else if (options.encrypt === true) {
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

async function encodePassphraseEnvelope(
  invoice: Invoice,
  signature: string,
  passphrase: string,
  options: EncodeOptions,
): Promise<Record<string, unknown>> {
  const params: ScryptParams = { N: options.scryptN ?? SCRYPT_DEFAULT_N, r: SCRYPT_R, p: SCRYPT_P };
  if (!isAllowedScrypt(params)) throw new UnsupportedError();
  const passBytes = passphraseToBytes(passphrase);
  let key: Uint8Array<ArrayBuffer> | undefined;
  const plain = utf8ToBytes(canonicalize({ inv: invoice, sig: signature }));
  try {
    const salt = randomBytes(SALT_BYTES, options.rng);
    const nonce = randomBytes(12, options.rng);
    key = await derivePassphraseKey(passBytes, salt, params);
    const ct = await aesGcm(
      'encrypt',
      key,
      nonce,
      buildPassphraseAad(invoice.chainId, invoice.signer, params, salt),
      plain,
    );
    return {
      alg: PASSPHRASE_ALG,
      chainId: invoice.chainId,
      signer: invoice.signer,
      kdf: { N: params.N, r: params.r, p: params.p, s: encodeBase64Url(salt) },
      enc: { n: encodeBase64Url(nonce), c: encodeBase64Url(ct) },
    };
  } finally {
    passBytes.fill(0);
    key?.fill(0);
    plain.fill(0);
  }
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

function b64(v: unknown, re: RegExp, path: string, exactLength?: number): Uint8Array<ArrayBuffer> {
  const bytes = decodeBase64Url(str(v, re, path));
  if (exactLength !== undefined && bytes.length !== exactLength) throw new SchemaError(path);
  return bytes;
}

function headerChainId(v: unknown): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 1) throw new SchemaError('chainId');
  return v;
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new Utf8Error();
  }
}

/** Strict decode of `#gpi=v1.<b64url>` into the canonical envelope object (no crypto). */
function decodeEnvelopeRoot(fragment: string): Record<string, unknown> {
  if (typeof fragment !== 'string' || !fragment.startsWith(FRAGMENT_PREFIX)) throw new FragmentFormatError();
  const encoded = fragment.slice(FRAGMENT_PREFIX.length);
  if (encoded.length > MAX_ENCODED_CHARS) throw new FragmentTooLargeError();
  const bytes = decodeBase64Url(encoded);
  if (bytes.length > MAX_DECODED_BYTES) throw new FragmentTooLargeError();
  const source = decodeUtf8(bytes);
  const parsed = parseStrictJson(source);
  if (canonicalize(parsed) !== source) throw new NonCanonicalError();
  const root = parsed as unknown;
  if (typeof root !== 'object' || root === null || Array.isArray(root)) throw new SchemaError('$envelope');
  return root as Record<string, unknown>;
}

interface PassphraseEnvelope {
  readonly header: PassphraseHeader;
  readonly salt: Uint8Array<ArrayBuffer>;
  readonly nonce: Uint8Array<ArrayBuffer>;
  readonly ct: Uint8Array<ArrayBuffer>;
}

/** Structural validation of an `A256GCM-PW` envelope. Runs before (and gates) any KDF work. */
function readPassphraseEnvelope(root: Record<string, unknown>): PassphraseEnvelope {
  const e = obj(root, ['alg', 'chainId', 'enc', 'kdf', 'signer']);
  const chainId = headerChainId(e['chainId']);
  const signer = str(e['signer'], PUBKEY_RE, 'signer');
  const kdf = obj(e['kdf'], ['N', 'p', 'r', 's']);
  const params = { N: kdf['N'], r: kdf['r'], p: kdf['p'] };
  if (!isAllowedScrypt(params)) throw new UnsupportedError();
  const salt = b64(kdf['s'], B64_SALT_RE, 'kdf.s', SALT_BYTES);
  const enc = obj(e['enc'], ['c', 'n']);
  const nonce = b64(enc['n'], B64_NONCE_RE, 'enc.n', 12);
  const ct = b64(enc['c'], B64_CT_RE, 'enc.c');
  return { header: { chainId, signer, kdf: params as ScryptParams }, salt, nonce, ct };
}

async function decryptPassphraseEnvelope(
  env: PassphraseEnvelope,
  passphrase: string,
): Promise<{ invoice: Invoice; signature: string }> {
  const passBytes = passphraseToBytes(passphrase);
  const { header } = env;
  let key: Uint8Array<ArrayBuffer> | undefined;
  let plain: Uint8Array;
  try {
    key = await derivePassphraseKey(passBytes, env.salt, header.kdf);
    try {
      plain = await aesGcm(
        'decrypt',
        key,
        env.nonce,
        buildPassphraseAad(header.chainId, header.signer, header.kdf, env.salt),
        env.ct,
      );
    } catch (err) {
      if (!(err instanceof DecryptionError)) throw err;
      // One error for wrong passphrase, tampered header/params/salt/nonce/ciphertext: no oracle.
      throw new WrongPassphraseError();
    }
  } finally {
    passBytes.fill(0);
    key?.fill(0);
  }
  try {
    // Past this point the ciphertext authenticated under the passphrase, so specific errors are no oracle.
    const text = decodeUtf8(plain);
    const parsed = parseStrictJson(text);
    if (canonicalize(parsed) !== text) throw new NonCanonicalError();
    const body = obj(parsed, ['inv', 'sig']);
    const signature = str(body['sig'], HEX_SIG_RE, 'sig');
    const invoice = validateInvoice(body['inv']);
    if (invoice.chainId !== header.chainId) throw new SchemaError('chainId');
    if (invoice.signer !== header.signer) throw new SchemaError('signer');
    return { invoice, signature };
  } finally {
    plain.fill(0);
  }
}

function finish(
  invoice: Invoice,
  signature: string,
  encrypted: boolean,
  passphraseProtected: boolean,
  options: ParseOptions,
): ParsedInvoice {
  const signatureValid = verifyInvoiceSignature({ invoice, signature });
  const pinned = options.pinnedSigners ?? [];
  const signerPinned = signatureValid && pinned.some((k) => k.toLowerCase() === invoice.signer);
  const trust: TrustLevel = !signatureValid
    ? 'invalid-signature'
    : signerPinned
      ? 'trusted-seller'
      : 'valid-signature';
  return {
    invoice,
    signature,
    verification: { signatureValid, signerPinned },
    trust,
    encrypted,
    passphraseProtected,
  };
}

async function parseRoot(
  root: Record<string, unknown>,
  options: ParseOptions,
  prompt: boolean,
): Promise<OpenFragmentResult> {
  const alg = root['alg'];
  if (alg === PASSPHRASE_ALG) {
    const env = readPassphraseEnvelope(root);
    if (options.passphrase === undefined) {
      if (prompt) return { status: 'needsPassphrase', header: env.header };
      throw new PassphraseRequiredError();
    }
    const { invoice, signature } = await decryptPassphraseEnvelope(env, options.passphrase);
    return { status: 'ok', parsed: finish(invoice, signature, true, true, options) };
  }
  if (options.passphrase !== undefined && (alg === 'none' || alg === 'A256GCM')) {
    throw new PassphraseUnexpectedError();
  }
  return { status: 'ok', parsed: await parseV1(root, options) };
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
 * Passphrase links (`alg: "A256GCM-PW"`, ADR-0020): the KDF parameters are checked against the
 * allow-list before any derivation; without `options.passphrase` this throws
 * {@link PassphraseRequiredError} (use {@link openFragment} to get a prompt-friendly result); a wrong
 * passphrase or any tampering throws the single {@link WrongPassphraseError}. Supplying a passphrase for
 * a non-passphrase link throws {@link PassphraseUnexpectedError}.
 *
 * @param fragment Bounded `#gpi=v1.<base64url>` input (e.g. `location.hash`).
 * @param options Optional pinned signer keys and passphrase.
 * @returns Validated invoice plus verification result.
 * @throws {InvoiceError} Subclass per failure class: format, size, base64url, UTF-8, JSON, schema, canonical, decryption.
 * @security Do not log the fragment or returned private fields. It is a bearer secret readable by any script on the page.
 * @testVector invoice-v1-sample
 */
export async function parseFragment(fragment: string, options: ParseOptions = {}): Promise<ParsedInvoice> {
  const result = await parseRoot(decodeEnvelopeRoot(fragment), options, false);
  /* c8 ignore next */
  if (result.status !== 'ok') throw new PassphraseRequiredError();
  return result.parsed;
}

/**
 * Like {@link parseFragment}, but returns `{status:'needsPassphrase', header}` for an `A256GCM-PW` link
 * when no passphrase is supplied, so a UI can prompt. No KDF work happens in that case.
 *
 * @param fragment Bounded `#gpi=v1.<base64url>` input.
 * @param options Pinned signers and optional passphrase.
 * @returns Discriminated result.
 * @throws {InvoiceError} Same classes as {@link parseFragment}, plus {@link WrongPassphraseError}.
 * @security `header` is unauthenticated (anyone can edit it); show it only as "claimed" until decrypted.
 * @testVector invoice-v1-sample
 */
export async function openFragment(fragment: string, options: ParseOptions = {}): Promise<OpenFragmentResult> {
  return parseRoot(decodeEnvelopeRoot(fragment), options, true);
}

async function parseV1(root: Record<string, unknown>, options: ParseOptions): Promise<ParsedInvoice> {
  const alg = root['alg'];
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

  return finish(invoice, signature, encrypted, false, options);
}
