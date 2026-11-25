import { TESTNET_CHAIN_IDS, type Hex } from './wire.js';

/** Service configuration, from environment variables (see README "Run"). */
export interface ServiceConfig {
  readonly rpcUrl: string;
  readonly chainId: number;
  readonly announcer: Hex;
  readonly startBlock: bigint;
  readonly dbPath: string;
  readonly host: string;
  readonly port: number;
  readonly allowedOrigins: readonly string[];
  readonly confirmations: number;
  readonly pollMs: number;
  readonly maxReorgDepth: number;
  readonly alignBlocks: number;
  readonly maxWindowBlocks: number;
  readonly maxPageSize: number;
  readonly maxResponseBytes: number;
}

/** Configuration error. The message names the variable, never its value (the RPC URL can carry an API key). */
export class ConfigError extends Error {
  public constructor(variable: string) {
    super(`invalid or missing ${variable}`);
    this.name = 'ConfigError';
  }
}

const P = 'GHOSTPAY_INDEXER_';

/** Parses and validates the service configuration. Defaults bind to loopback; testnet chain ids only. */
export function parseConfig(env: Readonly<Record<string, string | undefined>>): ServiceConfig {
  const get = (k: string): string | undefined => {
    const v = env[P + k];
    return v === undefined || v === '' ? undefined : v;
  };
  const req = (k: string): string => get(k) ?? fail(k);
  const fail = (k: string): never => {
    throw new ConfigError(P + k);
  };
  const int = (k: string, def: number, lo: number, hi: number): number => {
    const v = get(k);
    if (v === undefined) return def;
    if (!/^(?:0|[1-9][0-9]{0,15})$/.test(v)) return fail(k);
    const n = Number(v);
    return n >= lo && n <= hi ? n : fail(k);
  };

  const rpcUrl = req('RPC_URL');
  let rpc: URL | undefined;
  try {
    rpc = new URL(rpcUrl);
  } catch {
    rpc = undefined;
  }
  if (rpc === undefined || (rpc.protocol !== 'https:' && rpc.protocol !== 'http:')) fail('RPC_URL');

  const chainId = int('CHAIN_ID', -1, 1, Number.MAX_SAFE_INTEGER);
  if (!TESTNET_CHAIN_IDS.includes(chainId)) fail('CHAIN_ID');
  const announcer = req('ANNOUNCER');
  if (!/^0x[0-9a-fA-F]{40}$/.test(announcer)) fail('ANNOUNCER');
  const start = req('START_BLOCK');
  if (!/^(?:0|[1-9][0-9]{0,15})$/.test(start) || BigInt(start) > BigInt(Number.MAX_SAFE_INTEGER)) fail('START_BLOCK');

  const origins = (get('CORS_ORIGINS') ?? '').split(',').map((s) => s.trim()).filter((s) => s !== '');
  for (const o of origins) if (!isExactOrigin(o)) fail('CORS_ORIGINS');
  const alignBlocks = int('ALIGN_BLOCKS', 1000, 1, 1_000_000);
  return {
    rpcUrl,
    chainId,
    announcer: announcer.toLowerCase() as Hex,
    startBlock: BigInt(start),
    dbPath: get('DB') ?? './light-indexer.sqlite',
    host: get('HOST') ?? '127.0.0.1',
    port: int('PORT', 8787, 0, 65_535),
    allowedOrigins: origins,
    confirmations: int('CONFIRMATIONS', 0, 0, 10_000),
    pollMs: int('POLL_MS', 4000, 100, 3_600_000),
    maxReorgDepth: int('MAX_REORG_DEPTH', 128, 1, 100_000),
    alignBlocks,
    maxWindowBlocks: int('MAX_WINDOW_BLOCKS', 2 * alignBlocks, alignBlocks, 1_000_000),
    maxPageSize: int('MAX_PAGE_SIZE', 1000, 1, 100_000),
    maxResponseBytes: int('MAX_RESPONSE_BYTES', 8 * 1024 * 1024, 64 * 1024, 64 * 1024 * 1024),
  };
}

function isExactOrigin(o: string): boolean {
  try {
    const u = new URL(o);
    return u.origin === o && (u.protocol === 'https:' || u.protocol === 'http:');
  } catch {
    return false;
  }
}

/** First indexed block: `startBlock` aligned down to the window grid, so every served window starts on a stored header. */
export function alignedStart(startBlock: bigint, alignBlocks: number): bigint {
  const a = BigInt(alignBlocks);
  return startBlock - (startBlock % a);
}
