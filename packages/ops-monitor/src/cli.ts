import { readFile, rename, writeFile } from 'node:fs/promises';
import {
  createClient,
  findChain,
  loadDeployment,
  validateRpcUrl,
  type DeploymentManifest,
  type RpcClient,
} from '@ghostpay/chain-adapters';
import { parseOpsConfig, type Env, type OpsConfig } from './config.js';
import { MonitorError } from './errors.js';
import { toPrometheus, toWebhook, createDedupeState } from './output.js';
import { runOnce } from './run.js';
import { createW2Probe } from './w2.js';
import { w1Probe } from './w1.js';
import { w3Probe } from './w3.js';
import { createW4Probe } from './w4.js';
import { createW5Probe } from './w5.js';
import { createW6Probe } from './w6.js';
import type { FetchLike, Finding, MonitorContext, Probe, WebhookPayload } from './types.js';

/** Exit codes: 0 healthy, 1 at least one warn, 2 at least one page, 3 the runner itself could not run. */
export type ExitCode = 0 | 1 | 2 | 3;

/** Seams for tests; defaults use the real file system, network and clock. */
export interface CliDeps {
  readonly readText: (path: string) => Promise<string>;
  readonly writeAtomic: (path: string, text: string) => Promise<void>;
  readonly createRpc: (chainId: number, url: string) => Promise<RpcClient>;
  readonly postJson: (url: string, body: string) => Promise<boolean>;
  readonly now: () => number;
  /** Replaces the release-file fetch (default: global fetch, no redirects, 10 s). */
  readonly fetchFile?: FetchLike;
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
}

/** @internal Real file system, network and clock; exported for tests. */
export const defaultDeps: CliDeps = {
  readText: (p) => readFile(p, 'utf8'),
  writeAtomic: async (p, text) => {
    const tmp = `${p}.${String(process.pid)}.tmp`;
    await writeFile(tmp, text, { mode: 0o600 });
    await rename(tmp, p);
  },
  createRpc: async (chainId, url) => {
    const chain = findChain(chainId);
    if (chain === undefined) throw new MonitorError('INVALID_CONFIG', 'unknown chain');
    return createClient(chain, url, { timeoutMs: 10_000 });
  },
  postJson: async (url, body) => {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body, redirect: 'error', signal: AbortSignal.timeout(10_000) });
    return r.ok;
  },
  now: Date.now,
  stdout: (l) => process.stdout.write(`${l}\n`),
  stderr: (l) => process.stderr.write(`${l}\n`),
};

const USAGE = 'usage: ghostpay-ops-monitor --config <file> [--dry-run] [--print]\n  --dry-run  run the probes and print findings; write no file and send no webhook\n  --print    also print the Prometheus text to stdout';

interface Args {
  readonly config: string;
  readonly dryRun: boolean;
  readonly print: boolean;
}

/** @internal Strict argument parsing: unknown flags are an error. */
export function parseArgs(argv: readonly string[]): Args | undefined {
  let config: string | undefined;
  let dryRun = false;
  let print = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--config') {
      config = argv[++i];
      if (config === undefined || config.startsWith('--')) return undefined;
    } else if (a === '--dry-run') dryRun = true;
    else if (a === '--print') print = true;
    else return undefined;
  }
  return config === undefined ? undefined : { config, dryRun, print };
}

async function buildContext(cfg: OpsConfig, env: Env, d: CliDeps): Promise<{ ctx: MonitorContext; manifests: DeploymentManifest[]; probes: Probe[] }> {
  const rpcs: RpcClient[] = [];
  const manifests: DeploymentManifest[] = [];
  const manifestCopies: Record<number, string> = {};
  for (const c of cfg.chains) {
    const text = await d.readText(c.manifestFile);
    manifests.push(loadDeployment(text, c.chainId));
    manifestCopies[c.chainId] = text;
    for (const name of c.rpcUrlEnvs) {
      const url = env[name];
      if (url === undefined || url === '') throw new MonitorError('INVALID_CONFIG', 'rpc env var not set');
      validateRpcUrl(url);
      rpcs.push(await d.createRpc(c.chainId, url));
    }
  }
  let release: MonitorContext['release'];
  if (cfg.release !== undefined) {
    release = { mirrors: cfg.release.mirrors, sha256sums: await d.readText(cfg.release.sha256sumsFile), files: cfg.release.files, manifestCopies, ...(d.fetchFile === undefined ? {} : { fetch: d.fetchFile }) };
  }
  const ctx: MonitorContext = { rpcs, manifests, now: d.now(), ...(release === undefined ? {} : { release }) };
  const probes: Probe[] = [
    w1Probe,
    createW2Probe({ tokensByChain: Object.fromEntries(cfg.chains.map((c) => [c.chainId, c.tokens])) }),
    createW6Probe(),
  ];
  if (cfg.release !== undefined) probes.push(w3Probe);
  if (cfg.announcements !== undefined) probes.push(createW5Probe(cfg.announcements));
  if (cfg.relayer !== undefined) {
    const r = cfg.relayer;
    probes.push(
      createW4Probe(async () => {
        const rpc = rpcs.find((x) => x.chainId === r.chainId);
        if (rpc === undefined) throw new MonitorError('INVALID_CONFIG', 'no rpc for relayer chain');
        const hex = async (m: string, p: unknown[]): Promise<bigint> => {
          const v = await rpc.request(m, p);
          if (typeof v !== 'string' || !/^0x[0-9a-fA-F]{1,64}$/.test(v)) throw new MonitorError('FETCH_FAILED', 'malformed');
          return BigInt(v);
        };
        return {
          chainId: r.chainId,
          address: r.address,
          balanceWei: await hex('eth_getBalance', [r.address, 'latest']),
          balanceFloorWei: r.balanceFloorWei,
          latestNonce: Number(await hex('eth_getTransactionCount', [r.address, 'latest'])),
          pendingNonce: Number(await hex('eth_getTransactionCount', [r.address, 'pending'])),
          maxNonceGap: r.maxNonceGap,
          // Not measured by this runner: the relayer's own loss budget enforces the cap; see DEVIATIONS.
          unreimbursedGasWeiToday: 0n,
          dailyUnreimbursedCapWei: r.dailyUnreimbursedCapWei,
        };
      }),
    );
  }
  return { ctx, manifests, probes };
}

function exitFor(findings: readonly Finding[]): ExitCode {
  if (findings.some((f) => f.severity === 'page')) return 2;
  if (findings.some((f) => f.severity === 'warn')) return 1;
  return 0;
}

async function loadState(path: string | undefined, d: CliDeps): Promise<Map<string, number>> {
  const state = createDedupeState();
  if (path === undefined) return state;
  try {
    const raw: unknown = JSON.parse(await d.readText(path));
    if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
      for (const [k, v] of Object.entries(raw)) if (typeof v === 'number' && Number.isFinite(v)) state.set(k, v);
    }
  } catch {
    /* first run or unreadable state: start empty (may re-send once) */
  }
  return state;
}

/**
 * Runs the monitor once.
 *
 * @param argv Arguments after the program name.
 * @param env Environment (RPC URLs and the webhook URL are read from named variables only).
 * @param deps Test seams.
 * @returns Exit code; the process wrapper calls `process.exit` with it.
 * @security Read-only against the chain. Writes only the configured Prometheus and state files. Output lines carry
 * finding ids, severities and configured subjects, never RPC URLs or keys.
 */
export async function runCli(argv: readonly string[], env: Env, deps: Partial<CliDeps> = {}): Promise<ExitCode> {
  const d: CliDeps = { ...defaultDeps, ...deps };
  const args = parseArgs(argv);
  if (args === undefined) {
    d.stderr(USAGE);
    return 3;
  }
  let findings: Finding[];
  let cfg: OpsConfig;
  try {
    cfg = parseOpsConfig(JSON.parse(await d.readText(args.config)) as unknown);
    const { ctx, probes } = await buildContext(cfg, env, d);
    findings = await runOnce(probes, ctx);
  } catch (e) {
    d.stderr(`fatal: ${e instanceof MonitorError ? `${e.code}: ${e.message}` : 'could not run the monitor'}`);
    return 3;
  }
  for (const f of findings) d.stdout(`${f.severity} ${f.id}${f.chainId === undefined ? '' : ` chain=${String(f.chainId)}`} ${f.subject} ${f.detail}`);
  if (findings.length === 0) d.stdout('info monitor no findings');
  if (args.print) d.stdout(toPrometheus(findings));
  if (args.dryRun) return exitFor(findings);

  let code = exitFor(findings);
  try {
    if (cfg.output.prometheusFile !== undefined) await d.writeAtomic(cfg.output.prometheusFile, toPrometheus(findings));
    if (cfg.output.webhookUrlEnv !== undefined) {
      const url = env[cfg.output.webhookUrlEnv];
      let parsed: URL | undefined;
      try {
        parsed = url === undefined ? undefined : new URL(url);
      } catch {
        parsed = undefined;
      }
      if (parsed === undefined || parsed.protocol !== 'https:' || parsed.username !== '' || parsed.password !== '') {
        d.stderr('fatal: webhook env var must hold an https URL without credentials');
        return 3;
      }
      const state = await loadState(cfg.output.stateFile, d);
      const payload: WebhookPayload | null = toWebhook(findings, cfg.output.dedupeMinutes * 60_000, state, d.now());
      if (payload !== null) {
        const sent = await d.postJson(parsed.toString(), JSON.stringify(payload, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v)));
        if (sent) {
          if (cfg.output.stateFile !== undefined) await d.writeAtomic(cfg.output.stateFile, JSON.stringify(Object.fromEntries(state)));
        } else {
          d.stderr('webhook delivery failed');
          code = 3;
        }
      } else if (cfg.output.stateFile !== undefined) {
        await d.writeAtomic(cfg.output.stateFile, JSON.stringify(Object.fromEntries(state)));
      }
    }
  } catch {
    d.stderr('fatal: could not write output or deliver the webhook');
    return 3;
  }
  return code;
}
