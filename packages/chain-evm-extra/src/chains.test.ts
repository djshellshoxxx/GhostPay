import { describe, expect, it } from 'vitest';
import { EXTRA_CHAINS, findExtraChain, type ExtraChainEntry } from './chains.js';
import { ARACHNID_DEPLOYER, CANONICAL_ANNOUNCER } from './address.js';
import { validateConstants, validateManifests } from './manifest-check.js';

const base: ExtraChainEntry = EXTRA_CHAINS[0] ?? (() => { throw new Error('empty'); })();
const mut = (o: Record<string, unknown>): ExtraChainEntry => Object.assign({}, base, o);
const codes = (e: readonly ExtraChainEntry[], o = {}) => validateManifests(e, o).map((i) => i.code);

describe('EXTRA_CHAINS', () => {
  it('has 12 mainnets and 13 testnets, all disabled, unique ids', () => {
    expect(EXTRA_CHAINS).toHaveLength(25);
    expect(EXTRA_CHAINS.filter((c) => !c.testnet)).toHaveLength(12);
    expect(EXTRA_CHAINS.every((c) => !c.enabled && c.announcer === 'unverified' && c.arachnidDeployer === 'unverified')).toBe(true);
    expect(new Set(EXTRA_CHAINS.map((c) => c.chainId)).size).toBe(25);
    expect(validateManifests(EXTRA_CHAINS)).toEqual([]);
  });
  it('never contains deprecated ids and never guesses unverified numbers', () => {
    expect(findExtraChain(44787)).toBeUndefined();
    expect(findExtraChain(167009)).toBeUndefined();
    for (const c of EXTRA_CHAINS) {
      expect(c.finalityDepth).toBeNull();
      expect(c.getLogsMaxRange).toBeNull();
      expect(c.blockTimeMs).toBeNull();
      expect(c.evmTarget).toBe('unverified');
      expect(c.listSource.sha256).toBeNull();
      expect(c.listSource.url).toContain(`eip155-${String(c.chainId)}.json`);
    }
  });
  it('flags zkSync as custom CREATE2 / EraVM and others standard', () => {
    for (const id of [324, 300]) {
      const c = findExtraChain(id);
      expect(c?.create2).toBe('zksync-custom');
      expect(c?.bytecodeModel).toBe('eravm');
    }
    expect(EXTRA_CHAINS.filter((c) => c.create2 === 'zksync-custom')).toHaveLength(2);
  });
  it('native symbols', () => {
    expect(findExtraChain(5000)?.nativeSymbol).toBe('MNT');
    expect(findExtraChain(146)?.nativeSymbol).toBe('S');
    expect(findExtraChain(80069)?.nativeSymbol).toBe('BERA');
    expect(findExtraChain(42220)?.nativeSymbol).toBe('CELO');
  });
});

describe('validateManifests', () => {
  it('detects duplicate ids, bad ids, enabled, decimals, misclassification, numbers', () => {
    expect(codes([base, base])).toContain('DUPLICATE_CHAIN_ID');
    expect(codes([mut({ chainId: 0 })])).toContain('BAD_CHAIN_ID');
    expect(codes([mut({ enabled: true })])).toContain('ENABLED');
    expect(codes([mut({ nativeDecimals: 6 })])).toContain('BAD_NATIVE_DECIMALS');
    expect(codes([mut({ create2: 'zksync-custom' })])).toContain('ZKSYNC_MISCLASSIFIED');
    expect(codes([mut({ bytecodeModel: 'eravm' })])).toContain('ZKSYNC_MISCLASSIFIED');
    expect(codes([mut({ finalityDepth: 0 })])).toContain('BAD_NUMBER');
    expect(codes([mut({ blockTimeMs: 1.5 })])).toContain('BAD_NUMBER');
    expect(codes([mut({ getLogsMaxRange: 1000 })])).toEqual([]);
  });
  it('constants check: hash input handling', () => {
    expect(validateConstants()).toEqual([]);
    expect(validateConstants({ announcerInitCodeHash: '0x12' })[0]?.code).toBe('INIT_CODE_HASH_MALFORMED');
    expect(validateConstants({ announcerInitCodeHash: '0x' + '11'.repeat(32) })[0]?.code).toBe('CREATE2_MISMATCH');
  });
  it('constants are the ERC values', () => {
    expect(CANONICAL_ANNOUNCER).toBe('0x55649E01B5Df198D18D95b5cc5051630cfD45564');
    expect(ARACHNID_DEPLOYER).toBe('0x4e59b44847b379578588920cA78FbF26c0B4956C');
  });
});
