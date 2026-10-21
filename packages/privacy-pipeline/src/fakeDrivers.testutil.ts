import { sha256Hex } from './hash.js';
import type { Hex } from './hash.js';
import type { Holding, StepKind } from './types.js';
import { STEP_CATALOGUE } from './steps.js';
import type {
  Checkpoint,
  Clock,
  CapabilityProbe,
  Confirmer,
  DelayPort,
  HoldingRef,
  PipelineStore,
  Prepared,
  ReconcileResult,
  SealedRun,
  SignPort,
  StepDriver,
  StepInstanceView,
  StepQuote,
} from './ports.js';
import type { ExecutorPorts } from './executor.js';
import type { Purpose } from './types.js';

/** Thrown by fakes after the simulated process died. */
export class Crash extends Error {
  public constructor() {
    super('simulated crash');
  }
}

/** In-memory "chain": records effects per intent key. */
export class FakeChain {
  public readonly effects = new Map<string, number>();
  public readonly status = new Map<string, 'pending' | 'done' | 'failed'>();
  /** Instances matching this predicate end in a failed chain status. */
  public failOn: (i: StepInstanceView) => boolean = () => false;
  public autoConfirm = true;
  public effectCount(): number {
    let n = 0;
    for (const v of this.effects.values()) n += v;
    return n;
  }
}

/** Store that can "die": after `dieAt` successful saves (or before the next one), saves throw and are dropped. */
export class FakeStore implements PipelineStore {
  public data = new Map<string, string>();
  public saves = 0;
  public dead = false;
  /** Die just before the save with this ordinal (1-based). */
  public dieBefore: number | null = null;
  /** Die just after the save with this ordinal (1-based). */
  public dieAfter: number | null = null;
  public load(id: string): Promise<SealedRun | null> {
    const body = this.data.get(id);
    return Promise.resolve(body === undefined ? null : { id, body });
  }
  public save(r: SealedRun): Promise<void> {
    if (this.dead) return Promise.reject(new Crash());
    this.saves += 1;
    if (this.dieBefore === this.saves) {
      this.dead = true;
      return Promise.reject(new Crash());
    }
    this.data.set(r.id, r.body);
    if (this.dieAfter === this.saves) {
      this.dead = true;
      return Promise.reject(new Crash());
    }
    return Promise.resolve();
  }
  /** A fresh store view of the same persisted data (what a restarted process sees). */
  public revive(): FakeStore {
    const s = new FakeStore();
    s.data = new Map(this.data);
    return s;
  }
}

export class FakeClock implements Clock {
  public constructor(public now = 1_000_000) {}
  public nowMs(): number {
    return this.now;
  }
}

export class FixedDelay implements DelayPort {
  public draw(minMs: number, maxMs: number): number {
    return Math.min(minMs, maxMs);
  }
}

export class FakeConfirmer implements Confirmer {
  public readonly seen: Checkpoint[] = [];
  public decline: Set<string> = new Set();
  public confirm(c: Checkpoint): Promise<{ ok: boolean; planHash: Hex }> {
    this.seen.push(c);
    return Promise.resolve({ ok: !this.decline.has(c.kind), planHash: c.planHash });
  }
}

export class FakeProbe implements CapabilityProbe {
  public caps = new Set<string>();
  public failing = new Set<Purpose>();
  public tested: Purpose[] = [];
  public capabilities(): Promise<ReadonlySet<string>> {
    return Promise.resolve(this.caps);
  }
  public selfTest(p: Purpose): Promise<boolean> {
    this.tested.push(p);
    return Promise.resolve(!this.failing.has(p));
  }
}

export const fakeSign: SignPort = { sign: (d) => Promise.resolve(`sig:${d}`) };

export interface FakeDriverOptions {
  chain: FakeChain;
  store?: FakeStore;
  /** Throw (process death) after the effect is recorded but before the executor persists `submitted`. */
  crashAfterEffectAt?: number;
  /** Die before the effect is recorded. */
  crashBeforeEffectAt?: number;
  quote?: (i: StepInstanceView) => StepQuote;
  health?: 'ok' | 'sunset' | 'unknown';
  failQuoteTimes?: number;
  failSubmitTimes?: number;
  /** Chain status stays pending this many reconcile polls. */
  pendingPolls?: number;
  mismatchOutputs?: boolean;
}

export interface Counters {
  submits: number;
}

/** Deterministic driver for any step kind. Outputs are derived from the instance id. */
export function fakeDriver(kind: StepKind, o: FakeDriverOptions, counters: Counters): StepDriver {
  const keyOf = (i: StepInstanceView): string => i.intentKey ?? i.instanceId;
  const driver: StepDriver = {
    kind,
    ...(o.health === undefined || !(kind.startsWith('pool.') || kind === 'pay.from-pool')
      ? {}
      : { health: () => Promise.resolve(o.health as 'ok') }),
    quote(i) {
      if ((o.failQuoteTimes ?? 0) > 0) {
        o.failQuoteTimes = (o.failQuoteTimes as number) - 1;
        return Promise.reject(new Error('quote down'));
      }
      return Promise.resolve(o.quote?.(i) ?? { feeBps: STEP_CATALOGUE[kind].fee(i.params).maxBps });
    },
    prepare(i): Promise<Prepared> {
      return Promise.resolve({ digest: `digest:${i.instanceId.slice(2, 12)}` });
    },
    submit(i) {
      counters.submits += 1;
      if (o.store?.dead === true) return Promise.reject(new Crash());
      if ((o.failSubmitTimes ?? 0) > 0) {
        o.failSubmitTimes = (o.failSubmitTimes as number) - 1;
        return Promise.reject(new Error('relayer down'));
      }
      const k = keyOf(i);
      if (o.crashBeforeEffectAt === counters.submits) {
        if (o.store !== undefined) o.store.dead = true;
        return Promise.reject(new Crash());
      }
      o.chain.effects.set(k, (o.chain.effects.get(k) ?? 0) + 1);
      o.chain.status.set(k, o.chain.failOn(i) ? 'failed' : o.chain.autoConfirm ? 'done' : 'pending');
      if (o.crashAfterEffectAt === counters.submits) {
        if (o.store !== undefined) o.store.dead = true;
        return Promise.reject(new Crash());
      }
      return Promise.resolve({ ref: `tx:${k.slice(2, 14)}` });
    },
    reconcile(i): Promise<ReconcileResult> {
      const k = i.intentKey;
      if (k === undefined || !o.chain.status.has(k)) return Promise.resolve('not-started');
      if ((o.pendingPolls ?? 0) > 0) {
        o.pendingPolls = (o.pendingPolls as number) - 1;
        return Promise.resolve('pending');
      }
      const st = o.chain.status.get(k);
      return Promise.resolve(st === 'done' ? 'done' : st === 'failed' ? 'failed' : 'pending');
    },
    outputs(i): Promise<readonly HoldingRef[]> {
      const def = STEP_CATALOGUE[kind];
      const fan =
        o.mismatchOutputs === true
          ? 99
          : def.fanMode === 'outputs'
            ? Number(i.params['n'] ?? i.params['partials'] ?? 1)
            : 1;
      const h: Holding = { t: 'paid' };
      return Promise.resolve(
        Array.from({ length: fan }, (_v, j) => ({
          ref: `out:${sha256Hex(`${i.instanceId}:${j}`).slice(2, 14)}`,
          holding: h,
        })),
      );
    },
    emergencyExits(h) {
      return [{ id: `exit:${h.ref}`, leakKeys: ['privacy.warn.ragequitRelinks'] }];
    },
  };
  return driver;
}

export function allDrivers(
  o: FakeDriverOptions,
  counters: Counters,
  kinds: readonly StepKind[],
): Partial<Record<StepKind, StepDriver>> {
  const out: Partial<Record<StepKind, StepDriver>> = {};
  for (const k of kinds) out[k] = fakeDriver(k, o, counters);
  return out;
}

export function makePorts(
  over: Partial<ExecutorPorts> & Pick<ExecutorPorts, 'drivers' | 'store'>,
): ExecutorPorts {
  return {
    confirmer: new FakeConfirmer(),
    clock: new FakeClock(),
    probe: new FakeProbe(),
    sign: fakeSign,
    delay: new FixedDelay(),
    env: 'node',
    testMode: false,
    ...over,
  };
}
