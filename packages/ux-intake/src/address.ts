import { err, ok, type Result } from './result.js';

/** Address families this package recognises. Chain-specific validation stays with the chain adapters. */
export type AddressFamily = 'evm' | 'bech32';

/** A syntactically valid address. */
export interface AddressInfo {
  readonly family: AddressFamily;
  /** Lowercase canonical form. */
  readonly canonical: string;
  /** EVM only: the input had mixed case, but the EIP-55 checksum was NOT verified (no keccak here). */
  readonly checksumUnverified: boolean;
}

export type AddressErrorCode = 'bad-address';

const EVM_RE = /^0x[0-9a-fA-F]{40}$/;
const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3] as const;
const BECH32_CONST = 1;
const BECH32M_CONST = 0x2bc830a3;
const HRP_ALLOW: readonly string[] = ['bc', 'tb', 'bcrt', 'sp', 'tsp'];
const SP_HRPS: readonly string[] = ['sp', 'tsp'];

function polymod(values: readonly number[]): number {
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if (((top >>> i) & 1) === 1) chk ^= GEN[i] as number;
  }
  return chk;
}

function hrpExpand(hrp: string): number[] {
  const codes = [...hrp].map((c) => c.charCodeAt(0));
  return [...codes.map((c) => c >>> 5), 0, ...codes.map((c) => c & 31)];
}

function parseBech32(s: string): AddressInfo | null {
  if (s !== s.toLowerCase() && s !== s.toUpperCase()) return null; // mixed case forbidden by BIP173
  const lower = s.toLowerCase();
  const sep = lower.lastIndexOf('1');
  if (sep < 1) return null;
  const hrp = lower.slice(0, sep);
  if (!HRP_ALLOW.includes(hrp)) return null;
  const maxLen = SP_HRPS.includes(hrp) ? 130 : 90;
  if (lower.length < 14 || lower.length > maxLen) return null;
  const data: number[] = [];
  for (const ch of lower.slice(sep + 1)) {
    const v = CHARSET.indexOf(ch);
    if (v < 0) return null;
    data.push(v);
  }
  if (data.length < 6) return null;
  const pm = polymod([...hrpExpand(hrp), ...data]);
  if (pm !== BECH32_CONST && pm !== BECH32M_CONST) return null;
  return { family: 'bech32', canonical: lower, checksumUnverified: false };
}

/**
 * Validates a raw address string (EVM `0x` hex or checksummed bech32/bech32m with an allowlisted HRP).
 *
 * @remarks Rejects the all-zero EVM address (burn address). Bech32 checksum is verified
 * (BIP173/BIP350); EVM EIP-55 mixed-case checksum is NOT verified and is flagged instead.
 * @param s Candidate address (already whitespace-free).
 * @security Syntax only. Never proves that the recipient is who the user thinks; show the full address.
 */
export function validateAddress(s: string): Result<AddressInfo, AddressErrorCode> {
  if (EVM_RE.test(s)) {
    const body = s.slice(2);
    if (/^0+$/.test(body)) return err('bad-address');
    const mixed = body !== body.toLowerCase() && body !== body.toUpperCase();
    return ok({ family: 'evm', canonical: `0x${body.toLowerCase()}`, checksumUnverified: mixed });
  }
  const b = parseBech32(s);
  return b === null ? err('bad-address') : ok(b);
}
