import { describe, expect, it } from 'vitest';
import { fakeManifestJson } from '../test/fakeManifest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { backedManifest, withManifestChain } from '../test/manifestChain';
import { mockRpc } from '../test/mockRpc';
import { loadBundledManifest, verifyManifestForFlow, verifyManifestState } from './manifest';

/** Source text without comments, produced by the TypeScript printer so comment-like text in strings is kept. */
const stripComments = (text: string): string =>
  ts.createPrinter({ removeComments: true }).printFile(ts.createSourceFile('manifest.ts', text, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS));

// SEC-14 / D-09: the legacy text-manifest scheme (runtime fetch of ./deployments, sha256/ed25519 text signatures, domain
// GhostPay-deployment-manifest-v1, unsigned-dev acceptance on testnets, console.warn) is gone from the app; the only
// manifest source is the bundled, release-signed one.
describe('manifest trust (strict bundled path only)', () => {
  it('exports no runtime-fetch or unsigned-dev manifest loader', async () => {
    const mod = (await import('./manifest')) as Record<string, unknown>;
    expect(Object.keys(mod).sort()).toEqual(['loadBundledManifest', 'verifyManifestForFlow', 'verifyManifestState']);
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
