import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { ForbiddenCharacterError, RandomnessError, SchemaError } from './errors.js';

/** Maximum number of line items. */
export const MAX_LINE_ITEMS = 50;
/** Maximum code points in a line-item description. */
export const MAX_DESCRIPTION_LENGTH = 200;
/** Maximum code points in a memo. */
export const MAX_MEMO_LENGTH = 500;

/** Random source: `crypto` or a deterministic test double. */
export type RandomSource = Pick<Crypto, 'getRandomValues'>;

export type AmountPolicy =
  { readonly mode: 'fiat_quote' } | { readonly mode: 'fixed_token'; readonly tokenAmount: string };

export interface Quote {
  /** Quote source identifier, e.g. `chainlink:eth-usd`. */
  readonly source: string;
  /** Unix seconds. */
  readonly timestamp: number;
  /** Unix seconds; the quote must not be used at or after this instant. */
  readonly expiresAt: number;
  readonly maxSlippageBps: number;
}

export interface LineItem {
  /** Plain text only. Never render as markup. */
  readonly description: string;
  /** Decimal string, 1 to 9 digits, no leading zero. */
  readonly quantity: string;
  /** Fiat minor units per item, decimal string. */
  readonly unitMinorUnits: string;
}

export interface Tax {
  readonly rateBps: number;
  /** Fiat minor units, decimal string. */
  readonly minorUnits: string;
}

/**
 * Seller's gas-buffer policy (spec 13, ADR-0023). Only in `v: 2` invoices. `refund` is fixed at `'none'`: a buffer is
 * never refunded (no silent refunds). Declined: `accepted: false` with both bounds `"0"`. Accepted: token invoices only,
 * `1 <= minWei <= maxWei <= 2^256-1` (wei, decimal strings); `minWei` is the seller's dust floor.
 */
export interface BufferPolicy {
  readonly accepted: boolean;
  readonly maxWei: string;
  readonly minWei: string;
  readonly refund: 'none';
}

/** GhostPay invoice (ADR-0002, ADR-0005, DEVELOPER_SPECIFICATION Module C). `v: 2` adds `bufferPolicy` (ADR-0023). */
export interface Invoice {
  readonly v: 1 | 2;
  readonly chainId: number;
  readonly schemeId: 1;
  /** Canonical lowercase `st:eth:0x<spendPub33><viewPub33>`. */
  readonly metaAddress: string;
  /** 16 random bytes, lowercase hex (32 chars). */
  readonly nonce: string;
  readonly fiat: { readonly currency: string; readonly minorUnits: string };
  /** `'native'` or a lowercase 0x address. */
  readonly token: string;
  readonly amountPolicy: AmountPolicy;
  readonly quote: Quote;
  /** Unix seconds; the invoice is expired at and after this instant. */
  readonly expiresAt: number;
  readonly lineItems: readonly LineItem[];
  readonly tax: Tax;
  readonly feePolicy: 'payer_pays' | 'seller_pays';
  readonly memo?: string;
  /** Invoice-signing public key: 33-byte compressed point as lowercase hex (66 chars). */
  readonly signer: string;
  /** Present exactly when `v === 2`. */
  readonly bufferPolicy?: BufferPolicy;
}

/** Fields the creator supplies; `v`, `schemeId` and `nonce` are filled in (`v` is 2 iff `bufferPolicy` is given). */
export type NewInvoice = Omit<Invoice, 'v' | 'schemeId' | 'nonce'>;

/** Keys that live in the encrypted private part of an invoice. */
export const PRIVATE_KEYS = ['lineItems', 'memo'] as const;

const INVOICE_KEYS = [
  'v',
  'chainId',
  'schemeId',
  'metaAddress',
  'nonce',
  'fiat',
  'token',
  'amountPolicy',
  'quote',
  'expiresAt',
  'lineItems',
  'tax',
  'feePolicy',
  'memo',
  'signer',
  'bufferPolicy',
] as const;
const REQUIRED_KEYS = INVOICE_KEYS.filter((k) => k !== 'memo' && k !== 'bufferPolicy');

const DEC_RE = /^(?:0|[1-9][0-9]{0,29})$/;
const QTY_RE = /^[1-9][0-9]{0,8}$/;
const TOKEN_AMOUNT_RE = /^[1-9][0-9]{0,77}$/;
const WEI_RE = /^(?:0|[1-9][0-9]{0,77})$/;
const CURRENCY_RE = /^[A-Z]{3}$/;
const SOURCE_RE = /^[a-z0-9][a-z0-9._:-]{0,63}$/;
const NONCE_RE = /^[0-9a-f]{32}$/;
const ADDRESS_RE = /^0x[0-9a-f]{40}$/;
const META_RE = /^st:eth:0x([0-9a-f]{132})$/;
const PUBKEY_RE = /^(?:02|03)[0-9a-f]{64}$/;
const MAX_UINT256 = (1n << 256n) - 1n;

function fail(path: string): never {
  throw new SchemaError(path);
}

function record(
  v: unknown,
  path: string,
  allowed: readonly string[],
  required: readonly string[],
): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return fail(path);
  const proto: unknown = Object.getPrototypeOf(v);
  if (proto !== null && proto !== Object.prototype) return fail(path);
  const rec = v as Record<string, unknown>;
  for (const k of Object.keys(rec)) if (!allowed.includes(k)) return fail(path);
  for (const k of required)
    if (!(k in rec) || rec[k] === undefined) return fail(path === '$' ? k : `${path}.${k}`);
  return rec;
}

function safeInt(v: unknown, path: string, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min || v > max) return fail(path);
  return v;
}

function matching(v: unknown, path: string, re: RegExp): string {
  if (typeof v !== 'string' || !re.test(v)) return fail(path);
  return v;
}

function hasLoneSurrogate(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) i++;
      else return true;
    } else if (c >= 0xdc00 && c <= 0xdfff) return true;
  }
  return false;
}

/**
 * S3-12 forbidden code points: bidi controls (U+061C, U+200E/F, U+202A-202E, U+2066-2069), zero-width and invisible
 * (U+00AD, U+200B-200D, U+2060, U+FEFF, U+180E), line/paragraph separators (U+2028/9), Unicode tags (U+E0000-E007F)
 * and C0/C1 controls (U+007F-009F, and U+0000-001F).
 */
// eslint-disable-next-line no-control-regex
const FORBIDDEN_RE = /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060\u2066-\u2069\ufeff\u{e0000}-\u{e007f}]/u;
/** Same, but a line feed is allowed (memo only). */
// eslint-disable-next-line no-control-regex
const FORBIDDEN_EXCEPT_LF_RE = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060\u2066-\u2069\ufeff\u{e0000}-\u{e007f}]/u;

/** Text hygiene: well-formed UTF-16, NFC, no forbidden characters (S3-12), 1..max code points. */
function text(v: unknown, path: string, max: number, allowLf = false): string {
  if (typeof v !== 'string' || v.length === 0 || v.length > max * 2) return fail(path);
  if (hasLoneSurrogate(v) || v !== v.normalize('NFC')) return fail(path);
  if ((allowLf ? FORBIDDEN_EXCEPT_LF_RE : FORBIDDEN_RE).test(v)) throw new ForbiddenCharacterError(path);
  let count = 0;
  for (const _ of v) {
    void _;
    count++;
  }
  if (count > max) return fail(path);
  return v;
}

function validateLineItems(v: unknown, path: string): readonly LineItem[] {
  if (!Array.isArray(v) || v.length > MAX_LINE_ITEMS) return fail(path);
  return (v as unknown[]).map((raw, i) => {
    const p = `${path}[${i}]`;
    const r = record(
      raw,
      p,
      ['description', 'quantity', 'unitMinorUnits'],
      ['description', 'quantity', 'unitMinorUnits'],
    );
    return {
      description: text(r['description'], `${p}.description`, MAX_DESCRIPTION_LENGTH),
      quantity: matching(r['quantity'], `${p}.quantity`, QTY_RE),
      unitMinorUnits: matching(r['unitMinorUnits'], `${p}.unitMinorUnits`, DEC_RE),
    };
  });
}

/**
 * Validates and normalizes the private part (line items and memo).
 *
 * @remarks Rejects unknown keys. Returns fresh objects.
 *
 * @param value Candidate `{ lineItems, memo? }`.
 * @returns Clean copy.
 * @throws {SchemaError} With a schema-defined `path`.
 * @security Contents are untrusted text: render as text only, never HTML.
 * @testVector invoice-private-part
 */
export function validatePrivatePart(value: unknown): { lineItems: readonly LineItem[]; memo?: string } {
  const r = record(value, '$private', PRIVATE_KEYS, ['lineItems']);
  const lineItems = validateLineItems(r['lineItems'], 'lineItems');
  return r['memo'] === undefined
    ? { lineItems }
    : { lineItems, memo: text(r['memo'], 'memo', MAX_MEMO_LENGTH, true) };
}

function validPoint(hex: string, path: string): void {
  try {
    secp256k1.Point.fromHex(hex);
  } catch {
    fail(path);
  }
}

/**
 * Validates an untrusted value as a v1 invoice and returns a clean copy.
 *
 * @remarks Strict: unknown/missing keys, wrong types, non-canonical forms
 * (uppercase hex, non-NFC text, control characters), out-of-range numbers,
 * more than 50 line items, over-long strings, invalid curve points and
 * `quote.expiresAt < quote.timestamp` are all rejected. Big values are decimal
 * strings (fiat amounts up to 30 digits, token amounts up to 2^256-1).
 *
 * @param value Candidate invoice (parsed JSON or a programmatic object).
 * @returns A fresh, validated {@link Invoice}.
 * @throws {SchemaError} With a schema-defined `path`; never echoes input.
 * @security Strings in the result are untrusted text. Render as text only.
 * @testVector invoice-v1-sample
 */
export function validateInvoice(value: unknown): Invoice {
  const r = record(value, '$', INVOICE_KEYS, REQUIRED_KEYS);
  const rawVersion = r['v'];
  if (rawVersion !== 1 && rawVersion !== 2) return fail('v');
  const version: 1 | 2 = rawVersion;
  // A v2 invoice without its policy is a wrong version; a v1 invoice carrying one has an unknown field.
  if (version === 2 && r['bufferPolicy'] === undefined) fail('v');
  if (version === 1 && r['bufferPolicy'] !== undefined) fail('bufferPolicy');
  if (r['schemeId'] !== 1) fail('schemeId');
  const chainId = safeInt(r['chainId'], 'chainId', 1, Number.MAX_SAFE_INTEGER);
  const metaAddress = matching(r['metaAddress'], 'metaAddress', META_RE);
  const metaBody = META_RE.exec(metaAddress)?.[1] as string;
  validPoint(metaBody.slice(0, 66), 'metaAddress');
  validPoint(metaBody.slice(66), 'metaAddress');
  if (metaBody.slice(0, 66) === metaBody.slice(66)) fail('metaAddress');
  const nonce = matching(r['nonce'], 'nonce', NONCE_RE);

  const f = record(r['fiat'], 'fiat', ['currency', 'minorUnits'], ['currency', 'minorUnits']);
  const fiat = {
    currency: matching(f['currency'], 'fiat.currency', CURRENCY_RE),
    minorUnits: matching(f['minorUnits'], 'fiat.minorUnits', DEC_RE),
  };

  const tokenRaw = r['token'];
  const token = tokenRaw === 'native' ? 'native' : matching(tokenRaw, 'token', ADDRESS_RE);

  const ap = record(r['amountPolicy'], 'amountPolicy', ['mode', 'tokenAmount'], ['mode']);
  let amountPolicy: AmountPolicy;
  if (ap['mode'] === 'fiat_quote') {
    if (ap['tokenAmount'] !== undefined) fail('amountPolicy.tokenAmount');
    amountPolicy = { mode: 'fiat_quote' };
  } else if (ap['mode'] === 'fixed_token') {
    const amt = matching(ap['tokenAmount'], 'amountPolicy.tokenAmount', TOKEN_AMOUNT_RE);
    if (BigInt(amt) > MAX_UINT256) fail('amountPolicy.tokenAmount');
    amountPolicy = { mode: 'fixed_token', tokenAmount: amt };
  } else {
    return fail('amountPolicy.mode');
  }

  const q = record(
    r['quote'],
    'quote',
    ['source', 'timestamp', 'expiresAt', 'maxSlippageBps'],
    ['source', 'timestamp', 'expiresAt', 'maxSlippageBps'],
  );
  const quote: Quote = {
    source: matching(q['source'], 'quote.source', SOURCE_RE),
    timestamp: safeInt(q['timestamp'], 'quote.timestamp', 0, Number.MAX_SAFE_INTEGER),
    expiresAt: safeInt(q['expiresAt'], 'quote.expiresAt', 0, Number.MAX_SAFE_INTEGER),
    maxSlippageBps: safeInt(q['maxSlippageBps'], 'quote.maxSlippageBps', 0, 10_000),
  };
  if (quote.expiresAt < quote.timestamp) fail('quote.expiresAt');

  const expiresAt = safeInt(r['expiresAt'], 'expiresAt', 0, Number.MAX_SAFE_INTEGER);
  const lineItems = validateLineItems(r['lineItems'], 'lineItems');

  const t = record(r['tax'], 'tax', ['rateBps', 'minorUnits'], ['rateBps', 'minorUnits']);
  const tax: Tax = {
    rateBps: safeInt(t['rateBps'], 'tax.rateBps', 0, 10_000),
    minorUnits: matching(t['minorUnits'], 'tax.minorUnits', DEC_RE),
  };

  const feePolicyRaw = r['feePolicy'];
  const feePolicy: Invoice['feePolicy'] =
    feePolicyRaw === 'payer_pays' || feePolicyRaw === 'seller_pays' ? feePolicyRaw : fail('feePolicy');

  const signer = matching(r['signer'], 'signer', PUBKEY_RE);
  validPoint(signer, 'signer');

  const bufferPolicy = version === 2 ? validateBufferPolicy(r['bufferPolicy'], token) : undefined;

  const core: Invoice = {
    v: version,
    chainId,
    schemeId: 1 as const,
    metaAddress,
    nonce,
    fiat,
    token,
    amountPolicy,
    quote,
    expiresAt,
    lineItems,
    tax,
    feePolicy: feePolicy,
    signer,
  };
  const base: Invoice = bufferPolicy === undefined ? core : { ...core, bufferPolicy };
  return r['memo'] === undefined ? base : { ...base, memo: text(r['memo'], 'memo', MAX_MEMO_LENGTH, true) };
}

function wei(v: unknown, path: string): bigint {
  const n = BigInt(matching(v, path, WEI_RE));
  if (n > MAX_UINT256) fail(path);
  return n;
}

/** Validates a v2 `bufferPolicy` (ADR-0023); returns a fresh canonical copy. */
function validateBufferPolicy(v: unknown, token: string): BufferPolicy {
  const keys = ['accepted', 'maxWei', 'minWei', 'refund'];
  const p = record(v, 'bufferPolicy', keys, keys);
  const accepted = p['accepted'];
  if (typeof accepted !== 'boolean') return fail('bufferPolicy.accepted');
  const maxWei = wei(p['maxWei'], 'bufferPolicy.maxWei');
  const minWei = wei(p['minWei'], 'bufferPolicy.minWei');
  if (p['refund'] !== 'none') return fail('bufferPolicy.refund');
  if (!accepted) {
    if (maxWei !== 0n) fail('bufferPolicy.maxWei');
    if (minWei !== 0n) fail('bufferPolicy.minWei');
  } else {
    if (token === 'native') fail('bufferPolicy.accepted');
    if (minWei < 1n || minWei > maxWei) fail('bufferPolicy.minWei');
  }
  return { accepted, maxWei: maxWei.toString(), minWei: minWei.toString(), refund: 'none' };
}

/** @internal Resolve the injected or global CSPRNG. */
export function resolveRng(rng?: RandomSource): RandomSource {
  const r = rng ?? (globalThis as { crypto?: RandomSource }).crypto;
  if (r === undefined || typeof r.getRandomValues !== 'function') throw new RandomnessError();
  return r;
}

/** @internal Fresh random bytes from the CSPRNG. */
export function randomBytes(length: number, rng?: RandomSource): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(length);
  resolveRng(rng).getRandomValues(out);
  return out;
}

/**
 * Creates a validated v1 invoice with a fresh 128-bit random nonce.
 *
 * @remarks Fills `v` (1, or 2 when `bufferPolicy` is given), `schemeId: 1` and `nonce` (16 bytes from
 * `crypto.getRandomValues`, lowercase hex) and validates the result. The
 * invoice is unsigned; call {@link signInvoice}.
 *
 * @param input All other invoice fields.
 * @param rng Production callers omit this.
 * @returns Validated invoice.
 * @throws {SchemaError} If any field is invalid; {@link RandomnessError} without a CSPRNG.
 * @security The nonce is public in the link. Single-use is enforced client-side only (ADR-0003).
 * @testVector invoice-v1-sample
 */
export function createInvoice(input: NewInvoice, rng?: RandomSource): Invoice {
  const nonce = bytesToHex(randomBytes(16, rng));
  return validateInvoice({ ...input, v: input.bufferPolicy === undefined ? 1 : 2, schemeId: 1, nonce });
}
