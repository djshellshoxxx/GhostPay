import {
  getAddress,
  isAddressEqual,
  keccak256,
  recoverMessageAddress,
  toEventSelector,
  type Address,
  type Hex,
} from 'viem';
import { recoverAuthorizationAddress } from 'viem/utils';
import { GuardedBreaker, LossBudget, TokenBucketLimiter, classifyRelayOutcome, type RelayResultClass } from '@ghostpay/relayer-guard';
import { assertTestnet } from '../chainGuard.js';
import { PayerSponsorError } from '../errors.js';
import { encodeDelegatePay } from '../eip7702/intent.js';
import { buildInitCode, encodeFactoryGetAddress } from '../erc4337/account.js';
import {
  DUMMY_PAYMASTER_SIGNATURE,
  decodePaymasterAndData,
  encodePaymasterAndData,
  paymasterSignedHash,
  withPaymasterSignature,
  type PaymasterParams,
} from '../erc4337/paymaster.js';
import {
  assertPayerCalls,
  decodeExecuteBatch,
  encodeHandleOps,
  unpackUint128Pair,
  type PackedUserOperation,
} from '../erc4337/userop.js';
import { encodeRelayPay } from '../relay/intent.js';
import { decodeAndCheckPayload, type RouterTarget } from '../routerTargets.js';
import { ceilDiv, roundUpSigFigs } from '../util.js';
import { latencyBucket, type SponsorLogEntry } from './log.js';
import type {
  ChainSponsorConfig,
  ClientContext,
  Eip7702SubmitRequest,
  PaymasterSigner,
  PriceSource,
  Quote,
  QuoteRequest,
  ReceiptLog,
  RelaySubmitRequest,
  SponsorCall,
  SponsoredMode,
  SponsorUserOpRequest,
  SponsorUserOpResponse,
  SubmitResult,
  SubmitUserOpRequest,
} from './types.js';

/** Default gas units per mode used for the fee estimate (testnet measurements are not available; tune on a real chain). */
export const DEFAULT_GAS_UNITS: Readonly<Record<SponsoredMode, bigint>> = {
  'permit-relay': 300_000n,
  'eip7702-sponsored': 350_000n,
  'erc4337-paymaster': 800_000n,
};

/** Service tunables and collaborators. */
export interface SponsorServiceOptions {
  readonly chains: readonly ChainSponsorConfig[];
  readonly price: PriceSource;
  /** Safety margin over the estimated gas cost, in basis points (SP-REQ-1). */
  readonly safetyBps: number;
  readonly gasUnits?: Partial<Record<SponsoredMode, bigint>>;
  readonly quoteTtlMs: number;
  readonly maxQuotes: number;
  /** Most open quotes one client bucket may hold (default 5): stops one client filling the table. */
  readonly maxQuotesPerBucket?: number;
  /** Largest allowed distance between now and an intent deadline. */
  readonly maxDeadlineSeconds: number;
  /** Fee rounding grid in significant figures (default 2). */
  readonly feeSigFigs?: number;
  /** PH-4: signs paymaster hashes; and the address it signs as (the paymaster's verifying signer). */
  readonly paymasterSigner?: PaymasterSigner;
  readonly paymasterSignerAddress?: Address;
  /** PH-4 per-operation caps. */
  readonly maxVerificationGas?: bigint;
  readonly maxCallGas?: bigint;
  readonly maxOpCostWei?: bigint;
  readonly limiter: TokenBucketLimiter;
  readonly breaker: GuardedBreaker;
  readonly loss: LossBudget;
  /** Epoch milliseconds. */
  readonly now?: () => number;
  /** Cryptographic randomness source. */
  readonly randomBytes?: (n: number) => Uint8Array;
  readonly log: (entry: SponsorLogEntry) => void;
}

interface StoredQuote {
  readonly mode: SponsoredMode;
  readonly chainId: number;
  readonly token: Address;
  readonly gross: bigint;
  readonly sponsorFee: bigint;
  readonly sponsorFeeTo: Address;
  readonly expiresAt: number;
  readonly bucket: string;
  /** PH-4 only: at most one paymaster authorisation per quote. */
  sponsored: boolean;
}

const TRANSFER_TOPIC = toEventSelector('Transfer(address,address,uint256)');
const BPS = 10_000n;
const WEI = 10n ** 18n;

/**
 * Testnet gas sponsor core for the payer-hiding modes (PH-2, PH-3, PH-4). Transport-agnostic.
 *
 * Every entry point refuses non-testnet chain ids, applies the per-client token bucket, the breaker
 * and the loss budget from `@ghostpay/relayer-guard`, validates the request against the signed
 * intent and the stored quote, simulates before sending, and logs only a field allowlist.
 *
 * @security The sponsor sees payer, stealth, token, amount, client network bucket and timing (spec
 *   N3). It never signs or broadcasts anything that does not match a payer-signed intent whose router
 *   calldata passes the review step (PH-GEN-6). It holds a testnet hot key only. It does not hide
 *   the payer from a chain analyst. Quotes live in process memory (single instance).
 */
export class SponsorService {
  private readonly chains = new Map<number, ChainSponsorConfig>();
  private readonly quotes = new Map<string, StoredQuote>();
  private readonly now: () => number;
  private readonly rand: (n: number) => Uint8Array;

  /**
   * @param o Options (validated).
   * @throws PayerSponsorError `MAINNET_FORBIDDEN` or `INVALID_ARGUMENT` on a bad configuration.
   */
  public constructor(private readonly o: SponsorServiceOptions) {
    if (o.chains.length === 0) throw new PayerSponsorError('INVALID_ARGUMENT', 'at least one chain required');
    for (const c of o.chains) {
      assertTestnet(c.chain.chainId);
      if (c.deployment.chainId !== c.chain.chainId) {
        throw new PayerSponsorError('MANIFEST_MISMATCH', 'deployment chain id differs from the chain');
      }
      if (this.chains.has(c.chain.chainId)) throw new PayerSponsorError('INVALID_ARGUMENT', 'duplicate chain');
      this.chains.set(c.chain.chainId, c);
    }
    const bad =
      !Number.isInteger(o.safetyBps) || o.safetyBps < 0 || o.safetyBps > 10_000 ||
      !(o.quoteTtlMs > 0) || !Number.isInteger(o.maxQuotes) || o.maxQuotes < 1 || !(o.maxDeadlineSeconds > 0);
    if (bad) throw new PayerSponsorError('INVALID_ARGUMENT', 'invalid sponsor options');
    this.now = o.now ?? Date.now;
    this.rand = o.randomBytes ?? ((n) => crypto.getRandomValues(new Uint8Array(n)));
  }

  /** @returns Chain ids served and the breaker health, for `GET /v1/health` (no secrets). */
  public health(): { readonly chains: readonly number[]; readonly breaker: 'ok' | 'degraded' | 'unhealthy' } {
    return { chains: [...this.chains.keys()], breaker: this.o.breaker.health() };
  }

  /**
   * Quote the sponsor fee (SP-REQ-1): at least the estimated gas cost times `1 + safetyBps`, converted
   * to token units, rounded up to a coarse grid so the public fee does not leak the estimate.
   *
   * @param ctx Client context.
   * @param req Quote request.
   * @returns Quote with a random id (not derived from payer or client).
   * @throws PayerSponsorError `MAINNET_FORBIDDEN`, `RATE_LIMITED`, `BAD_REQUEST`, `UNAVAILABLE`.
   */
  public async quote(ctx: ClientContext, req: QuoteRequest): Promise<Quote> {
    const started = this.now();
    return this.guarded(req.mode, req.chainId, started, async () => {
      assertTestnet(req.chainId);
      const cfg = this.chainConfig(req.chainId);
      this.takeToken(ctx);
      if (!cfg.tokens.some((t) => isAddressEqual(t, req.token))) throw new PayerSponsorError('BAD_REQUEST', 'token not accepted');
      if (req.gross <= 0n) throw new PayerSponsorError('BAD_REQUEST', 'gross must be > 0');
      this.assertModeConfigured(cfg, req.mode);
      this.pruneQuotes();
      if (this.quotes.size >= this.o.maxQuotes) throw new PayerSponsorError('RATE_LIMITED', 'too many open quotes');
      let mine = 0;
      for (const q of this.quotes.values()) if (q.bucket === ctx.bucket) mine++;
      if (mine >= (this.o.maxQuotesPerBucket ?? 5)) throw new PayerSponsorError('RATE_LIMITED', 'too many open quotes for this client');
      const units = this.o.gasUnits?.[req.mode] ?? DEFAULT_GAS_UNITS[req.mode];
      const gasPrice = await cfg.chain.gasPrice();
      const perEth = await this.o.price(req.chainId, req.token);
      if (perEth <= 0n) throw new PayerSponsorError('UNAVAILABLE', 'no price');
      const costWei = ceilDiv(units * gasPrice * (BPS + BigInt(this.o.safetyBps)), BPS);
      const feeExact = ceilDiv(costWei * perEth, WEI);
      const sponsorFee = roundUpSigFigs(feeExact, this.o.feeSigFigs ?? 2);
      if (sponsorFee >= req.gross) throw new PayerSponsorError('BAD_REQUEST', 'amount too small for the sponsor fee');
      const quoteId = toHex(this.rand(16));
      const expiresAt = this.now() + this.o.quoteTtlMs;
      this.quotes.set(quoteId, {
        mode: req.mode,
        chainId: req.chainId,
        token: getAddress(req.token),
        gross: req.gross,
        sponsorFee,
        sponsorFeeTo: cfg.sponsorFeeTo,
        expiresAt,
        bucket: ctx.bucket,
        sponsored: false,
      });
      return { value: { quoteId, sponsorFee, sponsorFeeTo: cfg.sponsorFeeTo, expiresAt } };
    });
  }

  /**
   * PH-2: submit a payer-signed relay order.
   *
   * @param ctx Client context.
   * @param req Order, calldata, signature and permit.
   * @returns The transaction hash.
   */
  public async submitRelay(ctx: ClientContext, req: RelaySubmitRequest): Promise<SubmitResult> {
    const started = this.now();
    return this.guarded('permit-relay', req.chainId, started, async () => {
      assertTestnet(req.chainId);
      const cfg = this.chainConfig(req.chainId);
      this.takeToken(ctx);
      const relay = cfg.deployment.relay;
      if (relay === undefined) throw new PayerSponsorError('MODE_UNAVAILABLE', 'relay not deployed on this chain');
      const q = this.openQuote(req.quoteId, 'permit-relay', req.chainId);
      const i = req.intent;
      this.checkOrder(cfg, q, req.router, req.routerCalldata, i, i.payloadHash, req.sig);
      if (isAddressEqual(i.payer, cfg.chain.sponsorAddress)) throw new PayerSponsorError('BAD_REQUEST', 'payer must not be the sponsor');
      const data = encodeRelayPay(i, req.routerCalldata, req.sig, req.permit);
      return this.execute(ctx, cfg, 'permit-relay', { to: relay, data }, req.quoteId, { token: q.token, to: q.sponsorFeeTo, value: req.intent.sponsorFee });
    });
  }

  /**
   * PH-3: submit a payer-signed delegate order with its EIP-7702 authorization in a type-4 transaction.
   *
   * @param ctx Client context.
   * @param req Order, calldata, signature and signed authorization.
   * @returns The transaction hash.
   */
  public async submitEip7702(ctx: ClientContext, req: Eip7702SubmitRequest): Promise<SubmitResult> {
    const started = this.now();
    return this.guarded('eip7702-sponsored', req.chainId, started, async () => {
      assertTestnet(req.chainId);
      const cfg = this.chainConfig(req.chainId);
      this.takeToken(ctx);
      const delegate = cfg.deployment.delegate;
      if (cfg.deployment.supports7702 !== true) throw new PayerSponsorError('NO_7702', 'chain is not marked as EIP-7702 capable');
      if (delegate === undefined) throw new PayerSponsorError('MODE_UNAVAILABLE', 'delegate not deployed on this chain');
      const q = this.openQuote(req.quoteId, 'eip7702-sponsored', req.chainId);
      const a = req.authorization;
      if (a.chainId !== req.chainId || !isAddressEqual(a.address, delegate)) {
        throw new PayerSponsorError('BAD_REQUEST', 'authorization must name this chain and the manifest delegate');
      }
      let signer: Address;
      try {
        signer = await recoverAuthorizationAddress({
          authorization: { address: a.address, chainId: a.chainId, nonce: a.nonce, r: a.r, s: a.s, yParity: a.yParity },
        });
      } catch {
        throw new PayerSponsorError('BAD_REQUEST', 'authorization signature invalid');
      }
      if (!isAddressEqual(signer, req.payer)) throw new PayerSponsorError('BAD_REQUEST', 'authorization is not signed by the payer');
      if (isAddressEqual(req.payer, cfg.chain.sponsorAddress)) throw new PayerSponsorError('BAD_REQUEST', 'payer must not be the sponsor');
      this.checkOrder(cfg, q, req.router, req.routerCalldata, req.intent, req.intent.payloadHash, req.sig);
      const data = encodeDelegatePay(req.intent, req.routerCalldata, req.sig);
      return this.execute(ctx, cfg, 'eip7702-sponsored', { to: req.payer, data, authorizationList: [a] }, req.quoteId, { token: q.token, to: q.sponsorFeeTo, value: req.intent.sponsorFee });
    });
  }

  /**
   * PH-4 step 1: review an unsigned operation and, if it is exactly the expected payment batch from a
   * fresh account of `owner`, sign paymaster authorisation (once per quote).
   *
   * @param ctx Client context.
   * @param req Operation and the fields it must match.
   * @returns `paymasterAndData` to place into the operation before the owner signs it.
   */
  public async sponsorUserOp(ctx: ClientContext, req: SponsorUserOpRequest): Promise<SponsorUserOpResponse> {
    const started = this.now();
    return this.guarded('erc4337-paymaster', req.chainId, started, async () => {
      assertTestnet(req.chainId);
      const cfg = this.chainConfig(req.chainId);
      this.takeToken(ctx);
      const q = this.openQuote(req.quoteId, 'erc4337-paymaster', req.chainId);
      const pm = await this.checkUserOp(cfg, q, req);
      if (q.sponsored) throw new PayerSponsorError('QUOTE_UNKNOWN', 'quote already used for a paymaster authorisation');
      const signer = this.o.paymasterSigner;
      if (signer === undefined) throw new PayerSponsorError('MODE_UNAVAILABLE', 'paymaster signer not configured');
      const validUntil = BigInt(Math.floor(q.expiresAt / 1000));
      const params: PaymasterParams = {
        paymaster: pm.paymaster,
        verificationGasLimit: 200_000n,
        postOpGasLimit: 50_000n,
        validUntil,
        validAfter: 0n,
      };
      const draft: PackedUserOperation = { ...req.userOp, paymasterAndData: encodePaymasterAndData(params, DUMMY_PAYMASTER_SIGNATURE) };
      const signature = await signer(paymasterSignedHash(draft, params, req.chainId));
      q.sponsored = true;
      return { value: { paymasterAndData: encodePaymasterAndData(params, signature), validUntil } };
    });
  }

  /**
   * PH-4 step 2: verify the signed, sponsored operation again and send it through `handleOps` with the
   * sponsor as beneficiary.
   *
   * @param ctx Client context.
   * @param req Signed operation.
   * @returns The transaction hash.
   */
  public async submitUserOp(ctx: ClientContext, req: SubmitUserOpRequest): Promise<SubmitResult> {
    const started = this.now();
    return this.guarded('erc4337-paymaster', req.chainId, started, async () => {
      assertTestnet(req.chainId);
      const cfg = this.chainConfig(req.chainId);
      this.takeToken(ctx);
      const q = this.openQuote(req.quoteId, 'erc4337-paymaster', req.chainId);
      const pm = await this.checkUserOp(cfg, q, req);
      const decoded = decodePaymasterAndData(req.userOp.paymasterAndData);
      if (!isAddressEqual(decoded.paymaster, pm.paymaster) || decoded.validUntil * 1000n <= BigInt(this.now())) {
        throw new PayerSponsorError('BAD_REQUEST', 'paymaster data is not ours or has expired');
      }
      const expected = this.o.paymasterSignerAddress;
      if (expected === undefined) throw new PayerSponsorError('MODE_UNAVAILABLE', 'paymaster signer not configured');
      const hash = paymasterSignedHash(withPaymasterSignature(req.userOp, decoded, DUMMY_PAYMASTER_SIGNATURE), decoded, req.chainId);
      let recovered: Address;
      try {
        recovered = await recoverMessageAddress({ message: { raw: hash }, signature: decoded.signature });
      } catch {
        throw new PayerSponsorError('BAD_REQUEST', 'paymaster signature invalid');
      }
      if (!isAddressEqual(recovered, expected)) throw new PayerSponsorError('BAD_REQUEST', 'paymaster signature is not ours');
      if (req.userOp.signature.length !== 132) throw new PayerSponsorError('BAD_REQUEST', 'owner signature must be 65 bytes');
      const data = encodeHandleOps(req.userOp, cfg.chain.sponsorAddress);
      return this.execute(ctx, cfg, 'erc4337-paymaster', { to: pm.entryPoint, data }, req.quoteId, { token: q.token, to: q.sponsorFeeTo, value: req.sponsorFee });
    });
  }

  // ---------- validation ----------

  private chainConfig(chainId: number): ChainSponsorConfig {
    const c = this.chains.get(chainId);
    if (c === undefined) throw new PayerSponsorError('BAD_REQUEST', 'chain not served');
    return c;
  }

  private assertModeConfigured(cfg: ChainSponsorConfig, mode: SponsoredMode): void {
    const d = cfg.deployment;
    const ok =
      mode === 'permit-relay'
        ? d.relay !== undefined
        : mode === 'eip7702-sponsored'
          ? d.delegate !== undefined && d.supports7702 === true
          : d.entryPoint !== undefined && d.accountFactory !== undefined && d.paymaster !== undefined;
    if (!ok) throw new PayerSponsorError('MODE_UNAVAILABLE', 'mode is not deployed on this chain');
  }

  private takeToken(ctx: ClientContext): void {
    if (!this.o.limiter.take(ctx.bucket).ok) throw new PayerSponsorError('RATE_LIMITED', 'rate limit');
  }

  private pruneQuotes(): void {
    const t = this.now();
    for (const [id, q] of this.quotes) if (q.expiresAt <= t) this.quotes.delete(id);
  }

  private openQuote(id: string, mode: SponsoredMode, chainId: number): StoredQuote {
    const q = this.quotes.get(id);
    if (q === undefined || q.mode !== mode || q.chainId !== chainId) throw new PayerSponsorError('QUOTE_UNKNOWN', 'unknown quote');
    if (q.expiresAt <= this.now()) {
      this.quotes.delete(id);
      throw new PayerSponsorError('QUOTE_EXPIRED', 'quote expired');
    }
    return q;
  }

  /** Shared order checks of PH-2 and PH-3 (PH-GEN-6). */
  private checkOrder(
    cfg: ChainSponsorConfig,
    q: StoredQuote,
    router: RouterTarget,
    routerCalldata: Hex,
    i: {
      readonly router: Address;
      readonly token: Address;
      readonly stealth: Address;
      readonly gross: bigint;
      readonly sponsorFee: bigint;
      readonly sponsorFeeTo: Address;
      readonly deadline: bigint;
    },
    payloadHash: Hex,
    sig: Hex,
  ): void {
    if (!isAddressEqual(i.token, q.token) || i.gross !== q.gross) throw new PayerSponsorError('BAD_REQUEST', 'order differs from the quote');
    if (!isAddressEqual(i.sponsorFeeTo, q.sponsorFeeTo)) throw new PayerSponsorError('BAD_REQUEST', 'fee recipient differs from the quote');
    if (i.sponsorFee < q.sponsorFee) throw new PayerSponsorError('FEE_TOO_LOW', 'sponsor fee below the quote');
    if (!isAddressEqual(i.router, router.address)) throw new PayerSponsorError('PAYLOAD_MISMATCH', 'router differs');
    if (!cfg.routers.some((r) => sameRouter(r, router))) throw new PayerSponsorError('BAD_REQUEST', 'router not allowed');
    if (keccak256(routerCalldata) !== payloadHash.toLowerCase()) throw new PayerSponsorError('PAYLOAD_MISMATCH', 'payload hash differs');
    decodeAndCheckPayload(router, routerCalldata, { token: i.token, stealth: i.stealth, gross: i.gross });
    const nowSec = BigInt(Math.floor(this.now() / 1000));
    if (i.deadline <= nowSec || i.deadline > nowSec + BigInt(this.o.maxDeadlineSeconds)) {
      throw new PayerSponsorError('BAD_REQUEST', 'deadline outside the accepted window');
    }
    if (sig.length !== 132) throw new PayerSponsorError('BAD_REQUEST', 'signature must be 65 bytes');
  }

  /** Shared PH-4 operation review; returns the verified deployment addresses. */
  private async checkUserOp(
    cfg: ChainSponsorConfig,
    q: StoredQuote,
    req: SponsorUserOpRequest,
  ): Promise<{ readonly paymaster: Address; readonly entryPoint: Address }> {
    const d = cfg.deployment;
    if (d.paymaster === undefined || d.entryPoint === undefined || d.accountFactory === undefined) {
      throw new PayerSponsorError('MODE_UNAVAILABLE', 'PH-4 is not deployed on this chain');
    }
    const op = req.userOp;
    if (req.sponsorFee < q.sponsorFee) throw new PayerSponsorError('FEE_TOO_LOW', 'sponsor fee below the quote');
    if (!cfg.routers.some((r) => sameRouter(r, req.router))) throw new PayerSponsorError('BAD_REQUEST', 'router not allowed');
    const calls = decodeExecuteBatch(op.callData);
    // The batch must be exactly approve / router call / approve(0) / fee transfer for this quote.
    const fields = { token: q.token, router: req.router.address, routerCalldata: req.routerCalldata, gross: q.gross, sponsorFee: req.sponsorFee, sponsorFeeTo: q.sponsorFeeTo };
    assertPayerCalls(calls, fields);
    decodeAndCheckPayload(req.router, req.routerCalldata, { token: q.token, stealth: stealthOf(req.routerCalldata), gross: q.gross });
    // Fresh account only: the first operation deploys it through our factory for the stated owner.
    if (op.nonce !== 0n) throw new PayerSponsorError('BAD_REQUEST', 'only first operations of fresh accounts are sponsored');
    if (op.initCode.toLowerCase() !== buildInitCode(d.accountFactory, req.owner, req.saltNonce).toLowerCase()) {
      throw new PayerSponsorError('BAD_REQUEST', 'initCode is not our factory for this owner');
    }
    const raw = await cfg.chain.call(d.accountFactory, encodeFactoryGetAddress(req.owner, req.saltNonce));
    if (raw.length !== 66 || !isAddressEqual(getAddress(`0x${raw.slice(26)}`), op.sender)) {
      throw new PayerSponsorError('BAD_REQUEST', 'sender is not the counterfactual account of this owner');
    }
    // Gas caps bound the sponsor's maximum loss per operation.
    const [vgl, cgl] = unpackUint128Pair(op.accountGasLimits);
    const [, maxFee] = unpackUint128Pair(op.gasFees);
    const maxVg = this.o.maxVerificationGas ?? 2_000_000n;
    const maxCg = this.o.maxCallGas ?? 1_500_000n;
    const maxCost = this.o.maxOpCostWei ?? 10n ** 17n;
    if (vgl > maxVg || cgl > maxCg) throw new PayerSponsorError('BAD_REQUEST', 'gas limits above the sponsor caps');
    if ((vgl + cgl + op.preVerificationGas + 250_000n) * maxFee > maxCost) throw new PayerSponsorError('BAD_REQUEST', 'operation cost above the sponsor cap');
    return { paymaster: d.paymaster, entryPoint: d.entryPoint };
  }

  // ---------- execution ----------

  private async execute(
    ctx: ClientContext,
    cfg: ChainSponsorConfig,
    mode: SponsoredMode,
    call: SponsorCall,
    quoteId: string,
    fee: ExpectedFee,
  ): Promise<{ value: SubmitResult; txHash: Hex }> {
    if (!this.o.loss.allows(ctx.bucket)) throw new PayerSponsorError('BUDGET_EXCEEDED', 'loss budget exhausted for this client');
    const permit = this.o.breaker.tryAcquire();
    if (permit === null) throw new PayerSponsorError('BREAKER_OPEN', 'sponsor temporarily unavailable');
    this.quotes.delete(quoteId); // single use, also when the transaction later fails
    let cls: RelayResultClass = 'rpc_error';
    try {
      const sim = await cfg.chain.simulate(call);
      if (!sim.ok) {
        cls = 'simulation_reverted';
        throw new PayerSponsorError('SIMULATION_FAILED', 'simulation reverted');
      }
      cls = 'send_failed';
      const txHash = await cfg.chain.send(call, (sim.gas * 12n) / 10n);
      cls = 'receipt_timeout';
      const receipt = await cfg.chain.waitForReceipt(txHash);
      if (!receipt.success || !paidFee(receipt.logs, fee)) {
        // A mined revert after a successful simulation means the payer's state changed (front-run or
        // grief): charge the loss budget and do not poison the breaker (S3-06). A transaction that
        // succeeded WITHOUT paying the sponsor fee (a stale EIP-7702 authorization makes the call a
        // no-op on a code-less EOA; a failed inner ERC-4337 execution still burns the paymaster
        // deposit) is the same loss and is treated the same way.
        cls = 'mined_revert_state_changed';
        this.o.loss.charge(ctx.bucket, receipt.gasUsed * receipt.effectiveGasPrice);
        throw new RevertedError(txHash);
      }
      cls = 'confirmed';
      return { value: { txHash }, txHash };
    } catch (e) {
      if (e instanceof PayerSponsorError || e instanceof RevertedError) throw e;
      throw new PayerSponsorError('UNAVAILABLE', `chain error during ${mode}`);
    } finally {
      permit.settle(classifyRelayOutcome(cls));
    }
  }

  /** Wraps an operation: logs the allowlisted entry and maps unexpected errors. */
  private async guarded<T>(
    mode: SponsoredMode,
    chainId: number,
    started: number,
    fn: () => Promise<{ value: T; txHash?: Hex }>,
  ): Promise<T> {
    const entry = (outcome: SponsorLogEntry['outcome'], txHash?: Hex): SponsorLogEntry => ({
      mode,
      chainId,
      outcome,
      latencyBucket: latencyBucket(this.now() - started),
      txHash,
    });
    try {
      const r = await fn();
      this.o.log(entry('ok', r.txHash));
      return r.value;
    } catch (e) {
      if (e instanceof RevertedError) {
        this.o.log(entry('reverted', e.txHash));
        throw new PayerSponsorError('UNAVAILABLE', 'transaction reverted');
      }
      this.o.log(entry(e instanceof PayerSponsorError ? 'rejected' : 'error'));
      if (e instanceof PayerSponsorError) throw e;
      throw new PayerSponsorError('UNAVAILABLE', 'internal error');
    }
  }
}

interface ExpectedFee {
  readonly token: Address;
  readonly to: Address;
  readonly value: bigint;
}

/** Whether `logs` contain an ERC-20 `Transfer(_, to, >= value)` emitted by `token`. */
function paidFee(logs: readonly ReceiptLog[], fee: ExpectedFee): boolean {
  return logs.some(
    (l) =>
      isAddressEqual(l.address, fee.token) &&
      l.topics.length === 3 &&
      l.topics[0]?.toLowerCase() === TRANSFER_TOPIC &&
      l.topics[2] !== undefined &&
      isAddressEqual(getAddress(`0x${l.topics[2].slice(26)}`), fee.to) &&
      l.data.length === 66 &&
      BigInt(l.data) >= fee.value,
  );
}

class RevertedError extends Error {
  public constructor(public readonly txHash: Hex) {
    super('reverted');
  }
}

function sameRouter(a: RouterTarget, b: RouterTarget): boolean {
  if (a.kind !== b.kind || !isAddressEqual(a.address, b.address)) return false;
  if (a.kind === 'policy' && b.kind === 'policy') {
    return isAddressEqual(a.policy.owner, b.policy.owner) && a.policy.policyHash.toLowerCase() === b.policy.policyHash.toLowerCase();
  }
  return true;
}

function toHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

function stealthOf(calldata: Hex): Address {
  // word 1 of the head (after the 4-byte selector) is the stealth address for both routers
  return getAddress(`0x${calldata.slice(10 + 64 + 24, 10 + 128)}`);
}
