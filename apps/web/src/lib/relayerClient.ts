import type { Address } from '@ghostpay/chain-adapters';
import { getAddress, isAddress } from 'viem/utils';
import { UserFacingError } from './errors';

export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

export interface RelayerQuote {
  readonly fee: bigint;
  readonly feeTo: Address;
  readonly expiresAt: number;
  readonly quoteToken: string;
}

export interface QuoteRequest {
  readonly chainId: number;
  readonly token: Address;
  readonly owner: Address;
  readonly destination: Address;
  readonly amount: bigint;
}

const MAX_RESPONSE = 16 * 1024;
const TIMEOUT_MS = 15_000;

async function post(base: string, path: string, body: unknown, fetchFn: FetchFn): Promise<unknown> {
  const ctl = new AbortController();
  const timer = setTimeout(() => {
    ctl.abort();
  }, TIMEOUT_MS);
  try {
    const res = await fetchFn(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v)),
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      signal: ctl.signal,
    });
    const text = await res.text();
    if (text.length > MAX_RESPONSE) throw new UserFacingError('The relayer response was too large and was ignored.');
    if (!res.ok) {
      let cls = '';
      try {
        const j = JSON.parse(text) as { error?: unknown };
        if (typeof j.error === 'string' && /^[a-z_]{1,40}$/.test(j.error)) cls = ` (${j.error})`;
      } catch {
        /* class only; never echo the body */
      }
      throw new UserFacingError(`The relayer refused the request: HTTP ${String(res.status)}${cls}.`);
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new UserFacingError('The relayer returned an invalid response.');
    }
  } catch (e) {
    if (e instanceof UserFacingError) throw e;
    throw new UserFacingError('Could not reach the relayer.');
  } finally {
    clearTimeout(timer);
  }
}

function obj(v: unknown): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new UserFacingError('The relayer returned an invalid response.');
  return v as Record<string, unknown>;
}

/** POST /v1/quote. The caller must still check the fee against the published cap before signing. */
export async function requestQuote(base: string, q: QuoteRequest, fetchFn: FetchFn = (u, i) => fetch(u, i)): Promise<RelayerQuote> {
  const o = obj(await post(base, '/v1/quote', { chainId: q.chainId, token: q.token, owner: q.owner, destination: q.destination, amount: q.amount.toString() }, fetchFn));
  const fee = o['fee'];
  const feeTo = o['feeTo'];
  const expiresAt = o['expiresAt'];
  const quoteToken = o['quoteToken'];
  if (typeof fee !== 'string' || !/^(?:0|[1-9][0-9]{0,77})$/.test(fee)) throw new UserFacingError('The relayer returned an invalid fee.');
  if (typeof feeTo !== 'string' || !isAddress(feeTo, { strict: false })) throw new UserFacingError('The relayer returned an invalid fee address.');
  if (typeof expiresAt !== 'number' || !Number.isSafeInteger(expiresAt) || expiresAt <= 0) throw new UserFacingError('The relayer returned an invalid expiry.');
  if (typeof quoteToken !== 'string' || quoteToken.length === 0 || quoteToken.length > 2048 || !/^[A-Za-z0-9._~+/=-]+$/.test(quoteToken)) {
    throw new UserFacingError('The relayer returned an invalid quote token.');
  }
  return { fee: BigInt(fee), feeTo: getAddress(feeTo), expiresAt, quoteToken };
}

export interface SweepSubmission {
  readonly sweep: {
    readonly token: Address;
    readonly owner: Address;
    readonly destination: Address;
    readonly feeTo: Address;
    readonly amount: bigint;
    readonly fee: bigint;
    readonly deadline: bigint;
    readonly nonce: bigint;
  };
  readonly sweepSig: string;
  readonly permit?: { readonly value: bigint; readonly deadline: bigint; readonly v: number; readonly r: string; readonly s: string };
  readonly quoteToken: string;
}

/** POST /v1/sweep. Returns the transaction hash the relayer reports (verify it on your own RPC). */
export async function submitSweep(base: string, s: SweepSubmission, fetchFn: FetchFn = (u, i) => fetch(u, i)): Promise<string> {
  const o = obj(await post(base, '/v1/sweep', s, fetchFn));
  const h = o['txHash'];
  if (typeof h !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(h)) throw new UserFacingError('The relayer returned an invalid transaction hash.');
  return h.toLowerCase();
}
