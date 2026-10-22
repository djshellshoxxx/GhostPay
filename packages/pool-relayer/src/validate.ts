import { PoolSdkError, parseAddress, parseChainId, parseProofWire, parseWithdrawalWire, type WithdrawProofCalldata, type Withdrawal } from '@ghostpay/pool-sdk';
import type { Address } from 'viem';
import { invalid } from './errors.js';

/** Parsed `/v1/quote` body. */
export interface QuoteRequest {
  readonly chainId: number;
  readonly pool: Address;
  readonly withdrawnValue: bigint;
}

/** Parsed `/v1/relay` body. */
export interface RelayRequest {
  readonly chainId: number;
  readonly pool: Address;
  readonly withdrawal: Withdrawal;
  readonly proof: WithdrawProofCalldata;
}

function obj(v: unknown): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw invalid('bad_body');
  return v as Record<string, unknown>;
}

function wrap<T>(f: () => T): T {
  try {
    return f();
  } catch (e: unknown) {
    if (e instanceof PoolSdkError) throw invalid(e.code === 'WRONG_CHAIN' ? 'wrong_chain' : 'bad_field');
    throw e;
  }
}

/** Strict parse of a quote request. @throws RelayerError 400. */
export function parseQuoteRequest(body: unknown): QuoteRequest {
  const o = obj(body);
  return wrap(() => {
    const v = o['withdrawnValue'];
    if (typeof v !== 'string' || !/^[1-9][0-9]{0,38}$/.test(v)) throw invalid('bad_field');
    return { chainId: parseChainId(o['chainId']), pool: parseAddress(o['pool'], 'pool'), withdrawnValue: BigInt(v) };
  });
}

/** Strict parse of a relay request. @throws RelayerError 400. */
export function parseRelayRequest(body: unknown): RelayRequest {
  const o = obj(body);
  return wrap(() => ({
    chainId: parseChainId(o['chainId']),
    pool: parseAddress(o['pool'], 'pool'),
    withdrawal: parseWithdrawalWire(o['withdrawal']),
    proof: parseProofWire(o['proof'], 9),
  }));
}
