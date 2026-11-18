import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { SigningError } from './errors.js';
import { canonicalize, parseStrictJson } from './json.js';
import { signerPublicKeyHex } from './sign.js';

/** Domain separation prefix for merchant profile signatures (ADR-0002 invoice-signing key, distinct domain). */
export const MERCHANT_PROFILE_DOMAIN = 'GhostPay.MerchantProfile.v1\0';
/** Maximum profile size in UTF-8 bytes (spec 14). */
export const MAX_PROFILE_BYTES = 8192;

export interface MerchantTemplate {
  readonly id: string;
  readonly amountMinor: string;
  readonly currency: string;
  readonly expires: number;
}

/** Unsigned merchant profile body. */
export interface MerchantProfileBody {
  readonly v: 1;
  readonly merchantId: string;
  readonly name: string;
  readonly signer: string;
  readonly chains: readonly number[];
  readonly tokens: readonly string[];
  readonly templates: readonly MerchantTemplate[];
  readonly origins: readonly string[];
  readonly allowAmount?: boolean;
  /** Unix seconds after which the profile must be rejected. */
  readonly exp: number;
}

export interface MerchantProfile extends MerchantProfileBody {
  readonly sig: string;
}

export type ProfileResult =
  | { readonly ok: true; readonly profile: MerchantProfile }
  | { readonly ok: false; readonly reason: 'size' | 'format' | 'signature' | 'expired' };

const HEX_SIG = /^[0-9a-f]{128}$/;
const SIGNER = /^0[23][0-9a-f]{64}$/;
// eslint-disable-next-line no-control-regex
const FORBIDDEN = /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060\u2066-\u2069\ufeff\u{e0000}-\u{e007f}]/u;
const B32 = 'abcdefghijklmnopqrstuvwxyz234567';

/** merchantId: lowercase base32 (no padding) of the first 10 bytes of keccak256(compressed signer key). 16 chars. */
export function merchantIdFor(signerHex: string): string {
  const h = keccak_256(hexToBytes(signerHex)).subarray(0, 10);
  let bits = 0;
  let acc = 0;
  let out = '';
  for (const b of h) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(acc >>> (bits - 5)) & 31];
      bits -= 5;
    }
    acc &= 0xff;
  }
  return out;
}

function profileDigest(body: MerchantProfileBody): Uint8Array {
  return keccak_256(concatBytes(utf8ToBytes(MERCHANT_PROFILE_DOMAIN), utf8ToBytes(canonicalize(body))));
}

function isRec(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function exactKeys(o: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(o).every((k) => allowed.includes(k));
}

function int(v: unknown, lo: number, hi: number): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= lo && v <= hi;
}

function str(v: unknown, re: RegExp): v is string {
  return typeof v === 'string' && re.test(v);
}

/** Strict, closed-schema parse of body plus sig. Returns undefined on any violation. */
function parseShape(raw: unknown): MerchantProfile | undefined {
  if (!isRec(raw) || !exactKeys(raw, ['v', 'merchantId', 'name', 'signer', 'chains', 'tokens', 'templates', 'origins', 'allowAmount', 'exp', 'sig'])) return undefined;
  const { v, merchantId, name, signer, chains, tokens, templates, origins, allowAmount, exp, sig } = raw;
  if (v !== 1 || !str(sig, HEX_SIG) || !str(signer, SIGNER) || !int(exp, 1, 4_102_444_800)) return undefined;
  if (typeof merchantId !== 'string' || merchantId !== merchantIdFor(signer)) return undefined;
  if (typeof name !== 'string' || name.length < 1 || name.length > 64 || FORBIDDEN.test(name) || name !== name.normalize('NFC') || name !== name.trim()) return undefined;
  if (!Array.isArray(chains) || chains.length < 1 || chains.length > 8 || !chains.every((c) => int(c, 1, 2 ** 32 - 1))) return undefined;
  if (!Array.isArray(tokens) || tokens.length < 1 || tokens.length > 8 || !tokens.every((t) => str(t, /^[A-Z0-9]{2,12}$/))) return undefined;
  if (allowAmount !== undefined && typeof allowAmount !== 'boolean') return undefined;
  if (!Array.isArray(templates) || templates.length > 16) return undefined;
  const ids = new Set<string>();
  const tpls: MerchantTemplate[] = [];
  for (const t of templates) {
    if (!isRec(t) || !exactKeys(t, ['id', 'amountMinor', 'currency', 'expires'])) return undefined;
    if (!str(t.id, /^[a-z0-9_-]{1,32}$/) || ids.has(t.id) || !str(t.amountMinor, /^[1-9][0-9]{0,38}$/) || !str(t.currency, /^[A-Z]{3}$/) || !int(t.expires, 60, 604_800)) return undefined;
    ids.add(t.id);
    tpls.push({ id: t.id, amountMinor: t.amountMinor, currency: t.currency, expires: t.expires });
  }
  if (!Array.isArray(origins) || origins.length < 1 || origins.length > 8) return undefined;
  const orgs: string[] = [];
  for (const o of origins) {
    if (typeof o !== 'string' || o.length > 200) return undefined;
    let u: URL;
    try {
      u = new URL(o);
    } catch {
      return undefined;
    }
    const localhost = u.protocol === 'http:' && u.hostname === 'localhost';
    if ((u.protocol !== 'https:' && !localhost) || u.origin !== o || u.username !== '' || u.password !== '') return undefined;
    orgs.push(o);
  }
  return {
    v: 1,
    merchantId,
    name,
    signer,
    chains,
    tokens,
    templates: tpls,
    origins: orgs,
    ...(allowAmount === undefined ? {} : { allowAmount }),
    exp,
    sig,
  };
}

/**
 * Signs a merchant profile with the invoice-signing key.
 *
 * @throws {SigningError} If `body.signer` is not the public key of `signingKey`, or the body is malformed.
 * @security Integrity only. Merchant identity requires the payer to pin the signer fingerprint.
 */
export function signMerchantProfile(body: MerchantProfileBody, signingKey: Uint8Array): MerchantProfile {
  if (signerPublicKeyHex(signingKey) !== body.signer) throw new SigningError();
  const sig = bytesToHex(secp256k1.sign(profileDigest(body), signingKey, { prehash: false, lowS: true }));
  const out = parseShape({ ...body, sig });
  if (out === undefined) throw new SigningError();
  return out;
}

/**
 * Verifies a merchant profile (JSON text or parsed value): size cap, strict closed schema, low-s signature, expiry.
 * Never throws. A valid result means the holder of `signer` signed these exact fields; it does not identify the merchant.
 *
 * @param input JSON text (size-checked in UTF-8 bytes) or an already parsed object.
 * @param nowSec Current unix time in seconds.
 */
export function verifyMerchantProfile(input: unknown, nowSec: number): ProfileResult {
  let raw: unknown = input;
  if (typeof input === 'string') {
    if (utf8ToBytes(input).byteLength > MAX_PROFILE_BYTES) return { ok: false, reason: 'size' };
    try {
      raw = parseStrictJson(input);
    } catch {
      return { ok: false, reason: 'format' };
    }
  }
  let p: MerchantProfile | undefined;
  try {
    p = parseShape(raw);
  } catch {
    p = undefined;
  }
  if (p === undefined) return { ok: false, reason: 'format' };
  let valid: boolean;
  try {
    const { sig, ...body } = p;
    valid = secp256k1.verify(hexToBytes(sig), profileDigest(body), hexToBytes(p.signer), { prehash: false, lowS: true });
  } catch {
    return { ok: false, reason: 'signature' };
  }
  if (!valid) return { ok: false, reason: 'signature' };
  if (p.exp <= nowSec) return { ok: false, reason: 'expired' };
  return { ok: true, profile: p };
}
