import { describe, expect, it } from 'vitest';
import {
  parseDeepLink,
  parseShareTarget,
  redactForLog,
  safeRedirectTarget,
  stripFragment,
  type LinkPolicy,
} from './deeplink.js';
import { B64, BECH, EVM, FRAG, HOST } from './fixtures.testutil.js';

const P: LinkPolicy = { allowedHosts: [HOST] };
const dl = (s: unknown, p = P) => {
  const r = parseDeepLink(s, p);
  return r.ok ? r.value : r.code;
};
const enc = encodeURIComponent;

describe('safeRedirectTarget', () => {
  it('accepts allowlisted same-origin paths', () => {
    for (const s of ['/pay', '/pay/', '/invoice/abc-1', '/share-target'])
      expect(safeRedirectTarget(s)).toEqual({ ok: true, value: s });
    expect(safeRedirectTarget('/', ['/'])).toEqual({ ok: true, value: '/' });
  });
  it('rejects every open-redirect trick', () => {
    for (const s of [
      '//evil.test',
      '/\\evil.test',
      'https://evil.test',
      'javascript:alert(1)',
      '/pay@evil.test',
      '/pay%2f%2fevil',
      '/pay?x=1',
      '/pay#x',
      '/pay/../admin',
      '/pay/./x',
      '/other',
      '/payment',
      '',
      'pay',
      '/pay:80',
      'a'.repeat(300),
      '/pay\n',
      '///evil.test',
    ])
      expect(safeRedirectTarget(s)).toEqual({ ok: false, code: 'open-redirect' });
    expect(safeRedirectTarget(5)).toEqual({ ok: false, code: 'open-redirect' });
    expect(safeRedirectTarget('/anything', ['/'])).toEqual({ ok: false, code: 'open-redirect' });
  });
});

describe('stripFragment / redactForLog', () => {
  it('strips', () => {
    expect(stripFragment(`https://${HOST}/pay${FRAG}`)).toBe(`https://${HOST}/pay`);
    expect(stripFragment('https://x.test/a')).toBe('https://x.test/a');
  });
  it('redacts fragments, encoded params, and blobs', () => {
    const line = `GET https://${HOST}/pay${FRAG} ref=gpi%3Dv1%2E${B64} blob=${B64}`;
    const out = redactForLog(line);
    expect(out).not.toContain('SECRETKEY');
    expect(out).not.toContain(B64);
    expect(redactForLog('x?url=' + enc(`https://${HOST}/p?gpi=v1.${B64}`))).not.toContain('SECRETKEY');
    expect(redactForLog('hello world')).toBe('hello world');
  });
});

describe('parseDeepLink', () => {
  it('handles an invoice deep link', () => {
    const v = dl(`https://${HOST}/pay${FRAG}`);
    expect(v).toMatchObject({ kind: 'invoice-link', warnings: [] });
    expect(JSON.stringify((v as { payload: { safeDisplay: string } }).payload.safeDisplay)).not.toContain(
      B64,
    );
  });
  it('handles ghostpay: and web+ghostpay: URIs', () => {
    expect(dl(`ghostpay:${EVM}?amount=2`)).toMatchObject({ kind: 'payment-uri' });
    expect(dl(`web+ghostpay:${EVM}`)).toMatchObject({ kind: 'payment-uri' });
    expect(dl(`ghostpay:${BECH}`)).toMatchObject({ kind: 'payment-uri' });
  });
  it('a bare address in a ghostpay deep link is not accepted as an https link', () => {
    expect(dl('ghostpay:nope')).toBe('bad-address');
  });
  it('navigates to an allowlisted route, with safe returnTo', () => {
    expect(dl(`https://${HOST}/pay`)).toEqual({
      kind: 'navigate',
      path: '/pay',
      safeDisplay: `https://${HOST}/pay`,
    });
    expect(dl(`https://${HOST}/invoice?next=${enc('/pay/x')}`)).toMatchObject({
      kind: 'navigate',
      returnTo: '/pay/x',
    });
  });
  it('rejects redirect params that are not safe paths (any casing)', () => {
    for (const q of [
      'next=//evil.test',
      'Redirect=https://evil.test',
      'return_to=javascript:x',
      'continue=%2F%2Fevil.test',
      'u=/etc',
    ])
      expect(dl(`https://${HOST}/pay?${q}`)).toBe('open-redirect');
  });
  it('ignores unrelated params', () => {
    expect(dl(`https://${HOST}/pay?utm=1`)).toMatchObject({ kind: 'navigate' });
  });
  it('rejects schemes, hosts, credentials, ports, routes, fragments', () => {
    expect(dl('javascript:alert(1)')).toBe('scheme-not-allowed');
    expect(dl('data:text/html;base64,AAAA')).toBe('scheme-not-allowed');
    expect(dl('/pay')).toBe('scheme-not-allowed');
    expect(dl(`https://evil.test/pay`)).toBe('host-not-allowed');
    expect(dl(`https://${HOST}./pay`)).toBe('host-not-allowed');
    expect(dl(`https://u@${HOST}/pay`)).toBe('credentials-not-allowed');
    expect(dl(`https://${HOST}:444/pay`)).toBe('port-not-allowed');
    expect(dl(`https://${HOST}/admin`)).toBe('route-not-allowed');
    expect(dl(`https://${HOST}/pay#section`)).toBe('bad-fragment');
    expect(dl(`https://${HOST}/pay#gpi=v1.`)).toBe('bad-fragment');
    expect(dl('https://')).toBe('malformed-url');
    expect(dl(7)).toBe('not-string');
    expect(dl('https://а.test/pay')).toBe('non-ascii');
  });
  it('honours allowedSchemes and refuses unsafe configuration', () => {
    expect(dl(`ghostpay:${EVM}`, { ...P, allowedSchemes: ['https'] })).toBe('scheme-not-allowed');
    expect(() => parseDeepLink('x', { ...P, allowedSchemes: ['javascript'] })).toThrow(TypeError);
  });
  it('custom routes', () => {
    expect(dl(`https://${HOST}/home`, { ...P, routes: ['/home'] })).toMatchObject({
      kind: 'navigate',
      path: '/home',
    });
  });
  it('treats http as an unsupported scheme', () => {
    expect(dl(`http://${HOST}/pay`)).toBe('scheme-not-allowed');
  });
  it('routes /share-target to the share parser', () => {
    expect(dl(`https://${HOST}/share-target?text=${enc(EVM)}`)).toMatchObject({ kind: 'address' });
  });
});

describe('parseShareTarget', () => {
  const st = (q: unknown, p = P) => {
    const r = parseShareTarget(q, p);
    return r.ok ? r.value : r.code;
  };
  it('extracts an address from text', () => {
    expect(st(`?title=Pay&text=${enc(`please send to ${EVM}.`)}`)).toMatchObject({
      kind: 'address',
      warnings: [],
    });
  });
  it('extracts an invoice link from url and warns the fragment travelled in the query', () => {
    const v = st(`url=${enc(`https://${HOST}/pay${FRAG}`)}&title=Invoice`);
    expect(v).toMatchObject({ kind: 'invoice-link', warnings: ['fragment-in-query'] });
  });
  it('extracts a link and a ghostpay URI from text tokens', () => {
    expect(st(`text=${enc(`<ghostpay:${EVM}?amount=3>`)}`)).toMatchObject({ kind: 'payment-uri' });
    expect(st(`text=${enc(`(https://${HOST}/pay${FRAG})`)}`)).toMatchObject({ kind: 'invoice-link' });
  });
  it('accepts the same payload repeated; rejects two different payloads', () => {
    expect(st(`url=${enc(EVM)}&text=${enc(EVM)}`)).toMatchObject({ kind: 'address' });
    expect(st(`text=${enc(`${EVM} ${BECH}`)}`)).toBe('ambiguous-share');
  });
  it('rejects nothing-recognised, bad url, duplicates, too many params, too big, wrong type', () => {
    expect(st('text=hello+world')).toBe('nothing-recognized');
    expect(st(`url=${enc('javascript:alert(1)')}`)).toBe('scheme-not-allowed');
    expect(st(`url=${enc('https://evil.test/pay' + FRAG)}`)).toBe('host-not-allowed');
    expect(st(`text=a&text=b`)).toBe('bad-share');
    expect(st(Array.from({ length: 17 }, (_, i) => `k${i}=1`).join('&'))).toBe('too-many-params');
    expect(
      st(
        Array.from({ length: 33 }, (_, i) => `w${i}`)
          .map((w) => w)
          .join('+')
          .replace(/^/, 'text='),
      ),
    ).toBe('too-many-params');
    expect(st('')).toBe('empty');
    expect(st('?')).toBe('empty');
    expect(st('a'.repeat(30_000))).toBe('too-large');
    expect(st(5)).toBe('not-string');
  });
  it('ignores unknown params (within the cap)', () => {
    expect(st(`foo=bar&text=${enc(EVM)}`)).toMatchObject({ kind: 'address' });
  });
});
