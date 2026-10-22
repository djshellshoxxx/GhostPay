import { EventEmitter } from 'node:events';
import type { LookupAddress } from 'node:dns';
import { describe, expect, it, vi } from 'vitest';
import { WebhookAlertSink, createHttpsPoster, isPublicIp, publicOnlyLookup, validateWebhookUrl } from './alerts.js';
import { TrustedProxies, bucketIp, normalizeIp } from './clientip.js';
import { createLogger } from './log.js';
import { ConfigError } from './secrets.js';

describe('bucketIp (S3-07)', () => {
  it('keeps IPv4 and collapses IPv6 to its /64', () => {
    expect(bucketIp('203.0.113.7')).toBe('203.0.113.7');
    const a = bucketIp('2001:db8:1:2:aaaa:bbbb:cccc:dddd');
    expect(a).toBe('2001:db8:1:2::/64');
    expect(bucketIp('2001:DB8:1:2::1')).toBe(a);
    expect(bucketIp('2001:db8:1:2:ffff:ffff:ffff:ffff')).toBe(a);
    expect(bucketIp('2001:db8:1:3::1')).not.toBe(a);
    expect(bucketIp('fe80::1%eth0')).toBe('fe80:0:0:0::/64');
    expect(bucketIp('[2001:db8::1]')).toBe('2001:db8:0:0::/64');
    expect(bucketIp('::1')).toBe('0:0:0:0::/64');
    expect(bucketIp('::')).toBe('0:0:0:0::/64');
    expect(bucketIp('1::')).toBe('1:0:0:0::/64');
    expect(bucketIp('64:ff9b::192.0.2.33')).toBe('64:ff9b:0:0::/64');
  });
  it('unwraps IPv4-mapped IPv6 so both spellings share a bucket', () => {
    expect(bucketIp('::ffff:198.51.100.4')).toBe('198.51.100.4');
    expect(normalizeIp('::FFFF:198.51.100.4')).toBe('198.51.100.4');
  });
  it('maps garbage to a single bucket instead of a client-chosen key', () => {
    for (const g of ['', 'not an ip', '999.1.1.1', '1.2.3', '<script>', 'a'.repeat(300)]) expect(bucketIp(g)).toBe('unknown');
  });
});

describe('TrustedProxies', () => {
  it('validates CIDRs', () => {
    for (const bad of ['nope', '10.0.0.0/33', '::1/129', '10.0.0.0/8/8', '10.0.0.0/x', '10.0.0.0/-1', '/8']) {
      expect(() => new TrustedProxies([bad])).toThrow(ConfigError);
    }
    expect(new TrustedProxies(['10.0.0.0/8', '2001:db8::/32', '192.0.2.1', '::1']).size).toBe(4);
  });
  it('contains()', () => {
    const p = new TrustedProxies(['10.0.0.0/8', '2001:db8::/32', '192.0.2.1']);
    expect(p.contains('10.1.2.3')).toBe(true);
    expect(p.contains('::ffff:10.1.2.3')).toBe(true);
    expect(p.contains('2001:db8:5::1')).toBe(true);
    expect(p.contains('192.0.2.1')).toBe(true);
    expect(p.contains('192.0.2.2')).toBe(false);
    expect(p.contains('11.0.0.1')).toBe(false);
    expect(p.contains('garbage')).toBe(false);
  });
  const p = new TrustedProxies(['10.0.0.0/8', '2001:db8::/32']);
  it('ignores X-Forwarded-For unless the peer is a proxy', () => {
    expect(p.resolve('198.51.100.9', '1.2.3.4')).toBe('198.51.100.9');
    expect(new TrustedProxies([]).resolve('10.0.0.1', '1.2.3.4')).toBe('10.0.0.1');
    expect(p.resolve(undefined, '1.2.3.4')).toBe('unknown');
  });
  it('walks from the right and cannot be spoofed from the left', () => {
    expect(p.resolve('10.0.0.1', '6.6.6.6, 203.0.113.5')).toBe('203.0.113.5');
    expect(p.resolve('10.0.0.1', '6.6.6.6, 203.0.113.5, 10.0.0.2')).toBe('203.0.113.5');
    expect(p.resolve('10.0.0.1', ['6.6.6.6', '203.0.113.5'])).toBe('203.0.113.5');
    expect(p.resolve('10.0.0.1', '10.0.0.3, 10.0.0.2')).toBe('10.0.0.3'); // every hop trusted: leftmost
    expect(p.resolve('10.0.0.1', '2001:db8::1, 2001:4860::8888')).toBe('2001:4860::8888');
  });
  it('falls back safely on missing or malformed entries', () => {
    expect(p.resolve('10.0.0.1', undefined)).toBe('10.0.0.1');
    expect(p.resolve('10.0.0.1', '')).toBe('10.0.0.1');
    expect(p.resolve('10.0.0.1', 'evil-value')).toBe('10.0.0.1');
    expect(p.resolve('10.0.0.1', '6.6.6.6, 10.0.0.9, ??')).toBe('10.0.0.1'); // junk right of the trusted hop: stop at the socket
    expect(p.resolve('10.0.0.1', `${'1.1.1.1, '.repeat(100)}203.0.113.5`)).toBe('203.0.113.5');
  });
});

describe('isPublicIp / validateWebhookUrl (SSRF)', () => {
  it.each([
    '8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700:4700::1111', '::ffff:8.8.8.8',
  ])('%s is public', (ip) => {
    expect(isPublicIp(ip)).toBe(true);
  });
  it.each([
    '10.0.0.1', '127.0.0.1', '169.254.169.254', '172.16.5.5', '172.31.255.255', '192.168.1.1', '100.64.0.1', '0.0.0.0',
    '224.0.0.1', '255.255.255.255', '198.18.0.1', '192.0.2.5', '::1', '::', 'fe80::1', 'fc00::1', 'fd12::1', 'ff02::1',
    '::ffff:127.0.0.1', '::ffff:10.0.0.1', '64:ff9b::7f00:1', '2002:7f00:1::1', '2001:db8::1', 'not-an-ip',
  ])('%s is refused', (ip) => {
    expect(isPublicIp(ip)).toBe(false);
  });
  it('accepts a public https URL', () => {
    expect(validateWebhookUrl('https://hooks.example.org/services/T000/B000/XXXX').hostname).toBe('hooks.example.org');
    expect(validateWebhookUrl('https://8.8.8.8/hook').hostname).toBe('8.8.8.8');
    expect(validateWebhookUrl('https://hooks.example.org.:8443/x').port).toBe('8443');
  });
  it.each([
    ['http://hooks.example.org/x', /https/],
    ['https://user:pw@hooks.example.org/x', /credentials/],
    ['https://localhost/x', /public DNS/],
    ['https://foo.localhost/x', /public DNS/],
    ['https://intranet/x', /public DNS/],
    ['https://db.internal/x', /public DNS/],
    ['https://printer.local/x', /public DNS/],
    ['https://metadata.google.internal/x', /public DNS/],
    ['https://127.0.0.1/x', /private/],
    ['https://10.1.2.3/x', /private/],
    ['https://169.254.169.254/latest/meta-data', /private/],
    ['https://[::1]/x', /private/],
    ['https://[fd00::1]/x', /private/],
    ['https://[::ffff:7f00:1]/x', /private/],
    ['https://2130706433/x', /private/],
    ['https://0x7f.0.0.1/x', /private/],
    ['not a url', /not a URL/],
    [`https://example.org/${'a'.repeat(2100)}`, /too long/],
  ])('refuses %s', (url, why) => {
    expect(() => validateWebhookUrl(url)).toThrow(why);
  });
});

describe('publicOnlyLookup (DNS rebinding defence)', () => {
  const addrs = (...a: string[]): LookupAddress[] => a.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
  const run = (resolved: LookupAddress[] | Error, options: { all?: boolean; family?: number }) =>
    new Promise<{ err: NodeJS.ErrnoException | null; out: unknown; family?: number | undefined }>((resolve) => {
      const lookup = publicOnlyLookup((_h, _o, cb) => {
        if (resolved instanceof Error) cb(resolved, []);
        else cb(null, resolved);
      });
      lookup('hooks.example.org', options, (err, out, family) => {
        resolve({ err, out, family });
      });
    });
  it('returns the address (or the list with all:true) when every record is public', async () => {
    expect(await run(addrs('8.8.8.8', '1.1.1.1'), {})).toMatchObject({ err: null, out: '8.8.8.8', family: 4 });
    expect(await run(addrs('8.8.8.8'), { all: true, family: 4 })).toMatchObject({ err: null, out: addrs('8.8.8.8') });
  });
  it('refuses when ANY record is private, loopback or link-local', async () => {
    for (const bad of [['127.0.0.1'], ['8.8.8.8', '10.0.0.5'], ['169.254.169.254'], ['::1'], ['::ffff:192.168.0.1']]) {
      const r = await run(addrs(...bad), { all: true });
      expect(r.err?.code).toBe('ENOTPUBLIC');
    }
    expect((await run([], {})).err?.code).toBe('ENOTPUBLIC');
  });
  it('passes resolver errors through', async () => {
    const e = Object.assign(new Error('nx'), { code: 'ENOTFOUND' });
    expect((await run(e, {})).err?.code).toBe('ENOTFOUND');
  });
  it('works with the real resolver for a literal public address', async () => {
    const lookup = publicOnlyLookup();
    const r = await new Promise<{ err: NodeJS.ErrnoException | null; out: unknown }>((resolve) => {
      lookup('127.0.0.1', {}, (err, out) => {
        resolve({ err, out });
      });
    });
    expect(r.err?.code).toBe('ENOTPUBLIC'); // loopback is refused even through the real dns.lookup
  });
});

describe('createHttpsPoster', () => {
  const fakeRequest = (behave: (req: EventEmitter & { destroy: (e?: Error) => void; end: (b: string) => void }, cb: (res: EventEmitter & { statusCode?: number; resume: () => void }) => void) => void) =>
    ((_u: unknown, opts: unknown, cb: (res: never) => void) => {
      const req = Object.assign(new EventEmitter(), {
        destroy: (e?: Error) => {
          if (e !== undefined) req.emit('error', e);
        },
        end: (b: string) => {
          (req as unknown as { sent: string; opts: unknown }).sent = b;
          (req as unknown as { opts: unknown }).opts = opts;
          behave(req, cb as never);
        },
      });
      return req;
    }) as never;
  it('posts JSON with a hard timeout and resolves the status', async () => {
    let seen: { sent?: string; opts?: Record<string, unknown> } = {};
    const post = createHttpsPoster({
      timeoutMs: 1234,
      requestImpl: fakeRequest((req, cb) => {
        seen = req as never;
        cb(Object.assign(new EventEmitter(), { statusCode: 202, resume: () => undefined }));
      }),
    });
    expect(await post(new URL('https://hooks.example.org/x'), '{"a":1}')).toBe(202);
    expect(seen.sent).toBe('{"a":1}');
    expect(seen.opts?.['timeout']).toBe(1234);
    expect(seen.opts?.['agent']).toBe(false);
    expect(typeof seen.opts?.['lookup']).toBe('function');
    expect(seen.opts?.['headers']).not.toHaveProperty('authorization');
  });
  it('reports status 0 when there is none, and rejects on timeout and on errors', async () => {
    const none = createHttpsPoster({ timeoutMs: 10, requestImpl: fakeRequest((_r, cb) => { cb(Object.assign(new EventEmitter(), { resume: () => undefined })); }) });
    expect(await none(new URL('https://h.example.org/'), '{}')).toBe(0);
    const slow = createHttpsPoster({ timeoutMs: 10, requestImpl: fakeRequest((req) => { req.emit('timeout'); }) });
    await expect(slow(new URL('https://h.example.org/'), '{}')).rejects.toThrow('timeout');
    const broken = createHttpsPoster({ timeoutMs: 10, requestImpl: fakeRequest((req) => { req.emit('error', new Error('ECONNRESET')); }) });
    await expect(broken(new URL('https://h.example.org/'), '{}')).rejects.toThrow('ECONNRESET');
  });
});

describe('WebhookAlertSink', () => {
  const alert = { kind: 'low_balance', severity: 'critical', chainId: 1 } as const;
  it('throttles per kind and chain and logs failures by class only', async () => {
    const t = { ms: 1_900_000_000_000 };
    const logs: string[] = [];
    const post = vi.fn<(u: URL, b: string) => Promise<number>>().mockResolvedValue(200);
    const sink = new WebhookAlertSink(new URL('https://h.example.org/secret-token'), { cooldownMs: 1000, now: () => t.ms, post, logger: createLogger((l) => logs.push(l)) });
    sink.notify(alert);
    sink.notify(alert);
    sink.notify({ ...alert, chainId: 2 });
    sink.notify({ ...alert, kind: 'error_rate' });
    expect(post).toHaveBeenCalledTimes(3);
    t.ms += 1000;
    sink.notify(alert);
    expect(post).toHaveBeenCalledTimes(4);
    expect(JSON.parse(post.mock.calls[0]?.[1] ?? '{}')).toEqual({ source: 'ghostpay-relayer', kind: 'low_balance', severity: 'critical', chainId: 1, at: '2030-03-17T17:46:40.000Z' });

    post.mockResolvedValueOnce(500);
    t.ms += 5000;
    sink.notify(alert);
    post.mockRejectedValueOnce(new Error('https://h.example.org/secret-token failed'));
    t.ms += 5000;
    sink.notify(alert);
    await new Promise((r) => setTimeout(r, 10));
    const all = logs.join('\n');
    expect(all).toContain('alert_delivery_failed');
    expect(all).toContain('webhook_status');
    expect(all).toContain('webhook_error');
    expect(all).not.toContain('secret-token');
  });
});
