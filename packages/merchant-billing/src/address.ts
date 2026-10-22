import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { BillingError } from './errors.js';

const META_RE = /^st:eth:0x([0-9a-f]{132})$/;
const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

/** EIP-55 checksum encoding of a 20-byte address given as 40 hex chars (any case). */
export function toChecksumAddress(addr: string): string {
  if (!ADDR_RE.test(addr)) throw new BillingError('META_ADDRESS', 'invalid address');
  const lower = addr.slice(2).toLowerCase();
  const hash = bytesToHex(keccak_256(utf8ToBytes(lower)));
  let out = '0x';
  for (let i = 0; i < 40; i++) {
    const c = lower[i] as string;
    out += parseInt(hash[i] as string, 16) >= 8 ? c.toUpperCase() : c;
  }
  return out;
}

/**
 * Strict EVM address check. ASCII only (non-ASCII and homoglyph look-alikes fail the
 * regex), and mixed-case input must carry a valid EIP-55 checksum. All-lowercase is
 * accepted only with `allowLowercase`; all-uppercase never.
 *
 * @returns Canonical EIP-55 address.
 * @throws {BillingError} `META_ADDRESS`.
 * @security Untrusted input; never echoed in errors.
 */
export function parseEvmAddress(s: unknown, allowLowercase = false): string {
  if (typeof s !== 'string' || !ADDR_RE.test(s)) throw new BillingError('META_ADDRESS', 'invalid address');
  const body = s.slice(2);
  const checksummed = toChecksumAddress(s);
  if (body === body.toLowerCase()) {
    if (!allowLowercase) throw new BillingError('META_ADDRESS', 'checksum required');
  } else if (checksummed !== s) throw new BillingError('META_ADDRESS', 'bad checksum');
  if (/^0x0{40}$/.test(s)) throw new BillingError('META_ADDRESS', 'zero address');
  return checksummed;
}

/**
 * Strict stealth meta-address check: canonical lowercase `st:eth:0x<spend33><view33>`,
 * both points on secp256k1 and distinct.
 *
 * @throws {BillingError} `META_ADDRESS`.
 */
export function parseMetaAddress(s: unknown): string {
  if (typeof s !== 'string') throw new BillingError('META_ADDRESS', 'invalid meta-address');
  const m = META_RE.exec(s);
  if (m === null) throw new BillingError('META_ADDRESS', 'invalid meta-address');
  const body = m[1] as string;
  const a = body.slice(0, 66);
  const b = body.slice(66);
  try {
    secp256k1.Point.fromHex(a);
    secp256k1.Point.fromHex(b);
  } catch {
    throw new BillingError('META_ADDRESS', 'invalid meta-address');
  }
  if (a === b) throw new BillingError('META_ADDRESS', 'invalid meta-address');
  return s;
}
