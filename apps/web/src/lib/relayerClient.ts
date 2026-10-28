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

/**
 * Error classes the GhostPay relayer only ever returns before it broadcasts (apps/relayer README "Sweep checks, in
 * order": every 4xx precedes `send`; a failed send is `send_failed` 503). `nonce_used` (409) is excluded: the order may
 * already be on chain. Field validation errors are `invalid_<field>` (400).
 */
const PRE_BROADCAST_CODES: ReadonlySet<string> = new Set([
  'unexpected_query', 'unauthorized', 'origin_not_allowed', 'not_found', 'method_not_allowed', 'body_too_large',
  'unsupported_media_type', 'rate_limited_ip', 'rate_limited_global', 'rate_limited_owner', 'owner_failure_limit',
  'loss_budget_exhausted', 'chain_not_supported', 'token_not_supported', 'permit_not_supported', 'permit_value_too_low',
  'fee_to_mismatch', 'quote_expired', 'fee_below_quote', 'fee_above_cap', 'deadline_too_soon', 'deadline_too_far',
  'amount_too_small', 'invalid_order', 'invalid_signature', 'policy_denied', 'insufficient_token_balance',
  'insufficient_allowance', 'permit_expired', 'permit_failed', 'expired', 'token_transfer_failed', 'simulation_reverted',
  'gas_limit_too_high', 'fee_below_gas_cost',
]);
export const RELAYER_PRE_BROADCAST_CODES: readonly string[] = [...PRE_BROADCAST_CODES];

/** The relayer, or something in front of it, answered with an HTTP error. */
export class RelayerRefusedError extends UserFacingError {
  public readonly status: number;
  /** Error class from the relayer's `{ "error": { "code" } }` envelope, if the body had one. */
  public readonly code: string | undefined;

  public constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'RelayerRefusedError';
    this.status = status;
    this.code = code;
  }

  /**
   * True only for a 4xx carrying the relayer's own envelope with a class it returns before broadcasting. A bare 4xx
   * (CDN, WAF, proxy) or an unknown class is not proof that nothing was sent. This still relies on the relayer's report.
   */
  public get beforeBroadcast(): boolean {
    if (this.status < 400 || this.status >= 500 || this.status === 409 || this.code === undefined) return false;
    return PRE_BROADCAST_CODES.has(this.code) || (this.status === 400 && /^invalid_[a-z_]{1,32}$/.test(this.code));
  }
}

/** Reads the error class from `{ "error": { "code": "..." } }` (relayer envelope) or a legacy `{ "error": "..." }`. */
function errorClass(text: string): string | undefined {
  try {
    const j = JSON.parse(text) as { error?: unknown };
    const e = j.error;
    const code = typeof e === 'string' ? e : typeof e === 'object' && e !== null ? (e as { code?: unknown }).code : undefined;
    return typeof code === 'string' && /^[a-z_]{1,40}$/.test(code) ? code : undefined;
  } catch {
    return undefined;
  }
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
      // Class only; never echo the body.
      const code = errorClass(text);
      throw new RelayerRefusedError(`The relayer refused the request: HTTP ${String(res.status)}${code === undefined ? '' : ` (${code})`}.`, res.status, code);
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
