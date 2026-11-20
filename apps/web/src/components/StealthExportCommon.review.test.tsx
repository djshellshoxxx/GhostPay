// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, subscribeSessionExpiryCheck, suspendSession } from '../lib/session';
import { useExportOperation, type ExportOperation } from './StealthExportCommon';

const subscriptions: (() => void)[] = [];

beforeEach(() => { clearSession(); });
afterEach(() => {
  cleanup();
  for (const unsubscribe of subscriptions.splice(0)) unsubscribe();
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
    let expired = false;
    subscriptions.push(subscribeSessionExpiryCheck(() => {
      if (expired) { expired = false; suspendSession(); }
    }));
    const current: { operation?: ExportOperation } = {};
    let replacement: AbortController | undefined;
    const reset = vi.fn<() => void>(() => { replacement = current.operation?.start(); });
    const { result } = renderHook(() => useExportOperation(reset));
    current.operation = result.current;
    const controller = result.current.start();
    expired = true;
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

  it('fails closed without throwing when the final deadline observer fails', () => {
    let fail = false;
    subscriptions.push(subscribeSessionExpiryCheck(() => {
      if (fail) throw new Error('deadline observer failed');
    }));
    const reset = vi.fn<() => void>();
    const { result } = renderHook(() => useExportOperation(reset));
    const controller = result.current.start();
    fail = true;
    let accepted = true;
    act(() => { accepted = result.current.current(controller); });
    expect(accepted).toBe(false);
    expect(controller.signal.aborted).toBe(true);
    expect(reset).toHaveBeenCalledOnce();
  });
});
