import { decodeAbiParameters, encodeFunctionData, getAddress, keccak256 } from 'viem/utils';
import { ghostPayRouterAbi } from './abi/router.js';
import type { DeploymentManifest } from './deployments.js';
import { fail } from './errors.js';
import { requestWithFallbackCheck, type RpcClient } from './rpc.js';
import type { Address, Hex } from './types.js';

/** Names of the checks run by {@link verifyManifest}. */
export type ReadbackCheckName =
  | 'chainId'
  | 'router.FEE_RECIPIENT'
  | 'router.ANNOUNCER'
  | 'router.FEE_BPS'
  | 'router.codehash'
  | 'relayer.codehash'
  | 'announcer.code'
  | 'announcer.codehash'
  | 'policy.implementation.codehash'
  | 'policy.factory.codehash'
  | 'providers';

/** One comparison of a manifest value against the chain. */
export interface ReadbackCheck {
  readonly name: ReadbackCheckName;
  readonly expected: string;
  /** Value read from the chain, or `'error'` when the read itself failed (fail closed). */
  readonly actual: string;
  readonly pass: boolean;
}

/** Result of {@link verifyManifest}. `ok` is true only when EVERY check passed. */
export interface ReadbackResult {
  readonly ok: boolean;
  readonly checks: readonly ReadbackCheck[];
}

/** Options of {@link verifyManifest}. */
export interface ReadbackOptions {
  /**
   * Require at least two clients and make every read agree across the first two via
   * {@link requestWithFallbackCheck}. Default false (one provider is accepted but is a single point of trust).
   */
  readonly requireTwoProviders?: boolean;
  /** Pinned keccak256 of the reference announcer's runtime code (`EXPECTED_ANNOUNCER_CODEHASH`). */
  readonly expectedAnnouncerCodehash?: Hex;
}

const EIP7702_PREFIX = '0xef0100';

function lower(s: string): string {
  return s.toLowerCase();
}

/**
 * Hashes runtime code returned by `eth_getCode`.
 *
 * @remarks Empty code (no contract) and EIP-7702 delegation designators (`0xef0100...`) are refused:
 * GhostPay contracts are plain contracts, so an account whose code is a delegation is not one of them.
 *
 * @param code Raw `eth_getCode` result.
 * @returns keccak256 of the code, lowercase.
 * @throws {ChainAdapterError} `MANIFEST_READBACK_FAILED`.
 */
export function codehashOf(code: unknown): Hex {
  if (typeof code !== 'string' || !/^0x(?:[0-9a-fA-F]{2})*$/.test(code)) {
    return fail('MANIFEST_READBACK_FAILED', 'getCode result malformed');
  }
  if (code.length === 2) return fail('MANIFEST_READBACK_FAILED', 'no code at address');
  if (lower(code).startsWith(EIP7702_PREFIX)) return fail('MANIFEST_READBACK_FAILED', 'delegation designator');
  return keccak256(code as Hex);
}

type Reader = (method: string, params: readonly unknown[]) => Promise<unknown>;

function makeReader(clients: readonly RpcClient[]): Reader {
  const [a, b] = clients;
  if (a === undefined) return () => fail('MANIFEST_READBACK_FAILED', 'no RPC client');
  return b === undefined
    ? (method, params) => a.request(method, params)
    : (method, params) => requestWithFallbackCheck(a, b, method, params);
}

async function ethCallWord(read: Reader, to: Address, name: 'FEE_RECIPIENT' | 'ANNOUNCER' | 'FEE_BPS'): Promise<string> {
  const data = encodeFunctionData({ abi: ghostPayRouterAbi, functionName: name });
  const r = await read('eth_call', [{ to, data }, 'latest']);
  // Exactly one 32-byte word; anything else (empty return from a non-contract, extra data) is rejected.
  if (typeof r !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(r)) return fail('MANIFEST_READBACK_FAILED', 'eth_call result');
  if (name === 'FEE_BPS') return decodeAbiParameters([{ type: 'uint256' }], r as Hex)[0].toString();
  const [addr] = decodeAbiParameters([{ type: 'address' }], r as Hex);
  return getAddress(addr);
}

/**
 * Reads a manifest back from the chain and compares every security-relevant value. Fails closed.
 *
 * @remarks Checks (each reported individually, none short-circuits the others):
 * 1. every client reports the manifest's `chainId`;
 * 2. `router.FEE_RECIPIENT()`, `router.ANNOUNCER()` equal the manifest and `router.FEE_BPS()` equals 25;
 * 3. `keccak256(eth_getCode)` of router and sweep relayer equals `bytecodeHashes` (runtime code, i.e. the
 *    post-immutable hash the manifest stores); the same for the policy implementation/factory when present;
 * 4. the announcer has real code (not empty, not an EIP-7702 delegation) and, if pinned, the expected codehash;
 * 5. with `requireTwoProviders` (or whenever two clients are given) every read must agree across both.
 *
 * A read that throws counts as a failed check with `actual: 'error'`; this function never throws on a chain
 * mismatch. Callers MUST refuse to build or send payments unless `ok` (use {@link assertManifestVerified}).
 * Not covered: the manifest `signature`, immutable-aware comparison against a build-time hash, and caching
 * (re-run at preview time; see DEVIATIONS).
 *
 * @param m Validated manifest.
 * @param clients One or two verified clients (first is primary).
 * @param opts Options.
 * @returns Per-check results.
 */
export async function verifyManifest(
  m: DeploymentManifest,
  clients: readonly RpcClient[],
  opts: ReadbackOptions = {},
): Promise<ReadbackResult> {
  const checks: ReadbackCheck[] = [];
  const push = (name: ReadbackCheckName, expected: string, actual: string): void => {
    checks.push({ name, expected, actual, pass: lower(expected) === lower(actual) });
  };
  const attempt = async (name: ReadbackCheckName, expected: string, f: () => Promise<string>): Promise<void> => {
    let actual: string;
    try {
      actual = await f();
    } catch {
      actual = 'error';
    }
    checks.push({ name, expected, actual, pass: actual !== 'error' && lower(expected) === lower(actual) });
  };

  if (opts.requireTwoProviders === true && clients.length < 2) {
    checks.push({ name: 'providers', expected: '2', actual: String(clients.length), pass: false });
  } else {
    checks.push({ name: 'providers', expected: opts.requireTwoProviders === true ? '2' : '>=1', actual: String(clients.length), pass: clients.length >= 1 });
  }
  const used = clients.slice(0, 2);
  const wrongChain = used.find((c) => c.chainId !== m.chainId);
  push('chainId', String(m.chainId), wrongChain === undefined ? String(m.chainId) : String(wrongChain.chainId));
  if (clients.length === 0 || wrongChain !== undefined) {
    return { ok: false, checks };
  }
  const read = makeReader(used);
  const codehash = async (a: Address): Promise<string> => codehashOf(await read('eth_getCode', [a, 'latest']));

  await attempt('router.FEE_RECIPIENT', getAddress(m.feeRecipient), () => ethCallWord(read, m.router, 'FEE_RECIPIENT'));
  await attempt('router.ANNOUNCER', getAddress(m.announcer), () => ethCallWord(read, m.router, 'ANNOUNCER'));
  await attempt('router.FEE_BPS', String(m.feeBps), () => ethCallWord(read, m.router, 'FEE_BPS'));
  await attempt('router.codehash', m.bytecodeHashes.router, () => codehash(m.router));
  await attempt('relayer.codehash', m.bytecodeHashes.sweepRelayer, () => codehash(m.sweepRelayer));
  if (opts.expectedAnnouncerCodehash === undefined) {
    await attempt('announcer.code', 'present', async () => {
      await codehash(m.announcer);
      return 'present';
    });
  } else {
    await attempt('announcer.codehash', opts.expectedAnnouncerCodehash, () => codehash(m.announcer));
  }
  if (m.policy !== undefined) {
    const p = m.policy;
    await attempt('policy.implementation.codehash', p.bytecodeHashes.implementation, () => codehash(p.implementation));
    await attempt('policy.factory.codehash', p.bytecodeHashes.factory, () => codehash(p.factory));
  }
  return { ok: checks.every((c) => c.pass), checks };
}

/**
 * Throws unless a {@link ReadbackResult} is fully successful.
 *
 * @param r Result of {@link verifyManifest}.
 * @throws {ChainAdapterError} `MANIFEST_READBACK_FAILED` naming the failed checks (no chain values echoed).
 */
export function assertManifestVerified(r: ReadbackResult): void {
  if (!r.ok || r.checks.length === 0 || r.checks.some((c) => !c.pass)) {
    const failed = r.checks.filter((c) => !c.pass).map((c) => c.name);
    return fail('MANIFEST_READBACK_FAILED', failed.length === 0 ? 'no checks ran' : failed.join(','));
  }
}
