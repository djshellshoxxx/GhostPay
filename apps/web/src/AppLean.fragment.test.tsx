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
    expect(window.history.state).toMatchObject(navigationState);
  });

  it('clears a retained invoice URL immediately when automatic fragment removal is enabled in Settings', () => {
    const navigationState = { section: 'pay', source: 'retained-link' };
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ autoClearFragment: false }));
    window.history.replaceState(navigationState, '', '/app/?view=pay#gpi=v1.placeholder');
    renderWith(<AppLean />);

    // Retention was explicitly requested at startup, so the initial hash remains.
    expect(window.location.hash).toBe('#gpi=v1.placeholder');
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Settings' }));
    // Leaving Pay always sanitizes its entry. Simulate an already visible bearer URL on the
    // settings entry so this exercises the preference effect independently of route cleanup.
    expect(window.location.hash).toBe('');
    window.history.replaceState({ ...navigationState, ...window.history.state }, '', '/app/?view=pay#gpi=v1.placeholder');
    const autoClear = screen.getByRole('checkbox', { name: 'Remove the invoice from the address bar after reading it' });
    expect((autoClear as HTMLInputElement).checked).toBe(false);
    fireEvent.click(autoClear);
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    // Re-enabling the privacy preference must clear an already visible bearer link,
    // not merely clear future incoming hashes. Preserve this history entry's state.
    expect(window.location.hash).toBe('');
    expect(window.location.pathname).toBe('/app/');
    expect(window.location.search).toBe('?view=pay');
    expect(window.history.state).toMatchObject(navigationState);
  });

  it('preserves unrelated document anchors instead of treating them as invoice links', () => {
    const navigationState = { section: 'documentation', origin: 'internal-link' };
    window.history.replaceState(navigationState, '', '/app/?view=home#main');
    renderWith(<AppLean />);

    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('button', { name: 'Home' }).getAttribute('aria-current')).toBe('page');
    expect(window.location.hash).toBe('#main');
    expect(window.location.pathname).toBe('/app/');
    expect(window.location.search).toBe('?view=home');
    expect(window.history.state).toMatchObject(navigationState);
  });

  it('retains a later invoice URL when the user explicitly disabled automatic clearing', () => {
    const navigationState = { origin: 'incoming-link', step: 2 };
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ autoClearFragment: false }));
    window.history.replaceState(null, '', '/app/?view=home');
    renderWith(<AppLean />);

    act(() => {
      window.history.replaceState(navigationState, '', '/app/?view=pay#gpi=v1.placeholder');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('button', { name: 'Pay' }).getAttribute('aria-current')).toBe('page');
    expect(window.location.hash).toBe('#gpi=v1.placeholder');
    expect(window.location.pathname).toBe('/app/');
    expect(window.location.search).toBe('?view=pay');
    expect(window.history.state).toMatchObject(navigationState);
  });

  it('respects the explicit user option to retain invoice fragments in the address bar', () => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ autoClearFragment: false }));
    window.history.replaceState(null, '', '/app/?view=pay#gpi=v1.placeholder');
    renderWith(<AppLean />);

    expect(screen.getByRole('navigation', { name: 'Main' })).toBeTruthy();
    expect(window.location.hash).toBe('#gpi=v1.placeholder');
  });
  it('retains focus for unrelated hashes but moves it to main after a late invoice opens Pay', () => {
    window.history.replaceState(null, '', '/app/?view=home');
    renderWith(<AppLean />);

    const nav = screen.getByRole('navigation', { name: 'Main' });
    const home = within(nav).getByRole('button', { name: 'Home' });
    home.focus();
    expect(document.activeElement).toBe(home);

    // A normal document anchor does not change views or steal keyboard focus.
    act(() => {
      window.history.replaceState(null, '', '/app/?view=home#main');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(window.location.hash).toBe('#main');
    expect(within(nav).getByRole('button', { name: 'Home' }).getAttribute('aria-current')).toBe('page');
    expect(document.activeElement).toBe(home);

    // An invoice deep link transitions to Pay and focuses the main content landmark.
    act(() => {
      window.history.replaceState(null, '', '/app/?view=pay#gpi=v1.placeholder');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(within(nav).getByRole('button', { name: 'Pay' }).getAttribute('aria-current')).toBe('page');
    expect(document.activeElement).toBe(screen.getByRole('main'));
    expect(window.location.hash).toBe('');
    expect(window.location.pathname).toBe('/app/');
    expect(window.location.search).toBe('?view=pay');
  });

  it('focuses main for a new invoice link even when Pay was already selected', () => {
    window.history.replaceState(null, '', '/app/?view=pay#gpi=v1.initial');
    renderWith(<AppLean />);

    const nav = screen.getByRole('navigation', { name: 'Main' });
    const pay = within(nav).getByRole('button', { name: 'Pay' });
    expect(pay.getAttribute('aria-current')).toBe('page');
    pay.focus();
    expect(document.activeElement).toBe(pay);

    // A second incoming invoice is new content even though the selected view stays Pay.
    // Screen-reader and keyboard users must land in the updated main region.
    const navigationState = { source: 'second-invoice' };
    act(() => {
      window.history.replaceState(navigationState, '', '/app/?view=pay#gpi=v1.second');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(pay.getAttribute('aria-current')).toBe('page');
    expect(document.activeElement).toBe(screen.getByRole('main'));
    expect(window.location.hash).toBe('');
    expect(window.location.pathname).toBe('/app/');
    expect(window.location.search).toBe('?view=pay');
    expect(window.history.state).toMatchObject(navigationState);
  });

});
