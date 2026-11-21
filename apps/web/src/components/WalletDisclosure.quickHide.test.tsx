// @vitest-environment jsdom
// Preserve the three mounted quick-hide regressions from the released R3 focus repair.
import { useState, type ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { WalletDisclosureProvider, useWalletDisclosure } from './WalletDisclosure';
import { PrivacyProvider, usePrivacy } from '../lib/privacyMode';
import { PrivacyQuickHide } from './PrivacyQuickHide';
import { SensitiveContent } from './SensitiveContent';
import { connectWallet, sendViaWallet, type WalletInfo, type WalletSession } from '../lib/wallet';
import { clearSession } from '../lib/session';
import { MockWallet } from '../test/mockWallet';

const TARGET = '0x1111111111111111111111111111111111111111';
const info = (provider: MockWallet): WalletInfo => ({ id: 'mock', name: 'Mock', kind: 'injected', provider });
afterEach(() => { cleanup(); document.documentElement.removeAttribute('tabindex'); clearSession(); });

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

function PrivateWallet(props: { readonly provider: MockWallet }): ReactNode {
  const privacy = usePrivacy();
  return <>
    <header>
      <input type="checkbox" role="switch" aria-label="Privacy mode" data-privacy-safe-control />
      <button type="button" onClick={privacy.reveal}>Reveal details</button>
      <PrivacyQuickHide />
    </header>
    <SensitiveContent><Client provider={props.provider} /></SensitiveContent>
  </>;
}

describe('mounted wallet disclosure quick-hide focus recovery', () => {
  it('quick hide restores focus only after the privacy control is no longer inert', async () => {
    const provider = new MockWallet(); const scope = {};
    render(<PrivacyProvider enabled scope={scope}><WalletDisclosureProvider scope={scope}>
      <PrivateWallet provider={provider} />
    </WalletDisclosureProvider></PrivacyProvider>);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Reveal details' }));
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
    const provider = new MockWallet(); const scope = {};
    render(<PrivacyProvider enabled scope={scope}><WalletDisclosureProvider scope={scope}>
      <PrivateWallet provider={provider} />
    </WalletDisclosureProvider></PrivacyProvider>);
    const user = userEvent.setup();
    const reveal = screen.getByRole('button', { name: 'Reveal details' });
    await user.click(reveal);
    // A real wallet caller can disable its initiating button while awaiting preflight.
    // Browsers then leave body as the active element before the disclosure is requested.
    const root = document[rootName];
    reveal.blur();
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
