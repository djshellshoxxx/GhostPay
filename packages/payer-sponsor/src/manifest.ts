import { getAddress, isHex, type Address, type Hex } from 'viem';
import { assertTestnet } from './chainGuard.js';
import { PayerSponsorError } from './errors.js';

/** Per-chain addresses of the payer-hiding contracts (local JSON, same idea as the deployment manifest). */
export interface PayerHidingDeployment {
  readonly chainId: number;
  readonly relay?: Address;
  readonly delegate?: Address;
  readonly accountFactory?: Address;
  readonly paymaster?: Address;
  readonly entryPoint?: Address;
  /** keccak256 of the deployed EntryPoint runtime code; required before an EntryPoint is trusted (PH-4-REQ-2). */
  readonly entryPointCodeHash?: Hex;
  /** Chain supports EIP-7702 type-4 transactions (capability probe result or allowlist). */
  readonly supports7702?: boolean;
}

/** A manifest: one entry per chain id. */
export interface PayerHidingManifest {
  readonly deployments: readonly PayerHidingDeployment[];
}

const ADDRESS_KEYS = ['relay', 'delegate', 'accountFactory', 'paymaster', 'entryPoint'] as const;

/**
 * Validates untrusted manifest JSON (strict: unknown keys, bad addresses and non-testnet chain ids fail).
 *
 * @param json Parsed JSON.
 * @returns A frozen manifest.
 * @throws PayerSponsorError `MANIFEST_MISMATCH` for a malformed manifest, `MAINNET_FORBIDDEN` for a non-testnet chain id.
 */
export function parseManifest(json: unknown): PayerHidingManifest {
  const bad = (why: string): never => {
    throw new PayerSponsorError('MANIFEST_MISMATCH', `manifest invalid: ${why}`);
  };
  if (typeof json !== 'object' || json === null || !Array.isArray((json as { deployments?: unknown }).deployments)) {
    return bad('deployments array required');
  }
  const seen = new Set<number>();
  const out: PayerHidingDeployment[] = [];
  for (const raw of (json as { deployments: unknown[] }).deployments) {
    if (typeof raw !== 'object' || raw === null) return bad('deployment must be an object');
    const r = raw as Record<string, unknown>;
    const allowed = new Set<string>(['chainId', 'supports7702', 'entryPointCodeHash', ...ADDRESS_KEYS]);
    for (const k of Object.keys(r)) if (!allowed.has(k)) return bad(`unknown key ${k}`);
    const chainId = r['chainId'];
    if (typeof chainId !== 'number') return bad('chainId must be a number');
    assertTestnet(chainId);
    if (seen.has(chainId)) return bad('duplicate chainId');
    seen.add(chainId);
    const dep: { -readonly [K in keyof PayerHidingDeployment]: PayerHidingDeployment[K] } = { chainId };
    for (const k of ADDRESS_KEYS) {
      const v = r[k];
      if (v === undefined) continue;
      if (typeof v !== 'string') return bad(`${k} must be a string`);
      try {
        dep[k] = getAddress(v);
      } catch {
        return bad(`${k} is not an address`);
      }
    }
    const hash = r['entryPointCodeHash'];
    if (hash !== undefined) {
      if (typeof hash !== 'string' || !isHex(hash) || hash.length !== 66) return bad('entryPointCodeHash must be 32 bytes hex');
      dep.entryPointCodeHash = hash;
    }
    const s = r['supports7702'];
    if (s !== undefined) {
      if (typeof s !== 'boolean') return bad('supports7702 must be a boolean');
      dep.supports7702 = s;
    }
    out.push(Object.freeze(dep));
  }
  return Object.freeze({ deployments: Object.freeze(out) });
}

/**
 * Finds the deployment of `chainId`.
 *
 * @param manifest Validated manifest.
 * @param chainId Chain id (testnet allowlist enforced).
 * @returns The deployment.
 * @throws PayerSponsorError `MANIFEST_MISMATCH` when there is none.
 */
export function deploymentFor(manifest: PayerHidingManifest, chainId: number): PayerHidingDeployment {
  assertTestnet(chainId);
  const d = manifest.deployments.find((x) => x.chainId === chainId);
  if (d === undefined) throw new PayerSponsorError('MANIFEST_MISMATCH', 'no deployment for this chain');
  return d;
}
