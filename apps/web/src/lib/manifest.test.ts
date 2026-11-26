import { describe, expect, it } from 'vitest';
import { fakeManifestJson } from '../test/fakeManifest';
import { ed25519 } from '@noble/curves/ed25519.js';
import { manifestSigningBytes, type ReleaseKey, type RpcClient } from '@ghostpay/chain-adapters';
import { backedManifest, withManifestChain } from '../test/manifestChain';
import { mockRpc } from '../test/mockRpc';
import { loadBundledManifest, loadManifest, NO_SECONDARY, openSecondaryReadback, READBACK_REASONS, verifyManifestForFlow, verifyManifestState, type SecondaryReadback } from './manifest';

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
  describe('verifyManifestForFlow (A7-3)', () => {
    const base = mockRpc(84532, () => { throw new Error('unexpected'); });
    const state = { status: 'loaded', manifest: backedManifest(84532) } as const;
    it('fails closed with no RPC: a loaded manifest becomes invalid, never loaded', async () => {
      const s = await verifyManifestForFlow(state, undefined);
      expect(s.status).toBe('invalid');
      expect(s.status === 'invalid' && s.reason).toMatch(/RPC.*needed/);
    });
    it('fails closed on a readback mismatch', async () => {
      expect((await verifyManifestForFlow(state, withManifestChain(base, { feeRecipient: '0x00000000000000000000000000000000deadbeef' }))).status).toBe('invalid');
    });
    it('keeps a matching manifest and passes non-loaded states through, with or without an RPC', async () => {
      expect((await verifyManifestForFlow(state, withManifestChain(base))).status).toBe('loaded');
      expect(await verifyManifestForFlow({ status: 'absent' }, undefined)).toEqual({ status: 'absent' });
      const invalid = { status: 'invalid', reason: 'x' } as const;
      expect(await verifyManifestForFlow(invalid, base)).toEqual(invalid);
    });
  });
});


describe('static Pages deployment-manifest gates', () => {
  it('rejects testnet manifests without pinned release verification keys', () => {
    const state = loadBundledManifest(84532, { '84532': fakeManifestJson(84532) }, []);
    expect(state.status).toBe('invalid');
    if (state.status === 'invalid') expect(state.reason).toMatch(/No release verification key/);
  });

  it('ignores manifests inherited from the source object prototype', () => {
    const inherited = Object.create({ '84532': fakeManifestJson(84532) }) as Record<string, string>;
    expect(loadBundledManifest(84532, inherited, [`02${'11'.repeat(32)}`])).toEqual({ status: 'absent' });
  });

  it('rejects an unsigned bundled manifest even when a release key is configured', () => {
    const state = loadBundledManifest(84532, { '84532': fakeManifestJson(84532) }, [`02${'11'.repeat(32)}`]);
    expect(state.status).toBe('invalid');
  });

  it('requires on-chain verification before a loaded manifest can authorize payment flows', async () => {
    const state = { status: 'loaded', manifest: backedManifest(84532) } as const;
    expect((await verifyManifestForFlow(state, undefined)).status).toBe('invalid');
    const offline = mockRpc(84532, () => { throw new Error('offline'); });
    expect((await verifyManifestForFlow(state, offline)).status).toBe('invalid');
    expect((await verifyManifestForFlow(state, withManifestChain(offline))).status).toBe('loaded');
  });
});

describe('two-provider manifest read-back (L2-I4)', () => {
  const noSleep = { sleep: (): Promise<void> => Promise.resolve() };
  const state = { status: 'loaded', manifest: backedManifest(84532) } as const;
  const WRONG_FEE = { feeRecipient: '0x00000000000000000000000000000000deadbeef' };
  const LEAK = 'https://secret@rpc.example/leak';
  const broken = (chainId = 84532): RpcClient => mockRpc(chainId, () => { throw new Error(LEAK); });
  const good = (chainId = 84532): RpcClient => withManifestChain(broken(chainId));
  const second = (client: RpcClient): SecondaryReadback => ({ kind: 'client', client });
  const counting = (client: RpcClient, log: string[]): RpcClient => ({ ...client, request: (m, p) => { log.push(m); return client.request(m, p); } });
  const causeOf = (s: Awaited<ReturnType<typeof verifyManifestState>>): string | undefined => (s.status === 'invalid' ? s.cause : s.status);

  it('opens the second RPC: none when unconfigured, client when it opens, unavailable when it cannot be used', async () => {
    expect(await openSecondaryReadback(() => Promise.resolve(undefined))).toEqual({ kind: 'none' });
    const c = good();
    expect(await openSecondaryReadback(() => Promise.resolve(c))).toEqual({ kind: 'client', client: c });
    expect(await openSecondaryReadback(() => Promise.reject(new Error(LEAK)))).toEqual({ kind: 'unavailable' });
  });
  it('keeps a manifest that both providers confirm, asking both for every read', async () => {
    const la: string[] = [];
    const lb: string[] = [];
    const s = await verifyManifestState(state, counting(good(), la), second(counting(good(), lb)), noSleep);
    expect(s.status).toBe('loaded');
    expect(la.length).toBeGreaterThan(0);
    expect(lb).toEqual(la);
    expect(la).toContain('eth_getCode');
    expect(la).toContain('eth_call');
  });
  it('refuses when the providers disagree, with the fixed-form reason and the cause', async () => {
    const s = await verifyManifestState(state, good(), second(withManifestChain(broken(), WRONG_FEE)), noSleep);
    expect(s).toEqual({ status: 'invalid', reason: READBACK_REASONS['providers-disagree'], cause: 'providers-disagree' });
  });
  it('refuses when the second RPC could not be opened, fails mid-read or is on another chain: no fallback to one provider', async () => {
    const expected = { status: 'invalid', reason: READBACK_REASONS['second-rpc-unavailable'], cause: 'second-rpc-unavailable' };
    expect(await verifyManifestState(state, good(), { kind: 'unavailable' }, noSleep)).toEqual(expected);
    expect(await verifyManifestState(state, good(), second(broken()), noSleep)).toEqual(expected);
    expect(await verifyManifestState(state, good(), second(good(1)), noSleep)).toEqual(expected);
  });
  it('blames the chain, not the second provider, when the primary fails or both providers agree on a mismatch', async () => {
    expect(causeOf(await verifyManifestState(state, broken(), second(good()), noSleep))).toBe('readback');
    expect(causeOf(await verifyManifestState(state, withManifestChain(broken(), WRONG_FEE), second(withManifestChain(broken(), WRONG_FEE)), noSleep))).toBe('readback');
  });
  it('is unchanged with no second RPC and passes non-loaded states through', async () => {
    expect((await verifyManifestState(state, good(), NO_SECONDARY)).status).toBe('loaded');
    expect(causeOf(await verifyManifestState(state, withManifestChain(broken(), WRONG_FEE), NO_SECONDARY))).toBe('readback');
    expect(await verifyManifestState({ status: 'absent' }, good(), { kind: 'unavailable' })).toEqual({ status: 'absent' });
  });
  it('verifyManifestForFlow forwards the second provider and still fails closed without a primary', async () => {
    expect(causeOf(await verifyManifestForFlow(state, good(), second(withManifestChain(broken(), WRONG_FEE)), noSleep))).toBe('providers-disagree');
    expect((await verifyManifestForFlow(state, good(), second(good()), noSleep)).status).toBe('loaded');
    const noRpc = await verifyManifestForFlow(state, undefined, { kind: 'unavailable' });
    expect(noRpc.status === 'invalid' && noRpc.reason).toMatch(/RPC.*needed/);
  });
  it('never puts provider text or URLs into a reason', async () => {
    for (const r of Object.values(READBACK_REASONS)) expect(r).not.toMatch(/https?:|@/);
    const s = await verifyManifestState(state, good(), second(broken()), noSleep);
    expect(JSON.stringify(s)).not.toContain(LEAK);
  });
});
