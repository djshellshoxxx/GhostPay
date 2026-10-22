import { CHAINS, createClient } from '@ghostpay/chain-adapters';
import { IdbTagStore } from './idbStore';
import { loadBundledManifest } from './manifest';
import { BUNDLED_MANIFESTS } from './bundledManifests';
import { RELEASE_PUBLIC_KEYS } from './releaseKeys';
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

/** Default app policy: same-origin deployments need a signature from a key compiled into this bundle. */
export function loadDefaultManifest(
  chainId: number,
  source: Readonly<Record<string, string>> = BUNDLED_MANIFESTS,
  releaseKeys: readonly string[] = RELEASE_PUBLIC_KEYS,
) {
  return Promise.resolve(loadBundledManifest(chainId, source, releaseKeys));
}

export function createDefaultServices(): Services {
  return {
    nowMs: () => Date.now(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    fetchFn: (u, i) => fetch(u, i),
    loadManifest: (id) => loadDefaultManifest(id),
    createRpc: (chain, url) => createClient(chain, url),
    discoverWallets: () => discoverWallets(window),
    createScanWorker: createBrowserScanWorker,
    checkpoints: localCheckpointStore(safeStorage()),
    vault: new TagVault(makeStore()),
    baseUrl: () => `${window.location.origin}${window.location.pathname}`,
    chains: CHAINS.filter((c) => c.enabled),
  };
}

