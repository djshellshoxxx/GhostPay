import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from 'node:dns';
import { request as httpsRequest, type RequestOptions } from 'node:https';
import { BlockList, isIP } from 'node:net';
import { normalizeIp } from './clientip.js';
import type { Logger } from './log.js';
import { ConfigError } from './secrets.js';

/** What happened. Fixed set; used as a metric label and a payload field. */
export type AlertKind = 'low_balance' | 'balance_warning' | 'error_rate';

/** An operator alert. Deliberately carries no address, amount, key, URL or user data. */
export interface Alert {
  readonly kind: AlertKind;
  readonly severity: 'warning' | 'critical';
  readonly chainId: number;
}

/** Receives alerts. Implementations must not throw and must not block the caller. */
export interface AlertSink {
  notify(alert: Alert): void;
}

/** Sink that drops everything (alerts not configured). */
export const nullAlertSink: AlertSink = { notify: () => undefined };

const DENIED = new BlockList();
for (const [net, bits] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) DENIED.addSubnet(net, bits, 'ipv4');
for (const [net, bits] of [
  ['::', 128], ['::1', 128], ['64:ff9b::', 96], ['100::', 64], ['2001::', 32], ['2001:db8::', 32], ['2002::', 16],
  ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8],
] as const) DENIED.addSubnet(net, bits, 'ipv6');

/**
 * @param raw IP text.
 * @returns True only for a routable public unicast address (private, loopback, link-local, CGNAT, multicast,
 * documentation, translation and 6to4 ranges are all refused; IPv4-mapped IPv6 is judged as its IPv4 form).
 */
export function isPublicIp(raw: string): boolean {
  const ip = normalizeIp(raw);
  if (ip === undefined) return false;
  return !DENIED.check(ip, isIP(ip) === 4 ? 'ipv4' : 'ipv6');
}

const FORBIDDEN_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home.arpa', '.intranet', '.corp', '.private'];

/**
 * Validates an alert webhook URL at startup (SSRF defence, part 1: static checks).
 *
 * @param raw URL text.
 * @returns Parsed URL.
 * @throws {ConfigError} unless it is https, credential-free, a multi-label public DNS name (or a public IP literal).
 */
export function validateWebhookUrl(raw: string): URL {
  const bad = (why: string): never => {
    throw new ConfigError(`alerts.webhookUrl: ${why}`);
  };
  if (raw.length > 2048) return bad('too long');
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return bad('not a URL');
  }
  if (u.protocol !== 'https:') return bad('must be https');
  if (u.username !== '' || u.password !== '') return bad('credentials in the URL are not allowed');
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  const literal = host.startsWith('[') ? host.slice(1, -1) : host;
  if (isIP(literal) !== 0 || /^[0-9.]+$/.test(literal) || /^0x/i.test(literal)) {
    if (isIP(literal) === 0 || !isPublicIp(literal)) return bad('host must not be a private, loopback or malformed address');
    return u;
  }
  if (!host.includes('.') || host === 'localhost' || FORBIDDEN_SUFFIXES.some((s) => host.endsWith(s))) {
    return bad('host must be a public DNS name');
  }
  return u;
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;
type LookupFn = (hostname: string, options: LookupOptions, cb: (err: NodeJS.ErrnoException | null, addrs: LookupAddress[]) => void) => void;

/**
 * DNS lookup that refuses to resolve to a non-public address (SSRF defence, part 2: checked at connect
 * time on the very addresses the socket will use, so DNS rebinding cannot swap in an internal target).
 *
 * @param resolver Underlying resolver (tests inject one).
 * @returns A `lookup` function for `https.request`.
 */
export function publicOnlyLookup(resolver: LookupFn = dnsLookup as unknown as LookupFn) {
  return (hostname: string, options: LookupOptions, cb: LookupCallback): void => {
    resolver(hostname, { all: true, ...(options.family === undefined ? {} : { family: options.family }) }, (err, addrs) => {
      if (err !== null) return cb(err, '');
      const first = addrs[0];
      if (first === undefined || addrs.some((a) => !isPublicIp(a.address))) {
        const e: NodeJS.ErrnoException = new Error('webhook host resolves to a non-public address');
        e.code = 'ENOTPUBLIC';
        return cb(e, '');
      }
      return options.all === true ? cb(null, addrs) : cb(null, first.address, first.family);
    });
  };
}

/** Posts a JSON body and resolves with the HTTP status. */
export type Poster = (url: URL, body: string) => Promise<number>;

/**
 * HTTPS POST with a hard timeout, no redirects, no cookies/credentials and connect-time address checks.
 *
 * @param opts Timeout and test seams.
 * @returns A {@link Poster}.
 */
export function createHttpsPoster(opts: { timeoutMs: number; requestImpl?: typeof httpsRequest; lookup?: RequestOptions['lookup'] }): Poster {
  const doRequest = opts.requestImpl ?? httpsRequest;
  const lookup = opts.lookup ?? publicOnlyLookup();
  return (url, body) =>
    new Promise<number>((resolve, reject) => {
      const req = doRequest(
        url,
        {
          method: 'POST',
          lookup,
          agent: false,
          timeout: opts.timeoutMs,
          headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), 'user-agent': 'ghostpay-relayer-alert' },
        },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        },
      );
      req.once('timeout', () => {
        req.destroy(new Error('timeout'));
      });
      req.once('error', reject);
      req.end(body);
    });
}

/** Options of {@link WebhookAlertSink}. */
export interface WebhookOptions {
  /** Minimum gap between two deliveries of the same kind and chain. */
  readonly cooldownMs: number;
  readonly now: () => number;
  readonly post: Poster;
  readonly logger: Logger;
}

/**
 * Delivers alerts to an operator-controlled https endpoint (Slack-compatible incoming webhooks, ntfy,
 * a pager gateway, ...). Payload: `{"source":"ghostpay-relayer","kind","severity","chainId","at"}`: nothing
 * secret and nothing about users. Delivery is fire-and-forget, throttled and failures are logged by class only.
 */
export class WebhookAlertSink implements AlertSink {
  private readonly last = new Map<string, number>();

  public constructor(
    private readonly url: URL,
    private readonly o: WebhookOptions,
  ) {}

  public notify(a: Alert): void {
    const key = `${a.kind}:${String(a.chainId)}`;
    const t = this.o.now();
    const prev = this.last.get(key);
    if (prev !== undefined && t - prev < this.o.cooldownMs) return;
    this.last.set(key, t);
    const body = JSON.stringify({
      source: 'ghostpay-relayer',
      kind: a.kind,
      severity: a.severity,
      chainId: a.chainId,
      at: new Date(t).toISOString(),
    });
    this.o.post(this.url, body).then(
      (status) => {
        if (status < 200 || status >= 300) this.o.logger.log('warn', 'alert_delivery_failed', { errorClass: 'webhook_status' });
      },
      () => {
        this.o.logger.log('warn', 'alert_delivery_failed', { errorClass: 'webhook_error' });
      },
    );
  }
}
