// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, SETTINGS_KEY, type Settings as SettingsData } from '../lib/settings';
import { exportSettingsExchange, EXCHANGE_SECTIONS } from '../lib/settingsExchange';
import { ServicesContext } from '../lib/services';
import { AppContext, type AppState } from '../state';
import { makeServices, renderApp } from '../test/render';
import { Settings } from './Settings';

const PIN_A = `02${'ab'.repeat(32)}`;
const PIN_B = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const PIN_C = `03${'ab'.repeat(32)}`;
const CHAIN_IDS = makeServices().chains.map((c) => c.chainId);
const other: SettingsData = {
  ...DEFAULT_SETTINGS, theme: 'dark', lockTimeoutMin: 5,
  rpcUrls: { '84532': 'https://base.example/v3/KEY', '11155111': 'https://sep.example/' },
  rpcUrlsSecondary: { '84532': 'https://second.example/' },
  relayerUrl: 'https://relay.example',
  pinnedSigners: [PIN_A, PIN_B],
};
const mine: SettingsData = { ...DEFAULT_SETTINGS, rpcUrls: { '84532': 'https://old.example/', '97': 'https://keep.example/' }, pinnedSigners: [PIN_B, PIN_C] };
const code = (s: SettingsData, sections = EXCHANGE_SECTIONS): string => exportSettingsExchange(s, sections, CHAIN_IDS);
const stored = (): Record<string, unknown> => JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? '{}') as Record<string, unknown>;

beforeEach(() => { window.localStorage.clear(); window.history.replaceState(null, '', '/'); });

/** Settings with real React state and a replaceable save, so failures can be simulated. */
function Harness(props: { readonly initial: SettingsData; readonly save?: (s: SettingsData) => boolean; readonly services?: ReturnType<typeof makeServices> }): ReactNode {
  const [settings, setSettings] = useState(props.initial);
  const app: AppState = {
    view: 'settings', setView: () => undefined, settings,
    updateSettings: (s) => { const ok = (props.save ?? (() => true))(s); setSettings(s); return ok; },
    session: undefined, fragment: undefined, setFragment: () => undefined, matches: [], setMatches: () => undefined,
    sweepTarget: undefined, selectForSweep: () => undefined, getRpc: () => Promise.resolve(undefined),
    getSecondaryRpc: () => Promise.resolve(undefined), announce: () => undefined,
  };
  return <ServicesContext.Provider value={props.services ?? makeServices()}><AppContext.Provider value={app}><Settings /></AppContext.Provider></ServicesContext.Provider>;
}

const panel = (): HTMLElement => screen.getByRole('region', { name: 'Move settings to your other devices' });
async function importText(user: ReturnType<typeof userEvent.setup>, text: string): Promise<void> {
  fireEvent.change(within(panel()).getByLabelText('Or paste QR text'), { target: { value: text } });
  await user.click(within(panel()).getByRole('button', { name: 'Use pasted text' }));
}
const box = (name: string | RegExp): HTMLInputElement => within(panel()).getByRole<HTMLInputElement>('checkbox', { name });

describe('Settings exchange: export', () => {
  it('preselects preferences only, disables empty sections and lists exactly what the QR contains', async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ ...other, relayerUrl: '' }} />);
    expect(box('Preferences (delay, idle lock, theme, address bar)').checked).toBe(true);
    for (const name of ['RPC endpoints', 'Second RPC endpoints', 'Relayer URL', 'Pinned signer public keys']) expect(box(name).checked).toBe(false);
    const list = (): string[] => within(within(panel()).getByRole('list', { name: 'The QR will contain exactly:' })).getAllByRole('listitem').map((li) => li.textContent ?? '');
    expect(list()).toEqual(['Preferences (delay, idle lock, theme, address bar): delay 120–900 s, idle lock 5 min, theme Dark, remove invoice from address bar: Yes']);
    expect(within(panel()).queryByText(/they show which providers you use/)).toBeNull();
    await user.click(box('RPC endpoints'));
    await user.click(box('Relayer URL'));
    await user.click(box('Pinned signer public keys'));
    await user.click(box('Preferences (delay, idle lock, theme, address bar)'));
    expect(list()).toEqual([
      'RPC endpoints: Base Sepolia (chain 84532): base.example',
      'RPC endpoints: Ethereum Sepolia (chain 11155111): sep.example',
      'Relayer URL: none (the other device can choose to clear its relayer)',
      `Pinned signer public keys: ${PIN_A.slice(0, 10)}…${PIN_A.slice(-8)}`,
      `Pinned signer public keys: ${PIN_B.slice(0, 10)}…${PIN_B.slice(-8)}`,
    ]);
    // Full URL paths (which may hold an API key) are in the QR, not in the on-screen listing.
    expect(within(panel()).queryByText(/v3\/KEY/)).toBeNull();
    expect(within(panel()).getByText(/they show which providers you use/)).toBeTruthy();

    render(<Harness initial={DEFAULT_SETTINGS} />, { container: document.body.appendChild(document.createElement('div')) });
    const second = screen.getAllByRole('region', { name: 'Move settings to your other devices' })[1];
    if (second === undefined) throw new Error('missing');
    expect((within(second).getByRole<HTMLInputElement>('checkbox', { name: 'RPC endpoints' })).disabled).toBe(true);
    expect((within(second).getByRole<HTMLInputElement>('checkbox', { name: 'Pinned signer public keys' })).disabled).toBe(true);
    expect((within(second).getByRole<HTMLInputElement>('checkbox', { name: 'Relayer URL' })).disabled).toBe(false);
  });

  it('renders the selection as a MY DEVICES QR and hides it again when the selection changes', async () => {
    const user = userEvent.setup();
    render(<Harness initial={other} />);
    await user.click(box('RPC endpoints'));
    await user.click(within(panel()).getByRole('button', { name: 'Show settings QR' }));
    expect(within(panel()).getAllByText('MY DEVICES').length).toBeGreaterThan(0);
    expect(within(panel()).getByRole('button', { name: 'Hide settings QR' })).toBeTruthy();
    // Endpoint URLs can hold API keys: no copy-as-text or SVG download that would leave them in the clipboard or Downloads.
    expect(within(panel()).queryByRole('button', { name: 'Copy as text' })).toBeNull();
    expect(within(panel()).queryByRole('button', { name: 'Download SVG' })).toBeNull();
    await user.click(box('Second RPC endpoints'));
    expect(within(panel()).queryByRole('button', { name: 'Hide settings QR' })).toBeNull();
    await user.click(box('Preferences (delay, idle lock, theme, address bar)'));
    await user.click(box('RPC endpoints'));
    await user.click(box('Second RPC endpoints'));
    expect(within(panel()).getByText('Nothing is selected. Select at least one section.')).toBeTruthy();
    expect((within(panel()).getByRole<HTMLButtonElement>('button', { name: 'Show settings QR' })).disabled).toBe(true);
  });

  it('refuses a selection that does not fit one QR with a clear message', async () => {
    const user = userEvent.setup();
    const long = (host: string): string => `https://${host}.example/${'k'.repeat(700)}`;
    render(<Harness initial={{ ...other, rpcUrls: { '84532': long('a'), '11155111': long('b') }, rpcUrlsSecondary: { '84532': long('c'), '97': long('d') } }} />);
    await user.click(box('RPC endpoints'));
    await user.click(box('Second RPC endpoints'));
    await user.click(within(panel()).getByRole('button', { name: 'Show settings QR' }));
    expect(within(panel()).getByText(/too large for one QR code/)).toBeTruthy();
    expect(within(panel()).queryByRole('button', { name: 'Hide settings QR' })).toBeNull();
  });
});

describe('Settings exchange: import', () => {
  it('previews each section against this device with endpoint and trust sections unticked, and never contacts imported endpoints', async () => {
    const user = userEvent.setup();
    const createRpc = vi.fn(() => Promise.reject(new Error('no rpc')));
    const fetchFn = vi.fn(() => Promise.reject(new Error('no network')));
    render(<Harness initial={mine} services={makeServices({ createRpc, fetchFn })} />);
    await importText(user, code(other));
    expect(within(panel()).getByText('Review imported settings')).toBeTruthy();
    expect(createRpc).not.toHaveBeenCalled();
    expect(fetchFn).not.toHaveBeenCalled();
    const rpc = within(panel()).getByRole('group', { name: 'RPC endpoints' });
    expect(within(rpc).getByText('https://old.example/')).toBeTruthy();
    expect(within(rpc).getByText('https://base.example/v3/KEY')).toBeTruthy();
    expect(within(rpc).getByText('none')).toBeTruthy();
    expect(within(rpc).getByText(/Only the chains listed are replaced/)).toBeTruthy();
    expect(box('Apply Preferences (delay, idle lock, theme, address bar)').checked).toBe(true);
    for (const name of ['Apply RPC endpoints', 'Apply Second RPC endpoints', 'Apply Relayer URL']) expect(box(name).checked).toBe(false);
    const signers = within(panel()).getByRole('group', { name: 'Pinned signer public keys' });
    expect(within(signers).getByText(/Pinning a signing key means trusting the invoices it signs/)).toBeTruthy();
    expect(within(signers).getByText('1 key is already pinned here.')).toBeTruthy();
    expect((within(signers).getByRole<HTMLInputElement>('checkbox', { name: `Pin ${PIN_A.slice(0, 10)}…${PIN_A.slice(-8)}` })).checked).toBe(false);
    expect(within(signers).getByText(`Pinned here only: ${PIN_C.slice(0, 10)}…${PIN_C.slice(-8)}`)).toBeTruthy();
    expect((within(signers).getByRole<HTMLInputElement>('checkbox', { name: 'Also unpin 1 key that the other device does not pin' })).checked).toBe(false);
  });

  it('applies only the selected sections in one save, merging RPC chains', async () => {
    const user = userEvent.setup();
    const save = vi.fn(() => true);
    render(<Harness initial={mine} save={save} />);
    await importText(user, code(other));
    await user.click(box('Apply Preferences (delay, idle lock, theme, address bar)'));
    await user.click(box('Apply RPC endpoints'));
    await user.click(within(panel()).getByRole('button', { name: 'Apply selected settings' }));
    // An imported RPC endpoint is a trust change: it is listed host by host and needs a second confirmation.
    expect(save).not.toHaveBeenCalled();
    const dialog = within(panel()).getByRole('alertdialog', { name: 'Confirm trust changes' });
    expect(within(dialog).getByText(/RPC endpoints: Base Sepolia \(chain 84532\) old\.example → base\.example\. This endpoint sees which addresses you check/)).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Confirm and apply' }));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ ...mine, rpcUrls: { '84532': 'https://base.example/v3/KEY', '97': 'https://keep.example/', '11155111': 'https://sep.example/' } });
    expect(within(panel()).getByText('Settings saved.')).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>('Base Sepolia RPC URL').value).toBe('https://base.example/v3/KEY');
    expect(screen.getByLabelText<HTMLSelectElement>('Theme').value).toBe('system');
  });

  it('asks for a second confirmation before changing the relayer or signer trust', async () => {
    const user = userEvent.setup();
    const save = vi.fn(() => true);
    render(<Harness initial={mine} save={save} />);
    await importText(user, code(other));
    await user.click(box('Apply Preferences (delay, idle lock, theme, address bar)'));
    await user.click(box('Apply Relayer URL'));
    await user.click(box(`Pin ${PIN_A.slice(0, 10)}…${PIN_A.slice(-8)}`));
    await user.click(box('Also unpin 1 key that the other device does not pin'));
    await user.click(within(panel()).getByRole('button', { name: 'Apply selected settings' }));
    expect(save).not.toHaveBeenCalled();
    const dialog = within(panel()).getByRole('alertdialog', { name: 'Confirm trust changes' });
    expect(within(dialog).getByText('Relayer: none → https://relay.example')).toBeTruthy();
    expect(within(dialog).getByText(`Trust invoices signed by ${PIN_A.slice(0, 10)}…${PIN_A.slice(-8)}`)).toBeTruthy();
    expect(within(dialog).getByText(`Stop pinning ${PIN_C.slice(0, 10)}…${PIN_C.slice(-8)}`)).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Back' }));
    expect(save).not.toHaveBeenCalled();
    await user.click(within(panel()).getByRole('button', { name: 'Apply selected settings' }));
    await user.click(within(panel()).getByRole('button', { name: 'Confirm and apply' }));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ ...mine, relayerUrl: 'https://relay.example', pinnedSigners: [PIN_B, PIN_A] });
    expect(screen.getByLabelText<HTMLInputElement>('Relayer URL (optional)').value).toBe('https://relay.example');
    expect(screen.getByLabelText<HTMLTextAreaElement>(/Pinned seller signing keys/).value).toBe(`${PIN_B}\n${PIN_A}`);
  });

  it('is atomic: a failing save leaves every setting and form field untouched', async () => {
    const user = userEvent.setup();
    const save = vi.fn(() => { throw new Error('quota'); });
    render(<Harness initial={mine} save={save} />);
    await importText(user, code(other));
    await user.click(box('Apply RPC endpoints'));
    await user.click(within(panel()).getByRole('button', { name: 'Apply selected settings' }));
    await user.click(within(panel()).getByRole('button', { name: 'Confirm and apply' }));
    expect(save).toHaveBeenCalledTimes(1);
    expect(within(panel()).getByText(/Nothing was changed/)).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>('Base Sepolia RPC URL').value).toBe('https://old.example/');
    expect(screen.getByLabelText<HTMLSelectElement>('Theme').value).toBe('system');
  });

  it('shows "no changes" when the same code is imported again', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Settings' }));
    const text = code(other, ['preferences', 'rpcUrls']);
    await importText(user, text);
    await user.click(box('Apply RPC endpoints'));
    await user.click(within(panel()).getByRole('button', { name: 'Apply selected settings' }));
    await user.click(within(panel()).getByRole('button', { name: 'Confirm and apply' }));
    expect(stored()).toMatchObject({ theme: 'dark', rpcUrls: { '84532': 'https://base.example/v3/KEY', '11155111': 'https://sep.example/' } });
    expect(within(panel()).queryByText('Review imported settings')).toBeNull();
    await importText(user, text);
    expect(within(panel()).getByText('No changes: this device already has these settings.')).toBeTruthy();
    expect(within(panel()).queryByRole('button', { name: 'Apply selected settings' })).toBeNull();
    expect(within(panel()).getAllByText('unchanged').length).toBe(2);
  });

  it('still imports a v1 preferences QR and keeps endpoints and trust untouched', async () => {
    const user = userEvent.setup();
    const save = vi.fn(() => true);
    render(<Harness initial={mine} save={save} />);
    const v1 = JSON.stringify({ format: 'ghostpay-settings', v: 1, settings: { delayMinSec: 0, delayMaxSec: 60, lockTimeoutMin: 30, theme: 'light', autoClearFragment: false } });
    await importText(user, v1);
    expect(within(panel()).queryByRole('group', { name: 'RPC endpoints' })).toBeNull();
    await user.click(within(panel()).getByRole('button', { name: 'Apply selected settings' }));
    // Shorter delays, a longer idle lock and keeping invoices in the address bar weaken protection: confirm first.
    expect(save).not.toHaveBeenCalled();
    expect(within(within(panel()).getByRole('alertdialog', { name: 'Confirm trust changes' })).getByText(/^Weaker protection on this device:/)).toBeTruthy();
    await user.click(within(panel()).getByRole('button', { name: 'Confirm and apply' }));
    expect(save).toHaveBeenCalledWith({ ...mine, delayMinSec: 0, delayMaxSec: 60, lockTimeoutMin: 30, theme: 'light', autoClearFragment: false });
  });

  it('disables apply until a changed section is ticked and drops the review on new input', async () => {
    const user = userEvent.setup();
    render(<Harness initial={mine} />);
    await importText(user, code(other, ['rpcUrls']));
    expect((within(panel()).getByRole<HTMLButtonElement>('button', { name: 'Apply selected settings' })).disabled).toBe(true);
    expect(within(panel()).getByText('Tick at least one changed section to apply.')).toBeTruthy();
    await user.click(box('Apply RPC endpoints'));
    expect((within(panel()).getByRole<HTMLButtonElement>('button', { name: 'Apply selected settings' })).disabled).toBe(false);
    fireEvent.change(within(panel()).getByLabelText('Or paste QR text'), { target: { value: 'other text' } });
    expect(within(panel()).queryByText('Review imported settings')).toBeNull();
    await importText(user, JSON.stringify({ format: 'ghostpay-settings', v: 2, settings: { privateKey: 'x' } }));
    expect(within(panel()).queryByText('Review imported settings')).toBeNull();
  });
});

describe('Settings exchange: export actions', () => {
  it('keeps copy and download for a preferences-only QR', async () => {
    const user = userEvent.setup();
    render(<Harness initial={other} />);
    await user.click(within(panel()).getByRole('button', { name: 'Show settings QR' }));
    expect(within(panel()).getByRole('button', { name: 'Copy as text' })).toBeTruthy();
    expect(within(panel()).getByRole('button', { name: 'Download SVG' })).toBeTruthy();
  });
});

