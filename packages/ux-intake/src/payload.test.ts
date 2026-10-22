import { describe, expect, it } from 'vitest';
import {
  classifyPayload,
  INVOICE_FRAGMENT_PREFIX,
  INVOICE_MAX_ENCODED_CHARS,
  sanitizeInput,
} from './payload.js';
import { B64, BECH, EVM, FRAG, HOST, LINK, POLICY } from './fixtures.testutil.js';

const code = (s: unknown, p = POLICY) => {
  const r = classifyPayload(s, p);
  return r.ok ? 'OK' : r.code;
};

describe('format pins (mirror of invoice-schema envelope.ts)', () => {
  it('prefix and encoded cap', () => {
    expect(INVOICE_FRAGMENT_PREFIX).toBe('#gpi=v1.');
    expect(INVOICE_MAX_ENCODED_CHARS).toBe(21_846);
  });
});

describe('sanitizeInput', () => {
  it('rejects non-string, empty, huge, control, invisible, non-ascii, inner space', () => {
    expect(code(5)).toBe('not-string');
    expect(code('  \n')).toBe('empty');
    expect(code('a'.repeat(5000))).toBe('too-large');
    expect(code('a'.repeat(4097))).toBe('too-large');
    expect(code('a\u0000b')).toBe('control-char');
    expect(code('a​b')).toBe('control-char');
    expect(code('a‮b')).toBe('control-char');
    expect(code('аbc')).toBe('non-ascii');
    expect(code('a b')).toBe('whitespace');
  });
  it('trims outer ASCII whitespace', () => {
    expect(sanitizeInput(` \n${EVM}\t`, 100)).toEqual({ ok: true, value: EVM });
  });
});

describe('invoice links', () => {
  it('parses a https link and hides the fragment in safeDisplay', () => {
    const r = classifyPayload(LINK, POLICY);
    expect(r.ok && r.value.kind === 'invoice-link').toBe(true);
    if (r.ok && r.value.kind === 'invoice-link') {
      expect(r.value.fragment).toBe(FRAG);
      expect(r.value.origin).toBe(`https://${HOST}`);
      expect(r.value.path).toBe('/pay');
      expect(r.value.safeDisplay).toBe(`https://${HOST}/pay#gpi=v1.[${B64.length} chars hidden]`);
      expect(r.value.safeDisplay).not.toContain(B64);
    }
  });
  it('accepts a bare fragment', () => {
    const r = classifyPayload(FRAG, POLICY);
    expect(r.ok && r.value.kind === 'invoice-link' && r.value.origin === null).toBe(true);
  });
  it('rejects wrong host, suffix tricks, userinfo, port, http, query, odd path, bad fragments', () => {
    expect(code(`https://evil.test/pay${FRAG}`)).toBe('host-not-allowed');
    expect(code(`https://${HOST}.evil.test/pay${FRAG}`)).toBe('host-not-allowed');
    expect(code(`https://${HOST}@evil.test/pay${FRAG}`)).toBe('credentials-not-allowed');
    expect(code(`https://user:pw@${HOST}/pay${FRAG}`)).toBe('credentials-not-allowed');
    expect(code(`https://${HOST}:8443/pay${FRAG}`)).toBe('port-not-allowed');
    expect(code(`http://${HOST}/pay${FRAG}`)).toBe('insecure-scheme');
    expect(code(`https://${HOST}/pay?next=//x${FRAG}`)).toBe('query-not-allowed');
    expect(code(`https://${HOST}/pa.y${FRAG}`)).toBe('bad-path');
    expect(code(`https://${HOST}/pay`)).toBe('bad-fragment');
    expect(code(`https://${HOST}/pay#gpi=v2.abc`)).toBe('bad-fragment');
    expect(code(`https://${HOST}/pay#gpi=v1.`)).toBe('bad-fragment');
    expect(code(`https://${HOST}/pay#gpi=v1.ab+/=`)).toBe('bad-fragment');
    expect(
      code('#gpi=v1.' + 'A'.repeat(INVOICE_MAX_ENCODED_CHARS + 1), { ...POLICY, maxChars: 30_000 }),
    ).toBe('bad-fragment');
    expect(code('https://')).toBe('malformed-url');
  });
  it('accepts the maximum encoded length with a raised cap', () => {
    expect(code('#gpi=v1.' + 'A'.repeat(INVOICE_MAX_ENCODED_CHARS), { ...POLICY, maxChars: 30_000 })).toBe(
      'OK',
    );
  });
  it('rejects unicode / IDN hosts (non-ascii)', () => {
    expect(code(`https://pаy.example.test/pay${FRAG}`)).toBe('non-ascii');
  });
});

describe('ghostpay URIs', () => {
  it('parses address only', () => {
    const r = classifyPayload(`ghostpay:${EVM}`, POLICY);
    expect(r.ok && r.value.kind).toBe('payment-uri');
  });
  it('parses all params', () => {
    const r = classifyPayload(`GhostPay:${EVM}?amount=1.5&asset=USDC&chain=1&label=Coffee%20Shop`, POLICY);
    expect(r).toMatchObject({
      ok: true,
      value: { kind: 'payment-uri', amount: '1.5', asset: 'USDC', chainId: 1, label: 'Coffee Shop' },
    });
    if (r.ok) expect(r.value.safeDisplay).toBe(`ghostpay:${EVM} 1.5 USDC chain 1`);
  });
  it('rejects malformed pieces', () => {
    const u = (q: string) => code(`ghostpay:${EVM}${q}`);
    expect(u('?amount=1.50x')).toBe('bad-amount');
    expect(u('?amount=01')).toBe('bad-amount');
    expect(u('?amount=-1')).toBe('bad-amount');
    expect(u('?asset=usdc')).toBe('bad-asset');
    expect(u('?chain=0')).toBe('bad-chain');
    expect(u('?chain=1e3')).toBe('bad-chain');
    expect(u('?amount=1&amount=2')).toBe('duplicate-param');
    expect(u('?redirect=https://evil.test')).toBe('unknown-param');
    expect(u('?')).toBe('bad-param');
    expect(u('?amount')).toBe('bad-param');
    expect(u('?=1')).toBe('bad-param');
    expect(u('?label=%E0%A4%A')).toBe('bad-param');
    expect(u('?label=')).toBe('bad-label');
    expect(u('?label=' + 'a'.repeat(65))).toBe('bad-label');
    expect(u('?label=a%00b')).toBe('bad-label');
    expect(u('?label=pay%D0%B0l')).toBe('bad-label');
    expect(u('#frag')).toBe('fragment-not-allowed');
    expect(code('ghostpay://' + EVM)).toBe('bad-address');
    expect(code('ghostpay:nope')).toBe('bad-address');
  });
  it('enforces the asset allowlist', () => {
    const p = { ...POLICY, assetAllowlist: ['USDC'] };
    expect(code(`ghostpay:${EVM}?asset=USDC`, p)).toBe('OK');
    expect(code(`ghostpay:${EVM}?asset=SCAM`, p)).toBe('asset-not-allowed');
  });
});

describe('raw addresses and unknown schemes', () => {
  it('accepts raw addresses', () => {
    expect(classifyPayload(EVM, POLICY)).toMatchObject({
      ok: true,
      value: { kind: 'address', safeDisplay: EVM },
    });
    expect(code(BECH)).toBe('OK');
  });
  it('rejects dangerous schemes and junk', () => {
    for (const s of [
      'javascript:alert(1)',
      'data:text/html,hi',
      'file:///etc/passwd',
      'intent://x#Intent;end',
      'vbscript:x',
    ])
      expect(code(s)).toBe('scheme-not-allowed');
    expect(code('hello')).toBe('unrecognized');
  });
});
