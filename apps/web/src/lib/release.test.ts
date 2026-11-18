import { describe, expect, it } from 'vitest';
import { computeReleaseHash, entryScriptUrl } from './release';

describe('release hash', () => {
  it('hashes the same-origin entry script', async () => {
    const body = new TextEncoder().encode('abc');
    const r = await computeReleaseHash('./assets/index-1.js', () => Promise.resolve(new Response(body)), 'https://app.test');
    expect(r.file).toBe('index-1.js');
    expect(r.sha256).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('refuses cross-origin scripts and failed fetches', async () => {
    await expect(computeReleaseHash('https://evil.test/a.js', () => Promise.resolve(new Response('x')), 'https://app.test')).rejects.toThrow(/cross-origin/);
    await expect(computeReleaseHash('/a.js', () => Promise.resolve(new Response('x', { status: 404 })), 'https://app.test')).rejects.toThrow(/fetch failed/);
  });
  it('resolves the entry script against the document URL, so it stays inside a project sub-path', async () => {
    const urls: string[] = [];
    const fetchFn = (url: string): Promise<Response> => { urls.push(url); return Promise.resolve(new Response('abc')); };
    const r = await computeReleaseHash('./assets/index-1.js', fetchFn, 'https://owner.github.io/GhostPay/');
    expect(urls).toEqual(['https://owner.github.io/GhostPay/assets/index-1.js']);
    expect(r.file).toBe('index-1.js');
    // A document URL with a fragment or a file name resolves the same way.
    await computeReleaseHash('./assets/index-1.js', fetchFn, 'https://owner.github.io/GhostPay/index.html#gpi=v1.x');
    expect(urls[1]).toBe('https://owner.github.io/GhostPay/assets/index-1.js');
    // Another origin is still refused, whatever the path.
    await expect(computeReleaseHash('https://owner2.github.io/GhostPay/assets/a.js', fetchFn, 'https://owner.github.io/GhostPay/')).rejects.toThrow(/cross-origin/);
  });
  it('finds the entry script in a document', () => {
    const doc = { querySelectorAll: () => [{ getAttribute: () => './assets/index-1.js' }, { getAttribute: () => null }] } as unknown as Document;
    expect(entryScriptUrl(doc)).toBe('./assets/index-1.js');
    expect(entryScriptUrl({ querySelectorAll: () => [] } as unknown as Document)).toBeUndefined();
  });
});
