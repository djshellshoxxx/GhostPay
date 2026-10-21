import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { GuardError } from './errors.js';
import { bucketKey, cidrContains, parseCidr, parseIp } from './ip.js';
import { TrustedProxies, resolveClientIp } from './client.js';

const hex = (b: Uint8Array): string => Buffer.from(b).toString('hex');

describe('parseIp', () => {
  it('parses IPv4', () => {
    expect(parseIp('203.0.113.7')).toEqual({ family: 4, bytes: Uint8Array.from([203, 0, 113, 7]) });
  });

  it.each([
    ['::1', '00000000000000000000000000000001'],
    ['::', '00000000000000000000000000000000'],
    ['2001:db8::', '20010db8000000000000000000000000'],
    ['2001:DB8:0:0:1::2', '20010db8000000000001000000000002'],
    ['1:2:3:4:5:6:7:8', '00010002000300040005000600070008'],
    ['::1.2.3.4', '00000000000000000000000001020304'],
    ['64:ff9b::192.0.2.33', '0064ff9b0000000000000000c0000221'],
    ['1:2:3:4:5:6:1.2.3.4', '00010002000300040005000601020304'],
  ])('expands %s', (text, expected) => {
    const ip = parseIp(text);
    expect(ip?.family).toBe(6);
    expect(hex(ip?.bytes ?? new Uint8Array())).toBe(expected);
  });

  it('normalises IPv4-mapped IPv6 to IPv4 (one client, one bucket)', () => {
    expect(parseIp('::ffff:203.0.113.7')).toEqual(parseIp('203.0.113.7'));
    expect(parseIp('::FFFF:cb00:7107')).toEqual(parseIp('203.0.113.7'));
    expect(parseIp('0:0:0:0:0:ffff:203.0.113.7')).toEqual(parseIp('203.0.113.7'));
  });

  it.each(['', 'x', '1.2.3', '1.2.3.256', '01.2.3.4', 'fe80::1%eth0', '[::1]', '1.2.3.4:80', ':::', 'a'.repeat(65), ' 1.2.3.4'])(
    'rejects %j',
    (bad) => {
      expect(parseIp(bad)).toBeNull();
    },
  );

  it('property: every IPv6 group array round-trips through the full form', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 0xffff }), { minLength: 8, maxLength: 8 }), (groups) => {
        const text = groups.map((g) => g.toString(16)).join(':');
        const ip = parseIp(text);
        const mapped = groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff;
        if (mapped) return ip?.family === 4;
        const back: number[] = [];
        for (let i = 0; i < 16; i += 2) back.push(((ip?.bytes[i] ?? 0) << 8) | (ip?.bytes[i + 1] ?? 0));
        return ip?.family === 6 && back.every((g, i) => g === groups[i]);
      }),
    );
  });
});

describe('parseCidr / cidrContains', () => {
  it('matches inside the block and masks the network address', () => {
    const b = parseCidr('10.1.2.3/8');
    expect(Array.from(b.bytes)).toEqual([10, 0, 0, 0]);
    expect(cidrContains(b, parseIp('10.255.0.1') ?? fail())).toBe(true);
    expect(cidrContains(b, parseIp('11.0.0.1') ?? fail())).toBe(false);
    expect(cidrContains(b, parseIp('::1') ?? fail())).toBe(false);
    expect(cidrContains(parseCidr('2001:db8::/33'), parseIp('2001:db8:7fff::1') ?? fail())).toBe(true);
    expect(cidrContains(parseCidr('2001:db8::/33'), parseIp('2001:db8:8000::1') ?? fail())).toBe(false);
    expect(parseCidr('::1').prefix).toBe(128);
    expect(parseCidr(' 0.0.0.0/0 ').prefix).toBe(0);
  });

  it.each(['10.0.0.0/33', '::/129', '10.0.0.0/', '10.0.0.0/8/1', 'nope/8', '10.0.0.0/-1', '10.0.0.0/1e1'])('rejects %j', (bad) => {
    expect(() => parseCidr(bad)).toThrow(GuardError);
  });
});

describe('bucketKey', () => {
  it('aggregates IPv6 by /64 by default and IPv4 per address', () => {
    const a = bucketKey(parseIp('2001:db8:1:2:aaaa::1') ?? fail());
    const b = bucketKey(parseIp('2001:db8:1:2:ffff:ffff:ffff:ffff') ?? fail());
    expect(a).toBe(b);
    expect(a).toBe('6:2001:db8:1:2:0:0:0:0/64');
    expect(bucketKey(parseIp('2001:db8:1:3::1') ?? fail())).not.toBe(a);
    expect(bucketKey(parseIp('203.0.113.7') ?? fail())).toBe('4:203.0.113.7/32');
    expect(bucketKey(parseIp('203.0.113.7') ?? fail(), { v4: 24 })).toBe('4:203.0.113.0/24');
    expect(bucketKey(parseIp('2001:db8::1') ?? fail(), { v6: 128 })).toBe('6:2001:db8:0:0:0:0:0:1/128');
  });

  it.each([{ v4: 0 }, { v4: 33 }, { v6: 0 }, { v6: 129 }, { v6: 1.5 }])('rejects prefixes %j', (p) => {
    expect(() => bucketKey(parseIp('1.2.3.4') ?? fail(), p)).toThrow(GuardError);
  });
});

describe('resolveClientIp (S3-07 regression)', () => {
  const trusted = new TrustedProxies(['127.0.0.1', '10.0.0.0/8', '::1']);
  const ip = (s: string): string => s;

  it('ignores forwarding headers from an untrusted peer (direct connection)', () => {
    const r = resolveClientIp({ peer: '198.51.100.9', forwardedFor: '1.1.1.1', trusted });
    expect(r?.source).toBe('socket');
    expect(Array.from(r?.ip.bytes ?? [])).toEqual([198, 51, 100, 9]);
  });

  it('takes the first untrusted entry from the right behind trusted proxies', () => {
    const r = resolveClientIp({ peer: '127.0.0.1', forwardedFor: ['6.6.6.6, 198.51.100.9', ip('10.0.0.2')], trusted });
    expect(r?.source).toBe('forwarded');
    expect(Array.from(r?.ip.bytes ?? [])).toEqual([198, 51, 100, 9]);
  });

  it('client-supplied spoofed entries to the left are never chosen', () => {
    const spoofs = Array.from({ length: 40 }, (_, i) => `9.9.9.${i}`).join(',');
    const r = resolveClientIp({ peer: '::ffff:127.0.0.1', forwardedFor: `${spoofs},198.51.100.9`, trusted });
    expect(Array.from(r?.ip.bytes ?? [])).toEqual([198, 51, 100, 9]);
  });

  it('uses the peer when a trusted proxy sends no header', () => {
    expect(resolveClientIp({ peer: '10.0.0.5', forwardedFor: undefined, trusted })?.source).toBe('socket');
    expect(resolveClientIp({ peer: '10.0.0.5', forwardedFor: ' , ', trusted })?.source).toBe('socket');
  });

  it('uses the leftmost examined entry when all are trusted', () => {
    const r = resolveClientIp({ peer: '127.0.0.1', forwardedFor: '10.0.0.7, 10.0.0.8', trusted });
    expect(Array.from(r?.ip.bytes ?? [])).toEqual([10, 0, 0, 7]);
  });

  it('returns null on a broken chain or a missing peer, never a shared fallback bucket', () => {
    expect(resolveClientIp({ peer: '127.0.0.1', forwardedFor: '198.51.100.9, unknown', trusted })).toBeNull();
    expect(resolveClientIp({ peer: undefined, forwardedFor: '1.1.1.1', trusted })).toBeNull();
    expect(resolveClientIp({ peer: 'garbage', forwardedFor: undefined, trusted })).toBeNull();
  });

  it('bounds the entries examined', () => {
    const chain = ['198.51.100.9', ...Array.from({ length: 5 }, () => '10.0.0.1')].join(',');
    const r = resolveClientIp({ peer: '127.0.0.1', forwardedFor: chain, trusted, maxEntries: 3 });
    expect(Array.from(r?.ip.bytes ?? [])).toEqual([10, 0, 0, 1]);
    expect(() => resolveClientIp({ peer: '127.0.0.1', forwardedFor: chain, trusted, maxEntries: 0 })).toThrow(GuardError);
  });

  it('with no trusted proxies, headers are always ignored', () => {
    const none = new TrustedProxies([]);
    expect(resolveClientIp({ peer: '127.0.0.1', forwardedFor: '1.1.1.1', trusted: none })?.source).toBe('socket');
  });

  it('rejects malformed proxy configuration at construction', () => {
    expect(() => new TrustedProxies(['10.0.0.0/99'])).toThrow(GuardError);
  });
});

function fail(): never {
  throw new Error('unexpected null');
}
