import { describe, expect, it } from 'vitest';
import {
  assertBtcTestnet,
  assertTestnetChain,
  BTC_TESTNETS,
  MetadataHardeningError,
  TESTNET_CHAIN_IDS,
} from './guard.js';
import { DEFAULT_BODY_BUCKETS } from './release.js';
import { DEFAULT_PLAINTEXT_BUCKETS } from './invoice.js';
import { HARDENED_PRESET, MH_CATALOGUE, MH_IDS } from './catalogue.js';

/** Runtime mutation of these exports would silently weaken a security gate or normative UI copy. */
describe('exported constants are frozen', () => {
  it('testnet allowlists cannot be extended at runtime', () => {
    expect(Object.isFrozen(TESTNET_CHAIN_IDS)).toBe(true);
    expect(Object.isFrozen(BTC_TESTNETS)).toBe(true);
    expect(() => (TESTNET_CHAIN_IDS as number[]).push(1)).toThrow(TypeError);
    expect(() => (BTC_TESTNETS as unknown as string[]).push('mainnet')).toThrow(TypeError);
    expect(() => assertTestnetChain(1)).toThrow(MetadataHardeningError);
    expect(() => assertBtcTestnet('mainnet')).toThrow(MetadataHardeningError);
  });
  it('bucket and id lists are frozen', () => {
    for (const list of [DEFAULT_BODY_BUCKETS, DEFAULT_PLAINTEXT_BUCKETS, MH_IDS, HARDENED_PRESET]) {
      expect(Object.isFrozen(list)).toBe(true);
    }
  });
  it('catalogue rows (normative UI copy) are frozen', () => {
    expect(Object.isFrozen(MH_CATALOGUE)).toBe(true);
    for (const id of MH_IDS) {
      expect(Object.isFrozen(MH_CATALOGUE[id])).toBe(true);
      expect(() => {
        (MH_CATALOGUE[id] as { doesNotProtect: string }).doesNotProtect = 'x';
      }).toThrow(TypeError);
    }
  });
});
