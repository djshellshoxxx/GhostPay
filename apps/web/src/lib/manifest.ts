import {
  ChainAdapterError,
  assertManifestVerified,
  loadDeployment,
  verifyManifest,
  type DeploymentManifest,
  type ReadbackResult,
  type RpcClient,
} from '@ghostpay/chain-adapters';

/**
 * Result of looking for `deployments/<chainId>.json`:
 * - `absent`: no manifest published for this chain, so payments stay disabled;
 * - `invalid`: a file exists but the validator rejected it, so payments stay disabled;
 * - `unverified`: validated, but NOT confirmed against the chain (no RPC, mismatch, provider error): payments stay disabled;
 * - `loaded`: validated AND read back from the chain by `verifyManifest` (the only source of the fee recipient and
 *   contract addresses). The loader alone never produces this state with a verified flag; see `applyVerification`.
 */
export type ManifestState =
  | { readonly status: 'absent' }
  | { readonly status: 'invalid'; readonly reason: string }
  | { readonly status: 'unverified'; readonly reason: string }
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

/** Outcome of checking a manifest against the chain. `reason` is safe to show (check names only). */
export type VerifyOutcome = { readonly ok: true } | { readonly ok: false; readonly reason: string };

export type ReadbackFn = (m: DeploymentManifest, clients: readonly RpcClient[]) => Promise<ReadbackResult>;

const NO_RPC = 'No working RPC is configured for this chain. Add one in Settings: the manifest is checked against the chain before payments are enabled.';

/**
 * Reads the manifest back from the chain (`verifyManifest` + `assertManifestVerified`). Fails closed: no RPC, any
 * mismatch, or any error is `ok: false`. Never throws. Uses the single user RPC (no second provider is configured).
 */
export async function verifyManifestOnChain(
  manifest: DeploymentManifest,
  rpc: RpcClient | undefined,
  readback: ReadbackFn = (m, c) => verifyManifest(m, c),
): Promise<VerifyOutcome> {
  if (rpc === undefined) return { ok: false, reason: NO_RPC };
  try {
    assertManifestVerified(await readback(manifest, [rpc]));
    return { ok: true };
  } catch (e) {
    const names = e instanceof ChainAdapterError && e.code === 'MANIFEST_READBACK_FAILED' ? e.message.slice('MANIFEST_READBACK_FAILED: '.length) : '';
    const detail = /^[A-Za-z0-9.,_]{1,200}$/.test(names) ? ` (failed checks: ${names.split(',').join(', ')})` : '';
    return { ok: false, reason: `The deployment manifest does not match what is deployed on the chain${detail}. Do not use this deployment.` };
  }
}

/** A `loaded` state stays loaded only when verification passed; otherwise it becomes `unverified`. */
export function applyVerification(state: ManifestState, outcome: VerifyOutcome): ManifestState {
  if (state.status !== 'loaded') return state;
  return outcome.ok ? state : { status: 'unverified', reason: outcome.reason };
}

/** One-line explanation for any non-loaded state; `undefined` when payments may proceed. */
export function manifestBlockText(state: ManifestState): string | undefined {
  switch (state.status) {
    case 'loaded':
      return undefined;
    case 'invalid':
      return 'Payments disabled on this chain: the deployment manifest failed validation.';
    case 'unverified':
      return `Payments disabled on this chain: the deployment manifest could not be verified. ${state.reason}`;
    case 'absent':
      return 'Payments disabled on this chain: no deployment manifest is loaded.';
  }
}
