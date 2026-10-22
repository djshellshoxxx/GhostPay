import { keccak256, toBytes } from 'viem/utils';
import { fail } from './errors.js';
import type { RpcClient } from './rpc.js';
import type { DeploymentManifest } from './deployments.js';
import type { Address, Hex } from './types.js';

const sel = (sig: string): Hex => `0x${keccak256(toBytes(sig)).slice(2, 10)}`;
const SEL_FEE_RECIPIENT = sel('FEE_RECIPIENT()');
const SEL_ANNOUNCER = sel('ANNOUNCER()');
const SEL_FEE_BPS = sel('FEE_BPS()');
const WORD = /^0x[0-9a-fA-F]{64}$/;
const CODE = /^0x(?:[0-9a-fA-F]{2})*$/;

async function ethCall(client: RpcClient, to: Address, data: Hex): Promise<string> {
  const r = await client.request('eth_call', [{ to, data }, 'latest']);
  if (typeof r !== 'string' || !WORD.test(r)) return fail('RPC_FAILURE', 'malformed eth_call result');
  return r.toLowerCase();
}

function wordToAddress(w: string): string | undefined {
  return /^0x0{24}[0-9a-f]{40}$/.test(w) ? `0x${w.slice(26)}` : undefined;
}

/** Runtime code hash of `address`, or `undefined` when no code is deployed. */
async function codeHash(client: RpcClient, address: Address): Promise<Hex | undefined> {
  const r = await client.request('eth_getCode', [address, 'latest']);
  if (typeof r !== 'string' || !CODE.test(r)) return fail('RPC_FAILURE', 'malformed eth_getCode result');
  if (r === '0x') return undefined;
  return keccak256(r as Hex);
}

/**
 * Cross-checks a validated manifest against the chain (G-05). Fail closed.
 *
 * @remarks Reads `FEE_RECIPIENT()`, `ANNOUNCER()` and `FEE_BPS()` from the router and compares them with the
 * manifest; compares the `keccak256` of the runtime code of router and sweep relayer (and policy contracts
 * when present) with `bytecodeHashes`; requires code at the announcer. All mismatches are collected so the
 * error names every failing check. RPC failures propagate (never treated as a pass).
 *
 * @param manifest Validated manifest.
 * @param client Verified RPC client for the manifest's chain.
 * @throws {ChainAdapterError} `CHAIN_MISMATCH`, `RPC_FAILURE`, or `INVALID_MANIFEST` listing the mismatches.
 */
export async function verifyManifestOnChain(manifest: DeploymentManifest, client: RpcClient): Promise<void> {
  if (client.chainId !== manifest.chainId) return fail('CHAIN_MISMATCH', 'client chain differs from manifest chain');
  const bad: string[] = [];
  const [fr, an, bps] = [
    await ethCall(client, manifest.router, SEL_FEE_RECIPIENT),
    await ethCall(client, manifest.router, SEL_ANNOUNCER),
    await ethCall(client, manifest.router, SEL_FEE_BPS),
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
    const h = await codeHash(client, addr);
    if (h === undefined || h.toLowerCase() !== expected.toLowerCase()) bad.push(name);
  }
  if ((await codeHash(client, manifest.announcer)) === undefined) bad.push('announcer has no code');
  if (bad.length > 0) return fail('INVALID_MANIFEST', `on-chain mismatch: ${bad.join(', ')}`);
}
