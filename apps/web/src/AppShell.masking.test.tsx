// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrivacyControls } from './components/PrivacyControls';
import { WalletDisclosureProvider, useWalletDisclosure } from './components/WalletDisclosure';
import { notifyAppLock } from './lib/appLock';
import { PRIVACY_MODE_KEY, PrivacyProvider, resetPrivacyModeForTests, revokePrivacyReveal } from './lib/privacyMode';
import { clearSession } from './lib/session';
import { prepareWalletConnection } from './lib/walletDisclosure';
import { generateWaivedSession } from './test/keys';
import { renderApp } from './test/render';

const MEMO = 'Synthetic private memo 7f3a';
const MEMO_LABEL = 'Memo (optional, shown to the payer)';
const nav = () => within(screen.getByRole('navigation', { name: 'Main' }));
/** The masked value must be absent from text, attributes and live form values, not merely styled away. */
function documentReveals(value: string): boolean {
  if (document.body.textContent?.includes(value) === true || document.body.outerHTML.includes(value) || document.title.includes(value)) return true;
  return [...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')].some((field) => field.value.includes(value));
}

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); resetPrivacyModeForTests(); clearSession(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); resetPrivacyModeForTests(); clearSession(); });

describe('global sensitive-data masking in the shell (#286 item 1)', () => {
  it('is off by default: no route is masked and the switch is unchecked', async () => {
    generateWaivedSession();
    renderApp();
    expect(screen.getByRole<HTMLInputElement>('switch', { name: 'Privacy mode' }).checked).toBe(false);
    await userEvent.setup().click(nav().getByRole('button', { name: 'Create invoice' }));
    expect(await screen.findByLabelText(MEMO_LABEL)).toBeTruthy();
    expect(screen.queryByText('Sensitive details are hidden.')).toBeNull();
  });

  it('removes a masked workflow from the live document, keeps its draft, and reveals only deliberately', async () => {
    generateWaivedSession();
    renderApp();
    const user = userEvent.setup();
    await user.click(nav().getByRole('button', { name: 'Create invoice' }));
    await user.type(await screen.findByLabelText(MEMO_LABEL), MEMO);

    await user.click(screen.getByRole('switch', { name: 'Privacy mode' }));
    expect(localStorage.getItem(PRIVACY_MODE_KEY)).toBe('1');
    expect(screen.getByText('Sensitive details are hidden.')).toBeTruthy();
    expect(screen.queryByLabelText(MEMO_LABEL)).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Create invoice' })).toBeNull();
    expect(documentReveals(MEMO)).toBe(false);
    // The shell's live region is masked too: nothing private can be announced while hidden.
    expect(document.querySelector('[aria-live="polite"].sr-only')).toBeNull();
    // The neutral control keeps focus inside the live document.
    expect(document.activeElement === document.body || document.body.contains(document.activeElement)).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Reveal details for 30 seconds' }));
    expect(screen.getByText('Sensitive details are temporarily visible.')).toBeTruthy();
    expect(screen.getByLabelText<HTMLTextAreaElement>(MEMO_LABEL).value).toBe(MEMO); // The draft survived masking.

    await user.click(screen.getByRole('button', { name: /Hide sensitive details/ }));
    expect(documentReveals(MEMO)).toBe(false);
  });

  it('keeps Home public, and navigation or a lock ends a reveal', async () => {
    localStorage.setItem(PRIVACY_MODE_KEY, '1');
    generateWaivedSession();
    renderApp();
    const user = userEvent.setup();
    expect(screen.getByRole<HTMLInputElement>('switch', { name: 'Privacy mode' }).checked).toBe(true);
    expect(screen.getByRole('heading', { level: 2 })).toBeTruthy(); // Home renders while masked.

    await user.click(nav().getByRole('button', { name: 'Create invoice' }));
    expect(screen.queryByLabelText(MEMO_LABEL)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Reveal details for 30 seconds' }));
    expect(await screen.findByLabelText(MEMO_LABEL)).toBeTruthy();
    await user.click(nav().getByRole('button', { name: 'Home' }));
    await user.click(nav().getByRole('button', { name: 'Create invoice' }));
    expect(screen.queryByLabelText(MEMO_LABEL)).toBeNull(); // Navigation revoked the reveal.

    await user.click(screen.getByRole('button', { name: 'Reveal details for 30 seconds' }));
    expect(await screen.findByLabelText(MEMO_LABEL)).toBeTruthy();
    act(() => { notifyAppLock('manual'); });
    expect(screen.queryByLabelText(MEMO_LABEL)).toBeNull();
  });

  it('hides with the one-way Alt+Shift+H shortcut', async () => {
    localStorage.setItem(PRIVACY_MODE_KEY, '1');
    generateWaivedSession();
    renderApp();
    const user = userEvent.setup();
    await user.click(nav().getByRole('button', { name: 'Create invoice' }));
    await user.click(screen.getByRole('button', { name: 'Reveal details for 30 seconds' }));
    expect(await screen.findByLabelText(MEMO_LABEL)).toBeTruthy();
    await user.keyboard('{Alt>}{Shift>}H{/Shift}{/Alt}');
    expect(screen.queryByLabelText(MEMO_LABEL)).toBeNull();
    expect(localStorage.getItem(PRIVACY_MODE_KEY)).toBe('1'); // Quick hide never changes the preference.
  });
});

describe('wallet request review under masking', () => {
  function Requester({ onResult }: { readonly onResult: (result: string) => void }): React.ReactNode {
    const gate = useWalletDisclosure();
    const [started, setStarted] = useState(0);
    useEffect(() => {
      if (started === 0) return;
      gate(prepareWalletConnection(84532).disclosure).then(() => { onResult('approved'); }, (e: unknown) => { onResult(String((e as { translation?: { key?: string } }).translation?.key ?? e)); });
    }, [started, gate, onResult]);
    return <button type="button" onClick={() => { setStarted((n) => n + 1); }}>request</button>;
  }
  it('refuses a review while masked and cancels an open review when masking resumes', async () => {
    const results: string[] = [];
    render(<PrivacyProvider enabled scope="s"><PrivacyControls /><WalletDisclosureProvider scope="w"><Requester onResult={(r) => { results.push(r); }} /></WalletDisclosureProvider></PrivacyProvider>);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'request' }));
    await waitFor(() => { expect(results).toEqual(['wallet.disclosure.unavailable']); });
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Reveal details for 30 seconds' }));
    await user.click(screen.getByRole('button', { name: 'request' }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    act(() => { revokePrivacyReveal(); });
    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull(); });
    await waitFor(() => { expect(results).toHaveLength(2); });
    expect(results[1]).not.toBe('approved');
  });
});
