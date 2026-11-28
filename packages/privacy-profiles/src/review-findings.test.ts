// Regression tests for the findings of the independent review (each was reproduced against c902741 before the fix).
import { describe, expect, it } from 'vitest';
import { ALL_TRUST_PARTIES, CONFIG_ERROR_KEYS, emptyConfig, parseConfig, toConfig } from './config.js';
import type { ConsentKey, ProfileConfig } from './config.js';
import { describeConfig, describePreset } from './claims.js';
import { evaluate, honestLabel } from './evaluate.js';
import { ACK_KEYS, ALL_CAPABILITIES, ERROR_KEYS, WARNING_KEYS } from './keys.js';
import { acknowledge, applyPreset, defaultSelection, setOption } from './resolve.js';
import { createSnapshot, reviewConfig, snapshotIsCurrent } from './snapshot.js';
import type { SnapshotResult } from './snapshot.js';
import { ACTIONS, ASSET_KINDS, ENVS, OPTION_IDS, TESTNET_BTC_NETWORKS, TESTNET_CHAIN_IDS } from './types.js';
import type { AckKey, Capability, Context, OptionId, Selection } from './types.js';
import { ctx, sel } from './x.testutil.js';

const FRESH = { 'pay.payerMode': 'fresh-wallet' } as const;
const snap = (r: SnapshotResult) => {
  if (!r.ok) throw new Error(`expected a snapshot: ${r.reasons.join()}`);
  return r.snapshot;
};
const allConsents = (cfg: ProfileConfig, c: Context): ConsentKey[] => reviewConfig(cfg, c).requiredConsents.map((r) => r.key);
/** The configuration with every acknowledgement and consent its review asks for, as a user who accepted everything. */
const accepted = (selection: Selection, c: Context): ProfileConfig => {
  const bare = toConfig(selection);
  return toConfig({ ...selection, acks: [...evaluate(bare, c).requiredAcks] }, allConsents(bare, c));
};

describe('1. own properties only: nothing is read through the prototype chain', () => {
  const proto = { preset: 'custom', values: FRESH, acks: ['privacy.ack.payerStillPublic'], consents: [] };
  it('an object that inherits its selection is invalid, not accepted', () => {
    const inherited = Object.create(proto) as Selection;
    expect(evaluate(inherited, ctx()).blocking.map((b) => b.code)).toContain('E_INVALID_SELECTION');
    const r = createSnapshot(inherited as ProfileConfig, ctx());
    expect(r.ok).toBe(false);
  });
  it('a polluted Object.prototype cannot supply acknowledgements, values or consents', () => {
    const own = { preset: 'custom', values: FRESH } as unknown as Selection;
    Object.defineProperty(Object.prototype, 'acks', { value: ['privacy.ack.payerStillPublic'], configurable: true });
    try {
      const ev = evaluate(own, ctx());
      expect(ev.blocking.map((b) => b.code)).toEqual(expect.arrayContaining(['E_INVALID_SELECTION', 'E_ACK_MISSING']));
      expect(createSnapshot(own as ProfileConfig, ctx()).ok).toBe(false);
    } finally {
      delete (Object.prototype as unknown as Record<string, unknown>)['acks'];
    }
    const ownAcks = { preset: 'custom', acks: [] } as unknown as Selection;
    Object.defineProperty(Object.prototype, 'values', { value: FRESH, configurable: true });
    try {
      const ev = evaluate(ownAcks, ctx());
      expect(ev.blocking.map((b) => b.code)).toContain('E_INVALID_SELECTION');
      expect(ev.effective['pay.payerMode']).toBe('direct');
    } finally {
      delete (Object.prototype as unknown as Record<string, unknown>)['values'];
    }
    const c = { action: 'settings', chainId: 11155111, env: 'web' } as unknown as Context;
    Object.defineProperty(Object.prototype, 'capabilities', { value: new Set(ALL_CAPABILITIES), configurable: true });
    try {
      expect(evaluate(sel({ 'sweep.hops': '1' }), c).blocking.map((b) => b.code)).toContain('E_INVALID_CONTEXT');
    } finally {
      delete (Object.prototype as unknown as Record<string, unknown>)['capabilities'];
    }
  });
});

describe('2 and 3. the snapshot stores exactly what was reviewed, and invalid input is never current', () => {
  it('a list over the bound is refused instead of being silently emptied', () => {
    const cfg = { ...toConfig(sel(FRESH)), acks: new Array(65).fill('privacy.ack.payerStillPublic') as AckKey[] };
    const r = createSnapshot(cfg, ctx());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons).toContain('privacy.err.snapshot.invalidConfig');
  });
  it('every invalid entry makes the configuration invalid: unknown option, value, ack, consent, duplicates', () => {
    const base = toConfig(sel({}));
    for (const bad of [
      { ...base, values: { 'sweep.exit': 'bogus' } },
      { ...base, values: { 'sweep.bogus': 'x' } },
      { ...base, acks: ['x'] },
      { ...base, consents: ['y'] },
      { ...base, acks: ['privacy.ack.hopsWeak', 'privacy.ack.hopsWeak'] },
      { ...base, consents: ['party:rpc', 'party:rpc'] },
      { values: {}, acks: [], consents: [] },
    ]) {
      const r = createSnapshot(bad as unknown as ProfileConfig, ctx());
      expect(r.ok, JSON.stringify(bad)).toBe(false);
      if (!r.ok) expect(r.reasons).toContain('privacy.err.snapshot.invalidConfig');
    }
  });
  it('the stored config re-evaluates ok in the snapshot context, with the required acknowledgements and consents', () => {
    const c = ctx({ env: 'web-onion' });
    const bare = toConfig(applyPreset('maximum', c).selection);
    const cfg = toConfig({ ...bare, acks: [...evaluate(bare, c).requiredAcks] }, allConsents(bare, c));
    const s = snap(createSnapshot(cfg, c));
    const again: Context = { ...c, capabilities: new Set(s.context.capabilities) };
    expect(evaluate(s.config, again).ok).toBe(true);
    expect(reviewConfig(s.config, again).ready).toBe(true);
  });
  it('snapshotIsCurrent is false for input createSnapshot refuses', () => {
    const s = snap(createSnapshot(emptyConfig(), ctx()));
    expect(snapshotIsCurrent(s, emptyConfig(), ctx())).toBe(true);
    // Same label as the empty config, so once the invalid entries are dropped it is identical: only the validity check refuses it.
    const junk = { preset: 'standard', values: { 'sweep.exit': 'bogus' }, acks: ['x'], consents: ['y'] } as unknown as ProfileConfig;
    expect(createSnapshot(junk, ctx()).ok).toBe(false);
    expect(snapshotIsCurrent(s, junk, ctx())).toBe(false);
  });
});

describe('4. a preset label is only kept when the values are what that preset resolves to', () => {
  const c = ctx({ env: 'web-onion' });
  it('label maximum with no values becomes custom', () => {
    const cfg = { ...emptyConfig(), preset: 'maximum' as const };
    expect(snap(createSnapshot(cfg, c)).config.preset).toBe('custom');
    const parsed = parseConfig('{"v":2,"preset":"maximum","values":{},"acks":[],"consents":[]}');
    expect(parsed.ok && snap(createSnapshot(parsed.config, c)).config.preset).toBe('custom');
  });
  it('label maximum with only fresh-wallet becomes custom', () => {
    expect(snap(createSnapshot({ ...accepted(sel(FRESH), c), preset: 'maximum' }, c)).config.preset).toBe('custom');
  });
  it('the exact result of a preset keeps its label', () => {
    for (const id of ['standard', 'enhanced', 'shielded', 'maximum'] as const) {
      expect(snap(createSnapshot(accepted(applyPreset(id, c).selection, c), c)).config.preset).toBe(id);
    }
  });
  it('the default selection (label standard, no values) keeps its label', () => {
    expect(snap(createSnapshot(toConfig(defaultSelection()), c)).config.preset).toBe('standard');
  });
  it('a label that is not a preset is stored as custom', () => {
    expect(snap(createSnapshot({ ...emptyConfig(), preset: 'custom' }, c)).config.preset).toBe('custom');
  });
});

describe('5. guard lists are frozen like the tables', () => {
  it.each<[string, unknown]>([
    ['TESTNET_CHAIN_IDS', TESTNET_CHAIN_IDS], ['TESTNET_BTC_NETWORKS', TESTNET_BTC_NETWORKS], ['OPTION_IDS', OPTION_IDS],
    ['ACTIONS', ACTIONS], ['ENVS', ENVS], ['ASSET_KINDS', ASSET_KINDS], ['ACK_KEYS', ACK_KEYS], ['WARNING_KEYS', WARNING_KEYS],
    ['ERROR_KEYS', ERROR_KEYS], ['ALL_CAPABILITIES', ALL_CAPABILITIES], ['ALL_TRUST_PARTIES', ALL_TRUST_PARTIES],
  ])('%s', (_n, list) => {
    expect(Object.isFrozen(list)).toBe(true);
    expect(() => (list as unknown[]).push('x')).toThrow(TypeError);
  });
  it('adding to a guard list cannot weaken the chain guard or accept a forged acknowledgement', () => {
    expect(() => (TESTNET_CHAIN_IDS as number[]).push(1)).toThrow(TypeError);
    expect(evaluate(sel({ 'pay.route': 'direct-no-fee' }), ctx({ chainId: 1 })).blocking.map((b) => b.code)).toContain('E_WRONG_CHAIN');
    expect(() => (ACK_KEYS as string[]).push('privacy.ack.fake')).toThrow(TypeError);
  });
});

describe('6. a description says what is still missing before it is ready', () => {
  it('lists required and missing acknowledgements and consents; ready is false until they are given', () => {
    const c = ctx({ env: 'web-onion' });
    const d = describePreset('maximum', c);
    expect(d.evaluationOk).toBe(false);
    expect(d.requiredAcks.length).toBeGreaterThan(0);
    expect(d.missingAcks).toEqual(d.requiredAcks);
    expect(d.missingConsents.length).toBeGreaterThan(0);
    expect(d.ready).toBe(false);
  });
  it('a fresh-wallet configuration without its acknowledgement is not ready, with it is', () => {
    const c = ctx();
    const without = describeConfig(toConfig(sel(FRESH)), c);
    expect(without.missingAcks).toEqual(['privacy.ack.payerStillPublic']);
    expect(without.ready).toBe(false);
    const withAck = describeConfig(toConfig({ ...sel(FRESH), acks: ['privacy.ack.payerStillPublic'] }, allConsents(toConfig(sel(FRESH)), c)), c);
    expect(withAck.missingAcks).toEqual([]);
    expect(withAck.missingConsents).toEqual([]);
    expect(withAck.ready).toBe(true);
  });
  it('an asserted claim never means ready: the two are separate fields', () => {
    const d = describeConfig(toConfig(sel(FRESH)), ctx());
    expect(d.claims.every((x) => x.status === 'asserted')).toBe(true);
    expect(d.ready).toBe(false);
  });
});

describe('7. the snapshot keeps only the acknowledgements and consents the configuration needs', () => {
  it('unused consent and acknowledgement are not carried', () => {
    const cfg = toConfig({ preset: 'custom', values: {}, acks: [...ACK_KEYS] }, ['party:railgun-ppoi', 'party:tor-network']);
    const s = snap(createSnapshot(cfg, ctx()));
    expect(s.consents).toEqual([]);
    expect(s.config.consents).toEqual([]);
    expect(s.config.acks).toEqual([]);
    expect(reviewConfig(cfg, ctx()).unusedConsents).toEqual(['party:railgun-ppoi', 'party:tor-network']);
  });
});

describe('8. capability members are validated, so a snapshot cannot throw or carry foreign values', () => {
  const withCaps = (caps: Set<unknown>): Context => ({ ...ctx(), capabilities: caps as unknown as ReadonlySet<Capability> });
  it.each<[string, Set<unknown>]>([
    ['symbol member', new Set([Symbol('a'), 'tor-socks'])],
    ['bigint member', new Set([1n])],
    ['number member', new Set([5])],
    ['unknown string', new Set(['bogus'])],
    ['object member', new Set([{}])],
  ])('%s: invalid context, no throw, no snapshot', (_n, caps) => {
    const c = withCaps(caps);
    expect(() => createSnapshot(emptyConfig(), c)).not.toThrow();
    expect(createSnapshot(emptyConfig(), c).ok).toBe(false);
    expect(evaluate(sel({}), c).blocking.map((b) => b.code)).toContain('E_INVALID_CONTEXT');
    expect(() => describeConfig(emptyConfig(), c)).not.toThrow();
  });
  it('a valid set is unchanged and the snapshot lists only known capabilities, sorted', () => {
    const s = snap(createSnapshot(emptyConfig(), ctx({ capabilities: new Set<Capability>(['tor-socks', 'multi-rpc']) })));
    expect(s.context.capabilities).toEqual(['multi-rpc', 'tor-socks']);
  });
});

describe('9. a snapshot says which values were not reviewed for its action', () => {
  const c = ctx({ action: 'pay' });
  const cfg = toConfig(sel({ 'sweep.exit': 'shielded-pool', 'sweep.hops': '4' }));
  it('out-of-scope options are listed in the review and the snapshot; they need no acknowledgement or consent', () => {
    const r = reviewConfig(cfg, c);
    expect(r.outOfScope).toEqual(['sweep.exit', 'sweep.hops']);
    expect(r.requiredConsents).toEqual([]);
    const s = snap(createSnapshot(cfg, c));
    expect(s.outOfScope).toEqual(['sweep.exit', 'sweep.hops']);
    expect(s.config.acks).toEqual([]);
  });
  it('the values stay in the config, because rules read the full selection, and any change makes the snapshot stale', () => {
    const s = snap(createSnapshot(cfg, c));
    expect(s.config.values).toEqual({ 'sweep.exit': 'shielded-pool', 'sweep.hops': '4' });
    expect(snapshotIsCurrent(s, cfg, c)).toBe(true);
    expect(snapshotIsCurrent(s, toConfig(sel({ 'sweep.exit': 'railgun', 'sweep.hops': '4' })), c)).toBe(false);
  });
  it('the settings action covers every option and refuses what the pay action ignored', () => {
    expect(reviewConfig(cfg, ctx({ action: 'settings' })).outOfScope).toEqual([]);
    expect(createSnapshot(cfg, ctx({ action: 'settings' })).ok).toBe(false);
  });
  it('dropping an out-of-scope value would break a rule that reads it, which is why it is kept', () => {
    // R-21 (pay) needs announce.metadata (invoice, out of scope for pay): the review is ok only with the full selection.
    const full = toConfig(sel({ 'pay.route': 'direct-no-fee', 'announce.metadata': 'minimal' }));
    expect(snap(createSnapshot(full, c)).config.values).toEqual({ 'announce.metadata': 'minimal', 'pay.route': 'direct-no-fee' });
    expect(createSnapshot(toConfig(sel({ 'pay.route': 'direct-no-fee' })), c).ok).toBe(false);
  });
});

describe('10. missing capabilities are derived from the rule that fired', () => {
  const values = { 'relayer.multi': 'on', 'net.rpcMode': 'quorum' } as const;
  const caps = (...c: Capability[]): ReadonlySet<Capability> => new Set(c);
  const missing = (c: Context, option: OptionId): readonly Capability[] | undefined => describeConfig(toConfig(sel(values)), c).claims.find((x) => x.option === option)?.missing;
  it('names the capability the rule needs, whichever option is asked about', () => {
    expect(missing(ctx({ capabilities: caps('multi-rpc') }), 'net.rpcMode')).toEqual(['multi-relayer']);
    expect(missing(ctx({ capabilities: caps('multi-relayer') }), 'net.rpcMode')).toEqual(['multi-rpc']);
    expect(missing(ctx({ capabilities: caps() }), 'relayer.multi')).toEqual(['multi-relayer', 'multi-rpc']);
  });
  it('is empty when the rule is satisfied', () => {
    expect(missing(ctx({ capabilities: caps('multi-relayer', 'multi-rpc') }), 'net.rpcMode')).toEqual([]);
  });
});

describe('11. an unreadable evaluation is not a label for "nothing is visible"', () => {
  it('garbage gives an explicit unknown marker; a real default evaluation still has none', () => {
    expect(honestLabel({} as never).stillVisible).toEqual(['profiles:unknown-evaluation']);
    expect(honestLabel(null as never).stillVisible).toEqual(['profiles:unknown-evaluation']);
    expect(honestLabel(evaluate(defaultSelection(), ctx())).stillVisible).toEqual([]);
  });
});

describe('12 and 13. selection functions return a Selection and never freeze or keep caller objects', () => {
  it('consents are not carried by setOption or acknowledge; re-attach them with toConfig', () => {
    const cfg = toConfig(sel({}), ['party:rpc']);
    const r = setOption(cfg, 'sweep.dust', 'off', ctx());
    expect('consents' in r.selection).toBe(false);
    expect(toConfig(r.selection, cfg.consents).consents).toEqual(['party:rpc']);
    expect('consents' in acknowledge(cfg, 'privacy.ack.hopsWeak')).toBe(false);
  });
  it('a non-string value is copied as null (still reported) and the caller object stays unfrozen', () => {
    const nested = { x: 1 };
    const bad = { preset: 'custom', values: { 'sweep.exit': nested }, acks: [] } as unknown as Selection;
    const a = acknowledge(bad, 'privacy.ack.hopsWeak');
    const s = setOption(bad, 'sweep.delay', 'jitter', ctx());
    expect(Object.isFrozen(nested)).toBe(false);
    expect(Object.isFrozen(bad.values)).toBe(false);
    expect((a.values as Record<string, unknown>)['sweep.exit']).toBeNull();
    expect(evaluate(a, ctx()).blocking.map((b) => b.code)).toContain('E_UNKNOWN_VALUE');
    expect(evaluate(s.selection, ctx()).blocking.map((b) => b.code)).toContain('E_UNKNOWN_VALUE');
  });
  it('a rejected setOption returns the caller selection itself, untouched and unfrozen', () => {
    const own: Selection = { preset: 'custom', values: {}, acks: [] };
    const r = setOption(own, 'sweep.exit', 'nonsense', ctx());
    expect(r.selection).toBe(own);
    expect(Object.isFrozen(own)).toBe(false);
  });
});

describe('15. every error key this package can emit is in ERROR_KEYS', () => {
  it('config and snapshot keys', () => {
    for (const k of CONFIG_ERROR_KEYS) expect(ERROR_KEYS).toContain(k);
    for (const k of ['privacy.err.snapshot.blocked', 'privacy.err.snapshot.consentMissing', 'privacy.err.snapshot.invalidConfig']) expect(ERROR_KEYS as readonly string[]).toContain(k);
  });
});
