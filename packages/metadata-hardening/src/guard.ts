/** Stable error codes thrown by this package. Messages are fixed text and never echo caller data. */
export type MhErrorCode =
  | 'UNSUPPORTED_CHAIN'
  | 'UNSUPPORTED_NETWORK'
  | 'INVALID_INPUT'
  | 'LIMIT_EXCEEDED'
  | 'CONFLICT'
  | 'POLICY_REJECTED';

/** Error carrying a stable {@link MhErrorCode}. */
export class MetadataHardeningError extends Error {
  /** Machine-readable code. */
  public readonly code: MhErrorCode;

  /**
   * @param code Stable code.
   * @param message Fixed text (no caller data, no key material).
   */
  public constructor(code: MhErrorCode, message: string) {
    super(message);
    this.name = 'MetadataHardeningError';
    this.code = code;
  }
}

/** @internal Throws an INVALID_INPUT error unless `ok`. */
export function requireInput(ok: boolean, message: string): asserts ok {
  if (!ok) throw new MetadataHardeningError('INVALID_INPUT', message);
}

/** EVM chains this package works on: anvil, Ethereum Sepolia, Base Sepolia. */
export const TESTNET_CHAIN_IDS: readonly number[] = [31337, 11155111, 84532];

/** Bitcoin networks this package works on. */
export const BTC_TESTNETS = ['testnet', 'signet', 'regtest'] as const;
/** A permitted Bitcoin network name. */
export type BtcNetwork = (typeof BTC_TESTNETS)[number];

/**
 * Testnet-only guard for EVM chain ids.
 *
 * @param chainId Candidate chain id.
 * @throws {MetadataHardeningError} `UNSUPPORTED_CHAIN` unless 31337, 11155111 or 84532.
 * @security Mainnet use is refused at every entry point that takes a chain.
 */
export function assertTestnetChain(chainId: number): void {
  if (!Number.isInteger(chainId) || !TESTNET_CHAIN_IDS.includes(chainId)) {
    throw new MetadataHardeningError('UNSUPPORTED_CHAIN', 'chain is not a supported testnet');
  }
}

/**
 * Testnet-only guard for Bitcoin networks.
 *
 * @param network Candidate network name.
 * @throws {MetadataHardeningError} `UNSUPPORTED_NETWORK` unless testnet, signet or regtest.
 */
export function assertBtcTestnet(network: string): asserts network is BtcNetwork {
  if (!(BTC_TESTNETS as readonly string[]).includes(network)) {
    throw new MetadataHardeningError('UNSUPPORTED_NETWORK', 'bitcoin network is not a supported testnet');
  }
}

/** Minimal random source: `crypto` or a deterministic test double. */
export type RandomSource = Pick<Crypto, 'getRandomValues'>;

/** @internal Resolves the injected or global CSPRNG. */
export function resolveRng(rng?: RandomSource): RandomSource {
  const r = rng ?? (globalThis as { crypto?: RandomSource }).crypto;
  if (r === undefined || typeof r.getRandomValues !== 'function') {
    throw new MetadataHardeningError('INVALID_INPUT', 'no CSPRNG available');
  }
  return r;
}

/**
 * Uniform integer in [0, n) by rejection sampling (no modular bias).
 *
 * @param n Exclusive upper bound, 1 <= n <= 2^64.
 * @param rng Optional source; production callers omit it.
 * @security Uses `crypto.getRandomValues` only. Math.random is never used.
 */
export function randomBelow(n: bigint, rng?: RandomSource): bigint {
  requireInput(n >= 1n && n <= 1n << 64n, 'bound out of range');
  if (n === 1n) return 0n;
  const source = resolveRng(rng);
  const bits = (n - 1n).toString(2).length;
  const bytes = Math.ceil(bits / 8);
  const mask = (1n << BigInt(bits)) - 1n;
  const buf = new Uint8Array(bytes);
  for (let attempt = 0; attempt < 256; attempt++) {
    source.getRandomValues(buf);
    let v = 0n;
    for (const b of buf) v = (v << 8n) | BigInt(b);
    v &= mask;
    if (v < n) return v;
  }
  throw new MetadataHardeningError('INVALID_INPUT', 'random source failed rejection sampling');
}

/** Uniform integer in [0, n) as a number (n up to 2^53). */
export function randomInt(n: number, rng?: RandomSource): number {
  requireInput(Number.isSafeInteger(n) && n >= 1, 'bound out of range');
  return Number(randomBelow(BigInt(n), rng));
}

/**
 * Unbiased Fisher-Yates shuffle; returns a new array.
 *
 * @param items Input items (not mutated).
 * @param rng Optional random source.
 */
export function shuffle<T>(items: readonly T[], rng?: RandomSource): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1, rng);
    const a = out[i] as T;
    out[i] = out[j] as T;
    out[j] = a;
  }
  return out;
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Validates an endpoint URL: https, or http only for loopback (anvil); no credentials, no
 * fragment, no query.
 *
 * @param url Candidate URL.
 * @returns Normalised origin plus path without trailing slash.
 * @throws {MetadataHardeningError} `INVALID_INPUT`; the message never contains the URL.
 */
export function parseEndpoint(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new MetadataHardeningError('INVALID_INPUT', 'endpoint is not a valid URL');
  }
  const loop = LOOPBACK.has(u.hostname);
  const schemeOk = u.protocol === 'https:' || (u.protocol === 'http:' && loop);
  if (!schemeOk || u.username !== '' || u.password !== '' || u.hash !== '' || u.search !== '') {
    throw new MetadataHardeningError('INVALID_INPUT', 'endpoint must be https, without credentials, query or fragment');
  }
  return u.origin + (u.pathname === '/' ? '' : u.pathname.replace(/\/$/, ''));
}
