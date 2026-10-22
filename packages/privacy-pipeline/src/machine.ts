import { PipelineError } from './errors.js';
import type { Hex } from './hash.js';
import type { HoldingRef, ReconcileResult } from './ports.js';
import type { Pipeline, QuoteMap, StepKind } from './types.js';

export type StepState =
  | 'planned'
  | 'ready'
  | 'awaiting-confirm'
  | 'waiting'
  | 'due'
  | 'preparing'
  | 'signing'
  | 'submitted'
  | 'confirmed'
  | 'done'
  | 'reconciling'
  | 'failed-retryable'
  | 'failed-terminal'
  | 'skipped'
  | 'aborted';

export const STEP_STATES: readonly StepState[] = [
  'planned',
  'ready',
  'awaiting-confirm',
  'waiting',
  'due',
  'preparing',
  'signing',
  'submitted',
  'confirmed',
  'done',
  'reconciling',
  'failed-retryable',
  'failed-terminal',
  'skipped',
  'aborted',
];
/** States in which a signature may exist or a side effect may have happened. */
export const IN_FLIGHT: readonly StepState[] = ['signing', 'submitted', 'reconciling'];
export const TERMINAL_STEP: readonly StepState[] = ['done', 'failed-terminal', 'skipped', 'aborted'];

/** One executable step instance. Holds references and state only: no signatures, no secrets (EX-2). */
export interface StepInstance {
  readonly instanceId: string;
  readonly stepIndex: number;
  readonly kind: StepKind;
  readonly lineagePath: readonly number[];
  readonly state: StepState;
  readonly intentKey?: string;
  readonly dueAtMs?: number;
  /** Realised delay in ms; recorded, never re-drawn (EX-5). */
  readonly waitedMs?: number;
  readonly ref?: string;
  readonly attempts: number;
  readonly outputs?: readonly HoldingRef[];
  readonly failure?: string;
  /** State the instance was in when it entered `reconciling`. */
  readonly resumeFrom?: 'signing' | 'submitted';
}

export type StepEvent =
  | { readonly type: 'ready' }
  | { readonly type: 'need-confirm' }
  | { readonly type: 'checkpoint-ok' }
  | { readonly type: 'wait'; readonly dueAtMs: number; readonly waitedMs: number }
  | { readonly type: 'due' }
  | { readonly type: 'prepare' }
  | { readonly type: 'restart' }
  | { readonly type: 'sign'; readonly intentKey: string }
  | { readonly type: 'submitted'; readonly ref: string }
  | { readonly type: 'chain-confirmed' }
  | { readonly type: 'outputs'; readonly outputs: readonly HoldingRef[] }
  | { readonly type: 'crash' }
  | { readonly type: 'reconciled'; readonly result: ReconcileResult }
  | { readonly type: 'retryable'; readonly reason: string }
  | { readonly type: 'retry' }
  | { readonly type: 'terminal'; readonly reason: string }
  | { readonly type: 'skip' }
  | { readonly type: 'abort' };

const illegal = (i: StepInstance, ev: StepEvent): never => {
  throw new PipelineError('E_ILLEGAL_TRANSITION', `${i.state}+${ev.type}`);
};

/**
 * Step state machine (chaining spec 6.2). Total: every (state, event) pair returns a new instance or
 * throws `E_ILLEGAL_TRANSITION`. Terminal states accept nothing. `skip` and `abort` are refused while a
 * side effect may exist (`signing`, `submitted`, `reconciling`): wait for reconcile (EX-6).
 */
export function reduceStep(i: StepInstance, ev: StepEvent): StepInstance {
  const s = i.state;
  const to = (state: StepState, extra: Partial<StepInstance> = {}): StepInstance => ({
    ...i,
    state,
    ...extra,
  });
  const preSigning: readonly StepState[] = [
    'planned',
    'ready',
    'awaiting-confirm',
    'waiting',
    'due',
    'preparing',
    'failed-retryable',
  ];
  if (ev.type === 'skip') return preSigning.includes(s) ? to('skipped') : illegal(i, ev);
  if (ev.type === 'abort') return preSigning.includes(s) ? to('aborted') : illegal(i, ev);
  switch (s) {
    case 'planned':
      return ev.type === 'ready' ? to('ready') : illegal(i, ev);
    case 'ready':
      if (ev.type === 'need-confirm') return to('awaiting-confirm');
      if (ev.type === 'wait') return to('waiting', { dueAtMs: ev.dueAtMs, waitedMs: ev.waitedMs });
      if (ev.type === 'due') return to('due');
      return illegal(i, ev);
    case 'awaiting-confirm':
      return ev.type === 'checkpoint-ok' ? to('ready') : illegal(i, ev);
    case 'waiting':
      return ev.type === 'due' ? to('due') : illegal(i, ev);
    case 'due':
      return ev.type === 'prepare' ? to('preparing') : illegal(i, ev);
    case 'preparing':
      if (ev.type === 'sign') return to('signing', { intentKey: ev.intentKey });
      if (ev.type === 'restart') return to('due');
      if (ev.type === 'retryable') return to('failed-retryable', { failure: ev.reason });
      if (ev.type === 'terminal') return to('failed-terminal', { failure: ev.reason });
      return illegal(i, ev);
    case 'signing':
      if (ev.type === 'submitted') return to('submitted', { ref: ev.ref });
      if (ev.type === 'crash') return to('reconciling', { resumeFrom: 'signing' });
      return illegal(i, ev);
    case 'submitted':
      if (ev.type === 'chain-confirmed') return to('confirmed');
      if (ev.type === 'crash') return to('reconciling', { resumeFrom: 'submitted' });
      if (ev.type === 'retryable') return to('failed-retryable', { failure: ev.reason });
      if (ev.type === 'terminal') return to('failed-terminal', { failure: ev.reason });
      return illegal(i, ev);
    case 'confirmed':
      if (ev.type === 'outputs') return to('done', { outputs: ev.outputs });
      return ev.type === 'terminal' ? to('failed-terminal', { failure: ev.reason }) : illegal(i, ev);
    case 'reconciling':
      if (ev.type !== 'reconciled') return illegal(i, ev);
      if (ev.result === 'not-started') return to('due');
      if (ev.result === 'pending') return to('submitted');
      if (ev.result === 'done') return to('confirmed');
      return to('failed-terminal', { failure: 'chain-failed' });
    case 'failed-retryable':
      if (ev.type === 'retry') return to('due', { attempts: i.attempts + 1 });
      if (ev.type === 'terminal') return to('failed-terminal', { failure: ev.reason });
      return illegal(i, ev);
    default:
      return illegal(i, ev);
  }
}

export type RunStatus =
  | 'draft'
  | 'validated'
  | 'confirmed'
  | 'running'
  | 'paused'
  | 'aborting'
  | 'aborted'
  | 'completed'
  | 'partial';
export const RUN_STATUSES: readonly RunStatus[] = [
  'draft',
  'validated',
  'confirmed',
  'running',
  'paused',
  'aborting',
  'aborted',
  'completed',
  'partial',
];

/** A persisted pipeline run. References and state only (EX-2). */
export interface PipelineRun {
  readonly v: 1;
  readonly id: string;
  readonly status: RunStatus;
  readonly pauseReason?: string;
  readonly planHash: Hex;
  readonly pipeline: Pipeline;
  readonly quotes: QuoteMap;
  readonly instances: readonly StepInstance[];
  /** CP-2 ("first public step is irreversible") was shown and accepted. */
  readonly cp2Done: boolean;
}

export type RunEvent =
  | { readonly type: 'validate'; readonly planHash: Hex }
  | { readonly type: 'confirm'; readonly planHash: Hex }
  | { readonly type: 'replan' }
  | { readonly type: 'start' }
  | { readonly type: 'pause'; readonly reason: string }
  | { readonly type: 'resume' }
  | { readonly type: 'abort-request' }
  | { readonly type: 'aborted' }
  | { readonly type: 'complete' }
  | { readonly type: 'partial' };

const badRun = (r: PipelineRun, ev: RunEvent): never => {
  throw new PipelineError('E_ILLEGAL_TRANSITION', `run:${r.status}+${ev.type}`);
};

/**
 * Pipeline run state machine. Total: returns a new run or throws `E_ILLEGAL_TRANSITION`; confirming
 * with a plan hash that differs from the validated one throws `E_PLAN_HASH`. `replan` (changing the
 * plan or layers) is only possible before the run starts: layers cannot change mid-run (L-2).
 */
export function reducePipeline(r: PipelineRun, ev: RunEvent): PipelineRun {
  const to = (status: RunStatus, extra: Partial<PipelineRun> = {}): PipelineRun => {
    const { pauseReason: _drop, ...rest } = r;
    void _drop;
    return { ...rest, ...extra, status };
  };
  switch (r.status) {
    case 'draft':
      if (ev.type === 'validate') return to('validated', { planHash: ev.planHash });
      if (ev.type === 'replan') return to('draft');
      return badRun(r, ev);
    case 'validated':
      if (ev.type === 'confirm') {
        if (ev.planHash !== r.planHash) throw new PipelineError('E_PLAN_HASH');
        return to('confirmed');
      }
      if (ev.type === 'validate') return to('validated', { planHash: ev.planHash });
      if (ev.type === 'replan') return to('draft');
      return badRun(r, ev);
    case 'confirmed':
      if (ev.type === 'start') return to('running');
      if (ev.type === 'replan') return to('draft');
      if (ev.type === 'abort-request') return to('aborting');
      return badRun(r, ev);
    case 'running':
      if (ev.type === 'pause') return to('paused', { pauseReason: ev.reason });
      if (ev.type === 'complete') return to('completed');
      if (ev.type === 'partial') return to('partial');
      if (ev.type === 'abort-request') return to('aborting');
      return badRun(r, ev);
    case 'paused':
      if (ev.type === 'resume') return to('running');
      if (ev.type === 'abort-request') return to('aborting');
      return badRun(r, ev);
    case 'partial':
      return ev.type === 'abort-request' ? to('aborting') : badRun(r, ev);
    case 'aborting':
      return ev.type === 'aborted' ? to('aborted') : badRun(r, ev);
    default:
      return badRun(r, ev);
  }
}
