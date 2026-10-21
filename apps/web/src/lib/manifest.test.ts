import { secp256k1 } from '@noble/curves/secp256k1.js';
import { manifestDigest, validateManifest } from '@ghostpay/chain-adapters';
import { describe, expect, it } from 'vitest';
import { BUNDLED_MANIFESTS } from './bundledManifests';
import { loadManifest } from './manifest';
import { RELEASE_PUBLIC_KEYS } from './releaseKeys';
import { fakeManifestJson } from '../test/fakeManifest';

const hex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const src = (id: number, over: Record<string, unknown> = {}): Record<string, string> => ({
  [String(id)]: JSON.stringify({ ...(JSON.parse(fakeManifestJson(id)) as object), ...over }),
});

describe('bundled manifests (S3-01)', () => {
  it('ships none until a reviewed deployment exists, and no release keys by default', () => {
    expect(Object.keys(BUNDLED_MANIFESTS)).toEqual([]);
    expect(RELEASE_PUBLIC_KEYS).toEqual([]);
    expect(loadManifest(84532)).toEqual({ status: 'absent' });
  });
});

describe('loadManifest (offline, from the bundle)', () => {
  it('loads and validates a bundled manifest without any network access', () => {
    const s = loadManifest(84532, src(84532), []);
    expect(s.status).toBe('loaded');
    if (s.status === 'loaded') {
      expect(s.manifest.feeRecipient).toBe('0x4444444444444444444444444444444444444444');
      expect(s.signature).toBe('unsigned');
    }
  });
  it('is absent for other chains and ignores prototype keys', () => {
    expect(loadManifest(1, src(84532), []).status).toBe('absent');
    expect(loadManifest(0, Object.create({ 0: fakeManifestJson(0) }) as Record<string, string>, []).status).toBe('absent');
  });
  it('marks a failing validation as invalid, never loaded', () => {
    expect(loadManifest(84532, src(84532, { feeBps: 100 }), []).status).toBe('invalid');
    expect(loadManifest(8453, { '8453': fakeManifestJson(84532) }, []).status).toBe('invalid');
    expect(loadManifest(84532, { '84532': '{ not json' }, []).status).toBe('invalid');
  });
  it('reports a signature without release keys as unverifiable, not valid', () => {
    const s = loadManifest(84532, src(84532, { signature: `0x${'11'.repeat(64)}` }), []);
    expect(s.status === 'loaded' && s.signature).toBe('unverifiable');
  });
  it('with release keys compiled in, requires a valid signature (fail closed)', () => {
    const sk = secp256k1.utils.randomSecretKey();
    const pub = hex(secp256k1.getPublicKey(sk, true));
    const base = JSON.parse(fakeManifestJson(84532)) as Record<string, unknown>;
    const digest = Uint8Array.from((manifestDigest(validateManifest(base, 84532)).slice(2).match(/../g) ?? []).map((h) => parseInt(h, 16)));
    const signature = `0x${hex(secp256k1.sign(digest, sk, { prehash: false, lowS: true }))}`;
    const good = loadManifest(84532, src(84532, { signature }), [pub]);
    expect(good.status === 'loaded' && good.signature).toBe('valid');
    expect(loadManifest(84532, src(84532), [pub]).status).toBe('invalid');
    expect(loadManifest(84532, src(84532, { signature: `0x${'22'.repeat(64)}` }), [pub]).status).toBe('invalid');
    expect(loadManifest(84532, src(84532, { signature, feeRecipient: '0x5555555555555555555555555555555555555555' }), [pub]).status).toBe('invalid');
  });
});
