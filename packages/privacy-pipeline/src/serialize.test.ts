/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return -- tests mutate parsed JSON to build tampered inputs */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createRun } from './executor.js';
import {
  FakeChain,
  FakeClock,
  FakeConfirmer,
  FakeProbe,
  FakeStore,
  allDrivers,
} from './fakeDrivers.testutil.js';
import { createExecutor } from './executor.js';
import { makePorts } from './fakeDrivers.testutil.js';
import { ALL_CAPS, PAYER_3_5, fullCtx, pipe, step as s } from './fixtures.testutil.js';
import type { PipelineRun } from './machine.js';
import { sanitizeHolding, sanitizePipeline, sanitizeRun, serializeRun } from './serialize.js';
import { validate } from './validate.js';
import type { Holding, Purpose } from './types.js';
import { planHash } from './plan.js';

const ALL_PURPOSES: Purpose[] = [
  'rpc',
  'scan',
  'read-address',
  'relayer',
  'sponsor',
  'pool-relayer',
  'decrypt-relayer',
  'payjoin-directory',
];

async function finishedRun(
  steps: Parameters<typeof pipe>[1],
  role: 'payer' | 'seller' = 'seller',
): Promise<PipelineRun> {
  const p = pipe(role, steps);
  const c = fullCtx({ selfTests: new Set(ALL_PURPOSES) });
  const run = createRun(p, c);
  const store = new FakeStore();
  const chain = new FakeChain();
  const probe = new FakeProbe();
  probe.caps = new Set(ALL_CAPS);
  const clock = new FakeClock();
  const kinds = [...new Set(steps.map((x) => x.kind))];
  const ex = createExecutor(
    makePorts({
      drivers: allDrivers({ chain, store }, { submits: 0 }, kinds),
      store,
      confirmer: new FakeConfirmer(),
      clock,
      probe,
    }),
  );
  await ex.start(run, new Set(validate(p, c).requiredAcks));
  for (let i = 0; i < 20; i++) {
    clock.now += 4 * 24 * 3_600_000;
    await ex.advance(p.id);
  }
  return sanitizeRun(store.data.get(p.id)) as PipelineRun;
}

describe('serialisation (PL-6)', () => {
  it('round trips a finished run exactly', async () => {
    const run = await finishedRun([
      s('recv.stealth'),
      s('pool.deposit', { n: 2 }),
      s('pool.dwell'),
      s('pool.exit'),
    ]);
    expect(run.status).toBe('completed');
    const text = serializeRun(run);
    expect(sanitizeRun(JSON.parse(text))).toEqual(run);
    expect(sanitizeRun(text)).toEqual(run);
    expect(serializeRun(sanitizeRun(text) as PipelineRun)).toBe(text);
    expect(text).toBe(serializeRun(run));
  });
  it('stays below 64 KiB for 16 lineages', async () => {
    const run = await finishedRun([
      s('recv.stealth'),
      s('pool.deposit', { n: 8 }),
      s('pool.dwell'),
      s('pool.exit', { partials: 2 }),
    ]);
    expect(run.instances.length).toBeGreaterThanOrEqual(18);
    const bytes = new TextEncoder().encode(serializeRun(run)).length;
    expect(bytes).toBeLessThan(64 * 1024);
  });
  it('keeps quotes and pause reasons across the round trip', () => {
    const p = pipe('payer', PAYER_3_5);
    const base = createRun(p, fullCtx());
    const id = base.instances[1]?.instanceId as string;
    const quotes = { [id]: { feeBps: 12.5, gasWeiMax: 77n } };
    const run: PipelineRun = {
      ...base,
      quotes,
      planHash: planHash(p, quotes),
      status: 'paused',
      pauseReason: 'user',
    };
    const back = sanitizeRun(serializeRun(run)) as PipelineRun;
    expect(back.quotes).toEqual(quotes);
    expect(back.pauseReason).toBe('user');
  });
  it('rejects tampering: id, chain, instance list, state, plan hash, odd characters', () => {
    const base = createRun(pipe('seller', [s('recv.stealth'), s('hygiene.sweep')]), fullCtx());
    const good = JSON.parse(serializeRun(base)) as Record<string, unknown>;
    const mut = (f: (o: Record<string, any>) => void): unknown => {
      const o = JSON.parse(JSON.stringify(good)) as Record<string, any>;
      f(o);
      return o;
    };
    expect(sanitizeRun(good)).not.toBeNull();
    const bad: unknown[] = [
      mut((o) => (o['v'] = 2)),
      mut((o) => (o['id'] = 'other')),
      mut((o) => (o['id'] = 'bad id!')),
      mut((o) => (o['status'] = 'flying')),
      mut((o) => (o['planHash'] = '0x12')),
      mut((o) => (o['planHash'] = `0x${'0'.repeat(64)}`)),
      mut((o) => (o['cp2Done'] = 'yes')),
      mut((o) => (o['pauseReason'] = 'bad reason with spaces')),
      mut((o) => (o['pipeline']['chain'] = { family: 'evm', chainId: 1 })),
      mut((o) => (o['pipeline']['steps'][0]['kind'] = 'mix.coins')),
      mut((o) => (o['pipeline']['id'] = 'zzz')),
      mut((o) => (o['quotes'] = [])),
      mut((o) => (o['quotes'] = { nothex: { feeBps: 1, gasWeiMax: '1' } })),
      mut((o) => (o['quotes'] = { [`0x${'a'.repeat(64)}`]: { feeBps: 'x', gasWeiMax: '1' } })),
      mut((o) => (o['quotes'] = { [`0x${'a'.repeat(64)}`]: { feeBps: 1, gasWeiMax: '-1' } })),
      mut((o) => o['instances'].pop()),
      mut((o) => (o['instances'] = 'x')),
      mut((o) => (o['instances'][0]['instanceId'] = '0x00')),
      mut((o) => (o['instances'][0] = null)),
      mut((o) => (o['instances'][0]['state'] = 'sleeping')),
      mut((o) => (o['instances'][0]['attempts'] = -1)),
      mut((o) => (o['instances'][0]['attempts'] = 5000)),
      mut((o) => (o['instances'][0]['intentKey'] = 'has space')),
      mut((o) => (o['instances'][0]['ref'] = 5)),
      mut((o) => (o['instances'][0]['dueAtMs'] = -5)),
      mut((o) => (o['instances'][0]['waitedMs'] = 1.5)),
      mut((o) => (o['instances'][0]['resumeFrom'] = 'done')),
      mut((o) => (o['instances'][0]['outputs'] = 'x')),
      mut((o) => (o['instances'][0]['outputs'] = [{ ref: 'bad ref', holding: { t: 'paid' } }])),
      mut((o) => (o['instances'][0]['outputs'] = [{ ref: 'ok', holding: { t: 'nope' } }])),
      mut(
        (o) =>
          (o['instances'][0]['outputs'] = Array.from({ length: 65 }, () => ({
            ref: 'r',
            holding: { t: 'paid' },
          }))),
      ),
      mut((o) => (o['pipeline']['layers']['rpcMode'] = 'quorum')),
    ];
    for (const b of bad) expect(sanitizeRun(b), JSON.stringify(b).slice(0, 80)).toBeNull();
    for (const junk of [null, undefined, 5, 'x', '{', '[]', [], {}, true, `${'x'.repeat(1_000_001)}`])
      expect(sanitizeRun(junk)).toBeNull();
  });
  it('sanitizeRun never throws on arbitrary input and is idempotent when it accepts (PL-2)', () => {
    fc.assert(
      fc.property(fc.anything(), (x) => {
        const r = sanitizeRun(x);
        if (r !== null) expect(sanitizeRun(serializeRun(r))).toEqual(r);
      }),
      { numRuns: 300 },
    );
    const base = serializeRun(createRun(pipe('seller', [s('recv.stealth'), s('hygiene.sweep')]), fullCtx()));
    fc.assert(
      fc.property(fc.nat({ max: base.length - 1 }), fc.string({ maxLength: 3 }), (i, ins) => {
        const mutated = base.slice(0, i) + ins + base.slice(i + 1);
        const r = sanitizeRun(mutated);
        if (r !== null) expect(sanitizeRun(serializeRun(r))).toEqual(r);
      }),
      { numRuns: 500 },
    );
  });
  it('serialised runs carry no secret or signature field names (EX-2)', async () => {
    const run = await finishedRun(PAYER_3_5, 'payer');
    const keys = new Set<string>();
    const walk = (x: unknown): void => {
      if (Array.isArray(x)) x.forEach(walk);
      else if (typeof x === 'object' && x !== null)
        for (const [k, v] of Object.entries(x)) {
          keys.add(k);
          walk(v);
        }
    };
    walk(JSON.parse(serializeRun(run)));
    expect(
      [...keys].filter((k) => /sig|signature|rawTx|privateKey|secret|seed|mnemonic|password/i.test(k)),
    ).toEqual([]);
  });
});

describe('sanitizeHolding / sanitizePipeline', () => {
  it('copies every holding shape and rejects bad ones', () => {
    const good: Holding[] = [
      { t: 'payer-funds', wallet: 'fresh', asset: 'erc20' },
      { t: 'payment-plan', parts: 3, asset: 'erc20' },
      { t: 'note', pool: 'railgun', asset: 'erc20', holder: 'seller' },
      { t: 'stealth', asset: 'confidential', origin: 'hop' },
      { t: 'owned', asset: 'erc20', origin: 'pool-exit' },
      { t: 'paid' },
      { t: 'btc-utxo', kind: 'sp' },
    ];
    for (const h of good) expect(sanitizeHolding({ ...h, extra: 'x' })).toEqual(h);
    const bad: unknown[] = [
      null,
      5,
      [],
      {},
      { t: 'x' },
      { t: 'payer-funds', wallet: 'x', asset: 'erc20' },
      { t: 'payment-plan', parts: 0, asset: 'erc20' },
      { t: 'payment-plan', parts: 65, asset: 'erc20' },
      { t: 'note', pool: 'x', asset: 'erc20', holder: 'seller' },
      { t: 'stealth', asset: 'x', origin: 'hop' },
      { t: 'owned', asset: 'erc20', origin: 'x' },
      { t: 'btc-utxo', kind: 'x' },
      { t: 'payment-plan', parts: 1.5, asset: 'erc20' },
    ];
    for (const b of bad) expect(sanitizeHolding(b)).toBeNull();
  });
  it('drops unknown params, keeps known ones, resets layers, rejects bad input', () => {
    const p = pipe('payer', [s('src.wallet'), s('pay.submit', { route: 'direct-no-fee' })]);
    const raw = JSON.parse(JSON.stringify(p)) as Record<string, any>;
    raw['steps'][1]['params']['evil'] = 'x';
    raw['steps'][1]['params']['payerMode'] = { nested: 1 };
    raw['extra'] = 1;
    raw['layers'] = {
      transport: { rpc: 'tor-socks', relayer: 'carrier-pigeon', bogus: 'direct' },
      rpcMode: 'quorum',
      scanMode: 'nope',
    };
    const out = sanitizePipeline(raw);
    expect(out?.steps[1]?.params).toEqual({ route: 'direct-no-fee' });
    expect(out?.layers).toEqual({
      transport: { rpc: 'tor-socks' },
      rpcMode: 'quorum',
      scanMode: 'range',
      verification: 'address-free',
      isolation: 'per-step',
    });
    expect((out as unknown as Record<string, unknown>)['extra']).toBeUndefined();
    const withExtras = { ...p, ctBackend: 'ct1-zama', invoiceGross: '55' };
    expect(sanitizePipeline(withExtras)).toMatchObject({ ctBackend: 'ct1-zama', invoiceGross: '55' });
    expect(sanitizePipeline({ ...p, invoiceGross: '-5', ctBackend: 'x' })).not.toHaveProperty('invoiceGross');
    const bad: unknown[] = [
      null,
      1,
      [],
      { ...p, v: 2 },
      { ...p, id: '' },
      { ...p, role: 'x' },
      { ...p, asset: 'x' },
      { ...p, chain: null },
      { ...p, chain: { family: 'evm', chainId: 1 } },
      { ...p, chain: { family: 'btc', network: 'main' } },
      { ...p, steps: 'x' },
      { ...p, steps: Array.from({ length: 65 }, () => ({ kind: 'src.wallet' })) },
      { ...p, steps: [null] },
      { ...p, steps: [{ kind: 'x' }] },
      { ...p, steps: [{ kind: 'pay.submit', params: { route: 'free' } }] },
    ];
    for (const b of bad) expect(sanitizePipeline(b)).toBeNull();
    expect(sanitizePipeline({ ...p, layers: 5 })?.layers.rpcMode).toBe('single');
    expect(sanitizePipeline({ ...p, layers: { transport: 5 } })?.layers.transport).toEqual({});
    expect(
      sanitizePipeline({
        ...p,
        chain: { family: 'btc', network: 'signet' },
        asset: 'btc',
        steps: [{ kind: 'btc.send' }],
      }),
    ).not.toBeNull();
  });
  it('sanitizePipeline never throws on arbitrary input', () => {
    fc.assert(
      fc.property(fc.anything(), (x) => {
        sanitizePipeline(x);
      }),
      { numRuns: 300 },
    );
  });
});
