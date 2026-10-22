import { secp256k1 } from '@noble/curves/secp256k1.js';
import { decodeFunctionResult, encodeFunctionData, getAddress, keccak256, toBytes } from 'viem/utils';
import { findChain } from './config/chains.js';
import type { DeploymentManifest } from './deployments.js';
import { fail } from './errors.js';
import { FEE_SCHEDULE } from './fees.js';
import { ghostPayRouterAbi } from './abi/router.js';
import { requestWithFallbackCheck, type RpcClient } from './rpc.js';
import type { Address, Hex } from './types.js';

/**
 * Canonical ERC-5564 announcer address (`docs/CONTRACTS_SPEC.md` section 1). It is a CONSTANT in this package, not a
 * manifest value: a manifest that names another announcer is rejected by {@link verifyDeployment}.
 */
export const CANONICAL_ANNOUNCER: Address = '0x55649E01B5Df198D18D95b5cc5051630cfD45564';

/**
 * Canonical announcer for a chain, or `undefined` for a chain this package does not know (fail closed).
 *
 * @param chainId EIP-155 id.
 * @returns The announcer constant.
 */
export function canonicalAnnouncer(chainId: number): Address | undefined {
  return findChain(chainId) === undefined ? undefined : CANONICAL_ANNOUNCER;
}

/* ------------------------------ manifest signature ------------------------------ */

/**
 * Serialises a validated manifest to its canonical JSON text: the wire shape of `deployments/schema.json`
 * (policy fields flat, `policyFlatFee` a decimal string), keys sorted at every level, no whitespace, `signature`
 * excluded. This is the text that is hashed and signed.
 *
 * @param m Validated manifest.
 * @returns Canonical JSON.
 */
export function canonicalManifestJson(m: DeploymentManifest): string {
  const deployTx: Record<string, string> = { router: m.deployTx.router, sweepRelayer: m.deployTx.sweepRelayer };
  const bytecodeHashes: Record<string, string> = { router: m.bytecodeHashes.router, sweepRelayer: m.bytecodeHashes.sweepRelayer };
  const wire: Record<string, unknown> = {
    chainId: m.chainId,
    announcer: m.announcer,
    router: m.router,
    sweepRelayer: m.sweepRelayer,
    feeRecipient: m.feeRecipient,
    feeBps: m.feeBps,
    solcVersion: m.solcVersion,
    commit: m.commit,
    date: m.date,
    deployTx,
    bytecodeHashes,
  };
  if (m.policy !== undefined) {
    wire['policyImplementation'] = m.policy.implementation;
    wire['policyFactory'] = m.policy.factory;
    wire['policyFeeToken'] = m.policy.feeToken;
    wire['policyFlatFee'] = m.policy.flatFee.toString();
    wire['policyFeeRecipient'] = m.policy.feeRecipient;
    deployTx['policyImplementation'] = m.policy.deployTx.implementation;
    deployTx['policyFactory'] = m.policy.deployTx.factory;
    bytecodeHashes['policyImplementation'] = m.policy.bytecodeHashes.implementation;
    bytecodeHashes['policyFactory'] = m.policy.bytecodeHashes.factory;
  }
  return sortedJson(wire);
}

function sortedJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(sortedJson).join(',')}]`;
  if (typeof v === 'object' && v !== null) {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${sortedJson(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

/**
 * Digest that a release key signs: `keccak256(utf8(canonicalManifestJson(manifest)))`.
 *
 * @param m Validated manifest.
 * @returns 32-byte digest.
 */
export function manifestDigest(m: DeploymentManifest): Hex {
  return keccak256(toBytes(canonicalManifestJson(m)));
}

/** Outcome of {@link verifyManifestSignature}. */
export type ManifestSignatureResult =
  | { readonly status: 'unsigned' }
  /** A signature is present but no release key is compiled in, so nothing could be checked. */
  | { readonly status: 'unverifiable' }
  | { readonly status: 'valid'; readonly keyIndex: number }
  | { readonly status: 'invalid' };

const COMPRESSED_KEY = /^(?:02|03)[0-9a-fA-F]{64}$/;
const SIG64 = /^0x[0-9a-fA-F]{128}$/;

function hexBytes(h: string): Uint8Array {
  return Uint8Array.from(h.match(/../g) ?? [], (x) => parseInt(x, 16));
}

/**
 * Verifies the detached manifest signature against release public keys that were compiled into the build.
 *
 * @remarks The signature is a 64-byte compact secp256k1 ECDSA signature (`0x` + r || s, low-s enforced) over
 * {@link manifestDigest}. `releaseKeys` are 33-byte compressed public keys (hex, no `0x`). With NO keys the result is
 * `unverifiable` when a signature exists and `unsigned` otherwise: the caller must say so, not imply verification.
 * This does not make a manifest trustworthy by itself: the keys come from the same bundle as the code, so it only
 * helps when the bundle is obtained and checked out of band (see S3-04 / D7).
 *
 * @param m Validated manifest.
 * @param releaseKeys Compressed public keys, possibly empty.
 * @returns Signature status.
 * @throws {ChainAdapterError} `INVALID_INPUT` when a release key is malformed.
 */
export function verifyManifestSignature(m: DeploymentManifest, releaseKeys: readonly string[]): ManifestSignatureResult {
  for (const k of releaseKeys) if (!COMPRESSED_KEY.test(k)) return fail('INVALID_INPUT', 'release key must be a compressed secp256k1 public key');
  if (m.signature === undefined) return { status: 'unsigned' };
  if (releaseKeys.length === 0) return { status: 'unverifiable' };
  if (!SIG64.test(m.signature)) return { status: 'invalid' };
  const digest = hexBytes(manifestDigest(m).slice(2));
  const sig = hexBytes(m.signature.slice(2));
  for (let i = 0; i < releaseKeys.length; i++) {
    try {
      if (secp256k1.verify(sig, digest, hexBytes(releaseKeys[i] as string), { prehash: false, lowS: true })) return { status: 'valid', keyIndex: i };
    } catch {
      /* a malformed signature for this key: try the next one */
    }
  }
  return { status: 'invalid' };
}

/* ------------------------------ on-chain read-back ------------------------------ */

/** Result of a successful {@link verifyDeployment}. Addresses are the values READ FROM THE CHAIN. */
export interface VerifiedDeployment {
  readonly chainId: number;
  /** The router address that was probed (it has the expected code hash). */
  readonly router: Address;
  readonly sweepRelayer: Address;
  /** `FEE_RECIPIENT()` as returned by the router. */
  readonly feeRecipient: Address;
  /** `ANNOUNCER()` as returned by the router. */
  readonly announcer: Address;
  /** `FEE_BPS()` as returned by the router. */
  readonly feeBps: bigint;
  readonly policyFactory?: Address;
  /** Number of independent providers that returned identical results (1 or 2). */
  readonly providers: 1 | 2;
}

/** Options for {@link verifyDeployment}. */
export interface VerifyDeploymentOptions {
  /** Independent second provider on the same chain; every read must then agree exactly. */
  readonly secondary?: RpcClient;
  /** Fail when no second provider is configured. */
  readonly requireSecondary?: boolean;
}

const ADDRESS_WORD = /^0x0{24}[0-9a-fA-F]{40}$/;
const CODE = /^0x(?:[0-9a-fA-F]{2})+$/;

/**
 * Reads the deployment back from the chain and compares it with the manifest. Fails closed.
 *
 * @remarks Through the user's RPC (and, when given, a second independent provider with identical-result
 * reconciliation via {@link requestWithFallbackCheck}):
 * - `eth_getCode` of router, sweep relayer and (if the manifest has a policy section) the policy factory must
 *   hash (keccak256) to the manifest `bytecodeHashes`;
 * - the router's `FEE_BPS()` must equal 25, `FEE_RECIPIENT()` must equal `manifest.feeRecipient`, and `ANNOUNCER()`
 *   must equal both `manifest.announcer` and the canonical announcer constant of the chain, which must have code.
 * This proves the contracts at those addresses are the reviewed bytecode with the reviewed immutables. It does not
 * prove that the manifest itself is the one the maintainers intended (see {@link verifyManifestSignature}), and a
 * lying RPC is only caught when a second provider is configured.
 *
 * @param m Validated manifest.
 * @param client Verified client for the manifest chain.
 * @param opts Options.
 * @returns The values read from the chain.
 * @throws {ChainAdapterError} `DEPLOYMENT_UNVERIFIED` (any mismatch), `CHAIN_MISMATCH`, `RPC_FAILURE`.
 */
export async function verifyDeployment(m: DeploymentManifest, client: RpcClient, opts: VerifyDeploymentOptions = {}): Promise<VerifiedDeployment> {
  if (client.chainId !== m.chainId) return fail('CHAIN_MISMATCH', 'client and manifest are on different chains');
  const second = opts.secondary;
  if (second !== undefined && second.chainId !== m.chainId) return fail('CHAIN_MISMATCH', 'second provider is on a different chain');
  if (opts.requireSecondary === true && second === undefined) return fail('DEPLOYMENT_UNVERIFIED', 'a second independent provider is required but not configured');
  const announcer = canonicalAnnouncer(m.chainId);
  if (announcer === undefined) return fail('DEPLOYMENT_UNVERIFIED', 'no canonical announcer is known for this chain');
  if (m.announcer !== announcer) return fail('DEPLOYMENT_UNVERIFIED', 'manifest announcer is not the canonical announcer');
  if (m.feeBps !== Number(FEE_SCHEDULE.ROUTER_FEE_BPS)) return fail('DEPLOYMENT_UNVERIFIED', 'manifest fee is not 25 bps');

  const read = async (method: string, params: readonly unknown[]): Promise<unknown> =>
    second === undefined ? client.request(method, params) : requestWithFallbackCheck(client, second, method, params);

  const codeHash = async (addr: Address): Promise<Hex> => {
    const code = await read('eth_getCode', [addr, 'latest']);
    if (typeof code !== 'string' || !CODE.test(code)) return fail('DEPLOYMENT_UNVERIFIED', 'no contract code at a manifest address');
    return keccak256(code as Hex);
  };
  const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

  if (!same(await codeHash(m.router), m.bytecodeHashes.router)) return fail('DEPLOYMENT_UNVERIFIED', 'router code hash differs from the manifest');
  if (!same(await codeHash(m.sweepRelayer), m.bytecodeHashes.sweepRelayer)) {
    return fail('DEPLOYMENT_UNVERIFIED', 'sweep relayer code hash differs from the manifest');
  }
  if (m.policy !== undefined && !same(await codeHash(m.policy.factory), m.policy.bytecodeHashes.factory)) {
    return fail('DEPLOYMENT_UNVERIFIED', 'policy factory code hash differs from the manifest');
  }
  await codeHash(announcer); // the canonical announcer must exist on this chain (its hash is not pinned here)

  const callRouter = async (fn: 'FEE_RECIPIENT' | 'ANNOUNCER' | 'FEE_BPS'): Promise<unknown> => {
    const data = encodeFunctionData({ abi: ghostPayRouterAbi, functionName: fn });
    const r = await read('eth_call', [{ to: m.router, data }, 'latest']);
    if (typeof r !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(r) || (fn !== 'FEE_BPS' && !ADDRESS_WORD.test(r))) {
      return fail('DEPLOYMENT_UNVERIFIED', 'router returned a malformed value');
    }
    return decodeFunctionResult({ abi: ghostPayRouterAbi, functionName: fn, data: r as Hex });
  };
  const feeBps = (await callRouter('FEE_BPS')) as bigint;
  if (feeBps !== FEE_SCHEDULE.ROUTER_FEE_BPS) return fail('DEPLOYMENT_UNVERIFIED', 'router FEE_BPS is not 25');
  const feeRecipient = getAddress((await callRouter('FEE_RECIPIENT')) as string);
  if (feeRecipient !== m.feeRecipient) return fail('DEPLOYMENT_UNVERIFIED', 'router FEE_RECIPIENT differs from the manifest');
  const onChainAnnouncer = getAddress((await callRouter('ANNOUNCER')) as string);
  if (onChainAnnouncer !== announcer || onChainAnnouncer !== m.announcer) return fail('DEPLOYMENT_UNVERIFIED', 'router ANNOUNCER is not the canonical announcer');

  return {
    chainId: m.chainId,
    router: m.router,
    sweepRelayer: m.sweepRelayer,
    feeRecipient,
    announcer: onChainAnnouncer,
    feeBps,
    ...(m.policy === undefined ? {} : { policyFactory: m.policy.factory }),
    providers: second === undefined ? 1 : 2,
  };
}
