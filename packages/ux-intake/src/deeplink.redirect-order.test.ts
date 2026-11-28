import { describe, expect, it } from 'vitest';
import { parseDeepLink, type LinkPolicy } from './deeplink.js';
import { EVM, FRAG, HOST } from './fixtures.testutil.js';

const policy: LinkPolicy = { allowedHosts: [HOST] };
const origin = `https://${HOST}`;
const enc = encodeURIComponent;
const invoice = (query: string) => `${origin}/pay?${query}${FRAG}`;
const share = (query: string) => `${origin}/share-target?text=${enc(EVM)}&${query}`;

describe('deep-link redirect validation order (R5)', () => {
  it.each([
    `next=${enc('https://invalid.test')}`,
    `ReTuRn_To=${enc('//invalid.test')}`,
    `next=/pay&next=${enc('//invalid.test')}`,
  ])('rejects unsafe redirect parameters on invoice links: %s', (query) => {
    expect(parseDeepLink(invoice(query), policy)).toEqual({ ok: false, code: 'open-redirect' });
  });

  it.each([
    `next=${enc('//invalid.test')}`,
    `ReDiReCt=${enc('https://invalid.test')}`,
    `next=/pay&next=${enc('//invalid.test')}`,
  ])('rejects unsafe redirect parameters on share-target links: %s', (query) => {
    expect(parseDeepLink(share(query), policy)).toEqual({ ok: false, code: 'open-redirect' });
  });

  it.each(['next=/invoice', 'utm=1'])('preserves valid invoice and share links: %s', (query) => {
    const inv = parseDeepLink(invoice(query), policy);
    expect(inv).toMatchObject({ ok: true, value: { kind: 'invoice-link', warnings: [] } });
    expect(inv).not.toHaveProperty('value.returnTo');
    const shared = parseDeepLink(share(query), policy);
    expect(shared).toMatchObject({ ok: true, value: { kind: 'address', warnings: [] } });
    expect(shared).not.toHaveProperty('value.returnTo');
  });

  it('retains safe navigation and the existing host and route checks', () => {
    expect(parseDeepLink(`${origin}/pay?next=/invoice`, policy)).toMatchObject({
      ok: true, value: { kind: 'navigate', returnTo: '/invoice' },
    });
    expect(parseDeepLink(`${origin}/pay?next=${enc('//invalid.test')}`, policy))
      .toEqual({ ok: false, code: 'open-redirect' });
    expect(parseDeepLink(`https://invalid.test/pay?next=${enc('//invalid.test')}${FRAG}`, policy))
      .toEqual({ ok: false, code: 'host-not-allowed' });
    expect(parseDeepLink(`${origin}/other?next=${enc('//invalid.test')}${FRAG}`, policy))
      .toEqual({ ok: false, code: 'route-not-allowed' });
  });
});
