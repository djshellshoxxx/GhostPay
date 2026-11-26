// @vitest-environment jsdom
import { useState, type ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WalletDisclosureProvider, useWalletDisclosure } from './WalletDisclosure';
import { notifyAppLock } from '../lib/appLock';
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
// Main has no global privacy mask yet (#569), so the provider presents directly; the mask cases of the donor are omitted.
function App(props: { readonly provider: MockWallet; readonly scope: object }): ReactNode {
  return <WalletDisclosureProvider scope={props.scope}><Client provider={props.provider} /></WalletDisclosureProvider>;
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
  it('waits for a hidden page to become visible before showing a review, then shows it', async () => {
    const provider = new MockWallet(); render(<App provider={provider} scope={{}} />);
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.getByText('Ready')).toBeTruthy();
      visibility.mockReturnValue('visible');
      act(() => { document.dispatchEvent(new Event('visibilitychange')); });
      const dialog = await screen.findByRole('dialog', { name: 'Review wallet disclosure' });
      expect(provider.calls).toEqual([]);
      fireEvent.click(within(dialog).getByRole('button', { name: 'Continue to wallet' }));
      await screen.findByText('Connected');
    } finally { visibility.mockRestore(); }
  });
  it('Escape cancels without disclosing accounts and leaves the app usable', async () => {
    const provider = new MockWallet(); render(<App provider={provider} scope={{}} />);
    const user = userEvent.setup(); await user.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByRole('dialog'); await user.keyboard('{Escape}');
    await screen.findByText('Cancelled');
    expect(provider.calls).toEqual([]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it.each(['body', 'document element', 'disabled', 'nonfocusable', 'disconnected', 'hidden', 'inert'] as const)(
    'returns focus to the page heading when the captured opener is %s', async (kind) => {
      const provider = new MockWallet();
      render(<>
        <h2>Page heading</h2>
        <div data-testid="temporary-focus" tabIndex={-1} />
        <App provider={provider} scope={{}} />
      </>);
      const user = userEvent.setup();
      const connect = screen.getByRole('button', { name: 'Connect' });
      const safeControl = screen.getByRole('heading', { name: 'Page heading' });
      const opener = kind === 'body' ? document.body
        : kind === 'document element' ? document.documentElement
          : kind === 'nonfocusable' ? screen.getByTestId('temporary-focus') : connect;
      if (kind === 'document element') opener.tabIndex = -1;
      if (kind !== 'body') opener.focus();
      expect(document.activeElement).toBe(opener);
      // An asynchronous caller can open the presenter after its original control loses focus.
      fireEvent.click(connect);
      const dialog = await screen.findByRole('dialog');
      if (kind === 'disabled') connect.setAttribute('disabled', '');
      else if (kind === 'nonfocusable') opener.removeAttribute('tabindex');
      else if (kind === 'disconnected') opener.remove();
      else if (kind === 'hidden') opener.hidden = true;
      else if (kind === 'inert') opener.setAttribute('inert', '');
      await user.click(within(dialog).getByRole('button', { name: 'Cancel wallet request' }));
      await screen.findByText('Cancelled');
      await waitFor(() => { expect(document.activeElement).toBe(safeControl); });
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(provider.calls).toEqual([]);
    },
  );
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
  it('cancels an open payload on app lock', async () => {
    const provider = new MockWallet(); const scope = {};
    render(<App provider={provider} scope={scope} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByRole('dialog'); act(() => { notifyAppLock('manual'); });
    await screen.findByText('Cancelled'); expect(screen.queryByRole('dialog')).toBeNull();
    expect(provider.calls).toEqual([]);
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
