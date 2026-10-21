import { loadDeployment, verifyManifestSignature, type DeploymentManifest } from '@ghostpay/chain-adapters';
import { BUNDLED_MANIFESTS } from './bundledManifests';
import { RELEASE_PUBLIC_KEYS } from './releaseKeys';

/** What was established about the manifest signature. Never `valid` unless a compiled-in release key verified it. */
export type SignatureStatus = 'unsigned' | 'unverifiable' | 'valid';

/**
 * State of the manifest bundled for one chain:
 * - `absent`: none is bundled, so payments stay disabled;
 * - `invalid`: it failed validation (or a required signature), so payments stay disabled;
 * - `loaded`: validated manifest. Still UNTRUSTED until `verifyDeployment` has read the chain back.
 */
export type ManifestState =
  | { readonly status: 'absent' }
  | { readonly status: 'invalid'; readonly reason: string }
  | { readonly status: 'loaded'; readonly manifest: DeploymentManifest; readonly signature?: SignatureStatus };

/**
 * Looks up and validates the manifest that was compiled into this bundle. Synchronous, offline, never throws.
 *
 * @remarks If release keys are compiled in, a manifest must carry a valid signature from one of them, otherwise it is
 * `invalid`. With no keys the signature is reported as `unsigned` or `unverifiable` (present but not checked).
 */
export function loadManifest(
  chainId: number,
  source: Readonly<Record<string, string>> = BUNDLED_MANIFESTS,
  releaseKeys: readonly string[] = RELEASE_PUBLIC_KEYS,
): ManifestState {
  const text = Object.hasOwn(source, String(chainId)) ? source[String(chainId)] : undefined;
  if (text === undefined) return { status: 'absent' };
  try {
    const manifest = loadDeployment(text, chainId);
    const sig = verifyManifestSignature(manifest, releaseKeys);
    if (sig.status === 'invalid' || (releaseKeys.length > 0 && sig.status !== 'valid')) {
      return { status: 'invalid', reason: 'The deployment manifest does not carry a valid release signature.' };
    }
    return { status: 'loaded', manifest, signature: sig.status === 'valid' ? 'valid' : sig.status };
  } catch {
    return { status: 'invalid', reason: 'The deployment manifest failed validation.' };
  }
}
