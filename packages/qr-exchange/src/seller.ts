import { decodeMetaAddress, encodeMetaAddress, parseCompressedPoint } from '@ghostpay/core-crypto';
import { parseStrictJson } from '@ghostpay/invoice-schema';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { QrExchangeError } from './errors.js';

/**
 * Public seller pairing (device to device): meta-address, signing public key and preferred chain ids. Nothing here is
 * secret and nothing here is a key. `check` detects accidental corruption only; it is not authentication, so the owner
 * must still confirm a received config out of band. The encrypted keystore is a different, secret-bearing kind that is
 * never produced or accepted by this module.
 */
export const SELLER_PAIRING_FORMAT = 'ghostpay-seller-public';
export const SELLER_PAIRING_VERSION = 1;
export const MAX_SELLER_PAIRING_BYTES = 2048;
export const MAX_PAIRING_CHAINS = 16;
export class PublicSellerError extends TypeError {
  public readonly code = 'INVALID_PUBLIC_SELLER';
  public constructor() { super('This is not a supported public seller config.'); this.name = 'PublicSellerError'; }
}
const KEYS = 'chainIds|check|format|metaAddress|signerPublicKey|v';
const SIGNER = /^0[23][0-9a-f]{64}$/;
export interface SellerPairingConfig {
  readonly metaAddress: string;
  readonly signerPublicKey: string;
  readonly chainIds: readonly number[];
}
export interface SellerPairingSource {
  readonly metaAddress: string;
  readonly signerPublicKey: string;
}

function bad(): never { throw new PublicSellerError(); }
/** `normalize` (export) sorts and de-duplicates; import requires the list already strictly ascending. */
function chains(value: unknown, normalize: boolean, allowedChainIds: readonly number[]): readonly number[] {
  if (!Array.isArray(value) || value.length > MAX_PAIRING_CHAINS) return bad();
  const ids = value as unknown[];
  for (const id of ids) if (typeof id !== 'number' || !Number.isSafeInteger(id) || !allowedChainIds.includes(id)) return bad();
  const numbers = ids as number[];
  if (normalize) return [...new Set(numbers)].sort((a, b) => a - b);
  for (let i = 1; i < numbers.length; i += 1) if (numbers[i - 1]! >= numbers[i]!) return bad();
  return numbers;
}
function metaOf(value: unknown): { readonly meta: string; readonly spend: string; readonly view: string } {
  if (typeof value !== 'string' || value.length !== 141) return bad();
  let decoded: ReturnType<typeof decodeMetaAddress>;
  try {
    decoded = decodeMetaAddress(value);
    if (encodeMetaAddress(decoded) !== value) return bad();
  } catch { return bad(); }
  return { meta: value, spend: bytesToHex(decoded.spendingPublicKey), view: bytesToHex(decoded.viewingPublicKey) };
}
function checkOf(c: SellerPairingConfig): string {
  const canonical = JSON.stringify([SELLER_PAIRING_FORMAT, SELLER_PAIRING_VERSION, c.metaAddress, c.signerPublicKey, c.chainIds]);
  return bytesToHex(sha256(utf8ToBytes(canonical))).slice(0, 8);
}
function validate(meta: unknown, signer: unknown, ids: unknown, normalize: boolean, allowedChainIds: readonly number[]): SellerPairingConfig {
  if (typeof signer !== 'string' || !SIGNER.test(signer)) return bad();
  try { parseCompressedPoint(hexToBytes(signer)); } catch { return bad(); }
  const m = metaOf(meta);
  // The invoice-signing key must be separate from the payment keys (key separation).
  if (signer === m.spend || signer === m.view) return bad();
  return { metaAddress: m.meta, signerPublicKey: signer, chainIds: chains(ids, normalize, allowedChainIds) };
}

export function exportSellerPairing(source: SellerPairingSource, chainIds: readonly number[], allowedChainIds: readonly number[]): string {
  const c = validate(source.metaAddress, source.signerPublicKey, chainIds, true, allowedChainIds);
  return JSON.stringify({ format: SELLER_PAIRING_FORMAT, v: SELLER_PAIRING_VERSION, metaAddress: c.metaAddress, signerPublicKey: c.signerPublicKey, chainIds: c.chainIds, check: checkOf(c) });
}

export function parseSellerPairing(text: string, allowedChainIds: readonly number[]): SellerPairingConfig {
  if (text.length > MAX_SELLER_PAIRING_BYTES || new TextEncoder().encode(text).byteLength > MAX_SELLER_PAIRING_BYTES) return bad();
  let parsed: unknown;
  try { parsed = parseStrictJson(text.trim()); } catch { return bad(); }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed) || Object.keys(parsed).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).join('|') !== KEYS) return bad();
  const o = parsed as Record<string, unknown>;
  if (o['format'] !== SELLER_PAIRING_FORMAT || o['v'] !== SELLER_PAIRING_VERSION) return bad();
  const c = validate(o['metaAddress'], o['signerPublicKey'], o['chainIds'], false, allowedChainIds);
  if (o['check'] !== checkOf(c)) return bad();
  return c;
}

export function compareToLoaded(c: SellerPairingConfig, loaded: SellerPairingSource | undefined): 'same' | 'different' | 'none' {
  if (loaded === undefined) return 'none';
  return loaded.metaAddress === c.metaAddress && loaded.signerPublicKey === c.signerPublicKey ? 'same' : 'different';
}


/** Only public scheme-1 keys. This parser never performs a registry action or accepts arbitrary URLs. */
export function parsePublicMetaQr(text: string): string {
  const bad = (): never => { throw new QrExchangeError('BAD_INPUT'); };
  if (text.length > 1024 || new TextEncoder().encode(text).byteLength > 1024) return bad();
  let candidate: unknown = text.trim();
  try {
    if ((candidate as string).startsWith('{')) {
      const value = parseStrictJson(candidate as string);
      if (typeof value !== 'object' || value === null || Array.isArray(value) || Object.keys(value).sort().join('|') !== 'format|metaAddress|v') return bad();
      const object = value as Record<string, unknown>;
      if (object['format'] !== 'ghostpay-public-meta' || object['v'] !== 1) return bad();
      candidate = object['metaAddress'];
    }
    if (typeof candidate !== 'string' || candidate.length !== 141) return bad();
    return encodeMetaAddress(decodeMetaAddress(candidate));
  } catch { return bad(); }
}

