import { CHAINS, createClient, verifyDeployment } from '@ghostpay/chain-adapters';
import { IdbTagStore } from './idbStore';
import { loadManifest } from './manifest';
import { localCheckpointStore } from './scanClient';
import type { Services } from './services';
import { TagVault, MemoryTagStore, type TagStore } from './tags';
import { discoverWallets } from './wallet';
import { createBrowserScanWorker } from './workerFactory';

function safeStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function makeStore(): TagStore {
  return typeof indexedDB === 'undefined' ? new MemoryTagStore() : new IdbTagStore();
}

export function createDefaultServices(): Services {
  return {
    nowMs: () => Date.now(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    fetchFn: (u, i) => fetch(u, i),
    loadManifest: (id) => Promise.resolve(loadManifest(id)),
    verifyDeployment,
    createRpc: (chain, url) => createClient(chain, url),
    discoverWallets: () => discoverWallets(window),
    createScanWorker: createBrowserScanWorker,
    checkpoints: localCheckpointStore(safeStorage()),
    vault: new TagVault(makeStore()),
    baseUrl: () => `${window.location.origin}${window.location.pathname}`,
    chains: CHAINS.filter((c) => c.enabled),
  };
}

