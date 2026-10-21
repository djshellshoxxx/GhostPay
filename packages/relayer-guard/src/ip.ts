import { isIPv4, isIPv6 } from 'node:net';
import { GuardError, requireConfig } from './errors.js';

/** A parsed IP address. IPv4-mapped IPv6 (`::ffff:a.b.c.d`) is normalised to family 4. */
export interface ParsedIp {
  readonly family: 4 | 6;
  /** 4 or 16 network-order bytes. */
  readonly bytes: Uint8Array;
}

const MAX_TEXT = 64;

function parseV4(s: string): Uint8Array {
  return Uint8Array.from(s.split('.').map(Number));
}

/** Expands an IPv6 literal already accepted by `net.isIPv6` (lower-case, no zone id). */
function parseV6(s: string): Uint8Array {
  let text = s;
  const embedded: number[] = [];
  if (text.includes('.')) {
    const i = text.lastIndexOf(':');
    const v4 = parseV4(text.slice(i + 1));
    embedded.push(((v4[0] ?? 0) << 8) | (v4[1] ?? 0), ((v4[2] ?? 0) << 8) | (v4[3] ?? 0));
    text = text.slice(0, i + 1);
    if (!text.endsWith('::')) text = text.slice(0, -1);
  }
  const halves = text.split('::');
  const hex = (part: string | undefined): number[] =>
    part === undefined || part === '' ? [] : part.split(':').map((g) => parseInt(g, 16));
  const head = hex(halves[0]);
  const back = [...hex(halves[1]), ...embedded];
  const zeros = halves.length === 2 ? 8 - head.length - back.length : 0;
  const all = [...head, ...new Array<number>(zeros).fill(0), ...back];
  const out = new Uint8Array(16);
  all.forEach((g, i) => {
    out[i * 2] = (g >> 8) & 0xff;
    out[i * 2 + 1] = g & 0xff;
  });
  return out;
}

/**
 * Parses an IPv4 or IPv6 literal (no zone id, no brackets, no port).
 *
 * @param text Untrusted text, for example one `X-Forwarded-For` entry.
 * @returns The address, or `null` if `text` is not a valid literal.
 * @security Validation is delegated to Node's `net.isIPv4`/`isIPv6`; anything they reject (including
 *   zone ids `fe80::1%eth0`, which Node accepts, are rejected here explicitly) yields `null`.
 */
export function parseIp(text: string): ParsedIp | null {
  if (text.length === 0 || text.length > MAX_TEXT || text.includes('%')) return null;
  if (isIPv4(text)) return { family: 4, bytes: parseV4(text) };
  if (!isIPv6(text)) return null;
  const b = parseV6(text.toLowerCase());
  const mapped = b.subarray(0, 10).every((x) => x === 0) && b[10] === 0xff && b[11] === 0xff;
  if (mapped) return { family: 4, bytes: b.slice(12) };
  return { family: 6, bytes: b };
}

/** A parsed CIDR block. */
export interface Cidr {
  readonly family: 4 | 6;
  readonly bytes: Uint8Array;
  readonly prefix: number;
}

/**
 * Parses `addr/prefix` (or a bare address = full-length prefix).
 *
 * @param text Operator configuration.
 * @throws GuardError INVALID_ADDRESS on malformed input.
 */
export function parseCidr(text: string): Cidr {
  const [addr, pfx, extra] = text.trim().split('/');
  const ip = parseIp(addr ?? '');
  const max = ip?.family === 4 ? 32 : 128;
  const prefix = pfx === undefined ? max : /^\d{1,3}$/.test(pfx) ? Number(pfx) : NaN;
  if (ip === null || extra !== undefined || !(prefix >= 0 && prefix <= max)) {
    throw new GuardError('INVALID_ADDRESS', 'invalid CIDR block');
  }
  return { family: ip.family, bytes: maskBytes(ip.bytes, prefix), prefix };
}

function maskBytes(bytes: Uint8Array, prefix: number): Uint8Array {
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    const bits = Math.max(0, Math.min(8, prefix - i * 8));
    out[i] = (bytes[i] ?? 0) & ((0xff << (8 - bits)) & 0xff);
  }
  return out;
}

/** @returns Whether `ip` lies inside `block`. */
export function cidrContains(block: Cidr, ip: ParsedIp): boolean {
  if (block.family !== ip.family) return false;
  const masked = maskBytes(ip.bytes, block.prefix);
  return masked.every((b, i) => b === block.bytes[i]);
}

function formatMasked(ip: ParsedIp, prefix: number): string {
  const m = maskBytes(ip.bytes, prefix);
  if (ip.family === 4) return `4:${Array.from(m).join('.')}/${prefix}`;
  const groups: string[] = [];
  for (let i = 0; i < 16; i += 2) groups.push((((m[i] ?? 0) << 8) | (m[i + 1] ?? 0)).toString(16));
  return `6:${groups.join(':')}/${prefix}`;
}

/** Prefix lengths used to aggregate addresses into rate-limit buckets. */
export interface BucketPrefixes {
  /** IPv4 prefix, 1..32 (default 32). */
  readonly v4?: number;
  /** IPv6 prefix, 1..128 (default 64: one end-site subnet, audit S3-07). */
  readonly v6?: number;
}

/**
 * Canonical rate-limit bucket key for an address: the masked network in a fixed textual form, so
 * every spelling of one address (and every address of one IPv6 /64) maps to the same key.
 *
 * @param ip Parsed address.
 * @param prefixes Aggregation prefixes.
 * @returns A key such as `4:203.0.113.7/32` or `6:2001:db8:0:0:0:0:0:0/64`.
 * @security The key is a raw network identifier: hash it with a rotating secret before storing it
 *   if the operator's privacy notice promises hashed IPs (the relayer's `KeyHasher` does this).
 */
export function bucketKey(ip: ParsedIp, prefixes: BucketPrefixes = {}): string {
  const v4 = prefixes.v4 ?? 32;
  const v6 = prefixes.v6 ?? 64;
  requireConfig(Number.isInteger(v4) && v4 >= 1 && v4 <= 32, 'v4 prefix must be 1..32');
  requireConfig(Number.isInteger(v6) && v6 >= 1 && v6 <= 128, 'v6 prefix must be 1..128');
  return formatMasked(ip, ip.family === 4 ? v4 : v6);
}
