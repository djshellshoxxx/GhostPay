import { ARACHNID_DEPLOYER, CANONICAL_ANNOUNCER } from './address.js';
import type { ExtraChainEntry } from './chains.js';
import { isHexBytes, keccakHex } from './hex.js';

/** Per-call options handed to the injected RPC. */
export interface RpcCallOptions {
  readonly signal: AbortSignal;
}

/**
 * Injected read-only RPC. Implementations should honour `signal`; the verifier also enforces the
 * deadline itself, so a misbehaving implementation cannot hang a verification.
 *
 * @security Read-only by construction: there is no send/sign method.
 */
export interface ChainRpc {
  getChainId(opts?: RpcCallOptions): Promise<number | bigint>;
  getCode(address: string, opts?: RpcCallOptions): Promise<string>;
}

/** Overall outcome. Only `ok` permits proceeding; everything else is fail-closed. */
export type VerifyResult =
  | 'ok'
  | 'unverified'
  | 'chain_mismatch'
  | 'announcer_missing'
  | 'deployer_missing'
  | 'code_mismatch'
  | 'unsupported_create2'
  | 'rpc_error'
  | 'aborted';

/** Presence/hash status of one contract. */
export interface CodeStatus {
  readonly address: string;
  readonly present: boolean | null;
  readonly runtimeCodeHash: string | null;
  readonly matchesReference: boolean | null;
}

/** Report of {@link verifyChain}. Contains no URLs or provider error text. */
export interface VerifyReport {
  readonly chainId: number;
  readonly result: VerifyResult;
  readonly observedChainId: string | null;
  readonly announcer: CodeStatus;
  readonly deployer: CodeStatus;
  readonly notes: readonly string[];
}

/** Options for {@link verifyChain}. */
export interface VerifyOptions {
  /** Per-RPC-call deadline in ms (default 10000). */
  readonly timeoutMs?: number;
  /** Caller abort signal. */
  readonly signal?: AbortSignal;
  /**
   * Expected keccak256 of the announcer RUNTIME code, taken from a trusted reference chain.
   * Without it a present announcer yields `unverified`, never `ok`.
   */
  readonly expectedAnnouncerCodeHash?: string;
  /** Expected keccak256 of the Arachnid deployer runtime code (optional). */
  readonly expectedDeployerCodeHash?: string;
}

const DEFAULT_TIMEOUT_MS = 10_000;

class Stop extends Error {
  public constructor(public readonly result: 'rpc_error' | 'aborted', public readonly note: string) {
    super(note);
  }
}

function checkHash(name: string, h: string | undefined): string | undefined {
  if (h === undefined) return undefined;
  if (!isHexBytes(h) || h.length !== 66) throw new RangeError(`${name} must be 32-byte hex`);
  return h.toLowerCase();
}

async function guarded<T>(call: (o: RpcCallOptions) => Promise<T>, ms: number, user: AbortSignal | undefined, what: string): Promise<T> {
  const byUser = (): boolean => user?.aborted === true;
  if (byUser()) throw new Stop('aborted', 'aborted by caller');
  const timeout = AbortSignal.timeout(ms);
  const signal = user === undefined ? timeout : AbortSignal.any([user, timeout]);
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = (): void => reject(byUser() ? new Stop('aborted', 'aborted by caller') : new Stop('rpc_error', `${what}: timeout`));
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    return await Promise.race([call({ signal }), aborted]);
  } catch (e) {
    if (e instanceof Stop) throw e;
    if (byUser()) throw new Stop('aborted', 'aborted by caller');
    throw new Stop('rpc_error', `${what}: request failed`);
  } finally {
    if (onAbort !== undefined) signal.removeEventListener('abort', onAbort);
  }
}

async function readCode(rpc: ChainRpc, address: string, ms: number, user: AbortSignal | undefined, what: string, expected: string | undefined): Promise<CodeStatus> {
  const code = await guarded((o) => rpc.getCode(address, o), ms, user, what);
  if (!isHexBytes(code)) throw new Stop('rpc_error', `${what}: malformed eth_getCode response`);
  if (code === '0x') return { address, present: false, runtimeCodeHash: null, matchesReference: null };
  const hash = keccakHex(code);
  return { address, present: true, runtimeCodeHash: hash, matchesReference: expected === undefined ? null : hash === expected };
}

/**
 * Online verification of one chain against its manifest, via an injected RPC.
 *
 * @security Fail-closed: any RPC error, timeout, abort, malformed response, chain id mismatch or
 * missing expected hash yields a non-`ok` result; `ok` requires the announcer's runtime code hash to
 * equal a caller-supplied reference. Chains whose CREATE2 is not the standard EVM one (zkSync Era)
 * are rejected before any RPC call. Never sends transactions. Reports never echo provider error text.
 * @param manifest Chain manifest.
 * @param rpc Injected read-only RPC.
 * @param opts Options.
 * @returns The report (never throws for network-side failures).
 * @throws {RangeError} When an expected hash option is malformed (caller bug).
 */
export async function verifyChain(manifest: ExtraChainEntry, rpc: ChainRpc, opts: VerifyOptions = {}): Promise<VerifyReport> {
  const expAnn = checkHash('expectedAnnouncerCodeHash', opts.expectedAnnouncerCodeHash);
  const expDep = checkHash('expectedDeployerCodeHash', opts.expectedDeployerCodeHash);
  const ms = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(ms) || ms <= 0) throw new RangeError('timeoutMs must be positive');
  const blank = (address: string): CodeStatus => ({ address, present: null, runtimeCodeHash: null, matchesReference: null });
  const report = (result: VerifyResult, observed: string | null, a: CodeStatus, d: CodeStatus, notes: string[]): VerifyReport => ({
    chainId: manifest.chainId, result, observedChainId: observed, announcer: a, deployer: d, notes,
  });
  let ann = blank(CANONICAL_ANNOUNCER);
  let dep = blank(ARACHNID_DEPLOYER);

  if (manifest.create2 !== 'standard' || manifest.bytecodeModel !== 'evm') {
    return report('unsupported_create2', null, ann, dep, ['standard CREATE2 / canonical announcer derivation does not apply to this chain']);
  }
  let observed: string | null = null;
  try {
    const id = await guarded((o) => rpc.getChainId(o), ms, opts.signal, 'eth_chainId');
    if (typeof id !== 'number' && typeof id !== 'bigint') throw new Stop('rpc_error', 'eth_chainId: malformed response');
    observed = id.toString();
    if (observed !== String(manifest.chainId)) {
      return report('chain_mismatch', observed, ann, dep, ['RPC reports a different chain id']);
    }
    ann = await readCode(rpc, CANONICAL_ANNOUNCER, ms, opts.signal, 'announcer eth_getCode', expAnn);
    dep = await readCode(rpc, ARACHNID_DEPLOYER, ms, opts.signal, 'deployer eth_getCode', expDep);
  } catch (e) {
    if (e instanceof Stop) return report(e.result, observed, ann, dep, [e.note]);
    throw e;
  }

  if (ann.present === false) {
    return report(dep.present === false ? 'deployer_missing' : 'announcer_missing', observed, ann, dep,
      [dep.present === false ? 'announcer and Arachnid deployer both absent: canonical deployment impossible' : 'announcer absent; deployer present, deploy via CREATE2 and re-verify']);
  }
  if (ann.matchesReference === false || dep.matchesReference === false) {
    return report('code_mismatch', observed, ann, dep, ['runtime code hash differs from reference']);
  }
  if (ann.matchesReference === null) {
    return report('unverified', observed, ann, dep, ['no reference announcer code hash supplied']);
  }
  const notes = dep.present === false ? ['Arachnid deployer absent (announcer present and matching)'] : [];
  return report('ok', observed, ann, dep, notes);
}
