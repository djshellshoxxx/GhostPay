import { findExtraChain } from './chains.js';
import { validateManifests } from './manifest-check.js';
import { EXTRA_CHAINS } from './chains.js';
import { verifyChain, type ChainRpc, type RpcCallOptions, type VerifyReport } from './verify.js';

/** Minimal fetch signature used by the JSON-RPC client (injected in tests). */
export type FetchLike = (url: string, init: { method: 'POST'; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

/**
 * Plain-fetch JSON-RPC client implementing {@link ChainRpc}.
 *
 * @security The URL is supplied by the operator at runtime and never logged or placed in errors
 * (API keys often live in the path). Only `https:` is accepted, or `http:` on loopback.
 * @param url RPC endpoint.
 * @param fetchImpl Fetch implementation.
 * @returns A read-only RPC.
 * @throws {Error} When the URL is invalid or uses a disallowed scheme/credentials.
 */
export function createFetchRpc(url: string, fetchImpl: FetchLike): ChainRpc {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error('invalid RPC URL');
  }
  const loopback = u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]';
  if (!(u.protocol === 'https:' || (u.protocol === 'http:' && loopback))) throw new Error('RPC URL must be https (or loopback http)');
  if (u.username !== '' || u.password !== '') throw new Error('RPC URL must not embed credentials');
  let nextId = 1;
  const call = async (method: string, params: readonly unknown[], opts: RpcCallOptions | undefined): Promise<unknown> => {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
      signal: opts?.signal ?? new AbortController().signal,
    });
    if (!res.ok) throw new Error(`HTTP ${String(res.status)}`);
    const parsed: unknown = JSON.parse(await res.text());
    if (typeof parsed !== 'object' || parsed === null) throw new Error('malformed response');
    const o = parsed as { result?: unknown; error?: unknown };
    if (o.error !== undefined || o.result === undefined) throw new Error('JSON-RPC error');
    return o.result;
  };
  return {
    async getChainId(opts) {
      const r = await call('eth_chainId', [], opts);
      if (typeof r !== 'string' || !/^0x[0-9a-fA-F]{1,16}$/.test(r)) throw new Error('malformed chain id');
      return BigInt(r);
    },
    async getCode(address, opts) {
      const r = await call('eth_getCode', [address, 'latest'], opts);
      if (typeof r !== 'string') throw new Error('malformed code');
      return r;
    },
  };
}

/** Parsed CLI arguments. */
export interface CliArgs {
  readonly chainId: number;
  readonly rpcUrl: string;
  readonly expectedAnnouncerCodeHash?: string;
  readonly expectedDeployerCodeHash?: string;
  readonly timeoutMs?: number;
}

/**
 * Parses `--chain <id> [--rpc <url>] [--announcer-hash <h>] [--deployer-hash <h>] [--timeout-ms <n>]`.
 * The RPC URL falls back to `env.GHOSTPAY_RPC_URL`.
 *
 * @param argv Arguments after the script name.
 * @param env Environment.
 * @returns Parsed args.
 * @throws {Error} On unknown/missing/malformed options.
 */
export function parseArgs(argv: readonly string[], env: Readonly<Record<string, string | undefined>>): CliArgs {
  const vals = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === undefined || !['--chain', '--rpc', '--announcer-hash', '--deployer-hash', '--timeout-ms'].includes(k)) throw new Error('unknown option');
    if (v === undefined) throw new Error('missing option value');
    vals.set(k, v);
  }
  const chain = vals.get('--chain');
  if (chain === undefined || !/^[1-9][0-9]{0,15}$/.test(chain)) throw new Error('--chain <positive integer> required');
  const rpcUrl = vals.get('--rpc') ?? env['GHOSTPAY_RPC_URL'];
  if (rpcUrl === undefined || rpcUrl === '') throw new Error('RPC URL required via --rpc or GHOSTPAY_RPC_URL');
  const t = vals.get('--timeout-ms');
  if (t !== undefined && !/^[1-9][0-9]{0,6}$/.test(t)) throw new Error('--timeout-ms must be a positive integer');
  const a = vals.get('--announcer-hash');
  const d = vals.get('--deployer-hash');
  return {
    chainId: Number(chain),
    rpcUrl,
    ...(a === undefined ? {} : { expectedAnnouncerCodeHash: a }),
    ...(d === undefined ? {} : { expectedDeployerCodeHash: d }),
    ...(t === undefined ? {} : { timeoutMs: Number(t) }),
  };
}

/** Result of {@link runCli}. */
export interface CliOutcome {
  /** Process exit code: 0 only when the report is `ok`. */
  readonly exitCode: number;
  /** JSON text for stdout (report, or `{error}`), no URLs. */
  readonly output: string;
}

/**
 * Runs the CLI logic: validates manifests offline, then verifies the chosen chain.
 *
 * @security Fail-closed exit code: anything but `ok` is non-zero. Output never contains the RPC URL.
 * @param argv Arguments.
 * @param env Environment.
 * @param fetchImpl Fetch implementation.
 * @param signal Optional abort signal.
 * @returns Exit code and JSON output.
 */
export async function runCli(argv: readonly string[], env: Readonly<Record<string, string | undefined>>, fetchImpl: FetchLike, signal?: AbortSignal): Promise<CliOutcome> {
  const fail = (m: string, code = 2): CliOutcome => ({ exitCode: code, output: JSON.stringify({ error: m }) });
  let args: CliArgs;
  try {
    args = parseArgs(argv, env);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'bad arguments');
  }
  const manifest = findExtraChain(args.chainId);
  if (manifest === undefined) return fail('chain not in manifest');
  const issues = validateManifests(EXTRA_CHAINS);
  if (issues.length > 0) return fail('manifest invariants violated', 3);
  let report: VerifyReport;
  try {
    const rpc = createFetchRpc(args.rpcUrl, fetchImpl);
    report = await verifyChain(manifest, rpc, {
      ...(args.timeoutMs === undefined ? {} : { timeoutMs: args.timeoutMs }),
      ...(signal === undefined ? {} : { signal }),
      ...(args.expectedAnnouncerCodeHash === undefined ? {} : { expectedAnnouncerCodeHash: args.expectedAnnouncerCodeHash }),
      ...(args.expectedDeployerCodeHash === undefined ? {} : { expectedDeployerCodeHash: args.expectedDeployerCodeHash }),
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'verification failed');
  }
  return { exitCode: report.result === 'ok' ? 0 : 1, output: JSON.stringify(report, null, 2) };
}
