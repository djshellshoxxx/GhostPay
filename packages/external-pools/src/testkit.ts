import { SecretBox } from '@ghostpay/secret-box';
import type { Address, Hex } from 'viem';
import { asHex } from './hex.js';
import type { ChainReader, ExitTransport, LogLike, RouteRequest, StealthSigner, TxReceiptLike } from './types.js';

/** Fixed S1 used across tests (not a real key; no private key exists for it in this repo). */
export const S1: Address = '0x1111111111111111111111111111111111111111';
/** Fixed destination. */
export const D1: Address = '0x2222222222222222222222222222222222222222';
/** Another destination. */
export const D2: Address = '0x3333333333333333333333333333333333333333';

/**
 * @param byte Fill byte.
 * @returns A 32-byte root seed box (test only: low entropy).
 */
export function makeSeed(byte = 7): SecretBox {
  return SecretBox.copyOf(new Uint8Array(32).fill(byte), { label: 'test-seed' });
}

/** @returns A signer for `address` that signs a deterministic fake message. */
export function makeSigner(address: Address = S1): StealthSigner {
  return { address, signMessage: (m) => Promise.resolve(asHex(`0x${Buffer.from(m).toString('hex').padEnd(130, '0').slice(0, 130)}`)) };
}

/** @returns A route request with sensible defaults; override any field. */
export function makeRequest(over: Partial<RouteRequest> = {}): RouteRequest {
  const address = over.stealth?.address ?? S1;
  return {
    chainId: 31337,
    asset: 'native',
    amount: 1_000_000n,
    stealth: over.stealth ?? { address, signer: makeSigner(address) },
    destination: D1,
    rootSeed: over.rootSeed ?? makeSeed(),
    ...over,
  };
}

/** Recorded HTTP call. */
export interface RecordedCall {
  readonly url: string;
  readonly method: string;
  readonly body: string | undefined;
}

/**
 * Transport whose `fetch` is answered by `handler` and records every call. Time is controlled by `clock`.
 *
 * @param handler Maps a call to a Response (or throws).
 * @param clock Mutable clock in ms.
 */
export function stubTransport(
  handler: (c: RecordedCall) => Response | Promise<Response>,
  clock: { now: number } = { now: 1_000_000 },
): { transport: ExitTransport; calls: RecordedCall[]; clock: { now: number } } {
  const calls: RecordedCall[] = [];
  const f = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const c: RecordedCall = {
      url: typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? init.body : undefined,
    };
    calls.push(c);
    return handler(c);
  }) as typeof fetch;
  return { transport: { fetch: f, now: () => clock.now }, calls, clock };
}

/** @returns A JSON Response. */
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** @returns A receipt from the given fields. */
export function makeReceipt(over: Partial<TxReceiptLike> & Pick<TxReceiptLike, 'transactionHash'>): TxReceiptLike {
  return { blockNumber: 10n, from: S1, to: null, status: 'success', logs: [], confirmations: 5, ...over };
}

/**
 * In-memory {@link ChainReader} for tests.
 *
 * @param init Code by address (lower-case), call results by `to|data`, logs.
 */
export function fakeChainReader(init: {
  codes?: Record<string, Hex>;
  calls?: Record<string, Hex>;
  logs?: readonly LogLike[];
  block?: bigint;
} = {}): ChainReader & { seen: string[] } {
  const seen: string[] = [];
  return {
    seen,
    getCode: (_c, a) => {
      seen.push(`getCode:${a}`);
      return Promise.resolve(init.codes?.[a.toLowerCase()] ?? '0x');
    },
    call: (_c, to, data) => {
      seen.push(`call:${to}`);
      const r = init.calls?.[`${to.toLowerCase()}|${data}`];
      return r === undefined ? Promise.reject(new Error('call reverted')) : Promise.resolve(r);
    },
    getLogs: (_c, f) => {
      seen.push(`getLogs:${f.address}`);
      return Promise.resolve((init.logs ?? []).filter((l) => l.address.toLowerCase() === f.address.toLowerCase()));
    },
    getBlockNumber: () => Promise.resolve(init.block ?? 100n),
  };
}
