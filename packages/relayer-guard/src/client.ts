import { cidrContains, parseCidr, parseIp, type Cidr, type ParsedIp } from './ip.js';
import { requireConfig } from './errors.js';

/** Set of trusted reverse-proxy networks (operator configuration). */
export class TrustedProxies {
  private readonly blocks: readonly Cidr[];

  /**
   * @param cidrs Proxy addresses or CIDR blocks, e.g. `["127.0.0.1", "10.0.0.0/8", "::1"]`. Empty =
   *   no proxy is trusted, so forwarding headers are always ignored.
   * @throws GuardError INVALID_ADDRESS for a malformed entry (fail at startup, not per request).
   */
  public constructor(cidrs: readonly string[]) {
    this.blocks = cidrs.map(parseCidr);
  }

  /** @returns Whether `ip` is a trusted proxy. */
  public has(ip: ParsedIp): boolean {
    return this.blocks.some((b) => cidrContains(b, ip));
  }
}

/** How {@link resolveClientIp} chose the address. */
export type ClientSource = 'socket' | 'forwarded';

/** Result of {@link resolveClientIp}. */
export interface ResolvedClient {
  readonly ip: ParsedIp;
  readonly source: ClientSource;
}

/** Inputs to {@link resolveClientIp}. */
export interface ResolveInput {
  /** `req.socket.remoteAddress` (may be undefined after the socket closed). */
  readonly peer: string | undefined;
  /** Every `X-Forwarded-For` header value in order (Node gives a joined string or an array). */
  readonly forwardedFor: string | readonly string[] | undefined;
  readonly trusted: TrustedProxies;
  /** Most entries examined from the right, default 16; bounds work on hostile headers. */
  readonly maxEntries?: number;
}

/**
 * Picks the client address for security decisions (rate limits, abuse budgets).
 *
 * Algorithm (trusted-proxy-list method, MDN "X-Forwarded-For", retrieved 2026-10-21): if the socket
 * peer is not a trusted proxy, the header is ignored and the peer is the client. Otherwise the
 * header list is walked from the rightmost entry, skipping trusted proxies; the first untrusted entry
 * is the client. If every examined entry is trusted, the leftmost examined entry is used. An
 * entry that is not a valid IP literal, met before an untrusted one, makes the chain unusable and the
 * function returns `null`.
 *
 * @returns The client, or `null` when the peer is missing/unparseable or the trusted chain is broken.
 * @security Fixes S3-07: a client that reaches the listener directly cannot choose its bucket with a
 *   forged header, and a wrong hop count cannot collapse everyone into the proxy's bucket. Callers
 *   must reject (HTTP 400) on `null` rather than fall back to a shared bucket.
 */
export function resolveClientIp(input: ResolveInput): ResolvedClient | null {
  const max = input.maxEntries ?? 16;
  requireConfig(Number.isInteger(max) && max >= 1 && max <= 256, 'maxEntries must be 1..256');
  const peer = input.peer === undefined ? null : parseIp(input.peer);
  if (peer === null) return null;
  if (!input.trusted.has(peer)) return { ip: peer, source: 'socket' };
  const raw = input.forwardedFor;
  const values = raw === undefined ? [] : typeof raw === 'string' ? [raw] : raw;
  const entries = values
    .flatMap((v) => v.split(','))
    .map((e) => e.trim())
    .filter((e) => e.length > 0);
  if (entries.length === 0) return { ip: peer, source: 'socket' };
  const examined = entries.slice(-max);
  let last: ParsedIp | null = null;
  for (let i = examined.length - 1; i >= 0; i--) {
    const ip = parseIp(examined[i] ?? '');
    if (ip === null) return null;
    if (!input.trusted.has(ip)) return { ip, source: 'forwarded' };
    last = ip;
  }
  return last === null ? null : { ip: last, source: 'forwarded' };
}
