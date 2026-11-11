import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createPublicClient, http, TransactionReceiptNotFoundError, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { loadConfigFile, parseReleaseKeys, type ChainRuntimeConfig, type RelayerConfig } from './config.js';
import { HOT_KEY_SOURCE, QUOTE_SECRET_PREVIOUS_SOURCE, QUOTE_SECRET_SOURCE, loadOptionalSecret, loadSecret, type Env } from './secrets.js';
import { FileStateBackend, decodeState, type ChainState, type SendRecord, type StateBackend } from './stateStore.js';

/**
 * Operator CLI: `node dist/ops.js <check-config|state|health|reconcile-report>`.
 *
 * Every command is read-only. None of them takes `<stateFile>.lock`, writes or removes the state file, sends a
 * transaction, or prints a secret, an RPC URL or provider error text. Exit codes: 0 ok, 1 failure, 2 usage.
 */

/** Read-only chain access used by `reconcile-report`. */
export interface ReadOnlyChain {
  /** @returns The receipt status for `hash`, or `null` when the node has no receipt. @throws on RPC trouble. */
  getReceipt(hash: Hex): Promise<{ readonly status: 'success' | 'reverted' } | null>;
  /** @returns The node's pending transaction count of `address`. @throws on RPC trouble. */
  getPendingNonce(address: Address): Promise<number>;
}

/** Injected side effects. */
export interface OpsDeps {
  readonly env: Env;
  readonly out: (line: string) => void;
  readonly err: (line: string) => void;
  readonly now: () => number;
  readonly fetch: typeof fetch;
  /** Builds a read-only chain client for a configured chain. */
  readonly chain: (c: ChainRuntimeConfig) => ReadOnlyChain;
  /** Opens the state file read-only (only `read` is ever called). */
  readonly stateBackend: (path: string) => StateBackend;
}

const USAGE = [
  'usage: node dist/ops.js <command>',
  '  check-config                       validate config and secrets (no RPC calls)',
  '  state [--file <path>] [--json]     show budget and unsettled transactions (read-only)',
  '  health [--url <http://host:port>]  GET /healthz; exit 0 only for HTTP 200 and status ok',
  '  reconcile-report [--json]          what the relayer will do with each unsettled transaction on next start',
].join('\n');

const DEFAULT_HEALTH_URL = 'http://127.0.0.1:8787';
const HEALTH_TIMEOUT_MS = 3000;
const RPC_TIMEOUT_MS = 8000;
const DAY_MS = 86_400_000;
/** Address used only to parse the config when no hot key is available (state display); never printed. */
const PLACEHOLDER_HOT_KEY: Address = '0x000000000000000000000000000000000000dEaD';

/** A usage error (exit 2). */
class UsageError extends Error {}

/** A command failure whose message is safe to print (exit 1). */
class Failure extends Error {}

/** The relayer config as far as the ops CLI reads it (`stateFile` is added by the state-journal change). */
type OpsConfig = RelayerConfig & { readonly stateFile?: string };

function safeMessage(e: unknown): string {
  // Same filtering as main.ts: only fixed classes with messages that name variables or paths, never arbitrary text.
  if (e instanceof Error && (e.name === 'ConfigError' || e.name === 'ChainAdapterError' || e.name === 'StateError')) return e.message;
  return 'failed';
}

interface Parsed {
  readonly flags: ReadonlyMap<string, string | true>;
}

function parseFlags(args: readonly string[], valued: readonly string[], boolean: readonly string[]): Parsed {
  const flags = new Map<string, string | true>();
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i] as string;
    if (boolean.includes(a)) {
      flags.set(a, true);
    } else if (valued.includes(a)) {
      const v = args[i + 1];
      if (v === undefined || v.startsWith('--')) throw new UsageError(`${a} needs a value`);
      flags.set(a, v);
      i += 1;
    } else {
      throw new UsageError(`unknown argument`);
    }
  }
  return { flags };
}

function hotKeyAddress(env: Env): Address {
  const key = loadSecret(env, HOT_KEY_SOURCE);
  return privateKeyToAccount(`0x${Buffer.from(key).toString('hex')}`).address;
}

function loadOpsConfig(env: Env, address: Address): OpsConfig {
  const releaseKeys = parseReleaseKeys(env['GHOSTPAY_RELEASE_PUBKEYS']);
  return loadConfigFile(env['RELAYER_CONFIG'] ?? './relayer.config.json', env['DEPLOYMENTS_DIR'] ?? '../../deployments', {
    env,
    hotKeyAddress: address,
    releaseKeys,
  });
}

/** Loads the config with the real hot-key address when the key loads, else a placeholder. */
function tryConfig(env: Env): { config: OpsConfig; address: Address | undefined } | undefined {
  let address: Address | undefined;
  try {
    address = hotKeyAddress(env);
  } catch {
    address = undefined;
  }
  try {
    return { config: loadOpsConfig(env, address ?? PLACEHOLDER_HOT_KEY), address };
  } catch {
    return undefined;
  }
}

/** `check-config`: validates the config file and that every secret loads. */
export function checkConfig(d: OpsDeps): number {
  try {
    const address = hotKeyAddress(d.env);
    loadSecret(d.env, QUOTE_SECRET_SOURCE);
    const previous = loadOptionalSecret(d.env, QUOTE_SECRET_PREVIOUS_SOURCE) !== undefined;
    const config = loadOpsConfig(d.env, address);
    const tokens = config.chains.reduce((n, c) => n + c.tokens.length, 0);
    d.out('config ok');
    d.out(`chains: ${config.chains.map((c) => String(c.chainId)).join(', ')}`);
    d.out(`tokens: ${String(tokens)}`);
    d.out(`hot key address: ${address}`);
    d.out(`quote secret: loaded${previous ? ' (+ previous, rotation window)' : ''}`);
    d.out(`state: ${config.stateFile === undefined ? 'ephemeral (restart forgets budget and unsettled sends)' : `file ${config.stateFile}`}`);
    d.out(`listen: ${config.host}:${String(config.port)}`);
    return 0;
  } catch (e) {
    d.err(`fatal: ${safeMessage(e)}`);
    return 1;
  }
}

interface SendView {
  readonly status: string;
  readonly nonce: number;
  readonly txHash: string | null;
  readonly reservedWei: string;
  readonly reservedDay: string;
  readonly ageSeconds: number;
}

interface ChainView {
  readonly chainId: number;
  readonly budgetDay: string;
  readonly spentWei: string;
  readonly limitWei: string | null;
  readonly remainingWei: string | null;
  readonly sends: readonly SendView[];
}

function isoDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

function age(seconds: number): string {
  if (seconds < 60) return `${String(seconds)}s`;
  if (seconds < 3600) return `${String(Math.floor(seconds / 60))}m`;
  if (seconds < 86_400) return `${String(Math.floor(seconds / 3600))}h${String(Math.floor((seconds % 3600) / 60))}m`;
  return `${String(Math.floor(seconds / 86_400))}d`;
}

function sendView(s: SendRecord, now: number): SendView {
  return {
    status: s.status,
    nonce: s.nonce,
    txHash: s.txHash ?? null,
    reservedWei: s.reservedWei.toString(),
    reservedDay: isoDay(s.reservedDay),
    ageSeconds: Math.max(0, Math.floor((now - s.createdAtMs) / 1000)),
  };
}

function chainView(chainId: number, c: ChainState, limit: bigint | undefined, now: number): ChainView {
  // Mirrors DailyBudget: an earlier UTC day no longer counts; a day at or after today (a clock behind the last run)
  // keeps its spending, so it is flagged.
  const today = Math.floor(now / DAY_MS);
  const effectiveSpent = c.budget.day >= today ? c.budget.spentWei : 0n;
  return {
    chainId,
    budgetDay: `${isoDay(c.budget.day)}${c.budget.day > today ? ' (AHEAD of this clock: check NTP; spending still counts today)' : ''}`,
    spentWei: c.budget.spentWei.toString(),
    limitWei: limit === undefined ? null : limit.toString(),
    remainingWei: limit === undefined ? null : (limit > effectiveSpent ? limit - effectiveSpent : 0n).toString(),
    sends: c.sends.map((s) => sendView(s, now)),
  };
}

function readState(d: OpsDeps, file: string): Map<number, ChainState> {
  const text = d.stateBackend(file).read();
  return text === null ? new Map<number, ChainState>() : decodeState(text);
}

/** `state`: prints the budget and unsettled transactions per chain. Never takes the lock or writes. */
export function showState(d: OpsDeps, args: readonly string[]): number {
  try {
    const { flags } = parseFlags(args, ['--file'], ['--json']);
    const loaded = tryConfig(d.env);
    const fromFlag = flags.get('--file');
    const file = (typeof fromFlag === 'string' ? fromFlag : undefined) ?? loaded?.config.stateFile ?? d.env['RELAYER_STATE_FILE'];
    if (file === undefined || file === '') {
      throw new Failure('no state file: pass --file, set RELAYER_STATE_FILE, or configure state.file (state is ephemeral otherwise)');
    }
    const state = readState(d, file);
    const limits = new Map((loaded?.config.chains ?? []).map((c) => [c.chainId, c.dailyBudgetWei]));
    const ids = [...new Set([...state.keys(), ...limits.keys()])].sort((a, b) => a - b);
    const now = d.now();
    // A chain with nothing stored has spent nothing today (not "day 0", which would print as 1970-01-01).
    const empty: ChainState = { budget: { day: Math.floor(now / DAY_MS), spentWei: 0n }, sends: [] };
    const views = ids.map((id) => chainView(id, state.get(id) ?? empty, limits.get(id), now));
    if (flags.has('--json')) {
      d.out(JSON.stringify({ file, chains: views }));
      return 0;
    }
    d.out(`state file: ${file}`);
    if (loaded === undefined) d.out('config not loadable here: limits and remaining are not shown');
    if (views.length === 0) d.out('no chains stored');
    for (const v of views) {
      d.out(`chain ${String(v.chainId)}: budget day ${v.budgetDay}, spent ${v.spentWei} wei${v.limitWei === null ? '' : `, limit ${v.limitWei} wei, remaining today ${v.remainingWei ?? ''} wei`}`);
      if (v.sends.length === 0) d.out('  no unsettled transactions');
      for (const s of v.sends) {
        d.out(`  ${s.status} nonce=${String(s.nonce)} tx=${s.txHash ?? '-'} reserved=${s.reservedWei} wei day=${s.reservedDay} age=${age(s.ageSeconds)}`);
      }
    }
    return 0;
  } catch (e) {
    return fail(d, e);
  }
}

function fail(d: OpsDeps, e: unknown): number {
  if (e instanceof UsageError) {
    d.err(`error: ${e.message}`);
    d.err(USAGE);
    return 2;
  }
  d.err(`fatal: ${e instanceof Failure ? e.message : safeMessage(e)}`);
  return 1;
}

/** `health`: GET /healthz with a short timeout; exit 0 only for HTTP 200 and `status: ok`. */
export async function health(d: OpsDeps, args: readonly string[]): Promise<number> {
  let target: URL;
  try {
    const { flags } = parseFlags(args, ['--url'], []);
    const raw = flags.get('--url');
    target = new URL('/healthz', (typeof raw === 'string' ? raw : undefined) ?? d.env['RELAYER_HEALTH_URL'] ?? DEFAULT_HEALTH_URL);
    if (target.protocol !== 'http:' && target.protocol !== 'https:') throw new UsageError('--url must be http or https');
  } catch (e) {
    return fail(d, e instanceof UsageError ? e : new UsageError('invalid --url'));
  }
  try {
    const res = await d.fetch(target, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS), redirect: 'error' });
    let status = 'unknown';
    try {
      const body = (await res.json()) as { status?: unknown };
      if (typeof body.status === 'string' && /^[a-z_]{1,32}$/.test(body.status)) status = body.status;
    } catch {
      // body is not JSON: the HTTP status alone decides
    }
    d.out(`http ${String(res.status)} status ${status}`);
    return res.status === 200 && status === 'ok' ? 0 : 1;
  } catch {
    d.err('fatal: health check failed (no response)');
    return 1;
  }
}

type Outcome = 'settled' | 'pending' | 'unknown' | 'not_broadcast';

interface ReportItem {
  readonly chainId: number;
  readonly nonce: number;
  readonly txHash: string | null;
  readonly outcome: Outcome;
  readonly detail: string;
}

async function judge(chain: ReadOnlyChain, s: SendRecord, hot: Address | undefined): Promise<{ outcome: Outcome; detail: string }> {
  // Mirrors RelayerService.restore(): only a 'reserved' record is provably unbroadcast.
  if (s.status === 'reserved') {
    return { outcome: 'not_broadcast', detail: 'reserved, never signed: nothing was broadcast; the reservation is released' };
  }
  if (s.txHash !== undefined) {
    try {
      const r = await chain.getReceipt(s.txHash);
      if (r !== null) {
        return { outcome: 'settled', detail: `mined (${r.status}); the record is settled and removed, unused budget returned` };
      }
    } catch {
      return { outcome: 'unknown', detail: 'RPC unavailable: receipt lookup failed; the relayer retries after start' };
    }
  }
  if (s.status === 'pending') {
    return { outcome: 'pending', detail: 'accepted by the RPC, no receipt yet: the relayer keeps looking it up for up to 24 h with its reservation held' };
  }
  // 'signed': outcome unknown; the relayer blocks the lane until the node's pending nonce or the grace decides.
  if (hot === undefined) {
    return { outcome: 'unknown', detail: 'signed, outcome unknown; hot key not loadable so the pending nonce was not checked; the relayer blocks new sweeps until it reconciles' };
  }
  try {
    const pending = await chain.getPendingNonce(hot);
    if (pending > s.nonce) {
      return { outcome: 'pending', detail: 'signed and the node holds this nonce: it was broadcast (or replaced); the relayer keeps its reservation' };
    }
    return { outcome: 'unknown', detail: 'signed, no receipt and the nonce is free on the node: released only after the grace period with the nonce still free; do not delete the state' };
  } catch {
    return { outcome: 'unknown', detail: 'RPC unavailable: pending nonce lookup failed; the relayer retries after start' };
  }
}

/** `reconcile-report`: read-only preview of the relayer's start-up reconciliation. */
export async function reconcileReport(d: OpsDeps, args: readonly string[]): Promise<number> {
  try {
    const { flags } = parseFlags(args, [], ['--json']);
    const loaded = tryConfig(d.env);
    if (loaded === undefined) throw new Failure('config not loadable (run check-config)');
    const file = loaded.config.stateFile ?? d.env['RELAYER_STATE_FILE'];
    if (file === undefined || file === '') throw new Failure('no state file configured: state is ephemeral, nothing to report');
    const state = readState(d, file);
    const items: ReportItem[] = [];
    for (const cfg of loaded.config.chains) {
      const sends = state.get(cfg.chainId)?.sends ?? [];
      if (sends.length === 0) continue;
      const chain = d.chain(cfg);
      for (const s of sends) {
        const j = await judge(chain, s, loaded.address);
        items.push({ chainId: cfg.chainId, nonce: s.nonce, txHash: s.txHash ?? null, ...j });
      }
    }
    const unconfigured = [...state.keys()].filter((id) => !loaded.config.chains.some((c) => c.chainId === id));
    if (flags.has('--json')) {
      d.out(JSON.stringify({ file, receiptsOnly: loaded.address === undefined, items, unconfiguredChains: unconfigured }));
      return 0;
    }
    d.out(`state file: ${file}`);
    if (loaded.address === undefined) d.out('hot key not loadable: receipts only, pending nonce not checked');
    if (items.length === 0) d.out('no unsettled transactions');
    for (const i of items) d.out(`chain ${String(i.chainId)} nonce=${String(i.nonce)} tx=${i.txHash ?? '-'}: ${i.outcome} - ${i.detail}`);
    for (const id of unconfigured) d.out(`chain ${String(id)}: stored in the state file but not in the config; the relayer will not track it`);
    return 0;
  } catch (e) {
    return fail(d, e);
  }
}

/** Default read-only viem client: no retries, bounded time, provider error text discarded. */
export function viemReadOnlyChain(c: ChainRuntimeConfig): ReadOnlyChain {
  const pub = createPublicClient({ transport: http(c.rpcUrl, { timeout: RPC_TIMEOUT_MS, retryCount: 0 }) });
  return {
    async getReceipt(hash) {
      try {
        const r = await pub.getTransactionReceipt({ hash });
        return { status: r.status };
      } catch (e) {
        if (e instanceof TransactionReceiptNotFoundError) return null;
        throw new Error('rpc', { cause: e });
      }
    },
    async getPendingNonce(address) {
      try {
        return await pub.getTransactionCount({ address, blockTag: 'pending' });
      } catch (e) {
        throw new Error('rpc', { cause: e });
      }
    },
  };
}

/** Production dependencies. */
export function defaultDeps(): OpsDeps {
  return {
    env: process.env,
    out: (l) => process.stdout.write(`${l}\n`),
    err: (l) => process.stderr.write(`${l}\n`),
    now: Date.now,
    fetch: globalThis.fetch,
    chain: viemReadOnlyChain,
    stateBackend: (p) => new FileStateBackend(p),
  };
}

/**
 * Dispatches one command.
 *
 * @param argv Arguments after `node dist/ops.js`.
 * @returns The process exit code (0 ok, 1 failure, 2 usage).
 */
export async function runOps(argv: readonly string[], d: OpsDeps): Promise<number> {
  const [command, ...rest] = argv;
  switch (command) {
    case 'check-config':
      return rest.length === 0 ? checkConfig(d) : fail(d, new UsageError('check-config takes no arguments'));
    case 'state':
      return showState(d, rest);
    case 'health':
      return health(d, rest);
    case 'reconcile-report':
      return reconcileReport(d, rest);
    default:
      return fail(d, new UsageError(command === undefined ? 'missing command' : 'unknown command'));
  }
}

// Entry point (only when run directly, never on import).
if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runOps(process.argv.slice(2), defaultDeps()).then(
    (code) => process.exit(code),
    () => {
      process.stderr.write('fatal: failed\n');
      process.exit(1);
    },
  );
}
