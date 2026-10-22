import { parseStrictJson } from '@ghostpay/invoice-schema';
import { SdkAbortedError, SdkConfigError, SdkHttpError, SdkInputError, SdkNetworkError, SdkResponseError } from './errors.js';
import type { TypedEmitter } from './events.js';

/** Minimal fetch shape (browser, Node 18+, undici, or a test double). */
export type FetchLike = (
  input: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<{ status: number; ok: boolean; text(): Promise<string> }>;

/** Responses larger than this many UTF-16 units are rejected. */
export const MAX_RESPONSE_CHARS = 1_048_576;

export type InvoiceState = 'pending' | 'partial' | 'paid' | 'over' | 'expired';
const STATES: readonly string[] = ['pending', 'partial', 'paid', 'over', 'expired'];

/** Public, non-secret invoice facts a merchant may register for status tracking. The fragment is never sent. */
export interface RegisterInvoiceRequest {
  /** 32 lowercase hex chars (the invoice nonce). */
  readonly nonce: string;
  readonly chainId: number;
  readonly currency: string;
  /** Fiat minor units as a decimal string. */
  readonly minorUnits: string;
  readonly expiresAt: number;
}

export interface InvoiceStatus {
  readonly nonce: string;
  readonly state: InvoiceState;
  /** Fiat minor units received, decimal string. */
  readonly receivedMinorUnits: string;
  readonly updatedAt: number;
}

export interface PaymentRecord {
  readonly id: string;
  readonly txHash: string;
  readonly amountMinorUnits: string;
  readonly confirmations: number;
  readonly detectedAt: number;
}

export interface Health {
  readonly status: 'ok';
  readonly version: string;
}

export interface MerchantApi {
  health(options?: CallOptions): Promise<Health>;
  registerInvoice(request: RegisterInvoiceRequest, options?: CallOptions): Promise<InvoiceStatus>;
  getInvoiceStatus(nonce: string, options?: CallOptions): Promise<InvoiceStatus>;
  listPayments(nonce: string, options?: CallOptions): Promise<readonly PaymentRecord[]>;
}

export interface CallOptions {
  readonly signal?: AbortSignal;
}

export interface MerchantConfig {
  readonly baseUrl: string | undefined;
  readonly fetch: FetchLike | undefined;
  readonly apiKey: string | undefined;
  readonly nowMs: () => number;
  readonly emitter: TypedEmitter;
}

const NONCE_RE = /^[0-9a-f]{32}$/;
const DEC_RE = /^(?:0|[1-9][0-9]{0,29})$/;
const HASH_RE = /^0x[0-9a-f]{64}$/;

/** Normalizes and validates a merchant API base URL. https required except for loopback hosts. */
export function normalizeBaseUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new SdkConfigError('baseUrl is not a valid URL');
  }
  const loopback = u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]';
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && loopback)) throw new SdkConfigError('baseUrl must be https (http only for loopback)');
  if (u.username !== '' || u.password !== '' || u.search !== '' || u.hash !== '') throw new SdkConfigError('baseUrl must not contain credentials, query or fragment');
  return u.href.replace(/\/+$/, '');
}

function rec(v: unknown): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SdkResponseError();
  return v as Record<string, unknown>;
}

function exact(r: Record<string, unknown>, keys: readonly string[]): void {
  const present = Object.keys(r);
  if (present.length !== keys.length || !keys.every((k) => k in r)) throw new SdkResponseError();
}

function int(v: unknown): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) throw new SdkResponseError();
  return v;
}

function str(v: unknown, re: RegExp): string {
  if (typeof v !== 'string' || !re.test(v)) throw new SdkResponseError();
  return v;
}

function parseStatus(v: unknown): InvoiceStatus {
  const r = rec(v);
  exact(r, ['nonce', 'state', 'receivedMinorUnits', 'updatedAt']);
  const state = r['state'];
  if (typeof state !== 'string' || !STATES.includes(state)) throw new SdkResponseError();
  return {
    nonce: str(r['nonce'], NONCE_RE),
    state: state as InvoiceState,
    receivedMinorUnits: str(r['receivedMinorUnits'], DEC_RE),
    updatedAt: int(r['updatedAt']),
  };
}

function parsePayments(v: unknown): readonly PaymentRecord[] {
  const r = rec(v);
  exact(r, ['payments']);
  const list = r['payments'];
  if (!Array.isArray(list) || list.length > 1000) throw new SdkResponseError();
  return (list as unknown[]).map((raw) => {
    const p = rec(raw);
    exact(p, ['id', 'txHash', 'amountMinorUnits', 'confirmations', 'detectedAt']);
    return {
      id: str(p['id'], /^[A-Za-z0-9_-]{1,64}$/),
      txHash: str(p['txHash'], HASH_RE),
      amountMinorUnits: str(p['amountMinorUnits'], DEC_RE),
      confirmations: int(p['confirmations']),
      detectedAt: int(p['detectedAt']),
    };
  });
}

function parseHealth(v: unknown): Health {
  const r = rec(v);
  exact(r, ['status', 'version']);
  if (r['status'] !== 'ok') throw new SdkResponseError();
  return { status: 'ok', version: str(r['version'], /^[0-9A-Za-z.+-]{1,32}$/) };
}

function checkRegister(q: RegisterInvoiceRequest): void {
  if (!NONCE_RE.test(q.nonce)) throw new SdkInputError('nonce');
  if (!Number.isSafeInteger(q.chainId) || q.chainId < 1) throw new SdkInputError('chainId');
  if (!/^[A-Z]{3}$/.test(q.currency)) throw new SdkInputError('currency');
  if (!DEC_RE.test(q.minorUnits)) throw new SdkInputError('minorUnits');
  if (!Number.isSafeInteger(q.expiresAt) || q.expiresAt < 0) throw new SdkInputError('expiresAt');
}

/**
 * Creates the self-hosted merchant API client. Documented in `docs/remote/usability/openapi/ghostpay-merchant-api.yaml`.
 *
 * @remarks No network is touched at creation. Every call needs a configured `baseUrl`;
 * the fetch comes from the caller (or `globalThis.fetch` resolved lazily at call time).
 * Responses are strictly validated; money stays decimal strings.
 *
 * @security The API key is sent only in the `Authorization` header and never appears in
 * events, errors or logs. Invoice fragments and signing keys are never sent: only the public
 * facts in {@link RegisterInvoiceRequest}. Error messages never include response bodies.
 */
export function createMerchantApi(config: MerchantConfig): MerchantApi {
  async function call(method: string, route: string, path: string, body: unknown, options: CallOptions | undefined): Promise<unknown> {
    if (config.baseUrl === undefined) throw new SdkConfigError('baseUrl is required for merchant API calls');
    const doFetch = config.fetch ?? (globalThis as { fetch?: FetchLike }).fetch;
    if (doFetch === undefined) throw new SdkConfigError('no fetch implementation available');
    const headers: Record<string, string> = { accept: 'application/json' };
    if (config.apiKey !== undefined) headers['authorization'] = `Bearer ${config.apiKey}`;
    const init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal } = { method, headers };
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    if (options?.signal !== undefined) init.signal = options.signal;
    config.emitter.emit({ type: 'http.request', at: config.nowMs(), method, route });
    const started = config.nowMs();
    let res: Awaited<ReturnType<FetchLike>>;
    try {
      res = await doFetch(config.baseUrl + path, init);
    } catch {
      const aborted = options?.signal?.aborted === true;
      config.emitter.emit({ type: 'http.error', at: config.nowMs(), route, errorCode: aborted ? 'ABORTED' : 'NETWORK' });
      throw aborted ? new SdkAbortedError() : new SdkNetworkError();
    }
    config.emitter.emit({ type: 'http.response', at: config.nowMs(), route, status: res.status, durationMs: config.nowMs() - started });
    if (!res.ok) throw new SdkHttpError(res.status);
    let text: string;
    try {
      text = await res.text();
      if (text.length > MAX_RESPONSE_CHARS) throw new SdkResponseError();
      return parseStrictJson(text);
    } catch {
      config.emitter.emit({ type: 'http.error', at: config.nowMs(), route, errorCode: 'RESPONSE' });
      throw new SdkResponseError();
    }
  }

  const nonceArg = (n: string): string => {
    if (!NONCE_RE.test(n)) throw new SdkInputError('nonce');
    return n;
  };

  return {
    async health(o) {
      return parseHealth(await call('GET', '/v1/health', '/v1/health', undefined, o));
    },
    async registerInvoice(q, o) {
      checkRegister(q);
      return parseStatus(await call('POST', '/v1/invoices', '/v1/invoices', q, o));
    },
    async getInvoiceStatus(nonce, o) {
      return parseStatus(await call('GET', '/v1/invoices/{nonce}', `/v1/invoices/${nonceArg(nonce)}`, undefined, o));
    },
    async listPayments(nonce, o) {
      return parsePayments(await call('GET', '/v1/invoices/{nonce}/payments', `/v1/invoices/${nonceArg(nonce)}/payments`, undefined, o));
    },
  };
}
