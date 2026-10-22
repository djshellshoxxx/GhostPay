import {
  findChain,
  loadDeployment,
  verifyManifestOnChain,
  verifyObjectManifestSignature,
  verifyTextManifestSignature as verifyManifestSignature,
  type DeploymentManifest,
  type ReleaseKey,
  type RpcClient,
} from '@ghostpay/chain-adapters';
import { BUNDLED_MANIFESTS } from './bundledManifests';
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
      /** `signed`: verified against the pinned release key. `unsigned-dev`: no key pinned (testnet only), show `warning` loudly. */
      readonly trust?: 'signed' | 'unsigned-dev';
      readonly warning?: string;
    };

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** Loads a manifest compiled into this app bundle. Runtime callers must never substitute an origin-fetched manifest. */
export function loadBundledManifest(
  chainId: number,
  source: Readonly<Record<string, string>> = BUNDLED_MANIFESTS,
  releaseKeys: readonly string[] = RELEASE_PUBLIC_KEYS,
): ManifestState {
  const text = Object.hasOwn(source, String(chainId)) ? source[String(chainId)] : undefined;
  if (text === undefined) return { status: 'absent' };
  if (releaseKeys.length === 0) return { status: 'invalid', reason: 'No release verification key is configured; deployment manifests are disabled.' };
  try {
    const manifest = loadDeployment(text, chainId);
    if (verifyObjectManifestSignature(manifest, releaseKeys).status === 'valid') return { status: 'loaded', manifest, trust: 'signed' };
    return { status: 'invalid', reason: 'The bundled deployment manifest does not carry a valid configured release signature.' };
  } catch {
    return { status: 'invalid', reason: 'The bundled deployment manifest failed validation.' };
  }
}

/** Manual/test-only network readback. The default app service uses loadBundledManifest instead. Never throws. */
export async function loadManifest(
  chainId: number,
  fetchFn: FetchLike = (u, i) => fetch(u, i),
  baseUrl = './',
  releaseKey?: ReleaseKey | readonly ReleaseKey[],
): Promise<ManifestState> {
  try {
    const res = await fetchFn(`${baseUrl}deployments/${String(chainId)}.json`, {
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    });
    if (!res.ok) return { status: 'absent' };
    const text = await res.text();
    // Static hosts may answer a missing file with an HTML fallback page; that is "absent", not "invalid".
    if (!text.trimStart().startsWith('{')) return { status: 'absent' };
    const manifest = loadDeployment(text, chainId);
    // Fail closed: with a pinned key the signature must verify; without one only testnets load, flagged unsigned.
    const testnet = findChain(chainId)?.testnet === true;
    const releaseKeys: readonly ReleaseKey[] = releaseKey === undefined
      ? []
      : 'alg' in releaseKey ? [releaseKey] : releaseKey;
    let t: ReturnType<typeof verifyManifestSignature> | undefined;
    if (releaseKeys.length === 0) {
      t = verifyManifestSignature(text, { testnet });
    } else {
      for (const key of releaseKeys) {
        try {
          t = verifyManifestSignature(text, { testnet, key });
          break;
        } catch {
          // A manifest is trusted only if one of the locally pinned keys verifies its signature.
        }
      }
      if (t === undefined) return { status: 'invalid', reason: 'The deployment manifest does not carry a valid signature from a configured release key.' };
    }
    if (t.trust === 'unsigned-dev') {
      console.warn(t.warning);
      return { status: 'loaded', manifest, trust: t.trust, warning: t.warning };
    }
    return { status: 'loaded', manifest, trust: t.trust };
  } catch (e) {
    const name = e instanceof Error ? e.name : '';
    if (name === 'ChainAdapterError') {
      return { status: 'invalid', reason: 'The deployment manifest failed validation.' };
    }
    return { status: 'absent' };
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
