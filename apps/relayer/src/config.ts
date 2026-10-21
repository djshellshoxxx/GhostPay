import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Address } from 'viem';
import { getAddress } from 'viem';
import {
  findChain,
  findToken,
  loadDeployment,
  requireEnabledChain,
  validateRpcUrl,
} from '@ghostpay/chain-adapters';
import { parseAddress, parseObject, type JsonObject } from './codec.js';
import { validateWebhookUrl } from './alerts.js';
import { TrustedProxies } from './clientip.js';
import { parseUsdMicro, type AllowedToken } from './pricing.js';
import { ConfigError, type Env } from './secrets.js';

/** Chain id of a local development node (anvil/hardhat); accepted only with `allowDevChain`. */
export const DEV_CHAIN_ID = 31337;
/** Spec ceiling for the sweep deadline window. */
export const MAX_DEADLINE_WINDOW_SECONDS = 1800;

/** Resolved per-chain settings. */
export interface ChainRuntimeConfig {
  readonly chainId: number;
  readonly name: string;
  readonly rpcUrl: string;
  readonly sweepRelayer: Address;
  readonly feeTo: Address;
  readonly tokens: readonly AllowedToken[];
  readonly nativeUsdMicro: bigint;
  readonly gasUnits: { readonly sweep: bigint; readonly sweepWithPermit: bigint };
  readonly maxGasLimit: bigint;
  readonly maxGasPriceWei: bigint;
  readonly dailyBudgetWei: bigint;
  readonly minBalanceWei: bigint;
}

/** Resolved relayer configuration. */
export interface RelayerConfig {
  readonly host: string;
  readonly port: number;
  readonly allowedOrigins: readonly string[];
  readonly allowInsecureLocalhostRpc: boolean;
  /** CIDRs of reverse proxies whose `X-Forwarded-For` is honoured. Empty (default): never trusted. */
  readonly trustProxy: readonly string[];
  readonly allowFeeToHotKey: boolean;
  readonly quoteTtlSeconds: number;
  readonly minDeadlineSeconds: number;
  readonly maxDeadlineSeconds: number;
  readonly rateLimit: {
    readonly ipPerMinute: number;
    readonly ipBurst: number;
    readonly ownerPerMinute: number;
    readonly ownerBurst: number;
    readonly maxKeys: number;
    readonly saltRotationHours: number;
    /** Global budget for `/v1/quote` across all clients (each quote costs an RPC call). */
    readonly quotePerMinute: number;
    readonly quoteBurst: number;
  };
  readonly breaker: {
    readonly windowSize: number;
    readonly minSamples: number;
    readonly failureRatio: number;
    readonly cooldownSeconds: number;
    readonly halfOpenTimeoutSeconds: number;
  };
  /** Gas-griefing controls. */
  readonly abuse: { readonly ownerMaxFailures: number; readonly destinationMaxFailures: number; readonly windowSeconds: number };
  /** Gas economics checks applied at quote and again at send time. */
  readonly gas: {
    /** Fee must be at least this percent of the gas cost (quote time and send time). */
    readonly coverPercent: number;
    /** Reject a sweep when the gas price rose more than this percent between job start and send. */
    readonly maxMovePercent: number;
    /** Quotes reuse a gas price at most this old. */
    readonly quoteCacheSeconds: number;
  };
  /** Node HTTP server limits. */
  readonly server: {
    readonly headersTimeoutMs: number;
    readonly requestTimeoutMs: number;
    readonly keepAliveTimeoutMs: number;
    readonly bodyTimeoutMs: number;
    readonly maxConnections: number;
    /** Per-peer cap (IPv6 by /64); not applied to trusted proxies. */
    readonly maxConnectionsPerIp: number;
    readonly maxHeadersCount: number;
  };
  readonly metrics: { readonly enabled: boolean; readonly bearerToken: string | undefined };
  readonly alerts: { readonly webhookUrl: string | undefined; readonly cooldownSeconds: number };
  readonly queue: { readonly maxPending: number; readonly receiptTimeoutSeconds: number };
  readonly shutdownGraceSeconds: number;
  readonly chains: readonly ChainRuntimeConfig[];
}

/** Inputs besides the JSON itself. */
export interface ConfigContext {
  readonly env: Env;
  /** Address of the hot key (`feeTo` must differ unless `allowFeeToHotKey`). */
  readonly hotKeyAddress: Address;
  /** Returns the manifest JSON text for a chain id, or `undefined` when none exists. */
  readonly readManifest: (chainId: number) => string | undefined;
}

function bad(path: string, why: string): never {
  throw new ConfigError(`config ${path}: ${why}`);
}

function numberOr(o: JsonObject, key: string, path: string, def: number, min: number, max: number, integer = true): number {
  const v = o[key];
  if (v === undefined) return def;
  if (typeof v !== 'number' || !Number.isFinite(v) || (integer && !Number.isInteger(v)) || v < min || v > max) {
    return bad(`${path}.${key}`, `must be a number in ${String(min)}..${String(max)}`);
  }
  return v;
}

function boolOr(o: JsonObject, key: string, path: string, def: boolean): boolean {
  const v = o[key];
  if (v === undefined) return def;
  if (typeof v !== 'boolean') return bad(`${path}.${key}`, 'must be a boolean');
  return v;
}

function bigOf(o: JsonObject, key: string, path: string, min: bigint): bigint {
  const v = o[key];
  if (typeof v !== 'string' || !/^(?:0|[1-9][0-9]{0,40})$/.test(v) || BigInt(v) < min) {
    return bad(`${path}.${key}`, `must be a decimal string >= ${min.toString()}`);
  }
  return BigInt(v);
}

function sub(o: JsonObject, key: string, path: string, allowed: readonly string[]): JsonObject {
  const v = o[key];
  if (v === undefined) return {};
  return wrap(() => parseObject(v, key, [], allowed), `${path}.${key}`);
}

/** Converts validation errors of the shared request helpers into startup errors. */
function wrap<T>(fn: () => T, path: string): T {
  try {
    return fn();
  } catch {
    return bad(path, 'invalid');
  }
}

function parseTrustProxy(v: unknown): string[] {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > 32 || v.some((x) => typeof x !== 'string')) return bad('trustProxy', 'must be an array of proxy CIDRs (max 32)');
  const list = v as string[];
  new TrustedProxies(list); // validates every entry; throws ConfigError
  if (list.some((c) => c.endsWith('/0'))) return bad('trustProxy', 'a /0 network would trust the whole internet');
  return list;
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

function parseMetrics(m: JsonObject, host: string, env: Env): { enabled: boolean; bearerToken: string | undefined } {
  const enabled = boolOr(m, 'enabled', 'metrics', false);
  const envName = m['bearerTokenEnv'];
  let bearerToken: string | undefined;
  if (envName !== undefined) {
    if (typeof envName !== 'string' || !/^[A-Z_][A-Z0-9_]{0,63}$/.test(envName)) return bad('metrics.bearerTokenEnv', 'must be an env var name');
    bearerToken = env[envName];
    if (bearerToken === undefined || !/^[A-Za-z0-9._~+/=-]{32,256}$/.test(bearerToken)) {
      return bad('metrics.bearerTokenEnv', 'the variable must hold a token of 32..256 URL-safe characters');
    }
  }
  if (enabled && bearerToken === undefined && !LOOPBACK_HOSTS.has(host)) {
    return bad('metrics', 'enabling metrics on a non-loopback listen host requires bearerTokenEnv');
  }
  return { enabled, bearerToken };
}

function parseAlerts(a: JsonObject, env: Env): { webhookUrl: string | undefined; cooldownSeconds: number } {
  if (a['webhookUrl'] !== undefined && a['webhookUrlEnv'] !== undefined) return bad('alerts', 'set only one of webhookUrl and webhookUrlEnv');
  let raw: unknown = a['webhookUrl'];
  if (a['webhookUrlEnv'] !== undefined) {
    const n = a['webhookUrlEnv'];
    if (typeof n !== 'string' || !/^[A-Z_][A-Z0-9_]{0,63}$/.test(n)) return bad('alerts.webhookUrlEnv', 'must be an env var name');
    raw = env[n];
    if (raw === undefined || raw === '') return bad('alerts.webhookUrlEnv', 'variable is empty');
  }
  let webhookUrl: string | undefined;
  if (raw !== undefined) {
    if (typeof raw !== 'string') return bad('alerts.webhookUrl', 'must be a string');
    webhookUrl = validateWebhookUrl(raw).href;
  }
  return { webhookUrl, cooldownSeconds: numberOr(a, 'cooldownSeconds', 'alerts', 900, 1, 86_400) };
}

function parseOrigins(v: unknown): string[] {
  if (!Array.isArray(v) || v.length === 0 || v.length > 32) return bad('allowedOrigins', 'must be a non-empty array (max 32)');
  return v.map((x: unknown): string => {
    if (typeof x !== 'string') return bad('allowedOrigins', 'entries must be strings');
    let u: URL;
    try {
      u = new URL(x);
    } catch {
      return bad('allowedOrigins', 'entry is not a URL');
    }
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    if (u.origin !== x || !(u.protocol === 'https:' || (u.protocol === 'http:' && local))) {
      return bad('allowedOrigins', 'entries must be exact https origins (http only for localhost); no wildcards');
    }
    return x;
  });
}

function parseTokens(chainId: number, v: unknown, path: string): AllowedToken[] {
  if (!Array.isArray(v) || v.length === 0 || v.length > 64) return bad(`${path}.tokens`, 'must be a non-empty array (max 64)');
  const seen = new Set<string>();
  return v.map((raw: unknown, i): AllowedToken => {
    const p = `${path}.tokens[${String(i)}]`;
    const t = wrap(() => parseObject(raw, 'token', ['address', 'usdStable'], ['symbol', 'decimals', 'permit']), p);
    if (t['usdStable'] !== true) return bad(p, 'only USD stablecoins are supported in v1 (usdStable must be true)');
    const address = wrap(() => parseAddress(t['address'], 'token'), `${p}.address`);
    if (seen.has(address)) return bad(p, 'duplicate token');
    seen.add(address);
    const known = findToken(chainId, address);
    if (known !== undefined) {
      if ((t['decimals'] !== undefined && t['decimals'] !== known.decimals) || (t['permit'] !== undefined && t['permit'] !== known.permit)) {
        return bad(p, 'conflicts with the chain-adapters allowlist entry');
      }
      return { address: known.address, symbol: known.symbol, decimals: known.decimals, permit: known.permit, usdStable: true };
    }
    const symbol = t['symbol'];
    if (typeof symbol !== 'string' || !/^[A-Za-z0-9._-]{1,16}$/.test(symbol)) return bad(`${p}.symbol`, 'required for tokens outside the adapter allowlist');
    const decimals = numberOr(t, 'decimals', p, -1, 0, 36);
    if (decimals < 0) return bad(`${p}.decimals`, 'required for tokens outside the adapter allowlist');
    if (typeof t['permit'] !== 'boolean') return bad(`${p}.permit`, 'required boolean for tokens outside the adapter allowlist');
    return { address, symbol, decimals, permit: t['permit'], usdStable: true };
  });
}

function parseChain(raw: unknown, i: number, top: { allowDevChain: boolean; insecureRpc: boolean; allowFeeToHotKey: boolean }, ctx: ConfigContext): ChainRuntimeConfig {
  const path = `chains[${String(i)}]`;
  const c = wrap(
    () =>
      parseObject(
        raw,
        'chain',
        ['chainId', 'tokens', 'nativeUsdPrice', 'gasUnits', 'maxGasLimit', 'maxGasPriceWei', 'dailyBudgetWei', 'minBalanceWei'],
        ['rpcUrl', 'rpcUrlEnv', 'sweepRelayer', 'feeTo'],
      ),
    path,
  );
  const chainId = c['chainId'];
  if (typeof chainId !== 'number' || !Number.isSafeInteger(chainId) || chainId < 1) return bad(`${path}.chainId`, 'invalid');

  const known = findChain(chainId);
  const manifestText = ctx.readManifest(chainId);
  let name: string;
  if (known === undefined) {
    if (!(top.allowDevChain && chainId === DEV_CHAIN_ID)) return bad(`${path}.chainId`, 'unknown chain');
    name = 'Local development chain';
  } else {
    name = known.name;
    if (!known.testnet) {
      if (manifestText === undefined) return bad(path, 'mainnet requires a deployment manifest');
      if (ctx.env['ALLOW_MAINNET'] !== '1') return bad(path, 'mainnet requires ALLOW_MAINNET=1');
    } else {
      requireEnabledChain(chainId);
    }
  }

  let sweepRelayer: Address | undefined;
  if (manifestText !== undefined) sweepRelayer = loadDeployment(manifestText, chainId).sweepRelayer;
  if (c['sweepRelayer'] !== undefined) {
    const configured = wrap(() => parseAddress(c['sweepRelayer'], 'sweepRelayer'), `${path}.sweepRelayer`);
    if (sweepRelayer !== undefined && configured !== sweepRelayer) return bad(`${path}.sweepRelayer`, 'differs from the deployment manifest');
    sweepRelayer = configured;
  }
  if (sweepRelayer === undefined) return bad(`${path}.sweepRelayer`, 'no manifest and no sweepRelayer configured');

  let feeTo: Address;
  if (c['feeTo'] === undefined) {
    if (!top.allowFeeToHotKey) return bad(`${path}.feeTo`, 'required (earned fees must not accumulate on the hot key); or set allowFeeToHotKey');
    feeTo = ctx.hotKeyAddress;
  } else {
    feeTo = wrap(() => parseAddress(c['feeTo'], 'feeTo'), `${path}.feeTo`);
  }
  if (BigInt(feeTo) < 0x10000n) return bad(`${path}.feeTo`, 'zero address and precompiles would burn fee income');
  if (feeTo === ctx.hotKeyAddress && !top.allowFeeToHotKey) return bad(`${path}.feeTo`, 'must differ from the hot key (or set allowFeeToHotKey)');
  if (feeTo === sweepRelayer) return bad(`${path}.feeTo`, 'must not be the sweep relayer contract');

  if ((c['rpcUrl'] === undefined) === (c['rpcUrlEnv'] === undefined)) return bad(path, 'set exactly one of rpcUrl and rpcUrlEnv');
  const envName = c['rpcUrlEnv'];
  if (envName !== undefined && (typeof envName !== 'string' || !/^[A-Z_][A-Z0-9_]{0,63}$/.test(envName))) return bad(`${path}.rpcUrlEnv`, 'must be an env var name');
  const rpcRaw = typeof envName === 'string' ? ctx.env[envName] : c['rpcUrl'];
  if (typeof rpcRaw !== 'string' || rpcRaw === '') return bad(`${path}.rpcUrl`, 'missing');
  let rpcUrl: string;
  try {
    rpcUrl = validateRpcUrl(rpcRaw, { allowInsecureLocalhost: top.insecureRpc });
  } catch {
    return bad(`${path}.rpcUrl`, 'rejected (https/wss only; credentials in URL not allowed)');
  }

  const price = c['nativeUsdPrice'];
  let nativeUsdMicro: bigint;
  try {
    nativeUsdMicro = parseUsdMicro(typeof price === 'string' ? price : '');
  } catch {
    return bad(`${path}.nativeUsdPrice`, 'must be a positive decimal string with <= 6 fractional digits');
  }
  const gu = sub(c, 'gasUnits', path, ['sweep', 'sweepWithPermit']);
  const gasUnits = { sweep: bigOf(gu, 'sweep', `${path}.gasUnits`, 21_000n), sweepWithPermit: bigOf(gu, 'sweepWithPermit', `${path}.gasUnits`, 21_000n) };

  return {
    chainId,
    name,
    rpcUrl,
    sweepRelayer: getAddress(sweepRelayer),
    feeTo,
    tokens: parseTokens(chainId, c['tokens'], path),
    nativeUsdMicro,
    gasUnits,
    maxGasLimit: bigOf(c, 'maxGasLimit', path, 21_000n),
    maxGasPriceWei: bigOf(c, 'maxGasPriceWei', path, 1n),
    dailyBudgetWei: bigOf(c, 'dailyBudgetWei', path, 1n),
    minBalanceWei: bigOf(c, 'minBalanceWei', path, 0n),
  };
}

/**
 * Validates the raw configuration object strictly (unknown keys rejected, everything bounded).
 *
 * @param raw Parsed JSON.
 * @param ctx Environment, hot-key address and manifest reader.
 * @returns Resolved configuration.
 * @throws {ConfigError} on any problem; the message never contains secret values.
 */
export function parseConfig(raw: unknown, ctx: ConfigContext): RelayerConfig {
  const o = wrap(
    () =>
      parseObject(
        raw,
        'config',
        ['allowedOrigins', 'chains'],
        [
          'listen', 'allowDevChain', 'allowInsecureLocalhostRpc', 'allowFeeToHotKey', 'trustProxy', 'quoteTtlSeconds', 'deadline',
          'rateLimit', 'breaker', 'abuse', 'gas', 'server', 'metrics', 'alerts', 'queue', 'shutdownGraceSeconds',
        ],
      ),
    '$',
  );
  const listen = sub(o, 'listen', '$', ['host', 'port']);
  const host = listen['host'] ?? '127.0.0.1';
  if (typeof host !== 'string' || host === '' || host.length > 255) return bad('listen.host', 'invalid');
  const dl = sub(o, 'deadline', '$', ['minSeconds', 'maxSeconds']);
  const minDeadlineSeconds = numberOr(dl, 'minSeconds', 'deadline', 30, 1, MAX_DEADLINE_WINDOW_SECONDS);
  const maxDeadlineSeconds = numberOr(dl, 'maxSeconds', 'deadline', MAX_DEADLINE_WINDOW_SECONDS, 1, MAX_DEADLINE_WINDOW_SECONDS);
  if (minDeadlineSeconds >= maxDeadlineSeconds) return bad('deadline', 'minSeconds must be below maxSeconds');
  const rl = sub(o, 'rateLimit', '$', ['ipPerMinute', 'ipBurst', 'ownerPerMinute', 'ownerBurst', 'maxKeys', 'saltRotationHours', 'quotePerMinute', 'quoteBurst']);
  const br = sub(o, 'breaker', '$', ['windowSize', 'minSamples', 'failureRatio', 'cooldownSeconds', 'halfOpenTimeoutSeconds']);
  const ab = sub(o, 'abuse', '$', ['ownerMaxFailures', 'destinationMaxFailures', 'windowSeconds']);
  const gs = sub(o, 'gas', '$', ['coverPercent', 'maxMovePercent', 'quoteCacheSeconds']);
  const sv = sub(o, 'server', '$', ['headersTimeoutMs', 'requestTimeoutMs', 'keepAliveTimeoutMs', 'bodyTimeoutMs', 'maxConnections', 'maxConnectionsPerIp', 'maxHeadersCount']);
  const mt = sub(o, 'metrics', '$', ['enabled', 'bearerTokenEnv']);
  const al = sub(o, 'alerts', '$', ['webhookUrl', 'webhookUrlEnv', 'cooldownSeconds']);
  const q = sub(o, 'queue', '$', ['maxPending', 'receiptTimeoutSeconds']);
  const allowDevChain = boolOr(o, 'allowDevChain', '$', false);
  const allowInsecureLocalhostRpc = boolOr(o, 'allowInsecureLocalhostRpc', '$', false);
  const allowFeeToHotKey = boolOr(o, 'allowFeeToHotKey', '$', false);

  const chainsRaw = o['chains'];
  if (!Array.isArray(chainsRaw) || chainsRaw.length === 0 || chainsRaw.length > 16) return bad('chains', 'must be a non-empty array (max 16)');
  const chains = chainsRaw.map((x: unknown, i) => parseChain(x, i, { allowDevChain, insecureRpc: allowInsecureLocalhostRpc, allowFeeToHotKey }, ctx));
  if (new Set(chains.map((c) => c.chainId)).size !== chains.length) return bad('chains', 'duplicate chainId');

  const windowSize = numberOr(br, 'windowSize', 'breaker', 20, 2, 1000);
  return {
    host,
    port: numberOr(listen, 'port', 'listen', 8787, 0, 65535),
    allowedOrigins: parseOrigins(o['allowedOrigins']),
    allowInsecureLocalhostRpc,
    trustProxy: parseTrustProxy(o['trustProxy']),
    allowFeeToHotKey,
    quoteTtlSeconds: numberOr(o, 'quoteTtlSeconds', '$', 120, 10, 600),
    minDeadlineSeconds,
    maxDeadlineSeconds,
    rateLimit: {
      ipPerMinute: numberOr(rl, 'ipPerMinute', 'rateLimit', 30, 1, 100_000, false),
      ipBurst: numberOr(rl, 'ipBurst', 'rateLimit', 10, 1, 100_000, false),
      ownerPerMinute: numberOr(rl, 'ownerPerMinute', 'rateLimit', 6, 1, 100_000, false),
      ownerBurst: numberOr(rl, 'ownerBurst', 'rateLimit', 3, 1, 100_000, false),
      maxKeys: numberOr(rl, 'maxKeys', 'rateLimit', 10_000, 16, 1_000_000),
      saltRotationHours: numberOr(rl, 'saltRotationHours', 'rateLimit', 24, 1, 24),
      quotePerMinute: numberOr(rl, 'quotePerMinute', 'rateLimit', 300, 1, 1_000_000, false),
      quoteBurst: numberOr(rl, 'quoteBurst', 'rateLimit', 60, 1, 1_000_000, false),
    },
    breaker: {
      windowSize,
      minSamples: numberOr(br, 'minSamples', 'breaker', Math.min(5, windowSize), 1, windowSize),
      failureRatio: numberOr(br, 'failureRatio', 'breaker', 0.5, 0.01, 1, false),
      cooldownSeconds: numberOr(br, 'cooldownSeconds', 'breaker', 60, 1, 86_400),
      halfOpenTimeoutSeconds: numberOr(br, 'halfOpenTimeoutSeconds', 'breaker', 30, 1, 3600),
    },
    abuse: {
      ownerMaxFailures: numberOr(ab, 'ownerMaxFailures', 'abuse', 3, 1, 1000),
      destinationMaxFailures: numberOr(ab, 'destinationMaxFailures', 'abuse', 5, 1, 1000),
      windowSeconds: numberOr(ab, 'windowSeconds', 'abuse', 3600, 60, 86_400),
    },
    gas: {
      coverPercent: numberOr(gs, 'coverPercent', 'gas', 100, 100, 1000),
      maxMovePercent: numberOr(gs, 'maxMovePercent', 'gas', 25, 0, 1000),
      quoteCacheSeconds: numberOr(gs, 'quoteCacheSeconds', 'gas', 5, 0, 60),
    },
    server: {
      headersTimeoutMs: numberOr(sv, 'headersTimeoutMs', 'server', 10_000, 1000, 120_000),
      requestTimeoutMs: numberOr(sv, 'requestTimeoutMs', 'server', 15_000, 1000, 300_000),
      keepAliveTimeoutMs: numberOr(sv, 'keepAliveTimeoutMs', 'server', 5000, 1000, 120_000),
      bodyTimeoutMs: numberOr(sv, 'bodyTimeoutMs', 'server', 5000, 500, 120_000),
      maxConnections: numberOr(sv, 'maxConnections', 'server', 1024, 1, 100_000),
      maxConnectionsPerIp: numberOr(sv, 'maxConnectionsPerIp', 'server', 64, 1, 100_000),
      maxHeadersCount: numberOr(sv, 'maxHeadersCount', 'server', 50, 8, 1000),
    },
    metrics: parseMetrics(mt, host, ctx.env),
    alerts: parseAlerts(al, ctx.env),
    queue: {
      maxPending: numberOr(q, 'maxPending', 'queue', 16, 1, 1024),
      receiptTimeoutSeconds: numberOr(q, 'receiptTimeoutSeconds', 'queue', 120, 5, 3600),
    },
    shutdownGraceSeconds: numberOr(o, 'shutdownGraceSeconds', '$', 15, 1, 300),
    chains,
  };
}

/**
 * Reads the JSON config file and a manifest directory.
 *
 * @param configPath Path to the config JSON (max 64 KiB).
 * @param deploymentsDir Directory holding `<chainId>.json` manifests.
 * @param ctxBase Environment and hot-key address.
 * @returns Resolved configuration.
 * @throws {ConfigError} on read, parse or validation failure.
 */
export function loadConfigFile(configPath: string, deploymentsDir: string, ctxBase: Omit<ConfigContext, 'readManifest'>): RelayerConfig {
  let text: string;
  try {
    text = readFileSync(configPath, 'utf8');
  } catch {
    throw new ConfigError('config file not readable');
  }
  if (text.length > 65_536) throw new ConfigError('config file too large');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ConfigError('config file is not valid JSON');
  }
  const readManifest = (chainId: number): string | undefined => {
    try {
      return readFileSync(join(deploymentsDir, `${String(chainId)}.json`), 'utf8');
    } catch {
      return undefined;
    }
  };
  return parseConfig(raw, { ...ctxBase, readManifest });
}
