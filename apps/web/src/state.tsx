import { createContext, useContext } from 'react';
import type { DeploymentManifest, RpcClient } from '@ghostpay/chain-adapters';
import type { DeploymentCheck } from './lib/deployment';
import type { ScanMatch } from './lib/scanClient';
import type { SessionPublic } from './lib/session';
import type { Settings } from './lib/settings';

export type ViewId = 'home' | 'seller' | 'create' | 'pay' | 'scan' | 'sweep' | 'settings' | 'about';

export const VIEW_LABELS: Readonly<Record<ViewId, string>> = {
  home: 'Home',
  seller: 'Seller keys',
  create: 'Create invoice',
  pay: 'Pay',
  scan: 'Scan and receive',
  sweep: 'Sweep',
  settings: 'Settings',
  about: 'About and privacy',
};

export interface AppState {
  readonly view: ViewId;
  readonly setView: (v: ViewId) => void;
  readonly settings: Settings;
  /** Persists settings; returns false if browser storage refused (settings still apply for this tab). */
  readonly updateSettings: (s: Settings) => boolean;
  readonly session: SessionPublic | undefined;
  /** Invoice fragment read at load or pasted by the user; held in memory only. */
  readonly fragment: string | undefined;
  readonly setFragment: (f: string | undefined) => void;
  readonly matches: readonly ScanMatch[];
  readonly setMatches: (m: readonly ScanMatch[]) => void;
  readonly sweepTarget: { readonly match: ScanMatch; readonly chainId: number } | undefined;
  readonly selectForSweep: (m: { readonly match: ScanMatch; readonly chainId: number } | undefined) => void;
  /** Verified RPC for a chain from the user's settings, or undefined when none is configured. */
  readonly getRpc: (chainId: number) => Promise<RpcClient | undefined>;
  /** Reads the bundled manifest back from the chain (primary RPC, plus the second provider when configured). Cached per chain and RPC; failures are not cached. */
  readonly checkDeployment: (manifest: DeploymentManifest) => Promise<DeploymentCheck>;
  /** Host names of the RPC endpoints in use for a chain, for warnings. */
  readonly rpcHosts: (chainId: number) => readonly string[];
  /** Announces a short status message to the polite live region. */
  readonly announce: (message: string) => void;
}

export const AppContext = createContext<AppState | undefined>(undefined);

export function useApp(): AppState {
  const s = useContext(AppContext);
  if (s === undefined) throw new Error('AppContext missing');
  return s;
}
