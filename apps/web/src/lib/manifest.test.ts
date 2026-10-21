import { describe, expect, it } from 'vitest';
import { ChainAdapterError, loadDeployment } from '@ghostpay/chain-adapters';
import { fakeManifest, fakeManifestJson } from '../test/fakeManifest';
import { readbackManifestJson, readbackRpc } from '../test/readbackRpc';
import { applyVerification, loadManifest, manifestBlockText, verifyManifestOnChain } from './manifest';

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

describe('manifest read-back (fail closed)', () => {
  const manifest = (): ReturnType<typeof fakeManifest> => loadDeployment(readbackManifestJson(84532), 84532);

  it('accepts a manifest whose fee recipient, announcer, fee bps and code hashes match the chain', async () => {
    expect(await verifyManifestOnChain(manifest(), readbackRpc(84532))).toEqual({ ok: true });
  });
  it('refuses when no RPC is configured, and says how to fix it', async () => {
    const o = await verifyManifestOnChain(manifest(), undefined);
    expect(o.ok).toBe(false);
    if (!o.ok) expect(o.reason).toMatch(/RPC/);
  });
  it('refuses a manifest whose fee recipient differs from the router immutable', async () => {
    const o = await verifyManifestOnChain(manifest(), readbackRpc(84532, { feeRecipient: '0x9999999999999999999999999999999999999999' }));
    expect(o.ok).toBe(false);
    if (!o.ok) expect(o.reason).toMatch(/router\.FEE_RECIPIENT/);
  });
  it('refuses a router whose bytecode hash differs from the manifest', async () => {
    const o = await verifyManifestOnChain(manifest(), readbackRpc(84532, { routerCode: '0x6009600955' }));
    expect(o.ok).toBe(false);
    if (!o.ok) expect(o.reason).toMatch(/router\.codehash/);
  });
  it('refuses a sweep relayer address with no code', async () => {
    const o = await verifyManifestOnChain(manifest(), readbackRpc(84532, { noRelayerCode: true }));
    expect(o.ok).toBe(false);
  });
  it('refuses when the RPC fails or reports another chain', async () => {
    const failing = readbackRpc(84532);
    const broken = { ...failing, request: () => Promise.reject(new Error('down')) };
    expect((await verifyManifestOnChain(manifest(), broken)).ok).toBe(false);
    expect((await verifyManifestOnChain(manifest(), readbackRpc(1))).ok).toBe(false);
    const thrower = await verifyManifestOnChain(manifest(), readbackRpc(84532), () => Promise.reject(new Error('boom')));
    expect(thrower.ok).toBe(false);
  });
  it('never leaks chain-supplied text into the reason', async () => {
    const o = await verifyManifestOnChain(manifest(), readbackRpc(84532), () => Promise.reject(new ChainAdapterError('MANIFEST_READBACK_FAILED', '<script>x</script>')));
    expect(JSON.stringify(o)).not.toContain('script');
  });
  it('applyVerification only downgrades a loaded manifest', () => {
    const loaded = { status: 'loaded', manifest: manifest() } as const;
    expect(applyVerification(loaded, { ok: true })).toBe(loaded);
    expect(applyVerification(loaded, { ok: false, reason: 'r' })).toEqual({ status: 'unverified', reason: 'r' });
    expect(applyVerification({ status: 'absent' }, { ok: false, reason: 'r' })).toEqual({ status: 'absent' });
  });
  it('explains every non-loaded state and nothing for a loaded one', () => {
    expect(manifestBlockText({ status: 'loaded', manifest: manifest() })).toBeUndefined();
    expect(manifestBlockText({ status: 'absent' })).toMatch(/no deployment manifest/);
    expect(manifestBlockText({ status: 'invalid', reason: 'x' })).toMatch(/failed validation/);
    expect(manifestBlockText({ status: 'unverified', reason: 'RPC missing' })).toMatch(/could not be verified\. RPC missing/);
  });
});
