import type { ChainConfig, RpcClient } from '@ghostpay/chain-adapters';
import type { VerifyFn } from './deployment';
import { createContext, useContext } from 'react';
import type { ManifestState } from './manifest';
import type { CheckpointStore, ScanWorkerLike } from './scanClient';
import type { TagVault } from './tags';
import type { WalletInfo } from './wallet';

/** Everything with side effects that views use, injectable for tests. */
export interface Services {
  readonly nowMs: () => number;
  readonly sleep: (ms: number) => Promise<void>;
  readonly fetchFn: (url: string, init: RequestInit) => Promise<Response>;
  readonly loadManifest: (chainId: number) => Promise<ManifestState>;
  /** On-chain read-back of a bundled manifest (S3-01). Injected so tests need no EVM. */
  readonly verifyDeployment: VerifyFn;
  readonly createRpc: (chain: ChainConfig, url: string) => Promise<RpcClient>;
  readonly discoverWallets: () => Promise<readonly WalletInfo[]>;
  readonly createScanWorker: () => ScanWorkerLike;
  readonly checkpoints: CheckpointStore;
  readonly vault: TagVault;
  readonly baseUrl: () => string;
  readonly chains: readonly ChainConfig[];
}

export const ServicesContext = createContext<Services | undefined>(undefined);

export function useServices(): Services {
  const s = useContext(ServicesContext);
  if (s === undefined) throw new Error('ServicesContext missing');
  return s;
}
