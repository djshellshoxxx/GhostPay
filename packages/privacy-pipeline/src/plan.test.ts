import { describe, expect, it } from 'vitest';
import { PipelineError } from './errors.js';
import { PAYER_3_5, ctx, fullCtx, pipe, step as s } from './fixtures.testutil.js';
import { expand, instanceIdOf, planHash } from './plan.js';
import {
  CT_MIN_DWELL_MS,
  STEP_CATALOGUE,
  STEP_KINDS,
  compoundFeeBps,
  isStepKind,
  normalizeParams,
} from './steps.js';
import { simulate } from './summary.js';
import type { Pipeline } from './types.js';
import { sha256Hex, canonical } from './hash.js';

describe('step catalogue', () => {
  it('has the 18 kinds of the spec with unique own-property lookup', () => {
    expect(STEP_KINDS).toHaveLength(18);
    expect(isStepKind('pool.exit')).toBe(true);
    for (const bad of ['__proto__', 'constructor', 'toString', 'hops', 7, null, undefined])
      expect(isStepKind(bad)).toBe(false);
  });
  it('every definition names a spec reference and has defaults that normalise cleanly', () => {
    for (const k of STEP_KINDS) {
      const d = STEP_CATALOGUE[k];
      expect(d.specRef.ids.length).toBeGreaterThan(0);
      expect(normalizeParams(k, undefined).errors).toEqual([]);
      expect(d.kind).toBe(k);
    }
  });
  it('normalizeParams: closed set, ranges, types', () => {
    expect(normalizeParams('hops.forward', { hops: 5 }).errors).toEqual(['hops']);
    expect(normalizeParams('hops.forward', { hops: 1.5 }).errors).toEqual(['hops']);
    expect(normalizeParams('hops.forward', { hops: '2' }).errors).toEqual(['hops']);
    expect(normalizeParams('hops.forward', { hops: 4 }).params['hops']).toBe(4);
    expect(normalizeParams('hops.forward', { nope: 1 }).errors).toEqual(['nope']);
    expect(normalizeParams('hops.forward', JSON.parse('{"__proto__":1}') as never).errors).toEqual([
      '__proto__',
    ]);
    expect(normalizeParams('amount.shape', { noise: 'yes' }).errors).toEqual(['noise']);
    expect(normalizeParams('amount.shape', { noise: true }).params['noise']).toBe(true);
    expect(normalizeParams('ct.wrap', { amount: '12a' }).errors).toEqual(['amount']);
    expect(normalizeParams('ct.wrap', { amount: '1'.repeat(41) }).errors).toEqual(['amount']);
    expect(normalizeParams('ct.wrap', { amount: '125' }).params['amount']).toBe('125');
    expect(normalizeParams('pay.submit', { route: undefined }).errors).toEqual([]);
    expect(normalizeParams('pay.submit', { route: 'free' }).errors).toEqual(['route']);
  });
  it('defaults match the spec: SP dwell 24-72 h, hop delay 10 min..12 h, router fee 25 bps', () => {
    expect(STEP_CATALOGUE['pool.dwell'].wait({ minHours: 24, maxHours: 72 }, 1)).toEqual({
      minMs: 86_400_000,
      maxMs: 259_200_000,
    });
    expect(normalizeParams('hops.forward', {}).params).toMatchObject({
      hops: 2,
      delayMinMs: 600_000,
      delayMaxMs: 43_200_000,
      hopRelayers: 'rotate',
    });
    expect(normalizeParams('pool.dwell', {}).params).toMatchObject({ minHours: 24, maxHours: 72 });
    expect(normalizeParams('pay.submit', {}).params).toMatchObject({ payerMode: 'direct', route: 'router' });
    expect(normalizeParams('pool.deposit', {}).params).toMatchObject({
      exitGas: 'permit-sponsored',
      amountPlan: 'denominations',
      pool: 'shielded-pool',
    });
    expect(normalizeParams('hygiene.sweep', {}).params).toMatchObject({ destination: 'self-derived' });
    expect(normalizeParams('ct.wrap', {}).params['dwellMs']).toBe(CT_MIN_DWELL_MS);
  });
  it('compoundFeeBps reproduces the hops floors 0.50/0.99/1.49/1.98 percent', () => {
    expect([1, 2, 3, 4].map((k) => compoundFeeBps(50, k, 'floor'))).toEqual([50, 99, 149, 198]);
    expect([1, 2, 3, 4].map((k) => compoundFeeBps(50, k, 'ceil'))).toEqual([50, 100, 150, 199]);
    expect(compoundFeeBps(300, 1, 'ceil')).toBe(300);
    expect(compoundFeeBps(300, 4, 'ceil')).toBe(1148);
  });
  it('purposes, trust and leaks follow params', () => {
    const d = STEP_CATALOGUE['pool.deposit'];
    expect(d.purposes({ payerSponsor: 'permit-relay', exitGas: 'buffer' })).toEqual(['rpc', 'sponsor']);
    expect(d.purposes({ payerSponsor: 'none', exitGas: 'permit-sponsored' })).toEqual([
      'rpc',
      'pool-relayer',
    ]);
    expect(d.trust({ pool: 'privacy-pools', payerSponsor: 'permit-relay' })).toContain('privacy-pools-asp');
    expect(d.doesNotHide({ pool: 'mock-pool', amountPlan: 'whole', exitGas: 'topup' })).toEqual(
      expect.arrayContaining([
        'privacy.warn.mockNoPrivacy',
        'privacy.warn.amountTimingMatch',
        'privacy.warn.gasFundingLink',
      ]),
    );
    expect(d.strength({ pool: 'mock-pool' })).toEqual(['baseline']);
    expect(d.doesNotHide({ pool: 'railgun', amountPlan: 'denominations', exitGas: 'eip7702' })).toContain(
      'privacy.warn.persistent7702Delegate',
    );
    const x = STEP_CATALOGUE['pool.exit'];
    expect(x.trust({ poolSubmit: 'self', poolAsp: 'publisher' })).toEqual(['rpc', 'asp-publisher']);
    expect(x.fee({ poolSubmit: 'self' })).toEqual({ minBps: 0, maxBps: 0 });
    expect(x.doesNotHide({ poolSubmit: 'self', poolAsp: 'publisher' })).toEqual(
      expect.arrayContaining(['privacy.warn.gasFundingLink', 'privacy.warn.aspChoiceDisclosed']),
    );
    const ps = STEP_CATALOGUE['pay.submit'];
    expect(ps.trust({ payerMode: 'erc4337-paymaster' })).toContain('bundler');
    expect(ps.trust({ payerMode: 'eip7702-sponsored' })).toContain('payer-sponsor');
    expect(ps.doesNotHide({ payerMode: 'permit-relay', route: 'direct-no-fee' })).toEqual(
      expect.arrayContaining(['privacy.warn.sponsorSees', 'privacy.warn.directNoFeeScanner']),
    );
    expect(ps.fee({ route: 'direct-no-fee' })).toEqual({ minBps: 0, maxBps: 0 });
    const h = STEP_CATALOGUE['hops.forward'];
    expect(h.purposes({ hopRelayers: 'direct' })).toEqual(['rpc']);
    expect(h.doesNotHide({ hopRelayers: 'same' })).toContain('privacy.warn.singleRelayerSeesAllHops');
    expect(h.doesNotHide({ hopRelayers: 'direct' })).toContain('privacy.warn.gasFundingLink');
    expect(h.trust({ hopRelayers: 'direct' })).toEqual(['rpc']);
    const hy = STEP_CATALOGUE['hygiene.sweep'];
    expect(hy.doesNotHide({ destination: 'external-reuse' })).toEqual(
      expect.arrayContaining(['privacy.warn.destinationReuse', 'privacy.warn.externalDestinationUnverified']),
    );
    const am = STEP_CATALOGUE['amount.shape'];
    expect(am.doesNotHide({ mode: 'round' })).toContain('privacy.warn.roundUpCost');
    expect(am.doesNotHide({ mode: 'split' })).toContain('privacy.warn.fanOutLinkable');
    expect(STEP_CATALOGUE['btc.send'].doesNotHide({ mode: 'payjoin-v2' })).toContain(
      'privacy.warn.payjoinDirectorySees',
    );
    expect(STEP_CATALOGUE['btc.send'].doesNotHide({ mode: 'plain' })).toEqual([
      'privacy.warn.payerStillPublic',
    ]);
    expect(STEP_CATALOGUE['btc.send'].strength({ mode: 'plain' })).toEqual(['baseline']);
    expect(STEP_CATALOGUE['btc.send'].purposes({ mode: 'payjoin-v1' })).toContain('payjoin-directory');
    expect(STEP_CATALOGUE['btc.send'].trust({ mode: 'payjoin-v2' })).toContain('payjoin-ohttp-relay');
    expect(STEP_CATALOGUE['btc.recv'].purposes({ mode: 'plain' })).toEqual(['scan']);
    expect(STEP_CATALOGUE['btc.recv'].trust({ mode: 'plain' })).toEqual([]);
    expect(STEP_CATALOGUE['btc.recv'].trust({ mode: 'payjoin-v2' })).toContain('payjoin-directory');
    expect(STEP_CATALOGUE['btc.recv'].doesNotHide({ mode: 'plain' })).toEqual([
      'privacy.warn.contentNotHidden',
    ]);
    expect(STEP_CATALOGUE['btc.recv'].doesNotHide({ mode: 'payjoin-v1' })).not.toContain(
      'privacy.warn.payjoinDirectorySees',
    );
    expect(STEP_CATALOGUE['btc.payjoin-contribute'].trust({ mode: 'payjoin-v1' })).toEqual([]);
    expect(
      STEP_CATALOGUE['btc.recv'].produce({ mode: 'plain' }, null, { role: 'seller', asset: 'btc' }),
    ).toEqual({ t: 'btc-utxo', kind: 'plain' });
  });
  it('produce fallbacks for orphan inputs are defined', () => {
    const c = { role: 'seller' as const, asset: 'erc20' as const };
    expect(STEP_CATALOGUE['payer.fresh-wallet'].produce({}, null, c)).toMatchObject({
      t: 'payer-funds',
      wallet: 'fresh',
    });
    expect(STEP_CATALOGUE['ct.wrap'].produce({}, null, c)).toMatchObject({
      asset: 'confidential',
      wallet: 'long-lived',
    });
    expect(STEP_CATALOGUE['amount.shape'].produce({ parts: 2 }, null, c)).toMatchObject({
      t: 'payment-plan',
      asset: 'erc20',
    });
    expect(STEP_CATALOGUE['pool.dwell'].produce({}, null, c)).toMatchObject({ t: 'note' });
    expect(STEP_CATALOGUE['sweep.delay'].produce({}, null, c)).toMatchObject({ t: 'stealth' });
    expect(STEP_CATALOGUE['hops.forward'].produce({}, null, c)).toMatchObject({ origin: 'hop' });
    expect(STEP_CATALOGUE['hygiene.sweep'].produce({ destination: 'external-fresh' }, null, c)).toMatchObject(
      { origin: 'external' },
    );
    expect(STEP_CATALOGUE['pool.exit'].produce({}, null, c)).toMatchObject({ origin: 'pool-exit' });
    expect(
      STEP_CATALOGUE['pool.deposit'].produce({ pool: 'railgun' }, null, { role: 'payer', asset: 'erc20' }),
    ).toMatchObject({ holder: 'payer' });
    expect(STEP_CATALOGUE['pool.deposit'].fan({ n: 3 }, null)).toBe(3);
  });
});

describe('expand and planHash', () => {
  it('instance id is sha256(pipelineId | lineagePath | stepIndex)', () => {
    expect(instanceIdOf('p1', [0, 1], 3)).toBe(sha256Hex('p1|0.1|3'));
    expect(sha256Hex('abc')).toBe('0xba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('3.5 chain expands to six instances on one lineage', () => {
    const t = expand(pipe('payer', PAYER_3_5));
    expect(t.nodes.map((n) => n.kind)).toEqual([
      'src.wallet',
      'payer.fresh-wallet',
      'amount.shape',
      'pool.deposit',
      'pool.dwell',
      'pay.from-pool',
    ]);
    expect(t.lineages).toBe(1);
    expect(t.nodes[0]?.after).toBeNull();
    expect(t.nodes[1]?.after).toBe(t.nodes[0]?.instanceId);
  });
  it('fan-out lineages: deposit n=2 then exit partials=2 gives 4 exit outputs', () => {
    const t = expand(
      pipe('seller', [
        s('recv.stealth'),
        s('pool.deposit', { n: 2 }),
        s('pool.dwell'),
        s('pool.exit', { partials: 2 }),
      ]),
    );
    expect(t.nodes.filter((n) => n.kind === 'pool.dwell').map((n) => n.lineagePath)).toEqual([[0], [1]]);
    expect(t.nodes.filter((n) => n.kind === 'pool.exit').map((n) => n.lineagePath)).toEqual([[0], [1]]);
    expect(t.lineages).toBe(4);
    const ids = t.nodes.map((n) => n.instanceId);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('payer parts become per-part pay.submit instances', () => {
    const t = expand(
      pipe('payer', [s('src.wallet'), s('amount.shape', { mode: 'split', parts: 3 }), s('pay.submit')]),
    );
    const subs = t.nodes.filter((n) => n.kind === 'pay.submit');
    expect(subs.map((n) => n.lineagePath)).toEqual([[0], [1], [2]]);
    expect(new Set(subs.map((n) => n.after)).size).toBe(1);
  });
  it('throws on unknown structure', () => {
    expect(() => expand({ ...pipe('payer', []), steps: [{ kind: 'x' } as never] })).toThrow(PipelineError);
    expect(() => expand({ ...pipe('payer', [s('src.wallet')]), layers: null as never })).toThrow(
      PipelineError,
    );
  });
  it('planHash is stable, normalises defaults, and changes with any change', () => {
    const a = pipe('payer', [s('src.wallet'), s('pay.submit')]);
    const b = pipe('payer', [s('src.wallet'), s('pay.submit', { payerMode: 'direct', route: 'router' })]);
    expect(planHash(a)).toBe(planHash(b));
    expect(planHash(a)).toMatch(/^0x[0-9a-f]{64}$/);
    expect(planHash(a)).not.toBe(
      planHash(pipe('payer', [s('src.wallet'), s('pay.submit', { route: 'direct-no-fee' })])),
    );
    expect(planHash(a)).not.toBe(
      planHash({ ...a, layers: { ...a.layers, transport: { rpc: 'tor-socks' } } }),
    );
    expect(planHash(a)).not.toBe(planHash({ ...a, id: 'p2' }));
    expect(planHash(a)).not.toBe(planHash({ ...a, invoiceGross: '5' }));
    expect(planHash(a)).not.toBe(planHash({ ...a, ctBackend: 'ct2-fhenix' }));
  });
  it('planHash rounds quotes: small fee jitter keeps the hash, a real change does not', () => {
    const a = pipe('payer', [s('src.wallet'), s('pay.submit')]);
    const id = expand(a).nodes[1]?.instanceId as string;
    const h1 = planHash(a, { [id]: { feeBps: 25.2, gasWeiMax: 123_456n } });
    expect(planHash(a, { [id]: { feeBps: 24.9, gasWeiMax: 123_456n } })).toBe(h1);
    expect(planHash(a, { [id]: { feeBps: 26, gasWeiMax: 123_456n } })).not.toBe(h1);
    expect(planHash(a, { [id]: { feeBps: 25 } })).not.toBe(h1);
    expect(planHash(a, { [id]: { feeBps: 25, gasWeiMax: 99n } })).toBe(
      planHash(a, { [id]: { feeBps: 25, gasWeiMax: 99n } }),
    );
  });
  it('canonical JSON sorts keys and rejects unsupported values', () => {
    expect(canonical({ b: 1, a: [2n, null, undefined], c: undefined, d: true, e: false })).toBe(
      '{"a":["2",null,null],"b":1,"d":true,"e":false}',
    );
    expect(() => canonical(Number.NaN)).toThrow(TypeError);
    expect(() => canonical(() => 1)).toThrow(TypeError);
    expect(canonical(null)).toBe('null');
  });
});

describe('simulate / summary (PL-8, CL-1..CL-3)', () => {
  const c = fullCtx();
  it('standard payer: 25 bps router fee, one prompt, no wait', () => {
    const s1 = simulate(pipe('payer', [s('src.wallet'), s('pay.submit')]), c);
    expect(s1.cost.totalFeeBpsMax).toBe(25);
    expect(s1.cost.totalFeeBpsMin).toBe(25);
    expect(s1.latency).toEqual({
      minMs: 0,
      maxMs: 0,
      creditedDwellMs: 0,
      appOpenRequired: false,
      signaturePrompts: 1,
    });
    expect(s1.strength).toEqual(['baseline']);
    expect(s1.cost.singleStepBaselineBps).toBe(50);
  });
  it('hops cost floors 0.50/0.99/1.49/1.98 percent plus the sweep (min) and the cap model (max)', () => {
    const mins = [1, 2, 3, 4].map(
      (k) =>
        simulate(pipe('seller', [s('recv.stealth'), s('hops.forward', { hops: k })]), c).cost.totalFeeBpsMin,
    );
    expect(mins).toEqual([50, 99, 149, 198]);
    const maxes = [1, 4].map(
      (k) =>
        simulate(pipe('seller', [s('recv.stealth'), s('hops.forward', { hops: k })]), c).cost.totalFeeBpsMax,
    );
    expect(maxes).toEqual([300, 1148]);
  });
  it('credited dwell counts only pool.dwell at its minimum, never hops or delays (PL-8, HOP-POOL-2)', () => {
    const p = pipe('seller', [
      s('recv.stealth'),
      s('sweep.delay'),
      s('pool.deposit'),
      s('pool.dwell', { minHours: 24, maxHours: 72 }),
      s('pool.exit'),
    ]);
    const r = simulate(p, c);
    expect(r.latency.creditedDwellMs).toBe(86_400_000);
    expect(r.latency.minMs).toBe(600_000 + 86_400_000);
    expect(r.latency.maxMs).toBe(6 * 3_600_000 + 259_200_000);
    expect(r.latency.appOpenRequired).toBe(true);
    const h = simulate(pipe('seller', [s('recv.stealth'), s('hops.forward', { hops: 2 })]), c);
    expect(h.latency.creditedDwellMs).toBe(0);
    expect(h.latency.maxMs).toBe(2 * 43_200_000);
  });
  it('strength is a set with the crowd class at most once; two pools do not add', () => {
    const one = simulate(
      pipe('seller', [s('recv.stealth'), s('pool.deposit'), s('pool.dwell'), s('pool.exit')]),
      c,
    );
    expect(one.strength.filter((x) => x === 'crowd-dependent-unlinking')).toHaveLength(1);
    const two = simulate(
      pipe('seller', [
        s('recv.stealth'),
        s('pool.deposit', { pool: 'railgun' }),
        s('pool.deposit', { pool: 'privacy-pools' }),
        s('pool.dwell'),
        s('pool.exit'),
      ]),
      c,
    );
    expect(two.strength).toEqual(one.strength);
    expect(two.issues.map((i) => i.key)).toContain('privacy.warn.chain.secondPoolNoGain');
    expect(new Set(two.strength).size).toBe(two.strength.length);
  });
  it('pool pipelines always show the crowd and testnet text keys (CL-3)', () => {
    const r = simulate(pipe('payer', PAYER_3_5), c);
    expect(r.reveals).toEqual(
      expect.arrayContaining([
        'privacy.warn.crowdTiny',
        'privacy.warn.depositPublic',
        'privacy.warn.testnetOnly',
        'privacy.warn.noAnonymity',
      ]),
    );
    const plain = simulate(pipe('payer', [s('src.wallet'), s('pay.submit')]), c);
    expect(plain.reveals).not.toContain('privacy.warn.crowdTiny');
    expect(plain.reveals).toContain('privacy.warn.noAnonymity');
  });
  it('trust union includes layers and scan modes (E-5)', () => {
    const p = pipe('seller', [s('recv.stealth'), s('hygiene.sweep')], {
      layers: { transport: { relayer: 'tor-socks', rpc: 'onion' }, scanMode: 'pir2', verification: 'direct' },
    });
    const r = simulate(p, c);
    expect(r.trust).toEqual(
      expect.arrayContaining(['tor-network', 'tor-exit', 'sweep-relayer', 'rpc', 'pir-server-pair']),
    );
    expect(r.reveals).toEqual(
      expect.arrayContaining([
        'privacy.warn.pirNonCollusion',
        'privacy.warn.directReadsRevealAddress',
        'privacy.warn.contentNotHidden',
      ]),
    );
    const q = simulate(
      pipe('seller', [s('recv.stealth'), s('hygiene.sweep')], { layers: { scanMode: 'indexer-tor' } }),
      c,
    );
    expect(q.trust).toContain('indexer');
    const lc = simulate(
      pipe('seller', [s('recv.stealth'), s('hygiene.sweep')], { layers: { scanMode: 'light-client' } }),
      c,
    );
    expect(lc.trust).toContain('light-client-checkpoint');
    const other = simulate(
      pipe('seller', [s('recv.stealth'), s('hygiene.sweep')], {
        layers: { transport: { relayer: 'ohttp', scan: 'i2p-outproxy' } },
      }),
      c,
    );
    expect(other.trust).toEqual(expect.arrayContaining(['ohttp-relay', 'ohttp-gateway', 'i2p-outproxy']));
  });
  it('emergent leaks E-1, E-3, E-4, E-6, E-7', () => {
    const long = simulate(
      pipe('seller', [s('recv.stealth'), s('sweep.delay'), s('hops.forward'), s('hygiene.sweep')]),
      c,
    );
    const keys = long.issues.map((i) => i.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'privacy.warn.chain.amountContinuity',
        'privacy.warn.chain.appMustStayOpen',
        'privacy.warn.chain.combinationFingerprint',
        'privacy.warn.chain.samePartyManySteps',
      ]),
    );
    expect(long.amountLadderBps.length).toBe(2);
    expect(long.amountLadderBps[1] as number).toBeGreaterThan(long.amountLadderBps[0] as number);
    const longRun = simulate(
      pipe('payer', [
        s('src.wallet'),
        s('payer.fresh-wallet'),
        s('amount.shape', { mode: 'denom', parts: 1 }),
        s('pool.deposit'),
        s('pool.dwell'),
        s('pay.from-pool'),
      ]),
      c,
    );
    expect(longRun.issues.map((i) => i.key)).toContain('privacy.warn.chain.longRun');
    const common = simulate(pipe('seller', [s('recv.stealth'), s('hygiene.sweep')]), c);
    expect(common.issues.map((i) => i.key)).not.toContain('privacy.warn.chain.combinationFingerprint');
    expect(common.reveals).not.toContain('privacy.warn.timingNotHidden');
  });
  it('quotes override the static model and latency', () => {
    const p = pipe('seller', [s('recv.stealth'), s('hygiene.sweep')]);
    const id = expand(p).nodes[1]?.instanceId as string;
    const r = simulate(p, c, { [id]: { feeBps: 77.4, gasWeiMax: 9n, latencyMinMs: 5, latencyMaxMs: 9 } });
    expect(r.cost.perStep.find((x) => x.instanceId === id)).toEqual({
      instanceId: id,
      feeBps: 78,
      feeBpsMin: 77,
      gasWeiMax: 9n,
    });
    expect(r.latency).toMatchObject({ minMs: 5, maxMs: 9 });
  });
  it('no numeric privacy score exists in the summary (type-level and runtime)', () => {
    const r = simulate(pipe('payer', [s('src.wallet'), s('pay.submit')]), c);
    expect(Object.keys(r).sort()).toEqual([
      'amountLadderBps',
      'cost',
      'issues',
      'latency',
      'requiredAcks',
      'reveals',
      'strength',
      'trust',
    ]);
    type Keys = keyof typeof r;
    const forbidden: Extract<Keys, 'score' | 'privacyScore' | 'rating' | 'anonymitySet'>[] = [];
    expect(forbidden).toEqual([]);
    for (const k of Object.keys(r)) expect(/score|rating|level|rank/i.test(k)).toBe(false);
  });
  it('simulate on a non-testnet chain throws', () => {
    const bad = { ...pipe('payer', []), chain: { family: 'evm', chainId: 1 } } as unknown as Pipeline;
    expect(() => simulate(bad, ctx())).toThrow(PipelineError);
  });
});
