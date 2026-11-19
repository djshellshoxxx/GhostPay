import { keccak256, toBytes } from 'viem/utils';
import { fail } from './errors.js';
import { requestWithFallbackCheck, type RpcClient } from './rpc.js';
import type { DeploymentManifest } from './deployments.js';
import type { Address, Hex } from './types.js';
import { canonicalAnnouncer, type VerifyDeploymentOptions } from './verify.js';

const sel = (sig: string): Hex => `0x${keccak256(toBytes(sig)).slice(2, 10)}`;
const SEL_FEE_RECIPIENT = sel('FEE_RECIPIENT()');
const SEL_ANNOUNCER = sel('ANNOUNCER()');
const SEL_FEE_BPS = sel('FEE_BPS()');
const WORD = /^0x[0-9a-fA-F]{64}$/;
const CODE = /^0x(?:[0-9a-fA-F]{2})*$/;

async function ethCall(read: RpcClient['request'], to: Address, data: Hex): Promise<string> {
  const r = await read('eth_call', [{ to, data }, 'latest']);
  if (typeof r !== 'string' || !WORD.test(r)) return fail('RPC_FAILURE', 'malformed eth_call result');
  return r.toLowerCase();
}

function wordToAddress(w: string): string | undefined {
  return /^0x0{24}[0-9a-f]{40}$/.test(w) ? `0x${w.slice(26)}` : undefined;
}

/** Runtime code hash of `address`, or `undefined` when no code is deployed. */
async function codeHash(read: RpcClient['request'], address: Address): Promise<Hex | undefined> {
  const r = await read('eth_getCode', [address, 'latest']);
  if (typeof r !== 'string' || !CODE.test(r)) return fail('RPC_FAILURE', 'malformed eth_getCode result');
  if (r === '0x') return undefined;
  return keccak256(r as Hex);
}

/**
 * Cross-checks a validated manifest against the chain (G-05). Fail closed.
 *
 * @remarks Reads `FEE_RECIPIENT()`, `ANNOUNCER()` and `FEE_BPS()` from the router and compares them with the
 * manifest; compares the `keccak256` of the runtime code of router and sweep relayer (and policy contracts
 * when present) with `bytecodeHashes`; requires code at the announcer and the existing canonical announcer
 * address for known chains. An explicitly supplied secondary must agree on every read. Field/hash mismatches
 * are collected so the error names every failing check. RPC failures propagate (never treated as a pass).
 *
 * @param manifest Validated manifest.
 * @param client Verified RPC client for the manifest's chain.
 * @param opts Optional second provider and required-provider guard; no provider is selected implicitly.
 * @throws {ChainAdapterError} `CHAIN_MISMATCH`, `RPC_FAILURE`, or `INVALID_MANIFEST` listing the mismatches.
 */
export async function verifyManifestOnChain(manifest: DeploymentManifest, client: RpcClient, opts: VerifyDeploymentOptions = {}): Promise<void> {
  if (client.chainId !== manifest.chainId) return fail('CHAIN_MISMATCH', 'client chain differs from manifest chain');
  const secondary = opts.secondary;
  if (secondary !== undefined && secondary.chainId !== manifest.chainId) return fail('CHAIN_MISMATCH', 'second provider is on a different chain');
  if (opts.requireSecondary === true && secondary === undefined) return fail('INVALID_MANIFEST', 'a second independent provider is required but not configured');
  const announcer = canonicalAnnouncer(manifest.chainId);
  if (announcer !== undefined && manifest.announcer.toLowerCase() !== announcer.toLowerCase()) {
    return fail('INVALID_MANIFEST', 'manifest announcer is not the canonical announcer');
  }
  const read: RpcClient['request'] = (method, params) =>
    secondary === undefined ? client.request(method, params) : requestWithFallbackCheck(client, secondary, method, params);
  const bad: string[] = [];
  const [fr, an, bps] = [
    await ethCall(read, manifest.router, SEL_FEE_RECIPIENT),
    await ethCall(read, manifest.router, SEL_ANNOUNCER),
    await ethCall(read, manifest.router, SEL_FEE_BPS),
  ];
  if (wordToAddress(fr) !== manifest.feeRecipient.toLowerCase()) bad.push('FEE_RECIPIENT');
  if (wordToAddress(an) !== manifest.announcer.toLowerCase()) bad.push('ANNOUNCER');
  if (BigInt(bps) !== BigInt(manifest.feeBps)) bad.push('FEE_BPS');

  const checks: [string, Address, Hex][] = [
    ['router codehash', manifest.router, manifest.bytecodeHashes.router],
    ['sweepRelayer codehash', manifest.sweepRelayer, manifest.bytecodeHashes.sweepRelayer],
  ];
  if (manifest.policy !== undefined) {
    checks.push(['policy implementation codehash', manifest.policy.implementation, manifest.policy.bytecodeHashes.implementation]);
    checks.push(['policy factory codehash', manifest.policy.factory, manifest.policy.bytecodeHashes.factory]);
  }
  for (const [name, addr, expected] of checks) {
    const h = await codeHash(read, addr);
    if (h === undefined || h.toLowerCase() !== expected.toLowerCase()) bad.push(name);
  }
  if ((await codeHash(read, manifest.announcer)) === undefined) bad.push('announcer has no code');
  if (bad.length > 0) return fail('INVALID_MANIFEST', `on-chain mismatch: ${bad.join(', ')}`);
}
