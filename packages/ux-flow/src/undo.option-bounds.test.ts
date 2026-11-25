import { describe, expect, it } from 'vitest';
import { FlowError } from './errors.js';
import { UndoQueue, type SubmitInput } from './undo.js';

function errorCode(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    return error instanceof FlowError ? error.code : 'WRONG_ERROR_TYPE';
  }
  return undefined;
}

function change(id: string): SubmitInput {
  return {
    id,
    kind: 'policy.limit',
    summary: 'Local queued policy change',
    payload: '{}',
    delayMs: 1000,
  };
}

describe('UndoQueue maxPending option boundaries', () => {
  it('rejects nonfinite and fractional limits instead of disabling or extending the cap', () => {
    for (const maxPending of [NaN, Infinity, 1.5]) {
      expect(errorCode(() => new UndoQueue(() => 10_000, { maxPending }))).toBe('BAD_OPTION');
    }
  });

  it('preserves positive integer capacity and permits reuse after cancellation', () => {
    const q = new UndoQueue(() => 10_000, { maxPending: 1 });
    q.submit(change('first'));
    expect(errorCode(() => q.submit(change('second')))).toBe('QUEUE_FULL');
    expect(q.cancel('first').ok).toBe(true);
    expect(q.submit(change('second')).status).toBe('pending');
    expect(q.snapshot().items).toHaveLength(2);
  });
});
