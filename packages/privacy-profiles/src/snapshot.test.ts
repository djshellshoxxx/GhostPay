import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ALL_TRUST_PARTIES, emptyConfig, toConfig } from './config.js';
import type { ConsentKey, ProfileConfig } from './config.js';
import { ALL_CAPABILITIES } from './keys.js';
import { applyPreset } from './resolve.js';
import { createSnapshot, reviewConfig, snapshotIsCurrent } from './snapshot.js';
import type { Capability, Context, PresetId } from './types.js';
import { ctx, sel } from './x.testutil.js';

const TOR_CAPS: ReadonlySet<Capability> = new Set<Capability>(['tor-browser-asserted', 'selftest-ok:rpc', 'selftest-ok:relayer']);
const torCtx = (): Context => ctx({ capabilities: TOR_CAPS });
const tor = (consents: ConsentKey[] = []): ProfileConfig =>
  toConfig({ preset: 'custom', values: { 'net.rpcProfile': 'tor-browser' }, acks: [] }, consents);

describe('consent requirements are derived from what actually takes effect', () => {
  it('the safe default and the standard preset need no consent', () => {
    expect(reviewConfig(emptyConfig(), ctx()).requiredConsents).toEqual([]);
    const std = toConfig(applyPreset('standard', ctx()).selection);
    const r = reviewConfig(std, ctx());
    expect(r.requiredConsents).toEqual([]);
    expect(r.ready).toBe(true);
  });
  it('a non-default value that relies on a party requires that party, sorted, with the options that need it', () => {
    const r = reviewConfig(tor(), torCtx());
    expect(r.requiredConsents).toEqual([
      { key: 'party:tor-exit', options: ['net.rpcProfile'] },
      { key: 'party:tor-network', options: ['net.rpcProfile'] },
    ]);
    expect(r.missingConsents).toEqual(['party:tor-exit', 'party:tor-network']);
    expect(r.ready).toBe(false);
    expect(r.evaluation.ok).toBe(true);
  });
  it('recorded consent covers it; extra consent is reported as unused, never required', () => {
    const r = reviewConfig(tor(['party:tor-exit', 'party:tor-network', 'party:rpc']), torCtx());
    expect(r.missingConsents).toEqual([]);
    expect(r.unusedConsents).toEqual(['party:rpc']);
    expect(r.ready).toBe(true);
  });
  it('consent for one party does not cover another', () => {
    const r = reviewConfig(tor(['party:tor-network']), torCtx());
    expect(r.missingConsents).toEqual(['party:tor-exit']);
    expect(r.ready).toBe(false);
  });
  it('a value that is out of scope for the action needs no consent (it does not take effect)', () => {
    const c = toConfig({ preset: 'custom', values: { 'sweep.verification': 'direct' }, acks: [] });
    expect(reviewConfig(c, ctx({ action: 'create-invoice' })).requiredConsents).toEqual([]);
    expect(reviewConfig(c, ctx({ action: 'sweep' })).requiredConsents.map((x) => x.key)).toEqual(['party:rpc']);
  });
  it('an experimental value needs its own consent on top of its parties', () => {
    const caps = new Set<Capability>(['nym-build', 'selftest-ok:rpc', 'selftest-ok:relayer']);
    const cfg = toConfig({ preset: 'custom', values: { 'net.rpcProfile': 'nym-mixfetch' }, acks: [] });
    const r = reviewConfig(cfg, ctx({ capabilities: caps }));
    expect(r.requiredConsents.map((x) => x.key)).toEqual(['experimental:net.rpcProfile=nym-mixfetch', 'party:nym-mixnet']);
    expect(reviewConfig(toConfig(cfg, ['party:nym-mixnet', 'experimental:net.rpcProfile=nym-mixfetch']), ctx({ capabilities: caps })).ready).toBe(true);
  });
  it('a preset result proposes consents but never records them', () => {
    const r = applyPreset('maximum', ctx({ env: 'web-onion' }));
    const cfg = toConfig(r.selection);
    expect(cfg.consents).toEqual([]);
    expect(reviewConfig(cfg, ctx({ env: 'web-onion' })).requiredConsents.length).toBeGreaterThan(0);
  });
  it('every required consent is a valid consent party or experimental key', () => {
    for (const id of ['enhanced', 'shielded', 'maximum', 'confidential-amount'] as PresetId[]) {
      for (const k of reviewConfig(toConfig(applyPreset(id, ctx({ env: 'web-onion' })).selection), ctx({ env: 'web-onion' })).requiredConsents) {
        if (k.key.startsWith('party:')) expect(ALL_TRUST_PARTIES as readonly string[]).toContain(k.key.slice(6));
        else expect(k.key.startsWith('experimental:')).toBe(true);
      }
    }
  });
});

describe('createSnapshot gates on evaluation, acknowledgements and consent', () => {
  it('standard preset: snapshot is created', () => {
    const r = createSnapshot(toConfig(applyPreset('standard', ctx()).selection), ctx());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.snapshot.version).toBe(1);
      expect(r.snapshot.evaluation.ok).toBe(true);
      expect(r.snapshot.consents).toEqual([]);
    }
  });
  it('missing consent: refused with a key, review attached', () => {
    const r = createSnapshot(tor(), torCtx());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reasons).toEqual(['privacy.err.snapshot.consentMissing']);
      expect(r.review.missingConsents.length).toBe(2);
    }
  });
  it('missing acknowledgement: refused as blocked even when every consent is present', () => {
    const cfg = toConfig({ preset: 'custom', values: { 'sweep.exit': 'privacy-pools' }, acks: [] }, ['party:privacy-pools-asp', 'party:privacy-pools-operator', 'party:third-party-unaudited-code', 'party:pool-relayer']);
    const r = createSnapshot(cfg, ctx());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons).toContain('privacy.err.snapshot.blocked');
  });
  it('a blocking conflict is refused even with all acknowledgements and consents', () => {
    const cfg = toConfig({ preset: 'custom', values: { 'sweep.hops': '3', 'sweep.hopRelayers': 'direct' }, acks: ['privacy.ack.hopsWeak'] }, ['party:sweep-relayer']);
    const r = createSnapshot(cfg, ctx());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.review.evaluation.blocking.map((b) => b.ruleId)).toContain('R-05');
  });
  it('acknowledgements and consents together succeed, and the snapshot carries both', () => {
    const cfg = toConfig({ preset: 'custom', values: { 'net.rpcProfile': 'tor-browser' }, acks: [] }, ['party:tor-exit', 'party:tor-network']);
    const r = createSnapshot(cfg, torCtx());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.snapshot.consents).toEqual(['party:tor-exit', 'party:tor-network']);
  });
  it('never throws and never succeeds on malformed input', () => {
    fc.assert(
      fc.property(fc.anything(), fc.anything(), (a, b) => {
        const r = createSnapshot(a as never, b as never);
        expect(r.ok).toBe(false);
      }),
      { numRuns: 300 },
    );
  });
  it('invalid context blocks even for the empty config', () => {
    const r = createSnapshot(emptyConfig(), { ...ctx(), capabilities: ['tor-socks'] } as never);
    expect(r.ok).toBe(false);
  });
});

describe('snapshots are immutable and independent of their inputs', () => {
  const make = (): { cfg: ProfileConfig; c: Context; snap: ReturnType<typeof expectSnap> } => {
    const caps = new Set<Capability>(TOR_CAPS);
    const c = ctx({ capabilities: caps });
    const cfg = tor(['party:tor-exit', 'party:tor-network']);
    return { cfg, c, snap: expectSnap(createSnapshot(cfg, c)) };
  };
  function expectSnap(r: ReturnType<typeof createSnapshot>) {
    if (!r.ok) throw new Error('expected a snapshot');
    return r.snapshot;
  }
  it('is deeply frozen, including the capability list', () => {
    const { snap } = make();
    for (const o of [snap, snap.config, snap.config.values, snap.config.acks, snap.config.consents, snap.context, snap.context.capabilities, snap.evaluation, snap.evaluation.blocking, snap.evaluation.effective]) {
      expect(Object.isFrozen(o)).toBe(true);
    }
    expect(() => {
      (snap.config.values as Record<string, string>)['sweep.dust'] = 'off';
    }).toThrow(TypeError);
    expect(() => {
      (snap.context.capabilities as Capability[]).push('test-mode');
    }).toThrow(TypeError);
    expect(() => {
      (snap.evaluation as { ok: boolean }).ok = false;
    }).toThrow(TypeError);
  });
  it('later mutation of the caller context or config does not change the snapshot (F18-AC09)', () => {
    const { cfg, c, snap } = make();
    const before = snap.canonical;
    (c.capabilities as Set<Capability>).add('test-mode');
    (c.capabilities as Set<Capability>).delete('tor-browser-asserted');
    expect(snap.canonical).toBe(before);
    expect(snap.context.capabilities).toContain('tor-browser-asserted');
    expect(snap.context.capabilities).not.toContain('test-mode');
    expect(snapshotIsCurrent(snap, cfg, c)).toBe(false);
  });
  it('is current only for the same config, consents and context (F18-AC07 staleness)', () => {
    const { cfg, c, snap } = make();
    expect(snapshotIsCurrent(snap, cfg, c)).toBe(true);
    expect(snapshotIsCurrent(snap, toConfig(cfg, ['party:tor-exit']), c)).toBe(false);
    expect(snapshotIsCurrent(snap, toConfig({ ...cfg, values: { ...cfg.values, 'sweep.dust': 'off' } }, [...cfg.consents]), c)).toBe(false);
    expect(snapshotIsCurrent(snap, cfg, { ...c, chainId: 84532 })).toBe(false);
    expect(snapshotIsCurrent(snap, cfg, { ...c, env: 'web-onion' })).toBe(false);
    expect(snapshotIsCurrent(snap, cfg, { ...c, action: 'pay' })).toBe(false);
    expect(snapshotIsCurrent(snap, cfg, { ...c, asset: 'erc20' })).toBe(false);
    expect(snapshotIsCurrent(snap, cfg, { ...c, btcNetwork: 'regtest' })).toBe(false);
    expect(snapshotIsCurrent(snap, cfg, { ...c, capabilities: new Set<Capability>([...TOR_CAPS, 'multi-rpc']) })).toBe(false);
  });
  it('canonical text ignores insertion order of capabilities and keys', () => {
    const a = createSnapshot(emptyConfig(), ctx({ capabilities: new Set<Capability>(['tor-socks', 'multi-rpc', 'own-node']) }));
    const b = createSnapshot(emptyConfig(), ctx({ capabilities: new Set<Capability>(['own-node', 'multi-rpc', 'tor-socks']) }));
    expect(a.ok && b.ok && a.snapshot.canonical).toBe(b.ok && b.snapshot.canonical);
    const x = createSnapshot(toConfig(sel({ 'sweep.dust': 'off', 'btc.rbf': 'off' })), ctx());
    const y = createSnapshot(toConfig(sel({ 'btc.rbf': 'off', 'sweep.dust': 'off' })), ctx());
    expect(x.ok && x.snapshot.canonical).toBe(y.ok && y.snapshot.canonical);
  });
  it('does not retain the caller selection object', () => {
    const cfg = toConfig(sel({ 'sweep.dust': 'off' }));
    const r = createSnapshot(cfg, ctx());
    expect(r.ok && r.snapshot.config).not.toBe(cfg);
    expect(r.ok && r.snapshot.config).toEqual(cfg);
  });
  it('a stored snapshot cannot be made to look current for different input', () => {
    const { cfg, c, snap } = make();
    const forged = { ...snap, canonical: 'x' };
    expect(snapshotIsCurrent(forged, cfg, c)).toBe(false);
    expect(snapshotIsCurrent(null as never, cfg, c)).toBe(false);
    expect(snapshotIsCurrent(snap, null as never, null as never)).toBe(false);
  });
});

describe('property: a snapshot only ever exists for a fully reviewed configuration', () => {
  const arbCaps = fc.subarray([...ALL_CAPABILITIES], { maxLength: 14 });
  it('ok implies no blocking issue and every party consented', () => {
    fc.assert(
      fc.property(fc.constantFrom('standard', 'enhanced', 'shielded', 'maximum', 'confidential-amount') as fc.Arbitrary<PresetId>, arbCaps, fc.constantFrom<Context['env'][]>('web', 'web-onion', 'node'), fc.boolean(), (id, caps, env, consentAll) => {
        const c: Context = { action: 'settings', chainId: 11155111, env, capabilities: new Set(caps), btcNetwork: 'regtest' };
        const pr = applyPreset(id, c);
        const bare = toConfig(pr.selection);
        const need = reviewConfig(bare, c).requiredConsents.map((x) => x.key);
        const cfg = toConfig({ ...pr.selection, acks: [...pr.evaluation.requiredAcks] }, consentAll ? need : []);
        const r = createSnapshot(cfg, c);
        if (r.ok) {
          expect(r.snapshot.evaluation.blocking).toEqual([]);
          for (const k of need) expect(r.snapshot.consents).toContain(k);
        } else expect(r.reasons.length).toBeGreaterThan(0);
        if (consentAll) expect(r.ok).toBe(true);
        else if (need.length > 0) expect(r.ok).toBe(false);
      }),
      { numRuns: 120 },
    );
  });
});
