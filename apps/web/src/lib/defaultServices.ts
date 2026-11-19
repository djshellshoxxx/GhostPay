import { CHAINS, ChainAdapterError, createClient, fetchTransport, type ChainConfig, type RpcClient, type RpcTransport } from '@ghostpay/chain-adapters';
import {
  WEB_NETWORK_SELECTION_KEY,
  checkOwnNodeRpcUrl,
  effectiveSelection,
  parseWebNetworkSelection,
  type WebNetworkSelection,
} from '@ghostpay/net-transport/browser';
import { UserFacingError } from './errors';
import { IdbTagStore } from './idbStore';
import { loadBundledManifest } from './manifest';
import { BUNDLED_MANIFESTS } from './bundledManifests';
import { RELEASE_PUBLIC_KEYS } from './releaseKeys';
import { localCheckpointStore } from './scanClient';
import type { Services } from './services';
import { TagVault, MemoryTagStore, type TagStore } from './tags';
import { discoverWallets } from './wallet';
import { createBrowserScanWorker } from './workerFactory';
import { IdbReconciliationVaultStore } from './reconciliationVault';
import { purgeLegacyPrivateScanHistory } from './privateScanLifecycle';

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

/**
 * TM14: the network selection that applies now (`ghostpay.networkProfiles.v1`). Missing, unreadable or invalid storage,
 * or a non-default selection whose first-use notice was not acknowledged, yields the default (direct, single RPC), which
 * is the behaviour before TM14.
 *
 * `tor-browser` is ambient: requests still use this page's `fetch`; only the user running the page in Tor Browser
 * changes the path, and that is not verified (unverified profile, see `PROFILE_VERIFICATION`).
 */
export function loadNetworkSelection(storage: Storage | undefined = safeStorage()): WebNetworkSelection {
  let raw: unknown;
  try {
    const text = storage?.getItem(WEB_NETWORK_SELECTION_KEY);
    raw = text === null || text === undefined ? undefined : JSON.parse(text);
  } catch {
    raw = undefined;
  }
  return effectiveSelection(parseWebNetworkSelection(raw));
}

/**
 * `createRpc` that enforces `own-node` when it is selected: the RPC URL must be loopback or a v3 onion URL, otherwise
 * nothing is contacted (fail closed, no fallback to the configured third-party URL). The transport rechecks the current
 * selection before every dispatch, including retries from clients cached before the selection changed.
 */
export function createSelectedRpc(
  selection: () => WebNetworkSelection = loadNetworkSelection,
  create: (chain: ChainConfig, url: string, opts: { readonly allowInsecureLocalhost: boolean; readonly transport: RpcTransport }) => Promise<RpcClient> = (chain, url, opts) =>
    createClient(chain, url, opts),
): (chain: ChainConfig, url: string) => Promise<RpcClient> {
  return (chain, url) => {
    const ownNode = selection().rpcMode === 'own-node';
    let checked: string;
    try {
      checked = ownNode ? checkOwnNodeRpcUrl(url, { kind: 'evm', chainId: chain.chainId }) : url;
    } catch {
      return Promise.reject(new UserFacingError({ key: 'error.network.ownNodeRpcRefused' }));
    }
    const transport: RpcTransport = {
      send(target, body, init) {
        if (selection().rpcMode === 'own-node') {
          try {
            checkOwnNodeRpcUrl(target, { kind: 'evm', chainId: chain.chainId });
          } catch {
            // A policy refusal is not a transient transport failure: no retry and no endpoint or request in the error.
            return Promise.reject(new ChainAdapterError('RPC_URL_REJECTED', 'own-node requires a loopback or v3 onion endpoint'));
          }
        }
        return fetchTransport.send(target, body, init);
      },
    };
    // Own node on loopback may be plain http (it never leaves this computer); onion URLs still need https here.
    return create(chain, checked, { allowInsecureLocalhost: ownNode, transport });
  };
}

export function createDefaultServices(): Services {
  purgeLegacyPrivateScanHistory(safeStorage());
  return {
    nowMs: () => Date.now(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    fetchFn: (u, i) => fetch(u, i),
    loadManifest: (id) => loadDefaultManifest(id),
    createRpc: createSelectedRpc(),
    discoverWallets: () => discoverWallets(window),
    createScanWorker: createBrowserScanWorker,
    checkpoints: localCheckpointStore(safeStorage()),
    privateScanStore: new IdbReconciliationVaultStore(),
    vault: new TagVault(makeStore()),
    baseUrl: () => `${window.location.origin}${window.location.pathname}`,
    chains: CHAINS.filter((c) => c.enabled),
  };
}

// i18n-use: error.network.ownNodeRpcRefused
