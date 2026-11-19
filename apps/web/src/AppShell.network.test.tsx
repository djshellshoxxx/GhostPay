// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';
import { useApp, type AppState } from './state';
import { ServicesContext } from './lib/services';
import { DEFAULT_SETTINGS, SETTINGS_KEY } from './lib/settings';
import { notifyAppLock } from './lib/appLock';
import { clearSession, generateSession } from './lib/session';
import { makeServices } from './test/render';
import { mockRpc } from './test/mockRpc';

const chainId = 84532;
const oldUrl = 'https://old-node.example/';
const newUrl = 'https://new-node.example/';

beforeEach(() => {
  clearSession();
  localStorage.clear();
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, rpcUrls: { [chainId]: oldUrl } }));
});
afterEach(() => { cleanup(); clearSession(); });

function mount() {
  let current: AppState | undefined;
  function Probe() { current = useApp(); return null; }
  const services = makeServices({ createRpc: () => Promise.resolve(mockRpc(chainId, () => null)) });
  const create = vi.spyOn(services, 'createRpc');
  render(<ServicesContext.Provider value={services}><AppShell order={['home', 'settings']} mainPrelude={<Probe />} /></ServicesContext.Provider>);
  return { app: () => current as AppState, create };
}

describe('network settings lifetime in the application shell', () => {
  it('loads endpoint changes from another tab before another RPC is created', async () => {
    const m = mount();
    const oldValue = localStorage.getItem(SETTINGS_KEY);
    const newValue = JSON.stringify({ ...DEFAULT_SETTINGS, rpcUrls: { [chainId]: newUrl } });
    act(() => {
      localStorage.setItem(SETTINGS_KEY, newValue);
      window.dispatchEvent(new StorageEvent('storage', { key: SETTINGS_KEY, oldValue, newValue, storageArea: localStorage }));
    });
    expect(m.app().settings.rpcUrls[String(chainId)]).toBe(newUrl);
    await m.app().getRpc(chainId);
    expect(m.create.mock.calls.at(-1)?.[1]).toBe(newUrl);
  });

  it('does not reuse a client after an app lock that retained the seller keys', async () => {
    generateSession();
    const m = mount();
    await m.app().getRpc(chainId);
    act(() => { notifyAppLock('idle'); });
    await m.app().getRpc(chainId);
    expect(m.create).toHaveBeenCalledTimes(2);
  });

  it('does not reuse a client after seller identity replacement', async () => {
    generateSession();
    const m = mount();
    await m.app().getRpc(chainId);
    act(() => { generateSession(); });
    await m.app().getRpc(chainId);
    expect(m.create).toHaveBeenCalledTimes(2);
  });
});
