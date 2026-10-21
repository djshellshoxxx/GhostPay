import { describe, expect, it } from 'vitest';
import { analyze } from './analyze.js';
import { CHAIN_RULES, evalPred, matchRule, type RuleEnv, type StepView } from './chainRules.js';
import { OPTION_DEFAULTS, evaluateSelection } from './profile.js';
import { fullCtx, pipe, step as s, ANVIL, BTC_SIGNET } from './fixtures.testutil.js';
import type { Pipeline } from './types.js';
import { projectToSelection, validate } from './validate.js';
import { ctx } from './fixtures.testutil.js';

const recv = s('recv.stealth');
const recvCt = s('recv.stealth', { origin: 'confidential-router' });
const src = s('src.wallet');

interface Case {
  id: string;
  pos: Pipeline;
  neg: Pipeline;
  testMode?: boolean;
}

const seller = (steps: Parameters<typeof pipe>[1], asset: Parameters<typeof pipe>[2] = {}): Pipeline =>
  pipe('seller', steps, asset);
const payer = (steps: Parameters<typeof pipe>[1], o: Parameters<typeof pipe>[2] = {}): Pipeline =>
  pipe('payer', steps, o);

const CASES: Case[] = [
  {
    id: 'C-01',
    pos: seller([recv, s('hops.forward', { hops: 2 }), s('pool.deposit')]),
    neg: seller([recv, s('hops.forward', { hops: 3 }), s('pool.deposit')]),
  },
  {
    id: 'C-02',
    pos: seller([recv, s('hops.forward', { hops: 3 }), s('pool.deposit')]),
    neg: seller([recv, s('hops.forward', { hops: 2 }), s('pool.deposit')]),
  },
  {
    id: 'C-03',
    pos: seller([recv, s('pool.deposit'), s('pool.exit'), s('hygiene.sweep')]),
    neg: seller([recv, s('pool.deposit'), s('pool.exit')]),
  },
  {
    id: 'C-04',
    pos: seller([recv, s('hygiene.sweep'), s('pool.deposit')]),
    neg: seller([recv, s('pool.deposit')]),
  },
  {
    id: 'C-05',
    pos: seller([recv, s('hops.forward'), s('hygiene.sweep')]),
    neg: seller([recv, s('hygiene.sweep')]),
  },
  {
    id: 'C-06',
    pos: seller([recv, s('sweep.delay'), s('pool.deposit')]),
    neg: seller([recv, s('pool.deposit')]),
  },
  {
    id: 'C-07',
    pos: seller([recv, s('pool.deposit'), s('pool.deposit')]),
    neg: seller([recv, s('pool.deposit')]),
  },
  {
    id: 'C-08',
    pos: payer([src, s('payer.fresh-wallet'), s('pool.deposit')]),
    neg: payer([src, s('pool.deposit')]),
  },
  {
    id: 'C-09',
    pos: payer([src, s('pool.deposit', { payerSponsor: 'permit-relay' })]),
    neg: payer([src, s('pool.deposit')]),
  },
  {
    id: 'C-10',
    pos: payer([src, s('amount.shape', { mode: 'round' }), s('pay.from-pool')]),
    neg: payer([src, s('amount.shape', { mode: 'denom' }), s('pool.deposit'), s('pay.from-pool')]),
  },
  {
    id: 'C-10-fan',
    pos: payer([src, s('pool.deposit', { n: 2 }), s('pay.from-pool')]),
    neg: payer([src, s('pool.deposit', { n: 1 }), s('pay.from-pool')]),
  },
  {
    id: 'C-11',
    pos: payer([src, s('amount.shape', { mode: 'denom' }), s('pool.deposit')]),
    neg: payer([src, s('amount.shape', { mode: 'round' }), s('pool.deposit')]),
  },
  {
    id: 'C-12',
    pos: payer([src, s('pool.deposit'), s('pay.from-pool', { payerMode: 'permit-relay' })]),
    neg: payer([src, s('pool.deposit'), s('pay.from-pool')]),
  },
  {
    id: 'C-13',
    pos: seller([recvCt, s('hygiene.sweep')], { asset: 'confidential' }),
    neg: seller([recv, s('hygiene.sweep')]),
  },
  {
    id: 'C-13-unwrap',
    pos: seller([recvCt, s('ct.unwrap'), s('pool.deposit')], { asset: 'confidential' }),
    neg: seller([recvCt, s('ct.unwrap'), s('hygiene.sweep')], { asset: 'confidential' }),
  },
  {
    id: 'C-14',
    pos: seller([recvCt, s('ct.unwrap')], { asset: 'confidential' }),
    neg: seller([recvCt, s('ct.sweep')], { asset: 'confidential' }),
  },
  {
    id: 'C-15',
    pos: payer([src, s('ct.wrap', { dwellMs: 1000 }), s('pay.submit')], { asset: 'erc20' }),
    neg: payer([src, s('ct.wrap'), s('pay.submit')], { asset: 'erc20' }),
  },
  {
    id: 'C-15-eq',
    pos: payer([src, s('ct.wrap', { amount: '1000' }), s('pay.submit')], {
      asset: 'erc20',
      invoiceGross: '1000',
    }),
    neg: payer([src, s('ct.wrap', { amount: '999' }), s('pay.submit')], {
      asset: 'erc20',
      invoiceGross: '1000',
    }),
  },
  {
    id: 'C-16',
    pos: payer([src, s('ct.wrap'), s('pay.submit', { payerMode: 'permit-relay' })], { asset: 'erc20' }),
    neg: payer([src, s('ct.wrap'), s('pay.submit')], { asset: 'erc20' }),
  },
  {
    id: 'C-17',
    pos: payer([src, s('ct.wrap'), s('pay.submit', { route: 'direct-no-fee' })], { asset: 'erc20' }),
    neg: payer([src, s('pay.submit', { route: 'direct-no-fee' })], { asset: 'erc20' }),
  },
  {
    id: 'C-18',
    pos: payer([src, s('ct.wrap'), s('amount.shape', { mode: 'split', parts: 2 }), s('pay.submit')], {
      asset: 'erc20',
    }),
    neg: payer([src, s('amount.shape', { mode: 'split', parts: 2 }), s('pay.submit')], { asset: 'erc20' }),
  },
  {
    id: 'C-19',
    pos: payer([src, s('ct.wrap'), s('amount.shape', { mode: 'round' }), s('pay.submit')], {
      asset: 'erc20',
    }),
    neg: payer([src, s('amount.shape', { mode: 'round' }), s('pay.submit')], { asset: 'erc20' }),
  },
  {
    id: 'C-20',
    pos: payer([
      src,
      s('amount.shape', { mode: 'split', parts: 2 }),
      s('pay.submit', { payerMode: 'eip7702-sponsored' }),
    ]),
    neg: payer([src, s('amount.shape', { mode: 'split', parts: 2 }), s('pay.submit')]),
  },
  {
    id: 'C-22',
    pos: payer([src, s('pay.submit', { route: 'direct-no-fee', payerMode: 'permit-relay' })]),
    neg: payer([src, s('pay.submit', { payerMode: 'permit-relay' })]),
  },
  {
    id: 'C-23',
    pos: payer([s('btc.send', { mode: 'payjoin-v2', silentPaymentOutput: true })], {
      asset: 'btc',
      chain: BTC_SIGNET,
    }),
    neg: payer([s('btc.send', { mode: 'payjoin-v2' })], { asset: 'btc', chain: BTC_SIGNET }),
  },
  {
    id: 'C-24',
    pos: seller([s('btc.recv'), s('btc.payjoin-contribute')], { asset: 'btc', chain: BTC_SIGNET }),
    neg: seller([s('btc.recv', { mode: 'plain' }), s('btc.payjoin-contribute')], {
      asset: 'btc',
      chain: BTC_SIGNET,
    }),
  },
  {
    id: 'C-25',
    pos: payer([s('btc.send', { mode: 'payjoin-v1', locktime: 'height' })], {
      asset: 'btc',
      chain: BTC_SIGNET,
    }),
    neg: payer([s('btc.send', { mode: 'payjoin-v1' })], { asset: 'btc', chain: BTC_SIGNET }),
  },
  {
    id: 'C-26',
    pos: seller([recv, s('hygiene.sweep', { destination: 'external-reuse' })]),
    neg: seller([recv, s('hygiene.sweep')]),
  },
  {
    id: 'C-27',
    pos: seller([recv, s('pool.deposit'), s('pool.exit', { poolSubmit: 'self' })]),
    neg: seller([recv, s('pool.deposit'), s('pool.exit')]),
  },
  {
    id: 'C-28',
    pos: seller([recv, s('pool.deposit', { pool: 'privacy-pools', exitGas: 'permit-sponsored' })]),
    neg: seller([recv, s('pool.deposit', { pool: 'privacy-pools', exitGas: 'buffer' })]),
  },
  {
    id: 'C-29',
    pos: seller([recv, s('pool.deposit', { pool: 'mock-pool' })], { chain: ANVIL }),
    neg: seller([recv, s('pool.deposit', { pool: 'mock-pool' })], { chain: ANVIL }),
    testMode: true,
  },
  {
    id: 'C-30',
    pos: seller([recv, s('hops.forward')], { asset: 'erc20' }),
    neg: seller([recv, s('hops.forward')]),
  },
  {
    id: 'C-34',
    pos: seller([recv, s('pool.deposit', { pool: 'railgun' }), s('pool.deposit', { pool: 'privacy-pools' })]),
    neg: seller([recv, s('pool.deposit'), s('pool.deposit')]),
  },
  {
    id: 'C-35',
    pos: seller([recv, s('pool.deposit', { n: 2 }), s('pool.exit', { destination: 'single-address' })]),
    neg: seller([recv, s('pool.deposit', { n: 2 }), s('pool.exit')]),
  },
];

function fired(p: Pipeline, testMode = false): string[] {
  const a = analyze(p);
  const env: RuleEnv = { views: a.views, invoiceGross: p.invoiceGross, testMode };
  return CHAIN_RULES.filter((r) => matchRule(r, env).length > 0).map((r) => r.id);
}

describe('CHAIN_RULES positive and negative (PL-10)', () => {
  for (const c of CASES) {
    it(`${c.id} fires on its pattern`, () => {
      expect(fired(c.pos)).toContain(c.id);
    });
    it(`${c.id} stays quiet on the near miss`, () => {
      expect(fired(c.neg, c.testMode ?? false)).not.toContain(c.id);
    });
  }
  it('C-29 also covers CT-M wrap without test mode', () => {
    const p = payer([src, s('ct.wrap', { backend: 'ctm-cleartext' }), s('pay.submit')], {
      asset: 'erc20',
      chain: ANVIL,
    });
    expect(fired(p)).toContain('C-29');
    expect(fired(p, true)).not.toContain('C-29');
  });
  it('C-15-eq needs a non-empty equal amount', () => {
    const p = payer([src, s('ct.wrap'), s('pay.submit')], { asset: 'erc20', invoiceGross: '1000' });
    expect(fired(p)).not.toContain('C-15-eq');
  });
  it('C-17 also blocks the accrual router', () => {
    const p = payer([src, s('ct.wrap'), s('pay.submit', { route: 'accrual' })], { asset: 'erc20' });
    expect(fired(p)).toContain('C-17');
  });
  it('C-23 also covers the receiving side', () => {
    const p = seller([s('btc.recv', { mode: 'payjoin-v1', silentPaymentOutput: true })], {
      asset: 'btc',
      chain: BTC_SIGNET,
    });
    expect(fired(p)).toContain('C-23');
  });
  it('C-35 also covers many partial withdrawals to one address', () => {
    const p = seller([
      recv,
      s('pool.deposit'),
      s('pool.exit', { destination: 'single-address', partials: 2 }),
    ]);
    expect(fired(p)).toContain('C-35');
  });
  it('C-26 also covers pool exit to a reused address', () => {
    const p = seller([recv, s('pool.deposit'), s('pool.exit', { destination: 'external-reuse' })]);
    expect(fired(p)).toContain('C-26');
  });
  it('every rule id is unique and every non-layer rule has a case', () => {
    const ids = CHAIN_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of CHAIN_RULES) if (!('layer' in r.pattern)) expect(CASES.map((c) => c.id)).toContain(r.id);
  });
  it('spec ids C-01..C-35 are all present or documented as cross-role (C-21, C-31) / type (C-33)', () => {
    const have = new Set(
      CHAIN_RULES.map((r) => (r.id.replace(/-.*$/, '') === 'C' ? r.id : r.id.slice(0, 4))),
    );
    const missing: string[] = [];
    for (let i = 1; i <= 35; i++) {
      const id = `C-${String(i).padStart(2, '0')}`;
      if (!have.has(id)) missing.push(id);
    }
    expect(missing).toEqual(['C-21', 'C-31', 'C-33']);
  });
});

describe('severity of rules and PL-7 (chain rule at least as strict as the profile rule)', () => {
  const chainRank = { none: 0, warn: 1, ack: 2, block: 3 } as const;
  const profRank = { warn: 1, ack: 2, error: 3 } as const;
  for (const r of CHAIN_RULES.filter((x) => x.profileRule !== undefined)) {
    it(`${r.id} vs ${r.profileRule ?? ''}`, () => {
      const c = CASES.find((x) => x.id === r.id);
      const p = c === undefined ? pipe('payer', [src, s('pool.deposit'), s('pay.from-pool')]) : c.pos;
      const context = fullCtx({ testMode: false });
      const issues = evaluateSelection(projectToSelection(p), context, p).filter(
        (i) => i.ruleId === r.profileRule,
      );
      const worst = Math.max(0, ...issues.map((i) => profRank[i.severity as 'warn']));
      expect(chainRank[r.effect]).toBeGreaterThanOrEqual(worst);
    });
  }
  it('C-32 uses a layer pattern and warns once per party', () => {
    const p = pipe('payer', [src, s('pool.deposit'), s('pay.from-pool')]);
    const v = validate(p, fullCtx());
    const w = v.warnings.filter((i) => i.ruleId === 'C-32').map((i) => i.detail);
    expect(w).toEqual(['pool-relayer']);
  });
});

describe('evalPred', () => {
  const view: StepView = {
    index: 0,
    kind: 'pool.exit',
    params: { a: 3, b: 'x', amount: '5' },
    inHolding: { t: 'stealth', asset: 'erc20', origin: 'router' },
    lineages: 2,
  };
  const env: RuleEnv = { views: [view], invoiceGross: '5', testMode: true };
  it('covers every predicate form', () => {
    expect(evalPred({ p: 'a', gt: 2 }, view, env)).toBe(true);
    expect(evalPred({ p: 'a', lt: 2 }, view, env)).toBe(false);
    expect(evalPred({ p: 'b', gt: 0 }, view, env)).toBe(false);
    expect(evalPred({ p: 'missing', in: ['x'] }, view, env)).toBe(false);
    expect(evalPred({ p: 'b', in: ['x'] }, view, env)).toBe(true);
    expect(evalPred({ p: 'amount', eqInvoiceGross: true }, view, env)).toBe(true);
    expect(evalPred({ p: 'amount', eqInvoiceGross: true }, view, { ...env, invoiceGross: undefined })).toBe(
      false,
    );
    expect(evalPred({ holdingAsset: ['erc20'] }, view, env)).toBe(true);
    expect(evalPred({ holdingAsset: ['erc20'] }, { ...view, inHolding: null }, env)).toBe(false);
    expect(evalPred({ holdingAsset: ['erc20'] }, { ...view, inHolding: { t: 'paid' } }, env)).toBe(false);
    expect(evalPred({ testMode: true }, view, env)).toBe(true);
    expect(evalPred({ lineagesGt: 1 }, view, env)).toBe(true);
    expect(evalPred({ not: { lineagesGt: 5 } }, view, env)).toBe(true);
    expect(evalPred({ all: [{ lineagesGt: 1 }, { testMode: false }] }, view, env)).toBe(false);
    expect(evalPred({ any: [{ lineagesGt: 5 }, { testMode: true }] }, view, env)).toBe(true);
  });
  it('does not read inherited properties as parameters', () => {
    expect(evalPred({ p: 'toString', in: ['x'] }, view, env)).toBe(false);
    expect(evalPred({ p: '__proto__', in: ['x'] }, view, env)).toBe(false);
  });
  it('C-35 hygiene lineage form fires through lineagesGt', () => {
    const rule = CHAIN_RULES.find((r) => r.id === 'C-35');
    const v: StepView = {
      index: 0,
      kind: 'hygiene.sweep',
      params: { destination: 'single-address' },
      inHolding: null,
      lineages: 2,
    };
    expect(matchRule(rule as never, { views: [v], invoiceGross: undefined, testMode: false })).toEqual([0]);
  });
});

describe('local profile rules R-xx (positive and negative)', () => {
  const base = pipe('seller', [recv]);
  const run = (
    sel: Record<string, string>,
    over: { caps?: string[]; testMode?: boolean; asset?: Parameters<typeof pipe>[2] } = {},
  ): string[] => {
    const p = pipe('seller', [recv], over.asset ?? {});
    return evaluateSelection(sel, ctx({ caps: over.caps ?? [], testMode: over.testMode ?? false }), p).map(
      (i) => i.ruleId ?? i.key,
    );
  };
  it('defaults raise nothing', () => {
    expect(evaluateSelection(OPTION_DEFAULTS, fullCtx(), base)).toEqual([]);
  });
  const rows: [
    string,
    Record<string, string>,
    { caps?: string[]; testMode?: boolean; asset?: Parameters<typeof pipe>[2] },
  ][] = [
    ['R-03', { 'sweep.exit': 'mock-pool' }, { caps: [] }],
    ['R-04', { 'sweep.hops': '1' }, { caps: ['sweep-relayer'] }],
    ['R-05', { 'sweep.hops': '2', 'sweep.hopRelayers': 'direct' }, {}],
    ['R-06', { 'sweep.hops': '1' }, { caps: [] }],
    ['R-07', { 'sweep.hops': '1' }, { caps: ['sweep-relayer'], asset: { asset: 'erc20' } }],
    ['R-08', { 'sweep.hops': '1', 'sweep.exit': 'shielded-pool' }, {}],
    ['R-09', { 'sweep.hops': '3', 'sweep.exit': 'shielded-pool' }, {}],
    ['R-10', { 'sweep.exit': 'shielded-pool', 'sweep.destination': 'external-reuse' }, {}],
    ['R-11', { 'sweep.exit': 'shielded-pool' }, { asset: { asset: 'confidential' } }],
    ['R-12', { 'pay.amountVisibility': 'ct1-zama', 'pay.payerMode': 'permit-relay' }, {}],
    ['R-13', { 'pay.amountVisibility': 'ct1-zama', 'pay.source': 'shielded-pool' }, {}],
    ['R-14', { 'pay.amountVisibility': 'ct1-zama', 'pay.amountBlur': 'split' }, {}],
    ['R-15', { 'pay.amountVisibility': 'ct1-zama', 'pay.amountBlur': 'round' }, {}],
    ['R-16', { 'pay.amountVisibility': 'ct1-zama', 'pay.route': 'direct-no-fee' }, {}],
    ['R-17', { 'pay.source': 'shielded-pool', 'pay.payerMode': 'fresh-wallet' }, {}],
    ['R-18', { 'pay.source': 'shielded-pool', 'pay.amountBlur': 'denom' }, {}],
    ['R-19', { 'pay.source': 'shielded-pool', 'pay.route': 'direct-no-fee' }, {}],
    ['R-20', { 'pay.route': 'direct-no-fee', 'pay.payerMode': 'permit-relay' }, {}],
    ['R-22', { 'pay.amountNoise': 'on', 'pay.amountBlur': 'round' }, {}],
    ['R-26', { 'net.rpcMode': 'quorum' }, {}],
    ['R-30', { 'net.scanMode': 'indexer-tor' }, {}],
    ['R-31', { 'pay.payerMode': 'permit-relay' }, {}],
    ['R-32', { 'pay.amountBlur': 'split', 'pay.payerMode': 'permit-relay' }, {}],
    ['R-34', { 'sweep.exit': 'privacy-pools' }, {}],
    ['R-35', { 'sweep.poolAsp': 'publisher' }, {}],
    ['R-36', { 'btc.mode': 'payjoin-v1', 'btc.locktime': 'height' }, {}],
    ['R-37', { 'btc.contributeFromSp': 'on' }, {}],
    ['R-39', { 'pay.amountVisibility': 'ct1-zama' }, {}],
    ['R-40', { 'net.rpcProfile': 'nym-socks5' }, {}],
  ];
  for (const [id, sel, o] of rows) {
    it(`${id} fires`, () => {
      expect(run(sel, o)).toContain(id);
    });
  }
  it('R-01 fires for a wrong chain', () => {
    const bad = { ...base, chain: { family: 'evm', chainId: 1 } } as Pipeline;
    expect(evaluateSelection({}, fullCtx(), bad).map((i) => i.ruleId)).toContain('R-01');
  });
  it('negatives: the near-miss does not fire', () => {
    expect(run({ 'sweep.hops': '1' }, { caps: ['sweep-relayer'] })).not.toContain('R-07');
    expect(run({ 'sweep.hops': '1', 'sweep.hopRelayers': 'direct' }, { caps: [] })).not.toContain('R-06');
    expect(
      run({ 'sweep.hops': '2', 'sweep.hopRelayers': 'rotate' }, { caps: ['sweep-relayer'] }),
    ).not.toContain('R-05');
    expect(run({ 'sweep.exit': 'mock-pool' }, { testMode: true })).not.toContain('R-03');
    expect(
      run({ 'sweep.exit': 'shielded-pool', 'sweep.hops': '2' }, { caps: ['sweep-relayer'] }),
    ).not.toContain('R-09');
    expect(run({ 'pay.amountVisibility': 'ct1-zama' }, { caps: ['seller-accepts-ct'] })).not.toContain(
      'R-39',
    );
    expect(run({ 'btc.mode': 'payjoin-v1', 'btc.contributeFromSp': 'on' })).not.toContain('R-37');
    expect(run({ 'net.scanMode': 'indexer-tor', 'net.rpcProfile': 'onion' })).not.toContain('R-30');
    expect(run({ 'pay.source': 'shielded-pool', 'pay.payerMode': 'direct' })).not.toContain('R-17');
  });
  it('implicit requirements: caps, chain and asset', () => {
    const ct = evaluateSelection(
      { 'pay.amountVisibility': 'ct3-inco' },
      ctx({ caps: ['manifest:confidential-ct3'] }),
      base,
    );
    expect(ct.some((i) => i.code === 'E_WRONG_CHAIN')).toBe(true);
    const permit = evaluateSelection({ 'pay.payerMode': 'permit-relay' }, ctx({ caps: ['payer-sponsor'] }), {
      ...base,
      asset: 'erc20',
    });
    expect(permit.some((i) => i.code === 'E_WRONG_ASSET')).toBe(true);
    const okp = evaluateSelection(
      { 'pay.payerMode': 'permit-relay' },
      ctx({ caps: ['payer-sponsor'] }),
      base,
    );
    expect(okp.some((i) => i.code === 'E_WRONG_ASSET' || i.code === 'E_CAPABILITY')).toBe(false);
    const noCap = evaluateSelection({ 'pay.source': 'shielded-pool' }, ctx(), base);
    expect(noCap.filter((i) => i.code === 'E_CAPABILITY').length).toBe(3);
    const gas = evaluateSelection(
      { 'sweep.exit': 'shielded-pool', 'sweep.exitGas': 'permit-sponsored' },
      ctx({ caps: ['manifest:shielded-pool'] }),
      { ...base, asset: 'erc20' },
    );
    expect(gas.filter((i) => i.key.includes('pool-relayer') || i.code === 'E_WRONG_ASSET').length).toBe(2);
    expect(evaluateSelection({ 'unknown.option': 'x' }, ctx(), base)).toEqual([]);
  });
});
