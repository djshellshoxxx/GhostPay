import { BlockList, isIP } from 'node:net';
import { ConfigError } from './secrets.js';

/** Upper bound on `X-Forwarded-For` entries inspected (the header itself is capped by the header size limit). */
const MAX_XFF_ENTRIES = 32;

/** Strips an IPv6 zone id and unwraps IPv4-mapped IPv6 (`::ffff:1.2.3.4`). Returns `undefined` for non-IPs. */
export function normalizeIp(raw: string): string | undefined {
  let ip = raw.trim();
  if (ip.startsWith('[') && ip.endsWith(']')) ip = ip.slice(1, -1);
  const zone = ip.indexOf('%');
  if (zone >= 0) ip = ip.slice(0, zone);
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (mapped?.[1] !== undefined) ip = mapped[1];
  return isIP(ip) === 0 ? undefined : ip.toLowerCase();
}

/** Expands an IPv6 address into its 8 hextet values. */
function hextets(ip: string): number[] {
  let v6 = ip;
  const tail = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(v6);
  if (tail?.[1] !== undefined) {
    const o = tail[1].split('.').map(Number);
    const hi = (((o[0] ?? 0) << 8) | (o[1] ?? 0)).toString(16);
    const lo = (((o[2] ?? 0) << 8) | (o[3] ?? 0)).toString(16);
    v6 = `${v6.slice(0, v6.length - tail[1].length)}${hi}:${lo}`;
  }
  const [head = '', rest] = v6.split('::');
  const a = head === '' ? [] : head.split(':');
  const b = rest === undefined ? [] : rest === '' ? [] : rest.split(':');
  const fill = rest === undefined ? [] : new Array<string>(8 - a.length - b.length).fill('0');
  return [...a, ...fill, ...b].map((h) => parseInt(h, 16));
}

/**
 * Rate-limit bucket identity of a client address: IPv4 as-is, IPv6 collapsed to its /64 so one
 * subscriber cannot mint 2^64 buckets.
 *
 * @param raw Textual address (any form).
 * @returns Canonical bucket string, or `unknown` for something that is not an IP.
 */
export function bucketIp(raw: string): string {
  const ip = normalizeIp(raw);
  if (ip === undefined) return 'unknown';
  if (isIP(ip) === 4) return ip;
  return `${hextets(ip).slice(0, 4).map((h) => h.toString(16)).join(':')}::/64`;
}

/** An explicit list of reverse-proxy networks whose `X-Forwarded-For` may be honoured. */
export class TrustedProxies {
  private readonly list = new BlockList();
  public readonly size: number;

  /**
   * @param cidrs `a.b.c.d/len` or `v6::/len` entries (or a bare address for a single host).
   * @throws {ConfigError} on a malformed entry.
   */
  public constructor(cidrs: readonly string[]) {
    for (const c of cidrs) {
      const [addr = '', len, ...extra] = c.split('/');
      const ip = normalizeIp(addr);
      const fam = ip === undefined ? 0 : isIP(ip);
      const max = fam === 4 ? 32 : 128;
      const bits = len === undefined ? max : /^\d{1,3}$/.test(len) ? Number(len) : -1;
      if (ip === undefined || extra.length > 0 || bits < 0 || bits > max) throw new ConfigError('config trustProxy: invalid CIDR');
      this.list.addSubnet(ip, bits, fam === 4 ? 'ipv4' : 'ipv6');
    }
    this.size = cidrs.length;
  }

  /** @returns Whether `raw` lies inside one of the configured networks. */
  public contains(raw: string): boolean {
    const ip = normalizeIp(raw);
    if (ip === undefined) return false;
    return this.list.check(ip, isIP(ip) === 4 ? 'ipv4' : 'ipv6');
  }

  /**
   * Resolves the client address.
   *
   * @remarks `X-Forwarded-For` is honoured ONLY when the TCP peer is itself a configured proxy. The
   * list is then walked from the right, skipping further trusted proxies; the first untrusted entry is
   * the client. Anything left of it is attacker-controlled and ignored. A malformed entry stops the
   * walk and falls back to the last valid hop, never to a client-chosen value.
   *
   * @param peer Socket peer address.
   * @param xff Raw header value(s).
   * @returns Address text (not yet bucketed).
   */
  public resolve(peer: string | undefined, xff: string | string[] | undefined): string {
    const socketIp = peer ?? 'unknown';
    if (this.size === 0 || peer === undefined || !this.contains(peer)) return socketIp;
    const header = Array.isArray(xff) ? xff.join(',') : xff;
    if (header === undefined || header === '') return socketIp;
    const parts = header.split(',').slice(-MAX_XFF_ENTRIES);
    let candidate = socketIp;
    for (let i = parts.length - 1; i >= 0; i -= 1) {
      const ip = normalizeIp(parts[i] ?? '');
      if (ip === undefined) return candidate;
      candidate = ip;
      if (!this.contains(ip)) return ip;
    }
    return candidate;
  }
}
