// @vitest-environment jsdom
import { useState, type ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { WalletDisclosureProvider, useWalletDisclosure } from './WalletDisclosure';
import { PrivacyProvider, usePrivacy } from '../lib/privacyMode';
import { PrivacyQuickHide } from './PrivacyQuickHide';
import { SensitiveContent } from './SensitiveContent';
import { notifyAppLock } from '../lib/appLock';
import { connectWallet, sendViaWallet, type WalletInfo, type WalletSession } from '../lib/wallet';
import { clearSession } from '../lib/session';
import { MockWallet } from '../test/mockWallet';

const TARGET = '0x1111111111111111111111111111111111111111';
const info = (provider: MockWallet): WalletInfo => ({ id: 'mock', name: 'Mock', kind: 'injected', provider });
afterEach(() => { cleanup(); clearSession(); });
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
function App(props: { readonly provider: MockWallet; readonly scope: object; readonly private?: boolean }): ReactNode {
  return <PrivacyProvider enabled={props.private === true} scope={props.scope}>
    <WalletDisclosureProvider scope={props.scope}><Client provider={props.provider} /></WalletDisclosureProvider>
  </PrivacyProvider>;
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

describe('mounted wallet disclosure and real wallet entry points', () => {
  it('presents account access before any provider request and only proceeds after explicit continue', async () => {
    const provider = new MockWallet(); const scope = {};
    render(<App provider={provider} scope={scope} />);
    const user = userEvent.setup();
    const opener = screen.getByRole('button', { name: 'Connect' });
    await user.click(opener);
    const dialog = await screen.findByRole('dialog', { name: 'Review wallet disclosure' });
    expect(provider.calls).toEqual([]);
    expect(within(dialog).getByText('eth_requestAccounts')).toBeTruthy();
    expect(within(dialog).getByText('Not known before this request')).toBeTruthy();
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancel wallet request' }));
    await user.click(within(dialog).getByRole('button', { name: 'Continue to wallet' }));
    await screen.findByText('Connected');
    expect(provider.calls[0]?.method).toBe('eth_requestAccounts');
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => { expect(document.activeElement).toBe(opener); });
  });
  it('Escape cancels without disclosing accounts and leaves the app usable', async () => {
    const provider = new MockWallet(); render(<App provider={provider} scope={{}} />);
    const user = userEvent.setup(); await user.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByRole('dialog'); await user.keyboard('{Escape}');
    await screen.findByText('Cancelled');
    expect(provider.calls).toEqual([]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('shows exact transaction data and a separately labelled native amount before sending', async () => {
    const provider = new MockWallet(); render(<App provider={provider} scope={{}} />);
    const user = userEvent.setup(); await user.click(screen.getByRole('button', { name: 'Connect' }));
    await user.click(await screen.findByRole('button', { name: 'Continue to wallet' }));
    await screen.findByText('Connected'); provider.calls.length = 0;
    await user.click(screen.getByRole('button', { name: 'Send' }));
    const dialog = await screen.findByRole('dialog');
    expect(provider.calls).toEqual([]);
    expect(within(dialog).getByText(TARGET)).toBeTruthy();
    expect(within(dialog).getByText('Native amount (wei)')).toBeTruthy();
    expect(within(dialog).getByText('10')).toBeTruthy();
    await user.click(within(dialog).getByText('Exact request (JSON)'));
    expect(within(dialog).getByText(/"data":"0x1234"/)).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Continue to wallet' }));
    await screen.findByText('Submitted');
    expect(provider.sent).toMatchObject({ to: TARGET, data: '0x1234', value: '0xa' });
  });
  it('conceals and cancels an open payload on privacy hide or app lock', async () => {
    const provider = new MockWallet(); const scope = {};
    const mounted = render(<App provider={provider} scope={scope} />);
    const user = userEvent.setup(); await user.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByRole('dialog');
    mounted.rerender(<App provider={provider} scope={scope} private />);
    await screen.findByText('Cancelled'); expect(screen.queryByRole('dialog')).toBeNull();
    expect(provider.calls).toEqual([]);
    mounted.rerender(<App provider={provider} scope={scope} />);
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByRole('dialog'); act(() => { notifyAppLock('manual'); });
    await screen.findByText('Cancelled'); expect(screen.queryByRole('dialog')).toBeNull();
    expect(provider.calls).toEqual([]);
  });
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
  it('cancellation falls back when the real initiating button becomes disabled', async () => {
    const provider = new MockWallet(); const scope = {};
    render(<PrivacyProvider enabled scope={scope}><WalletDisclosureProvider scope={scope}>
      <PrivateWallet provider={provider} />
    </WalletDisclosureProvider></PrivacyProvider>);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Reveal details' }));
    const connect = screen.getByRole<HTMLButtonElement>('button', { name: 'Connect' });
    await user.click(connect);
    const dialog = await screen.findByRole('dialog', { name: 'Review wallet disclosure' });
    connect.disabled = true;
    await user.click(within(dialog).getByRole('button', { name: 'Cancel wallet request' }));
    await screen.findByText('Cancelled');
    expect(provider.calls).toEqual([]);
    expect(connect.disabled).toBe(true);
    expect(connect.closest('[hidden], [inert]')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('switch', { name: 'Privacy mode' }));
  });
  it('route/scope changes and unmount cancel the prompt rather than keeping its approval alive', async () => {
    const provider = new MockWallet(); const mounted = render(<App provider={provider} scope={{}} />);
    const user = userEvent.setup(); await user.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByRole('dialog'); mounted.rerender(<App provider={provider} scope={{}} />);
    await screen.findByText('Cancelled'); expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByRole('dialog'); mounted.unmount();
    expect(provider.calls).toEqual([]);
  });
  it('focus stays in the dialog and missing host refuses without provider calls', async () => {
    const provider = new MockWallet(); const mounted = render(<App provider={provider} scope={{}} />);
    const user = userEvent.setup(); await user.click(screen.getByRole('button', { name: 'Connect' }));
    const dialog = await screen.findByRole('dialog');
    const button = within(dialog).getByRole('button', { name: 'Continue to wallet' });
    button.focus(); fireEvent.keyDown(document, { key: 'Tab' });
    expect(dialog.contains(document.activeElement)).toBe(true);
    mounted.unmount();
    render(<Client provider={provider} />);
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByText('Cancelled'); expect(provider.calls).toEqual([]);
  });
});
