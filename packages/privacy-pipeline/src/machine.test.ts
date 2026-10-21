import { describe, expect, it } from 'vitest';
import { PipelineError } from './errors.js';
import {
  IN_FLIGHT,
  RUN_STATUSES,
  STEP_STATES,
  TERMINAL_STEP,
  reducePipeline,
  reduceStep,
  type PipelineRun,
  type RunEvent,
  type StepEvent,
  type StepInstance,
  type StepState,
} from './machine.js';
import { pipe, step as s } from './fixtures.testutil.js';

const inst = (state: StepState, over: Partial<StepInstance> = {}): StepInstance => ({
  instanceId: '0xab',
  stepIndex: 0,
  kind: 'pool.exit',
  lineagePath: [],
  state,
  attempts: 0,
  ...over,
});
const EVENTS: StepEvent[] = [
  { type: 'ready' },
  { type: 'need-confirm' },
  { type: 'checkpoint-ok' },
  { type: 'wait', dueAtMs: 9, waitedMs: 4 },
  { type: 'due' },
  { type: 'prepare' },
  { type: 'restart' },
  { type: 'sign', intentKey: 'k' },
  { type: 'submitted', ref: 'tx:1' },
  { type: 'chain-confirmed' },
  { type: 'outputs', outputs: [] },
  { type: 'crash' },
  { type: 'reconciled', result: 'done' },
  { type: 'retryable', reason: 'r' },
  { type: 'retry' },
  { type: 'terminal', reason: 't' },
  { type: 'skip' },
  { type: 'abort' },
];
/** Independent oracle: event type -> next state, per state (chaining spec 6.2). */
const LEGAL: Record<StepState, Partial<Record<StepEvent['type'], StepState>>> = {
  planned: { ready: 'ready', skip: 'skipped', abort: 'aborted' },
  ready: {
    'need-confirm': 'awaiting-confirm',
    wait: 'waiting',
    due: 'due',
    skip: 'skipped',
    abort: 'aborted',
  },
  'awaiting-confirm': { 'checkpoint-ok': 'ready', skip: 'skipped', abort: 'aborted' },
  waiting: { due: 'due', skip: 'skipped', abort: 'aborted' },
  due: { prepare: 'preparing', skip: 'skipped', abort: 'aborted' },
  preparing: {
    sign: 'signing',
    restart: 'due',
    retryable: 'failed-retryable',
    terminal: 'failed-terminal',
    skip: 'skipped',
    abort: 'aborted',
  },
  signing: { submitted: 'submitted', crash: 'reconciling' },
  submitted: {
    'chain-confirmed': 'confirmed',
    crash: 'reconciling',
    retryable: 'failed-retryable',
    terminal: 'failed-terminal',
  },
  confirmed: { outputs: 'done', terminal: 'failed-terminal' },
  done: {},
  reconciling: { reconciled: 'confirmed' },
  'failed-retryable': { retry: 'due', terminal: 'failed-terminal', skip: 'skipped', abort: 'aborted' },
  'failed-terminal': {},
  skipped: {},
  aborted: {},
};

describe('reduceStep is total and matches the transition oracle (PL-2, P-9)', () => {
  for (const state of STEP_STATES) {
    for (const ev of EVENTS) {
      const want = LEGAL[state][ev.type];
      it(`${state} + ${ev.type} -> ${want ?? 'E_ILLEGAL_TRANSITION'}`, () => {
        const i = inst(state);
        if (want === undefined) {
          expect(() => reduceStep(i, ev)).toThrow(PipelineError);
          try {
            reduceStep(i, ev);
          } catch (e) {
            expect((e as PipelineError).code).toBe('E_ILLEGAL_TRANSITION');
          }
        } else {
          expect(reduceStep(i, ev).state).toBe(want);
          expect(i.state).toBe(state); // input is not mutated
        }
      });
    }
  }
  it('records payloads: intent key, ref, due time, outputs, attempts, failure', () => {
    expect(reduceStep(inst('preparing'), { type: 'sign', intentKey: 'abc' }).intentKey).toBe('abc');
    expect(reduceStep(inst('signing'), { type: 'submitted', ref: 'tx:9' }).ref).toBe('tx:9');
    expect(reduceStep(inst('ready'), { type: 'wait', dueAtMs: 9, waitedMs: 4 })).toMatchObject({
      dueAtMs: 9,
      waitedMs: 4,
    });
    expect(
      reduceStep(inst('confirmed'), { type: 'outputs', outputs: [{ ref: 'r', holding: { t: 'paid' } }] })
        .outputs,
    ).toHaveLength(1);
    expect(reduceStep(inst('failed-retryable', { attempts: 1 }), { type: 'retry' }).attempts).toBe(2);
    expect(reduceStep(inst('preparing'), { type: 'terminal', reason: 'no' }).failure).toBe('no');
    expect(reduceStep(inst('signing'), { type: 'crash' }).resumeFrom).toBe('signing');
    expect(reduceStep(inst('submitted'), { type: 'crash' }).resumeFrom).toBe('submitted');
  });
  it('reconciliation results map to states', () => {
    const r = (result: 'not-started' | 'pending' | 'done' | 'failed'): StepState =>
      reduceStep(inst('reconciling'), { type: 'reconciled', result }).state;
    expect([r('not-started'), r('pending'), r('done'), r('failed')]).toEqual([
      'due',
      'submitted',
      'confirmed',
      'failed-terminal',
    ]);
    expect(reduceStep(inst('reconciling'), { type: 'reconciled', result: 'failed' }).failure).toBe(
      'chain-failed',
    );
  });
  it('abort and skip are refused while a side effect may exist (EX-6)', () => {
    for (const st of IN_FLIGHT) {
      expect(() => reduceStep(inst(st), { type: 'abort' })).toThrow(PipelineError);
      expect(() => reduceStep(inst(st), { type: 'skip' })).toThrow(PipelineError);
    }
    for (const st of TERMINAL_STEP)
      expect(() => reduceStep(inst(st), { type: 'abort' })).toThrow(PipelineError);
  });
});

describe('reducePipeline', () => {
  const base: PipelineRun = {
    v: 1,
    id: 'r',
    status: 'draft',
    planHash: '0x01',
    pipeline: pipe('payer', [s('src.wallet')]),
    quotes: {},
    instances: [],
    cp2Done: false,
  };
  const run = (status: PipelineRun['status'], over: Partial<PipelineRun> = {}): PipelineRun => ({
    ...base,
    status,
    ...over,
  });
  const EV: RunEvent[] = [
    { type: 'validate', planHash: '0x02' },
    { type: 'confirm', planHash: '0x01' },
    { type: 'replan' },
    { type: 'start' },
    { type: 'pause', reason: 'user' },
    { type: 'resume' },
    { type: 'abort-request' },
    { type: 'aborted' },
    { type: 'complete' },
    { type: 'partial' },
  ];
  const LEGAL_RUN: Record<string, Partial<Record<RunEvent['type'], string>>> = {
    draft: { validate: 'validated', replan: 'draft' },
    validated: { validate: 'validated', confirm: 'confirmed', replan: 'draft' },
    confirmed: { start: 'running', replan: 'draft', 'abort-request': 'aborting' },
    running: { pause: 'paused', complete: 'completed', partial: 'partial', 'abort-request': 'aborting' },
    paused: { resume: 'running', 'abort-request': 'aborting' },
    partial: { 'abort-request': 'aborting' },
    aborting: { aborted: 'aborted' },
    aborted: {},
    completed: {},
  };
  for (const st of RUN_STATUSES) {
    for (const ev of EV) {
      const want = LEGAL_RUN[st]?.[ev.type];
      it(`${st} + ${ev.type} -> ${want ?? 'illegal'}`, () => {
        const r = run(st, { planHash: ev.type === 'confirm' ? '0x01' : '0x01' });
        if (want === undefined) expect(() => reducePipeline(r, ev)).toThrow(PipelineError);
        else expect(reducePipeline(r, ev).status).toBe(want);
      });
    }
  }
  it('confirming a different plan hash is refused with E_PLAN_HASH', () => {
    try {
      reducePipeline(run('validated'), { type: 'confirm', planHash: '0x99' });
      expect.unreachable();
    } catch (e) {
      expect((e as PipelineError).code).toBe('E_PLAN_HASH');
    }
  });
  it('layers cannot change mid-run: replan is illegal once running or paused (L-2)', () => {
    for (const st of ['running', 'paused'] as const) {
      expect(() => reducePipeline(run(st), { type: 'replan' })).toThrow(PipelineError);
    }
  });
  it('pause reason is kept only while paused', () => {
    const p = reducePipeline(run('running'), { type: 'pause', reason: 'user' });
    expect(p.pauseReason).toBe('user');
    expect(reducePipeline(p, { type: 'resume' }).pauseReason).toBeUndefined();
  });
  it('validate records the new plan hash', () => {
    expect(reducePipeline(run('draft'), { type: 'validate', planHash: '0xaa' }).planHash).toBe('0xaa');
  });
});
