// @vitest-environment jsdom
// Ported from #355 `0fb2831a` (components/WalletDisclosure.quickHide.test.tsx). On main the Alt+Shift+H shortcut lives
// in PrivacyControls (there is no PrivacyQuickHide), so the real header control replaces the donor's stand-ins.
import { useState, type ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { WalletDisclosureProvider, useWalletDisclosure } from './WalletDisclosure';
import { PrivacyControls } from './PrivacyControls';
import { SensitiveContent } from './SensitiveContent';
import { PrivacyProvider, resetPrivacyModeForTests, revokePrivacyReveal } from '../lib/privacyMode';
import { connectWallet, sendViaWallet, type WalletInfo, type WalletSession } from '../lib/wallet';
import { clearSession } from '../lib/session';
import { MockWallet } from '../test/mockWallet';

const TARGET = '0x1111111111111111111111111111111111111111';
const REVEAL = 'Reveal details for 30 seconds';
const info = (provider: MockWallet): WalletInfo => ({ id: 'mock', name: 'Mock', kind: 'injected', provider });
afterEach(() => {
  cleanup(); document.documentElement.removeAttribute('tabindex'); clearSession(); revokePrivacyReveal(); resetPrivacyModeForTests();
});

function Client(props: { readonly provider: MockWallet }): ReactNode {
  const disclosure = useWalletDisclosure();
  const [session, setSession] = useState<WalletSession>();
  const [status, setStatus] = useState('Ready');
  return <>
    <button type="button" onClick={() => { void connectWallet(info(props.provider), 84532, undefined, undefined, { disclosure }).then((next) => { setSession(next); setStatus('Connected'); }, () => { setStatus('Cancelled'); }); }}>Connect</button>
    <button type="button" disabled={session === undefined} onClick={() => {
      if (session === undefined) return;
      void sendViaWallet(session, { to: TARGET, data: '0x1234', value: 10n }).then(() => { setStatus('Submitted'); }, () => { setStatus('Cancelled'); });
    }}>Send</button>
    <p>{status}</p>
  </>;
}

/** The shell's order: the privacy controls sit in the disclosure provider's background, outside every privacy boundary. */
function PrivateWallet(props: { readonly provider: MockWallet }): ReactNode {
  return <>
    <header><PrivacyControls /></header>
    <SensitiveContent><Client provider={props.provider} /></SensitiveContent>
  </>;
}
function renderPrivateWallet(provider: MockWallet): void {
  const scope = {};
  render(<PrivacyProvider enabled scope={scope}><WalletDisclosureProvider scope={scope}>
    <PrivateWallet provider={provider} />
  </WalletDisclosureProvider></PrivacyProvider>);
}

describe('mounted wallet disclosure quick-hide focus recovery', () => {
  it('quick hide restores focus only after the privacy control is no longer inert', async () => {
    const provider = new MockWallet();
    renderPrivateWallet(provider);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: REVEAL }));
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    await user.click(await screen.findByRole('button', { name: 'Continue to wallet' }));
    await screen.findByText('Connected');
    const connectedCalls = [...provider.calls];
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByRole('dialog', { name: 'Review wallet disclosure' });
    const blockedFocus: string[] = [];
    const recordFocus = (event: FocusEvent): void => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('[hidden], [inert]') !== null) {
        blockedFocus.push(target.getAttribute('aria-label') ?? target.textContent ?? target.tagName);
      }
    };
    document.addEventListener('focusin', recordFocus, true);
    try {
      await user.keyboard('{Alt>}{Shift>}H{/Shift}{/Alt}');
      await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull(); });
      expect(provider.calls).toEqual(connectedCalls);
      expect(provider.sent).toBeUndefined();
      expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
      expect(blockedFocus).toEqual([]);
      expect(document.activeElement).toBe(screen.getByRole('switch', { name: 'Privacy mode' }));
    } finally { document.removeEventListener('focusin', recordFocus, true); }
  });

  it.each(['body', 'documentElement'] as const)('quick hide focuses the privacy control when the caller left focus on %s', async (rootName) => {
    const provider = new MockWallet();
    renderPrivateWallet(provider);
    const user = userEvent.setup();
    const reveal = screen.getByRole('button', { name: REVEAL });
    await user.click(reveal);
    // A real wallet caller can disable its initiating button while awaiting preflight.
    // Browsers then leave body as the active element before the disclosure is requested.
    const root = document[rootName];
    (document.activeElement as HTMLElement | null)?.blur();
    if (rootName === 'documentElement') { root.setAttribute('tabindex', '-1'); root.focus(); }
    try {
      expect(document.activeElement).toBe(root);
      fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
      await screen.findByRole('dialog', { name: 'Review wallet disclosure' });
      await user.keyboard('{Alt>}{Shift>}H{/Shift}{/Alt}');
      await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull(); });
      expect(provider.calls).toEqual([]);
      expect(screen.queryByRole('button', { name: 'Connect' })).toBeNull();
      const safe = screen.getByRole('switch', { name: 'Privacy mode' });
      expect(safe.closest('[hidden], [inert]')).toBeNull();
      expect(document.activeElement).toBe(safe);
    } finally { if (rootName === 'documentElement') root.removeAttribute('tabindex'); }
  });
});
