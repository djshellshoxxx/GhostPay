import { describe, expect, it } from 'vitest';
import { POLICY } from './fixtures.testutil.js';
import { addScan, ASSEMBLY_TTL_MS, type AssemblyState } from './qr.js';

function initialState(): AssemblyState {
  const result = addScan(null, 'gpc1:sess01:1/3:aaa', POLICY, 1000);
  if (!result.ok || result.value.status !== 'progress') throw new Error('expected progress');
  return result.value.state;
}

describe('QR assembly clock rollback', () => {
  it('discards old parts even when the next frame has the same session id', () => {
    expect(addScan(initialState(), 'gpc1:sess01:2/3:bbb', POLICY, 999)).toMatchObject({
      ok: true,
      value: {
        status: 'progress',
        restarted: true,
        received: 1,
        missing: [1, 3],
        state: { startedAt: 999, parts: [null, 'bbb', null] },
      },
    });
  });

  it('allows a new assembly after the clock moves backwards', () => {
    expect(addScan(initialState(), 'gpc1:other1:1/3:ccc', POLICY, 999)).toMatchObject({
      ok: true,
      value: { status: 'progress', restarted: true, received: 1, state: { id: 'other1', startedAt: 999 } },
    });
  });

  it('preserves the existing exact TTL boundary and ordinary expiration', () => {
    const state = initialState();
    expect(addScan(state, 'gpc1:other1:1/3:ccc', POLICY, 1000 + ASSEMBLY_TTL_MS)).toEqual({
      ok: false,
      code: 'chunk-session-mismatch',
    });
    expect(addScan(state, 'gpc1:other1:1/3:ccc', POLICY, 1001 + ASSEMBLY_TTL_MS)).toMatchObject({
      ok: true,
      value: { status: 'progress', restarted: true, received: 1 },
    });
  });

  it('preserves normal progress, duplicates and conflicts', () => {
    const state = initialState();
    expect(addScan(state, 'gpc1:sess01:2/3:bbb', POLICY, 1001)).toMatchObject({
      ok: true,
      value: { status: 'progress', restarted: false, received: 2 },
    });
    expect(addScan(state, 'gpc1:sess01:1/3:aaa', POLICY, 1000)).toMatchObject({
      ok: true,
      value: { status: 'progress', restarted: false, duplicate: true },
    });
    expect(addScan(state, 'gpc1:sess01:1/3:bbb', POLICY, 1001)).toEqual({
      ok: false,
      code: 'chunk-conflict',
    });
  });
});
