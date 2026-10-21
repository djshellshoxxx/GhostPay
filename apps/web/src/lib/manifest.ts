import { loadDeployment, type DeploymentManifest } from '@ghostpay/chain-adapters';

/**
 * Result of looking for `deployments/<chainId>.json`:
 * - `absent`: no manifest published for this chain, so payments stay disabled;
 * - `invalid`: a file exists but the validator rejected it, so payments stay disabled;
 * - `loaded`: validated manifest (the only source of the fee recipient and contract addresses).
 */
export type ManifestState =
  | { readonly status: 'absent' }
  | { readonly status: 'invalid'; readonly reason: string }
  | { readonly status: 'loaded'; readonly manifest: DeploymentManifest };

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** Loads and validates one manifest from the app's own origin. Never throws. */
export async function loadManifest(
  chainId: number,
  fetchFn: FetchLike = (u, i) => fetch(u, i),
  baseUrl = './',
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
    return { status: 'loaded', manifest: loadDeployment(text, chainId) };
  } catch (e) {
    const name = e instanceof Error ? e.name : '';
    if (name === 'ChainAdapterError') {
      return { status: 'invalid', reason: 'The deployment manifest failed validation.' };
    }
    return { status: 'absent' };
  }
}
