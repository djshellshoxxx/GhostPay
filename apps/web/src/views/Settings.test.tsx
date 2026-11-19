// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChainAdapterError } from '@ghostpay/chain-adapters';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SETTINGS_KEY, clearRpcSessionOnly, isRpcSessionOnly } from '../lib/settings';
import { createSelectedRpc, loadNetworkSelection } from '../lib/defaultServices';
import { SCAN_LANES_KEY } from '../lib/scanSpam';
import { mockRpc } from '../test/mockRpc';
import { makeServices, renderApp } from '../test/render';

beforeEach(() => {
  clearRpcSessionOnly();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
  document.documentElement.removeAttribute('data-theme');
});

async function open(services = makeServices()): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  renderApp(services);
  await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Settings' }));
  return user;
}

const stored = (): Record<string, unknown> => JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? '{}') as Record<string, unknown>;

describe('Settings RPC secrets (TM4)', () => {
  // Public, deliberately key-shaped fixture on a reserved example domain; never a real provider credential.
  const SECRET = 'https://rpc.example/v2/AbCdEf0123456789AbCdEf0123456789';
  it('warns about a key-like URL and keeps it out of localStorage when session-only is ticked', async () => {
    const user = await open();
    await user.type(screen.getByLabelText('Base Sepolia RPC URL'), SECRET);
    expect(await screen.findByText(/looks like it contains a provider key/)).toBeTruthy();
    await user.click(screen.getByLabelText(/Keep this endpoint for this session only/));
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(await screen.findByText('Settings saved.')).toBeTruthy();
    expect(window.localStorage.getItem(SETTINGS_KEY) ?? '').not.toContain('AbCdEf');
  });
  it('without the tick the URL is saved as before (no silent change)', async () => {
    const user = await open();
    await user.type(screen.getByLabelText('Base Sepolia RPC URL'), SECRET);
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(await screen.findByText('Settings saved.')).toBeTruthy();
    expect(window.localStorage.getItem(SETTINGS_KEY) ?? '').toContain('AbCdEf');
  });
  it('flags an already persisted secret-looking URL and keeps it', async () => {
    // Persist through the explicit save path, then discard mounted and session-only state so this
    // exercises both serialization and initialization of the saved-endpoint warning on a fresh mount.
    const user = await open();
    await user.type(screen.getByLabelText('Base Sepolia RPC URL'), SECRET);
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(await screen.findByText('Settings saved.')).toBeTruthy();
    expect(stored()).toMatchObject({ rpcUrls: { '84532': SECRET } });
    cleanup();
    clearRpcSessionOnly();
    await open();
    expect(await screen.findByText(/saved endpoint URL looks like it contains a provider key/)).toBeTruthy();
    expect((screen.getByLabelText('Base Sepolia RPC URL') as HTMLInputElement).value).toBe(SECRET);
    expect(stored()).toMatchObject({ rpcUrls: { '84532': SECRET } });
  });
  it('offers session-only storage even when a provider credential is not recognized by the heuristic', async () => {
    const user = await open();
    const endpoint = 'https://rpc.example/provider-assigned-opaque-value';
    await user.type(screen.getByLabelText('Base Sepolia RPC URL'), endpoint);
    expect(screen.queryByText(/looks like it contains a provider key/)).toBeNull();
    await user.click(screen.getByLabelText(/Keep this endpoint for this session only/));
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(await screen.findByText('Settings saved.')).toBeTruthy();
    expect(isRpcSessionOnly('primary', '84532', endpoint)).toBe(true);
    expect(window.localStorage.getItem(SETTINGS_KEY) ?? '').not.toContain('provider-assigned-opaque-value');
  });
  it('does not clear session-only consent when a settings form fails validation', async () => {
    const user = await open();
    await user.type(screen.getByLabelText('Base Sepolia RPC URL'), SECRET);
    await user.click(screen.getByLabelText(/Keep this endpoint for this session only/));
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(await screen.findByText('Settings saved.')).toBeTruthy();
    expect(isRpcSessionOnly('primary', '84532', SECRET)).toBe(true);
    await user.click(screen.getByLabelText(/Keep this endpoint for this session only/));
    await user.clear(screen.getByLabelText(/Idle lock after minutes/));
    await user.type(screen.getByLabelText(/Idle lock after minutes/), '0');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Lock timeout/);
    expect(isRpcSessionOnly('primary', '84532', SECRET)).toBe(true);
    expect(window.localStorage.getItem(SETTINGS_KEY) ?? '').not.toContain('AbCdEf');
  });
});

describe('Settings', () => {
  it('warns that settings are plaintext and that no RPC is built in', async () => {
    await open();
    expect(screen.getByText(/kept in this browser in plain text/)).toBeTruthy();
    expect(screen.getByText(/No default RPC is built in/)).toBeTruthy();
  });

  it('L1-01: says what the idle lock does to seller keys', async () => {
    await open();
    const hint = screen.getByLabelText(/Idle lock after minutes/).getAttribute('aria-describedby') ?? '';
    const text = document.getElementById(hint)?.textContent ?? '';
    expect(text).toMatch(/local tags lock/);
    expect(text).toMatch(/Seller keys are wiped from memory at the same time only when a copy survives the wipe/);
    expect(text).toMatch(/Keys with no backup, or with only an unverified download, stay loaded, with a warning/);
    expect(text).toMatch(/downloaded keystore you verified/);
    expect(document.body.textContent).not.toMatch(/Keys stay in memory until you wipe them or close the tab/);
  });

  it('validates and saves RPC URL, relayer, delay, lock timeout, theme, pins; applies the theme', async () => {
    const user = await open();
    const pin = `02${'ab'.repeat(32)}`;
    await user.type(screen.getByLabelText('Base Sepolia RPC URL'), 'https://rpc.example/v1');
    await user.type(screen.getByLabelText('Relayer URL (optional)'), 'https://relay.example');
    await user.clear(screen.getByLabelText('Minimum delay (seconds)'));
    await user.type(screen.getByLabelText('Minimum delay (seconds)'), '30');
    await user.clear(screen.getByLabelText('Maximum delay (seconds)'));
    await user.type(screen.getByLabelText('Maximum delay (seconds)'), '90');
    await user.clear(screen.getByLabelText(/Idle lock after minutes/));
    await user.type(screen.getByLabelText(/Idle lock after minutes/), '5');
    await user.selectOptions(screen.getByLabelText('Theme'), 'dark');
    await user.click(screen.getByLabelText('Remove the invoice from the address bar after reading it'));
    await user.type(screen.getByLabelText(/Pinned seller signing keys/), pin);
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(await screen.findByText('Settings saved.')).toBeTruthy();
    expect(stored()).toMatchObject({
      rpcUrls: { '84532': 'https://rpc.example/v1' },
      relayerUrl: 'https://relay.example',
      delayMinSec: 30,
      delayMaxSec: 90,
      lockTimeoutMin: 5,
      theme: 'dark',
      autoClearFragment: false,
      pinnedSigners: [pin],
    });
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(JSON.stringify(stored())).not.toMatch(/secret|private|seed/i);
  });

  it('saves a validated second RPC per chain (WEB-APP-04)', async () => {
    const user = await open();
    await user.type(screen.getByLabelText('Base Sepolia second RPC URL (optional)'), 'https://rpc2.example');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(await screen.findByText('Settings saved.')).toBeTruthy();
    expect(stored()).toMatchObject({ rpcUrlsSecondary: { '84532': 'https://rpc2.example/' } });
    await user.clear(screen.getByLabelText('Base Sepolia second RPC URL (optional)'));
    await user.type(screen.getByLabelText('Base Sepolia second RPC URL (optional)'), 'http://insecure.example');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/RPC URL rejected/);
  });

  it.each([
    ['Base Sepolia RPC URL', 'http://insecure.example', /RPC URL rejected/],
    ['Base Sepolia RPC URL', 'https://user:pw@rpc.example', /RPC URL rejected/],
    ['Relayer URL (optional)', 'http://relay.example', /must be https/],
  ])('rejects bad %s', async (label, value, re) => {
    const user = await open();
    await user.type(screen.getByLabelText(label), value);
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(re);
    expect(window.localStorage.getItem(SETTINGS_KEY)).toBeNull();
  });

  it('rejects an inverted delay range, bad lock timeout and bad pins', async () => {
    const user = await open();
    await user.clear(screen.getByLabelText('Minimum delay (seconds)'));
    await user.type(screen.getByLabelText('Minimum delay (seconds)'), '500');
    await user.clear(screen.getByLabelText('Maximum delay (seconds)'));
    await user.type(screen.getByLabelText('Maximum delay (seconds)'), '5');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Delay range/);
    await user.clear(screen.getByLabelText('Minimum delay (seconds)'));
    await user.type(screen.getByLabelText('Minimum delay (seconds)'), '1');
    await user.clear(screen.getByLabelText(/Idle lock after minutes/));
    await user.type(screen.getByLabelText(/Idle lock after minutes/), '999');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toMatch(/Lock timeout/); });
    await user.clear(screen.getByLabelText(/Idle lock after minutes/));
    await user.type(screen.getByLabelText(/Idle lock after minutes/), '5');
    await user.type(screen.getByLabelText(/Pinned seller signing keys/), 'not-a-key');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toMatch(/Pinned signer keys/); });
  });

  it('applies settings for this tab and says so when storage is unavailable', async () => {
    const user = await open();
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    try {
      await user.selectOptions(screen.getByLabelText('Theme'), 'light');
      await user.click(screen.getByRole('button', { name: 'Save settings' }));
      expect(await screen.findByText(/storage is unavailable/)).toBeTruthy();
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    } finally {
      spy.mockRestore();
    }
  });

  it('tests an RPC endpoint (chain id is verified by the adapter) and reports failures without details', async () => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.example' } }));
    let fail: 'none' | 'chain' | 'other' = 'none';
    const services = makeServices({
      createRpc: () => {
        if (fail === 'chain') return Promise.reject(new ChainAdapterError('CHAIN_MISMATCH', 'secret'));
        if (fail === 'other') return Promise.reject(new TypeError('boom'));
        return Promise.resolve(mockRpc(84532, () => '0x'));
      },
    });
    const user = await open(services);
    await user.click(screen.getByRole('button', { name: 'Test Base Sepolia' }));
    expect(await screen.findByText(/Connected\. The endpoint reports the expected chain id/)).toBeTruthy();
    fail = 'chain';
    await user.click(screen.getByRole('button', { name: 'Test Base Sepolia' }));
    expect(await screen.findByText(/reports a different chain/)).toBeTruthy();
    fail = 'other';
    await user.click(screen.getByRole('button', { name: 'Test Base Sepolia' }));
    await waitFor(() => { expect(screen.getByText(/Something went wrong/)).toBeTruthy(); });
    await user.clear(screen.getByLabelText('Base Sepolia RPC URL'));
    await user.type(screen.getByLabelText('Base Sepolia RPC URL'), 'http://nope');
    await user.click(screen.getByRole('button', { name: 'Test Base Sepolia' }));
    await waitFor(() => { expect(screen.getByText(/RPC URL rejected/)).toBeTruthy(); });
  });
});


it('previews nonsecret settings before explicit application and leaves URLs and signer trust untouched', async () => {
  const user = await open();
  await user.type(screen.getByLabelText('Base Sepolia RPC URL'), 'https://rpc.example');
  await user.click(screen.getByRole('button', { name: 'Save settings' }));
  const { exportSettingsExchange } = await import('../lib/settingsExchange');
  const { DEFAULT_SETTINGS } = await import('../lib/settings');
  fireEvent.change(screen.getByLabelText('Or paste QR text'), { target: { value: exportSettingsExchange({ ...DEFAULT_SETTINGS, theme: 'dark', delayMinSec: 0 }) } });
  await user.click(screen.getByRole('button', { name: 'Use pasted text' }));
  expect(stored()['theme']).toBe('system');
  expect(await screen.findByText(/Review imported settings/)).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Apply selected settings' }));
  expect(stored()['theme']).toBe('system'); // delayMinSec 0 weakens protection: nothing is saved before confirming
  await user.click(screen.getByRole('button', { name: 'Confirm and apply' }));
  expect(stored()['theme']).toBe('dark');
  expect(stored()['rpcUrls']).toEqual({ '84532': 'https://rpc.example/' });
  fireEvent.change(screen.getByLabelText('Or paste QR text'), { target: { value: exportSettingsExchange(DEFAULT_SETTINGS) } });
  await user.click(screen.getByRole('button', { name: 'Use pasted text' }));
  expect(screen.getByRole('button', { name: 'Apply selected settings' })).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Or paste QR text'), { target: { value: 'invalid replacement' } });
  expect(screen.queryByRole('button', { name: 'Apply selected settings' })).toBeNull();
});


it('invalidates an imported review and old export when saved preferences change', async () => {
  const user = await open();
  const { exportSettingsExchange } = await import('../lib/settingsExchange');
  const { DEFAULT_SETTINGS } = await import('../lib/settings');
  await user.click(screen.getByRole('button', { name: 'Show settings QR' }));
  expect(screen.getByRole('button', { name: 'Hide settings QR' })).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Or paste QR text'), { target: { value: exportSettingsExchange({ ...DEFAULT_SETTINGS, theme: 'dark' }) } });
  await user.click(screen.getByRole('button', { name: 'Use pasted text' }));
  expect(await screen.findByText('Review imported settings')).toBeTruthy();
  await user.selectOptions(screen.getByLabelText('Theme'), 'light');
  await user.click(screen.getByRole('button', { name: 'Save settings' }));
  expect(stored()['theme']).toBe('light');
  expect(screen.queryByRole('button', { name: 'Apply selected settings' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Hide settings QR' })).toBeNull();
  fireEvent.change(screen.getByLabelText('Or paste QR text'), { target: { value: exportSettingsExchange({ ...DEFAULT_SETTINGS, theme: 'dark' }) } });
  await user.click(screen.getByRole('button', { name: 'Use pasted text' }));
  await user.click(screen.getByRole('button', { name: 'Discard preview' }));
  expect(stored()['theme']).toBe('light');
  expect(screen.queryByRole('button', { name: 'Apply selected settings' })).toBeNull();
});

describe('Settings: scan lanes and privacy-set options (spec 05)', () => {
  const lanes = (): Record<string, unknown> | null => { const text = window.localStorage.getItem(SCAN_LANES_KEY); return text === null ? null : JSON.parse(text) as Record<string, unknown>; };

  it('saves the flood threshold, the spam-score switch and the same-token estimate opt-in under their own key, and discloses the estimate', async () => {
    const user = await open();
    const section = screen.getByRole('group', { name: 'Scan privacy' });
    expect(within(section).getByLabelText(/Flood threshold/)).toHaveProperty('value', '32');
    expect(within(section).getByLabelText(/Check suspected spam last/)).toHaveProperty('checked', true);
    expect(within(section).getByLabelText(/Estimate same-token transfers/)).toHaveProperty('checked', false);
    expect(within(section).queryByText(/recent transfers/)).toBeNull();
    await user.clear(within(section).getByLabelText(/Flood threshold/));
    await user.type(within(section).getByLabelText(/Flood threshold/), '5');
    await user.click(within(section).getByLabelText(/Check suspected spam last/));
    await user.click(within(section).getByLabelText(/Estimate same-token transfers/));
    expect(within(section).getByText(/recent transfers/)).toBeTruthy();
    expect(section.textContent).toMatch(/costs RPC calls/);
    expect(section.textContent).not.toMatch(/anonym|unlinkab|untraceab/i);
    await user.click(within(section).getByRole('button', { name: 'Save scan privacy' }));
    expect(await within(section).findByText(/Scan privacy settings saved/)).toBeTruthy();
    expect(lanes()).toEqual({ floodPerBlock: 5, spamScoring: false, privacySetTransfers: true });
    expect(JSON.stringify(lanes())).not.toMatch(/secret|private|seed/i);
  });

  it('rejects an out-of-range flood threshold and stores nothing', async () => {
    const user = await open();
    const section = screen.getByRole('group', { name: 'Scan privacy' });
    await user.clear(within(section).getByLabelText(/Flood threshold/));
    await user.type(within(section).getByLabelText(/Flood threshold/), '0');
    await user.click(within(section).getByRole('button', { name: 'Save scan privacy' }));
    expect(await within(section).findByText(/flood threshold must be from 1 to 10000/)).toBeTruthy();
    expect(lanes()).toBeNull();
    expect(window.localStorage.getItem('ghostpay.scanPrivacy.v1')).toBeNull();
  });
});

describe('Settings scan padding (TM15)', () => {
  const stored = (): Record<string, unknown> => JSON.parse(window.localStorage.getItem('ghostpay.scanPrivacy.v1') ?? '{}') as Record<string, unknown>;
  it('defaults to 0, saves a padding value and refuses one above the maximum', async () => {
    const user = await open();
    const section = screen.getByRole('group', { name: 'Scan privacy' });
    const input = within(section).getByLabelText<HTMLInputElement>(/Extra padding around scan ranges/);
    expect(input.value).toBe('0');
    await user.clear(input);
    await user.type(input, '100001');
    await user.click(within(section).getByRole('button', { name: 'Save scan privacy' }));
    expect(await within(section).findByText(/Padding must be a whole number of blocks/)).toBeTruthy();
    expect(window.localStorage.getItem('ghostpay.scanPrivacy.v1')).toBeNull();
    await user.clear(input);
    await user.type(input, '250');
    await user.click(within(section).getByRole('button', { name: 'Save scan privacy' }));
    expect(await within(section).findByText(/Scan privacy settings saved/)).toBeTruthy();
    expect(stored()['padBlocks']).toBe(250);
  });
});

describe('Settings network profiles (TM14)', () => {
  const NET_KEY = 'ghostpay.networkProfiles.v1';
  const section = (): HTMLElement => screen.getByRole('group', { name: 'Network profiles' });
  const save = async (user: ReturnType<typeof userEvent.setup>): Promise<void> => {
    await user.click(within(section()).getByRole('button', { name: 'Save network profiles' }));
    expect(await within(section()).findByText('Network profiles saved.')).toBeTruthy();
  };

  it('defaults to Direct for both purposes and a single RPC, with no notice and nothing stored', async () => {
    await open();
    const s = section();
    expect(within(s).getByLabelText<HTMLSelectElement>(/Profile for RPC reads/).value).toBe('direct');
    expect(within(s).getByLabelText<HTMLSelectElement>(/Profile for relayer calls/).value).toBe('direct');
    expect(within(s).getByLabelText<HTMLSelectElement>('RPC mode').value).toBe('single');
    expect(within(s).queryByText(/Read this before using Tor or own node/)).toBeNull();
    // Verification status comes from PROFILE_VERIFICATION; own node is always shown as unverified.
    expect(s.textContent).toContain('Direct: tested against local servers only');
    expect(s.textContent).toContain('Tor Browser (you run it): UNVERIFIED');
    expect(s.textContent).toContain('Own node (loopback or onion RPC URL only): UNVERIFIED');
    expect(window.localStorage.getItem(NET_KEY)).toBeNull();
    expect(loadNetworkSelection()).toEqual({ rpcProfile: 'direct', relayerProfile: 'direct', rpcMode: 'single', noticeAcknowledged: false });
  });

  it('a non-default choice shows the notice and applies only after it is acknowledged', async () => {
    const user = await open();
    await user.selectOptions(within(section()).getByLabelText(/Profile for RPC reads/), 'tor-browser');
    const notice = within(section()).getByText(/Read this before using Tor or own node/).closest('.notice') as HTMLElement;
    expect(notice.textContent).toMatch(/UNVERIFIED in this build/);
    expect(notice.textContent).toMatch(/do not make payments anonymous/);
    expect(notice.textContent).toContain('this page cannot verify it');
    // An unsaved form change is not an active transport-policy change.
    expect(loadNetworkSelection().rpcProfile).toBe('direct');
    expect(section().textContent).toMatch(/In effect now: RPC reads Direct/);
    await save(user);
    // Stored, but not acknowledged: RPC is blocked rather than silently falling back to Direct.
    expect(() => loadNetworkSelection()).toThrow(/acknowledge|notice/i);
    expect(within(section()).getByText(/unacknowledged saved profile are blocked/)).toBeTruthy();
    expect(section().textContent).not.toMatch(/In effect now:/);
    await user.click(within(section()).getByLabelText(/I have read this notice/));
    await save(user);
    expect(loadNetworkSelection()).toMatchObject({ rpcProfile: 'tor-browser', relayerProfile: 'direct', rpcMode: 'single', noticeAcknowledged: true });
    expect(within(section()).queryByText(/unacknowledged saved profile are blocked/)).toBeNull();
    // Any further change clears the acknowledgement again.
    await user.selectOptions(within(section()).getByLabelText('RPC mode'), 'own-node');
    expect(within(section()).getByLabelText<HTMLInputElement>(/I have read this notice/).checked).toBe(false);
    await save(user);
    expect(() => loadNetworkSelection()).toThrow(/acknowledge|notice/i);
  });

  it('own node refuses a third-party RPC with its own message and contacts nothing', async () => {
    const create = vi.fn(() => Promise.reject(new Error('must not be called')));
    const user = await open(makeServices({ createRpc: createSelectedRpc(loadNetworkSelection, create) }));
    await user.selectOptions(within(section()).getByLabelText('RPC mode'), 'own-node');
    await user.click(within(section()).getByLabelText(/I have read this notice/));
    await save(user);
    await user.type(screen.getByLabelText('Base Sepolia RPC URL'), 'https://rpc.example.org');
    await user.click(screen.getByRole('button', { name: 'Test Base Sepolia' }));
    expect(await screen.findByText(/Own-node mode needs an RPC URL on this computer/)).toBeTruthy();
    expect(screen.queryByText(/A local proxy endpoint/)).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it('a refused storage write keeps the default and says so', async () => {
    const user = await open();
    await user.selectOptions(within(section()).getByLabelText(/Profile for relayer calls/), 'tor-browser');
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    await user.click(within(section()).getByRole('button', { name: 'Save network profiles' }));
    expect(await within(section()).findByText(/refused to store the network profiles/)).toBeTruthy();
    spy.mockRestore();
    expect(loadNetworkSelection().relayerProfile).toBe('direct');
  });
  it('shows a blocked state for corrupt profile storage and repairs it only on explicit save', async () => {
    window.localStorage.setItem(NET_KEY, '{broken');
    const user = await open();
    expect(within(section()).getByText(/network profile settings are invalid or unavailable/i)).toBeTruthy();
    expect(within(section()).queryByText(/In effect now: RPC reads Direct/)).toBeNull();
    expect(window.localStorage.getItem(NET_KEY)).toBe('{broken');
    await save(user);
    expect(loadNetworkSelection().rpcMode).toBe('single');
    expect(within(section()).getByText(/In effect now: RPC reads Direct/)).toBeTruthy();
  });
  it('a failed replacement save preserves an existing acknowledged own-node policy', async () => {
    window.localStorage.setItem(NET_KEY, JSON.stringify({ rpcProfile: 'direct', relayerProfile: 'direct', rpcMode: 'own-node', noticeAcknowledged: true }));
    const user = await open();
    await user.selectOptions(within(section()).getByLabelText('RPC mode'), 'single');
    expect(loadNetworkSelection().rpcMode).toBe('own-node');
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    try {
      await user.click(within(section()).getByRole('button', { name: 'Save network profiles' }));
      expect(await within(section()).findByText(/refused to store the network profiles/)).toBeTruthy();
      expect(loadNetworkSelection().rpcMode).toBe('own-node');
      expect(within(section()).getByText(/In effect now:.*Own node/)).toBeTruthy();
    } finally { spy.mockRestore(); }
  });
  it('updates the saved-policy status after a cross-tab storage event without overwriting the unsaved form', async () => {
    const user = await open();
    await user.selectOptions(within(section()).getByLabelText(/Profile for RPC reads/), 'tor-browser');
    window.localStorage.setItem(NET_KEY, '{broken');
    fireEvent(window, new StorageEvent('storage', { key: NET_KEY, newValue: '{broken' }));
    expect(within(section()).getByText(/network profile settings are invalid or unavailable/i)).toBeTruthy();
    expect(within(section()).queryByText(/In effect now:/)).toBeNull();
    expect(within(section()).getByLabelText<HTMLSelectElement>(/Profile for RPC reads/).value).toBe('tor-browser');
    expect(() => loadNetworkSelection()).toThrow(/invalid or unavailable/);
  });
});
