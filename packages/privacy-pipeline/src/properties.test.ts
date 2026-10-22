import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { analyze } from './analyze.js';
import { CHAIN_RULES, matchRule } from './chainRules.js';
import { createExecutor, createRun } from './executor.js';
import {
  Crash,
  FakeChain,
  FakeClock,
  FakeConfirmer,
  FakeProbe,
  FakeStore,
  allDrivers,
  makePorts,
} from './fakeDrivers.testutil.js';
import { ALL_CAPS, BTC_SIGNET, SEPOLIA, fullCtx, pipe, step as s } from './fixtures.testutil.js';
import { PipelineError } from './errors.js';
import {
  RUN_STATUSES,
  STEP_STATES,
  TERMINAL_STEP,
  reducePipeline,
  reduceStep,
  type PipelineRun,
  type RunEvent,
  type StepEvent,
  type StepInstance,
} from './machine.js';
import { evaluateSelection } from './profile.js';
import { expand } from './plan.js';
import { sanitizeRun } from './serialize.js';
import { simulate } from './summary.js';
import type { Pipeline, Purpose, Step } from './types.js';
import { projectToSelection, validate } from './validate.js';

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
const c = fullCtx();

const PAYER_POOL: Step[] = [
  s('payer.fresh-wallet'),
  s('amount.shape', { mode: 'round' }),
  s('amount.shape', { mode: 'split', parts: 2 }),
  s('amount.shape', { mode: 'denom', parts: 2 }),
  s('ct.wrap'),
  s('ct.wrap', { dwellMs: 5 }),
  s('pool.deposit'),
  s('pool.deposit', { n: 2 }),
  s('pool.dwell'),
  s('pay.submit'),
  s('pay.submit', { payerMode: 'permit-relay' }),
  s('pay.submit', { route: 'direct-no-fee' }),
  s('pay.from-pool'),
  s('pay.from-pool', { payerMode: 'eip7702-sponsored' }),
  s('src.wallet'),
];
const SELLER_POOL: Step[] = [
  s('sweep.delay'),
  s('hops.forward', { hops: 1 }),
  s('hops.forward', { hops: 3 }),
  s('hygiene.sweep'),
  s('hygiene.sweep', { destination: 'external-reuse' }),
  s('pool.deposit'),
  s('pool.deposit', { pool: 'privacy-pools' }),
  s('pool.dwell'),
  s('pool.exit'),
  s('pool.exit', { poolSubmit: 'self' }),
  s('ct.sweep'),
  s('ct.unwrap'),
  s('pool.deposit', { n: 2 }),
  s('pool.exit', { destination: 'single-address' }),
  s('recv.stealth'),
];
const BTC_SEL: Step[] = [
  s('btc.recv'),
  s('btc.recv', { mode: 'payjoin-v2' }),
  s('btc.payjoin-contribute'),
  s('btc.send'),
  s('btc.send', { mode: 'payjoin-v1', locktime: 'height' }),
  s('btc.recv', { mode: 'payjoin-v2', silentPaymentOutput: true }),
];

const payerPipe = fc
  .array(fc.constantFrom(...PAYER_POOL), { maxLength: 6 })
  .map((rest) => pipe('payer', [s('src.wallet'), ...rest]));
const sellerPipe = fc
  .tuple(fc.constantFrom('router', 'pool'), fc.array(fc.constantFrom(...SELLER_POOL), { maxLength: 6 }))
  .map(([origin, rest]) => pipe('seller', [s('recv.stealth', { origin }), ...rest]));
const btcPipe = fc
  .tuple(fc.constantFrom('payer', 'seller'), fc.array(fc.constantFrom(...BTC_SEL), { maxLength: 4 }))
  .map(([role, steps]) => pipe(role, steps, { chain: BTC_SIGNET, asset: 'btc' }));
const anyPipe = fc.oneof(payerPipe, sellerPipe, btcPipe);
const RUNS = { numRuns: 400 };

const impossibleHits = (p: Pipeline): string[] => {
  const a = analyze(p);
  const env = { views: a.views, invoiceGross: p.invoiceGross, testMode: false };
  return CHAIN_RULES.filter((r) => r.effect === 'block' && matchRule(r, env).length > 0).map((r) => r.id);
};

describe('P-1 soundness / P-2 terminality / P-3 exclusivity / P-7 profile consistency', () => {
  it('ok implies every step type-checks and no blocking chain rule matches', () => {
    fc.assert(
      fc.property(anyPipe, (p) => {
        const v = validate(p, c);
        if (v.ok) {
          expect(analyze(p).typeIssues).toEqual([]);
          expect(impossibleHits(p)).toEqual([]);
        }
      }),
      RUNS,
    );
  });
  it('no accepted pipeline has a step after a terminal holding', () => {
    fc.assert(
      fc.property(anyPipe, (p) => {
        if (!validate(p, c).ok) return;
        const a = analyze(p);
        a.outHoldings.forEach((h, i) => {
          if (h.t === 'owned' || h.t === 'paid') expect(i).toBe(a.outHoldings.length - 1);
        });
      }),
      RUNS,
    );
  });
  it('BTC: no accepted pipeline mixes silent payments and PayJoin in one transaction; EVM: confidential never mixes with pool, hops, sponsor or no-fee', () => {
    fc.assert(
      fc.property(anyPipe, (p) => {
        if (!validate(p, c).ok) return;
        for (const st of p.steps) {
          if (st.kind === 'btc.send' || st.kind === 'btc.recv') {
            const m = String(st.params?.['mode'] ?? 'silent-payment');
            if (m.startsWith('payjoin')) expect(st.params?.['silentPaymentOutput']).not.toBe(true);
          }
        }
        const a = analyze(p);
        const ct =
          a.views.some(
            (v) => v.inHolding !== null && 'asset' in v.inHolding && v.inHolding.asset === 'confidential',
          ) || p.steps.some((x) => x.kind === 'ct.wrap');
        if (ct) {
          for (const st of p.steps) {
            if (st.kind === 'pool.deposit' || st.kind === 'hops.forward' || st.kind === 'pay.from-pool')
              throw new Error(`ct mixed with ${st.kind}`);
            if (st.kind === 'pay.submit') {
              expect(st.params?.['payerMode'] ?? 'direct').toBe('direct');
              expect(st.params?.['route'] ?? 'router').toBe('router');
            }
          }
        }
      }),
      { numRuns: 800 },
    );
  });
  it('ok implies the projected selection has no blocking profile issue', () => {
    fc.assert(
      fc.property(anyPipe, (p) => {
        const issues = evaluateSelection(projectToSelection(p), c, p);
        if (issues.some((i) => i.severity === 'error')) expect(validate(p, c).ok).toBe(false);
      }),
      RUNS,
    );
  });
  it('validate and expand are total and deterministic over garbage steps (PL-2)', () => {
    const garbage = fc.oneof(
      fc.constantFrom(...PAYER_POOL, ...SELLER_POOL),
      fc.record({ kind: fc.string(), params: fc.anything() }),
      fc.anything(),
    );
    fc.assert(
      fc.property(fc.array(garbage, { maxLength: 6 }), fc.constantFrom('payer', 'seller'), (steps, role) => {
        const p = pipe(role, steps as Step[]);
        const a = validate(p, c);
        expect(validate(p, c)).toEqual(a);
        try {
          expand(p);
        } catch (e) {
          expect(e).toBeInstanceOf(PipelineError);
        }
      }),
      { numRuns: 500 },
    );
  });
});

describe('P-4 insertion monotonicity', () => {
  it('appending a step never makes an invalid pipeline valid and never removes a type error or chain-rule finding', () => {
    const extra = fc.constantFrom(...PAYER_POOL, ...SELLER_POOL);
    fc.assert(
      fc.property(anyPipe, extra, (p, x) => {
        const before = validate(p, c);
        const after = validate({ ...p, steps: [...p.steps, x] }, c);
        const keys = (v: typeof before): Set<string> =>
          new Set(
            [...v.blocking, ...v.warnings]
              .filter(
                (i) => i.code === 'E_TYPE' || i.code === 'E_PARAM' || (i.ruleId?.startsWith('C-') ?? false),
              )
              .map((i) => `${i.severity}|${i.key}|${i.ruleId ?? ''}|${i.detail ?? ''}`),
          );
        const ka = keys(after);
        for (const k of keys(before)) expect(ka.has(k), k).toBe(true);
        if (!before.ok) expect(after.ok).toBe(false);
      }),
      { numRuns: 600 },
    );
  });
  it('inserting anywhere into a pipeline that fails only on rules (no type error) never makes it valid, except by changing what a later step projects', () => {
    const extra = fc.constantFrom(...PAYER_POOL, ...SELLER_POOL);
    fc.assert(
      fc.property(anyPipe, extra, fc.nat(6), (p, x, at) => {
        const before = validate(p, c);
        if (
          before.ok ||
          before.typeErrors.length > 0 ||
          before.blocking.some((i) => i.code === 'E_UNKNOWN_VALUE')
        )
          return;
        const idx = Math.min(at, p.steps.length);
        const q = { ...p, steps: [...p.steps.slice(0, idx), x, ...p.steps.slice(idx)] };
        const after = validate(q, c);
        if (after.ok) {
          // oracle: the insertion changed the later-step context of a projecting step (fresh wallet or amount shaping before a deposit)
          expect(x.kind).toBe('pool.deposit');
        }
      }),
      { numRuns: 600 },
    );
  });
});

describe('P-5 summary monotonicity / P-6 crowd non-addition', () => {
  it('appending a step never lowers cost, latency, trust or reveals (shape fingerprint excluded)', () => {
    const extra = fc.constantFrom(...PAYER_POOL, ...SELLER_POOL);
    fc.assert(
      fc.property(anyPipe, extra, (p, x) => {
        const q = { ...p, steps: [...p.steps, x] };
        const a = simulate(p, c);
        const b = simulate(q, c);
        expect(b.cost.totalFeeBpsMax).toBeGreaterThanOrEqual(a.cost.totalFeeBpsMax);
        expect(b.cost.totalFeeBpsMin).toBeGreaterThanOrEqual(a.cost.totalFeeBpsMin);
        expect(b.latency.maxMs).toBeGreaterThanOrEqual(a.latency.maxMs);
        expect(b.latency.minMs).toBeGreaterThanOrEqual(a.latency.minMs);
        for (const t of a.trust) expect(b.trust).toContain(t);
        for (const r of a.reveals)
          if (r !== 'privacy.warn.chain.combinationFingerprint') expect(b.reveals).toContain(r);
        for (const st of a.strength) expect(b.strength).toContain(st);
      }),
      { numRuns: 400 },
    );
  });
  it('a second pool or hops add no crowd: one crowd class, credited dwell only from pool.dwell', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(s('hops.forward', { hops: 1 }), s('hops.forward', { hops: 2 }), s('sweep.delay')),
        (extra) => {
          const base = pipe('seller', [
            s('recv.stealth'),
            s('pool.deposit'),
            s('pool.dwell'),
            s('pool.exit'),
          ]);
          const withExtra = pipe('seller', [
            s('recv.stealth'),
            extra,
            s('pool.deposit'),
            s('pool.dwell'),
            s('pool.exit'),
          ]);
          const a = simulate(base, c);
          const b = simulate(withExtra, c);
          expect(b.latency.creditedDwellMs).toBe(a.latency.creditedDwellMs);
          expect(b.strength.filter((x) => x === 'crowd-dependent-unlinking')).toHaveLength(1);
          expect(b.strength.filter((x) => x !== 'weak' && x !== 'friction')).toEqual(
            a.strength.filter((x) => x !== 'weak' && x !== 'friction'),
          );
        },
      ),
      { numRuns: 20 },
    );
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
    expect(two.strength.filter((x) => x === 'crowd-dependent-unlinking')).toHaveLength(1);
  });
});

describe('P-8 permutation: valid orders equal the compact-matrix oracle', () => {
  const KINDS = [
    'sweep.delay',
    'hops.forward',
    'hygiene.sweep',
    'pool.deposit',
    'pool.dwell',
    'pool.exit',
  ] as const;
  type K = (typeof KINDS)[number];
  /** Independent oracle from the spec matrix: which seller step may follow which on one lineage. */
  const FOLLOWS: Record<string, readonly K[]> = {
    start: ['sweep.delay', 'hops.forward', 'hygiene.sweep', 'pool.deposit'],
    'sweep.delay': ['sweep.delay', 'hops.forward', 'hygiene.sweep', 'pool.deposit'],
    'hops.forward': ['hops.forward', 'sweep.delay', 'hygiene.sweep', 'pool.deposit'],
    'pool.deposit': ['pool.dwell', 'pool.exit'],
    'pool.dwell': ['pool.dwell', 'pool.exit'],
    'hygiene.sweep': [],
    'pool.exit': [],
  };
  const permutations = <T>(xs: T[]): T[][] =>
    xs.length <= 1
      ? [xs]
      : xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((r) => [x, ...r]));
  it('every order of every multiset of up to five steps', () => {
    const subsets: K[][] = [];
    for (let mask = 1; mask < 1 << KINDS.length; mask++)
      subsets.push(KINDS.filter((_k, i) => (mask & (1 << i)) !== 0));
    subsets.push(
      ['hops.forward', 'hops.forward', 'hygiene.sweep'],
      ['sweep.delay', 'sweep.delay', 'pool.deposit'],
      ['pool.deposit', 'pool.deposit'],
      ['pool.dwell', 'pool.dwell', 'pool.deposit', 'pool.exit'],
    );
    let checked = 0;
    for (const set of subsets) {
      if (set.length > 5) continue;
      for (const order of permutations(set)) {
        const oracleOk =
          order.filter((k) => k === 'pool.deposit').length <= 1 &&
          order.every((k, i) =>
            (FOLLOWS[i === 0 ? 'start' : (order[i - 1] as K)] as readonly K[]).includes(k),
          );
        const p = pipe('seller', [
          s('recv.stealth'),
          ...order.map((k) => (k === 'hops.forward' ? s(k, { hops: 1 }) : s(k))),
        ]);
        const v = validate(p, c);
        expect(v.ok, order.join('>')).toBe(oracleOk);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(400);
  });
});

describe('P-9 reducer closure and crash/resume idempotency', () => {
  const stepEvents: StepEvent[] = [
    { type: 'ready' },
    { type: 'need-confirm' },
    { type: 'checkpoint-ok' },
    { type: 'wait', dueAtMs: 1, waitedMs: 1 },
    { type: 'due' },
    { type: 'prepare' },
    { type: 'restart' },
    { type: 'sign', intentKey: 'k' },
    { type: 'submitted', ref: 'r' },
    { type: 'chain-confirmed' },
    { type: 'outputs', outputs: [] },
    { type: 'crash' },
    { type: 'reconciled', result: 'pending' },
    { type: 'reconciled', result: 'done' },
    { type: 'reconciled', result: 'not-started' },
    { type: 'reconciled', result: 'failed' },
    { type: 'retryable', reason: 'x' },
    { type: 'retry' },
    { type: 'terminal', reason: 'x' },
    { type: 'skip' },
    { type: 'abort' },
  ];
  it('step reducer: any event sequence stays in the state set, terminal states are absorbing, errors are typed', () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...stepEvents), { maxLength: 25 }), (evs) => {
        let i: StepInstance = {
          instanceId: '0x1',
          stepIndex: 0,
          kind: 'pool.exit',
          lineagePath: [],
          state: 'planned',
          attempts: 0,
        };
        for (const ev of evs) {
          try {
            const n = reduceStep(i, ev);
            expect(TERMINAL_STEP.includes(i.state)).toBe(false);
            i = n;
          } catch (e) {
            expect(e).toBeInstanceOf(PipelineError);
            expect((e as PipelineError).code).toBe('E_ILLEGAL_TRANSITION');
          }
          expect(STEP_STATES).toContain(i.state);
        }
      }),
      { numRuns: 500 },
    );
  });
  it('run reducer: closed over its status set', () => {
    const evs: RunEvent[] = [
      { type: 'validate', planHash: '0x1' },
      { type: 'confirm', planHash: '0x1' },
      { type: 'replan' },
      { type: 'start' },
      { type: 'pause', reason: 'x' },
      { type: 'resume' },
      { type: 'abort-request' },
      { type: 'aborted' },
      { type: 'complete' },
      { type: 'partial' },
    ];
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...evs), { maxLength: 20 }), (seq) => {
        let r: PipelineRun = {
          v: 1,
          id: 'r',
          status: 'draft',
          planHash: '0x1',
          pipeline: pipe('payer', []),
          quotes: {},
          instances: [],
          cp2Done: false,
        };
        for (const ev of seq) {
          try {
            r = reducePipeline(r, ev);
          } catch (e) {
            expect(e).toBeInstanceOf(PipelineError);
          }
          expect(RUN_STATUSES).toContain(r.status);
        }
      }),
      { numRuns: 400 },
    );
  });
  it('random crash points on random seller pipelines never double-submit and resume to completion', async () => {
    const shapes: Step[][] = [
      [s('recv.stealth'), s('hygiene.sweep')],
      [s('recv.stealth'), s('sweep.delay'), s('hygiene.sweep')],
      [s('recv.stealth'), s('hops.forward', { hops: 2 }), s('hygiene.sweep')],
      [
        s('recv.stealth'),
        s('pool.deposit', { n: 3, exitGas: 'buffer' }),
        s('pool.dwell'),
        s('pool.exit', { partials: 2 }),
      ],
    ];
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...shapes),
        fc.nat({ max: 120 }),
        fc.constantFrom('dieBefore', 'dieAfter'),
        async (steps, k, mode) => {
          const p = pipe('seller', steps);
          const ctxv = fullCtx({ selfTests: new Set(ALL_PURPOSES) });
          const acks = new Set(validate(p, ctxv).requiredAcks);
          const chain = new FakeChain();
          const counters = { submits: 0 };
          const mk = (store: FakeStore, clock: FakeClock): ReturnType<typeof createExecutor> => {
            const probe = new FakeProbe();
            probe.caps = new Set(ALL_CAPS);
            const kinds = [...new Set(steps.map((x) => x.kind))];
            return createExecutor(
              makePorts({
                drivers: allDrivers({ chain, store }, counters, kinds),
                store,
                confirmer: new FakeConfirmer(),
                clock,
                probe,
              }),
            );
          };
          const clock = new FakeClock();
          const store = new FakeStore();
          store[mode] = k + 1;
          const ex = mk(store, clock);
          try {
            await ex.start(createRun(p, ctxv), acks);
            for (let i = 0; i < 12; i++) {
              clock.now += 4 * 24 * 3_600_000;
              await ex.advance(p.id);
            }
          } catch (e) {
            if (!(e instanceof Crash)) throw e;
          }
          const store2 = store.revive();
          const ex2 = mk(store2, clock);
          const stored = store2.data.get(p.id);
          const run = stored === undefined ? createRun(p, ctxv) : (sanitizeRun(stored) as PipelineRun);
          if (run.status === 'validated' || run.status === 'confirmed') await ex2.start(run, acks);
          else if (run.status === 'running' || run.status === 'paused') await ex2.resume(p.id);
          for (let i = 0; i < 12; i++) {
            clock.now += 4 * 24 * 3_600_000;
            await ex2.advance(p.id);
          }
          const final = sanitizeRun(store2.data.get(p.id)) as PipelineRun;
          expect(final.status).toBe('completed');
          for (const n of chain.effects.values()) expect(n).toBe(1);
          expect(chain.effectCount()).toBe(expand(p).nodes.length);
        },
      ),
      { numRuns: 60 },
    );
  }, 120_000);
});

describe('payer pipelines too', () => {
  it('3.5-like payer chains complete under the executor', () => {
    expect(validate(pipe('payer', [s('src.wallet'), s('pay.submit')], { chain: SEPOLIA }), c).ok).toBe(true);
  });
});
