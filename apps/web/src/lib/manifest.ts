import {
  loadDeployment,
  verifyManifestOnChain,
  verifyObjectManifestSignature,
  type DeploymentManifest,
  type RpcClient,
} from '@ghostpay/chain-adapters';
import { BUNDLED_MANIFESTS } from './bundledManifests';
import { pagesOriginAllowsPayments, pagesOriginRefusal } from './pagesOrigin';
import { RELEASE_PUBLIC_KEYS } from './releaseKeys';

/**
 * Result of looking for `deployments/<chainId>.json`:
 * - `absent`: no manifest published for this chain, so payments stay disabled;
 * - `invalid`: a file exists but the validator rejected it, so payments stay disabled;
 * - `loaded`: validated manifest (the only source of the fee recipient and contract addresses).
 */
export type ManifestState =
  | { readonly status: 'absent' }
  | { readonly status: 'invalid'; readonly reason: string }
  | {
      readonly status: 'loaded';
      readonly manifest: DeploymentManifest;
      /**
       * `signed`: verified against a release key compiled into this bundle; the only trust the app produces. The legacy
       * text-manifest loader that produced `unsigned-dev` (runtime fetch, no key on testnets) was removed (SEC-14); the
       * value stays in the type so views keep a loud warning for any injected test state.
       */
      readonly trust?: 'signed' | 'unsigned-dev';
      readonly warning?: string;
    };

/** Loads a manifest compiled into this app bundle. Runtime callers must never substitute an origin-fetched manifest. */
export function loadBundledManifest(
  chainId: number,
  source: Readonly<Record<string, string>> = BUNDLED_MANIFESTS,
  releaseKeys: readonly string[] = RELEASE_PUBLIC_KEYS,
): ManifestState {
  const text = Object.hasOwn(source, String(chainId)) ? source[String(chainId)] : undefined;
  if (text === undefined) return { status: 'absent' };
  if (!pagesOriginAllowsPayments()) return { status: 'invalid', reason: pagesOriginRefusal() };
  if (releaseKeys.length === 0) return { status: 'invalid', reason: 'No release verification key is configured; deployment manifests are disabled.' };
  try {
    const manifest = loadDeployment(text, chainId);
    if (verifyObjectManifestSignature(manifest, releaseKeys).status === 'valid') return { status: 'loaded', manifest, trust: 'signed' };
    return { status: 'invalid', reason: 'The bundled deployment manifest does not carry a valid configured release signature.' };
  } catch {
    return { status: 'invalid', reason: 'The bundled deployment manifest failed validation.' };
  }
}

/**
 * Cross-checks a loaded manifest against the chain (FEE_RECIPIENT, ANNOUNCER, FEE_BPS, runtime codehashes).
 * Non-loaded states pass through. Any mismatch or RPC failure yields `invalid` (fail closed), never `loaded`.
 */
export async function verifyManifestState(state: ManifestState, client: RpcClient): Promise<ManifestState> {
  if (state.status !== 'loaded') return state;
  try {
    await verifyManifestOnChain(state.manifest, client);
    return state;
  } catch {
    return { status: 'invalid', reason: 'The contracts on-chain do not match the deployment manifest.' };
  }
}

/**
 * Gate for every flow that builds a payment or sweep from a manifest (WEB-APP-01): the manifest is cross-checked
 * against the chain first. Without an RPC nothing can be checked, so a loaded manifest fails closed.
 */
export async function verifyManifestForFlow(state: ManifestState, client: RpcClient | undefined): Promise<ManifestState> {
  if (state.status !== 'loaded') return state;
  if (client === undefined) {
    return { status: 'invalid', reason: 'An RPC for this chain is needed to verify the contracts against the deployment manifest. Configure one in Settings.' };
  }
  return verifyManifestState(state, client);
}
