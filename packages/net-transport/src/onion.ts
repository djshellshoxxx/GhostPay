import { sha3_256 } from '@noble/hashes/sha3.js';
import { NetTransportError } from './errors.js';

const B32 = 'abcdefghijklmnopqrstuvwxyz234567';

/** Options for {@link validateOnionUrl}. */
export interface OnionUrlOptions {
  /** Permit `http:` (the `onion` profile only; the onion layer already authenticates the service). */
  readonly allowHttp?: boolean;
}

/** Decodes unpadded lowercase RFC 4648 base32. Returns null on any invalid character. */
function base32Decode(s: string): Uint8Array | null {
  let bits = 0;
  let acc = 0;
  const out: number[] = [];
  for (const ch of s) {
    const v = B32.indexOf(ch);
    if (v < 0) return null;
    acc = (acc << 5) | v;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

/**
 * Verifies a v3 onion service hostname: 56 lowercase base32 chars decoding to
 * `PUBKEY(32) | CHECKSUM(2) | VERSION(1)`, `VERSION = 3`,
 * `CHECKSUM = SHA3-256(".onion checksum" | PUBKEY | VERSION)[:2]`.
 *
 * @remarks The checksum construction is recalled from Tor's rend-spec and cross-checked in tests only
 * against well-known real addresses and locally generated ones. UNVERIFIED against the spec text
 * (spec.torproject.org was not reachable). A valid checksum proves the address is well-formed, NOT that
 * the service is the one the user intended or is online.
 * @param host Bare hostname including `.onion`.
 * @returns True when well-formed.
 */
export function isValidV3OnionHost(host: string): boolean {
  if (!/^[a-z2-7]{56}\.onion$/.test(host)) return false;
  const raw = base32Decode(host.slice(0, 56));
  if (raw === null || raw.length !== 35) return false;
  if (raw[34] !== 3) return false;
  const pub = raw.subarray(0, 32);
  const input = new Uint8Array(15 + 32 + 1);
  input.set(new TextEncoder().encode('.onion checksum'), 0);
  input.set(pub, 15);
  input[47] = 3;
  const sum = sha3_256(input);
  return sum[0] === raw[32] && sum[1] === raw[33];
}

/**
 * Validates an onion-service URL for the `onion` profile.
 *
 * @remarks Accepts `https:` always and `http:` only with `allowHttp`. Host must be a canonical
 * (lowercase) valid v3 address; v2 (16 chars), uppercase, userinfo and fragments are rejected. The
 * check is performed on the RAW string first because `URL` silently lower-cases hosts, which would
 * hide non-canonical input (NP-T-7).
 * @param raw URL string.
 * @param o Options.
 * @returns The normalized URL (no trailing path changes beyond `URL` normalization).
 * @throws {NetTransportError} `ONION_URL`; messages never echo the URL (NP-T-6).
 */
export function validateOnionUrl(raw: string, o: OnionUrlOptions = {}): string {
  const bad = (): never => {
    throw new NetTransportError('ONION_URL', 'not a valid v3 onion URL');
  };
  if (typeof raw !== 'string') return bad();
  const m = /^(https?):\/\/([^/?#]*)/.exec(raw);
  if (m === null) return bad();
  const authority = m[2] as string;
  if (authority.includes('@') || authority !== authority.toLowerCase()) return bad();
  if (m[1] === 'http' && o.allowHttp !== true) return bad();
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return bad();
  }
  if (u.username !== '' || u.password !== '' || u.hash !== '') return bad();
  if (!isValidV3OnionHost(u.hostname)) return bad();
  return u.toString();
}
