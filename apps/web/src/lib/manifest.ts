import {
  findChain,
  loadDeployment,
  verifyManifestOnChain,
  verifyManifestSignature,
  type DeploymentManifest,
  type ReleaseKey,
  type RpcClient,
} from '@ghostpay/chain-adapters';

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

/** Loads and validates one manifest from the app's own origin. Never throws. */
export async function loadManifest(
  chainId: number,
  fetchFn: FetchLike = (u, i) => fetch(u, i),
  baseUrl = './',
  releaseKey?: ReleaseKey,
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
    const t = verifyManifestSignature(text, { testnet: findChain(chainId)?.testnet === true, ...(releaseKey === undefined ? {} : { key: releaseKey }) });
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
