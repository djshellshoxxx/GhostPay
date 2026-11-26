import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { OPTION_CATALOGUE } from './catalogue.js';
import { toConfig } from './config.js';
import { describeConfig, describePreset } from './claims.js';
import type { ClaimStatus } from './claims.js';
import { evaluate } from './evaluate.js';
import { ALL_CAPABILITIES } from './keys.js';
import { PRESETS } from './presets.js';
import type { Capability, Context, OptionId, PresetId } from './types.js';
import { OPTION_IDS } from './types.js';
import { ctx, sel } from './x.testutil.js';

const PRESET_IDS = Object.keys(PRESETS) as PresetId[];
const statusOf = (values: Partial<Record<OptionId, string>>, c: Context, option: OptionId): ClaimStatus | undefined =>
  describeConfig(toConfig(sel(values)), c).claims.find((x) => x.option === option)?.status;
const without = (...c: Capability[]): ReadonlySet<Capability> => new Set([...ALL_CAPABILITIES].filter((x) => !c.includes(x)));

describe('truthful capability descriptions', () => {
  it('every description is unqualified and unverified, with the fixed headline and what stays visible', () => {
    for (const id of PRESET_IDS) {
      const d = describePreset(id, ctx({ env: 'web-onion' }));
      expect(d.qualification).toBe('unqualified');
      expect(d.verified).toBe(false);
      expect(d.headline).toBe('privacy.warn.noAnonymity');
      if (id !== 'standard') expect(d.stillVisible.length).toBeGreaterThan(0);
    }
  });
  it('the default configuration claims nothing', () => {
    const d = describeConfig(toConfig(sel({})), ctx());
    expect(d.claims).toEqual([]);
    expect(d.trust).toEqual([]);
  });
  it('claims are exactly the values that take effect, with required capabilities and what is missing', () => {
    const d = describeConfig(toConfig(sel({ 'sweep.hops': '1' })), ctx({ capabilities: without('sweep-relayer') }));
    const hops = d.claims.find((x) => x.option === 'sweep.hops');
    expect(hops).toMatchObject({ value: '1', status: 'missing-capability', missing: ['sweep-relayer'], maturity: 'poc' });
  });
  it('capabilities required by rules rather than by the value definition are listed as missing too', () => {
    const missing = (values: Partial<Record<OptionId, string>>, over: Partial<Context>, option: OptionId): readonly Capability[] | undefined =>
      describeConfig(toConfig(sel(values)), ctx(over)).claims.find((x) => x.option === option)?.missing;
    expect(missing({ 'pay.amountVisibility': 'ct1-zama' }, { capabilities: without('seller-accepts-ct') }, 'pay.amountVisibility')).toEqual(['seller-accepts-ct']);
    expect(missing({ 'relayer.multi': 'on' }, { capabilities: without('multi-relayer') }, 'relayer.multi')).toContain('multi-relayer');
    expect(missing({ 'net.rpcProfile': 'tor-browser' }, { capabilities: without('selftest-ok:rpc') }, 'net.rpcProfile')).toEqual(['selftest-ok:rpc']);
    expect(missing({ 'sweep.exit': 'privacy-pools' }, { capabilities: without('pp-relayer') }, 'sweep.exit')).toEqual(['pp-relayer']);
  });
  it.each<[string, Partial<Record<OptionId, string>>, Partial<Context>, ClaimStatus]>([
    ['stub value is unavailable', { 'sweep.exit': 'tornado-fixed' }, {}, 'unavailable'],
    ['watch value is unavailable', { 'sweep.exit': 'aztec' }, {}, 'unavailable'],
    ['test-only value stays test-only even with the capability', { 'sweep.exit': 'mock-pool' }, {}, 'test-only'],
    ['experimental value stays experimental with every capability', { 'net.rpcProfile': 'nym-mixfetch' }, {}, 'experimental'],
    ['unsupported chain', { 'pay.amountVisibility': 'ct1-zama' }, { chainId: 84532 }, 'unsupported-context'],
    ['unsupported environment', { 'net.rpcProfile': 'tor-socks' }, { env: 'web' }, 'unsupported-context'],
    ['unsupported asset', { 'sweep.hops': '1' }, { asset: 'native' }, 'unsupported-context'],
    ['a conflicting combination is blocked, not claimed', { 'sweep.hops': '3', 'sweep.hopRelayers': 'direct' }, {}, 'blocked'],
    ['supported and asserted', { 'sweep.dust': 'off' }, {}, 'asserted'],
  ])('%s', (_n, values, over, status) => {
    const option = Object.keys(values)[0] as OptionId;
    expect(statusOf(values, ctx(over), option)).toBe(status);
  });
  it('a preset that cannot be applied says so instead of claiming it', () => {
    const d = describePreset('maximum', ctx({ capabilities: new Set() }));
    expect(d.claims.filter((c) => c.status === 'asserted' && c.option === 'sweep.exit')).toEqual([]);
    expect(d.notApplied.map((n) => n.option)).toEqual(expect.arrayContaining(['sweep.exit', 'pay.source', 'net.rpcProfile']));
    for (const n of d.notApplied) expect(n.wanted).not.toBe(n.got);
  });
  it('maximum and shielded are never described as qualified, even with every capability present', () => {
    for (const id of ['maximum', 'shielded'] as const) {
      const d = describePreset(id, ctx({ env: 'web-onion' }));
      expect(d.qualification).toBe('unqualified');
      expect(JSON.stringify(d)).not.toMatch(/"qualified|operational|"verified":true/);
    }
  });
  it('an invalid context is reported, never claimed', () => {
    const d = describePreset('maximum', { ...ctx(), env: 'bogus' } as never);
    expect(d.evaluationOk).toBe(false);
    expect(d.claims.every((c) => c.status !== 'asserted' || c.missing.length === 0)).toBe(true);
  });
  it('is deterministic and frozen', () => {
    const a = describePreset('enhanced', ctx());
    expect(describePreset('enhanced', ctx())).toEqual(a);
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(a.claims)).toBe(true);
  });
});

describe('property: no claim of availability beyond what is asserted and supported', () => {
  const arbValues = fc.record(
    Object.fromEntries(OPTION_IDS.filter((o) => OPTION_CATALOGUE[o].userSelectable).map((o) => [o, fc.constantFrom(...OPTION_CATALOGUE[o].values.map((v) => v.value))])),
    { requiredKeys: [] },
  ) as fc.Arbitrary<Partial<Record<OptionId, string>>>;
  const arbCtx = fc
    .record({
      action: fc.constantFrom('settings', 'pay', 'sweep', 'scan', 'create-invoice', 'btc-send', 'btc-receive'),
      chainId: fc.constantFrom(null, 1, 31337, 11155111, 84532),
      env: fc.constantFrom('web', 'web-onion', 'node'),
      asset: fc.constantFrom(undefined, 'erc20-permit', 'erc20', 'native', 'confidential', 'btc'),
      caps: fc.subarray([...ALL_CAPABILITIES]),
    })
    .map((a): Context => ({ action: a.action, chainId: a.chainId, btcNetwork: 'regtest', env: a.env, ...(a.asset === undefined ? {} : { asset: a.asset }), capabilities: new Set<Capability>(a.caps) }));

  it('asserted implies a mature value, no missing capability and no blocking issue on that option', () => {
    fc.assert(
      fc.property(arbValues, arbCtx, (values, c) => {
        const cfg = toConfig(sel(values));
        const d = describeConfig(cfg, c);
        const ev = evaluate(cfg, c);
        for (const claim of d.claims) {
          if (claim.status !== 'asserted') continue;
          expect(['existing', 'poc', 'spike-gated']).toContain(claim.maturity);
          expect(claim.missing).toEqual([]);
          for (const r of claim.requires) if (r !== 'test-mode') expect(c.capabilities.has(r)).toBe(true);
          // Missing acknowledgements are consent, not availability, so they do not stop a value from being asserted.
          expect(ev.blocking.filter((b) => b.code !== 'E_ACK_MISSING' && b.options.includes(claim.option))).toEqual([]);
        }
        expect(d.claims.map((x) => x.option)).toEqual([...d.claims.map((x) => x.option)].sort((a, b) => OPTION_IDS.indexOf(a) - OPTION_IDS.indexOf(b)));
      }),
      { numRuns: 300 },
    );
  });
  it('experimental, test-only, stub and watch values are never asserted', () => {
    fc.assert(
      fc.property(arbValues, arbCtx, (values, c) => {
        for (const claim of describeConfig(toConfig(sel(values)), c).claims) {
          if (['experimental', 'test-only', 'stub', 'watch'].includes(claim.maturity)) expect(claim.status).not.toBe('asserted');
        }
      }),
      { numRuns: 300 },
    );
  });
  it('every preset in every context: nothing asserted that the preset result could not apply', () => {
    fc.assert(
      fc.property(fc.constantFrom(...PRESET_IDS), arbCtx, (id, c) => {
        const d = describePreset(id, c);
        for (const claim of d.claims) if (claim.status === 'asserted') expect(claim.missing).toEqual([]);
        expect(d.qualification).toBe('unqualified');
      }),
      { numRuns: 150 },
    );
  });
  it('never throws on arbitrary input', () => {
    fc.assert(
      fc.property(fc.anything(), fc.anything(), (a, b) => {
        expect(() => describeConfig(a as never, b as never)).not.toThrow();
        expect(() => describePreset(a as never, b as never)).not.toThrow();
      }),
      { numRuns: 200 },
    );
  });
});
