// @vitest-environment jsdom
import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell, CORE_ORDER } from './AppShell';
import { DEFAULT_SCAN_PRIVACY, SCAN_PRIVACY_KEY } from './lib/scanPrivacy';
import { DEFAULT_SCAN_LANES, SCAN_LANES_KEY } from './lib/scanSpam';
import { clearSession } from './lib/session';
import type { Services } from './lib/services';
import { DEFAULT_SETTINGS, SETTINGS_KEY, type Settings } from './lib/settings';
import { useApp, type AppState } from './state';
import { mockRpc } from './test/mockRpc';
import { makeServices, renderWith, setHash } from './test/render';

const CHAIN = 84532;
const OLD = 'https://old.example/';
const NEW = 'https://new.example/';
const SECOND = 'https://second.example/';
const BEFORE: Settings = {
  ...DEFAULT_SETTINGS,
  rpcUrls: { [String(CHAIN)]: OLD },
  rpcUrlsSecondary: { [String(CHAIN)]: SECOND },
  relayerUrl: 'https://relayer.example',
  pinnedSigners: [`02${'11'.repeat(32)}`],
};
const AFTER: Settings = { ...BEFORE, rpcUrls: { [String(CHAIN)]: NEW }, rpcUrlsSecondary: {}, relayerUrl: '', pinnedSigners: [] };

let observed: AppState | undefined;
function Observe(): null {
  observed = useApp();
  return null;
}
const app = (): AppState => observed!;

/** What another tab of this origin does: write the shared key; the browser then tells every other tab. */
function otherTabSaves(next: Settings, delivered = true): void {
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  if (delivered) act(() => { window.dispatchEvent(new StorageEvent('storage', { key: SETTINGS_KEY })); });
}
const stored = (): Settings => JSON.parse(window.localStorage.getItem(SETTINGS_KEY)!) as Settings;

function shell(): () => string[] {
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(BEFORE));
  const createRpc = vi.fn<Services['createRpc']>((chain) => Promise.resolve(mockRpc(chain.chainId, () => '0x')));
  renderWith(<AppShell order={CORE_ORDER} profile="lean" mainPrelude={<Observe />} />, makeServices({ createRpc }));
  return () => createRpc.mock.calls.map((call) => call[1]);
}

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  window.sessionStorage.clear();
  setHash('');
  observed = undefined;
});

describe('settings saved by another tab', () => {
  it('replace the RPC, second RPC, relayer and signer pins used here', async () => {
    const opened = shell();
    await act(async () => { await app().getRpc(CHAIN); await app().getSecondaryRpc(CHAIN); });
    expect(opened()).toEqual([OLD, SECOND]);

    otherTabSaves(AFTER);

    expect(app().settings.relayerUrl).toBe('');
    expect(app().settings.pinnedSigners).toEqual([]);
    await act(async () => { await app().getRpc(CHAIN); });
    await expect(app().getSecondaryRpc(CHAIN)).resolves.toBeUndefined();
    expect(opened()).toEqual([OLD, SECOND, NEW]);
  });

  it('drop cached RPC clients, so an address that returns is opened afresh', async () => {
    const opened = shell();
    await act(async () => { await app().getRpc(CHAIN); });
    otherTabSaves(AFTER);
    otherTabSaves(BEFORE);
    await act(async () => { await app().getRpc(CHAIN); });
    expect(opened()).toEqual([OLD, OLD]);
  });

  it('keep unchanged endpoints and pins identical, so an unrelated change invalidates nothing bound to them', () => {
    shell();
    const { settings, getRpc, getSecondaryRpc } = app();
    otherTabSaves({ ...BEFORE, theme: 'light' });
    expect(app().settings.theme).toBe('light');
    expect(app().settings.rpcUrls).toBe(settings.rpcUrls);
    expect(app().settings.pinnedSigners).toBe(settings.pinnedSigners);
    expect(app().getRpc).toBe(getRpc);
    expect(app().getSecondaryRpc).toBe(getSecondaryRpc);

    const same = app().settings;
    otherTabSaves({ ...BEFORE, theme: 'light' });
    expect(app().settings).toBe(same);
  });

  it('are dropped here too when the other tab clears storage', async () => {
    shell();
    window.localStorage.clear();
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: null })); });
    await expect(app().getRpc(CHAIN)).resolves.toBeUndefined();
    expect(app().settings).toEqual(DEFAULT_SETTINGS);
  });

  it('are not overwritten by a save made before this tab heard of them', () => {
    shell();
    const held = app().settings;
    otherTabSaves(AFTER, false);

    let refusal: unknown;
    act(() => {
      try { app().updateSettings({ ...held, theme: 'light' }); } catch (error) { refusal = error; }
    });

    expect(String(refusal)).toMatch(/changed in another tab/);
    expect(stored().rpcUrls).toEqual(AFTER.rpcUrls);
    expect(app().settings.rpcUrls).toEqual(AFTER.rpcUrls);
    // A save made from the adopted values goes through.
    let saved: boolean | undefined;
    act(() => { saved = app().updateSettings({ ...app().settings, theme: 'light' }); });
    expect(saved).toBe(true);
    expect(stored()).toMatchObject({ theme: 'light', rpcUrls: AFTER.rpcUrls, relayerUrl: '' });
  });

  it('show in an open Settings form, which keeps unrelated drafts and cannot save the old values back', () => {
    shell();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const relayer = (): HTMLInputElement => screen.getByLabelText<HTMLInputElement>('Relayer URL (optional)');
    const rpc = (): HTMLInputElement => screen.getByLabelText<HTMLInputElement>('Base Sepolia RPC URL');
    fireEvent.change(relayer(), { target: { value: 'https://draft.example' } });

    otherTabSaves({ ...BEFORE, rpcUrls: { [String(CHAIN)]: NEW }, pinnedSigners: [] });

    expect(rpc().value).toBe(NEW);
    expect(relayer().value).toBe('https://draft.example');
    expect(screen.getByText(/Settings changed in another tab/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(screen.getByText('Settings saved.')).toBeTruthy();
    expect(screen.queryByText(/Settings changed in another tab/)).toBeNull();
    expect(stored()).toMatchObject({ rpcUrls: { [String(CHAIN)]: NEW }, pinnedSigners: [], relayerUrl: 'https://draft.example' });
  });

  it('are not overwritten by the scan privacy form, which would undo a private path or cover lookups', () => {
    shell();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const save = (): void => { fireEvent.click(screen.getByRole('button', { name: 'Save scan privacy' })); };
    const lanes = { ...DEFAULT_SCAN_LANES, matchCover: true };
    const privacy = { ...DEFAULT_SCAN_PRIVACY, transport: 'tor-browser', requireProxy: true };
    // Another tab turns both on while this form still shows them off.
    window.localStorage.setItem(SCAN_LANES_KEY, JSON.stringify(lanes));
    window.localStorage.setItem(SCAN_PRIVACY_KEY, JSON.stringify(privacy));

    save();

    expect(screen.getByText(/Settings changed in another tab/)).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem(SCAN_LANES_KEY)!)).toEqual(lanes);
    expect(JSON.parse(window.localStorage.getItem(SCAN_PRIVACY_KEY)!)).toEqual(privacy);
    expect(screen.getByLabelText<HTMLSelectElement>('Scan transport').value).toBe('tor-browser');
    // The form now shows what is saved, so saving it again goes through and keeps it.
    save();
    expect(screen.queryByText(/Settings changed in another tab/)).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(SCAN_LANES_KEY)!)).toMatchObject({ matchCover: true });
    expect(JSON.parse(window.localStorage.getItem(SCAN_PRIVACY_KEY)!)).toMatchObject({ requireProxy: true });
  });

  it('keeps an unrelated scan draft when a save races another tab, and writes only on a second save', () => {
    shell();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const endpoint = screen.getByLabelText<HTMLInputElement>('Base Sepolia scan endpoint');
    const blocks = screen.getByLabelText<HTMLInputElement>(/Fixed scan window/);
    const save = screen.getByRole('button', { name: 'Save scan privacy' });
    fireEvent.change(endpoint, { target: { value: 'https://draft.example/' } });
    fireEvent.change(blocks, { target: { value: '207' } });
    const other = { ...DEFAULT_SCAN_PRIVACY, windowBlocks: 303 };
    window.localStorage.setItem(SCAN_PRIVACY_KEY, JSON.stringify(other));
    window.localStorage.setItem(SCAN_LANES_KEY, JSON.stringify({ ...DEFAULT_SCAN_LANES, matchCover: true }));
    fireEvent.click(save);
    expect(endpoint.value).toBe('https://draft.example/');
    expect(blocks.value).toBe('303');
    expect(screen.getByLabelText<HTMLInputElement>(/Blur which payments matched/).checked).toBe(true);
    expect(window.localStorage.getItem(SCAN_PRIVACY_KEY)).toBe(JSON.stringify(other));
    expect(screen.getByText(/Settings changed in another tab/)).toBeTruthy();
    fireEvent.click(save);
    expect(JSON.parse(window.localStorage.getItem(SCAN_PRIVACY_KEY)!)).toMatchObject({
      endpoints: { [String(CHAIN)]: 'https://draft.example/' }, windowBlocks: 303,
    });
    expect(JSON.parse(window.localStorage.getItem(SCAN_LANES_KEY)!)).toMatchObject({ matchCover: true });
  });

  it('updates an open form on a storage notification without moving an endpoint draft to a different transport', () => {
    shell();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const endpoint = screen.getByLabelText<HTMLInputElement>('Base Sepolia scan endpoint');
    const blocks = screen.getByLabelText<HTMLInputElement>(/Fixed scan window/);
    fireEvent.change(endpoint, { target: { value: 'https://direct.example/' } });
    fireEvent.change(blocks, { target: { value: '207' } });
    const route = { ...DEFAULT_SCAN_PRIVACY, transport: 'local-proxy', requireProxy: true, endpoints: { [String(CHAIN)]: 'http://127.0.0.1:8545/' } };
    window.localStorage.setItem(SCAN_PRIVACY_KEY, JSON.stringify(route));
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: SCAN_PRIVACY_KEY, storageArea: window.localStorage })); });
    expect(screen.getByLabelText<HTMLSelectElement>('Scan transport').value).toBe('local-proxy');
    expect(endpoint.value).toBe('http://127.0.0.1:8545/');
    expect(blocks.value).toBe('207');
    expect(window.localStorage.getItem(SCAN_PRIVACY_KEY)).toBe(JSON.stringify(route));
    window.localStorage.clear();
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: null, storageArea: window.localStorage })); });
    expect(endpoint.value).toBe('');
    expect(blocks.value).toBe(String(DEFAULT_SCAN_PRIVACY.windowBlocks));
    expect(window.localStorage.getItem(SCAN_PRIVACY_KEY)).toBeNull();
  });

  it('honors a removed endpoint and preserves edits to independent lane options', () => {
    window.localStorage.setItem(SCAN_PRIVACY_KEY, JSON.stringify({ ...DEFAULT_SCAN_PRIVACY, endpoints: { [String(CHAIN)]: OLD } }));
    shell();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const endpoint = screen.getByLabelText<HTMLInputElement>('Base Sepolia scan endpoint');
    const flood = screen.getByLabelText<HTMLInputElement>(/flood threshold/i);
    fireEvent.change(endpoint, { target: { value: NEW } });
    fireEvent.change(flood, { target: { value: '41' } });
    window.localStorage.setItem(SCAN_PRIVACY_KEY, JSON.stringify(DEFAULT_SCAN_PRIVACY));
    window.localStorage.setItem(SCAN_LANES_KEY, JSON.stringify({ ...DEFAULT_SCAN_LANES, matchCover: true }));
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: SCAN_LANES_KEY })); });
    expect(endpoint.value).toBe('');
    expect(flood.value).toBe('41');
    fireEvent.click(screen.getByRole('button', { name: 'Save scan privacy' }));
    expect(JSON.parse(window.localStorage.getItem(SCAN_PRIVACY_KEY)!)).toMatchObject({ endpoints: {} });
    expect(JSON.parse(window.localStorage.getItem(SCAN_LANES_KEY)!)).toMatchObject({ floodPerBlock: 41, matchCover: true });
  });

  it('refuse the Settings form save that races the notification', () => {
    shell();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    otherTabSaves(AFTER, false);
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(screen.queryByText('Settings saved.')).toBeNull();
    expect(screen.getByText(/Settings changed in another tab/)).toBeTruthy();
    expect(stored().rpcUrls).toEqual(AFTER.rpcUrls);
    expect(screen.getByLabelText<HTMLInputElement>('Base Sepolia RPC URL').value).toBe(NEW);
  });
});
