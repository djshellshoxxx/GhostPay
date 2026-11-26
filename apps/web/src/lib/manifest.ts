import {
  createReconciledClient,
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
/**
 * Why a loaded manifest became `invalid` at read-back time (L2-I4): the chain disagrees with the manifest, the second
 * RPC configured for the chain could not be opened or read, or the two providers disagree with each other.
 */
export type ManifestInvalidCause = 'readback' | 'second-rpc-unavailable' | 'providers-disagree';

export type ManifestState =
  | { readonly status: 'absent' }
  | { readonly status: 'invalid'; readonly reason: string; readonly cause?: ManifestInvalidCause }
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
 * The user's optional second RPC as it enters the read-back (L2-I4):
 * - `none`: no second RPC is configured for the chain, so the read-back uses one provider (as before);
 * - `client`: the second provider was opened and must agree with the primary on every read;
 * - `unavailable`: a second RPC is configured but could not be opened (unreachable, wrong chain); the flow fails
 *   closed instead of silently continuing with one provider.
 */
export type SecondaryReadback =
  | { readonly kind: 'none' }
  | { readonly kind: 'client'; readonly client: RpcClient }
  | { readonly kind: 'unavailable' };

export const NO_SECONDARY: SecondaryReadback = Object.freeze({ kind: 'none' });

/** Fixed-form refusal texts (no URLs, no provider text), one per {@link ManifestInvalidCause}. */
export const READBACK_REASONS: Readonly<Record<ManifestInvalidCause, string>> = Object.freeze({
  readback: 'The contracts on-chain do not match the deployment manifest.',
  'second-rpc-unavailable': 'The second RPC configured for this chain could not be used to confirm the contracts against the deployment manifest. Check it in Settings, or remove it to verify with one provider.',
  'providers-disagree': 'Your two RPC providers disagree about the contracts on this chain, so the deployment manifest could not be confirmed. Try another provider, or remove the second RPC in Settings.',
});

/**
 * Opens the second RPC for the read-back. `open` is the app's `getSecondaryRpc`: it resolves to `undefined` when no
 * second RPC is configured and rejects when the configured one cannot be used (unreachable, wrong chain id). Never throws.
 */
export async function openSecondaryReadback(open: () => Promise<RpcClient | undefined>): Promise<SecondaryReadback> {
  try {
    const client = await open();
    return client === undefined ? NO_SECONDARY : { kind: 'client', client };
  } catch {
    return { kind: 'unavailable' };
  }
}

const invalid = (cause: ManifestInvalidCause): ManifestState => ({ status: 'invalid', reason: READBACK_REASONS[cause], cause });

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms); });

/** Same client, but remembers whether one of its requests failed (to tell "second RPC unusable" from a mismatch). */
function tracked(client: RpcClient, onFailure: () => void): RpcClient {
  return {
    ...client,
    request: async (method, params) => {
      try {
        return await client.request(method, params);
      } catch (e) {
        onFailure();
        throw e;
      }
    },
  };
}

/**
 * Cross-checks a loaded manifest against the chain (FEE_RECIPIENT, ANNOUNCER, FEE_BPS, runtime codehashes).
 * Non-loaded states pass through. Any mismatch or RPC failure yields `invalid` (fail closed), never `loaded`.
 *
 * With a second provider (L2-I4) every `eth_getCode` and `eth_call` of the read-back must return the same result from
 * both providers ({@link createReconciledClient}); a disagreement, a second provider that cannot be read, or one that
 * could not be opened at all refuses the flow. There is no silent fallback to one provider: the user removes the second
 * RPC in Settings to opt out of the cross-check.
 */
export async function verifyManifestState(
  state: ManifestState,
  client: RpcClient,
  secondary: SecondaryReadback = NO_SECONDARY,
  deps: { readonly sleep?: (ms: number) => Promise<void> } = {},
): Promise<ManifestState> {
  if (state.status !== 'loaded') return state;
  if (secondary.kind === 'unavailable') return invalid('second-rpc-unavailable');
  if (secondary.kind === 'client' && secondary.client.chainId !== client.chainId) return invalid('second-rpc-unavailable');
  let secondFailed = false;
  const readback = secondary.kind === 'client'
    ? createReconciledClient(client, tracked(secondary.client, () => { secondFailed = true; }), { sleep: deps.sleep ?? defaultSleep })
    : client;
  try {
    await verifyManifestOnChain(state.manifest, readback);
    return state;
  } catch (e) {
    if (secondFailed) return invalid('second-rpc-unavailable');
    if (secondary.kind === 'client' && e instanceof Error && e.message === 'RPC_FAILURE: providers disagree') return invalid('providers-disagree');
    return invalid('readback');
  }
}

/**
 * Gate for every flow that builds a payment or sweep from a manifest (WEB-APP-01): the manifest is cross-checked
 * against the chain first, through the second RPC as well when one is configured (L2-I4). Without an RPC nothing can
 * be checked, so a loaded manifest fails closed.
 */
export async function verifyManifestForFlow(
  state: ManifestState,
  client: RpcClient | undefined,
  secondary: SecondaryReadback = NO_SECONDARY,
  deps: { readonly sleep?: (ms: number) => Promise<void> } = {},
): Promise<ManifestState> {
  if (state.status !== 'loaded') return state;
  if (client === undefined) {
    return { status: 'invalid', reason: 'An RPC for this chain is needed to verify the contracts against the deployment manifest. Configure one in Settings.' };
  }
  return verifyManifestState(state, client, secondary, deps);
}
