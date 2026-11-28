import {
  createReconciledClient,
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
/**
 * Why a loaded manifest became `invalid` at read-back time (L2-I4): the chain disagrees with the manifest (`readback`),
 * the primary RPC could not be read (`rpc-unreadable`), the second RPC configured for the chain could not be opened or
 * read (`second-rpc-unavailable`), or the two providers disagree with each other (`providers-disagree`).
 */
export type ManifestInvalidCause = 'readback' | 'rpc-unreadable' | 'second-rpc-unavailable' | 'providers-disagree';

export type ManifestState =
  | { readonly status: 'absent' }
  | { readonly status: 'invalid'; readonly reason: string; readonly cause?: ManifestInvalidCause }
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
  'rpc-unreadable': 'The contracts could not be read from your RPC, so the deployment manifest could not be confirmed. Check the RPC in Settings and try again.',
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

/** Catalog keys for the same causes, for views that render translated text; the English entries equal {@link READBACK_REASONS}. */
export const MANIFEST_READBACK_KEYS = Object.freeze({
  readback: 'manifest.readback.mismatch',
  'rpc-unreadable': 'manifest.readback.rpcUnreadable',
  'second-rpc-unavailable': 'manifest.readback.secondRpc',
  'providers-disagree': 'manifest.readback.disagree',
} as const) satisfies Readonly<Record<ManifestInvalidCause, string>>;

const invalid = (cause: ManifestInvalidCause): ManifestState => ({ status: 'invalid', reason: READBACK_REASONS[cause], cause });

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
    ? createReconciledClient(client, tracked(secondary.client, () => { secondFailed = true; }), deps.sleep === undefined ? {} : { sleep: deps.sleep })
    : client;
  try {
    await verifyManifestOnChain(state.manifest, readback);
    return state;
  } catch (e) {
    if (secondFailed) return invalid('second-rpc-unavailable');
    if (secondary.kind === 'client' && e instanceof Error && e.message === 'RPC_FAILURE: providers disagree') return invalid('providers-disagree');
    // verifyManifestOnChain reports a chain/manifest mismatch as INVALID_MANIFEST; anything else is a read failure.
    if (e instanceof Error && e.message.startsWith('INVALID_MANIFEST')) return invalid('readback');
    return invalid('rpc-unreadable');
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
