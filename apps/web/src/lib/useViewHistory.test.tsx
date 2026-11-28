// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useViewHistory } from './useViewHistory';

const authority = vi.hoisted(() => ({ suspended: false }));
vi.mock('./session', () => ({
  isSessionSuspended: () => authority.suspended,
  captureSessionVersionGuard: () => () => {},
}));

const run = () => renderHook(() => useViewHistory(['home', 'seller', 'pay', 'settings', 'about'], false));
const traverse = (view: string, position: number, url = '/') => {
  const state = { ghostPayView: { view, position } };
  window.history.replaceState(state, '', url);
  window.dispatchEvent(new PopStateEvent('popstate', { state }));
};

afterEach(cleanup);
beforeEach(() => {
  authority.suspended = false;
  window.history.replaceState(null, '', '/');
});

it('ignores disabled view identifiers on reload and suspended traversal', () => {
  window.history.replaceState({ ghostPayView: { view: 'btc', position: 2 } }, '', '/');
  const { result } = run();
  expect(result.current.view).toBe('home');
  authority.suspended = true;
  act(() => { traverse('pay', 1, '/#gpi=v1.old'); window.dispatchEvent(new HashChangeEvent('hashchange')); });
  expect(result.current.view).toBe('seller');
  expect(result.current.fragment).toBeUndefined();
  expect(window.location.hash).toBe('');
  expect(window.history.state).toEqual({ ghostPayView: { view: 'seller', position: 1 } });
});

it('app navigation omits opaque incoming metadata and a duplicate click adds no entry', () => {
  window.history.replaceState({ unrelated: 'original-entry-only' }, '', '/shop/?fixture=private#main');
  const { result } = run();
  const oldLength = window.history.length;
  act(() => { result.current.setView('pay'); result.current.setView('pay'); });
  expect(window.history.length).toBe(oldLength + 1);
  expect(window.location.pathname).toBe('/shop/');
  expect(window.location.hash + window.location.search).toBe('');
  expect(window.history.state).toEqual({ ghostPayView: { view: 'pay', position: 1 } });
});

it('reads a fresh invoice once and revisits only the view after native traversal', () => {
  const { result } = run();
  act(() => {
    window.history.replaceState(null, '', '/#gpi=v1.fresh');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
  expect(result.current.fragment).toBe('#gpi=v1.fresh');
  act(() => { traverse('home', 0); });
  expect(result.current.fragment).toBeUndefined();
  act(() => { traverse('pay', 1, '/#gpi=v1.fresh'); window.dispatchEvent(new HashChangeEvent('hashchange')); });
  expect(result.current.view).toBe('pay');
  expect(result.current.fragment).toBeUndefined();
  expect(window.location.hash).toBe('');
});

it('restores the displaced Settings position on cancel and accepts a later traversal', () => {
  const { result } = run();
  act(() => { result.current.setView('about'); result.current.setView('settings'); });
  const go = vi.spyOn(window.history, 'go').mockImplementation(() => {});
  try {
    window.addEventListener('ghostpay:settings-navigation', (event) => {
      event.preventDefault();
      (event as CustomEvent<{ cancel(): void }>).detail.cancel();
    }, { once: true });
    act(() => { traverse('home', 0); });
    expect(result.current.view).toBe('settings');
    expect(go).toHaveBeenCalledWith(2);
    act(() => { traverse('settings', 2); traverse('about', 1); });
    expect(result.current.view).toBe('about');
  } finally { go.mockRestore(); }
});
