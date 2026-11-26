import { describe, expect, it } from 'vitest';
import { CT1_MANIFEST } from '../../manifest.js';
import { toResult } from './errors.js';
import {
  PINNED_MANIFEST_DIGESTS,
  assertApprovedAsset,
  assertDigest,
  assetDigest,
  chainIdOf,
  decodeAssetRef,
  decodeConfidentialAsset,
  digestOf,
  networkId,
  parseNetwork,
  pinnedManifestDigest,
} from './asset.js';
import { CT1_ASSET, CTM_ASSET, mutable } from './fixtures.testutil.js';

const codeOf = (fn: () => unknown): string => {
  const r = toResult(fn);
  return r.ok ? 'ok' : r.code;
};

describe('manifest pin (P13-A05)', () => {
  it('pins the shipped CT-1 manifest and the CT-M descriptor', () => {
    expect(pinnedManifestDigest('ct1-zama')).toBe(PINNED_MANIFEST_DIGESTS['ct1-zama']);
    expect(pinnedManifestDigest('ctm-cleartext')).toBe(PINNED_MANIFEST_DIGESTS['ctm-cleartext']);
    expect(PINNED_MANIFEST_DIGESTS['ct1-zama']).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('fails closed when any manifest value changes (no unpinned fallback)', () => {
    const changed = mutable(CT1_MANIFEST);
    const chains = changed['chains'] as Record<string, { protocol: { acl: string } }>;
    const sepolia = chains['11155111'];
    if (!sepolia) throw new Error('fixture');
    sepolia.protocol.acl = `0x${'00'.repeat(19)}01`;
    expect(codeOf(() => pinnedManifestDigest('ct1-zama', changed))).toBe('P13_MANIFEST_MISMATCH');
    expect(codeOf(() => pinnedManifestDigest('ct1-zama', { ...CT1_MANIFEST, provenance: [] }))).toBe('P13_MANIFEST_MISMATCH');
  });

  it('digestOf is canonical (key order does not matter) and rejects non-canonical values', () => {
    expect(digestOf({ a: 1, b: 'x' })).toBe(digestOf({ b: 'x', a: 1 }));
    expect(() => digestOf({ a: 1.5 })).toThrow();
    expect(() => digestOf({ a: 1n })).toThrow();
  });

  it('validates digests', () => {
    expect(assertDigest(`keccak256:${'ab'.repeat(32)}`)).toMatch(/^keccak256:/);
    expect(codeOf(() => assertDigest(`sha256:${'AB'.repeat(32)}`))).toBe('P13_INVALID_ASSET');
    expect(codeOf(() => assertDigest(`md5:${'ab'.repeat(32)}`))).toBe('P13_INVALID_ASSET');
  });
});

describe('networks', () => {
  it('accepts only the protocol testnet allow-list', () => {
    expect(parseNetwork('eip155:31337', 'ctm-cleartext')).toBe(31337);
    expect(parseNetwork('eip155:11155111', 'ct1-zama')).toBe(11155111);
    expect(networkId(31337)).toBe('eip155:31337');
    expect(codeOf(() => networkId(0))).toBe('P13_INVALID_ASSET');
  });

  it.each(['eip155:1', 'eip155:10', 'eip155:56', 'eip155:137', 'eip155:8453', 'eip155:42161'])('refuses mainnet %s', (n) => {
    expect(codeOf(() => parseNetwork(n, 'ct1-zama'))).toBe('P13_NETWORK_REFUSED');
  });

  it('refuses chains outside the protocol list and malformed network ids', () => {
    expect(codeOf(() => parseNetwork('eip155:84532', 'ct1-zama'))).toBe('P13_NETWORK_REFUSED');
    expect(codeOf(() => parseNetwork('eip155:11155111', 'ctm-cleartext'))).toBe('P13_NETWORK_REFUSED');
    for (const bad of ['eip155:01', 'eip155:', 'bip122:000000000019d6689c085ae165831e93', 'EIP155:1', 'eip155:1 ', 5]) {
      expect(codeOf(() => parseNetwork(bad, 'ct1-zama'))).toBe('P13_INVALID_ASSET');
    }
  });
});

describe('decodeAssetRef', () => {
  const ref = CTM_ASSET.asset;

  it('accepts a canonical token reference', () => {
    expect(decodeAssetRef(mutable(ref))).toEqual(ref);
  });

  it.each([
    ['native marker', { asset: 'native' }],
    ['mixed-case address', { asset: `0x${'C1'.repeat(20)}` }],
    ['zero address', { asset: `0x${'00'.repeat(20)}` }],
    ['short address', { asset: `0x${'c1'.repeat(19)}` }],
    ['negative decimals', { decimals: -1 }],
    ['fractional decimals', { decimals: 6.5 }],
    ['huge decimals', { decimals: 255 }],
    ['wrong schema', { schema: 'ghostpay.asset-ref/v2' }],
    ['symbol as identity', { asset: 'USDC' }],
  ])('rejects %s', (_name, patch) => {
    expect(codeOf(() => decodeAssetRef({ ...mutable(ref), ...patch }))).toBe('P13_INVALID_ASSET');
  });

  it('rejects unknown keys, missing keys, accessors, class instances and arrays', () => {
    expect(codeOf(() => decodeAssetRef({ ...mutable(ref), extra: 1 }))).toBe('P13_INVALID_ASSET');
    const missing = mutable(ref);
    delete missing['decimals'];
    expect(codeOf(() => decodeAssetRef(missing))).toBe('P13_INVALID_ASSET');
    const withGetter = { ...mutable(ref) };
    Object.defineProperty(withGetter, 'asset', { get: () => ref.asset, enumerable: true });
    expect(codeOf(() => decodeAssetRef(withGetter))).toBe('P13_INVALID_ASSET');
    expect(codeOf(() => decodeAssetRef(Object.assign(new (class X {})(), mutable(ref))))).toBe('P13_INVALID_ASSET');
    expect(codeOf(() => decodeAssetRef([ref]))).toBe('P13_INVALID_ASSET');
    expect(codeOf(() => decodeAssetRef(null))).toBe('P13_INVALID_ASSET');
    const withSymbol = { ...mutable(ref), [Symbol('x')]: 1 };
    expect(codeOf(() => decodeAssetRef(withSymbol))).toBe('P13_INVALID_ASSET');
  });
});

describe('decodeConfidentialAsset (P13-A04)', () => {
  it('accepts the synthetic fixtures and is idempotent', () => {
    expect(decodeConfidentialAsset(mutable(CTM_ASSET))).toEqual(CTM_ASSET);
    expect(decodeConfidentialAsset(mutable(CT1_ASSET))).toEqual(CT1_ASSET);
    expect(chainIdOf(CT1_ASSET)).toBe(11155111);
  });

  const patch = (base: object, f: (o: Record<string, unknown>) => void): Record<string, unknown> => {
    const o = mutable(base);
    f(o);
    return o;
  };

  it.each<[string, (o: Record<string, unknown>) => void, string]>([
    ['unknown protocol', (o) => (o['protocolId'] = 'ct2-fhenix'), 'P13_UNSUPPORTED'],
    ['commitment protocol', (o) => (o['protocolId'] = 'commitment-zk'), 'P13_UNSUPPORTED'],
    ['wrong manifest', (o) => (o['manifestDigest'] = `sha256:${'11'.repeat(32)}`), 'P13_MANIFEST_MISMATCH'],
    ['claims fhe for the fixture', (o) => (o['confidentiality'] = 'fhe'), 'P13_INVALID_ASSET'],
    ['wrong rate', (o) => (o['rate'] = '1'), 'P13_INVALID_ASSET'],
    ['non-canonical rate', (o) => (o['rate'] = '01000000000000'), 'P13_INVALID_AMOUNT'],
    ['wrong confidential decimals', (o) => ((o['asset'] as Record<string, unknown>)['decimals'] = 18), 'P13_INVALID_ASSET'],
    ['cross-network underlying', (o) => ((o['underlying'] as Record<string, unknown>)['network'] = 'eip155:11155111'), 'P13_INVALID_ASSET'],
    ['mainnet', (o) => {
      (o['asset'] as Record<string, unknown>)['network'] = 'eip155:1';
      (o['underlying'] as Record<string, unknown>)['network'] = 'eip155:1';
    }, 'P13_NETWORK_REFUSED'],
    ['asset equals underlying', (o) => ((o['asset'] as Record<string, unknown>)['asset'] = CTM_ASSET.underlying.asset), 'P13_INVALID_ASSET'],
    ['missing trust statement', (o) => (o['trustStatementIds'] = ['CT_M_NO_PRIVACY']), 'P13_INVALID_ASSET'],
    ['unknown trust statement', (o) => (o['trustStatementIds'] = ['CT_M_NO_PRIVACY', 'P13_FIXTURE_ONLY', 'MADE_UP']), 'P13_INVALID_ASSET'],
    ['duplicate trust statement', (o) => (o['trustStatementIds'] = ['CT_M_NO_PRIVACY', 'P13_FIXTURE_ONLY', 'P13_FIXTURE_ONLY']), 'P13_INVALID_ASSET'],
    ['trust ids not an array', (o) => (o['trustStatementIds'] = 'CT_M_NO_PRIVACY'), 'P13_INVALID_ASSET'],
    ['extra key', (o) => (o['amount'] = '5'), 'P13_INVALID_ASSET'],
    ['wrong schema', (o) => (o['schema'] = 'ghostpay.confidential-asset/v0'), 'P13_INVALID_ASSET'],
  ])('rejects %s', (_name, f, code) => {
    expect(codeOf(() => decodeConfidentialAsset(patch(CTM_ASSET, f)))).toBe(code);
  });

  it('rejects sparse or oversized trust lists', () => {
    const sparse = mutable(CTM_ASSET);
    const ids: unknown[] = ['CT_M_NO_PRIVACY', 'P13_FIXTURE_ONLY'];
    ids.length = 3;
    sparse['trustStatementIds'] = ids;
    expect(codeOf(() => decodeConfidentialAsset(sparse))).toBe('P13_INVALID_ASSET');
    const big = mutable(CTM_ASSET);
    big['trustStatementIds'] = Array.from({ length: 33 }, () => 'CT_M_NO_PRIVACY');
    expect(codeOf(() => decodeConfidentialAsset(big))).toBe('P13_INVALID_ASSET');
  });
});

describe('approved assets (no discovery)', () => {
  it('accepts only canonically equal entries', () => {
    expect(() => assertApprovedAsset(CTM_ASSET, [CTM_ASSET])).not.toThrow();
    expect(codeOf(() => assertApprovedAsset(CTM_ASSET, []))).toBe('P13_ASSET_NOT_APPROVED');
    expect(codeOf(() => assertApprovedAsset(CTM_ASSET, [CT1_ASSET]))).toBe('P13_ASSET_NOT_APPROVED');
    expect(codeOf(() => assertApprovedAsset(CTM_ASSET, Array.from({ length: 9 }, () => CTM_ASSET)))).toBe('P13_RECORD_LIMIT');
    expect(assetDigest(CTM_ASSET)).toBe(assetDigest(decodeConfidentialAsset(mutable(CTM_ASSET))));
  });
});
