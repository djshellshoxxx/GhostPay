// @vitest-environment jsdom
// Adapted from #300 (137628961463fc5abd8b7927b2efe6b18a0a206a).
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PrivacyControls } from './PrivacyControls';
import { SensitiveContent } from './SensitiveContent';
import { PRIVACY_MODE_KEY, PrivacyProvider, resetPrivacyModeForTests } from '../lib/privacyMode';
import { clearSession, getSessionPublic } from '../lib/session';
import { generateWaivedSession } from '../test/keys';
import { renderApp } from '../test/render';

const reveal = () => fireEvent.click(screen.getByRole('button', { name: 'Reveal details for 30 seconds' }));
const draft = () => screen.queryByRole<HTMLInputElement>('textbox', { name: 'Private draft' });
const hideButton = () => screen.getByRole('button', { name: /Hide sensitive details/ });

function fixture({ enabled = true, controls = true } = {}) {
  return <PrivacyProvider enabled={enabled} scope="donor300">
    {controls && <PrivacyControls />}
    <SensitiveContent><label>Private draft<input defaultValue="synthetic unsaved draft" /></label></SensitiveContent>
  </PrivacyProvider>;
}

function chord(extra: KeyboardEventInit = {}, target: Document | HTMLElement = document): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: 'H', altKey: true, shiftKey: true, bubbles: true, cancelable: true, ...extra });
  fireEvent(target, event);
  return event;
}

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); clearSession(); resetPrivacyModeForTests(); });
afterEach(() => { cleanup(); resetPrivacyModeForTests(); clearSession(); });

describe('quick-hide donor #300 on the mounted PrivacyControls', () => {
  it('advertises the shortcut when revealed, hides via the button, and never reveals via the shortcut', () => {
    render(fixture());
    reveal();
    expect(hideButton().getAttribute('aria-keyshortcuts')).toBe('Alt+Shift+H');
    const input = draft();
    expect(input).not.toBeNull();
    fireEvent.click(hideButton());
    expect(draft()).toBeNull();
    expect(document.body.textContent).not.toContain('synthetic unsaved draft');
    expect(chord().defaultPrevented).toBe(true);
    expect(draft()).toBeNull();
    reveal();
    expect(draft()).toBe(input);
    expect(draft()?.value).toBe('synthetic unsaved draft');
  });

  it('does not consume the shortcut or hide a draft when privacy mode is disabled', () => {
    render(fixture({ enabled: false }));
    expect(screen.queryByRole('button', { name: /Hide sensitive details/ })).toBeNull();
    expect(chord().defaultPrevented).toBe(false);
    expect(draft()?.value).toBe('synthetic unsaved draft');
  });

  it.each([
    { key: 'h', altKey: false, shiftKey: false },
    { key: 'H', altKey: false },
    { key: 'h', shiftKey: false },
    { key: 'G' },
    { key: 'Escape' },
    { ctrlKey: true },
    { metaKey: true },
    { isComposing: true },
    { repeat: true },
  ])('preserves unrelated typing and composition: %j', (keys) => {
    render(fixture());
    reveal();
    expect(chord(keys).defaultPrevented).toBe(false);
    expect(draft()?.value).toBe('synthetic unsaved draft');
  });

  it('honors an already handled key event', () => {
    render(fixture());
    reveal();
    const event = new KeyboardEvent('keydown', { key: 'H', altKey: true, shiftKey: true, bubbles: true, cancelable: true });
    event.preventDefault();
    fireEvent(document, event);
    expect(draft()?.value).toBe('synthetic unsaved draft');
  });

  it('removes the listener on unmount and privacy-mode disable', () => {
    const { rerender } = render(fixture());
    reveal();
    rerender(fixture({ controls: false }));
    expect(chord().defaultPrevented).toBe(false);
    expect(draft()?.value).toBe('synthetic unsaved draft');
    rerender(fixture());
    expect(chord().defaultPrevented).toBe(true);
    expect(draft()).toBeNull();
    rerender(fixture({ enabled: false }));
    expect(chord().defaultPrevented).toBe(false);
    expect(draft()?.value).toBe('synthetic unsaved draft');
  });

  it('hides an active shell draft without changing preference bytes or seller session', async () => {
    const seller = generateWaivedSession();
    localStorage.setItem(PRIVACY_MODE_KEY, '1');
    renderApp();
    const user = userEvent.setup();
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Create invoice' }));
    await user.click(screen.getByRole('button', { name: 'Reveal details for 30 seconds' }));
    const label = 'Memo (optional, shown to the payer)';
    const memo = await screen.findByLabelText<HTMLTextAreaElement>(label);
    await user.type(memo, 'synthetic-donor300-memo');
    const preference = localStorage.getItem(PRIVACY_MODE_KEY);
    memo.focus();
    expect(chord({}, memo).defaultPrevented).toBe(true);
    expect(document.body.contains(memo)).toBe(false);
    expect(screen.queryByLabelText(label)).toBeNull();
    expect(document.body.innerHTML).not.toContain('synthetic-donor300-memo');
    expect(document.activeElement).toBe(screen.getByRole('switch', { name: 'Privacy mode' }));
    expect(getSessionPublic()).toBe(seller);
    expect(localStorage.getItem(PRIVACY_MODE_KEY)).toBe(preference);
    expect(chord({ key: 'h' }).defaultPrevented).toBe(true);
    expect(screen.queryByLabelText(label)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Reveal details for 30 seconds' }));
    expect(screen.getByLabelText(label)).toBe(memo);
    expect(memo.value).toBe('synthetic-donor300-memo');
    expect(getSessionPublic()).toBe(seller);
  });
});
