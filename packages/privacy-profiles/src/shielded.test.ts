import { describe, expect, it } from 'vitest';
import { OPTION_CATALOGUE } from './catalogue.js';
import { describePreset } from './claims.js';
import { parseConfig, serializeConfig, toConfig } from './config.js';
import { evaluate } from './evaluate.js';
import { ALL_CAPABILITIES } from './keys.js';
import { PRESETS } from './presets.js';
import { acknowledge, applyPreset, setOption } from './resolve.js';
import { createSnapshot, reviewConfig } from './snapshot.js';
import type { Capability, OptionId } from './types.js';
import { ctx } from './x.testutil.js';

const caps = (...c: Capability[]): ReadonlySet<Capability> => new Set(c);
const SHARED_POOL_TRACK: OptionId[] = ['sweep.exit', 'pay.source', 'sweep.poolAmountPlan'];
const NETWORK_AND_SPONSOR: OptionId[] = [
  'net.rpcProfile', 'net.relayerProfile', 'net.rpcMode', 'net.endpointSeparation', 'net.scanMode',
  'pay.payerMode', 'sweep.hops', 'btc.mode', 'pay.amountVisibility', 'pay.amountBlur',
];

describe('shielded preset (issue 284 / F18): pool track, proposal only', () => {
  it('is registered after enhanced and before maximum', () => {
    expect(Object.keys(PRESETS)).toEqual(['standard', 'enhanced', 'shielded', 'maximum', 'confidential-amount']);
    expect(PRESETS.shielded.id).toBe('shielded');
  });

  it('D05: buffer is the sole automatic exit-gas preference; Maximum keeps its advanced order', () => {
    expect(PRESETS.shielded.prefer['sweep.exitGas']).toEqual(['buffer']);
    expect(PRESETS.maximum.prefer['sweep.exitGas']).toEqual(['eip7702', 'permit-sponsored', 'buffer']);
    for (const c of [
      ctx(),
      ctx({ env: 'web-onion', asset: 'erc20-permit' }),
      ctx({ asset: 'erc20-permit', capabilities: caps('manifest:shielded-pool', 'pool-relayer', 'pool-note') }),
      ctx({ capabilities: caps('manifest:railgun', 'railgun-broadcaster') }),
      ctx({ capabilities: caps() }),
      ctx({ chainId: 1, action: 'pay' }),
    ]) {
      const r = applyPreset('shielded', c);
      // Default values are intentionally omitted from the stored selection.
      expect(r.selection.values['sweep.exitGas']).toBeUndefined();
      expect(r.evaluation.effective['sweep.exitGas']).toBe('buffer');
      expect(r.downgrades.filter((d) => d.option === 'sweep.exitGas')).toEqual([]);
      expect(r.selection.acks).toEqual([]);
    }
  });

  it('buffer funding keeps pool-relayer consent, acknowledgements and the unqualified description', () => {
    const c = ctx({ capabilities: caps('manifest:shielded-pool', 'pool-relayer', 'pool-note') });
    const r = applyPreset('shielded', c);
    const cfg = toConfig(r.selection);
    const review = reviewConfig(cfg, c);
    expect(r.evaluation.effective['sweep.exitGas']).toBe('buffer');
    expect(r.evaluation.effective['sweep.poolSubmit']).toBe('relayer');
    expect(review.requiredConsents.find((x) => x.key === 'party:pool-relayer')?.options).toContain('sweep.exit');
    expect(cfg.consents).toEqual([]);
    expect(review.missingConsents).toContain('party:pool-relayer');
    expect(review.ready).toBe(false);
    expect(describePreset('shielded', c)).toMatchObject({ qualification: 'unqualified', verified: false, ready: false });
    const acks = [...r.evaluation.requiredAcks];
    const consents = review.requiredConsents.map((x) => x.key);
    expect(acks).toContain('privacy.ack.poolDisclosure');
    expect(createSnapshot(toConfig({ ...r.selection, acks }), c).ok).toBe(false);
    expect(createSnapshot(toConfig(r.selection, consents), c).ok).toBe(false);
    expect(createSnapshot(toConfig({ ...r.selection, acks }, consents), c).ok).toBe(true);
  });

  it.each(['eip7702', 'permit-sponsored'])('explicit advanced %s edits remain available for a supported pool', (gas) => {
    const c = ctx({ asset: 'erc20-permit', capabilities: caps('manifest:shielded-pool', 'pool-relayer', 'pool-note', 'eip7702') });
    const r = setOption(applyPreset('shielded', c).selection, 'sweep.exitGas', gas, c);
    expect(r.selection.preset).toBe('custom');
    expect(r.selection.values['sweep.exitGas']).toBe(gas);
    expect(r.evaluation.effective['sweep.exitGas']).toBe(gas);
    expect(r.evaluation.blocking.every((b) => b.code === 'E_ACK_MISSING')).toBe(true);
    expect(r.selection.acks).toEqual([]);
    if (gas === 'eip7702') expect(r.evaluation.warnings.map((w) => w.key)).toContain('privacy.warn.persistent7702Delegate');
    const review = reviewConfig(toConfig(r.selection), c);
    expect(review.missingConsents).toContain('party:pool-relayer');
    const accepted = toConfig({ ...r.selection, acks: [...r.evaluation.requiredAcks] }, review.requiredConsents.map((x) => x.key));
    expect(createSnapshot(accepted, c).ok).toBe(true);
  });

  it.each([
    ['eip7702', 'eip7702'],
    ['permit-sponsored', 'pool-relayer'],
  ] as const)('explicit %s stays blocked without its %s capability', (gas, missing) => {
    const c = ctx({ asset: 'erc20-permit', capabilities: caps('manifest:shielded-pool', 'pool-relayer', 'pool-note', 'eip7702') });
    const selection = applyPreset('shielded', c).selection;
    const reduced = { ...c, capabilities: new Set([...c.capabilities].filter((cap) => cap !== missing)) };
    const r = setOption(selection, 'sweep.exitGas', gas, reduced);
    expect(r.selection.values['sweep.exitGas']).toBe(gas);
    expect(r.evaluation.blocking).toContainEqual({ code: 'E_CAPABILITY', key: `privacy.err.requires.cap.${missing}`, options: ['sweep.exitGas'] });
    expect(createSnapshot(toConfig(r.selection), reduced).ok).toBe(false);
  });

  it('explicit permit funding retains the asset restriction and Privacy Pools conflict', () => {
    const ownPool = ctx({ asset: 'erc20', capabilities: caps('manifest:shielded-pool', 'pool-relayer', 'pool-note') });
    const unsupported = setOption(applyPreset('shielded', ownPool).selection, 'sweep.exitGas', 'permit-sponsored', ownPool);
    expect(unsupported.evaluation.blocking).toContainEqual({ code: 'E_WRONG_ASSET', key: 'privacy.err.wrongAsset', options: ['sweep.exitGas'] });
    const privacyPools = ctx({ asset: 'erc20-permit' });
    const conflict = setOption(applyPreset('shielded', privacyPools).selection, 'sweep.exitGas', 'permit-sponsored', privacyPools);
    expect(conflict.evaluation.blocking).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'E_CONFLICT', ruleId: 'R-34' })]));
  });

  it.each(['eip7702', 'permit-sponsored'])('stored Shielded %s values survive v1 migration and v2 round-trips', (gas) => {
    const c = ctx({ asset: 'erc20-permit', capabilities: caps('manifest:shielded-pool', 'pool-relayer', 'pool-note', 'eip7702') });
    const selection = applyPreset('shielded', c).selection;
    const original = { ...selection, values: { ...selection.values, 'sweep.exitGas': gas } };
    for (const v of [1, 2]) {
      const parsed = parseConfig({ v, ...original, ...(v === 2 ? { consents: [] } : {}) });
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) continue;
      expect(parsed.migratedFrom).toBe(v === 1 ? 1 : null);
      expect(parsed.config.values).toEqual(original.values);
      expect(parsed.config.acks).toEqual([]);
      expect(parsed.config.consents).toEqual([]);
      const roundTrip = parseConfig(serializeConfig(parsed.config));
      expect(roundTrip.ok && roundTrip.config).toEqual(parsed.config);
      const review = reviewConfig(parsed.config, c);
      const accepted = toConfig({ ...parsed.config, acks: [...review.evaluation.requiredAcks] }, review.requiredConsents.map((x) => x.key));
      const snapshot = createSnapshot(accepted, c);
      expect(snapshot.ok).toBe(true);
      if (snapshot.ok) {
        expect(snapshot.snapshot.config.values).toEqual(original.values);
        expect(snapshot.snapshot.config.preset).toBe('custom');
      }
    }
  });

  it('full capabilities: pool exit and pool payment source, acknowledgements required but never given', () => {
    const r = applyPreset('shielded', ctx({ env: 'web-onion' }));
    expect(r.selection.preset).toBe('shielded');
    expect(r.selection.values['sweep.exit']).toBe('privacy-pools');
    expect(r.selection.values['pay.source']).toBe('shielded-pool');
    expect(r.selection.values['sweep.poolAmountPlan']).toBeUndefined();
    expect(r.selection.acks).toEqual([]);
    expect(r.evaluation.requiredAcks).toEqual(expect.arrayContaining(['privacy.ack.poolDisclosure', 'privacy.ack.shieldedPoolTestnet']));
    expect(r.evaluation.blocking.every((b) => b.code === 'E_ACK_MISSING')).toBe(true);
    expect(r.evaluation.ok).toBe(false);
    let s = r.selection;
    for (const a of r.evaluation.requiredAcks) s = acknowledge(s, a);
    expect(evaluate(s, ctx({ env: 'web-onion' })).ok).toBe(true);
  });

  it('never touches network hardening, sponsors, hops, amount confidentiality or splitting', () => {
    const r = applyPreset('shielded', ctx());
    for (const o of NETWORK_AND_SPONSOR) {
      if (o === 'pay.amountBlur') continue;
      expect(r.selection.values[o], o).toBeUndefined();
    }
    expect(['delay', undefined]).toContain(r.selection.values['pay.amountBlur']);
  });

  it('never selects a confidential amount, so R-11 and R-13 can never fire from this preset', () => {
    for (const c of [ctx(), ctx({ chainId: 84532 }), ctx({ env: 'node' })]) {
      const r = applyPreset('shielded', c);
      expect(r.selection.values['pay.amountVisibility']).toBeUndefined();
      expect(r.evaluation.blocking.map((b) => b.ruleId)).not.toContain('R-13');
      expect(r.evaluation.blocking.map((b) => b.ruleId)).not.toContain('R-11');
    }
  });

  it('own pool only: falls back to shielded-pool and records the downgrade', () => {
    const r = applyPreset('shielded', ctx({ capabilities: caps('manifest:shielded-pool', 'pool-relayer', 'pool-note') }));
    expect(r.selection.values['sweep.exit']).toBe('shielded-pool');
    expect(r.downgrades.find((d) => d.option === 'sweep.exit')).toMatchObject({ wanted: 'privacy-pools', got: 'shielded-pool' });
  });

  it('no capabilities: nothing shielded is proposed, every skipped pool value is a reported downgrade', () => {
    const r = applyPreset('shielded', ctx({ capabilities: caps() }));
    for (const o of [...SHARED_POOL_TRACK, 'sweep.exitGas'] as const) expect(r.selection.values[o], o).toBeUndefined();
    expect(r.downgrades.map((d) => d.option)).toEqual(expect.arrayContaining(['sweep.exit', 'pay.source']));
    expect(r.evaluation.requiredAcks).toEqual([]);
    expect(r.evaluation.ok).toBe(true);
  });

  it('wrong chain: everything falls back to defaults, nothing blocking', () => {
    const r = applyPreset('shielded', ctx({ chainId: 1, action: 'pay' }));
    expect(Object.keys(r.selection.values).filter((k) => !k.startsWith('btc.'))).toEqual([]);
    expect(r.evaluation.ok).toBe(true);
  });

  it('pool exit, payment source and amount-plan values still agree with Maximum', () => {
    for (const c of [ctx(), ctx({ env: 'web-onion' }), ctx({ capabilities: caps('manifest:railgun', 'railgun-broadcaster') })]) {
      const sh = applyPreset('shielded', c).selection.values;
      const mx = applyPreset('maximum', c).selection.values;
      for (const o of SHARED_POOL_TRACK) expect(sh[o], o).toEqual(mx[o]);
    }
  });

  it('every value it can pick is selectable, non-experimental and listed in the catalogue', () => {
    const picked = PRESETS.shielded.prefer;
    for (const [opt, list] of Object.entries(picked)) {
      const def = OPTION_CATALOGUE[opt as OptionId];
      expect(def.userSelectable, opt).toBe(true);
      for (const v of list ?? []) {
        const vd = def.values.find((x) => x.value === v);
        expect(vd, `${opt}=${v}`).toBeDefined();
        if (v !== def.defaultValue) expect(['experimental', 'test-only', 'stub', 'watch']).not.toContain(vd?.maturity);
      }
    }
    expect(ALL_CAPABILITIES.length).toBeGreaterThan(0);
  });

  it('is deterministic and does not mutate the shared preset table', () => {
    const before = JSON.stringify(PRESETS);
    expect(applyPreset('shielded', ctx())).toEqual(applyPreset('shielded', ctx()));
    expect(JSON.stringify(PRESETS)).toBe(before);
  });
});
