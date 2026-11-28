import { describe, expect, it } from 'vitest';
import { fakeManifestJson } from '../test/fakeManifest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import type { RpcClient } from '@ghostpay/chain-adapters';
import { backedManifest, withManifestChain } from '../test/manifestChain';
import { mockRpc } from '../test/mockRpc';
import { loadBundledManifest, MANIFEST_READBACK_KEYS, NO_SECONDARY, openSecondaryReadback, READBACK_REASONS, verifyManifestForFlow, verifyManifestState, type SecondaryReadback } from './manifest';

/** Source text without comments, produced by the TypeScript printer so comment-like text in strings is kept. */
const stripComments = (text: string): string =>
  ts.createPrinter({ removeComments: true }).printFile(ts.createSourceFile('manifest.ts', text, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS));

// SEC-14 / D-09: the legacy text-manifest scheme (runtime fetch of ./deployments, sha256/ed25519 text signatures, domain
// GhostPay-deployment-manifest-v1, unsigned-dev acceptance on testnets, console.warn) is gone from the app; the only
// manifest source is the bundled, release-signed one.
describe('manifest trust (strict bundled path only)', () => {
  it('exports no runtime-fetch or unsigned-dev manifest loader', async () => {
    const mod = (await import('./manifest')) as Record<string, unknown>;
    // The two-provider read-back (L2-I4) adds its pure helpers and tables; still no loader besides the bundled one.
    expect(Object.keys(mod).sort()).toEqual([
      'MANIFEST_READBACK_KEYS', 'NO_SECONDARY', 'READBACK_REASONS',
      'loadBundledManifest', 'openSecondaryReadback', 'verifyManifestForFlow', 'verifyManifestState',
    ]);
    const source = stripComments(readFileSync(fileURLToPath(new URL('./manifest.ts', import.meta.url)), 'utf8'));
    for (const forbidden of [/\bfetch\b/, /deployments\//, /verifyTextManifestSignature/, /console\./, /\btestnet\b/]) {
      expect(source, String(forbidden)).not.toMatch(forbidden);
    }
    // The type keeps 'unsigned-dev' for the views' warning; every produced state is 'signed'.
    const produced = [...source.matchAll(/\btrust:\s*([^,}\s]+)/g)].map((m) => m[1]);
    expect(produced.length).toBeGreaterThan(0);
    expect(new Set(produced)).toEqual(new Set(["'signed'"]));
  });
  it('never yields unsigned-dev: an unsigned testnet manifest is invalid with or without keys', () => {
    for (const keys of [[], [`02${'11'.repeat(32)}`]]) {
      const s = loadBundledManifest(84532, { '84532': fakeManifestJson(84532) }, keys);
      expect(s.status).toBe('invalid');
    }
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
  it('attributes a primary read failure to the RPC and an agreed mismatch to the chain, never to the second provider', async () => {
    expect(causeOf(await verifyManifestState(state, broken(), second(good()), noSleep))).toBe('rpc-unreadable');
    expect(causeOf(await verifyManifestState(state, withManifestChain(broken(), WRONG_FEE), second(withManifestChain(broken(), WRONG_FEE)), noSleep))).toBe('readback');
  });
  it('keeps the single-provider behaviour with no second RPC and passes non-loaded states through', async () => {
    expect((await verifyManifestState(state, good(), NO_SECONDARY)).status).toBe('loaded');
    expect(await verifyManifestState(state, withManifestChain(broken(), WRONG_FEE), NO_SECONDARY)).toEqual({ status: 'invalid', reason: READBACK_REASONS.readback, cause: 'readback' });
    expect(await verifyManifestState(state, broken(), NO_SECONDARY)).toEqual({ status: 'invalid', reason: READBACK_REASONS['rpc-unreadable'], cause: 'rpc-unreadable' });
    expect(await verifyManifestState({ status: 'absent' }, good(), { kind: 'unavailable' })).toEqual({ status: 'absent' });
  });
  it('has a catalog key for every cause', () => {
    expect(Object.keys(MANIFEST_READBACK_KEYS).sort()).toEqual(Object.keys(READBACK_REASONS).sort());
    for (const key of Object.values(MANIFEST_READBACK_KEYS)) expect(key).toMatch(/^manifest\.readback\./);
  });
  it('verifyManifestForFlow forwards the second provider and still fails closed without a primary', async () => {
    expect(causeOf(await verifyManifestForFlow(state, good(), second(withManifestChain(broken(), WRONG_FEE)), noSleep))).toBe('providers-disagree');
    expect((await verifyManifestForFlow(state, good(), second(good()), noSleep)).status).toBe('loaded');
    const noRpc = await verifyManifestForFlow(state, undefined, { kind: 'unavailable' });
    expect(noRpc.status === 'invalid' && noRpc.reason).toMatch(/RPC.*needed/);
  });
  it('never puts provider text or URLs into a reason, whichever provider failed', async () => {
    for (const r of Object.values(READBACK_REASONS)) expect(r).not.toMatch(/https?:|@/);
    for (const s of [
      await verifyManifestState(state, good(), second(broken()), noSleep),
      await verifyManifestState(state, broken(), second(good()), noSleep),
      await verifyManifestState(state, broken(), NO_SECONDARY),
    ]) {
      expect(s.status).toBe('invalid');
      expect(JSON.stringify(s)).not.toContain(LEAK);
    }
  });
});
