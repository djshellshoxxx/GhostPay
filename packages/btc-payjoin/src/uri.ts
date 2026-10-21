import { bech32 } from '@scure/base';
import { fail } from './errors.js';
import { addressToScript, assertNetwork, type BtcNetwork } from './network.js';

/** A parsed or to-be-built `bitcoin:` PayJoin URI. */
export interface PayjoinUri {
  readonly address: string;
  readonly amountSats?: bigint;
  /** Endpoint (v1) or mailbox URL with fragment parameters (v2). */
  readonly pj: string;
  /** `false` encodes `pjos=0`: the sender MUST disallow output substitution. */
  readonly outputSubstitution: boolean;
  readonly network: BtcNetwork;
  readonly label?: string;
  readonly message?: string;
}

const MAX_URI = 2048;
const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

/** @internal sats to a BIP-21 decimal BTC string (8 decimals, trimmed). */
export function satsToBtc(sats: bigint): string {
  if (sats < 0n) fail('uri_invalid');
  const whole = sats / 100_000_000n;
  const frac = (sats % 100_000_000n).toString().padStart(8, '0').replace(/0+$/, '');
  return frac.length === 0 ? whole.toString() : `${whole.toString()}.${frac}`;
}

/** @internal BIP-21 decimal BTC string to sats. */
export function btcToSats(s: string): bigint {
  const m = /^(\d{1,8})(?:\.(\d{1,8}))?$/.exec(s);
  if (m === null) fail('uri_invalid');
  const whole = BigInt(m[1] as string);
  const frac = BigInt((m[2] ?? '').padEnd(8, '0') || '0');
  return whole * 100_000_000n + frac;
}

function isLoopback(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

/** Result of parsing a v2 fragment. */
export interface V2Fragment {
  readonly expirySeconds: number;
  readonly ohttpKeys: Uint8Array;
  readonly receiverKey: Uint8Array;
}

function decodeParam(value: string): Uint8Array {
  const lower = value.toLowerCase();
  const words: number[] = [];
  for (const c of lower) {
    const i = BECH32_CHARSET.indexOf(c);
    if (i < 0) fail('uri_invalid');
    words.push(i);
  }
  try {
    return bech32.fromWords(words);
  } catch {
    return fail('uri_invalid');
  }
}

/**
 * Parses the BIP-77 session fragment (`EX1..`, `OH1..`, `RK1..`).
 *
 * @remarks BPJ-URI-3. Accepts both `-` and legacy `+` separators and any
 * order (BIP-77 0.2.0: `+` accepted "until 2026"; rust-payjoin accepts both).
 * `EX` is the Bitcoin consensus encoding of a u32 UNIX time, i.e. little-endian
 * (rust-payjoin `time.rs`, retrieved 2026-10-21; BIP text does not state the
 * byte order). `OH` is a key id + 33-byte compressed key: the BIP text says a 2-byte id
 * (35 bytes) but its own example and rust-payjoin's vectors decode to 34 bytes
 * (1-byte id), so both lengths are accepted. `RK` is a 33-byte key.
 * The fragment must be uppercase (BIP-77 "Uppercase URL").
 */
export function parseV2Fragment(fragment: string): V2Fragment {
  if (fragment.length === 0 || fragment.length > 512) fail('uri_invalid');
  if (fragment !== fragment.toUpperCase()) fail('uri_invalid', 'fragment must be uppercase');
  const parts = fragment.split(/[-+]/);
  const found = new Map<string, Uint8Array>();
  for (const part of parts) {
    const m = /^(EX|OH|RK)1([A-Z0-9]+)$/.exec(part);
    if (m === null) fail('uri_invalid');
    const key = m[1] as string;
    if (found.has(key)) fail('uri_invalid');
    found.set(key, decodeParam(m[2] as string));
  }
  const ex = found.get('EX');
  const oh = found.get('OH');
  const rk = found.get('RK');
  if (ex === undefined || oh === undefined || rk === undefined) fail('uri_invalid');
  if (ex.length !== 4 || (oh.length !== 34 && oh.length !== 35) || rk.length !== 33) fail('uri_invalid');
  const expirySeconds = (ex[0] as number) + (ex[1] as number) * 2 ** 8 + (ex[2] as number) * 2 ** 16 + (ex[3] as number) * 2 ** 24;
  return { expirySeconds, ohttpKeys: oh, receiverKey: rk };
}

/** @internal Validate a `pj` URL per BPJ-URI-4; returns protocol version it implies. */
export function validatePjUrl(pj: string): 1 | 2 {
  let u: URL;
  try {
    u = new URL(pj);
  } catch {
    return fail('uri_invalid');
  }
  const host = u.hostname.toLowerCase();
  const secure = u.protocol === 'https:';
  const insecureOk = u.protocol === 'http:' && (host.endsWith('.onion') || isLoopback(u.host.replace(/:\d+$/, '')) || isLoopback(host));
  if (!secure && !insecureOk) fail('uri_invalid', 'pj must be https, onion http, or loopback');
  if (u.username !== '' || u.password !== '') fail('uri_invalid');
  if (u.hash.length > 1) {
    parseV2Fragment(u.hash.slice(1));
    return 2;
  }
  return 1;
}

/**
 * Builds a `bitcoin:<addr>?amount=..&pj=..[&pjos=0]` URI (BPJ-URI-1).
 *
 * @remarks For v2 (fragment present) `pj` is uppercased, `#` is emitted as
 * `%23`, and `pj` is placed last (BIP-77 "Uppercase URL" and "Parameter
 * Ordering"). Fragment parameters are re-emitted in ascending lexicographic
 * order (`EX`, `OH`, `RK`) separated by `-`, which is what the BIP's example
 * and rust-payjoin's `set_param` produce.
 * @security BPJ-GEN-1: refuses mainnet. BPJ-URI-4: refuses insecure `pj`.
 * @throws {PayjoinError}
 */
export function buildPayjoinUri(p: PayjoinUri): string {
  assertNetwork(p.network);
  addressToScript(p.address, p.network);
  const hashAt = p.pj.indexOf('#');
  const pjNorm = hashAt < 0 ? p.pj : p.pj.slice(0, hashAt) + p.pj.slice(hashAt).toUpperCase();
  const version = validatePjUrl(pjNorm);
  const parts: string[] = [];
  if (p.amountSats !== undefined) parts.push(`amount=${satsToBtc(p.amountSats)}`);
  if (p.label !== undefined) parts.push(`label=${encodeURIComponent(p.label)}`);
  if (p.message !== undefined) parts.push(`message=${encodeURIComponent(p.message)}`);
  if (!p.outputSubstitution) parts.push('pjos=0');
  if (version === 2) {
    const u = new URL(pjNorm);
    const map = new Map<string, string>();
    for (const part of u.hash.slice(1).split(/[-+]/)) map.set(part.slice(0, 2), part);
    const ordered = [...map.keys()].sort().map((k) => map.get(k) as string).join('-');
    const base = `${u.protocol}//${u.host}${u.pathname}`.toUpperCase();
    parts.push(`pj=${base}%23${ordered}`);
  } else {
    parts.push(`pj=${encodeURIComponent(pjNorm)}`);
  }
  const uri = `bitcoin:${p.address}?${parts.join('&')}`;
  if (uri.length > MAX_URI) fail('uri_invalid');
  return uri;
}

/**
 * Parses a PayJoin URI.
 *
 * @security BPJ-URI-2: a URI carrying both `sp` and `pj` is rejected with
 * `uri_conflict` (PayJoin and BIP-352 are mutually exclusive per transaction).
 * BPJ-URI-3: a v2 fragment whose `EX` is in the past is `session_expired`
 * when `nowSeconds` is given.
 * @param nowSeconds Injected clock (BPJ-GEN-4); omit to skip the expiry check.
 * @throws {PayjoinError}
 */
export function parsePayjoinUri(uri: string, network: BtcNetwork, nowSeconds?: number): PayjoinUri {
  assertNetwork(network);
  if (typeof uri !== 'string' || uri.length === 0 || uri.length > MAX_URI) fail('uri_invalid');
  const m = /^bitcoin:([^?]+)(?:\?(.*))?$/i.exec(uri);
  if (m === null) fail('uri_invalid');
  const address = m[1] as string;
  addressToScript(address, network);
  const seen = new Map<string, string>();
  for (const kv of (m[2] ?? '').split('&')) {
    if (kv.length === 0) continue;
    const eq = kv.indexOf('=');
    if (eq <= 0) fail('uri_invalid');
    let k: string;
    let v: string;
    try {
      k = decodeURIComponent(kv.slice(0, eq)).toLowerCase();
      v = decodeURIComponent(kv.slice(eq + 1));
    } catch {
      return fail('uri_invalid');
    }
    if (seen.has(k)) fail('uri_invalid', 'duplicate parameter');
    seen.set(k, v);
  }
  const hasPj = seen.has('pj') || seen.has('req-pj');
  if (seen.has('sp') && hasPj) fail('uri_conflict');
  const pj = seen.get('pj') ?? seen.get('req-pj');
  if (pj === undefined) fail('uri_invalid', 'no pj parameter');
  for (const k of seen.keys()) {
    if (k.startsWith('req-') && k !== 'req-pj') fail('uri_invalid', 'unsupported required parameter');
  }
  const version = validatePjUrl(pj);
  if (version === 2 && nowSeconds !== undefined) {
    const f = parseV2Fragment(new URL(pj).hash.slice(1));
    if (f.expirySeconds <= nowSeconds) fail('session_expired');
  }
  const pjos = seen.get('pjos');
  if (pjos !== undefined && pjos !== '0' && pjos !== '1') fail('uri_invalid');
  const amount = seen.get('amount');
  return {
    address,
    ...(amount !== undefined ? { amountSats: btcToSats(amount) } : {}),
    pj,
    outputSubstitution: pjos !== '0',
    network,
    ...(seen.has('label') ? { label: seen.get('label') as string } : {}),
    ...(seen.has('message') ? { message: seen.get('message') as string } : {}),
  };
}
