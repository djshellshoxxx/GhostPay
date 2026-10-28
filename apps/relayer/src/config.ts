import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Address } from 'viem';
import { getAddress } from 'viem';
import {
  findChain,
  findToken,
  loadDeployment,
  requireEnabledChain,
  verifyObjectManifestSignature,
  type DeploymentManifest,
  validateRpcUrl,
} from '@ghostpay/chain-adapters';
import { TrustedProxies } from '@ghostpay/relayer-guard';
import { parseAddress, parseObject, type JsonObject } from './codec.js';
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
  /** Signature-checked manifest for this chain, when one exists; `buildChainClients` reads it back from the chain. */
  readonly manifest?: DeploymentManifest;
}

/** Resolved relayer configuration. */
export interface RelayerConfig {
  readonly host: string;
  readonly port: number;
  readonly allowedOrigins: readonly string[];
  readonly allowInsecureLocalhostRpc: boolean;
  /** Addresses or CIDR blocks of reverse proxies whose `X-Forwarded-For` is honoured (empty: ignore the header). */
  readonly trustedProxies: readonly string[];
  readonly allowFeeToHotKey: boolean;
  /** `griefReserveBps`: spec 04 griefing margin added to the gas term of the sponsor fee (default 0, operator-tuned). */
  readonly gas: { readonly coverPercent: number; readonly maxMovePercent: number; readonly quoteCacheSeconds: number; readonly griefReserveBps?: number };
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
    /** Process-wide `/v1/quote` budget (anonymous RPC cost control, S3-07). */
    readonly quoteGlobalPerMinute: number;
    readonly quoteGlobalBurst: number;
    /** `/v1/quote` budget per client network group (IPv4 /24, IPv6 /48), checked before the global one (L5-03). */
    readonly quoteGroupPerMinute: number;
    readonly quoteGroupBurst: number;
  };
  readonly breaker: {
    readonly windowSize: number;
    readonly minSamples: number;
    readonly failureRatio: number;
    readonly cooldownSeconds: number;
    readonly probeTimeoutSeconds: number;
  };
  /** Caps gas paid without reimbursement (reverted or front-run sweeps, S3-06). */
  readonly lossBudget: {
    readonly windowSeconds: number;
    readonly perKeyWei: bigint;
    readonly globalWei: bigint;
    readonly maxKeys: number;
  };
  /** Bearer token that enables `GET /metrics` (absent: route disabled). */
  readonly metricsToken?: string;
  /** https URL receiving alert JSON (absent: alerts are log-only). */
  readonly alertWebhookUrl?: string;
  readonly queue: { readonly maxPending: number; readonly receiptTimeoutSeconds: number };
  readonly shutdownGraceSeconds: number;
  readonly chains: readonly ChainRuntimeConfig[];
}

/** Inputs besides the JSON itself. */
export interface ConfigContext {
  readonly env: Env;
  /** Address of the hot key; default `feeTo`. */
  readonly hotKeyAddress: Address;
  /** Returns the manifest JSON text for a chain id, or `undefined` when none exists. */
  readonly readManifest: (chainId: number) => string | undefined;
  /** Compressed secp256k1 release public keys; manifests fail closed without a matching key. */
  readonly releaseKeys?: readonly string[] | undefined;
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
  let manifest: DeploymentManifest | undefined;
  if (manifestText !== undefined) {
    manifest = loadDeployment(manifestText, chainId);
    // CHAIN-ADAPTERS-05: authenticate the structured manifest before trusting any deployment field.
    try {
      if (verifyObjectManifestSignature(manifest, ctx.releaseKeys ?? []).status !== 'valid') throw new Error('invalid manifest signature');
    } catch {
      return bad(`${path}`, 'deployment manifest signature check failed (unsigned or invalid manifest refused)');
    }
    sweepRelayer = manifest.sweepRelayer;
  }
  if (c['sweepRelayer'] !== undefined) {
    const configured = wrap(() => parseAddress(c['sweepRelayer'], 'sweepRelayer'), `${path}.sweepRelayer`);
    if (sweepRelayer !== undefined && configured !== sweepRelayer) return bad(`${path}.sweepRelayer`, 'differs from the deployment manifest');
    sweepRelayer = configured;
  }
  if (sweepRelayer === undefined) return bad(`${path}.sweepRelayer`, 'no manifest and no sweepRelayer configured');

  const allowFeeToHotKey = top.allowFeeToHotKey;
  if (c['feeTo'] === undefined && !allowFeeToHotKey) return bad(`${path}.feeTo`, 'required; set allowFeeToHotKey only if the hot key must receive fees');
  const feeTo = c['feeTo'] === undefined ? ctx.hotKeyAddress : wrap(() => parseAddress(c['feeTo'], 'feeTo'), `${path}.feeTo`);
  if (feeTo === sweepRelayer) return bad(`${path}.feeTo`, 'must not be the sweep relayer contract');
  if (feeTo === ctx.hotKeyAddress && !allowFeeToHotKey) return bad(`${path}.feeTo`, 'must differ from the hot key unless allowFeeToHotKey is enabled');
  const feeToNumber = BigInt(feeTo);
  if (feeToNumber === 0n || (feeToNumber >= 1n && feeToNumber <= 10n)) return bad(`${path}.feeTo`, 'must not be the zero or a precompile address');

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
    ...(manifest === undefined ? {} : { manifest }),
  };
}

/** Parse the release-key allowlist from its comma-separated environment setting. */
export function parseReleaseKeys(value: string | undefined): readonly string[] {
  if (value === undefined || value.trim() === '') return [];
  const keys = value.split(',').map((key) => key.trim());
  if (keys.length > 8 || keys.some((key) => !/^(?:02|03)[0-9a-fA-F]{64}$/.test(key))) {
    throw new ConfigError('GHOSTPAY_RELEASE_PUBKEYS must contain up to 8 compressed secp256k1 keys');
  }
  return keys;
}

function bigOr(o: JsonObject, key: string, path: string, def: bigint): bigint {
  const v = o[key];
  if (v === undefined) return def;
  if (typeof v !== 'string' || !/^(?:0|[1-9][0-9]{0,30})$/.test(v)) return bad(`${path}.${key}`, 'must be a decimal string of wei');
  return BigInt(v);
}

function parseTrustedProxies(v: unknown): readonly string[] {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > 32) return bad('trustedProxies', 'must be an array of at most 32 addresses or CIDR blocks');
  const out: string[] = [];
  for (const e of v) {
    if (typeof e !== 'string' || e.length > 64) return bad('trustedProxies', 'entries must be strings');
    try {
      new TrustedProxies([e]);
    } catch {
      return bad('trustedProxies', 'entry is not an IP address or CIDR block');
    }
    out.push(e);
  }
  return out;
}

function envNameOf(o: JsonObject, key: string): string | undefined {
  const v = o[key];
  if (v === undefined) return undefined;
  if (typeof v !== 'string' || !/^[A-Z_][A-Z0-9_]{0,63}$/.test(v)) return bad(key, 'must be an env var name');
  return v;
}

/** Resolves the metrics bearer token and the alert webhook URL from the environment (names only in the file). */
function optionalSecrets(o: JsonObject, ctx: ConfigContext): { metricsToken?: string; alertWebhookUrl?: string } {
  const out: { metricsToken?: string; alertWebhookUrl?: string } = {};
  const tokenVar = envNameOf(o, 'metricsTokenEnv');
  if (tokenVar !== undefined) {
    const t = ctx.env[tokenVar];
    if (typeof t !== 'string' || !/^[A-Za-z0-9._~+/=-]{32,256}$/.test(t)) return bad('metricsTokenEnv', 'variable must hold a token of 32..256 URL-safe characters');
    out.metricsToken = t;
  }
  const hookVar = envNameOf(o, 'alertWebhookUrlEnv');
  if (hookVar !== undefined) {
    const raw = ctx.env[hookVar];
    let u: URL | undefined;
    try {
      u = raw === undefined ? undefined : new URL(raw);
    } catch {
      u = undefined;
    }
    if (u === undefined || u.protocol !== 'https:' || u.username !== '' || u.password !== '') return bad('alertWebhookUrlEnv', 'variable must hold an https URL without credentials');
    out.alertWebhookUrl = u.toString();
  }
  return out;
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
        ['listen', 'allowDevChain', 'allowInsecureLocalhostRpc', 'trustedProxies', 'allowFeeToHotKey', 'gas', 'quoteTtlSeconds', 'deadline', 'rateLimit', 'breaker', 'lossBudget', 'queue', 'shutdownGraceSeconds', 'metricsTokenEnv', 'alertWebhookUrlEnv'],
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
  const rl = sub(o, 'rateLimit', '$', ['ipPerMinute', 'ipBurst', 'ownerPerMinute', 'ownerBurst', 'maxKeys', 'saltRotationHours', 'quoteGlobalPerMinute', 'quoteGlobalBurst', 'quoteGroupPerMinute', 'quoteGroupBurst']);
  const br = sub(o, 'breaker', '$', ['windowSize', 'minSamples', 'failureRatio', 'cooldownSeconds', 'probeTimeoutSeconds']);
  const lb = sub(o, 'lossBudget', '$', ['windowSeconds', 'perKeyWei', 'globalWei', 'maxKeys']);
  const ga = sub(o, 'gas', '$', ['coverPercent', 'maxMovePercent', 'quoteCacheSeconds', 'griefReserveBps']);
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
    trustedProxies: parseTrustedProxies(o['trustedProxies']),
    allowFeeToHotKey,
    gas: {
      coverPercent: numberOr(ga, 'coverPercent', 'gas', 100, 1, 300),
      maxMovePercent: numberOr(ga, 'maxMovePercent', 'gas', 25, 0, 500),
      quoteCacheSeconds: numberOr(ga, 'quoteCacheSeconds', 'gas', 3, 0, 60),
      griefReserveBps: numberOr(ga, 'griefReserveBps', 'gas', 0, 0, 5000),
    },
    // Spec 04: quote TTL <= 60 s bounds how long a priced gas cost can be held against the relayer.
    quoteTtlSeconds: numberOr(o, 'quoteTtlSeconds', '$', 60, 10, 60),
    minDeadlineSeconds,
    maxDeadlineSeconds,
    rateLimit: {
      ipPerMinute: numberOr(rl, 'ipPerMinute', 'rateLimit', 30, 1, 100_000, false),
      ipBurst: numberOr(rl, 'ipBurst', 'rateLimit', 10, 1, 100_000, false),
      ownerPerMinute: numberOr(rl, 'ownerPerMinute', 'rateLimit', 6, 1, 100_000, false),
      ownerBurst: numberOr(rl, 'ownerBurst', 'rateLimit', 3, 1, 100_000, false),
      maxKeys: numberOr(rl, 'maxKeys', 'rateLimit', 10_000, 16, 1_000_000),
      saltRotationHours: numberOr(rl, 'saltRotationHours', 'rateLimit', 24, 1, 24),
      quoteGlobalPerMinute: numberOr(rl, 'quoteGlobalPerMinute', 'rateLimit', 600, 1, 1_000_000, false),
      quoteGlobalBurst: numberOr(rl, 'quoteGlobalBurst', 'rateLimit', 100, 1, 1_000_000, false),
      quoteGroupPerMinute: numberOr(rl, 'quoteGroupPerMinute', 'rateLimit', 60, 1, 1_000_000, false),
      quoteGroupBurst: numberOr(rl, 'quoteGroupBurst', 'rateLimit', 20, 1, 1_000_000, false),
    },
    breaker: {
      windowSize,
      minSamples: numberOr(br, 'minSamples', 'breaker', Math.min(5, windowSize), 1, windowSize),
      failureRatio: numberOr(br, 'failureRatio', 'breaker', 0.5, 0.01, 1, false),
      cooldownSeconds: numberOr(br, 'cooldownSeconds', 'breaker', 60, 1, 86_400),
      probeTimeoutSeconds: numberOr(br, 'probeTimeoutSeconds', 'breaker', 60, 1, 3600),
    },
    lossBudget: {
      windowSeconds: numberOr(lb, 'windowSeconds', 'lossBudget', 3600, 60, 86_400),
      perKeyWei: bigOr(lb, 'perKeyWei', 'lossBudget', 5n * 10n ** 15n),
      globalWei: bigOr(lb, 'globalWei', 'lossBudget', 5n * 10n ** 16n),
      maxKeys: numberOr(lb, 'maxKeys', 'lossBudget', 10_000, 16, 1_000_000),
    },
    ...optionalSecrets(o, ctx),
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
