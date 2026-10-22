import type { Address, Hex } from 'viem';
import { getAddress } from 'viem';
import { assertPoolChain } from './chain.js';
import { PoolSdkError, fail } from './errors.js';
import { parseAddress, proofToWire, withdrawalToWire, type WithdrawProofCalldata } from './wire.js';
import type { Withdrawal } from './withdrawal.js';

/** `GET /v1/info` response. */
export interface RelayerInfo {
  readonly chainIds: readonly number[];
  readonly pools: readonly { readonly chainId: number; readonly pool: Address }[];
  readonly relayer: Address;
  readonly feeTo: Address;
  readonly maxFeeBps: number;
  readonly version: string;
}

/** `POST /v1/quote` response. */
export interface RelayerQuote {
  readonly relayer: Address;
  readonly feeTo: Address;
  readonly relayerFee: bigint;
  readonly deadline: bigint;
}

/** Minimal fetch type. */
export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{ status: number; text(): Promise<string> }>;

function parseUrl(s: string): URL {
  try {
    return new URL(s);
  } catch {
    return fail('INVALID_INPUT', 'relayer url is not a URL');
  }
}

const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/;

/**
 * HTTP client for `packages/pool-relayer`.
 *
 * @security Sends only chain, pool, the withdrawal struct and the proof (public data). It never
 *   accepts or sends notes, seeds, nullifiers or secrets: the types do not allow them (SP-SDK-2).
 *   Plain `http` is accepted only for loopback hosts.
 */
export class PoolRelayerClient {
  private readonly base: string;
  private readonly fetchFn: FetchLike;
  private readonly timeoutMs: number;

  public constructor(baseUrl: string, opts: { fetch?: FetchLike; timeoutMs?: number } = {}) {
    const u = parseUrl(baseUrl);
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && LOCAL.test(u.hostname))) fail('INVALID_INPUT', 'relayer url must be https (or http on loopback)');
    if (u.username !== '' || u.password !== '') fail('INVALID_INPUT', 'relayer url must not contain credentials');
    this.base = u.origin;
    this.fetchFn = opts.fetch ?? ((url, init) => fetch(url, init));
    this.timeoutMs = opts.timeoutMs ?? 30_000;
  }

  private async call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<unknown> {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), this.timeoutMs);
    try {
      const init = { method, headers: { 'content-type': 'application/json' }, signal: ctl.signal, ...(body === undefined ? {} : { body: JSON.stringify(body) }) };
      const res = await this.fetchFn(this.base + path, init);
      const text = await res.text();
      let j: unknown;
      try {
        j = JSON.parse(text);
      } catch {
        return fail('RELAYER_ERROR', `relayer returned non-JSON (status ${String(res.status)})`);
      }
      if (res.status !== 200) {
        const e = typeof j === 'object' && j !== null ? (j as { error?: unknown }).error : undefined;
        const inner = typeof e === 'object' && e !== null ? (e as { code?: unknown }).code : e;
        const code = typeof inner === 'string' ? inner : 'error';
        return fail('RELAYER_ERROR', `relayer refused: ${code.slice(0, 64)}`);
      }
      return j;
    } catch (e) {
      if (e instanceof PoolSdkError) throw e;
      return fail('RELAYER_ERROR', 'relayer request failed');
    } finally {
      clearTimeout(t);
    }
  }

  /** Fetches relayer parameters. */
  public async info(): Promise<RelayerInfo> {
    const o = (await this.call('GET', '/v1/info')) as Record<string, unknown>;
    const pools = o['pools'];
    if (!Array.isArray(pools) || !Array.isArray(o['chainIds']) || typeof o['maxFeeBps'] !== 'number' || typeof o['version'] !== 'string') return fail('RELAYER_ERROR', 'bad /v1/info');
    const chainIds = (o['chainIds'] as unknown[]).map((c) => {
      if (typeof c !== 'number') return fail('RELAYER_ERROR', 'bad chain id');
      assertPoolChain(c);
      return c;
    });
    return {
      chainIds,
      pools: pools.map((p: { chainId?: unknown; pool?: unknown }) => {
        if (typeof p.chainId !== 'number') return fail('RELAYER_ERROR', 'bad pool entry');
        assertPoolChain(p.chainId);
        return { chainId: p.chainId, pool: parseAddress(p.pool, 'pool') };
      }),
      relayer: parseAddress(o['relayer'], 'relayer'),
      feeTo: parseAddress(o['feeTo'], 'feeTo'),
      maxFeeBps: o['maxFeeBps'],
      version: o['version'],
    };
  }

  /** Requests a fee quote. */
  public async quote(chainId: number, pool: Address, withdrawnValue: bigint): Promise<RelayerQuote> {
    assertPoolChain(chainId);
    const o = (await this.call('POST', '/v1/quote', { chainId, pool: getAddress(pool), withdrawnValue: withdrawnValue.toString() })) as Record<string, unknown>;
    if (typeof o['relayerFee'] !== 'string' || typeof o['deadline'] !== 'string' || !/^[0-9]{1,78}$/.test(o['relayerFee']) || !/^[0-9]{1,20}$/.test(o['deadline'])) return fail('RELAYER_ERROR', 'bad quote');
    return { relayer: parseAddress(o['relayer'], 'relayer'), feeTo: parseAddress(o['feeTo'], 'feeTo'), relayerFee: BigInt(o['relayerFee']), deadline: BigInt(o['deadline']) };
  }

  /** Submits a withdrawal for relaying. @returns The transaction hash. */
  public async relay(chainId: number, pool: Address, withdrawal: Withdrawal, proof: WithdrawProofCalldata): Promise<Hex> {
    assertPoolChain(chainId);
    const o = (await this.call('POST', '/v1/relay', { chainId, pool: getAddress(pool), withdrawal: withdrawalToWire(withdrawal), proof: proofToWire(proof) })) as Record<string, unknown>;
    const h = o['txHash'];
    if (typeof h !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(h)) return fail('RELAYER_ERROR', 'bad txHash');
    return h as Hex;
  }
}
