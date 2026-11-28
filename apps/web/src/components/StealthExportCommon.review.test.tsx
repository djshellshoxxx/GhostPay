// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession } from '../lib/session';
import { useExportOperation, type ExportOperation } from './StealthExportCommon';

// Adapted for main: there is no suspendSession/subscribeSessionExpiryCheck deadline hook. A silent revocation
// (clearSession(false): the revision advances and no subscriber is notified) is the main-equivalent boundary.

beforeEach(() => { clearSession(); });
afterEach(() => {
  cleanup();
  clearSession();
});

describe('independent export operation revocation review', () => {
  it('rejects a silent session revision change without relying on a subscriber notification', () => {
    const reset = vi.fn<() => void>();
    const { result } = renderHook(() => useExportOperation(reset));
    const controller = result.current.start();
    clearSession(false);
    expect(reset).not.toHaveBeenCalled();
    let accepted = true;
    act(() => { accepted = result.current.current(controller); });
    expect(accepted).toBe(false);
    expect(controller.signal.aborted).toBe(true);
    expect(reset).toHaveBeenCalledOnce();
    expect(result.current.current(controller)).toBe(false);
    expect(reset).toHaveBeenCalledOnce();
  });

  it('does not cancel a replacement operation started during synchronous revocation', () => {
    const current: { operation?: ExportOperation } = {};
    let replacement: AbortController | undefined;
    const reset = vi.fn<() => void>(() => { replacement = current.operation?.start(); });
    const { result } = renderHook(() => useExportOperation(reset));
    current.operation = result.current;
    const controller = result.current.start();
    clearSession(false);
    let accepted = true;
    act(() => { accepted = result.current.current(controller); });
    expect(accepted).toBe(false);
    expect(controller.signal.aborted).toBe(true);
    expect(reset).toHaveBeenCalledOnce();
    expect(replacement).toBeDefined();
    if (replacement === undefined) throw new Error('Expected a replacement operation');
    expect(replacement.signal.aborted).toBe(false);
    expect(result.current.current(replacement)).toBe(true);
  });

});
