import { ed25519 } from '@noble/curves/ed25519.js';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { fail } from './errors.js';
import type { Hex } from './types.js';

/** Pinned release key that signs deployment manifests. */
export interface ReleaseKey {
  /** `ed25519`: 32-byte key, 64-byte signature. `secp256k1`: 33-byte compressed key, 64-byte compact (r||s, low-s) signature. */
  readonly alg: 'ed25519' | 'secp256k1';
  readonly publicKey: Hex;
}

/**
 * Release key pinned in source. EMPTY on purpose until the project generates an offline release key
 * (see deployments/README.md). While `undefined`, only testnet manifests are accepted, and loudly as
 * "unsigned dev manifest". Never fill this with a key you did not generate offline yourself.
 */
export const RELEASE_KEY: ReleaseKey | undefined = undefined;

/** Warning shown whenever a manifest is accepted without signature verification. */
export const UNSIGNED_DEV_WARNING =
  'UNSIGNED DEV MANIFEST: no release key is pinned, so this deployment manifest is not authenticated. Testnet use only; never send real funds.';

/** Outcome of {@link verifyManifestSignature}. */
export type ManifestTrust =
  | { readonly trust: 'signed' }
  | { readonly trust: 'unsigned-dev'; readonly warning: string };

/** Domain separator prepended to the canonical manifest before signing. */
export const MANIFEST_SIGNING_DOMAIN = 'GhostPay-deployment-manifest-v1\n';

function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (typeof v === 'object' && v !== null) {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

/**
 * Canonical signing bytes of a manifest: UTF-8 of {@link MANIFEST_SIGNING_DOMAIN} plus the key-sorted,
 * whitespace-free JSON of the manifest object without its `signature` field.
 *
 * @param text Raw manifest JSON.
 * @returns Bytes to sign (ed25519) or to hash with SHA-256 and sign (secp256k1).
 * @throws {ChainAdapterError} `INVALID_MANIFEST` for non-object JSON.
 */
export function manifestSigningBytes(text: string): Uint8Array {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail('INVALID_MANIFEST', 'json');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return fail('INVALID_MANIFEST', 'not an object');
  const { signature: _omit, ...rest } = parsed as Record<string, unknown>;
  void _omit;
  return new TextEncoder().encode(MANIFEST_SIGNING_DOMAIN + stable(rest));
}

function unhex(h: string, len: number, what: string): Uint8Array {
  if (!/^0x(?:[0-9a-fA-F]{2})*$/.test(h) || (h.length - 2) / 2 !== len) return fail('INVALID_MANIFEST', what);
  return Uint8Array.from(h.slice(2).match(/../g) ?? [], (x) => parseInt(x, 16));
}

/**
 * Verifies the detached signature of a manifest against the pinned release key.
 *
 * @remarks Fail closed. With a key: a missing or invalid signature always throws. Without a key: only
 * `testnet` chains are accepted, flagged `unsigned-dev` with a warning; mainnet throws.
 *
 * @param text Raw manifest JSON (as served; the signature field is read from it).
 * @param opts `key` pinned release key (default {@link RELEASE_KEY}); `testnet` whether the chain is a testnet.
 * @returns Trust level.
 * @throws {ChainAdapterError} `INVALID_MANIFEST`.
 */
export function verifyManifestSignature(
  text: string,
  opts: { readonly testnet: boolean; readonly key?: ReleaseKey | undefined },
): ManifestTrust {
  const key = 'key' in opts ? opts.key : RELEASE_KEY;
  const msg = manifestSigningBytes(text);
  if (key === undefined) {
    if (!opts.testnet) return fail('INVALID_MANIFEST', 'no release key pinned: unsigned manifest refused outside testnets');
    return { trust: 'unsigned-dev', warning: UNSIGNED_DEV_WARNING };
  }
  const sigHex = (JSON.parse(text) as Record<string, unknown>)['signature'];
  if (typeof sigHex !== 'string') return fail('INVALID_MANIFEST', 'signature missing');
  let ok: boolean;
  try {
    const sig = unhex(sigHex, 64, 'signature length');
    if (key.alg === 'ed25519') {
      ok = ed25519.verify(sig, msg, unhex(key.publicKey, 32, 'release key'));
    } else {
      ok = secp256k1.verify(sig, sha256(msg), unhex(key.publicKey, 33, 'release key'), { prehash: false, lowS: true });
    }
  } catch {
    ok = false;
  }
  if (!ok) return fail('INVALID_MANIFEST', 'signature invalid');
  return { trust: 'signed' };
}
