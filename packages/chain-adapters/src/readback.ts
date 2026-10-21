import { keccak256, toBytes } from 'viem/utils';
import type { DeploymentManifest } from './deployments.js';
import { fail } from './errors.js';
import { requestWithFallbackCheck, type RpcClient } from './rpc.js';
import type { Hex } from './types.js';

const HEX_CODE = /^0x(?:[0-9a-fA-F]{2})*$/;
const WORD = /^0x[0-9a-fA-F]{64}$/;
const sel = (sig: string): Hex => `0x${keccak256(toBytes(sig)).slice(2, 10)}`;

/** Options for {@link verifyDeploymentOnChain}. */
export interface ReadBackOptions {
  /**
   * Independent second endpoint (different operator). When set, every read must return identical results
   * from both clients (`requestWithFallbackCheck`). The caller is responsible for the endpoints really being independent.
   */
  readonly secondary?: RpcClient;
}

/**
 * Reads the deployment back from the chain and compares it with a (still unauthenticated) manifest.
 *
 * @remarks Checks, all fail-closed: `keccak256(eth_getCode)` of router and sweep relayer (and the policy
 * implementation and factory, when present) equals `bytecodeHashes` (runtime code, `deployments/README.md`);
 * `eth_getCode(announcer)` is non-empty; router `FEE_RECIPIENT()`, `FEE_BPS()` and `ANNOUNCER()` equal the
 * manifest. This binds the manifest to what is actually deployed; it does NOT authenticate the manifest itself
 * (a tampered manifest naming an attacker contract with its own correct hash still passes: that needs a trust
 * root, see DEVIATIONS). Not called automatically.
 *
 * @param client Client for the manifest's chain.
 * @param m Validated manifest.
 * @param opts Optional second endpoint.
 * @throws {ChainAdapterError} `CHAIN_MISMATCH` (client on another chain), `INVALID_MANIFEST` (any difference), `RPC_FAILURE`.
 */
export async function verifyDeploymentOnChain(client: RpcClient, m: DeploymentManifest, opts: ReadBackOptions = {}): Promise<void> {
  if (client.chainId !== m.chainId) return fail('CHAIN_MISMATCH', 'client chain differs from manifest chain');
  const second = opts.secondary;
  if (second !== undefined && second.chainId !== m.chainId) return fail('CHAIN_MISMATCH', 'secondary client chain differs from manifest chain');
  const read = (method: string, params: readonly unknown[]): Promise<unknown> =>
    second === undefined ? client.request(method, params) : requestWithFallbackCheck(client, second, method, params);

  const code = async (address: string): Promise<string> => {
    const c = await read('eth_getCode', [address, 'latest']);
    if (typeof c !== 'string' || !HEX_CODE.test(c)) return fail('RPC_FAILURE', 'malformed eth_getCode result');
    return c;
  };
  const word = async (to: string, sig: string): Promise<string> => {
    const r = await read('eth_call', [{ to, data: sel(sig) }, 'latest']);
    if (typeof r !== 'string' || !WORD.test(r)) return fail('RPC_FAILURE', 'malformed eth_call result');
    return r.toLowerCase();
  };
  const checkHash = async (label: string, address: string, expected: Hex): Promise<void> => {
    const c = await code(address);
    if (c === '0x') return fail('INVALID_MANIFEST', `${label}: no code at address`);
    if (keccak256(c as Hex).toLowerCase() !== expected.toLowerCase()) return fail('INVALID_MANIFEST', `${label}: code hash differs from manifest`);
  };
  const addrWord = (a: string): string => `0x${'0'.repeat(24)}${a.slice(2).toLowerCase()}`;

  await checkHash('router', m.router, m.bytecodeHashes.router);
  await checkHash('sweepRelayer', m.sweepRelayer, m.bytecodeHashes.sweepRelayer);
  if ((await code(m.announcer)) === '0x') return fail('INVALID_MANIFEST', 'announcer: no code at address');
  if ((await word(m.router, 'FEE_RECIPIENT()')) !== addrWord(m.feeRecipient)) return fail('INVALID_MANIFEST', 'router FEE_RECIPIENT differs from manifest');
  if ((await word(m.router, 'ANNOUNCER()')) !== addrWord(m.announcer)) return fail('INVALID_MANIFEST', 'router ANNOUNCER differs from manifest');
  if (BigInt(await word(m.router, 'FEE_BPS()')) !== BigInt(m.feeBps)) return fail('INVALID_MANIFEST', 'router FEE_BPS differs from manifest');
  if (m.policy !== undefined) {
    await checkHash('policyImplementation', m.policy.implementation, m.policy.bytecodeHashes.implementation);
    await checkHash('policyFactory', m.policy.factory, m.policy.bytecodeHashes.factory);
  }
}
