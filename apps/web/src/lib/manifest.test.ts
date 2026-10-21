import { describe, expect, it } from 'vitest';
import { fakeManifestJson } from '../test/fakeManifest';
import { ed25519 } from '@noble/curves/ed25519.js';
import { manifestSigningBytes, type ReleaseKey } from '@ghostpay/chain-adapters';
import { backedManifest, withManifestChain } from '../test/manifestChain';
import { mockRpc } from '../test/mockRpc';
import { loadManifest, verifyManifestState } from './manifest';

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

  it('flags an unsigned testnet manifest loudly and refuses an unsigned mainnet one', async () => {
    const s = await loadManifest(84532, () => ok(fakeManifestJson(84532)));
    expect(s.status === 'loaded' && s.trust).toBe('unsigned-dev');
    expect(s.status === 'loaded' && s.warning).toMatch(/UNSIGNED DEV MANIFEST/);
    expect((await loadManifest(8453, () => ok(fakeManifestJson(8453)))).status).toBe('invalid');
    expect((await loadManifest(999999, () => ok(fakeManifestJson(999999)))).status).toBe('invalid');
  });
  describe('with a pinned release key', () => {
    const priv = ed25519.utils.randomSecretKey();
    const hex = (b: Uint8Array): `0x${string}` => `0x${Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')}`;
    const key: ReleaseKey = { alg: 'ed25519', publicKey: hex(ed25519.getPublicKey(priv)) };
    const signed = (mutate?: (o: Record<string, unknown>) => void): string => {
      const text = fakeManifestJson(84532);
      const sig = hex(ed25519.sign(manifestSigningBytes(text), priv));
      const o = { ...(JSON.parse(text) as Record<string, unknown>), signature: sig };
      mutate?.(o);
      return JSON.stringify(o);
    };
    it('loads a correctly signed manifest as signed', async () => {
      const s = await loadManifest(84532, () => ok(signed()), './', key);
      expect(s.status === 'loaded' && s.trust).toBe('signed');
    });
    it('rejects tampered, unsigned or foreign-signed manifests as invalid', async () => {
      const tampered = signed((o) => { o['feeRecipient'] = '0x5555555555555555555555555555555555555555'; });
      expect((await loadManifest(84532, () => ok(tampered), './', key)).status).toBe('invalid');
      expect((await loadManifest(84532, () => ok(fakeManifestJson(84532)), './', key)).status).toBe('invalid');
      const other: ReleaseKey = { alg: 'ed25519', publicKey: hex(ed25519.getPublicKey(ed25519.utils.randomSecretKey())) };
      expect((await loadManifest(84532, () => ok(signed()), './', other)).status).toBe('invalid');
    });
  });
  describe('verifyManifestState', () => {
    const base = mockRpc(84532, () => { throw new Error('unexpected'); });
    const state = { status: 'loaded', manifest: backedManifest(84532) } as const;
    it('keeps a manifest that matches the chain', async () => {
      expect((await verifyManifestState(state, withManifestChain(base))).status).toBe('loaded');
    });
    it('turns a fee recipient mismatch, wrong code or RPC failure into invalid (fail closed)', async () => {
      expect((await verifyManifestState(state, withManifestChain(base, { feeRecipient: '0x00000000000000000000000000000000deadbeef' }))).status).toBe('invalid');
      expect((await verifyManifestState(state, withManifestChain(base, { code: {} }))).status).toBe('invalid');
      expect((await verifyManifestState(state, base)).status).toBe('invalid');
    });
    it('passes through absent/invalid states', async () => {
      expect(await verifyManifestState({ status: 'absent' }, base)).toEqual({ status: 'absent' });
    });
  });
});
