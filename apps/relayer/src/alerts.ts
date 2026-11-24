import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from 'node:dns';
import { createHmac } from 'node:crypto';
import { request as httpsRequest, type RequestOptions } from 'node:https';
import { BlockList, isIP } from 'node:net';
import { nullLogger, type Logger } from './log.js';
import { normalizeIp } from './clientip.js';
import { ConfigError } from './secrets.js';

/** Fixed alert kinds; the payload never carries request data. */
export type AlertKind =
  | 'breaker_open'
  | 'low_balance'
  | 'loss_budget_exhausted'
  | 'daily_budget_exhausted'
  | 'mined_revert'
  | 'mined_revert_rate'
  | 'receipt_timeout'
  | 'quote_budget_exhausted'
  | 'state_write_failed'
  | 'reject_spike'
  | 'rpc_disagree'
  | 'price_stale';

/** An operator alert. */
export interface AlertEvent {
  readonly kind: AlertKind;
  readonly chainId?: number;
  readonly value?: number;
  readonly threshold?: number;
}

/** Receives operator alerts; must never throw or block the request path. */
export interface AlertSink {
  send(event: AlertEvent): void;
  /** Cancels pending best-effort delivery during runtime shutdown. */
  close?(): void;
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
export function validateWebhookUrl(raw: string, allowedHosts?: readonly string[]): URL {
  const bad = (why: string): never => { throw new ConfigError(`alerts.webhookUrl: ${why}`); };
  if (raw.length > 2048) return bad('too long');
  let url: URL;
  try { url = new URL(raw); } catch { return bad('not a URL'); }
  if (url.protocol !== 'https:') return bad('must be https');
  if (url.username !== '' || url.password !== '') return bad('credentials are not allowed');
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (allowedHosts !== undefined && !allowedHosts.map((item) => item.toLowerCase().replace(/\.$/, '')).includes(host)) return bad('host is not allowlisted');
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

interface DeliveryResult { readonly ok: boolean; readonly retryable: boolean }

function deliveryResult(status: number): DeliveryResult {
  return { ok: status >= 200 && status < 300, retryable: status === 429 || status >= 500 };
}

function postPublicHttps(url: URL, body: string, headers: Readonly<Record<string, string>>, signal: AbortSignal): Promise<DeliveryResult> {
  return new Promise((resolve, reject) => {
    const req = httpsRequest(url, {
      method: 'POST', lookup: publicOnlyLookup(), agent: false, signal,
      headers: { ...headers, 'content-length': Buffer.byteLength(body), 'user-agent': 'ghostpay-relayer-alert' },
    } as RequestOptions, (res) => {
      // Only the status is used. Never drain a receiver-controlled unlimited or stalled response.
      res.destroy();
      resolve(deliveryResult(res.statusCode ?? 0));
    });
    req.once('error', reject);
    req.end(body);
  });
}

/** Options of {@link createWebhookAlerts}. */
export interface WebhookAlertOptions {
  /** https URL (validated by the config loader). */
  readonly url: string;
  readonly secret: string;
  readonly allowedHosts: readonly string[];
  readonly logger?: Logger;
  /** Monotonic ms clock. */
  readonly now: () => number;
  /** Minimum gap between deliveries of the same event and chain (default 15 min). */
  readonly minIntervalMs?: number;
  /** Replaces `fetch` (tests). */
  readonly fetchImpl?: typeof fetch;
  /** Delivery timeout (default 3 s). */
  readonly timeoutMs?: number;
}

/**
 * Posts signed, request-data-free alert JSON. Fire-and-forget, de-duplicated per event and chain.
 *
 * @param o Options.
 * @returns The sink.
 */
export function createWebhookAlerts(o: WebhookAlertOptions): AlertSink {
  const logger = o.logger ?? nullLogger;
  if (o.secret.length < 32 || o.secret.length > 256) throw new ConfigError('alerts.webhookSecret: invalid length');
  if (o.allowedHosts.length === 0) throw new ConfigError('alerts.allowedHosts: required');
  const gap = o.minIntervalMs ?? 900_000;
  const timeoutMs = o.timeoutMs ?? 3000;
  if (!Number.isSafeInteger(gap) || gap < 1 || gap > 86_400_000) throw new ConfigError('alerts.minIntervalMs: invalid');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 3000) throw new ConfigError('alerts.timeoutMs: invalid');
  const url = validateWebhookUrl(o.url, o.allowedHosts);
  const last = new Map<string, number>();
  const active = new Set<AbortController>();
  const queue: { body: string; headers: Readonly<Record<string, string>> }[] = [];
  const retryWaits = new Map<NodeJS.Timeout, () => void>();
  let closed = false;

  async function deliver(job: (typeof queue)[number], stop: AbortController): Promise<void> {
    for (let attempt = 0; attempt < 2 && !stop.signal.aborted; attempt++) {
      const deadline = new AbortController();
      // An absolute deadline covers DNS, TLS, and headers; socket inactivity alone does not.
      const timer = setTimeout(() => deadline.abort(), timeoutMs);
      timer.unref();
      let retryable: boolean;
      try {
        const signal = AbortSignal.any([stop.signal, deadline.signal]);
        let result: DeliveryResult;
        if (o.fetchImpl === undefined) result = await postPublicHttps(url, job.body, job.headers, signal);
        else {
          const response = await o.fetchImpl(o.url, { method: 'POST', headers: job.headers, body: job.body, redirect: 'error', signal });
          // Test transports use the same ownership rule as the native HTTPS path.
          void response.body?.cancel().catch(() => undefined);
          result = { ok: response.ok, retryable: response.status === 429 || response.status >= 500 };
        }
        if (result.ok) return;
        retryable = result.retryable;
        if (!stop.signal.aborted) logger.log('warn', 'alert_delivery_failed', { errorClass: 'http_status' });
      } catch {
        retryable = true;
        if (!stop.signal.aborted) logger.log('warn', 'alert_delivery_failed', { errorClass: 'network' });
      } finally {
        clearTimeout(timer);
      }
      if (!retryable || attempt === 1 || stop.signal.aborted) return;
      await new Promise<void>((resolve) => {
        const retryTimer = setTimeout(() => { retryWaits.delete(retryTimer); resolve(); }, 250);
        retryTimer.unref();
        retryWaits.set(retryTimer, resolve);
      });
    }
  }

  function pump(): void {
    while (!closed && active.size < 4 && queue.length > 0) {
      const job = queue.shift();
      if (job === undefined) break;
      const stop = new AbortController();
      active.add(stop);
      void deliver(job, stop).finally(() => { active.delete(stop); pump(); });
    }
  }

  return {
    send(e) {
      if (closed) return;
      const key = `${e.kind}:${String(e.chainId ?? 0)}`;
      const t = o.now();
      const prev = last.get(key);
      if (prev !== undefined && (t < prev || t - prev < gap)) return;
      for (const [oldKey, at] of last) if (t >= at && t - at >= gap) last.delete(oldKey);
      if (queue.length >= 32 || (last.size >= 512 && !last.has(key))) {
        logger.log('warn', 'alert_delivery_dropped', { errorClass: 'capacity' });
        return;
      }
      last.set(key, t);
      const body = JSON.stringify({ event: e.kind, chainId: e.chainId ?? null, value: e.value ?? null, threshold: e.threshold ?? null, ts: Math.floor(Date.now() / 1000) });
      const signature = createHmac('sha256', o.secret).update(body).digest('hex');
      queue.push({ body, headers: { 'content-type': 'application/json', 'X-GP-Signature': `sha256=${signature}`, 'Idempotency-Key': signature } });
      pump();
    },
    close() {
      if (closed) return;
      closed = true;
      queue.length = 0;
      last.clear();
      for (const stop of active) stop.abort();
      for (const [timer, resolve] of retryWaits) { clearTimeout(timer); resolve(); }
      retryWaits.clear();
    },
  };
}
