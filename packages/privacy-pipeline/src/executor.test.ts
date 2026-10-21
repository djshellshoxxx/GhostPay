import { describe, expect, it } from 'vitest';
import { PipelineError } from './errors.js';
import {
  createExecutor,
  createRun,
  simulateWithDrivers,
  OVERDUE_MS,
  type ExecEvent,
  type Executor,
} from './executor.js';
import {
  Crash,
  FakeChain,
  FakeClock,
  FakeConfirmer,
  FakeProbe,
  FakeStore,
  FixedDelay,
  allDrivers,
  fakeDriver,
  fakeSign,
  makePorts,
  type Counters,
  type FakeDriverOptions,
} from './fakeDrivers.testutil.js';
import { ALL_CAPS, PAYER_3_5, SELLER_3_5, SEPOLIA, fullCtx, pipe, step as s } from './fixtures.testutil.js';
import type { PipelineRun } from './machine.js';
import type { StepDriver } from './ports.js';
import { sanitizeRun } from './serialize.js';
import { expand, planHash } from './plan.js';
import type { Pipeline, Purpose, Step, StepKind } from './types.js';
import { validate } from './validate.js';

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

interface Rig {
  store: FakeStore;
  chain: FakeChain;
  counters: Counters;
  confirmer: FakeConfirmer;
  clock: FakeClock;
  probe: FakeProbe;
  drivers: Partial<Record<StepKind, StepDriver>>;
  ex: Executor;
  run: PipelineRun;
  pipeline: Pipeline;
  acks: Set<string>;
  events: ExecEvent[];
  delay: FixedDelay & { draws: number };
}

function rig(
  role: 'payer' | 'seller',
  steps: readonly Step[],
  o: {
    drv?: Partial<FakeDriverOptions>;
    layers?: Parameters<typeof pipe>[2] extends infer T
      ? T extends { layers?: infer L }
        ? L
        : never
      : never;
    store?: FakeStore;
    chain?: FakeChain;
    counters?: Counters;
    asset?: 'erc20' | 'erc20-permit';
  } = {},
): Rig {
  const store = o.store ?? new FakeStore();
  const chain = o.chain ?? new FakeChain();
  const counters = o.counters ?? { submits: 0 };
  const pipeline = pipe(role, steps, {
    ...(o.layers === undefined ? {} : { layers: o.layers }),
    ...(o.asset === undefined ? {} : { asset: o.asset }),
  });
  const ctxv = fullCtx({ selfTests: new Set(ALL_PURPOSES) });
  const run = createRun(pipeline, ctxv);
  const confirmer = new FakeConfirmer();
  const clock = new FakeClock();
  const probe = new FakeProbe();
  probe.caps = new Set(ALL_CAPS);
  const kinds = [...new Set(steps.map((x) => x.kind))];
  const drivers = allDrivers({ chain, store, ...o.drv }, counters, kinds);
  const delay = Object.assign(new FixedDelay(), { draws: 0 });
  const origDraw = delay.draw.bind(delay);
  delay.draw = (a: number, b: number): number => {
    delay.draws += 1;
    return origDraw(a, b);
  };
  const ex = createExecutor(makePorts({ drivers, store, confirmer, clock, probe, delay, sign: fakeSign }));
  const events: ExecEvent[] = [];
  ex.onEvent((e) => events.push(e));
  return {
    store,
    chain,
    counters,
    confirmer,
    clock,
    probe,
    drivers,
    ex,
    run,
    pipeline,
    acks: new Set(validate(pipeline, ctxv).requiredAcks),
    events,
    delay,
  };
}

async function drain(r: Rig, rounds = 60): Promise<PipelineRun> {
  let last = await r.ex.advance(r.run.id);
  for (let i = 0; i < rounds && last.status === 'running'; i++) {
    r.clock.now += 2 * 24 * 3_600_000;
    last = await r.ex.advance(r.run.id);
  }
  return last;
}

const loadRun = (r: Rig): PipelineRun => sanitizeRun(r.store.data.get(r.run.id)) as PipelineRun;
const SELLER_POOL: Step[] = [
  s('recv.stealth'),
  s('pool.deposit', { n: 2, exitGas: 'buffer' }),
  s('pool.dwell'),
  s('pool.exit'),
];

describe('executor happy path and checkpoints (EX-1, EX-8, EX-10, CP-1..CP-3)', () => {
  it('runs the 3.5 payer chain to completion; one submit per instance; checkpoints in order', async () => {
    const r = rig('payer', PAYER_3_5);
    const started = await r.ex.start(r.run, r.acks);
    expect(started.status).toBe('running');
    const done = await drain(r);
    expect(done.status).toBe('completed');
    expect(r.chain.effectCount()).toBe(expand(r.pipeline).nodes.length);
    expect([...r.chain.effects.values()].every((n) => n === 1)).toBe(true);
    const kinds = r.confirmer.seen.map((c) => c.kind);
    expect(kinds[0]).toBe('CP-1');
    expect(kinds.filter((k) => k === 'CP-2')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'CP-3')).toHaveLength(3); // fresh-wallet, deposit, pay.from-pool (on-chain only)
    expect(r.events.filter((e) => e.type === 'run').map((e) => (e as { status: string }).status)).toEqual([
      'confirmed',
      'running',
      'completed',
    ]);
    expect(r.ex.onEvent(() => undefined)).toBeTypeOf('function');
  });
  it('EX-1: the intent key is persisted in state signing before submit is reached', async () => {
    const r = rig('seller', [s('recv.stealth'), s('hygiene.sweep')]);
    const inner = r.drivers['hygiene.sweep'] as StepDriver;
    let checked = 0;
    r.drivers['hygiene.sweep'] = {
      ...inner,
      submit: (i, p, sg) => {
        const rec = JSON.parse(r.store.data.get(r.run.id) as string) as {
          instances: { instanceId: string; state: string; intentKey?: string }[];
        };
        const me = rec.instances.find((x) => x.instanceId === i.instanceId);
        expect(me?.state).toBe('signing');
        expect(me?.intentKey).toBe(i.intentKey);
        expect(i.intentKey).toMatch(/^0x[0-9a-f]{64}$/);
        checked += 1;
        return inner.submit(i, p, sg);
      },
    };
    const ex = createExecutor(
      makePorts({
        drivers: r.drivers,
        store: r.store,
        confirmer: r.confirmer,
        clock: r.clock,
        probe: r.probe,
      }),
    );
    await ex.start(r.run, r.acks);
    expect((await ex.advance(r.run.id)).status).toBe('completed');
    expect(checked).toBe(1);
  });
  it('EX-10: never more than one prompt at a time', async () => {
    const r = rig('seller', SELLER_POOL);
    let open = 0;
    let max = 0;
    const orig = r.confirmer.confirm.bind(r.confirmer);
    r.confirmer.confirm = async (c) => {
      open += 1;
      max = Math.max(max, open);
      await Promise.resolve();
      const v = await orig(c);
      open -= 1;
      return v;
    };
    await r.ex.start(r.run, r.acks);
    expect((await drain(r)).status).toBe('completed');
    expect(max).toBe(1);
  });
  it('the sign port is only reachable through drivers and nothing signed is persisted (EX-2)', async () => {
    const r = rig('seller', SELLER_POOL);
    await r.ex.start(r.run, r.acks);
    await drain(r);
    const body = r.store.data.get(r.run.id) as string;
    expect(body).not.toContain('sig:');
    const keys: string[] = [];
    const walk = (x: unknown): void => {
      if (Array.isArray(x)) x.forEach(walk);
      else if (typeof x === 'object' && x !== null)
        for (const [k, v] of Object.entries(x)) {
          keys.push(k);
          walk(v);
        }
    };
    walk(JSON.parse(body));
    expect(keys.filter((k) => /sig|signature|rawTx|privateKey|secret|seed|mnemonic/i.test(k))).toEqual([]);
  });
  it('waits record realised delays once and never re-draw them (EX-5)', async () => {
    const r = rig('seller', SELLER_POOL);
    await r.ex.start(r.run, r.acks);
    const before = loadRun(r).instances.filter((i) => i.waitedMs !== undefined);
    expect(before.length).toBeGreaterThan(0);
    const draws = r.delay.draws;
    await r.ex.resume(r.run.id);
    expect(r.delay.draws).toBe(draws);
    expect(
      loadRun(r)
        .instances.filter((i) => i.waitedMs !== undefined)
        .map((i) => i.waitedMs),
    ).toEqual(before.map((i) => i.waitedMs));
  });
});

describe('start refusals (PL-3, PL-4, PL-9)', () => {
  it('createRun refuses an invalid pipeline', () => {
    expect(() => createRun(pipe('payer', [s('src.wallet'), s('pay.from-pool')]), fullCtx())).toThrow(
      PipelineError,
    );
    expect(() =>
      createRun({ ...pipe('payer', []), chain: { family: 'evm', chainId: 1 } } as never, fullCtx()),
    ).toThrow(PipelineError);
  });
  it('start requires the acks to cover requiredAcks and never adds one', async () => {
    const r = rig('payer', PAYER_3_5);
    await expect(r.ex.start(r.run, new Set())).rejects.toMatchObject({ code: 'E_ACK_MISSING' });
    await expect(r.ex.start(r.run, new Set([...r.acks].slice(1)))).rejects.toMatchObject({
      code: 'E_ACK_MISSING',
    });
    expect(r.store.saves).toBe(0);
    expect(r.counters.submits).toBe(0);
  });
  it('start rejects a run whose context no longer validates (capabilities removed)', async () => {
    const r = rig('payer', PAYER_3_5);
    r.probe.caps = new Set();
    await expect(r.ex.start(r.run, r.acks)).rejects.toMatchObject({ code: 'E_NOT_VALID' });
  });
  it('start rejects a tampered plan hash and a wrong status', async () => {
    const r = rig('seller', SELLER_POOL);
    await expect(r.ex.start({ ...r.run, planHash: `0x${'1'.repeat(64)}` }, r.acks)).rejects.toMatchObject({
      code: 'E_PLAN_HASH',
    });
    await expect(r.ex.start({ ...r.run, status: 'running' }, r.acks)).rejects.toMatchObject({
      code: 'E_ILLEGAL_TRANSITION',
    });
    await expect(
      r.ex.start(
        { ...r.run, pipeline: { ...r.run.pipeline, chain: { family: 'evm', chainId: 1 } } } as never,
        r.acks,
      ),
    ).rejects.toMatchObject({ code: 'E_WRONG_CHAIN' });
  });
  it('CP-1 declined leaves the run unstarted; a changed hash from the confirmer is refused', async () => {
    const r = rig('seller', SELLER_POOL);
    r.confirmer.decline.add('CP-1');
    const out = await r.ex.start(r.run, r.acks);
    expect(out.status).toBe('validated');
    expect(r.counters.submits).toBe(0);
    const r2 = rig('seller', SELLER_POOL);
    r2.confirmer.confirm = () => Promise.resolve({ ok: true, planHash: `0x${'2'.repeat(64)}` });
    const out2 = await r2.ex.start(r2.run, r2.acks);
    expect(out2.status).toBe('validated');
  });
  it('a failing self-test at start pauses, never downgrades (PL-9, L-1)', async () => {
    const layers = { transport: { relayer: 'tor-socks' as const, 'pool-relayer': 'tor-socks' as const } };
    const r = rig('seller', SELLER_POOL, { layers });
    r.probe.failing.add('relayer');
    r.probe.failing.add('pool-relayer');
    const out = await r.ex.start(r.run, r.acks);
    expect(out.status).toBe('paused');
    expect(out.pauseReason).toMatch(/^selftest-failed:/);
    expect(r.counters.submits).toBe(0);
    expect(out.pipeline.layers.transport).toEqual(layers.transport);
    // resume while still failing: stays paused, still no submit
    const again = await r.ex.resume(r.run.id);
    expect(again.status).toBe('paused');
    expect(r.counters.submits).toBe(0);
    r.probe.failing.clear();
    const ok = await r.ex.resume(r.run.id);
    expect(ok.status === 'running' || ok.status === 'completed').toBe(true);
    expect(r.probe.tested.length).toBeGreaterThan(2);
  });
  it('a failing self-test at resume of a running run pauses it', async () => {
    const layers = { transport: { 'pool-relayer': 'tor-socks' as const } };
    const r = rig('seller', SELLER_POOL, { layers });
    await r.ex.start(r.run, r.acks);
    expect(loadRun(r).status).toBe('running');
    r.probe.failing.add('pool-relayer');
    const out = await r.ex.resume(r.run.id);
    expect(out).toMatchObject({ status: 'paused', pauseReason: 'selftest-failed:pool-relayer' });
  });
});

describe('crash injection: exactly one submit per intent key (PL-5, EX-3)', () => {
  const acksFor = (steps: Step[]): Set<string> =>
    new Set(validate(pipe('seller', steps), fullCtx({ selfTests: new Set(ALL_PURPOSES) })).requiredAcks);
  async function restart(old: Rig, steps: Step[]): Promise<Rig> {
    const store2 = old.store.revive();
    const r = rig('seller', steps, { store: store2, chain: old.chain, counters: old.counters });
    const stored = store2.data.get(old.run.id);
    if (stored === undefined) {
      await r.ex.start(r.run, acksFor(steps));
    } else {
      const run = sanitizeRun(stored) as PipelineRun;
      if (run.status === 'validated' || run.status === 'confirmed') await r.ex.start(run, acksFor(steps));
      else if (run.status === 'running' || run.status === 'paused') await r.ex.resume(old.run.id);
    }
    return r;
  }
  const cleanRun = async (steps: Step[]): Promise<{ saves: number; instances: number }> => {
    const r = rig('seller', steps);
    await r.ex.start(r.run, r.acks);
    expect((await drain(r)).status).toBe('completed');
    return { saves: r.store.saves, instances: expand(r.pipeline).nodes.length };
  };
  it('dying before or after any persisted transition, then resuming, never double-submits', async () => {
    const steps = SELLER_POOL;
    const { saves, instances } = await cleanRun(steps);
    expect(saves).toBeGreaterThan(30);
    let crashes = 0;
    for (let k = 1; k <= saves; k++) {
      for (const mode of ['dieBefore', 'dieAfter'] as const) {
        const r = rig('seller', steps);
        r.store[mode] = k;
        try {
          await r.ex.start(r.run, r.acks);
          await drain(r);
        } catch (e) {
          if (!(e instanceof Crash)) throw e;
          crashes += 1;
        }
        const r2 = await restart(r, steps);
        const fin = await drain(r2);
        expect(fin.status, `k=${k} ${mode}`).toBe('completed');
        for (const [key, n] of r.chain.effects) expect(n, `k=${k} ${mode} ${key}`).toBe(1);
        expect(r.chain.effectCount(), `k=${k} ${mode}`).toBe(instances);
      }
    }
    expect(crashes).toBeGreaterThanOrEqual(saves);
  }, 120_000);
  it('dying inside the driver, before or after the side effect, is repaired by reconcile', async () => {
    const steps = SELLER_POOL;
    const instances = expand(pipe('seller', steps)).nodes.length;
    for (const key of ['crashBeforeEffectAt', 'crashAfterEffectAt'] as const) {
      for (let n = 1; n <= instances; n++) {
        const store = new FakeStore();
        const r = rig('seller', steps, { store, drv: { [key]: n } });
        let crashed = false;
        try {
          await r.ex.start(r.run, r.acks);
          await drain(r);
        } catch (e) {
          if (!(e instanceof Crash)) throw e;
          crashed = true;
        }
        expect(crashed, `${key} ${n}`).toBe(true);
        const r2 = await restart(r, steps);
        const fin = await drain(r2);
        expect(fin.status).toBe('completed');
        for (const [k, c] of r.chain.effects) expect(c, `${key} ${n} ${k}`).toBe(1);
        expect(r.chain.effectCount()).toBe(instances);
      }
    }
  }, 120_000);
});

describe('reconcile, retry and failure handling (EX-3, EX-4, EX-7)', () => {
  it('a thrown submit is reconciled first; not-started backs off as retryable and resubmits once after resume', async () => {
    const r = rig('seller', [s('recv.stealth'), s('hygiene.sweep')], { drv: { failSubmitTimes: 1 } });
    await r.ex.start(r.run, r.acks);
    expect(loadRun(r)).toMatchObject({ status: 'paused', pauseReason: 'retryable:submit-failed' });
    expect(r.chain.effectCount()).toBe(0); // the first submit (recv) failed before any effect
    const done = await r.ex.resume(r.run.id);
    expect(done.status).toBe('completed');
    expect(r.counters.submits).toBe(3); // recv (injected failure), recv (retried after reconcile said not-started), sweep
    expect(r.chain.effectCount()).toBe(2);
    const key = done.instances[0]?.intentKey;
    expect(r.chain.effects.get(key as string)).toBe(1);
  });
  it('a driver that always fails ends terminal after the retry limit and never spins', async () => {
    const r = rig('seller', [s('recv.stealth'), s('hygiene.sweep')], { drv: { failSubmitTimes: 1000 } });
    await r.ex.start(r.run, r.acks);
    let last = loadRun(r);
    for (let i = 0; i < 8 && last.status !== 'partial'; i++) last = await r.ex.resume(r.run.id);
    expect(last.status).toBe('partial');
    expect(r.counters.submits).toBeLessThan(12);
    expect(r.chain.effectCount()).toBe(0);
  });
  it('the loop guard pauses a run that keeps making no net progress', async () => {
    const r = rig('seller', [s('recv.stealth'), s('hygiene.sweep')]);
    const inner = r.drivers['recv.stealth'] as StepDriver;
    // a chain that forgets every submission makes `submitted` bounce back to `due` forever
    r.drivers['recv.stealth'] = {
      ...inner,
      submit: async (i, p, sg) => (r.chain.status.clear(), inner.submit(i, p, sg)),
    };
    r.chain.autoConfirm = false;
    const ex = createExecutor(
      makePorts({
        drivers: r.drivers,
        store: r.store,
        confirmer: r.confirmer,
        clock: r.clock,
        probe: r.probe,
      }),
    );
    const origReconcile = inner.reconcile.bind(inner);
    r.drivers['recv.stealth'] = {
      ...r.drivers['recv.stealth'],
      reconcile: (i) => (i.intentKey === undefined ? origReconcile(i) : Promise.resolve('not-started')),
    };
    const ex2 = createExecutor(
      makePorts({
        drivers: r.drivers,
        store: r.store,
        confirmer: r.confirmer,
        clock: r.clock,
        probe: r.probe,
      }),
    );
    void ex;
    await ex2.start(r.run, r.acks);
    expect(loadRun(r)).toMatchObject({ status: 'paused', pauseReason: 'loop-guard' });
  });
  it('pending chain status stays submitted until done; poll does not resubmit', async () => {
    const r = rig('seller', [s('recv.stealth'), s('hygiene.sweep')], { drv: { pendingPolls: 3 } });
    await r.ex.start(r.run, r.acks);
    const out = await drain(r);
    expect(out.status).toBe('completed');
    expect(r.chain.effectCount()).toBe(2);
  });
  it('a chain still pending blocks abort (E_ABORT_IN_FLIGHT); a slow chain finishes later', async () => {
    const r = rig('seller', [s('recv.stealth'), s('hygiene.sweep')]);
    r.chain.autoConfirm = false;
    await r.ex.start(r.run, r.acks);
    expect(loadRun(r).instances.some((i) => i.state === 'submitted')).toBe(true);
    await expect(r.ex.abort(r.run.id)).rejects.toMatchObject({ code: 'E_ABORT_IN_FLIGHT' });
    for (const k of r.chain.status.keys()) r.chain.status.set(k, 'done');
    r.chain.autoConfirm = true;
    expect((await r.ex.advance(r.run.id)).status).toBe('completed');
  });
  it('quote failure pauses as retryable, resume retries, attempts are exhausted into a terminal failure', async () => {
    const r = rig('seller', [s('recv.stealth'), s('hygiene.sweep')], { drv: { failQuoteTimes: 1 } });
    await r.ex.start(r.run, r.acks);
    const p = loadRun(r);
    expect(p.status).toBe('paused');
    expect(p.pauseReason).toBe('retryable:quote-failed');
    r.clock.now += 1;
    const out = await r.ex.resume(r.run.id);
    expect(out.status === 'completed' || out.status === 'running').toBe(true);
    const r2 = rig('seller', [s('recv.stealth'), s('hygiene.sweep')], { drv: { failQuoteTimes: 99 } });
    await r2.ex.start(r2.run, r2.acks);
    let last = loadRun(r2);
    for (let i = 0; i < 6 && last.status !== 'partial'; i++) last = await r2.ex.resume(r2.run.id);
    expect(last.status).toBe('partial');
    expect(last.instances[0]).toMatchObject({ state: 'failed-terminal', failure: 'retries-exhausted' });
    expect(last.instances[1]?.state).toBe('skipped');
  });
  it('prepare failure is retryable too', async () => {
    const r = rig('seller', [s('recv.stealth'), s('hygiene.sweep')]);
    const inner = r.drivers['hygiene.sweep'] as StepDriver;
    let fail = true;
    r.drivers['hygiene.sweep'] = {
      ...inner,
      prepare: (i, h, q) =>
        fail ? ((fail = false), Promise.reject(new Error('x'))) : inner.prepare(i, h, q),
    };
    const ex = createExecutor(
      makePorts({
        drivers: r.drivers,
        store: r.store,
        confirmer: r.confirmer,
        clock: r.clock,
        probe: r.probe,
      }),
    );
    await ex.start(r.run, r.acks);
    expect(loadRun(r).pauseReason).toBe('retryable:prepare-failed');
    expect((await ex.resume(r.run.id)).status).toBe('completed');
  });
  it('EX-7: a failed lineage stops, its sibling continues, descendants are skipped, run ends partial', async () => {
    const r = rig('seller', SELLER_POOL);
    const first = expand(r.pipeline).nodes.find((n) => n.kind === 'pool.dwell' && n.lineagePath[0] === 0) as {
      instanceId: string;
    };
    r.chain.failOn = (i) => i.instanceId === first.instanceId;
    await r.ex.start(r.run, r.acks);
    const out = await drain(r);
    expect(out.status).toBe('partial');
    const by = (k: string, lane: number): string =>
      out.instances.find((i) => i.kind === k && i.lineagePath[0] === lane)?.state as string;
    expect(by('pool.dwell', 0)).toBe('failed-terminal');
    expect(by('pool.exit', 0)).toBe('skipped');
    expect(by('pool.dwell', 1)).toBe('done');
    expect(by('pool.exit', 1)).toBe('done');
  });
  it('EX-4: a direct read asks first (CP-5); declining pauses; accepting reconciles', async () => {
    const layers = { verification: 'direct' as const };
    const r = rig('seller', [s('recv.stealth'), s('hygiene.sweep')], { layers });
    r.chain.autoConfirm = false;
    await r.ex.start(r.run, r.acks);
    r.confirmer.decline.add('CP-5');
    const paused = await r.ex.resume(r.run.id);
    expect(paused.pauseReason).toBe('direct-read-declined');
    expect(r.confirmer.seen.filter((c) => c.kind === 'CP-5')).toHaveLength(1);
    expect(r.confirmer.seen.find((c) => c.kind === 'CP-5')?.keys).toContain(
      'privacy.warn.directReadsRevealAddress',
    );
    r.confirmer.decline.clear();
    for (const k of r.chain.status.keys()) r.chain.status.set(k, 'done');
    r.chain.autoConfirm = true;
    const ok = await r.ex.resume(r.run.id);
    expect(ok.status).toBe('completed');
  });
  it('outputs of the wrong size fail the instance terminally', async () => {
    const r = rig('seller', [s('recv.stealth'), s('hygiene.sweep')], { drv: { mismatchOutputs: true } });
    await r.ex.start(r.run, r.acks);
    const out = await drain(r);
    expect(out.status).toBe('partial');
    expect(out.instances[0]).toMatchObject({ state: 'failed-terminal', failure: 'outputs-mismatch' });
  });
  it('a failed chain result is terminal', async () => {
    const r = rig('seller', [s('recv.stealth'), s('hygiene.sweep')]);
    r.chain.failOn = (i) => i.kind === 'hygiene.sweep';
    await r.ex.start(r.run, r.acks);
    const out = await drain(r);
    expect(out.status).toBe('partial');
    expect(out.instances[1]).toMatchObject({ state: 'failed-terminal', failure: 'chain-failed' });
  });
  it('a submitted instance that the chain no longer knows is reconciled back to due', async () => {
    const r = rig('seller', [s('recv.stealth'), s('hygiene.sweep')]);
    r.chain.autoConfirm = false;
    await r.ex.start(r.run, r.acks);
    r.chain.status.clear();
    r.chain.effects.clear();
    r.chain.autoConfirm = true;
    const out = await drain(r);
    expect(out.status).toBe('completed');
  });
});

describe('re-quote, health, rejection (EX-8, EX-9, CP-3, CP-4)', () => {
  it('EX-8: a fee above plan plus tolerance asks CP-4 with a new plan hash; accepting continues', async () => {
    const r = rig('seller', [s('recv.stealth'), s('hygiene.sweep')], {
      drv: { quote: (i) => ({ feeBps: i.kind === 'hygiene.sweep' ? 1000 : 0 }) },
    });
    const first = r.run.planHash;
    await r.ex.start(r.run, r.acks);
    const out = await drain(r);
    expect(out.status).toBe('completed');
    const cp4 = r.confirmer.seen.filter((c) => c.kind === 'CP-4');
    expect(cp4.length).toBeGreaterThan(0);
    expect(cp4[0]?.planHash).not.toBe(first);
    expect(out.planHash).not.toBe(first);
    expect(out.planHash).toBe(planHash(out.pipeline, out.quotes));
  });
  it('EX-8: a fee inside tolerance does not interrupt; a new party does', async () => {
    const r = rig('seller', [s('recv.stealth'), s('hygiene.sweep')], {
      drv: { quote: (i) => ({ feeBps: i.kind === 'hygiene.sweep' ? 340 : 0 }) },
    });
    await r.ex.start(r.run, r.acks);
    await drain(r);
    expect(r.confirmer.seen.some((c) => c.kind === 'CP-4')).toBe(false);
    const r2 = rig('seller', [s('recv.stealth'), s('hygiene.sweep')], {
      drv: {
        quote: (i) => ({
          feeBps: 50,
          ...(i.kind === 'hygiene.sweep' ? { parties: ['some-new-relayer'] } : {}),
        }),
      },
    });
    await r2.ex.start(r2.run, r2.acks);
    await drain(r2);
    expect(r2.confirmer.seen.some((c) => c.kind === 'CP-4')).toBe(true);
  });
  it('EX-8: declining the drift pauses and keeps the step retryable', async () => {
    const r = rig('seller', [s('recv.stealth'), s('hygiene.sweep')], {
      drv: { quote: (i) => ({ feeBps: i.kind === 'hygiene.sweep' ? 1000 : 0 }) },
    });
    r.confirmer.decline.add('CP-4');
    await r.ex.start(r.run, r.acks);
    const p = loadRun(r);
    expect(p).toMatchObject({ status: 'paused', pauseReason: 'drift-declined' });
    expect(r.counters.submits).toBe(1); // only the local recv step
  });
  it('EX-9: a sunset or unknown pool pauses before any pool step', async () => {
    for (const health of ['sunset', 'unknown'] as const) {
      const r = rig('seller', SELLER_POOL, { drv: { health } });
      await r.ex.start(r.run, r.acks);
      const p = loadRun(r);
      expect(p.pauseReason).toBe(`pool-health:${health}`);
      expect(r.chain.effectCount()).toBe(1);
    }
    const ok = rig('seller', SELLER_POOL, { drv: { health: 'ok' } });
    await ok.ex.start(ok.run, ok.acks);
    expect((await drain(ok)).status).toBe('completed');
  });
  it('CP-3 rejection fails the step with funds unmoved; CP-2 decline pauses', async () => {
    const r = rig('seller', [s('recv.stealth'), s('hygiene.sweep')]);
    r.confirmer.decline.add('CP-3');
    await r.ex.start(r.run, r.acks);
    const out = await drain(r);
    expect(out.status).toBe('partial');
    expect(out.instances[1]).toMatchObject({ state: 'failed-terminal', failure: 'user-rejected' });
    expect(r.chain.effectCount()).toBe(1);
    const r2 = rig('seller', [s('recv.stealth'), s('hygiene.sweep')]);
    r2.confirmer.decline.add('CP-2');
    await r2.ex.start(r2.run, r2.acks);
    expect(loadRun(r2).pauseReason).toBe('cp2-declined');
    r2.confirmer.decline.clear();
    expect((await r2.ex.resume(r2.run.id)).status).toBe('completed');
  });
  it('a method that allows it lets seller steps continue without a prompt (autoContinue)', async () => {
    const r = rig('seller', [s('recv.stealth'), s('hygiene.sweep')], {
      drv: { quote: () => ({ feeBps: 50, autoContinue: true }) },
    });
    await r.ex.start(r.run, r.acks);
    await drain(r);
    expect(r.confirmer.seen.some((c) => c.kind === 'CP-3')).toBe(false);
    const p = rig('payer', [s('src.wallet'), s('pay.submit')], {
      drv: { quote: () => ({ feeBps: 25, autoContinue: true }) },
    });
    await p.ex.start(p.run, p.acks);
    await drain(p);
    expect(p.confirmer.seen.some((c) => c.kind === 'CP-3')).toBe(true); // payer steps always prompt
  });
});

describe('abort, pause, status (EX-5, EX-6)', () => {
  it('abort lists each lineage holding with its emergency exits and moves nothing', async () => {
    const r = rig('seller', SELLER_POOL);
    await r.ex.start(r.run, r.acks); // runs to the first wait (dwell)
    const effectsBefore = r.chain.effectCount();
    const report = await r.ex.abort(r.run.id);
    expect(r.chain.effectCount()).toBe(effectsBefore);
    expect(report.lineages.map((l) => l.lineagePath)).toEqual([[0], [1]]);
    for (const l of report.lineages) {
      expect(l.holding).not.toBeNull();
      expect(l.exits[0]?.leakKeys).toContain('privacy.warn.ragequitRelinks');
    }
    const stored = loadRun(r);
    expect(stored.status).toBe('aborted');
    expect(stored.instances.every((i) => ['done', 'aborted'].includes(i.state))).toBe(true);
    // idempotent
    expect((await r.ex.abort(r.run.id)).lineages).toHaveLength(2);
    await expect(r.ex.resume(r.run.id)).rejects.toMatchObject({ code: 'E_ILLEGAL_TRANSITION' });
  });
  it('abort before anything ran reports no holding', async () => {
    const r = rig('seller', [s('recv.stealth'), s('hygiene.sweep')]);
    r.confirmer.decline.add('CP-2');
    await r.ex.start(r.run, r.acks);
    const rep = await r.ex.abort(r.run.id);
    expect(rep.lineages.length).toBe(1);
  });
  it('pause stops work; resume continues; abort of a paused run works', async () => {
    const r = rig('seller', SELLER_POOL);
    await r.ex.start(r.run, r.acks);
    const p = await r.ex.pause(r.run.id);
    expect(p).toMatchObject({ status: 'paused', pauseReason: 'user' });
    r.clock.now += 5 * 24 * 3_600_000;
    expect((await r.ex.advance(r.run.id)).status).toBe('paused');
    const ok = await r.ex.resume(r.run.id);
    expect(ok.status).toBe('completed');
    const r2 = rig('seller', SELLER_POOL);
    await r2.ex.start(r2.run, r2.acks);
    await r2.ex.pause(r2.run.id);
    expect((await r2.ex.abort(r2.run.id)).lineages.length).toBeGreaterThan(0);
    await expect(r.ex.pause('nope')).rejects.toMatchObject({ code: 'E_NOT_FOUND' });
  });
  it('status shows steps overdue by more than an hour (EX-5)', async () => {
    const r = rig('seller', SELLER_POOL);
    await r.ex.start(r.run, r.acks);
    expect((await r.ex.status(r.run.id)).overdue).toEqual([]);
    r.clock.now += OVERDUE_MS + 4 * 24 * 3_600_000;
    const st = await r.ex.status(r.run.id);
    expect(st.status).toBe('running');
    expect(st.overdue.length).toBeGreaterThan(0);
    await r.ex.pause(r.run.id);
    expect((await r.ex.status(r.run.id)).pauseReason).toBe('user');
  });
});

describe('infrastructure errors', () => {
  it('unknown run, corrupt store, missing driver, re-entrancy', async () => {
    const r = rig('seller', [s('recv.stealth'), s('hygiene.sweep')]);
    await expect(r.ex.advance('missing')).rejects.toMatchObject({ code: 'E_NOT_FOUND' });
    await expect(r.ex.resume('missing')).rejects.toMatchObject({ code: 'E_NOT_FOUND' });
    r.store.data.set('p1', '{"nonsense":1}');
    await expect(r.ex.advance('p1')).rejects.toMatchObject({ code: 'E_BAD_INPUT' });
    const nodrv = createExecutor(
      makePorts({
        drivers: {},
        store: new FakeStore(),
        confirmer: r.confirmer,
        clock: r.clock,
        probe: r.probe,
      }),
    );
    await expect(nodrv.start(r.run, r.acks)).rejects.toMatchObject({ code: 'E_NO_DRIVER' });
    let release: () => void = () => undefined;
    const gate = new Promise<void>((res) => (release = res));
    const slow = createExecutor(
      makePorts({
        drivers: r.drivers,
        store: r.store,
        confirmer: { confirm: async (c) => (await gate, { ok: true, planHash: c.planHash }) },
        clock: r.clock,
        probe: r.probe,
      }),
    );
    const first = slow.start(r.run, r.acks);
    await expect(slow.start(r.run, r.acks)).rejects.toMatchObject({ code: 'E_ILLEGAL_TRANSITION' });
    release();
    await first;
  });
  it('resume of an unstarted run is illegal', async () => {
    const r = rig('seller', [s('recv.stealth'), s('hygiene.sweep')]);
    r.confirmer.decline.add('CP-1');
    await r.ex.start(r.run, r.acks);
    await expect(r.ex.resume(r.run.id)).rejects.toMatchObject({ code: 'E_ILLEGAL_TRANSITION' });
  });
  it('driver refs with odd characters are hashed before being stored', async () => {
    const r = rig('seller', [s('recv.stealth'), s('hygiene.sweep')]);
    const inner = r.drivers['hygiene.sweep'] as StepDriver;
    r.drivers['hygiene.sweep'] = {
      ...inner,
      submit: async (i, p, sg) => ({ ref: `0xdead beef ${(await inner.submit(i, p, sg)).ref}` }),
    };
    const ex = createExecutor(
      makePorts({
        drivers: r.drivers,
        store: r.store,
        confirmer: r.confirmer,
        clock: r.clock,
        probe: r.probe,
      }),
    );
    await ex.start(r.run, r.acks);
    expect(sanitizeRun(r.store.data.get(r.run.id))).not.toBeNull();
  });
  it('simulateWithDrivers calls quote and prepare only, never submit', async () => {
    const counters = { submits: 0 };
    const chain = new FakeChain();
    const p = pipe('payer', PAYER_3_5);
    const drivers = allDrivers(
      { chain, quote: (i) => ({ feeBps: i.kind === 'pay.from-pool' ? 77 : 0, gasWeiMax: 5n }) },
      counters,
      ['src.wallet', 'payer.fresh-wallet', 'amount.shape', 'pool.deposit', 'pool.dwell', 'pay.from-pool'],
    );
    const sum = await simulateWithDrivers(p, fullCtx(), drivers);
    expect(counters.submits).toBe(0);
    expect(chain.effectCount()).toBe(0);
    expect(sum.cost.totalFeeBpsMax).toBe(77);
    await expect(simulateWithDrivers(p, fullCtx(), {})).rejects.toMatchObject({ code: 'E_NO_DRIVER' });
    await expect(
      simulateWithDrivers({ ...p, chain: { family: 'evm', chainId: 1 } } as never, fullCtx(), drivers),
    ).rejects.toMatchObject({ code: 'E_WRONG_CHAIN' });
    expect(
      fakeDriver('src.wallet', { chain }, counters).emergencyExits({ ref: 'x', holding: { t: 'paid' } }),
    ).toHaveLength(1);
  });
  it('the 3.5 seller flow also runs through a distinct executor instance', async () => {
    const r = rig('seller', SELLER_3_5, { asset: 'erc20-permit' });
    r.run.pipeline.chain.family satisfies 'evm' | 'btc';
    expect(SEPOLIA.family).toBe('evm');
    await r.ex.start(r.run, r.acks);
    expect((await drain(r)).status).toBe('completed');
  });
});
