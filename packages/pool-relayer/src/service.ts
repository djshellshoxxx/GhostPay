import { contextOf, type WithdrawProofCalldata, type Withdrawal } from '@ghostpay/pool-sdk';
import { verify as proverVerify, type Groth16Proof } from '@ghostpay/pool-prover';
import { GuardedBreaker, LossBudget, TokenBucketLimiter, classifyRelayOutcome, type RelayResultClass } from '@ghostpay/relayer-guard';
import { getAddress, zeroAddress, type Address, type Hex } from 'viem';
import type { ChainPort } from './chain.js';
import type { PoolEntry, RelayerConfig } from './config.js';
import { RelayerError, SimulationRevert } from './errors.js';
import { nullLogger, type Logger } from './log.js';
import { feeCap, minAcceptableFee, quoteFee } from './quote.js';
import type { QuoteRequest, RelayRequest } from './validate.js';


/** `/v1/info` body. */
export interface InfoResponse {
  readonly chainIds: number[];
  readonly pools: { chainId: number; pool: Address }[];
  readonly relayer: Address;
  readonly feeTo: Address;
  readonly maxFeeBps: number;
  readonly marginBps: number;
  readonly slackBps: number;
  readonly gasEstimate: string;
  readonly version: string;
}

/** Converts calldata-layout proof back to snarkjs JSON for local verification. */
export function toSnarkjsProof(p: WithdrawProofCalldata): Groth16Proof {
  return {
    pi_a: [p.pA[0].toString(), p.pA[1].toString(), '1'],
    pi_b: [
      [p.pB[0][1].toString(), p.pB[0][0].toString()],
      [p.pB[1][1].toString(), p.pB[1][0].toString()],
      ['1', '0'],
    ],
    pi_c: [p.pC[0].toString(), p.pC[1].toString(), '1'],
    protocol: 'groth16',
    curve: 'bn128',
  };
}

/** Local proof check function (default: snarkjs via `@ghostpay/pool-prover`). */
export type ProofVerifier = (proof: Groth16Proof, signals: readonly string[]) => Promise<boolean>;

/** Dependencies of {@link PoolRelayerService}. */
export interface ServiceDeps {
  readonly config: RelayerConfig;
  readonly chains: ReadonlyMap<number, ChainPort>;
  /** Withdraw verification key JSON (from `packages/pool-circuits/vkeys`). */
  readonly vkey?: unknown;
  /** Overrides the local proof check (tests). */
  readonly verifyProof?: ProofVerifier;
  readonly breaker?: GuardedBreaker;
  readonly limiter?: TokenBucketLimiter;
  readonly lossBudget?: LossBudget;
  readonly logger?: Logger;
  readonly receiptTimeoutMs?: number;
}

/** Relay result. */
export interface RelayResult {
  readonly txHash: Hex;
  readonly status: 'confirmed' | 'pending';
}

/** Per-call context supplied by the HTTP layer (or a test). */
export interface CallContext {
  /** Opaque client bucket key (from `relayer-guard` `bucketKey`). Never logged. */
  readonly clientKey: string;
  readonly requestId?: string;
}

/**
 * HTTP-agnostic relayer core (SP-REL-1..3, SP-REL-5).
 *
 * Order of checks in {@link relay}: rate limit, allowlist, relayer/feeTo binding, fee window,
 * deadline, proof/withdrawal consistency, context binding, chain state (root, nullifier), local
 * proof verification, loss budget, breaker, simulation, send. Cheap checks first; the pool's own
 * checks remain the authority, the relayer only avoids spending gas on requests that cannot succeed.
 *
 * @security Never signs anything but `withdraw`. Never stores a request. Logs only allowlisted fields.
 */
export class PoolRelayerService {
  private readonly cfg: RelayerConfig;
  private readonly logger: Logger;
  private readonly breaker: GuardedBreaker;
  private readonly limiter: TokenBucketLimiter;
  private readonly loss: LossBudget;
  private readonly scopes = new Map<string, bigint>();
  private readonly lanes = new Map<number, Promise<unknown>>();

  public constructor(private readonly d: ServiceDeps) {
    this.cfg = d.config;
    this.logger = d.logger ?? nullLogger;
    for (const p of d.config.pools) {
      const c = d.chains.get(p.chainId);
      if (c === undefined || c.chainId !== p.chainId) throw new Error(`no chain port for ${String(p.chainId)}`);
    }
    this.breaker = d.breaker ?? new GuardedBreaker({ windowSize: 20, minSamples: 5, failureRatio: 0.5, cooldownMs: 30_000, probeTimeoutMs: 60_000 });
    this.limiter = d.limiter ?? new TokenBucketLimiter({ ratePerSecond: 1, burst: 20, maxKeys: 10_000 });
    this.loss = d.lossBudget ?? new LossBudget({ windowMs: 3_600_000, perKeyLimit: 10n ** 16n, globalLimit: 10n ** 17n, maxKeys: 10_000 });
  }

  private entry(chainId: number, pool: Address): PoolEntry {
    const p = this.cfg.pools.find((e) => e.chainId === chainId && e.pool === getAddress(pool));
    if (p === undefined) throw new RelayerError(400, 'unknown_pool');
    return p;
  }

  private port(chainId: number): ChainPort {
    /* c8 ignore next */
    return this.d.chains.get(chainId) as ChainPort;
  }

  private take(ctx: CallContext, cost: number): void {
    const t = this.limiter.take(ctx.clientKey, cost);
    if (!t.ok) throw new RelayerError(429, 'rate_limited', Number.isFinite(t.retryAfterMs) ? Math.ceil(t.retryAfterMs / 1000) : 3600);
  }

  /** `/v1/info`. */
  public info(): InfoResponse {
    const first = [...this.d.chains.values()][0] as ChainPort;
    return {
      chainIds: [...new Set(this.cfg.pools.map((p) => p.chainId))],
      pools: this.cfg.pools.map((p) => ({ chainId: p.chainId, pool: p.pool })),
      relayer: first.relayerAddress,
      feeTo: this.cfg.feeTo,
      maxFeeBps: this.cfg.maxFeeBps,
      marginBps: this.cfg.marginBps,
      slackBps: this.cfg.slackBps,
      gasEstimate: this.cfg.gasEstimate.toString(),
      version: this.cfg.version,
    };
  }

  /**
   * Operator probe: trips the breaker when any hot key holds less than `minWei` (it then cannot pay gas and would fail
   * requests one by one). Call periodically from the entry point. Returns true if all keys are funded.
   *
   * @security Based on operator-observed chain state only, never on request content.
   */
  public async checkHotKeys(minWei: bigint): Promise<boolean> {
    for (const c of this.d.chains.values()) {
      let bal: bigint;
      try {
        bal = await c.getBalance();
      } catch {
        this.breaker.trip();
        return false;
      }
      if (bal < minWei) {
        this.breaker.trip();
        return false;
      }
    }
    return true;
  }

  /** `/healthz`. */
  public health(): { status: 'ok' | 'degraded' | 'unhealthy' } {
    const h = this.breaker.health();
    return { status: h };
  }

  /** `/v1/quote`: stateless fee quote. */
  public async quote(q: QuoteRequest, ctx: CallContext): Promise<{ relayer: Address; feeTo: Address; relayerFee: string; deadline: string }> {
    this.take(ctx, 1);
    const pool = this.entry(q.chainId, q.pool);
    const chain = this.port(q.chainId);
    const [gasPrice, ts] = await this.guarded(() => Promise.all([chain.getGasPrice(), chain.blockTimestamp()]));
    if (gasPrice > this.cfg.maxGasPrice) throw new RelayerError(503, 'gas_price_too_high');
    const fee = quoteFee(this.cfg, pool, gasPrice);
    if (fee > feeCap(this.cfg, q.withdrawnValue)) throw new RelayerError(400, 'value_too_small');
    return { relayer: chain.relayerAddress, feeTo: this.cfg.feeTo, relayerFee: fee.toString(), deadline: (ts + BigInt(this.cfg.quoteTtlSeconds)).toString() };
  }

  private async guarded<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof RelayerError) throw e;
      throw new RelayerError(502, 'rpc_error');
    }
  }

  private async scopeOf(chain: ChainPort, pool: Address): Promise<bigint> {
    const k = `${String(chain.chainId)}:${pool}`;
    const hit = this.scopes.get(k);
    if (hit !== undefined) return hit;
    const s = await chain.readScope(pool);
    this.scopes.set(k, s);
    return s;
  }

  /** Serialises send operations per chain so hot-key nonces never collide. */
  private lane<T>(chainId: number, fn: () => Promise<T>): Promise<T> {
    const prev = this.lanes.get(chainId) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    this.lanes.set(chainId, next.catch(() => undefined));
    return next;
  }

  /** `/v1/relay`. */
  public async relay(r: RelayRequest, ctx: CallContext): Promise<RelayResult> {
    const log = (cls: string, extra: { txHash?: Hex } = {}): void => {
      this.logger.log(cls === 'confirmed' ? 'info' : 'warn', 'relay', { chainId: r.chainId, errorClass: cls, ...(ctx.requestId === undefined ? {} : { requestId: ctx.requestId }), ...extra });
    };
    const fail = (status: number, code: string): never => {
      log(code);
      throw new RelayerError(status, code);
    };
    this.take(ctx, 5);
    const entry = this.entry(r.chainId, r.pool);
    const chain = this.port(r.chainId);
    const w: Withdrawal = r.withdrawal;
    const ps = r.proof.pubSignals;
    const [, pNullifier, pValue, pRoot, , pAspEnabled, , , pContext] = ps as readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint];

    if (w.relayer !== chain.relayerAddress) return fail(400, 'wrong_relayer');
    if (w.feeTo !== this.cfg.feeTo) return fail(400, 'wrong_fee_to');
    if (w.recipient === zeroAddress || w.recipient === entry.pool) return fail(400, 'bad_recipient');
    if (w.announce.length > 2 + 2 * 1024) return fail(400, 'announce_too_large');
    if (pAspEnabled > 1n || (pAspEnabled === 0n) !== (w.aspPublisher === zeroAddress)) return fail(400, 'asp_mismatch');
    if (pValue === 0n || w.relayerFee > pValue || w.relayerFee > feeCap(this.cfg, pValue)) return fail(400, 'fee_too_high');

    const [gasPrice, ts, scope] = await this.guarded(() => Promise.all([chain.getGasPrice(), chain.blockTimestamp(), this.scopeOf(chain, entry.pool)]));
    if (gasPrice > this.cfg.maxGasPrice) return fail(503, 'gas_price_too_high');
    if (w.relayerFee < minAcceptableFee(this.cfg, quoteFee(this.cfg, entry, gasPrice))) return fail(400, 'fee_too_low');
    if (w.deadline < ts + BigInt(this.cfg.minDeadlineSeconds)) return fail(400, 'deadline_too_soon');
    if (contextOf(w, scope) !== pContext) return fail(400, 'context_mismatch');

    const [rootOk, spent] = await this.guarded(() => Promise.all([chain.isKnownRoot(entry.pool, pRoot), chain.nullifierSpent(entry.pool, pNullifier)]));
    if (!rootOk) return fail(400, 'unknown_root');
    if (spent) return fail(400, 'nullifier_spent');

    const verifier: ProofVerifier = this.d.verifyProof ?? ((p, s) => proverVerify('withdraw', this.d.vkey, p, s));
    if (!(await verifier(toSnarkjsProof(r.proof), ps.map(String)))) return fail(400, 'invalid_proof');

    if (!this.loss.allows(ctx.clientKey)) return fail(429, 'loss_budget_exhausted');

    return this.lane(r.chainId, async () => {
      const st: { klass: RelayResultClass; tooExpensive?: boolean } = { klass: 'confirmed' };
      let result: RelayResult | undefined;
      let cost = 0n;
      try {
        await this.breaker.run(
          async () => {
            let gasLimit: bigint;
            try {
              ({ gasLimit } = await chain.simulateWithdraw(entry.pool, w, r.proof));
            } catch (e) {
              if (e instanceof SimulationRevert) {
                st.klass = 'simulation_reverted';
                return;
              }
              st.klass = 'rpc_error';
              throw e;
            }
            if (gasLimit > (this.cfg.gasEstimate * BigInt(this.cfg.gasCapBps)) / 10_000n) {
              st.klass = 'simulation_reverted';
              st.tooExpensive = true;
              return;
            }
            let txHash: Hex;
            try {
              txHash = await chain.sendWithdraw(entry.pool, w, r.proof, { gas: gasLimit, gasPrice });
            } catch (e) {
              st.klass = 'send_failed';
              throw e;
            }
            const rc = await chain.waitForReceipt(txHash, this.d.receiptTimeoutMs ?? 60_000);
            if (rc.status === 'reverted') {
              st.klass = 'mined_revert_state_changed';
              cost = rc.costWei;
            } else if (rc.status === 'timeout') {
              st.klass = 'receipt_timeout';
              result = { txHash, status: 'pending' };
              return;
            } else {
              cost = rc.costWei;
            }
            result = { txHash, status: 'confirmed' };
          },
          () => classifyRelayOutcome(st.klass),
        );
      } catch (e) {
        if (e instanceof RelayerError) throw e;
        const open = e instanceof Error && e.name === 'BreakerOpenError';
        log(open ? 'breaker_open' : st.klass);
        throw new RelayerError(open ? 503 : 502, open ? 'breaker_open' : st.klass);
      }
      if (st.tooExpensive === true) return fail(400, 'gas_too_high');
      if (st.klass === 'simulation_reverted') return fail(400, 'simulation_reverted');
      if (st.klass === 'mined_revert_state_changed') {
        this.loss.charge(ctx.clientKey, cost);
        return fail(502, 'mined_revert');
      }
      if (result?.status === 'confirmed') {
        // CONTRACTS-POOLS-02: charge the unreimbursed part (gas paid minus the fee, in wei) of every confirmed relay.
        const feeWei = (w.relayerFee * entry.rate.den) / entry.rate.num;
        if (cost > feeWei) this.loss.charge(ctx.clientKey, cost - feeWei);
      }
      const res = result as RelayResult;
      log(res.status === 'confirmed' ? 'confirmed' : 'receipt_timeout', { txHash: res.txHash });
      return res;
    });
  }
}
