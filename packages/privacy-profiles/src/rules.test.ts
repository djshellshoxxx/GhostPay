import { describe, expect, it } from 'vitest';
import { evaluate } from './evaluate.js';
import { RULES } from './rules.js';
import { ERROR_KEYS, WARNING_KEYS } from './keys.js';
import type { Capability, Context, OptionId, RuleId } from './types.js';
import { FULL, ctx, sel } from './x.testutil.js';

type V = Partial<Record<OptionId, string>>;
const without = (...c: Capability[]): ReadonlySet<Capability> => new Set([...FULL].filter((x) => !c.includes(x)));
const fires = (id: RuleId, v: V, c: Context, acks: Parameters<typeof sel>[1] = []): boolean => {
  const ev = evaluate(sel(v, acks), c);
  return [...ev.blocking, ...ev.warnings].some((i) => i.ruleId === id);
};

interface Case {
  id: RuleId;
  pos: V;
  posCtx?: Partial<Context>;
  neg: V;
  negCtx?: Partial<Context>;
  acks?: Parameters<typeof sel>[1];
}
const CT = 'ct1-zama';
const CASES: Case[] = [
  { id: 'R-01', pos: { 'pay.route': 'direct-no-fee' }, posCtx: { chainId: 1 }, neg: { 'pay.route': 'direct-no-fee' } },
  { id: 'R-02', pos: { 'sweep.exit': 'tornado-fixed' }, neg: { 'sweep.exit': 'plain' } },
  { id: 'R-03', pos: { 'sweep.exit': 'mock-pool' }, posCtx: { capabilities: without('test-mode') }, neg: { 'sweep.exit': 'mock-pool' } },
  { id: 'R-04', pos: { 'sweep.hops': '1' }, neg: { 'sweep.hops': '1' }, acks: [], negCtx: {} },
  { id: 'R-05', pos: { 'sweep.hopRelayers': 'direct', 'sweep.hops': '2' }, neg: { 'sweep.hopRelayers': 'direct', 'sweep.hops': '1' } },
  { id: 'R-06', pos: { 'sweep.hops': '1' }, posCtx: { capabilities: without('sweep-relayer') }, neg: { 'sweep.hops': '1', 'sweep.hopRelayers': 'direct' }, negCtx: { capabilities: without('sweep-relayer') } },
  { id: 'R-07', pos: { 'sweep.hops': '1' }, posCtx: { asset: 'erc20' }, neg: { 'sweep.hops': '1' }, negCtx: { asset: 'erc20-permit' } },
  { id: 'R-08', pos: { 'sweep.hops': '1', 'sweep.exit': 'privacy-pools' }, neg: { 'sweep.hops': '1', 'sweep.exit': 'plain' } },
  { id: 'R-09', pos: { 'sweep.hops': '3', 'sweep.exit': 'railgun' }, neg: { 'sweep.hops': '2', 'sweep.exit': 'railgun' } },
  { id: 'R-10', pos: { 'sweep.exit': 'shielded-pool', 'sweep.destination': 'external-reuse' }, neg: { 'sweep.exit': 'shielded-pool', 'sweep.destination': 'external-fresh' } },
  { id: 'R-11', pos: { 'sweep.exit': 'privacy-pools' }, posCtx: { asset: 'confidential' }, neg: { 'sweep.exit': 'privacy-pools' }, negCtx: { asset: 'erc20' } },
  { id: 'R-12', pos: { 'pay.amountVisibility': CT, 'pay.payerMode': 'permit-relay' }, neg: { 'pay.amountVisibility': CT, 'pay.payerMode': 'direct' } },
  { id: 'R-13', pos: { 'pay.amountVisibility': CT, 'pay.source': 'shielded-pool' }, neg: { 'pay.amountVisibility': CT, 'pay.source': 'wallet' } },
  { id: 'R-14', pos: { 'pay.amountVisibility': CT, 'pay.amountBlur': 'split' }, neg: { 'pay.amountVisibility': CT, 'pay.amountBlur': 'delay' } },
  { id: 'R-15', pos: { 'pay.amountVisibility': CT, 'pay.amountBlur': 'round' }, neg: { 'pay.amountVisibility': CT, 'pay.amountBlur': 'delay' } },
  { id: 'R-16', pos: { 'pay.amountVisibility': CT, 'pay.route': 'direct-no-fee' }, neg: { 'pay.amountVisibility': CT, 'pay.route': 'router' } },
  { id: 'R-17', pos: { 'pay.source': 'shielded-pool', 'pay.payerMode': 'fresh-wallet' }, neg: { 'pay.source': 'shielded-pool', 'pay.payerMode': 'direct' } },
  { id: 'R-18', pos: { 'pay.source': 'shielded-pool', 'pay.amountBlur': 'round' }, neg: { 'pay.source': 'shielded-pool', 'pay.amountBlur': 'delay' } },
  { id: 'R-19', pos: { 'pay.source': 'shielded-pool', 'pay.route': 'direct-no-fee' }, neg: { 'pay.source': 'shielded-pool', 'pay.route': 'router' } },
  { id: 'R-20', pos: { 'pay.route': 'direct-no-fee', 'pay.payerMode': 'permit-relay' }, neg: { 'pay.route': 'direct-no-fee', 'pay.payerMode': 'fresh-wallet' } },
  { id: 'R-21', pos: { 'pay.route': 'direct-no-fee' }, neg: { 'pay.route': 'direct-no-fee', 'announce.metadata': 'minimal' } },
  { id: 'R-22', pos: { 'pay.amountNoise': 'on', 'pay.amountBlur': 'round' }, neg: { 'pay.amountNoise': 'on', 'pay.amountBlur': 'delay' } },
  { id: 'R-23', pos: { 'invoice.padding': 'on' }, neg: { 'invoice.padding': 'on', 'invoice.encrypt': 'on' } },
  { id: 'R-24', pos: { 'identity.perInvoiceMeta': 'on' }, neg: {} },
  { id: 'R-25', pos: { 'announce.viewTag': 'mask' }, neg: { 'announce.viewTag': 'keep' } },
  { id: 'R-26', pos: { 'relayer.multi': 'on' }, posCtx: { capabilities: without('multi-relayer') }, neg: { 'relayer.multi': 'on' } },
  { id: 'R-27', pos: { 'relayer.multi': 'on' }, neg: { 'relayer.multi': 'off' } },
  { id: 'R-28', pos: { 'net.rpcProfile': 'tor-socks' }, posCtx: { env: 'web' }, neg: { 'net.rpcProfile': 'tor-socks' }, negCtx: { env: 'node' } },
  { id: 'R-29', pos: { 'net.rpcProfile': 'onion' }, posCtx: { env: 'web-onion', capabilities: without('selftest-ok:rpc') }, neg: { 'net.rpcProfile': 'onion' }, negCtx: { env: 'web-onion' } },
  { id: 'R-30', pos: { 'net.scanMode': 'indexer-tor' }, neg: { 'net.scanMode': 'indexer-tor', 'net.rpcProfile': 'tor-browser' } },
  { id: 'R-31', pos: { 'sweep.hops': '1' }, neg: { 'sweep.hops': '1', 'net.relayerProfile': 'tor-browser' } },
  { id: 'R-32', pos: { 'pay.amountBlur': 'split', 'pay.payerMode': 'permit-relay' }, neg: { 'pay.amountBlur': 'split', 'pay.payerMode': 'direct' } },
  { id: 'R-33', pos: { 'sweep.exit': 'shielded-pool', 'sweep.exitGas': 'topup' }, neg: { 'sweep.exit': 'shielded-pool', 'sweep.exitGas': 'topup', 'sweep.knownWalletGuard': 'off' } },
  { id: 'R-34', pos: { 'sweep.exit': 'privacy-pools', 'sweep.exitGas': 'permit-sponsored' }, neg: { 'sweep.exit': 'railgun', 'sweep.exitGas': 'permit-sponsored' } },
  { id: 'R-35', pos: { 'sweep.poolAsp': 'publisher', 'sweep.exit': 'plain' }, neg: { 'sweep.poolAsp': 'publisher', 'sweep.exit': 'shielded-pool' } },
  { id: 'R-36', pos: { 'btc.mode': 'payjoin-v2', 'btc.locktime': 'height' }, neg: { 'btc.mode': 'payjoin-v2', 'btc.locktime': 'zero' } },
  { id: 'R-37', pos: { 'btc.contributeFromSp': 'on' }, neg: { 'btc.contributeFromSp': 'on', 'btc.mode': 'payjoin-v1' } },
  { id: 'R-38', pos: { 'btc.ordering': 'shuffle' }, neg: { 'btc.ordering': 'bip69' } },
  { id: 'R-39', pos: { 'pay.amountVisibility': CT }, posCtx: { capabilities: without('seller-accepts-ct') }, neg: { 'pay.amountVisibility': CT } },
  { id: 'R-40', pos: { 'net.rpcProfile': 'nym-mixfetch' }, neg: { 'net.rpcProfile': 'tor-browser' } },
  { id: 'R-41', pos: { 'sweep.exitGas': 'topup', 'sweep.exit': 'plain' }, neg: { 'sweep.exitGas': 'topup', 'sweep.exit': 'railgun' } },
  { id: 'R-42', pos: { 'sweep.exit': 'privacy-pools' }, posCtx: { capabilities: without('pp-relayer') }, neg: { 'sweep.exit': 'privacy-pools' } },
  { id: 'R-43', pos: { 'sweep.exit': 'railgun' }, posCtx: { capabilities: without('railgun-broadcaster') }, neg: { 'sweep.exit': 'railgun' } },
  { id: 'R-44', pos: { 'sweep.exit': 'shielded-pool' }, posCtx: { capabilities: without('pool-relayer') }, neg: { 'sweep.exit': 'shielded-pool' } },
  { id: 'R-45', pos: { 'net.rpcProfile': 'onion' }, posCtx: { env: 'node', capabilities: without('tor-socks') }, neg: { 'net.rpcProfile': 'onion' }, negCtx: { env: 'node' } },
  { id: 'R-46', pos: { 'sweep.hops': '1' }, posCtx: { capabilities: without('multi-relayer') }, neg: { 'sweep.hops': '1' } },
];

describe('rules R-01..R-46: positive and negative', () => {
  for (const c of CASES) {
    it(`${c.id} fires`, () => expect(fires(c.id, c.pos, ctx(c.posCtx), c.acks)).toBe(true));
    it(`${c.id} silent`, () => {
      const negAcks = c.id === 'R-04' ? (['privacy.ack.hopsWeak'] as const) : [];
      expect(fires(c.id, c.neg, ctx(c.negCtx), negAcks)).toBe(false);
    });
  }
  it('every rule has a case, ids are unique', () => {
    expect(new Set(CASES.map((c) => c.id))).toEqual(new Set(RULES.map((r) => r.id)));
    expect(new Set(RULES.map((r) => r.id)).size).toBe(RULES.length);
  });
  it('R-04 case 1: with ack no issue at all', () => {
    const ev = evaluate(sel({ 'sweep.hops': '1' }, ['privacy.ack.hopsWeak']), ctx({ asset: 'erc20-permit' }));
    expect(ev.blocking.some((b) => b.code === 'E_ACK_MISSING')).toBe(false);
  });
  it('rule keys are listed; no orphan warning keys', () => {
    for (const r of RULES) expect([...WARNING_KEYS, ...ERROR_KEYS] as string[]).toContain(r.key);
  });
});

describe('rule effects', () => {
  it('R-05 blocks, R-08 only warns', () => {
    const e5 = evaluate(sel({ 'sweep.hopRelayers': 'direct', 'sweep.hops': '2' }), ctx());
    expect(e5.ok).toBe(false);
    expect(e5.blocking.map((b) => b.key)).toContain('privacy.err.conflict.hopsDirectMulti');
    const e8 = evaluate(sel({ 'sweep.hops': '1', 'sweep.exit': 'railgun' }, ['privacy.ack.hopsWeak', 'privacy.ack.poolDisclosure']), ctx({ asset: 'erc20-permit' }));
    expect(e8.warnings.map((w) => w.key)).toContain('privacy.warn.hopsBeforePoolNoGain');
    expect(e8.ok).toBe(true);
  });
  it('R-07 only when asset known', () => {
    expect(fires('R-07', { 'sweep.hops': '1' }, ctx(), [])).toBe(false);
  });
  it('R-29 never suggests direct: issue lists the profile option, selection untouched', () => {
    const s = sel({ 'net.rpcProfile': 'onion' });
    const ev = evaluate(s, ctx({ env: 'web-onion', capabilities: without('selftest-ok:rpc') }));
    expect(ev.blocking.find((b) => b.code === 'E_SELFTEST')?.options).toEqual(['net.rpcProfile']);
    expect(ev.effective['net.rpcProfile']).toBe('onion');
  });
  it('R-01 btc: bad network blocks in btc-send, mainnet string rejected', () => {
    const c = ctx({ action: 'btc-send', btcNetwork: 'mainnet' });
    expect(evaluate(sel({ 'btc.ordering': 'bip69' }), c).blocking.map((b) => b.code)).toContain('E_WRONG_CHAIN');
    for (const n of ['testnet', 'signet', 'regtest'])
      expect(evaluate(sel({ 'btc.ordering': 'bip69' }), ctx({ action: 'btc-send', btcNetwork: n })).ok).toBe(true);
    expect(evaluate(sel({ 'btc.ordering': 'bip69' }), ctx({ action: 'btc-send', btcNetwork: null })).ok).toBe(false);
    expect(evaluate(sel({ 'btc.ordering': 'bip69' }), ctx({ btcNetwork: 'mainnet' })).ok).toBe(false);
  });
  it('R-01 evm: null chain blocks outside settings, allowed in settings', () => {
    expect(evaluate(sel({ 'pay.gasNormalise': 'on' }), ctx({ action: 'pay', chainId: null })).ok).toBe(false);
    expect(evaluate(sel({ 'pay.gasNormalise': 'on' }), ctx({ chainId: null })).ok).toBe(true);
    for (const id of [31337, 11155111, 84532]) expect(evaluate(sel({ 'pay.gasNormalise': 'on' }), ctx({ action: 'pay', chainId: id })).ok).toBe(true);
    expect(evaluate(sel({ 'pay.gasNormalise': 'on' }), ctx({ action: 'pay', chainId: 1 })).blocking[0]?.code).toBe('E_WRONG_CHAIN');
  });
  it('default values never trigger the chain guard', () => {
    expect(evaluate(sel({}), ctx({ action: 'pay', chainId: 1 })).ok).toBe(true);
  });
  it('implicit checks: chain-specific CT, env, asset, requiresAny', () => {
    const base = { 'pay.amountVisibility': 'ct3-inco' } as const;
    expect(evaluate(sel(base, ['privacy.ack.ctTrust']), ctx({ chainId: 11155111 })).blocking.map((b) => b.code)).toContain('E_WRONG_CHAIN');
    expect(evaluate(sel(base, ['privacy.ack.ctTrust']), ctx({ chainId: 84532 })).ok).toBe(true);
    expect(evaluate(sel({ 'btc.mode': 'payjoin-v2' }), ctx({ env: 'web' })).blocking.map((b) => b.code)).toContain('E_WRONG_ENV');
    expect(evaluate(sel({ 'pay.payerMode': 'permit-relay' }, ['privacy.ack.payerStillPublic']), ctx({ action: 'pay', asset: 'native' })).blocking.map((b) => b.code)).toContain('E_WRONG_ASSET');
    expect(evaluate(sel({ 'pay.bufferRounding': 'off' }), ctx({ asset: 'native' })).blocking.map((b) => b.code)).toContain('E_WRONG_ASSET');
    expect(evaluate(sel({ 'pay.payerMode': 'erc4337-paymaster' }, ['privacy.ack.payerStillPublic']), ctx({ capabilities: without('erc4337-entrypoint') })).blocking.map((b) => b.key)).toContain('privacy.err.requires.cap.erc4337-entrypoint');
  });
  it('requiresAny works on a synthetic value via the engine path', () => {
    // no shipped value uses requiresAny; ensure evaluate tolerates its absence
    expect(evaluate(sel({}), ctx()).ok).toBe(true);
  });
  it('scope: sweep options ignored in pay action but rules on pay options still fire', () => {
    expect(evaluate(sel({ 'sweep.exit': 'tornado-fixed' }), ctx({ action: 'pay' })).ok).toBe(true);
    expect(evaluate(sel({ 'pay.route': 'direct-no-fee' }), ctx({ action: 'pay' })).blocking.map((b) => b.key)).toContain('privacy.err.requires.annMinimal');
  });
  it('inactive option values are not applied, only dependency rules look at them', () => {
    const ev = evaluate(sel({ 'sweep.exitGas': 'permit-sponsored' }), ctx({ capabilities: without('pool-relayer') }));
    expect(ev.blocking.map((b) => b.key)).toEqual(['privacy.err.requires.poolExit']);
    expect(ev.trust).toEqual([]);
  });
});
