import { decodeMetaAddress, encodeMetaAddress } from '@ghostpay/core-crypto';
import { parseStrictJson } from '@ghostpay/invoice-schema';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { UserFacingError } from './errors';

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
const BAD = 'This is not a supported public seller config.';
const KEYS = ['chainIds', 'check', 'format', 'metaAddress', 'signerPublicKey', 'v'].join('|');
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

function bad(): never { throw new UserFacingError(BAD); }
function chains(value: unknown): readonly number[] {
  if (!Array.isArray(value) || value.length > MAX_PAIRING_CHAINS) return bad();
  const ids = value as unknown[];
  for (const id of ids) if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1 || id > 2 ** 32 - 1) return bad();
  return [...new Set(ids as number[])].sort((a, b) => a - b);
}
function metaOf(value: unknown): string {
  if (typeof value !== 'string' || value.length !== 141) return bad();
  try {
    const canonical = encodeMetaAddress(decodeMetaAddress(value));
    return canonical === value ? canonical : bad();
  } catch { return bad(); }
}
function checkOf(c: SellerPairingConfig): string {
  const canonical = JSON.stringify([SELLER_PAIRING_FORMAT, SELLER_PAIRING_VERSION, c.metaAddress, c.signerPublicKey, c.chainIds]);
  return bytesToHex(sha256(utf8ToBytes(canonical))).slice(0, 8);
}
function validate(meta: unknown, signer: unknown, ids: unknown): SellerPairingConfig {
  if (typeof signer !== 'string' || !SIGNER.test(signer)) return bad();
  return { metaAddress: metaOf(meta), signerPublicKey: signer, chainIds: chains(ids) };
}

export function exportSellerPairing(source: SellerPairingSource, chainIds: readonly number[]): string {
  const c = validate(source.metaAddress, source.signerPublicKey, chainIds);
  return JSON.stringify({ format: SELLER_PAIRING_FORMAT, v: SELLER_PAIRING_VERSION, metaAddress: c.metaAddress, signerPublicKey: c.signerPublicKey, chainIds: c.chainIds, check: checkOf(c) });
}

export function parseSellerPairing(text: string): SellerPairingConfig {
  if (text.length > MAX_SELLER_PAIRING_BYTES || new TextEncoder().encode(text).byteLength > MAX_SELLER_PAIRING_BYTES) return bad();
  let parsed: unknown;
  try { parsed = parseStrictJson(text.trim()); } catch { return bad(); }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed) || Object.keys(parsed).sort().join('|') !== KEYS) return bad();
  const o = parsed as Record<string, unknown>;
  if (o['format'] !== SELLER_PAIRING_FORMAT || o['v'] !== SELLER_PAIRING_VERSION) return bad();
  const c = validate(o['metaAddress'], o['signerPublicKey'], o['chainIds']);
  if (o['check'] !== checkOf(c)) return bad();
  return c;
}

export function compareToLoaded(c: SellerPairingConfig, loaded: SellerPairingSource | undefined): 'same' | 'different' | 'none' {
  if (loaded === undefined) return 'none';
  return loaded.metaAddress === c.metaAddress && loaded.signerPublicKey === c.signerPublicKey ? 'same' : 'different';
}
