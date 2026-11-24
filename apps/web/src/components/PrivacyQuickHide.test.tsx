// @vitest-environment jsdom
import { cleanup, fireEvent, isInaccessible, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PrivacyProvider, usePrivacy } from '../lib/privacyMode';
import { PrivateHistory } from './PrivateHistory';
import { PrivacyQuickHide } from './PrivacyQuickHide';
import { SensitiveContent } from './SensitiveContent';

afterEach(cleanup);

function RevealControl() {
  const privacy = usePrivacy();
  return <button type="button" data-privacy-safe-control onClick={privacy.reveal}>Reveal page</button>;
}

function fixture({ enabled = true, shortcut = true, unlocked = true } = {}) {
  return <PrivacyProvider enabled={enabled} scope="stable-seller">
    <RevealControl />
    {shortcut && <PrivacyQuickHide />}
    <SensitiveContent><label>Private draft<input defaultValue="unsaved draft" /></label></SensitiveContent>
    <PrivateHistory scope="stable-history" unlocked={unlocked}><p>retained private transaction</p></PrivateHistory>
  </PrivacyProvider>;
}

const quickHide = (extra: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent('keydown', { key: 'H', altKey: true, shiftKey: true, bubbles: true, cancelable: true, ...extra });
  fireEvent(document, event);
  return event;
};
const reveal = () => fireEvent.click(screen.getByRole('button', { name: 'Reveal page' }));
const historyNode = () => screen.getByText('retained private transaction');

describe('one-way privacy quick-hide', () => {
  it('revokes independent history reveal and requires a new deliberate reveal after hiding', () => {
    const { rerender } = render(fixture());
    reveal();
    fireEvent.click(screen.getByRole('button', { name: 'Reveal history for 30 seconds' }));
    const retained = historyNode();
    expect(isInaccessible(retained)).toBe(false);
    expect(quickHide().defaultPrevented).toBe(true);
    expect(isInaccessible(retained)).toBe(true);
    expect(screen.queryByRole('textbox', { name: 'Private draft' })).toBeNull();

    quickHide({ key: 'h' });
    expect(isInaccessible(retained)).toBe(true);
    reveal();
    expect(isInaccessible(retained)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Reveal history for 30 seconds' }));
    expect(isInaccessible(retained)).toBe(false);

    rerender(fixture({ unlocked: false }));
    expect(isInaccessible(retained)).toBe(true);
    quickHide();
    reveal();
    expect(isInaccessible(retained)).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Reveal history for 30 seconds' }).disabled).toBe(true);
    expect(retained.isConnected).toBe(false);
    expect(screen.queryByText('retained private transaction')).toBeNull();
  });

  it('offers the same one-way action to assistive technology and ordinary button activation', () => {
    render(fixture());
    reveal();
    const button = screen.getByRole('button', { name: 'Hide sensitive details (Alt+Shift+H)' });
    expect(button.getAttribute('aria-keyshortcuts')).toBe('Alt+Shift+H');
    fireEvent.click(button);
    expect(screen.queryByRole('textbox', { name: 'Private draft' })).toBeNull();
    fireEvent.click(button);
    expect(screen.queryByRole('textbox', { name: 'Private draft' })).toBeNull();
    reveal();
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Private draft' }).value).toBe('unsaved draft');
  });

  it('does not change disabled privacy mode or consume its key chord', () => {
    render(fixture({ enabled: false }));
    expect(screen.queryByRole('button', { name: 'Hide sensitive details (Alt+Shift+H)' })).toBeNull();
    expect(quickHide().defaultPrevented).toBe(false);
    expect(screen.getByRole('textbox', { name: 'Private draft' })).toBeTruthy();
    expect(isInaccessible(historyNode())).toBe(false);
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
  ])('preserves unrelated typing, modifier combinations and composition: %j', (keys) => {
    render(fixture());
    reveal();
    expect(quickHide(keys).defaultPrevented).toBe(false);
    expect(screen.getByRole('textbox', { name: 'Private draft' })).toBeTruthy();
  });

  it('honors a key event already handled by another control', () => {
    render(fixture());
    reveal();
    const event = new KeyboardEvent('keydown', { key: 'H', altKey: true, shiftKey: true, bubbles: true, cancelable: true });
    event.preventDefault();
    fireEvent(document, event);
    expect(screen.getByRole('textbox', { name: 'Private draft' })).toBeTruthy();
  });

  it('removes the listener on component unmount and privacy-mode disable', () => {
    const { rerender } = render(fixture());
    reveal();
    rerender(fixture({ shortcut: false }));
    expect(quickHide().defaultPrevented).toBe(false);
    expect(screen.getByRole('textbox', { name: 'Private draft' })).toBeTruthy();
    rerender(fixture());
    expect(quickHide().defaultPrevented).toBe(true);
    expect(screen.queryByRole('textbox', { name: 'Private draft' })).toBeNull();
    rerender(fixture({ enabled: false }));
    expect(quickHide().defaultPrevented).toBe(false);
    expect(screen.getByRole('textbox', { name: 'Private draft' })).toBeTruthy();
  });
});
