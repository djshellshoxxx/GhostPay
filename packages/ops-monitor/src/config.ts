import { getAddress, isAddress } from 'viem';
import type { Address } from '@ghostpay/chain-adapters';
import { requireConfig } from './errors.js';

/** Environment view. */
export type Env = Readonly<Record<string, string | undefined>>;

/** One monitored chain. */
export interface OpsChainConfig {
  readonly chainId: number;
  /** Env var names holding RPC URLs (at least two for the W6 cross-check). URLs never appear in the file. */
  readonly rpcUrlEnvs: readonly string[];
  /** Path of the release `deployments/<chainId>.json`. */
  readonly manifestFile: string;
  /** Allowlisted tokens to health-check (W2). */
  readonly tokens: readonly Address[];
}

/** Optional relayer hot-key accounting for W4. */
export interface OpsRelayerConfig {
  readonly chainId: number;
  readonly address: Address;
  readonly balanceFloorWei: bigint;
  readonly maxNonceGap: number;
  readonly dailyUnreimbursedCapWei: bigint;
}

/** Resolved runner configuration. */
export interface OpsConfig {
  readonly chains: readonly OpsChainConfig[];
  readonly release?: {
    readonly mirrors: readonly string[];
    readonly sha256sumsFile: string;
    readonly files: readonly string[];
    /** Per-chain manifest copies are taken from `manifestFile`. */
  };
  readonly relayer?: OpsRelayerConfig;
  readonly announcements?: { readonly baselinePerBlock: number; readonly windowBlocks?: number };
  readonly output: {
    /** Atomically written Prometheus text file (node_exporter textfile collector). */
    readonly prometheusFile?: string;
    /** Env var holding an https webhook URL. */
    readonly webhookUrlEnv?: string;
    readonly dedupeMinutes: number;
    /** JSON file remembering which alerts were already sent (needed because each timer run is a new process). */
    readonly stateFile?: string;
  };
}

const ENV_NAME = /^[A-Z_][A-Z0-9_]{0,63}$/;
const DEC = /^(?:0|[1-9][0-9]{0,30})$/;

type Obj = Record<string, unknown>;

function obj(v: unknown, path: string): Obj {
  requireConfig(typeof v === 'object' && v !== null && !Array.isArray(v), `${path}: object expected`);
  return v as Obj;
}

function only(o: Obj, allowed: readonly string[], path: string): void {
  for (const k of Object.keys(o)) requireConfig(allowed.includes(k), `${path}: unknown key`);
}

function str(v: unknown, path: string, max = 512): string {
  requireConfig(typeof v === 'string' && v !== '' && v.length <= max, `${path}: non-empty string expected`);
  return v as string;
}

function int(v: unknown, path: string, min: number, max: number): number {
  requireConfig(typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max, `${path}: integer ${String(min)}..${String(max)} expected`);
  return v as number;
}

function wei(v: unknown, path: string): bigint {
  requireConfig(typeof v === 'string' && DEC.test(v), `${path}: decimal string expected`);
  return BigInt(v as string);
}

function addr(v: unknown, path: string): Address {
  requireConfig(typeof v === 'string' && isAddress(v, { strict: false }), `${path}: address expected`);
  return getAddress(v as string);
}

function arr(v: unknown, path: string, min: number, max: number): unknown[] {
  requireConfig(Array.isArray(v) && v.length >= min && v.length <= max, `${path}: array of ${String(min)}..${String(max)} expected`);
  return v as unknown[];
}

function envName(v: unknown, path: string): string {
  const s = str(v, path, 64);
  requireConfig(ENV_NAME.test(s), `${path}: must be an env var name`);
  return s;
}

/**
 * Validates the runner configuration strictly (unknown keys rejected, everything bounded).
 *
 * @param raw Parsed JSON.
 * @returns Resolved configuration.
 * @throws {MonitorError} `INVALID_CONFIG`; messages name config paths only, never values.
 */
export function parseOpsConfig(raw: unknown): OpsConfig {
  const o = obj(raw, '$');
  only(o, ['chains', 'release', 'relayer', 'announcements', 'output'], '$');
  const chains = arr(o['chains'], 'chains', 1, 16).map((c, i): OpsChainConfig => {
    const p = `chains[${String(i)}]`;
    const x = obj(c, p);
    only(x, ['chainId', 'rpcUrlEnvs', 'manifestFile', 'tokens'], p);
    return {
      chainId: int(x['chainId'], `${p}.chainId`, 1, Number.MAX_SAFE_INTEGER),
      rpcUrlEnvs: arr(x['rpcUrlEnvs'], `${p}.rpcUrlEnvs`, 1, 8).map((e, j) => envName(e, `${p}.rpcUrlEnvs[${String(j)}]`)),
      manifestFile: str(x['manifestFile'], `${p}.manifestFile`),
      tokens: x['tokens'] === undefined ? [] : arr(x['tokens'], `${p}.tokens`, 0, 64).map((t, j) => addr(t, `${p}.tokens[${String(j)}]`)),
    };
  });
  requireConfig(new Set(chains.map((c) => c.chainId)).size === chains.length, 'chains: duplicate chainId');

  let release: OpsConfig['release'];
  if (o['release'] !== undefined) {
    const r = obj(o['release'], 'release');
    only(r, ['mirrors', 'sha256sumsFile', 'files'], 'release');
    const mirrors = arr(r['mirrors'], 'release.mirrors', 1, 16).map((m, i) => {
      const s = str(m, `release.mirrors[${String(i)}]`, 256);
      let u: URL;
      try {
        u = new URL(s);
      } catch {
        return requireConfig(false, `release.mirrors[${String(i)}]: invalid URL`) as never;
      }
      requireConfig(u.protocol === 'https:' && u.username === '' && u.password === '', `release.mirrors[${String(i)}]: https URL without credentials expected`);
      return s;
    });
    release = {
      mirrors,
      sha256sumsFile: str(r['sha256sumsFile'], 'release.sha256sumsFile'),
      files: arr(r['files'], 'release.files', 1, 64).map((f, i) => {
        const s = str(f, `release.files[${String(i)}]`, 256);
        requireConfig(!s.includes('..') && !s.includes('?') && !s.includes('#'), `release.files[${String(i)}]: plain relative path expected`);
        return s;
      }),
    };
  }

  let relayer: OpsRelayerConfig | undefined;
  if (o['relayer'] !== undefined) {
    const r = obj(o['relayer'], 'relayer');
    only(r, ['chainId', 'address', 'balanceFloorWei', 'maxNonceGap', 'dailyUnreimbursedCapWei'], 'relayer');
    const chainId = int(r['chainId'], 'relayer.chainId', 1, Number.MAX_SAFE_INTEGER);
    requireConfig(chains.some((c) => c.chainId === chainId), 'relayer.chainId: not a monitored chain');
    relayer = {
      chainId,
      address: addr(r['address'], 'relayer.address'),
      balanceFloorWei: wei(r['balanceFloorWei'], 'relayer.balanceFloorWei'),
      maxNonceGap: int(r['maxNonceGap'], 'relayer.maxNonceGap', 0, 1000),
      dailyUnreimbursedCapWei: wei(r['dailyUnreimbursedCapWei'], 'relayer.dailyUnreimbursedCapWei'),
    };
    requireConfig(relayer.dailyUnreimbursedCapWei > 0n, 'relayer.dailyUnreimbursedCapWei: must be > 0');
  }

  let announcements: OpsConfig['announcements'];
  if (o['announcements'] !== undefined) {
    const a = obj(o['announcements'], 'announcements');
    only(a, ['baselinePerBlock', 'windowBlocks'], 'announcements');
    const b = a['baselinePerBlock'];
    requireConfig(typeof b === 'number' && Number.isFinite(b) && b > 0, 'announcements.baselinePerBlock: number > 0 expected');
    announcements = {
      baselinePerBlock: b as number,
      ...(a['windowBlocks'] === undefined ? {} : { windowBlocks: int(a['windowBlocks'], 'announcements.windowBlocks', 1, 5000) }),
    };
  }

  const out = obj(o['output'] ?? {}, 'output');
  only(out, ['prometheusFile', 'webhookUrlEnv', 'dedupeMinutes', 'stateFile'], 'output');
  const output: OpsConfig['output'] = {
    dedupeMinutes: out['dedupeMinutes'] === undefined ? 60 : int(out['dedupeMinutes'], 'output.dedupeMinutes', 0, 10_080),
    ...(out['prometheusFile'] === undefined ? {} : { prometheusFile: str(out['prometheusFile'], 'output.prometheusFile') }),
    ...(out['webhookUrlEnv'] === undefined ? {} : { webhookUrlEnv: envName(out['webhookUrlEnv'], 'output.webhookUrlEnv') }),
    ...(out['stateFile'] === undefined ? {} : { stateFile: str(out['stateFile'], 'output.stateFile') }),
  };
  requireConfig(output.webhookUrlEnv === undefined || output.stateFile !== undefined, 'output.stateFile: required with a webhook (alerts are de-duplicated across runs)');

  return { chains, ...(release === undefined ? {} : { release }), ...(relayer === undefined ? {} : { relayer }), ...(announcements === undefined ? {} : { announcements }), output };
}
