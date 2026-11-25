import { describe, expect, it } from 'vitest';
import { OPTION_CATALOGUE } from './catalogue.js';
import { evaluate } from './evaluate.js';
import { ALL_CAPABILITIES } from './keys.js';
import { PRESETS } from './presets.js';
import { acknowledge, applyPreset } from './resolve.js';
import type { Capability, OptionId } from './types.js';
import { ctx } from './x.testutil.js';

const caps = (...c: Capability[]): ReadonlySet<Capability> => new Set(c);
const POOL_TRACK: OptionId[] = ['sweep.exit', 'sweep.exitGas', 'pay.source', 'sweep.poolAmountPlan'];
const NETWORK_AND_SPONSOR: OptionId[] = [
  'net.rpcProfile', 'net.relayerProfile', 'net.rpcMode', 'net.endpointSeparation', 'net.scanMode',
  'pay.payerMode', 'sweep.hops', 'btc.mode', 'pay.amountVisibility', 'pay.amountBlur',
];

describe('shielded preset (issue 284 / F18): pool track, proposal only', () => {
  it('is registered after enhanced and before maximum', () => {
    expect(Object.keys(PRESETS)).toEqual(['standard', 'enhanced', 'shielded', 'maximum', 'confidential-amount']);
    expect(PRESETS.shielded.id).toBe('shielded');
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
    for (const o of POOL_TRACK) expect(r.selection.values[o], o).toBeUndefined();
    expect(r.downgrades.map((d) => d.option)).toEqual(expect.arrayContaining(['sweep.exit', 'pay.source']));
    expect(r.evaluation.requiredAcks).toEqual([]);
    expect(r.evaluation.ok).toBe(true);
  });

  it('wrong chain: everything falls back to defaults, nothing blocking', () => {
    const r = applyPreset('shielded', ctx({ chainId: 1, action: 'pay' }));
    expect(Object.keys(r.selection.values).filter((k) => !k.startsWith('btc.'))).toEqual([]);
    expect(r.evaluation.ok).toBe(true);
  });

  it('pool track values agree with maximum, so maximum is shielded plus network hardening (issue 284 section 2)', () => {
    for (const c of [ctx(), ctx({ env: 'web-onion' }), ctx({ capabilities: caps('manifest:railgun', 'railgun-broadcaster') })]) {
      const sh = applyPreset('shielded', c).selection.values;
      const mx = applyPreset('maximum', c).selection.values;
      for (const o of POOL_TRACK) expect(sh[o], o).toEqual(mx[o]);
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
