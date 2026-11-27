import { describe, expect, it } from 'vitest';
import { parseDeepLink, parseShareTarget } from './deeplink.js';

const policy = { allowedHosts: ['example.test'] };
const address = '0x' + '12'.repeat(20);
const uri = `ghostpay:${address}?amount=2`;
const a = uri + '&label=Alpha';
const b = uri + '&label=Beta';
const fragment = 'https://example.test/pay#gpi=v1.SYNTHETIC';
const query = (fields: Record<string, string>) => new URLSearchParams(fields).toString();
const share = (fields: Record<string, string>) => parseShareTarget(query(fields), policy);
const ambiguous = { ok: false, code: 'ambiguous-share' };

const conflicting: [string, Record<string, string>][] = [
  ['different labels URL/text', { url: a, text: b }],
  ['different labels reversed', { url: b, text: a }],
  ['missing label then supplied', { url: uri, text: a }],
  ['supplied label then missing', { url: a, text: uri }],
  ['different labels title/text', { text: a, title: b }],
  ['different labels in text tokens', { text: `${a} ${b}` }],
  ['different amounts', { url: a, text: a.replace('amount=2', 'amount=3') }],
  ['different assets', { url: a + '&asset=ETH', text: a + '&asset=USDC' }],
  ['different chains', { url: a + '&chain=1', text: a + '&chain=2' }],
  ['different destination', { url: a, text: a.replace(address, '0x' + '34'.repeat(20)) }],
  ['different fragments of same length', { url: fragment, text: fragment.replace('SYNTHETIC', 'OTHERTEST') }],
];

describe('share-target payment-label ambiguity', () => {
  it.each(conflicting)('rejects %s', (_name, fields) => {
    expect(share(fields)).toEqual(ambiguous);
  });
  it('rejects conflicting labels through the HTTPS share-target route', () => {
    expect(parseDeepLink('https://example.test/share-target?' + query({ url: a, text: b }), policy)).toEqual(
      ambiguous,
    );
  });
  it('accepts identical labeled requests', () => {
    expect(share({ url: a, text: a })).toMatchObject({
      ok: true, value: { kind: 'payment-uri', payload: { label: 'Alpha' } },
    });
  });
  it('deduplicates equal decoded labels despite parameter reordering', () => {
    expect(share({ url: a, text: `ghostpay:${address}?label=%41lpha&amount=2` })).toMatchObject({
      ok: true, value: { kind: 'payment-uri', payload: { label: 'Alpha' } },
    });
  });
  it('accepts identical unlabeled requests', () => {
    const r = share({ url: uri, text: uri });
    expect(r).toMatchObject({ ok: true, value: { kind: 'payment-uri' } });
    if (!r.ok || r.value.kind !== 'payment-uri') throw new Error('expected payment URI');
    expect(r.value.payload.label).toBeUndefined();
  });
  it('preserves fragment warning and fragment-free display for identical invoice links', () => {
    const r = share({ url: fragment, text: fragment });
    expect(r).toMatchObject({
      ok: true,
      value: { kind: 'invoice-link', warnings: ['fragment-in-query'], payload: { fragment: '#gpi=v1.SYNTHETIC' } },
    });
    if (!r.ok || r.value.kind !== 'invoice-link') throw new Error('expected invoice link');
    expect(r.value.payload.safeDisplay).not.toContain('SYNTHETIC');
  });
  it('still deduplicates repeated raw addresses', () => {
    expect(share({ url: address, text: address })).toMatchObject({ ok: true, value: { kind: 'address' } });
  });
  it('does not expose labels through safe display', () => {
    const r = share({ url: a });
    expect(r).toMatchObject({ ok: true, value: { kind: 'payment-uri', payload: { label: 'Alpha' } } });
    if (!r.ok || r.value.kind !== 'payment-uri') throw new Error('expected payment URI');
    expect(r.value.payload.safeDisplay).not.toContain('Alpha');
  });
  it('preserves the host allowlist', () => {
    expect(share({ url: fragment.replace('example.test', 'other.test') })).toEqual({
      ok: false, code: 'host-not-allowed',
    });
  });
  it('preserves duplicate share parameter refusal', () => {
    expect(parseShareTarget('text=a&text=b', policy)).toEqual({ ok: false, code: 'bad-share' });
  });
});
