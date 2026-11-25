import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MetadataHardeningError } from './guard.js';
import { buildConnectSources, buildCsp, sriDigest, verifySri } from './web.js';

const SENTINEL = 'sentinel-secret-7f3a';

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof MetadataHardeningError) return e.code;
    throw e;
  }
  return 'NO_THROW';
}

describe('MH-WEB-2b connect sources', () => {
  it('rejects CSP-significant characters in a host (regression: ";" injected a directive)', () => {
    for (const o of [
      'https://a.example;form-action',
      'https://a.example,b.example',
      "https://a'b.example",
      'https://a"b.example',
      'https://exa_mple.example',
      'https://a.example;script-src-elem',
      'https://*.example',
      'https://a.example\\b',
      'https://a.example|b',
      'https://a.example`b',
      'https://a.example{b',
    ]) {
      expect(code(() => buildConnectSources([o])), o).toBe('INVALID_INPUT');
    }
  });
  it('rejects paths, queries, fragments, credentials and wrong schemes', () => {
    for (const o of [
      'https://a.example/path',
      `https://a.example/?k=${SENTINEL}`,
      `https://a.example/#${SENTINEL}`,
      `https://u:${SENTINEL}@a.example`,
      'http://a.example',
      'ws://a.example',
      'ftp://a.example',
      'javascript:alert(1)',
      'https:',
      '',
    ]) {
      let err: unknown;
      try {
        buildConnectSources([o]);
      } catch (e) {
        err = e;
      }
      expect(err, o).toBeInstanceOf(MetadataHardeningError);
      expect((err as Error).message).not.toContain(SENTINEL);
    }
  });
  it('accepts normal origins and normalises them', () => {
    expect(buildConnectSources(['HTTPS://A.Example:443', 'wss://b.example:8443/', 'http://[::1]:8545', 'ws://localhost', 'https://bücher.example'])).toEqual([
      'http://[::1]:8545',
      'https://a.example',
      'https://xn--bcher-kva.example',
      'ws://localhost',
      'wss://b.example:8443',
    ]);
  });
  it('rejects non-array lists and non-string entries (no toString coercion)', () => {
    for (const v of [undefined, null, 'https://a.example', {}, new Set(['https://a.example'])]) {
      expect(code(() => buildConnectSources(v as string[]))).toBe('INVALID_INPUT');
    }
    for (const e of [undefined, null, 5, {}, ['https://a.example'], { toString: () => 'https://a.example' }, new URL('https://a.example')]) {
      expect(code(() => buildConnectSources([e as unknown as string]))).toBe('INVALID_INPUT');
    }
  });
  it('bounds list size and entry length', () => {
    expect(code(() => buildConnectSources(Array.from({ length: 33 }, (_, i) => `https://h${i}.example`)))).not.toBe('NO_THROW');
    expect(buildConnectSources(Array.from({ length: 32 }, (_, i) => `https://h${i}.example`))).toHaveLength(32);
    expect(code(() => buildConnectSources([`https://${'a'.repeat(3000)}.example`]))).toBe('INVALID_INPUT');
  });
  it('is idempotent, order-independent and does not mutate a frozen input', () => {
    const input = Object.freeze(['https://b.example', 'https://a.example', 'https://b.example/']);
    const once = buildConnectSources(input);
    expect(once).toEqual(['https://a.example', 'https://b.example']);
    expect(buildConnectSources(once)).toEqual(once);
    expect(buildConnectSources([...input].reverse())).toEqual(once);
    expect(input).toEqual(['https://b.example', 'https://a.example', 'https://b.example/']);
  });
});

describe('MH-WEB-2 CSP string', () => {
  it('has exactly six directives for any accepted origin list and never an unsafe keyword', () => {
    const origin = fc.oneof(
      fc.domain().map((d) => `https://${d}`),
      fc.domain().map((d) => `wss://${d}`),
      fc.nat({ max: 65535 }).map((p) => `http://127.0.0.1:${p}`),
    );
    fc.assert(
      fc.property(fc.array(origin, { maxLength: 10 }), (origins) => {
        let csp: string;
        try {
          csp = buildCsp(origins);
        } catch (e) {
          expect(e).toBeInstanceOf(MetadataHardeningError);
          return;
        }
        const directives = csp.split('; ');
        expect(directives).toHaveLength(6);
        expect(directives.map((d) => d.split(' ')[0])).toEqual(['default-src', 'script-src', 'style-src', 'img-src', 'font-src', 'connect-src']);
        expect(csp).not.toMatch(/unsafe-|\*|,|\n|;;/);
        expect(buildCsp(origins)).toBe(csp);
      }),
      { seed: 0x6d68, numRuns: 300 },
    );
  });
  it('a hostile list cannot add a directive', () => {
    expect(() => buildCsp(['https://a.example;object-src'])).toThrow(MetadataHardeningError);
  });
});

describe('MH-WEB-3 SRI: runtime types', () => {
  const bytes = new TextEncoder().encode('hello');
  it('verifySri fails closed (false) for non-string integrity and typed-fails for non-bytes', () => {
    for (const v of [undefined, null, 5, {}, [], ['sha384-x']]) {
      expect(verifySri(bytes, v as string)).toBe(false);
    }
    for (const b of [undefined, null, 'hello', [104, 101], {}]) {
      expect(code(() => verifySri(b as Uint8Array, sriDigest(bytes)))).toBe('INVALID_INPUT');
      expect(code(() => sriDigest(b as Uint8Array))).toBe('INVALID_INPUT');
    }
  });
  it('rejects an unknown algorithm name for sriDigest and an oversized integrity string', () => {
    expect(code(() => sriDigest(bytes, 'md5' as never))).toBe('INVALID_INPUT');
    expect(verifySri(bytes, `${sriDigest(bytes)} ${'sha256-AAAA '.repeat(5000)}`)).toBe(false);
  });
  it('treats ASCII whitespace as the only separator', () => {
    const d = sriDigest(bytes);
    expect(verifySri(bytes, `\t${d}\n`)).toBe(true);
    expect(verifySri(bytes, `sha384-AAAA\u00a0${d}`)).toBe(false);
  });
  it('follows the SRI "strongest algorithm" rule for malformed and mixed-case tokens (W3C SRI 3.3.2-3.3.4)', () => {
    const d384 = sriDigest(bytes);
    // A recognised algorithm with a malformed value still counts as the strongest set: it must not
    // be skipped so that a weaker valid hash can rescue it.
    expect(verifySri(bytes, `sha512-!!! ${d384}`)).toBe(false);
    expect(verifySri(bytes, `sha512 ${d384}`)).toBe(false);
    // Unknown algorithms are ignored when a valid token exists; algorithm names are ASCII case-insensitive.
    expect(verifySri(bytes, `md5-AAAA ${d384}`)).toBe(true);
    expect(verifySri(bytes, d384.replace('sha384', 'SHA384'))).toBe(true);
    // The hash itself is case-sensitive base64.
    expect(verifySri(bytes, d384.toLowerCase())).toBe(false);
    // Options after "?" are ignored.
    expect(verifySri(bytes, `${d384}?ct=application/javascript`)).toBe(true);
    // An empty or all-unknown list fails closed (stricter than the spec, which accepts empty metadata).
    expect(verifySri(bytes, '')).toBe(false);
    expect(verifySri(bytes, 'md5-AAAA')).toBe(false);
  });
  it('round-trips and detects a single flipped byte, repeated', () => {
    const d = sriDigest(bytes, 'sha512');
    for (let i = 0; i < 3; i++) expect(verifySri(bytes, d)).toBe(true);
    const flipped = bytes.slice();
    flipped[0] = (flipped[0] as number) ^ 1;
    expect(verifySri(flipped, d)).toBe(false);
    expect(verifySri(new Uint8Array(0), sriDigest(new Uint8Array(0)))).toBe(true);
  });
  it('digests a large buffer', () => {
    const big = new Uint8Array(8 * 1024 * 1024).fill(7);
    expect(verifySri(big, sriDigest(big))).toBe(true);
  });
});
