import { describe, expect, it } from 'vitest';
import { buildConnectSources, buildCsp, findUnsafeAnchors, sriDigest, verifySri } from './web.js';
import { MetadataHardeningError } from './guard.js';

const enc = new TextEncoder();

describe('MH-WEB-1 anchors', () => {
  it('flags target=_blank without rel noreferrer+noopener', () => {
    const html = [
      '<a href="x" target="_blank">1</a>',
      '<a href="x" target="_blank" rel="noopener">2</a>',
      '<a href="x" target="_blank" rel="noreferrer">3</a>',
      '<a href="x" target="_blank" rel="noopener noreferrer">ok</a>',
      "<a href='x' target='_blank' rel='NOREFERRER  noopener'>ok</a>",
      '<a href="x" target=_blank rel=noopener>5</a>',
      '<a href="x">same tab</a>',
      '<A HREF="x" TARGET="_BLANK">7</A>',
    ].join('\n');
    expect(findUnsafeAnchors(html)).toEqual([
      { index: 0, reason: 'MISSING_REL' },
      { index: 1, reason: 'MISSING_NOREFERRER' },
      { index: 2, reason: 'MISSING_NOOPENER' },
      { index: 5, reason: 'MISSING_NOREFERRER' },
      { index: 7, reason: 'MISSING_REL' },
    ]);
    expect(findUnsafeAnchors('<p>no anchors</p>')).toEqual([]);
  });
});

describe('MH-WEB-2 CSP', () => {
  it('builds a deduplicated, sorted connect-src with no unsafe keywords', () => {
    const csp = buildCsp(['https://b.example', 'https://a.example/', 'https://b.example', 'wss://c.example', 'http://127.0.0.1:8545']);
    expect(csp).toBe(
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self' http://127.0.0.1:8545 https://a.example https://b.example wss://c.example",
    );
    expect(csp).not.toMatch(/unsafe-|\*/);
  });
  it('with no origins only allows self', () => {
    expect(buildCsp([])).toMatch(/connect-src 'self'$/);
  });
  it('rejects wildcards, paths, creds, plain http remote, junk, too many', () => {
    for (const bad of ['https://*.example', 'https://a.example/rpc', 'https://u:p@a.example', 'http://a.example', 'ftp://a.example', 'https://a.example?x=1', 'https://a.example#f', 'not a url']) {
      expect(() => buildConnectSources([bad])).toThrow(MetadataHardeningError);
    }
    expect(() => buildConnectSources(Array.from({ length: 33 }, (_, i) => `https://h${i}.example`))).toThrow(MetadataHardeningError);
  });
});

describe('MH-WEB-3 SRI', () => {
  it('matches published empty-input digests', () => {
    expect(sriDigest(new Uint8Array(0))).toBe('sha384-OLBgp1GsljhM2TJ+sbHjaiH9txEUvgdDTAzHv2P24donTt6/529l+9Ua0vFImLlb');
    expect(sriDigest(new Uint8Array(0), 'sha256')).toBe('sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=');
  });
  it('verifies, and a single altered byte fails', () => {
    const sdk = enc.encode('console.log("ghostpay-embed-v1")');
    const sri = sriDigest(sdk);
    expect(verifySri(sdk, sri)).toBe(true);
    const bad = sdk.slice();
    bad[3] = (bad[3] ?? 0) ^ 1;
    expect(verifySri(bad, sri)).toBe(false);
  });
  it('strongest algorithm wins; weaker matching hash cannot rescue a failing stronger one', () => {
    const data = enc.encode('abc');
    const good256 = sriDigest(data, 'sha256');
    const wrong512 = sriDigest(enc.encode('zzz'), 'sha512');
    expect(verifySri(data, `${good256} ${wrong512}`)).toBe(false);
    expect(verifySri(data, `${wrong512} ${sriDigest(data, 'sha512')}`)).toBe(true);
    expect(verifySri(data, `${sriDigest(data, 'sha384')}?opt=1`)).toBe(true);
  });
  it('fails closed on malformed or unsupported metadata', () => {
    const d = enc.encode('abc');
    expect(verifySri(d, '')).toBe(false);
    expect(verifySri(d, 'md5-abcd')).toBe(false);
    expect(verifySri(d, 'sha384-!!!')).toBe(false);
  });
});
