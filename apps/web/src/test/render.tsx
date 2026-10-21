import { CHAINS } from '@ghostpay/chain-adapters';
import { cleanup, render, type RenderResult } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach } from 'vitest';
import { App } from '../App';
import { ServicesContext, type Services } from '../lib/services';
import { MemoryTagStore, TagVault } from '../lib/tags';
import { InlineWorker } from './inlineWorker';
import { NOW } from './invoiceFixtures';

afterEach(() => {
  cleanup();
});

export function memoryCheckpoints(): Services['checkpoints'] {
  const m = new Map<number, ReturnType<Services['checkpoints']['load']>>();
  return { load: (id) => m.get(id), save: (id, c) => void m.set(id, c), clear: (id) => void m.delete(id) };
}

/** Fully faked side effects: nothing touches the network unless a test provides it. */
export function makeServices(over: Partial<Services> = {}): Services {
  return {
    nowMs: () => NOW * 1000,
    sleep: () => Promise.resolve(),
    fetchFn: () => Promise.reject(new Error('network is not available in tests')),
    loadManifest: () => Promise.resolve({ status: 'absent' }),
    createRpc: () => Promise.reject(new Error('no rpc in tests')),
    discoverWallets: () => Promise.resolve([]),
    createScanWorker: () => new InlineWorker(),
    checkpoints: memoryCheckpoints(),
    vault: new TagVault(new MemoryTagStore()),
    baseUrl: () => 'https://app.test/',
    chains: CHAINS.filter((c) => c.enabled),
    ...over,
  };
}

export function renderWith(ui: ReactNode, services: Services = makeServices()): RenderResult {
  return render(<ServicesContext.Provider value={services}>{ui}</ServicesContext.Provider>);
}

export function renderApp(services: Services = makeServices()): RenderResult {
  return renderWith(<App />, services);
}

/** Opens the page at a given hash like a visitor following a link (jsdom location). */
export function setHash(hash: string): void {
  window.history.replaceState(null, '', `/${hash}`);
}
