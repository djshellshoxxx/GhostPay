import { describe, expect, it } from 'vitest';
import { parseShareTarget } from './deeplink.js';

const policy = { allowedHosts: ['example.test'] };
const lower = '0x' + 'ab'.repeat(20);
const upper = '0x' + 'AB'.repeat(20);
const mixed = '0x' + 'Ab'.repeat(20);
const raw = (address: string) => address;
const uri = (address: string) => `ghostpay:${address}?amount=2&label=Alpha`;
const share = (first: string, second: string, third?: string) =>
  parseShareTarget(
    new URLSearchParams({
      url: first,
      text: second,
      ...(third === undefined ? {} : { title: third }),
    }).toString(),
    policy,
  );

const cases = [
  { name: 'mixed then lowercase', first: mixed, second: lower, warning: true },
  { name: 'lowercase then mixed', first: lower, second: mixed, warning: true },
  { name: 'mixed then uppercase', first: mixed, second: upper, warning: true },
  { name: 'uppercase then mixed', first: upper, second: mixed, warning: true },
  { name: 'two unflagged inputs', first: lower, second: upper, warning: false },
  { name: 'two flagged inputs', first: mixed, second: mixed, warning: true },
  { name: 'three duplicates', first: lower, second: mixed, third: upper, warning: true },
];

describe('share-target checksum warning retention', () => {
  for (const [kind, encode] of [['address', raw], ['payment-uri', uri]] as const) {
    describe(kind, () => {
      it.each(cases)('preserves diagnostics for $name', ({ first, second, third, warning }) => {
        const result = share(encode(first), encode(second), third === undefined ? undefined : encode(third));
        expect(result).toMatchObject({
          ok: true,
          value: {
            kind,
            payload: {
              address: { family: 'evm', canonical: lower, checksumUnverified: warning },
              safeDisplay: kind === 'address' ? lower : `ghostpay:${lower} 2`,
              ...(kind === 'payment-uri' ? { amount: '2', label: 'Alpha' } : {}),
            },
          },
        });
      });
    });
  }

  it.each([
    { name: 'different labels', first: uri(mixed), second: uri(lower).replace('Alpha', 'Beta') },
    { name: 'different amounts', first: uri(mixed), second: uri(lower).replace('amount=2', 'amount=3') },
    { name: 'different addresses', first: mixed, second: '0x' + 'cd'.repeat(20) },
    { name: 'raw address and payment URI', first: mixed, second: uri(lower) },
  ])('still rejects $name', ({ first, second }) => {
    expect(share(first, second)).toEqual({ ok: false, code: 'ambiguous-share' });
  });

  it('preserves the fragment warning and hidden fragment for duplicate invoices', () => {
    const link = 'https://example.test/pay#gpi=v1.SYNTHETIC';
    expect(share(link, link)).toMatchObject({
      ok: true,
      value: {
        kind: 'invoice-link',
        warnings: ['fragment-in-query'],
        payload: { fragment: '#gpi=v1.SYNTHETIC', safeDisplay: 'https://example.test/pay#gpi=v1.[9 chars hidden]' },
      },
    });
  });
});
