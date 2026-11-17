// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react';
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

  it('preserves current-entry navigation state when stripping a sensitive invoice fragment', () => {
    const navigationState = { section: 'pay', origin: 'invoice-link' };
    window.history.replaceState(navigationState, '', '/app/?view=pay#gpi=v1.placeholder');
    renderWith(<AppLean />);

    expect(window.location.hash).toBe('');
    expect(window.history.state).toEqual(navigationState);
  });

  it('clears a retained invoice URL immediately when automatic fragment removal is enabled in Settings', () => {
    const navigationState = { section: 'pay', source: 'retained-link' };
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ autoClearFragment: false }));
    window.history.replaceState(navigationState, '', '/app/?view=pay#gpi=v1.placeholder');
    renderWith(<AppLean />);

    // Retention was explicitly requested at startup, so the initial hash remains.
    expect(window.location.hash).toBe('#gpi=v1.placeholder');
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Settings' }));
    const autoClear = screen.getByRole('checkbox', { name: 'Remove the invoice from the address bar after reading it' });
    expect((autoClear as HTMLInputElement).checked).toBe(false);
    fireEvent.click(autoClear);
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    // Re-enabling the privacy preference must clear an already visible bearer link,
    // not merely clear future incoming hashes. Preserve this history entry's state.
    expect(window.location.hash).toBe('');
    expect(window.location.pathname).toBe('/app/');
    expect(window.location.search).toBe('?view=pay');
    expect(window.history.state).toEqual(navigationState);
  });

  it('respects the explicit user option to retain invoice fragments in the address bar', () => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ autoClearFragment: false }));
    window.history.replaceState(null, '', '/app/?view=pay#gpi=v1.placeholder');
    renderWith(<AppLean />);

    expect(screen.getByRole('navigation', { name: 'Main' })).toBeTruthy();
    expect(window.location.hash).toBe('#gpi=v1.placeholder');
  });
});
