import { describe, expect, it } from 'vitest';
import { bucketIp, normalizeIp, TrustedProxies } from './clientip.js';
import { ConfigError } from './secrets.js';

describe('client IP normalization and buckets', () => {
  it('normalizes bracketed, zoned, and IPv4-mapped addresses and rejects malformed text', () => {
    expect(normalizeIp('  [FE80::1%en0] ')).toBe('fe80::1');
    expect(normalizeIp('::FFFF:192.0.2.4')).toBe('192.0.2.4');
    expect(normalizeIp('client.invalid')).toBeUndefined();
  });

  it('keeps IPv4 buckets exact and collapses IPv6, including embedded IPv4, to a /64', () => {
    expect(bucketIp('192.0.2.7')).toBe('192.0.2.7');
    expect(bucketIp('2001:db8:1:2:3:4:5:6')).toBe('2001:db8:1:2::/64');
    expect(bucketIp('2001:db8::192.0.2.9')).toBe('2001:db8:0:0::/64');
    expect(bucketIp('not-an-ip')).toBe('unknown');
  });
});

describe('legacy app TrustedProxies address resolver', () => {
  it('rejects malformed networks and CIDR masks', () => {
    for (const cidr of ['example.com', '10.0.0.0/33', '2001:db8::/129', '10.0.0.0/not-a-mask', '10.0.0.0/8/extra']) {
      expect(() => new TrustedProxies([cidr])).toThrow(ConfigError);
    }
  });

  it('honors forwarding only for trusted peers and resolves the first untrusted hop', () => {
    const none = new TrustedProxies([]);
    expect(none.resolve('198.51.100.4', '203.0.113.8')).toBe('198.51.100.4');
    const trusted = new TrustedProxies(['10.0.0.0/8', '2001:db8:ffff::/48']);
    expect(trusted.contains('10.2.3.4')).toBe(true);
    expect(trusted.contains('bogus')).toBe(false);
    expect(trusted.resolve(undefined, '203.0.113.8')).toBe('unknown');
    expect(trusted.resolve('198.51.100.4', '203.0.113.8')).toBe('198.51.100.4');
    expect(trusted.resolve('10.0.0.1', undefined)).toBe('10.0.0.1');
    expect(trusted.resolve('10.0.0.1', '192.0.2.7, 10.1.0.1, 10.0.0.2')).toBe('192.0.2.7');
    expect(trusted.resolve('10.0.0.1', '203.0.113.7, malformed, 10.0.0.2')).toBe('10.0.0.2');
    expect(trusted.resolve('2001:db8:ffff::1', ['2001:db8::7', '2001:db8:ffff::2'])).toBe('2001:db8::7');
    const long = Array.from({ length: 33 }, (_, i) => `198.51.100.${(i % 254) + 1}`).join(',');
    expect(trusted.resolve('10.0.0.1', long)).toBe('198.51.100.33');
  });
});
