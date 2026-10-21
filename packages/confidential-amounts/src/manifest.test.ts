import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { keccak256, type Hex } from 'viem';
import {
  assertCtChain,
  BACKEND_CHAINS,
  CT1_MANIFEST,
  MAINNET_CHAIN_IDS,
  manifestForChain,
  parseAddress,
  verifyManifestOnChain,
  type CtManifest,
} from './manifest.js';
import { CtError } from './errors.js';

const here = dirname(fileURLToPath(import.meta.url));

function code(c: unknown): string | undefined {
  return c instanceof CtError ? c.code : undefined;
}

describe('chain guard (T7)', () => {
  it('refuses mainnet chain ids for every backend', () => {
    for (const id of MAINNET_CHAIN_IDS) {
      for (const b of ['ct1-zama', 'ctm-cleartext', 'ct2-fhenix', 'ct3-inco'] as const) {
        expect(() => assertCtChain(id, b)).toThrow(/testnet-only/);
        try {
          assertCtChain(id, b);
        } catch (e) {
          expect(code(e)).toBe('MAINNET_REFUSED');
        }
      }
    }
  });

  it('refuses Base Sepolia for CT-1 (Zama protocol is not deployed there)', () => {
    try {
      assertCtChain(84532, 'ct1-zama');
      expect.unreachable();
    } catch (e) {
      expect(code(e)).toBe('CHAIN_NOT_SUPPORTED');
    }
  });

  it('allows exactly the pinned chains', () => {
    expect(() => assertCtChain(11155111, 'ct1-zama')).not.toThrow();
    expect(() => assertCtChain(31337, 'ct1-zama')).not.toThrow();
    expect(() => assertCtChain(31337, 'ctm-cleartext')).not.toThrow();
    expect(() => assertCtChain(11155111, 'ctm-cleartext')).toThrow(CtError);
    expect(() => assertCtChain(31337, 'ct2-fhenix')).toThrow(CtError);
    expect(BACKEND_CHAINS['ct3-inco']).toEqual([]);
  });

  it('rejects non-integer and non-positive chain ids', () => {
    for (const bad of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 2]) {
      try {
        assertCtChain(bad, 'ct1-zama');
        expect.unreachable();
      } catch (e) {
        expect(code(e)).toBe('INVALID_INPUT');
      }
    }
  });
});

describe('pinned manifest', () => {
  it('covers exactly Sepolia and local, with no GhostPay deployments', () => {
    expect(Object.keys(CT1_MANIFEST.chains).sort()).toEqual(['11155111', '31337']);
    for (const c of Object.values(CT1_MANIFEST.chains)) {
      expect(c.ghostpay.router).toBeNull();
      expect(c.ghostpay.tokens).toEqual([]);
    }
  });

  it('manifestForChain returns entries and rejects unpinned chains', () => {
    expect(manifestForChain(11155111).gatewayChainId).toBe(10901);
    expect(() => manifestForChain(84532)).toThrow(CtError);
    const broken: CtManifest = { ...CT1_MANIFEST, chains: {} };
    expect(() => manifestForChain(11155111, broken)).toThrow(/pinned manifest/);
  });

  it('matches the committed JSON copy', () => {
    const p = join(here, '..', 'manifest', 'confidential.testnet.json');
    const json = JSON.parse(readFileSync(p, 'utf8')) as unknown;
    expect(json).toEqual(JSON.parse(JSON.stringify(CT1_MANIFEST)));
  });

  const require = createRequire(import.meta.url);
  let zamaConfig: string | undefined;
  try {
    const p = join(dirname(require.resolve('@fhevm/solidity/package.json')), 'config', 'ZamaConfig.sol');
    if (existsSync(p)) zamaConfig = readFileSync(p, 'utf8');
  } catch {
    zamaConfig = undefined;
  }

  it.skipIf(zamaConfig === undefined)('protocol addresses appear in @fhevm/solidity ZamaConfig.sol (primary source)', () => {
    for (const id of ['11155111', '31337']) {
      const p = CT1_MANIFEST.chains[id]?.protocol;
      expect(p).toBeDefined();
      for (const a of [p?.acl, p?.coprocessor, p?.kmsVerifier]) expect(zamaConfig).toContain(a);
    }
  });

  it('protocol addresses and relayer agree with @zama-fhe/sdk chain presets', async () => {
    const { sepolia, hardhat } = await import('@zama-fhe/sdk/chains');
    const s = CT1_MANIFEST.chains['11155111'];
    expect(s?.protocol.acl).toBe(sepolia.aclContractAddress);
    expect(s?.protocol.kmsVerifier).toBe(sepolia.kmsContractAddress);
    expect(s?.protocol.inputVerifier).toBe(sepolia.inputVerifierContractAddress);
    expect(s?.protocol.wrappersRegistry).toBe(sepolia.registryAddress);
    expect(s?.gatewayChainId).toBe(sepolia.gatewayChainId);
    expect(s?.relayerUrl).toBe(sepolia.relayerUrl);
    const l = CT1_MANIFEST.chains['31337'];
    expect(l?.protocol.acl).toBe(hardhat.aclContractAddress);
    expect(l?.protocol.kmsVerifier).toBe(hardhat.kmsContractAddress);
    expect(l?.protocol.inputVerifier).toBe(hardhat.inputVerifierContractAddress);
  });
});

describe('verifyManifestOnChain (CT-PAY-4)', () => {
  const CODE: Hex = '0x6001600155';
  const pinned = (roles: string[]): CtManifest => {
    const base = CT1_MANIFEST.chains['11155111'];
    if (!base) throw new Error('fixture');
    const hashes: Record<string, Hex | null> = { ...base.codeHashes };
    for (const r of roles) hashes[r] = keccak256(CODE);
    return { ...CT1_MANIFEST, chains: { '11155111': { ...base, codeHashes: hashes, ghostpay: { router: '0x00000000000000000000000000000000000000A1', tokens: [] } } } };
  };
  const allRoles = ['acl', 'coprocessor', 'kmsVerifier', 'inputVerifier', 'wrappersRegistry', 'router'];

  it('passes when every code hash is pinned and matches', async () => {
    const r = await verifyManifestOnChain(11155111, () => Promise.resolve(CODE), {}, pinned(allRoles));
    expect(r.fullyPinned).toBe(true);
    expect(Object.keys(r.roles).sort()).toEqual([...allRoles].sort());
  });

  it('refuses unpinned hashes by default and reports them when allowed', async () => {
    await expect(verifyManifestOnChain(11155111, () => Promise.resolve(CODE))).rejects.toMatchObject({ code: 'UNPINNED_CODEHASH' });
    const r = await verifyManifestOnChain(11155111, () => Promise.resolve(CODE), { requirePinned: false });
    expect(r.fullyPinned).toBe(false);
    expect(Object.values(r.roles).every((v) => v === 'unpinned')).toBe(true);
    // local chain has a null registry: skipped, not an error
    const local = await verifyManifestOnChain(31337, () => Promise.resolve(CODE), { requirePinned: false });
    expect(local.roles['wrappersRegistry']).toBeUndefined();
  });

  it('refuses missing code and mismatching code', async () => {
    await expect(verifyManifestOnChain(11155111, () => Promise.resolve(undefined), { requirePinned: false })).rejects.toMatchObject({ code: 'MANIFEST_MISMATCH' });
    await expect(verifyManifestOnChain(11155111, () => Promise.resolve('0x'), { requirePinned: false })).rejects.toMatchObject({ code: 'MANIFEST_MISMATCH' });
    await expect(verifyManifestOnChain(11155111, () => Promise.resolve('0x60aa'), {}, pinned(allRoles))).rejects.toMatchObject({ code: 'MANIFEST_MISMATCH' });
  });

  it('applies the chain guard first', async () => {
    await expect(verifyManifestOnChain(1, () => Promise.resolve(CODE))).rejects.toMatchObject({ code: 'MAINNET_REFUSED' });
  });
});

describe('parseAddress', () => {
  it('checksums valid addresses and rejects junk', () => {
    expect(parseAddress('0x00000000000000000000000000000000000000a1', 'x')).toBe('0x00000000000000000000000000000000000000A1');
    expect(() => parseAddress('0x12', 'x')).toThrow(/x must be an address/);
    expect(() => parseAddress(5 as unknown as string, 'x')).toThrow(CtError);
  });
});
