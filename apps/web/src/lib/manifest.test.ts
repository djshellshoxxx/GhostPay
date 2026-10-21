import { describe, expect, it } from 'vitest';
import { fakeManifestJson } from '../test/fakeManifest';
import { loadManifest } from './manifest';

const ok = (body: string, status = 200): Promise<Response> => Promise.resolve(new Response(body, { status }));

describe('loadManifest', () => {
  it('loads a valid manifest from the app origin', async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const s = await loadManifest(84532, (url, init) => {
      seen = { url, init };
      return ok(fakeManifestJson(84532));
    });
    expect(s.status).toBe('loaded');
    expect(seen?.url).toBe('./deployments/84532.json');
    expect(seen?.init.credentials).toBe('omit');
    expect(seen?.init.redirect).toBe('error');
    expect(seen?.init.referrerPolicy).toBe('no-referrer');
    if (s.status === 'loaded') expect(s.manifest.feeRecipient).toBe('0x4444444444444444444444444444444444444444');
  });
  it('treats a 404 as absent', async () => {
    expect((await loadManifest(1, () => ok('nope', 404))).status).toBe('absent');
  });
  it('treats an HTML fallback page as absent', async () => {
    expect((await loadManifest(1, () => ok('<!doctype html><html></html>'))).status).toBe('absent');
  });
  it('treats network failure as absent', async () => {
    expect((await loadManifest(1, () => Promise.reject(new TypeError('offline')))).status).toBe('absent');
  });
  it('marks a failing validation as invalid, never loaded', async () => {
    const bad = JSON.parse(fakeManifestJson(84532)) as Record<string, unknown>;
    bad['feeBps'] = 100;
    const s = await loadManifest(84532, () => ok(JSON.stringify(bad)));
    expect(s.status).toBe('invalid');
    const wrongChain = await loadManifest(8453, () => ok(fakeManifestJson(84532)));
    expect(wrongChain.status).toBe('invalid');
    const broken = await loadManifest(84532, () => ok('{ not json'));
    expect(broken.status).toBe('invalid');
  });
  it('uses a custom base URL', async () => {
    let url = '';
    await loadManifest(5, (u) => { url = u; return ok('', 404); }, '/x/');
    expect(url).toBe('/x/deployments/5.json');
  });
});
