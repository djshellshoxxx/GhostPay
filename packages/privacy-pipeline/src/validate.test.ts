import { describe, expect, it } from 'vitest';
import { analyze } from './analyze.js';
import { PipelineError } from './errors.js';
import {
  ALL_CAPS,
  ANVIL,
  BTC_SIGNET,
  PAYER_3_5,
  SELLER_3_5,
  ctx,
  fullCtx,
  pipe,
  step as s,
} from './fixtures.testutil.js';
import { projectToSelection, projectWithClashes, validate } from './validate.js';
import { expand, planHash } from './plan.js';
import { simulate } from './summary.js';
import { templateFor } from './presets.js';
import { createRun } from './executor.js';
import { newPipeline } from './build.js';
import type { Pipeline, Step } from './types.js';

const recv = s('recv.stealth');
const src = s('src.wallet');
const keys = (v: ReturnType<typeof validate>): string[] => v.blocking.map((i) => i.key);

describe('chain guard at every entry point (testnet only)', () => {
  const bad = [
    { family: 'evm', chainId: 1 },
    { family: 'evm', chainId: 137 },
    { family: 'evm', chainId: 11155112 },
    { family: 'evm', chainId: Number.NaN },
    { family: 'evm', chainId: '31337' },
    { family: 'evm' },
    { family: 'btc', network: 'mainnet' },
    { family: 'btc', network: 'main' },
    { family: 'sol', chainId: 31337 },
    null,
    'evm',
  ];
  for (const chain of bad) {
    it(`rejects ${JSON.stringify(chain)} everywhere`, () => {
      const p = { ...pipe('payer', [src, s('pay.submit')]), chain } as unknown as Pipeline;
      const v = validate(p, fullCtx());
      expect(v.ok).toBe(false);
      expect(keys(v)).toEqual(['privacy.err.wrongChain']);
      for (const fn of [
        () => expand(p),
        () => planHash(p),
        () => simulate(p, fullCtx()),
        () => createRun(p, fullCtx()),
        () => newPipeline({ id: 'x', role: 'payer', chain: chain as never, asset: 'erc20' }),
        () => templateFor('standard', 'payer', fullCtx(), { chain: chain as never, asset: 'erc20' }),
      ]) {
        expect(fn).toThrow(PipelineError);
        try {
          fn();
        } catch (e) {
          expect((e as PipelineError).code).toBe('E_WRONG_CHAIN');
        }
      }
    });
  }
  it('allows the six testnets', () => {
    for (const chain of [
      ANVIL,
      { family: 'evm', chainId: 84532 },
      { family: 'evm', chainId: 11155111 },
      BTC_SIGNET,
      { family: 'btc', network: 'testnet' },
      { family: 'btc', network: 'regtest' },
    ] as const) {
      const btc = chain.family === 'btc';
      const p = btc
        ? pipe('payer', [s('btc.send')], { chain, asset: 'btc' })
        : pipe('payer', [src, s('pay.submit')], { chain });
      expect(validate(p, fullCtx()).ok).toBe(true);
    }
  });
});

describe('typing rules T-1..T-4', () => {
  it('3.5 payer and seller chains validate and project to a clean selection', () => {
    const pv = validate(pipe('payer', PAYER_3_5), fullCtx());
    expect(pv.blocking).toEqual([]);
    expect(pv.ok).toBe(true);
    expect(pv.endHolding).toEqual({ t: 'paid' });
    expect(pv.selection['pay.source']).toBe('shielded-pool');
    expect(pv.selection['pay.payerMode']).toBe('direct'); // R-17 applies to the payment step, not to the deposit wallet
    expect(pv.selection['pay.amountBlur']).toBeUndefined();
    const sv = validate(pipe('seller', SELLER_3_5), fullCtx());
    expect(sv.ok).toBe(true);
    expect(sv.endHolding).toEqual({ t: 'owned', asset: 'erc20-permit', origin: 'self-derived' });
  });
  it('T-1 mismatch: pay.from-pool needs a payer note', () => {
    const v = validate(pipe('payer', [src, s('pay.from-pool')]), fullCtx());
    expect(v.ok).toBe(false);
    expect(v.typeErrors.map((i) => i.detail)).toContain('input');
  });
  it('T-1: first step must be a start step; start step later is a mismatch', () => {
    expect(validate(pipe('payer', [s('pay.submit')]), fullCtx()).typeErrors.map((i) => i.detail)).toContain(
      'start',
    );
    expect(validate(pipe('payer', [src, src]), fullCtx()).typeErrors.map((i) => i.detail)).toContain('input');
  });
  it('T-1: missing input holding after an unproducible start is impossible to reach but role mismatch is caught', () => {
    const v = validate(pipe('payer', [recv]), fullCtx());
    expect(v.typeErrors.map((i) => i.detail)).toContain('role');
  });
  it('T-3: owned and paid are terminal', () => {
    expect(
      validate(pipe('seller', [recv, s('hygiene.sweep'), s('hops.forward')]), fullCtx()).typeErrors.map(
        (i) => i.detail,
      ),
    ).toContain('terminal');
    expect(
      validate(pipe('payer', [src, s('pay.submit'), s('pay.submit')]), fullCtx()).typeErrors.map(
        (i) => i.detail,
      ),
    ).toContain('terminal');
  });
  it('T-4: EVM step in a BTC pipeline and the reverse', () => {
    expect(keys(validate(pipe('payer', [src], { chain: BTC_SIGNET, asset: 'btc' }), fullCtx()))).toContain(
      'privacy.err.chain.crossChain',
    );
    expect(keys(validate(pipe('payer', [s('btc.send')]), fullCtx()))).toContain(
      'privacy.err.chain.crossChain',
    );
    expect(
      keys(validate(pipe('payer', [s('btc.send')], { chain: BTC_SIGNET, asset: 'erc20' }), fullCtx())),
    ).toContain('privacy.err.chain.crossChain');
  });
  it('unknown kinds and parameters fail closed', () => {
    const p = pipe('payer', [src, { kind: 'mix.coins' } as unknown as Step]);
    expect(validate(p, fullCtx()).ok).toBe(false);
    const q = pipe('payer', [src, s('pay.submit', { gas: 5 })]);
    expect(validate(q, fullCtx()).blocking[0]?.code).toBe('E_UNKNOWN_VALUE');
    const r = pipe('payer', [src, s('pay.submit', { route: 'free' })]);
    expect(validate(r, fullCtx()).ok).toBe(false);
    const t = pipe('payer', [src, null as unknown as Step]);
    expect(validate(t, fullCtx()).ok).toBe(false);
    const u = pipe('payer', [src, { kind: 'pay.submit', params: 5 as never }]);
    expect(validate(u, fullCtx()).ok).toBe(false);
    expect(() => expand(r)).toThrow(PipelineError);
  });
  it('parameter consistency (E_PARAM)', () => {
    const bad: Step[][] = [
      [src, s('amount.shape', { mode: 'split', parts: 1 }), s('pay.submit')],
      [src, s('amount.shape', { mode: 'round', parts: 3 }), s('pay.submit')],
      [src, s('pay.submit', { gapMinMs: 10, gapMaxMs: 5 })],
    ];
    for (const steps of bad)
      expect(validate(pipe('payer', steps), fullCtx()).typeErrors.some((i) => i.code === 'E_PARAM')).toBe(
        true,
      );
    expect(
      validate(
        pipe('seller', [recv, s('pool.deposit'), s('pool.dwell', { minHours: 5, maxHours: 1 })]),
        fullCtx(),
      ).typeErrors.length,
    ).toBe(1);
    expect(
      validate(pipe('seller', [recv, s('sweep.delay', { minMs: 5, maxMs: 1 })]), fullCtx()).typeErrors.length,
    ).toBe(1);
    expect(
      validate(pipe('seller', [recv, s('hops.forward', { delayMinMs: 5, delayMaxMs: 1 })]), fullCtx())
        .typeErrors.length,
    ).toBe(1);
    expect(
      validate(
        pipe('seller', [recv, s('pool.deposit'), s('pool.exit', { gapMinMs: 5, gapMaxMs: 1 })]),
        fullCtx(),
      ).typeErrors.length,
    ).toBe(1);
    expect(
      validate(pipe('seller', [recv, s('pool.deposit', { amountPlan: 'whole', n: 2 })]), fullCtx()).typeErrors
        .length,
    ).toBe(1);
    expect(
      validate(pipe('seller', [s('recv.stealth', { origin: 'confidential-router' })]), fullCtx()).typeErrors
        .length,
    ).toBe(1);
    expect(validate(pipe('seller', [recv], { asset: 'confidential' }), fullCtx()).typeErrors.length).toBe(1);
  });
  it('fan-out creates lineages; payer parts and notes', () => {
    const a = analyze(pipe('payer', [src, s('amount.shape', { mode: 'split', parts: 3 }), s('pay.submit')]));
    expect(a.lineages).toBe(3);
    const b = analyze(
      pipe('seller', [recv, s('pool.deposit', { n: 2 }), s('pool.dwell'), s('pool.exit', { partials: 3 })]),
    );
    expect(b.lineages).toBe(6);
    const c = analyze(
      pipe('payer', [src, s('amount.shape', { mode: 'denom', parts: 4 }), s('pool.deposit', { n: 1 })]),
    );
    expect(c.lineages).toBe(4); // a plan's parts decide the number of notes
  });
});

describe('required acks and ack discipline (PL-4)', () => {
  it('pool, fresh wallet, hops and ct need their acks; none are added', () => {
    const v = validate(pipe('payer', PAYER_3_5), fullCtx());
    expect(v.requiredAcks).toEqual([
      'privacy.ack.payerStillPublic',
      'privacy.ack.poolDisclosure',
      'privacy.ack.shieldedPoolTestnet',
    ]);
    const h = validate(pipe('seller', [recv, s('hops.forward'), s('hygiene.sweep')]), fullCtx());
    expect(h.requiredAcks).toEqual(['privacy.ack.hopsWeak']);
    const c = validate(
      pipe('payer', [src, s('ct.wrap'), s('pay.submit')], { asset: 'erc20' }),
      fullCtx({ testMode: false, capabilities: new Set(ALL_CAPS) }),
    );
    expect(c.requiredAcks).toContain('privacy.ack.ctTrust');
    const u = validate(
      pipe(
        'seller',
        [s('recv.stealth', { origin: 'confidential-router' }), s('ct.unwrap'), s('hygiene.sweep')],
        { asset: 'confidential' },
      ),
      fullCtx(),
    );
    expect(u.requiredAcks).toContain('privacy.ack.ctUnwrapPublic');
    const std = validate(pipe('payer', [src, s('pay.submit')]), fullCtx());
    expect(std.requiredAcks).toEqual([]);
    const sp = validate(pipe('payer', [src, s('pay.submit', { payerMode: 'permit-relay' })]), fullCtx());
    expect(sp.requiredAcks).toContain('privacy.ack.payerStillPublic');
  });
});

describe('projection', () => {
  it('payer fresh wallet before a pay.submit projects fresh-wallet; clash with a sponsored mode', () => {
    const ok = projectWithClashes(pipe('payer', [src, s('payer.fresh-wallet'), s('pay.submit')]));
    expect(ok.selection['pay.payerMode']).toBe('fresh-wallet');
    expect(ok.clashes).toEqual([]);
    const clash = projectWithClashes(
      pipe('payer', [src, s('payer.fresh-wallet'), s('pay.submit', { payerMode: 'permit-relay' })]),
    );
    expect(clash.clashes[0]?.key).toBe('privacy.err.conflict.optionClash');
    expect(clash.selection['pay.payerMode']).toBe('permit-relay');
    const v = validate(
      pipe('payer', [src, s('payer.fresh-wallet'), s('pay.submit', { payerMode: 'permit-relay' })]),
      fullCtx(),
    );
    expect(keys(v)).toContain('privacy.err.conflict.optionClash');
  });
  it('same value from two steps is no clash; default yields to non-default', () => {
    const p = pipe('seller', [
      recv,
      s('pool.deposit', { pool: 'shielded-pool' }),
      s('pool.dwell'),
      s('pool.exit'),
    ]);
    expect(projectWithClashes(p).clashes).toEqual([]);
    expect(projectToSelection(p)['sweep.exit']).toBe('shielded-pool');
  });
  it('layers project to net options', () => {
    const p = pipe('payer', [src, s('pay.submit')], {
      layers: { transport: { rpc: 'tor-socks' }, rpcMode: 'quorum', scanMode: 'pir2' },
    });
    expect(projectToSelection(p)).toMatchObject({
      'net.rpcProfile': 'tor-socks',
      'net.rpcMode': 'quorum',
      'net.scanMode': 'pir2',
      'net.relayerProfile': 'direct',
    });
  });
  it('ct payer projects the backend of the wrap step; seller uses ctBackend', () => {
    const p = pipe('payer', [src, s('ct.wrap', { backend: 'ct3-inco' }), s('pay.submit')], {
      asset: 'erc20',
      chain: { family: 'evm', chainId: 84532 },
    });
    expect(projectToSelection(p)['pay.amountVisibility']).toBe('ct3-inco');
    const q = pipe('seller', [s('recv.stealth', { origin: 'confidential-router' }), s('ct.sweep')], {
      asset: 'confidential',
      ctBackend: 'ct2-fhenix',
    });
    expect(projectToSelection(q)['pay.amountVisibility']).toBe('ct2-fhenix');
    const d = pipe('seller', [s('recv.stealth', { origin: 'confidential-router' })], {
      asset: 'confidential',
    });
    expect(projectToSelection(d)['pay.amountVisibility']).toBe('ct1-zama');
  });
});

describe('layers (L-1, R-28, R-29, C-32)', () => {
  const p = pipe('seller', [recv, s('hygiene.sweep')]);
  it('non-direct transport needs a passing self-test: block, never fall back (L-1)', () => {
    const q = { ...p, layers: { ...p.layers, transport: { relayer: 'tor-socks' as const } } };
    const v = validate(q, ctx({ env: 'node', caps: ['tor-socks'] }));
    expect(v.blocking.map((i) => i.code)).toContain('E_SELFTEST');
    const ok = validate(q, ctx({ env: 'node', caps: ['tor-socks'], self: ['relayer'] }));
    expect(ok.ok).toBe(true);
  });
  it('environment and capability checks per profile', () => {
    const t = (profile: string, env: 'web' | 'web-onion' | 'node', caps: string[]): string[] => {
      const q = { ...p, layers: { ...p.layers, transport: { relayer: profile as never } } };
      return validate(q, ctx({ env, caps, self: ['relayer'] })).blocking.map((i) => i.code);
    };
    expect(t('tor-browser', 'node', ['tor-browser-asserted'])).toContain('E_WRONG_ENV');
    expect(t('tor-browser', 'web', [])).toContain('E_CAPABILITY');
    expect(t('tor-browser', 'web', ['tor-browser-asserted'])).toEqual([]);
    expect(t('tor-socks', 'web', ['tor-socks'])).toContain('E_WRONG_ENV');
    expect(t('onion', 'web', ['onion-relayer'])).toContain('E_WRONG_ENV');
    expect(t('onion', 'web-onion', ['onion-relayer'])).toEqual([]);
    expect(t('onion', 'node', ['onion-relayer'])).toContain('E_CAPABILITY');
    expect(t('onion', 'node', ['onion-relayer', 'tor-socks'])).toEqual([]);
    expect(t('i2p-outproxy', 'web', ['i2p-proxy'])).toContain('E_WRONG_ENV');
    expect(t('i2p-outproxy', 'node', ['i2p-proxy'])).toEqual([]);
    expect(t('nym-mixfetch', 'node', ['nym-build'])).toContain('E_WRONG_ENV');
    expect(t('nym-mixfetch', 'web', [])).toContain('E_CAPABILITY');
    expect(t('nym-socks5', 'web', ['nym-socks5'])).toContain('E_WRONG_ENV');
    expect(t('nym-socks5', 'node', ['nym-socks5'])).toEqual([]);
    expect(t('ohttp', 'web', [])).toContain('E_CAPABILITY');
    expect(t('ohttp', 'web', ['ohttp-gateway-relayer'])).toEqual([]);
  });
  it('experimental profiles warn once per purpose', () => {
    const q = { ...p, layers: { ...p.layers, transport: { relayer: 'nym-socks5' as const } } };
    const v = validate(q, ctx({ env: 'node', caps: ['nym-socks5'], self: ['relayer'] }));
    expect(v.warnings.map((w) => w.key)).toContain('privacy.warn.experimental');
  });
  it('direct relay-like purposes warn per party (C-32), direct rpc does not', () => {
    const v = validate(p, fullCtx());
    expect(
      v.warnings.filter((w) => w.key === 'privacy.warn.networkDirectToParty').map((w) => w.detail),
    ).toEqual(['relayer']);
    const q = pipe('payer', [src, s('pay.submit')]);
    expect(validate(q, fullCtx()).warnings.map((w) => w.key)).not.toContain(
      'privacy.warn.networkDirectToParty',
    );
  });
  it('mode caps and R-30', () => {
    const q = { ...p, layers: { ...p.layers, rpcMode: 'quorum' as const, scanMode: 'indexer-tor' as const } };
    const v = validate(q, ctx());
    expect(keys(v)).toEqual(
      expect.arrayContaining([
        'privacy.err.requires.cap.multi-rpc',
        'privacy.err.requires.cap.tor-indexer',
        'privacy.err.requires.torForIndexer',
      ]),
    );
    const lc = validate(
      { ...p, layers: { ...p.layers, scanMode: 'light-client' as const, rpcMode: 'own-node' as const } },
      ctx(),
    );
    expect(keys(lc)).toEqual(
      expect.arrayContaining(['privacy.err.requires.cap.light-client', 'privacy.err.requires.cap.own-node']),
    );
    const pir = validate({ ...p, layers: { ...p.layers, scanMode: 'pir2' as const } }, ctx());
    expect(keys(pir)).toContain('privacy.err.requires.cap.pir-servers');
  });
  it('unknown layer values fail closed', () => {
    const bad = (layers: unknown): Pipeline => ({ ...p, layers }) as unknown as Pipeline;
    expect(validate(bad({ ...p.layers, transport: { rpc: 'vpn' } }), fullCtx()).ok).toBe(false);
    expect(validate(bad({ ...p.layers, transport: { telepathy: 'direct' } }), fullCtx()).ok).toBe(false);
    expect(validate(bad({ ...p.layers, rpcMode: 'x' }), fullCtx()).ok).toBe(false);
    expect(validate(bad({ ...p.layers, isolation: 'x' }), fullCtx()).ok).toBe(false);
    expect(validate(bad(null), fullCtx()).ok).toBe(false);
    expect(validate(bad({ ...p.layers, transport: null }), fullCtx()).ok).toBe(false);
  });
  it('isolation per-step with tor-browser is shown as unenforced (Q4)', () => {
    const q = { ...p, layers: { ...p.layers, transport: { rpc: 'tor-browser' as const } } };
    const v = validate(q, ctx({ env: 'web', caps: ['tor-browser-asserted'], self: ['rpc'] }));
    expect(v.warnings.map((w) => w.key)).toContain('privacy.warn.chain.isolationUnenforced');
  });
});

describe('validation output', () => {
  it('is deterministic and sorted', () => {
    const p = pipe(
      'seller',
      [recv, s('hops.forward', { hops: 3 }), s('pool.deposit', { pool: 'mock-pool' })],
      { chain: ANVIL },
    );
    const a = validate(p, ctx());
    const b = validate(p, ctx());
    expect(a).toEqual(b);
    const sev = a.blocking.map((i) => i.key);
    expect(sev).toEqual([...sev].sort((x, y) => x.localeCompare(y)).sort((x, y) => 0 * x.length * y.length));
  });
  it('empty pipeline has no end holding and no blocking issue', () => {
    const v = validate(pipe('payer', []), fullCtx());
    expect(v.endHolding).toBeNull();
    expect(v.ok).toBe(true);
  });
});
