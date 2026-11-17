// @vitest-environment jsdom
import { act, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppLean } from './AppLean';
import { clearSession } from './lib/session';
import { SETTINGS_KEY } from './lib/settings';
import { renderWith } from './test/render';

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('static Pages invoice-fragment privacy', () => {
  it('opens an incoming invoice in Pay while removing its fragment from the current history URL', () => {
    window.history.replaceState(null, '', '/app/?view=pay#gpi=v1.placeholder');
    renderWith(<AppLean />);

    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('button', { name: 'Pay' }).getAttribute('aria-current')).toBe('page');
    expect(window.location.pathname).toBe('/app/');
    expect(window.location.search).toBe('?view=pay');
    expect(window.location.hash).toBe('');
  });

  it('clears a subsequently opened invoice fragment without losing the current path or query', () => {
    window.history.replaceState(null, '', '/app/?view=pay');
    renderWith(<AppLean />);
    act(() => {
      window.history.replaceState(null, '', '/app/?view=pay#gpi=v1.placeholder');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('button', { name: 'Pay' }).getAttribute('aria-current')).toBe('page');
    expect(window.location.pathname).toBe('/app/');
    expect(window.location.search).toBe('?view=pay');
    expect(window.location.hash).toBe('');
  });

  it('respects the explicit user option to retain invoice fragments in the address bar', () => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ autoClearFragment: false }));
    window.history.replaceState(null, '', '/app/?view=pay#gpi=v1.placeholder');
    renderWith(<AppLean />);

    expect(screen.getByRole('navigation', { name: 'Main' })).toBeTruthy();
    expect(window.location.hash).toBe('#gpi=v1.placeholder');
  });
});
