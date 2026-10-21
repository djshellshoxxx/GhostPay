import { prepareSteps } from './analyze.js';
import { PipelineError } from './errors.js';
import { assertTestnetChain } from './guard.js';
import { sha256Hex, type Hex } from './hash.js';
import { usedPurposes } from './layers.js';
import {
  IN_FLIGHT,
  TERMINAL_STEP,
  reducePipeline,
  reduceStep,
  type PipelineRun,
  type RunEvent,
  type RunStatus,
  type StepEvent,
  type StepInstance,
  type StepState,
} from './machine.js';
import { expand, planHash } from './plan.js';
import type {
  Checkpoint,
  CheckpointKind,
  Clock,
  CapabilityProbe,
  Confirmer,
  DelayPort,
  EmergencyExit,
  HoldingRef,
  PipelineStore,
  SignPort,
  StepDriver,
  StepInstanceView,
  StepQuote,
} from './ports.js';
import { sanitizeRun, serializeRun } from './serialize.js';
import { simulate } from './summary.js';
import { STEP_CATALOGUE } from './steps.js';
import type {
  Context,
  Env,
  Pipeline,
  PipelineSummary,
  PlanNode,
  Purpose,
  QuoteEntry,
  QuoteMap,
  StepKind,
} from './types.js';
import { validate } from './validate.js';

/** Default re-quote tolerance in bps (EX-8). */
export const DEFAULT_REQUOTE_TOLERANCE_BPS = 50;
/** A waiting step overdue by more than this is shown as overdue (EX-5). */
export const OVERDUE_MS = 3_600_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const REF_RE = /^[A-Za-z0-9:_./-]{1,128}$/;

export interface ExecutorPorts {
  readonly drivers: Readonly<Partial<Record<StepKind, StepDriver>>>;
  readonly store: PipelineStore;
  readonly confirmer: Confirmer;
  readonly clock: Clock;
  readonly probe: CapabilityProbe;
  readonly sign: SignPort;
  readonly delay: DelayPort;
  readonly env: Env;
  readonly testMode: boolean;
  readonly requoteToleranceBps?: number;
  readonly maxAttempts?: number;
}

export type ExecEvent =
  | {
      readonly type: 'step';
      readonly runId: string;
      readonly instanceId: string;
      readonly from: StepState;
      readonly to: StepState;
    }
  | { readonly type: 'run'; readonly runId: string; readonly status: RunStatus; readonly reason?: string };

export interface AbortReport {
  readonly runId: string;
  /** Current holding per lineage and its emergency exits. Nothing is moved; the user picks (EX-6). */
  readonly lineages: readonly {
    readonly lineagePath: readonly number[];
    readonly holding: HoldingRef | null;
    readonly exits: readonly EmergencyExit[];
  }[];
}

export interface RunStatusReport {
  readonly status: RunStatus;
  readonly pauseReason?: string;
  /** Instances waiting or due more than {@link OVERDUE_MS} past their due time. */
  readonly overdue: readonly string[];
}

export interface Executor {
  /** Confirms (CP-1), checks acks and self-tests, then runs until blocked. Returns the run as persisted. */
  start(run: PipelineRun, acks: ReadonlySet<string>): Promise<PipelineRun>;
  /** Self-tests, reconciles every in-flight instance, then continues (EX-3, EX-5, L-1). */
  resume(id: string): Promise<PipelineRun>;
  /** Processes due work until blocked. */
  advance(id: string): Promise<PipelineRun>;
  pause(id: string): Promise<PipelineRun>;
  abort(id: string): Promise<AbortReport>;
  status(id: string): Promise<RunStatusReport>;
  onEvent(listener: (e: ExecEvent) => void): () => void;
}

/**
 * Builds a run from a validated pipeline. Refuses any pipeline that is not `ok` (PL-3).
 *
 * @security Testnet guard through `validate`/`expand`. Does not add acks (PL-4).
 */
export function createRun(pipeline: Pipeline, ctx: Context, quotes: QuoteMap = {}): PipelineRun {
  assertTestnetChain(pipeline.chain);
  const v = validate(pipeline, ctx);
  if (!v.ok) throw new PipelineError('E_NOT_VALID');
  const tree = expand(pipeline);
  return {
    v: 1,
    id: pipeline.id,
    status: 'validated',
    planHash: planHash(pipeline, quotes),
    pipeline,
    quotes,
    cp2Done: false,
    instances: tree.nodes.map((n) => ({
      instanceId: n.instanceId,
      stepIndex: n.stepIndex,
      kind: n.kind,
      lineagePath: n.lineagePath,
      state: 'planned',
      attempts: 0,
    })),
  };
}

/**
 * Dry run through drivers: calls `quote` and `prepare` only (never `submit`), then summarises with the
 * quoted fees. For tests and anvil rehearsals.
 */
export async function simulateWithDrivers(
  p: Pipeline,
  ctx: Context,
  drivers: Readonly<Partial<Record<StepKind, StepDriver>>>,
): Promise<PipelineSummary> {
  assertTestnetChain(p.chain);
  const tree = expand(p);
  const quotes: Record<string, QuoteEntry> = {};
  for (const n of tree.nodes) {
    const d = drivers[n.kind];
    if (d === undefined) throw new PipelineError('E_NO_DRIVER', n.kind);
    const ref: HoldingRef | null =
      n.inHolding === null ? null : { ref: `sim:${n.instanceId.slice(2, 18)}`, holding: n.inHolding };
    const view: StepInstanceView = {
      instanceId: n.instanceId,
      kind: n.kind,
      stepIndex: n.stepIndex,
      lineagePath: n.lineagePath,
      params: n.params,
      intentKey: undefined,
      attempts: 0,
    };
    const q = await d.quote(view, ref);
    await d.prepare(view, ref, q);
    quotes[n.instanceId] = {
      feeBps: q.feeBps,
      ...(q.gasWeiMax === undefined ? {} : { gasWeiMax: q.gasWeiMax }),
    };
  }
  return simulate(p, ctx, quotes);
}

interface Handle {
  run: PipelineRun;
  nodes: Map<string, PlanNode>;
}

const PRE_SIGNING: readonly StepState[] = [
  'planned',
  'ready',
  'awaiting-confirm',
  'waiting',
  'due',
  'preparing',
  'failed-retryable',
];

/** Creates the executor. All side effects go through `ports`; the package itself does no I/O. */
export function createExecutor(ports: ExecutorPorts): Executor {
  const listeners = new Set<(e: ExecEvent) => void>();
  const busy = new Set<string>();
  const tolerance = ports.requoteToleranceBps ?? DEFAULT_REQUOTE_TOLERANCE_BPS;
  const maxAttempts = ports.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

  const emit = (e: ExecEvent): void => {
    for (const l of listeners) l(e);
  };
  const save = (r: PipelineRun): Promise<void> => ports.store.save({ id: r.id, body: serializeRun(r) });

  async function load(id: string): Promise<Handle> {
    const sealed = await ports.store.load(id);
    if (sealed === null) throw new PipelineError('E_NOT_FOUND');
    const run = sanitizeRun(sealed.body);
    if (run === null || run.id !== id) throw new PipelineError('E_BAD_INPUT', 'stored run');
    assertTestnetChain(run.pipeline.chain);
    return { run, nodes: new Map(expand(run.pipeline).nodes.map((n) => [n.instanceId, n])) };
  }

  async function step(h: Handle, id: string, ev: StepEvent): Promise<StepInstance> {
    const i = h.run.instances.find((x) => x.instanceId === id) as StepInstance;
    const next = reduceStep(i, ev);
    h.run = { ...h.run, instances: h.run.instances.map((x) => (x.instanceId === id ? next : x)) };
    await save(h.run);
    emit({ type: 'step', runId: h.run.id, instanceId: id, from: i.state, to: next.state });
    return next;
  }

  async function runEv(h: Handle, ev: RunEvent): Promise<void> {
    h.run = reducePipeline(h.run, ev);
    await save(h.run);
    emit({
      type: 'run',
      runId: h.run.id,
      status: h.run.status,
      ...('reason' in ev ? { reason: ev.reason } : {}),
    });
  }

  const cur = (h: Handle, id: string): StepInstance =>
    h.run.instances.find((x) => x.instanceId === id) as StepInstance;
  const node = (h: Handle, id: string): PlanNode => h.nodes.get(id) as PlanNode;
  const driverOf = (kind: StepKind): StepDriver => {
    const d = ports.drivers[kind];
    if (d === undefined) throw new PipelineError('E_NO_DRIVER', kind);
    return d;
  };
  const view = (n: PlanNode, i: StepInstance): StepInstanceView => ({
    instanceId: n.instanceId,
    kind: n.kind,
    stepIndex: n.stepIndex,
    lineagePath: n.lineagePath,
    params: n.params,
    intentKey: i.intentKey,
    attempts: i.attempts,
  });
  const confirm = async (
    h: Handle,
    kind: CheckpointKind,
    keys: readonly string[],
    instanceId?: string,
    hash: Hex = h.run.planHash,
  ): Promise<boolean> => {
    const c: Checkpoint = {
      kind,
      runId: h.run.id,
      planHash: hash,
      keys,
      ...(instanceId === undefined ? {} : { instanceId }),
    };
    const r = await ports.confirmer.confirm(c);
    return r.ok && r.planHash === hash;
  };
  const inputRef = (h: Handle, n: PlanNode): HoldingRef | null => {
    if (n.after === null) return null;
    const parent = node(h, n.after);
    const outs = cur(h, n.after).outputs ?? [];
    const idx = parent.fan > 1 ? (n.lineagePath[n.lineagePath.length - 1] as number) : 0;
    return outs[idx] ?? null;
  };
  const pause = (h: Handle, reason: string): Promise<void> =>
    runEv(h, { type: 'pause', reason: reason.replace(/[^A-Za-z0-9:_.-]/g, '_').slice(0, 64) });

  async function selfTests(
    h: Handle,
    extra: boolean,
  ): Promise<{ ctxSelf: Set<Purpose>; failed: Purpose | null }> {
    const used = new Set(usedPurposes(prepareSteps(h.run.pipeline.steps).steps).keys());
    const t = h.run.pipeline.layers.transport;
    if (extra && t['read-address'] !== undefined) used.add('read-address');
    const ok = new Set<Purpose>();
    let failed: Purpose | null = null;
    for (const p of [...used].sort()) {
      const profile = t[p] ?? 'direct';
      if (profile === 'direct' || (await ports.probe.selfTest(p))) ok.add(p);
      else failed ??= p;
    }
    return { ctxSelf: ok, failed };
  }

  async function settle(h: Handle, id: string): Promise<void> {
    for (let guard = 0; guard < 8; guard++) {
      const i = cur(h, id);
      const n = node(h, id);
      if (i.state === 'signing' || i.state === 'submitted') {
        await step(h, id, { type: 'crash' });
      } else if (i.state === 'reconciling') {
        const r = await driverOf(n.kind).reconcile(view(n, i));
        await step(h, id, { type: 'reconciled', result: r });
        if (r === 'pending') return;
      } else if (i.state === 'confirmed') {
        await finishOutputs(h, id);
      } else if (i.state === 'preparing') {
        await step(h, id, { type: 'restart' });
      } else {
        return;
      }
    }
  }

  async function finishOutputs(h: Handle, id: string): Promise<void> {
    const n = node(h, id);
    const outs = await driverOf(n.kind).outputs(view(n, cur(h, id)));
    if (outs.length !== n.fan || outs.some((o) => !REF_RE.test(o.ref)))
      await step(h, id, { type: 'terminal', reason: 'outputs-mismatch' });
    else await step(h, id, { type: 'outputs', outputs: outs });
  }

  /** Quote, prepare, confirm, persist intent, submit. Returns false when the run must stop (paused). */
  async function doDue(h: Handle, id: string): Promise<boolean> {
    const n = node(h, id);
    const def = STEP_CATALOGUE[n.kind];
    const drv = driverOf(n.kind);
    if (drv.health !== undefined) {
      const hs = await drv.health();
      if (hs === 'sunset' || hs === 'unknown') {
        await pause(h, `pool-health:${hs}`);
        return false;
      }
    }
    await step(h, id, { type: 'prepare' });
    const inRef = inputRef(h, n);
    let q: StepQuote;
    try {
      q = await drv.quote(view(n, cur(h, id)), inRef);
    } catch {
      await step(h, id, { type: 'retryable', reason: 'quote-failed' });
      return true;
    }
    const planned = h.run.quotes[id]?.feeBps ?? def.fee(n.params).maxBps;
    const trust = def.trust(n.params);
    const drift =
      q.feeBps > planned + tolerance ||
      (q.parties !== undefined && q.parties.some((p) => !trust.includes(p)));
    if (drift) {
      const quotes: QuoteMap = { ...h.run.quotes, [id]: { feeBps: q.feeBps, gasWeiMax: q.gasWeiMax ?? 0n } };
      const hash = planHash(h.run.pipeline, quotes);
      if (await confirm(h, 'CP-4', ['privacy.warn.chain.quoteDrift'], id, hash)) {
        h.run = { ...h.run, quotes, planHash: hash };
      } else {
        await step(h, id, { type: 'retryable', reason: 'drift-declined' });
        await pause(h, 'drift-declined');
        return false;
      }
    }
    let prepared;
    try {
      prepared = await drv.prepare(view(n, cur(h, id)), inRef, q);
    } catch {
      await step(h, id, { type: 'retryable', reason: 'prepare-failed' });
      return true;
    }
    const auto = q.autoContinue === true && h.run.pipeline.role === 'seller';
    if (def.onChain && !auto && !(await confirm(h, 'CP-3', def.doesNotHide(n.params), id))) {
      await step(h, id, { type: 'terminal', reason: 'user-rejected' });
      return true;
    }
    const intentKey = sha256Hex(`${id}:${prepared.methodIndex ?? 0}`);
    await step(h, id, { type: 'sign', intentKey }); // EX-1: persisted before the sign port is reachable
    const v2 = view(n, cur(h, id));
    let ref: string;
    try {
      ref = (await drv.submit(v2, prepared, ports.sign)).ref;
    } catch {
      await step(h, id, { type: 'crash' });
      const r = await drv.reconcile(v2);
      await step(h, id, { type: 'reconciled', result: r });
      if (r === 'not-started') {
        // nothing happened: back off through the retry path instead of looping on a failing driver
        await step(h, id, { type: 'prepare' });
        await step(h, id, { type: 'retryable', reason: 'submit-failed' });
      }
      return true;
    }
    await step(h, id, { type: 'submitted', ref: REF_RE.test(ref) ? ref : sha256Hex(ref) });
    return true;
  }

  /** Processes one instance. `progressed=false` means it is waiting on time or chain. `stop` pauses the loop. */
  async function process(h: Handle, id: string): Promise<{ progressed: boolean; stop: boolean }> {
    const i = cur(h, id);
    const n = node(h, id);
    const def = STEP_CATALOGUE[n.kind];
    switch (i.state) {
      case 'planned':
        await step(h, id, { type: 'ready' });
        return { progressed: true, stop: false };
      case 'ready': {
        if (def.onChain && !h.run.cp2Done) {
          await step(h, id, { type: 'need-confirm' });
          return { progressed: true, stop: false };
        }
        const w =
          n.kind === 'pay.submit' &&
          n.lineagePath.length > 0 &&
          (n.lineagePath[n.lineagePath.length - 1] as number) === 0
            ? { minMs: 0, maxMs: 0 }
            : def.fanMode === 'per-part'
              ? def.wait(n.params, 2)
              : def.wait(n.params, n.fan);
        if (w.maxMs > 0) {
          const d = Math.min(w.maxMs, Math.max(w.minMs, Math.round(ports.delay.draw(w.minMs, w.maxMs))));
          await step(h, id, { type: 'wait', dueAtMs: ports.clock.nowMs() + d, waitedMs: d });
        } else {
          await step(h, id, { type: 'due' });
        }
        return { progressed: true, stop: false };
      }
      case 'awaiting-confirm':
        if (
          await confirm(
            h,
            'CP-2',
            ['privacy.warn.chain.publicIrreversible', ...def.doesNotHide(n.params)],
            id,
          )
        ) {
          h.run = { ...h.run, cp2Done: true };
          await step(h, id, { type: 'checkpoint-ok' });
          return { progressed: true, stop: false };
        }
        await pause(h, 'cp2-declined');
        return { progressed: false, stop: true };
      case 'waiting':
        if (ports.clock.nowMs() >= (i.dueAtMs as number)) {
          await step(h, id, { type: 'due' });
          return { progressed: true, stop: false };
        }
        return { progressed: false, stop: false };
      case 'due':
        return { progressed: true, stop: !(await doDue(h, id)) };
      case 'preparing':
      case 'signing':
      case 'reconciling':
      case 'confirmed': {
        await settle(h, id);
        return { progressed: true, stop: false };
      }
      case 'submitted': {
        const r = await driverOf(n.kind).reconcile(view(n, i));
        if (r === 'pending') return { progressed: false, stop: false };
        if (r === 'done') await step(h, id, { type: 'chain-confirmed' });
        else if (r === 'failed') await step(h, id, { type: 'terminal', reason: 'chain-failed' });
        else {
          await step(h, id, { type: 'crash' });
          await step(h, id, { type: 'reconciled', result: 'not-started' });
        }
        return { progressed: true, stop: false };
      }
      case 'failed-retryable':
        if (i.attempts + 1 >= maxAttempts) {
          await step(h, id, { type: 'terminal', reason: 'retries-exhausted' });
          return { progressed: true, stop: false };
        }
        await pause(h, `retryable:${i.failure ?? 'failed'}`);
        return { progressed: false, stop: true };
      default:
        return { progressed: false, stop: false };
    }
  }

  async function loop(h: Handle): Promise<void> {
    const blocked = new Set<string>();
    const budget = 100 + 50 * h.run.instances.length;
    for (let turn = 0; ; turn++) {
      if (h.run.status !== 'running') return;
      if (turn > budget) {
        await pause(h, 'loop-guard'); // a misbehaving driver must not spin the app
        return;
      }
      let target: StepInstance | undefined;
      let skip = false;
      for (const i of h.run.instances) {
        if (TERMINAL_STEP.includes(i.state) || blocked.has(i.instanceId)) continue;
        const after = node(h, i.instanceId).after;
        const dep = after === null ? null : cur(h, after);
        if (dep !== null && dep.state !== 'done') {
          if (TERMINAL_STEP.includes(dep.state) && PRE_SIGNING.includes(i.state)) {
            target = i;
            skip = true;
            break;
          }
          continue;
        }
        target = i;
        break;
      }
      if (target === undefined) {
        if (h.run.instances.every((i) => TERMINAL_STEP.includes(i.state))) {
          await runEv(h, {
            type: h.run.instances.some((i) => i.state === 'failed-terminal') ? 'partial' : 'complete',
          });
        }
        return;
      }
      if (skip) {
        await step(h, target.instanceId, { type: 'skip' }); // EX-7: a failed lineage stops; descendants are skipped
        blocked.clear();
        continue;
      }
      const r = await process(h, target.instanceId);
      if (r.stop) return;
      if (r.progressed) blocked.clear();
      else blocked.add(target.instanceId);
    }
  }

  async function locked<T>(id: string, fn: () => Promise<T>): Promise<T> {
    if (busy.has(id)) throw new PipelineError('E_ILLEGAL_TRANSITION', 'busy');
    busy.add(id);
    try {
      return await fn();
    } finally {
      busy.delete(id);
    }
  }

  async function reconcileAll(h: Handle): Promise<void> {
    for (const i of [...h.run.instances]) {
      if (IN_FLIGHT.includes(i.state) || i.state === 'preparing' || i.state === 'confirmed')
        await settle(h, i.instanceId);
    }
  }

  const executor: Executor = {
    async start(run, acks) {
      return locked(run.id, async () => {
        assertTestnetChain(run.pipeline.chain);
        if (run.status !== 'validated' && run.status !== 'confirmed')
          throw new PipelineError('E_ILLEGAL_TRANSITION', `run:${run.status}+start`);
        const h: Handle = { run, nodes: new Map(expand(run.pipeline).nodes.map((n) => [n.instanceId, n])) };
        const caps = await ports.probe.capabilities();
        const st = await selfTests(h, false);
        const ctx: Context = {
          env: ports.env,
          testMode: ports.testMode,
          capabilities: caps,
          selfTests: st.ctxSelf,
        };
        const v = validate(run.pipeline, ctx);
        if (v.blocking.some((b) => b.code !== 'E_SELFTEST')) throw new PipelineError('E_NOT_VALID');
        if (!v.requiredAcks.every((a) => acks.has(a))) throw new PipelineError('E_ACK_MISSING');
        if (planHash(run.pipeline, run.quotes) !== run.planHash) throw new PipelineError('E_PLAN_HASH');
        await save(h.run);
        if (h.run.status === 'validated') {
          if (!(await confirm(h, 'CP-1', [...v.requiredAcks, ...v.warnings.map((w) => w.key)]))) return h.run;
          await runEv(h, { type: 'confirm', planHash: h.run.planHash });
        }
        await runEv(h, { type: 'start' });
        if (st.failed !== null) {
          await pause(h, `selftest-failed:${st.failed}`);
          return h.run;
        }
        await loop(h);
        return h.run;
      });
    },

    async resume(id) {
      return locked(id, async () => {
        const h = await load(id);
        if (h.run.status !== 'running' && h.run.status !== 'paused')
          throw new PipelineError('E_ILLEGAL_TRANSITION', `run:${h.run.status}+resume`);
        const hasInflight = h.run.instances.some((i) => IN_FLIGHT.includes(i.state));
        const st = await selfTests(h, hasInflight);
        if (st.failed !== null) {
          // L-1: never fall back to direct; stay paused
          if (h.run.status === 'running') await pause(h, `selftest-failed:${st.failed}`);
          return h.run;
        }
        if (
          hasInflight &&
          h.run.pipeline.layers.verification === 'direct' &&
          !(await confirm(h, 'CP-5', ['privacy.warn.directReadsRevealAddress']))
        ) {
          if (h.run.status === 'running') await pause(h, 'direct-read-declined');
          return h.run;
        }
        await reconcileAll(h); // EX-3: reconcile before anything else
        for (const i of [...h.run.instances]) {
          if (i.state === 'failed-retryable') {
            if (i.attempts + 1 >= maxAttempts)
              await step(h, i.instanceId, { type: 'terminal', reason: 'retries-exhausted' });
            else await step(h, i.instanceId, { type: 'retry' });
          }
        }
        if (h.run.status === 'paused') await runEv(h, { type: 'resume' });
        await loop(h);
        return h.run;
      });
    },

    async advance(id) {
      return locked(id, async () => {
        const h = await load(id);
        await loop(h);
        return h.run;
      });
    },

    async pause(id) {
      return locked(id, async () => {
        const h = await load(id);
        await pause(h, 'user');
        return h.run;
      });
    },

    async abort(id) {
      return locked(id, async () => {
        const h = await load(id);
        if (h.run.status !== 'aborted') {
          await reconcileAll(h);
          if (h.run.instances.some((i) => IN_FLIGHT.includes(i.state)))
            throw new PipelineError('E_ABORT_IN_FLIGHT');
          if (h.run.status !== 'aborting') await runEv(h, { type: 'abort-request' });
          for (const i of [...h.run.instances])
            if (PRE_SIGNING.includes(i.state)) await step(h, i.instanceId, { type: 'abort' });
          await runEv(h, { type: 'aborted' });
        }
        const lineages: {
          lineagePath: readonly number[];
          holding: HoldingRef | null;
          exits: readonly EmergencyExit[];
        }[] = [];
        for (const i of h.run.instances) {
          if (i.state !== 'done') continue;
          const n = node(h, i.instanceId);
          const childDone = h.run.instances.some(
            (c) => node(h, c.instanceId).after === i.instanceId && c.state === 'done',
          );
          if (childDone) continue;
          (i.outputs ?? []).forEach((o, j) => {
            lineages.push({
              lineagePath: n.fan > 1 ? [...n.lineagePath, j] : n.lineagePath,
              holding: o,
              exits: driverOf(n.kind).emergencyExits(o),
            });
          });
        }
        if (lineages.length === 0) lineages.push({ lineagePath: [], holding: null, exits: [] });
        lineages.sort((a, b) => a.lineagePath.join('.').localeCompare(b.lineagePath.join('.')));
        return { runId: id, lineages };
      });
    },

    async status(id) {
      const h = await load(id);
      const now = ports.clock.nowMs();
      const overdue = h.run.instances
        .filter(
          (i) =>
            (i.state === 'waiting' || i.state === 'due') &&
            i.dueAtMs !== undefined &&
            now > i.dueAtMs + OVERDUE_MS,
        )
        .map((i) => i.instanceId);
      return {
        status: h.run.status,
        ...(h.run.pauseReason === undefined ? {} : { pauseReason: h.run.pauseReason }),
        overdue,
      };
    },

    onEvent(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return executor;
}
