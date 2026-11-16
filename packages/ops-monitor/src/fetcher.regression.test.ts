import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fetchBytes } from './fetcher.js';
import type { ReleaseConfig } from './types.js';

function captureUrl(): { release: ReleaseConfig; urls: string[] } {
  const urls: string[] = [];
  return {
    urls,
    release: {
      mirrors: [], sha256sums: '', files: [],
      fetch: (url) => {
        urls.push(url);
        return Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) });
      },
    },
  };
}

describe('release asset URL joining', () => {
  it.each([
    ['https://example.test/base///', '///asset.js', 'https://example.test/base/asset.js'],
    ['', '', '/'],
    ['///', '///', '/'],
    ['https://example.test/a//b', 'a//b', 'https://example.test/a//b/a//b'],
    ['https://example.test/base/\n', '/asset.js', 'https://example.test/base/\n/asset.js'],
  ])('joins %j and %j without changing internal characters', async (base, path, expected) => {
    const { release, urls } = captureUrl();
    expect(await fetchBytes(release, base, path)).toEqual(new Uint8Array());
    expect(urls).toEqual([expected]);
  });

  it('preserves original joining semantics over seeded bounded inputs', async () => {
    const input = fc.array(fc.constantFrom('a', '/', ':', '.', ' ', '\n', '\r', '\u2028', '?', '#'), { maxLength: 120 }).map((chars) => chars.join(''));
    await fc.assert(fc.asyncProperty(input, input, async (base, path) => {
      const { release, urls } = captureUrl();
      await fetchBytes(release, base, path);
      // Bounded reference input keeps the historical pattern safe in this oracle.
      expect(urls).toEqual([`${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`]);
    }), { seed: 20261116, numRuns: 1000 });
  });

  it('processes long internal slash runs without quadratic backtracking', async () => {
    const base = `https://example.test/${'/'.repeat(60_000)}x`;
    const { release, urls } = captureUrl();
    const start = performance.now();
    await fetchBytes(release, base, 'asset.js');
    expect(urls).toEqual([`${base}/asset.js`]);
    expect(performance.now() - start).toBeLessThan(1000);
  });
});
