import { fail, type ExitTransport } from '@ghostpay/external-pools';
import { isAddress, type Address, type Hex } from 'viem';
import type { ProofBundle } from './types.js';

const MAX_BODY = 64 * 1024;
const DEC = /^\d{1,78}$/;
const HEX = /^0x(?:[0-9a-fA-F]{2})*$/;

/** `GET /relayer/details` response (upstream `DetailsMarshall`). */
export interface RelayerDetails {
  readonly feeBPS: bigint;
  readonly feeReceiverAddress: Address;
  readonly chainId?: number;
  readonly assetAddress?: Address;
  readonly minWithdrawAmount?: bigint;
  readonly maxGasPrice?: bigint | null;
}

/** Signed fee commitment inside a quote (upstream `FeeCommitment`). */
export interface FeeCommitment {
  readonly expiration: number;
  readonly withdrawalData: Hex;
  readonly asset: Address;
  readonly signedRelayerCommitment: Hex;
  readonly extraGas: boolean;
  readonly amount: bigint;
}

/** `POST /relayer/quote` response (upstream `QuoteMarshall`). */
export interface RelayerQuote {
  readonly baseFeeBPS: bigint;
  readonly feeBPS: bigint;
  readonly gasPrice: bigint;
  readonly feeCommitment?: FeeCommitment;
}

/** `POST /relayer/request` response (upstream `RelayerResponse`). */
export interface RelayerResult {
  readonly success: boolean;
  readonly timestamp?: number;
  readonly requestId?: string;
  readonly txHash?: Hex;
  readonly txSwap?: Hex;
  readonly error?: string;
}

/** Body of `POST /relayer/request` (upstream `zRelayRequest`, strict). */
export interface RelayRequestBody {
  readonly chainId: number;
  readonly scope: bigint;
  readonly withdrawal: { readonly processooor: Address; readonly data: Hex };
  readonly proof: ProofBundle['proof'];
  readonly publicSignals: readonly string[];
  readonly feeCommitment?: FeeCommitment;
}

function drift(what: string): never {
  return fail('RELAYER_SCHEMA_DRIFT', `relayer response ${what}`);
}

function obj(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return drift(`${what} is not an object`);
  return v as Record<string, unknown>;
}

function only(o: Record<string, unknown>, known: readonly string[], what: string): void {
  for (const k of Object.keys(o)) if (!known.includes(k)) drift(`${what} has unknown field ${k}`);
}

function uint(v: unknown, what: string): bigint {
  if (typeof v === 'string' && DEC.test(v)) return BigInt(v);
  if (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0) return BigInt(v);
  return drift(`${what} is not an unsigned integer`);
}

function addr(v: unknown, what: string): Address {
  if (typeof v !== 'string' || !isAddress(v, { strict: false })) return drift(`${what} is not an address`);
  return v;
}

function hex(v: unknown, what: string): Hex {
  if (typeof v !== 'string' || !HEX.test(v)) return drift(`${what} is not hex`);
  return v as Hex;
}

/**
 * Strict parser for `/relayer/details`.
 *
 * @throws ExternalPoolError RELAYER_SCHEMA_DRIFT on any shape difference, unknown top-level field included (EP-PP-8).
 */
export function parseDetails(raw: unknown): RelayerDetails {
  const o = obj(raw, 'details');
  only(o, ['feeBPS', 'feeReceiverAddress', 'chainId', 'assetAddress', 'minWithdrawAmount', 'maxGasPrice'], 'details');
  const out: { -readonly [K in keyof RelayerDetails]: RelayerDetails[K] } = {
    feeBPS: uint(o['feeBPS'], 'feeBPS'),
    feeReceiverAddress: addr(o['feeReceiverAddress'], 'feeReceiverAddress'),
  };
  if (o['chainId'] !== undefined) {
    if (typeof o['chainId'] !== 'number' || !Number.isSafeInteger(o['chainId'])) return drift('chainId is not an integer');
    out.chainId = o['chainId'];
  }
  if (o['assetAddress'] !== undefined) out.assetAddress = addr(o['assetAddress'], 'assetAddress');
  if (o['minWithdrawAmount'] !== undefined) out.minWithdrawAmount = uint(o['minWithdrawAmount'], 'minWithdrawAmount');
  if (o['maxGasPrice'] !== undefined) out.maxGasPrice = o['maxGasPrice'] === null ? null : uint(o['maxGasPrice'], 'maxGasPrice');
  return out;
}

function parseFeeCommitment(raw: unknown): FeeCommitment {
  const o = obj(raw, 'feeCommitment');
  only(o, ['expiration', 'withdrawalData', 'asset', 'signedRelayerCommitment', 'extraGas', 'amount'], 'feeCommitment');
  const exp = o['expiration'];
  if (typeof exp !== 'number' || !Number.isSafeInteger(exp) || exp < 0) return drift('expiration is not a non-negative integer');
  if (typeof o['extraGas'] !== 'boolean') return drift('extraGas is not a boolean');
  return {
    expiration: exp,
    withdrawalData: hex(o['withdrawalData'], 'withdrawalData'),
    asset: addr(o['asset'], 'asset'),
    signedRelayerCommitment: hex(o['signedRelayerCommitment'], 'signedRelayerCommitment'),
    extraGas: o['extraGas'],
    amount: uint(o['amount'], 'amount'),
  };
}

/**
 * Strict parser for `/relayer/quote`.
 *
 * @throws ExternalPoolError RELAYER_SCHEMA_DRIFT.
 */
export function parseQuote(raw: unknown): RelayerQuote {
  const o = obj(raw, 'quote');
  only(o, ['baseFeeBPS', 'feeBPS', 'gasPrice', 'feeCommitment', 'detail'], 'quote');
  if (o['detail'] !== undefined) obj(o['detail'], 'detail');
  const q: RelayerQuote = {
    baseFeeBPS: uint(o['baseFeeBPS'], 'baseFeeBPS'),
    feeBPS: uint(o['feeBPS'], 'feeBPS'),
    gasPrice: uint(o['gasPrice'], 'gasPrice'),
  };
  return o['feeCommitment'] === undefined ? q : { ...q, feeCommitment: parseFeeCommitment(o['feeCommitment']) };
}

/**
 * Strict parser for `/relayer/request`.
 *
 * @throws ExternalPoolError RELAYER_SCHEMA_DRIFT.
 */
export function parseResult(raw: unknown): RelayerResult {
  const o = obj(raw, 'result');
  only(o, ['success', 'timestamp', 'requestId', 'txHash', 'txSwap', 'error'], 'result');
  if (typeof o['success'] !== 'boolean') return drift('success is not a boolean');
  const r: { -readonly [K in keyof RelayerResult]: RelayerResult[K] } = { success: o['success'] };
  if (o['timestamp'] !== undefined) {
    if (typeof o['timestamp'] !== 'number') return drift('timestamp is not a number');
    r.timestamp = o['timestamp'];
  }
  if (o['requestId'] !== undefined) {
    if (typeof o['requestId'] !== 'string' || o['requestId'].length > 100) return drift('requestId is not a short string');
    r.requestId = o['requestId'];
  }
  if (o['txHash'] !== undefined) {
    const h = hex(o['txHash'], 'txHash');
    if (h.length !== 66) return drift('txHash is not 32 bytes');
    r.txHash = h;
  }
  if (o['txSwap'] !== undefined) r.txSwap = hex(o['txSwap'], 'txSwap');
  if (o['error'] !== undefined) {
    if (typeof o['error'] !== 'string') return drift('error is not a string');
    r.error = o['error'].slice(0, 200);
  }
  return r;
}

/** Options for {@link RelayerClient}. */
export interface RelayerClientOptions {
  readonly transport: ExitTransport;
  readonly baseUrl: string;
  /** Base URLs from the pinned manifest (EP-GEN-3). */
  readonly allowed: readonly string[];
  /** Developer flag (EP-PP-9); default false. */
  readonly allowCustomRelayer?: boolean;
  readonly timeoutMs?: number;
}

function normUrl(u: string): string {
  let url: URL;
  try {
    url = new URL(u);
  } catch {
    return fail('RELAYER_NOT_ALLOWED', 'relayer URL is not a URL');
  }
  if (url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') return fail('RELAYER_NOT_ALLOWED', 'relayer URL has credentials, query or fragment');
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

/**
 * HTTP client for the Privacy Pools reference relayer API (`packages/relayer`, retrieved 2026-10-21).
 *
 * @security Contacts only manifest hosts (EP-PP-9), uses only the injected `fetch` (EP-GEN-2), caps response size,
 *   and parses every response with a strict schema (EP-PP-8). Error bodies are never echoed.
 */
export class RelayerClient {
  private readonly base: string;
  private readonly timeout: number;

  /** @throws ExternalPoolError RELAYER_NOT_ALLOWED when the URL is not a manifest relayer and custom relayers are off. */
  public constructor(private readonly o: RelayerClientOptions) {
    this.base = normUrl(o.baseUrl);
    if (o.allowCustomRelayer !== true && !o.allowed.map(normUrl).includes(this.base)) fail('RELAYER_NOT_ALLOWED', 'relayer is not in the pinned manifest');
    this.timeout = o.timeoutMs ?? 15_000;
  }

  private async send(path: string, init: { method: 'GET' | 'POST'; body?: string }): Promise<unknown> {
    const res = await this.o.transport.fetch(`${this.base}${path}`, {
      method: init.method,
      headers: init.body === undefined ? { accept: 'application/json' } : { accept: 'application/json', 'content-type': 'application/json' },
      ...(init.body === undefined ? {} : { body: init.body }),
      redirect: 'error',
      signal: AbortSignal.timeout(this.timeout),
    });
    const text = await res.text();
    if (text.length > MAX_BODY) return drift('is too large');
    if (!res.ok) return fail('RELAYER_REJECTED', `relayer answered HTTP ${String(res.status)}`);
    try {
      return JSON.parse(text);
    } catch {
      return drift('is not JSON');
    }
  }

  /** `GET /relayer/details?chainId&assetAddress`. */
  public async details(chainId: number, asset: Address): Promise<RelayerDetails> {
    return parseDetails(await this.send(`/relayer/details?chainId=${String(chainId)}&assetAddress=${asset}`, { method: 'GET' }));
  }

  /** `POST /relayer/quote` with a recipient, so the relayer returns a signed fee commitment. */
  public async quote(chainId: number, amount: bigint, asset: Address, recipient: Address): Promise<RelayerQuote> {
    const body = JSON.stringify({ chainId, amount: amount.toString(), asset, recipient, extraGas: false });
    return parseQuote(await this.send('/relayer/quote', { method: 'POST', body }));
  }

  /** `POST /relayer/request`. */
  public async request(b: RelayRequestBody): Promise<RelayerResult> {
    const body = JSON.stringify({
      chainId: b.chainId,
      scope: b.scope.toString(),
      withdrawal: b.withdrawal,
      proof: b.proof,
      publicSignals: b.publicSignals,
      ...(b.feeCommitment === undefined ? {} : { feeCommitment: { ...b.feeCommitment, amount: b.feeCommitment.amount.toString() } }),
    });
    return parseResult(await this.send('/relayer/request', { method: 'POST', body }));
  }
}
