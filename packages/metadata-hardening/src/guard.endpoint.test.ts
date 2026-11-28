import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MetadataHardeningError, parseEndpoint, randomBelow, randomInt, shuffle } from './guard.js';

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

describe('parseEndpoint: normalisation', () => {
  it('keeps origin plus path, drops every trailing slash', () => {
    expect(parseEndpoint('https://rpc.example')).toBe('https://rpc.example');
    expect(parseEndpoint('https://rpc.example/')).toBe('https://rpc.example');
    expect(parseEndpoint('https://rpc.example/v2/')).toBe('https://rpc.example/v2');
    // Regression: a double slash used to normalise to "https://rpc.example/".
    expect(parseEndpoint('https://rpc.example//')).toBe('https://rpc.example');
    expect(parseEndpoint('https://rpc.example/v2///')).toBe('https://rpc.example/v2');
  });
  it('normalises case, default ports and internationalised hosts', () => {
    expect(parseEndpoint('HTTPS://RPC.Example:443/Path')).toBe('https://rpc.example/Path');
    expect(parseEndpoint('https://bücher.example/rpc')).toBe('https://xn--bcher-kva.example/rpc');
  });
  it('accepts loopback http only', () => {
    expect(parseEndpoint('http://127.0.0.1:8545')).toBe('http://127.0.0.1:8545');
    expect(parseEndpoint('http://localhost:8545/')).toBe('http://localhost:8545');
    expect(parseEndpoint('http://[::1]:8545')).toBe('http://[::1]:8545');
    expect(code(() => parseEndpoint('http://rpc.example'))).toBe('INVALID_INPUT');
    expect(code(() => parseEndpoint('http://localhost.example'))).toBe('INVALID_INPUT');
  });
  it('is idempotent', () => {
    fc.assert(
      fc.property(fc.webUrl({ validSchemes: ['https'], withQueryParameters: false, withFragments: false }), (u) => {
        let once: string;
        try {
          once = parseEndpoint(u);
        } catch (e) {
          expect(e).toBeInstanceOf(MetadataHardeningError);
          return;
        }
        expect(parseEndpoint(once)).toBe(once);
      }),
      { seed: 0x6d68, numRuns: 300 },
    );
  });
});

describe('parseEndpoint: rejected inputs fail with a typed error and never echo the input', () => {
  const bad: unknown[] = [
    undefined,
    null,
    42,
    true,
    {},
    [],
    ['https://rpc.example'],
    { toString: () => 'https://rpc.example' },
    new URL('https://rpc.example'),
    Symbol.iterator,
    '',
    ' ',
    'not a url',
    'ftp://rpc.example',
    'javascript:alert(1)',
    'data:text/plain,x',
    `https://user:${SENTINEL}@rpc.example`,
    `https://rpc.example/?key=${SENTINEL}`,
    `https://rpc.example/#${SENTINEL}`,
    `https://rpc.example?${SENTINEL}`,
    `https://rpc.example#`.replace('#', `#${SENTINEL}`),
    `http://rpc.example/${SENTINEL}`,
    `https://rpc.example/${'a'.repeat(5000)}${SENTINEL}`,
  ];
  for (const input of bad) {
    it(`rejects ${typeof input === 'string' ? JSON.stringify(input.slice(0, 40)) : Object.prototype.toString.call(input)}`, () => {
      let err: unknown;
      try {
        parseEndpoint(input as string);
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(MetadataHardeningError);
      expect((err as MetadataHardeningError).code).toBe('INVALID_INPUT');
      expect((err as Error).message).not.toContain(SENTINEL);
      expect((err as Error).message).not.toMatch(/rpc\.example/);
    });
  }
  it('bounds the URL length (LIMIT before parsing)', () => {
    expect(code(() => parseEndpoint(`https://rpc.example/${'a'.repeat(4096)}`))).toBe('INVALID_INPUT');
    expect(parseEndpoint(`https://rpc.example/${'a'.repeat(1000)}`)).toHaveLength('https://rpc.example/'.length + 1000);
  });
  it('handles pathological slash runs in linear time', () => {
    const t0 = Date.now();
    code(() => parseEndpoint(`https://rpc.example/${'/'.repeat(2000)}x/`));
    expect(Date.now() - t0).toBeLessThan(1000);
  });
});

describe('guard: random helpers reject unexpected runtime types', () => {
  it('randomBelow needs a bigint in range', () => {
    for (const v of [undefined, null, 5, '5', {}, [], 0n, -1n, (1n << 256n) + 1n]) {
      expect(code(() => randomBelow(v as bigint))).toBe('INVALID_INPUT');
    }
    expect(randomBelow(1n)).toBe(0n);
  });
  it('randomInt needs a positive safe integer', () => {
    for (const v of [undefined, null, '5', 0, -1, 1.5, NaN, Infinity, 2 ** 53]) {
      expect(code(() => randomInt(v as number))).toBe('INVALID_INPUT');
    }
  });
  it('shuffle needs an array and does not mutate it', () => {
    for (const v of [undefined, null, 'abc', 5, {}, new Set([1])]) {
      expect(code(() => shuffle(v as number[]))).toBe('INVALID_INPUT');
    }
    const input = Object.freeze([1, 2, 3, 4, 5]);
    const out = shuffle(input);
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5]);
    expect(input).toEqual([1, 2, 3, 4, 5]);
  });
  it('an injected rng that is not a function-bearing object fails typed', () => {
    expect(code(() => randomBelow(10n, {} as never))).toBe('INVALID_INPUT');
    expect(code(() => randomBelow(10n, { getRandomValues: 1 } as never))).toBe('INVALID_INPUT');
  });
});
