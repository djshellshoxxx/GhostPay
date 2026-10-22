import { describe, expect, it } from 'vitest';
import { addressFor, key } from './fixtures.testutil.js';
import { btcToSats, buildPayjoinUri, parsePayjoinUri, parseV2Fragment, satsToBtc, validatePjUrl, type PayjoinUri } from './uri.js';

const ADDR = addressFor(key('u'), 'wpkh');
const base: PayjoinUri = { address: ADDR, pj: 'https://pj.example/endpoint', outputSubstitution: true, network: 'testnet' };
// BIP-77 example fragment (raw BIP-77 0.2.0, "Receiver fragment parameters").
const FRAG = 'EX1WKV8CEC-OH1QYPM59NK2LXXS4890SUAXXYT25Z2VAPHP0X7YEYCJXGWAG6UG9ZU6NQ-RK1Q0DJS3VVDXWQQTLQ8022QGXSX7ML9PHZ6EDSF6AKEWQG758JPS2EV';
const codeOf = (f: () => unknown): string => {
  try {
    f();
    return 'none';
  } catch (e) {
    return (e as { code?: string }).code ?? 'other';
  }
};

describe('amount helpers', () => {
  it('round-trips', () => {
    expect(satsToBtc(0n)).toBe('0');
    expect(satsToBtc(1n)).toBe('0.00000001');
    expect(satsToBtc(150_000_000n)).toBe('1.5');
    expect(btcToSats('1.5')).toBe(150_000_000n);
    expect(btcToSats('0.00000001')).toBe(1n);
    expect(btcToSats('3')).toBe(300_000_000n);
    expect(codeOf(() => satsToBtc(-1n))).toBe('uri_invalid');
    expect(codeOf(() => btcToSats('1.123456789'))).toBe('uri_invalid');
    expect(codeOf(() => btcToSats('abc'))).toBe('uri_invalid');
  });
});

describe('v1 URIs', () => {
  it('builds and parses', () => {
    const u = buildPayjoinUri({ ...base, amountSats: 123_456n, label: 'a b', message: 'x&y' });
    expect(u).toBe(`bitcoin:${ADDR}?amount=0.00123456&label=a%20b&message=x%26y&pj=https%3A%2F%2Fpj.example%2Fendpoint`);
    const p = parsePayjoinUri(u, 'testnet');
    expect(p).toMatchObject({ address: ADDR, amountSats: 123_456n, pj: 'https://pj.example/endpoint', outputSubstitution: true, label: 'a b', message: 'x&y' });
  });
  it('encodes pjos=0', () => {
    const u = buildPayjoinUri({ ...base, outputSubstitution: false });
    expect(u).toContain('pjos=0');
    expect(parsePayjoinUri(u, 'testnet').outputSubstitution).toBe(false);
    expect(codeOf(() => parsePayjoinUri(`${u}&x=1`.replace('pjos=0', 'pjos=7'), 'testnet'))).toBe('uri_invalid');
  });
  it('accepts req-pj and parses without amount', () => {
    const p = parsePayjoinUri(`bitcoin:${ADDR}?req-pj=https%3A%2F%2Fa.example%2Fp`, 'testnet');
    expect(p.amountSats).toBeUndefined();
  });
  it('BPJ-URI-2: sp + pj conflict', () => {
    expect(codeOf(() => parsePayjoinUri(`bitcoin:${ADDR}?sp=tsp1qqabc&pj=https%3A%2F%2Fa.example%2Fp`, 'testnet'))).toBe('uri_conflict');
  });
  it('rejects malformed URIs', () => {
    for (const bad of ['', 'http://x', `bitcoin:${ADDR}?pj`, `bitcoin:${ADDR}?amount=1`, `bitcoin:${ADDR}?pj=%E0%A4%A`, `bitcoin:${ADDR}?pj=https%3A%2F%2Fa.example&pj=https%3A%2F%2Fb.example`, `bitcoin:${ADDR}?req-foo=1&pj=https%3A%2F%2Fa.example%2Fp`, `bitcoin:${ADDR}?amount=x&pj=https%3A%2F%2Fa.example%2Fp`, 'bitcoin:?pj=x']) {
      expect(codeOf(() => parsePayjoinUri(bad, 'testnet'))).toBe('uri_invalid');
    }
    expect(codeOf(() => parsePayjoinUri('x'.repeat(5000), 'testnet'))).toBe('uri_invalid');
    expect(codeOf(() => parsePayjoinUri(123 as never, 'testnet'))).toBe('uri_invalid');
  });
  it('BPJ-GEN-1: mainnet refused everywhere', () => {
    expect(codeOf(() => parsePayjoinUri(`bitcoin:bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq?pj=https%3A%2F%2Fa.example`, 'testnet'))).toBe('network_not_allowed');
    expect(codeOf(() => parsePayjoinUri('bitcoin:1BoatSLRHtKNngkdXEeobR76b53LETtpyT?pj=https%3A%2F%2Fa.example', 'testnet'))).toBe('network_not_allowed');
    expect(codeOf(() => parsePayjoinUri(`bitcoin:${ADDR}?pj=https%3A%2F%2Fa.example`, 'mainnet' as never))).toBe('network_not_allowed');
    expect(codeOf(() => buildPayjoinUri({ ...base, network: 'mainnet' as never }))).toBe('network_not_allowed');
    expect(codeOf(() => buildPayjoinUri({ ...base, address: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq' }))).toBe('network_not_allowed');
    expect(codeOf(() => buildPayjoinUri({ ...base, address: 'tb1invalidaddress' }))).toBe('uri_invalid');
  });
  it('regtest addresses work on regtest only', () => {
    const r = addressFor(key('u'), 'wpkh', 'regtest');
    expect(parsePayjoinUri(`bitcoin:${r}?pj=https%3A%2F%2Fa.example%2Fp`, 'regtest').address).toBe(r);
    expect(codeOf(() => parsePayjoinUri(`bitcoin:${r}?pj=https%3A%2F%2Fa.example%2Fp`, 'testnet'))).toBe('uri_invalid');
  });
  it('BPJ-URI-4: pj scheme rules', () => {
    expect(validatePjUrl('https://a.example/p')).toBe(1);
    expect(validatePjUrl('http://abcdefghijklmnop.onion/p')).toBe(1);
    expect(validatePjUrl('http://127.0.0.1:8080/p')).toBe(1);
    expect(validatePjUrl('http://localhost/p')).toBe(1);
    expect(validatePjUrl('http://[::1]:80/p')).toBe(1);
    for (const bad of ['http://a.example/p', 'ftp://a.example/p', 'https://u:p@a.example/p', 'not a url', 'https://']) {
      expect(codeOf(() => validatePjUrl(bad))).toBe('uri_invalid');
    }
  });
  it('refuses an oversize built URI', () => {
    expect(codeOf(() => buildPayjoinUri({ ...base, label: 'x'.repeat(3000) }))).toBe('uri_invalid');
  });
});

describe('v2 URIs (BIP-77 0.2.0 fragment)', () => {
  it('parses the BIP example fragment', () => {
    const f = parseV2Fragment(FRAG);
    expect(f.expirySeconds).toBe(1_736_218_741); // little-endian u32, rust-payjoin time.rs
    expect(f.ohttpKeys).toHaveLength(34); // BIP text says 35; the BIP's own example decodes to 34
    expect(f.receiverKey).toHaveLength(33);
  });
  it('accepts legacy + separators and any order, rejects the rest', () => {
    const plus = FRAG.replaceAll('-', '+');
    expect(parseV2Fragment(plus).receiverKey).toHaveLength(33);
    const [ex, oh, rk] = FRAG.split('-') as [string, string, string];
    expect(parseV2Fragment([rk, ex, oh].join('-')).expirySeconds).toBe(1_736_218_741);
    for (const bad of ['', FRAG.toLowerCase(), `${ex}-${oh}`, `${ex}-${ex}-${oh}-${rk}`, `${ex}-${oh}-XX1QQQ`, `${ex}-${oh}-RK1!!!`, `EX1Q-${oh}-${rk}`, 'x'.repeat(600), `${ex}-${oh}-RK1BBB`]) {
      expect(codeOf(() => parseV2Fragment(bad))).toBe('uri_invalid');
    }
  });
  it('builds an uppercase pj with %23 and ascending fragment order, parsed back', () => {
    const pj = `https://payjo.in/TXJCGKTKXLUUZ#${FRAG}`;
    const [ex, oh, rk] = FRAG.split('-') as [string, string, string];
    const shuffled = `https://payjo.in/TXJCGKTKXLUUZ#${[rk, oh, ex].join('+').toLowerCase()}`;
    for (const input of [pj, shuffled]) {
      const u = buildPayjoinUri({ ...base, pj: input, amountSats: 666_666n, outputSubstitution: false });
      expect(u).toContain(`pj=HTTPS://PAYJO.IN/TXJCGKTKXLUUZ%23${FRAG}`);
      expect(u.endsWith(FRAG)).toBe(true);
      const p = parsePayjoinUri(u, 'testnet', 1_700_000_000);
      expect(p.pj).toBe(`HTTPS://PAYJO.IN/TXJCGKTKXLUUZ#${FRAG}`);
      expect(p.outputSubstitution).toBe(false);
    }
  });
  it('BPJ-URI-3: expired EX is session_expired', () => {
    const u = buildPayjoinUri({ ...base, pj: `https://payjo.in/TX#${FRAG}` });
    expect(codeOf(() => parsePayjoinUri(u, 'testnet', 1_800_000_000))).toBe('session_expired');
    expect(parsePayjoinUri(u, 'testnet').pj).toContain('#');
  });
});
