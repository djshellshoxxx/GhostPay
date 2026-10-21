import { describe, expect, it } from 'vitest';
import { HARDENED_PRESET, MH_CATALOGUE, MH_IDS, assertHardening, defaultHardening, hardenedSettings, validateHardening, type HardeningSettings, type MhId } from './catalogue.js';
import { BTC_TESTNETS, MetadataHardeningError, TESTNET_CHAIN_IDS, assertBtcTestnet, assertTestnetChain, parseEndpoint, randomBelow, randomInt, shuffle } from './guard.js';
import { seededRng } from './testutil.testutil.js';

const with_ = (ids: readonly MhId[], tagMode = 'full'): HardeningSettings => {
  const s = defaultHardening();
  const enabled = { ...s.enabled };
  for (const id of ids) enabled[id] = true;
  return { enabled, tagMode };
};

describe('catalogue honesty', () => {
  it('has a row for every id with does-NOT text and no forbidden wording', () => {
    expect(MH_IDS).toHaveLength(36);
    for (const id of MH_IDS) {
      const e = MH_CATALOGUE[id];
      expect(e.doesNotProtect.length).toBeGreaterThan(10);
      expect(`${e.title} ${e.hides} ${e.doesNotProtect}`).not.toMatch(/\b(anonymous|untraceable|unlinkable|mix(er|ing)?)\b/i);
    }
  });
  it('defaults match the spec table', () => {
    const on = MH_IDS.filter((id) => defaultHardening().enabled[id]);
    expect(on).toEqual(['MH-ANN-1', 'MH-TAG-1', 'MH-AMT-1', 'MH-SCAN-1', 'MH-WEB-1', 'MH-WEB-2', 'MH-BTC-1', 'MH-BTC-4', 'MH-BTC-5']);
    expect(defaultHardening().tagMode).toBe('full');
    expect(validateHardening(defaultHardening()).errors).toEqual([]);
  });
  it('hardened preset equals the spec list and is conflict-free', () => {
    const s = hardenedSettings();
    expect(MH_IDS.filter((i) => s.enabled[i]).sort()).toEqual([...HARDENED_PRESET].sort());
    expect(validateHardening(s).errors).toEqual([]);
    expect(() => assertHardening(s)).not.toThrow();
  });
});

describe('conflict rules', () => {
  it('blocking pairs', () => {
    expect(validateHardening(with_(['MH-AMT-2'])).errors[0]).toMatch(/AMT-1 and MH-AMT-2/);
    expect(validateHardening(with_(['MH-FEE-1', 'MH-FEE-2'])).errors.join()).toMatch(/mutually exclusive/);
    expect(validateHardening(with_(['MH-TAG-2'], 'ignore')).errors.join()).toMatch(/conflict/);
    const noTag1 = { ...with_(['MH-TAG-2'], 'full'), enabled: { ...with_(['MH-TAG-2']).enabled, 'MH-TAG-1': false } };
    expect(validateHardening(noTag1).errors.join()).toMatch(/needs tagMode/);
    expect(validateHardening(with_([], 'mask:3')).errors.join()).toMatch(/needs MH-TAG-2/);
    expect(() => assertHardening(with_(['MH-AMT-2']))).toThrow(MetadataHardeningError);
  });
  it('warnings for dependencies', () => {
    const w = validateHardening(with_(['MH-INV-1', 'MH-ANN-3', 'MH-ANN-2', 'MH-ID-1', 'MH-BTC-3', 'MH-REL-2'])).warnings.join(' | ');
    for (const r of [/INV-1.*moot/, /ANN-3 only works/, /easier to find/, /ID-1 and MH-ID-2/, /BTC-3 conflicts with PayJoin/, /timing only/]) expect(w).toMatch(r);
    expect(validateHardening(with_(['MH-FEE-1', 'MH-ANN-3'])).warnings.join()).toMatch(/unverified until read/);
    const t2 = { enabled: { ...defaultHardening().enabled, 'MH-TAG-1': false, 'MH-TAG-2': true }, tagMode: 'ignore' };
    expect(validateHardening(t2)).toEqual({ errors: [], warnings: [expect.stringMatching(/other wallets/)] });
  });
});

describe('guard helpers', () => {
  it('testnet lists', () => {
    expect(TESTNET_CHAIN_IDS).toEqual([31337, 11155111, 84532]);
    expect(BTC_TESTNETS).toEqual(['testnet', 'signet', 'regtest']);
    for (const c of [1, 10, 8453, 0, -1, 1.5, NaN]) expect(() => assertTestnetChain(c)).toThrow(MetadataHardeningError);
    for (const n of ['mainnet', 'bitcoin', '', 'Regtest']) expect(() => assertBtcTestnet(n)).toThrow(MetadataHardeningError);
  });
  it('parseEndpoint', () => {
    expect(parseEndpoint('https://a.example/')).toBe('https://a.example');
    expect(parseEndpoint('https://a.example/rpc/')).toBe('https://a.example/rpc');
    expect(parseEndpoint('http://localhost:8545')).toBe('http://localhost:8545');
    for (const bad of ['http://a.example', 'https://a.example#x', 'https://a.example?k=v', 'https://u@a.example', 'junk']) {
      expect(() => parseEndpoint(bad)).toThrow(MetadataHardeningError);
    }
  });
  it('random helpers are unbiased and in range', () => {
    const rng = seededRng(77);
    const counts = [0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 7000; i++) counts[randomInt(7, rng)]!++;
    const chi = counts.reduce((a, c) => a + (c - 1000) ** 2 / 1000, 0);
    expect(chi).toBeLessThan(22.5); // df=6, p=0.001
    expect(randomBelow(1n)).toBe(0n);
    expect(randomBelow(1n << 64n, rng)).toBeLessThan(1n << 64n);
    expect(() => randomBelow(0n)).toThrow(MetadataHardeningError);
    expect(() => randomBelow((1n << 64n) + 1n)).toThrow(MetadataHardeningError);
    expect(() => randomInt(0)).toThrow(MetadataHardeningError);
    expect(shuffle([1, 2, 3, 4], rng).sort()).toEqual([1, 2, 3, 4]);
    expect(shuffle([])).toEqual([]);
  });
  it('a stuck all-ones source fails instead of looping', () => {
    const stuck = { getRandomValues: <T extends ArrayBufferView | null>(a: T): T => { if (a) new Uint8Array(a.buffer, a.byteOffset, a.byteLength).fill(0xff); return a; } };
    expect(() => randomBelow(5n, stuck)).toThrowError(/rejection sampling/);
  });
  it('missing global crypto is an error', () => {
    expect(() => randomBelow(5n, {} as never)).toThrowError(/CSPRNG/);
  });
});
