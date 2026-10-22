import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from 'node:dns';
import { request as httpsRequest, type RequestOptions } from 'node:https';
import { BlockList, isIP } from 'node:net';
import { nullLogger, type Logger } from './log.js';
import { normalizeIp } from './clientip.js';
import { ConfigError } from './secrets.js';

/** Fixed alert kinds; the payload never carries request data. */
export type AlertKind = 'breaker_open' | 'low_balance' | 'loss_budget_exhausted' | 'daily_budget_exhausted' | 'mined_revert';

/** An operator alert. */
export interface AlertEvent {
  readonly kind: AlertKind;
  readonly chainId?: number;
}

/** Receives operator alerts; must never throw or block the request path. */
export interface AlertSink {
  send(event: AlertEvent): void;
}

/** Sink that drops everything. */
export const nullAlerts: AlertSink = { send: () => undefined };

const DENIED = new BlockList();
for (const [network, bits] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) DENIED.addSubnet(network, bits, 'ipv4');
for (const [network, bits] of [
  ['::', 128], ['::1', 128], ['64:ff9b::', 96], ['100::', 64], ['2001::', 32], ['2001:db8::', 32], ['2002::', 16],
  ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8],
] as const) DENIED.addSubnet(network, bits, 'ipv6');

/** Returns true only for public unicast IPs; IPv4-mapped IPv6 is checked as IPv4. */
export function isPublicIp(raw: string): boolean {
  const ip = normalizeIp(raw);
  return ip !== undefined && !DENIED.check(ip, isIP(ip) === 4 ? 'ipv4' : 'ipv6');
}

/** Static SSRF checks for an alert endpoint. DNS results are checked again at connection time. */
export function validateWebhookUrl(raw: string): URL {
  const bad = (why: string): never => { throw new ConfigError(`alerts.webhookUrl: ${why}`); };
  if (raw.length > 2048) return bad('too long');
  let url: URL;
  try { url = new URL(raw); } catch { return bad('not a URL'); }
  if (url.protocol !== 'https:') return bad('must be https');
  if (url.username !== '' || url.password !== '') return bad('credentials are not allowed');
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  const literal = host.startsWith('[') ? host.slice(1, -1) : host;
  if (isIP(literal) !== 0 || /^[0-9.]+$/.test(literal) || /^0x/i.test(literal)) {
    if (isIP(literal) === 0 || !isPublicIp(literal)) return bad('host must not be private, loopback, or malformed');
    return url;
  }
  if (!host.includes('.') || ['.localhost', '.local', '.internal', '.lan', '.home.arpa', '.intranet', '.corp', '.private'].some((s) => host.endsWith(s))) {
    return bad('host must be a public DNS name');
  }
  return url;
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;
type LookupFn = (hostname: string, options: LookupOptions, cb: (err: NodeJS.ErrnoException | null, addrs: LookupAddress[]) => void) => void;

/** `https.request` lookup that rejects any private or otherwise non-public DNS answer. */
export function publicOnlyLookup(resolver: LookupFn = dnsLookup as unknown as LookupFn) {
  return (hostname: string, options: LookupOptions, cb: LookupCallback): void => {
    resolver(hostname, { all: true, ...(options.family === undefined ? {} : { family: options.family }) }, (err, addresses) => {
      if (err !== null) return cb(err, '');
      const first = addresses[0];
      if (first === undefined || addresses.some(({ address }) => !isPublicIp(address))) {
        const denied = new Error('webhook host resolved to a non-public address') as NodeJS.ErrnoException;
        denied.code = 'ENOTPUBLIC';
        return cb(denied, '');
      }
      return options.all === true ? cb(null, addresses) : cb(null, first.address, first.family);
    });
  };
}

function postPublicHttps(url: URL, body: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const req = httpsRequest(url, {
      method: 'POST', lookup: publicOnlyLookup(), agent: false, timeout: timeoutMs,
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), 'user-agent': 'ghostpay-relayer-alert' },
    } as RequestOptions, (res) => {
      res.resume();
      resolve((res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300);
    });
    req.once('timeout', () => req.destroy(new Error('timeout')));
    req.once('error', reject);
    req.end(body);
  });
}

/** Options of {@link createWebhookAlerts}. */
export interface WebhookAlertOptions {
  /** https URL (validated by the config loader). */
  readonly url: string;
  readonly logger?: Logger;
  /** Monotonic ms clock. */
  readonly now: () => number;
  /** Minimum gap between deliveries of the same kind and chain (default 60 s). */
  readonly minIntervalMs?: number;
  /** Replaces `fetch` (tests). */
  readonly fetchImpl?: typeof fetch;
  /** Delivery timeout (default 5 s). */
  readonly timeoutMs?: number;
}

/**
 * Posts alerts as `{"kind","chainId","text"}` JSON to a webhook (Slack/Discord/PagerDuty-compatible
 * `text` field). Fire-and-forget, de-duplicated per kind and chain, failure logged by class only.
 *
 * @param o Options.
 * @returns The sink.
 */
export function createWebhookAlerts(o: WebhookAlertOptions): AlertSink {
  const logger = o.logger ?? nullLogger;
  const gap = o.minIntervalMs ?? 60_000;
  const doFetch = o.fetchImpl ?? fetch;
  const url = validateWebhookUrl(o.url);
  const last = new Map<string, number>();
  return {
    send(e) {
      const key = `${e.kind}:${String(e.chainId ?? 0)}`;
      const t = o.now();
      const prev = last.get(key);
      if (prev !== undefined && t - prev < gap) return;
      last.set(key, t);
      const text = `ghostpay-relayer alert: ${e.kind}${e.chainId === undefined ? '' : ` chain ${String(e.chainId)}`}`;
      const body = JSON.stringify({ kind: e.kind, ...(e.chainId === undefined ? {} : { chainId: e.chainId }), text });
      const delivery = o.fetchImpl === undefined
        ? postPublicHttps(url, body, o.timeoutMs ?? 5000).then((ok) => ({ ok }))
        : doFetch(o.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        redirect: 'error',
        signal: AbortSignal.timeout(o.timeoutMs ?? 5000),
      });
      void delivery.then(
        (r) => {
          if (!r.ok) logger.log('warn', 'alert_delivery_failed', { errorClass: 'http_status' });
        },
        () => logger.log('warn', 'alert_delivery_failed', { errorClass: 'network' }),
      );
    },
  };
}
