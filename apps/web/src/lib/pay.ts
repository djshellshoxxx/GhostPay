import {
  FEE_SCHEDULE,
  assertPreviewMatchesCalldata,
  buildPermitTypedData,
  calculateBuffer,
  createAggregatorReader,
  createEvmAdapter,
  decodePaymentCalldata,
  erc20Abi,
  erc2612PermitAbi,
  erc20MetadataAbi,
  fiatToTokenAmount,
  findChain,
  findFeed,
  findToken,
  parseQuantity,
  permitDigest,
  readPrice,
  type Address,
  type BuiltPayment,
  type ChainAdapter,
  type ChainConfig,
  type DeploymentManifest,
  type Hex,
  type PaymentRequest,
  type PermitPreflightReader,
  type PermitReader,
  type PermitState,
  type PermitTypedData,
  type RpcClient,
  type TokenConfig,
} from '@ghostpay/chain-adapters';
import { checkExpiry, type ExpiryStatus, type Invoice, type ParsedInvoice } from '@ghostpay/invoice-schema';
import { decodeFunctionData, decodeFunctionResult, encodeFunctionData, getAddress, recoverAddress } from 'viem/utils';
import { UserFacingError, displayMessage, type MessageDescriptor } from './errors';
import type { MessageKey } from '../i18n/catalog';
import type { Translator } from '../i18n/translator';
import { fiatDecimals, formatFiat, formatUnits } from './format';
import { computeTotals } from './invoiceCreate';
import type { ManifestState } from './manifest';
import { reportsRevert } from './txGuard';

export type TrustView = (
  | { readonly kind: 'invalid-signature'; readonly text: string }
  | { readonly kind: 'valid-signature'; readonly text: string }
  | { readonly kind: 'trusted-seller'; readonly text: string }
) & { readonly message: MessageDescriptor };

/**
 * ADR-0010 wording rule: a valid signature never reads as "verified seller". Only a pinned key may be called pinned.
 */
export function trustView(parsed: ParsedInvoice): TrustView {
  const key = parsed.invoice.signer;
  if (parsed.trust === 'invalid-signature') {
    const message: MessageDescriptor = { key: 'pay.review.invalidSignature' };
    return { kind: 'invalid-signature', text: displayMessage(message), message };
  }
  if (parsed.trust === 'trusted-seller') {
    const message: MessageDescriptor = { key: 'pay.review.pinnedSignature', values: { key } };
    return { kind: 'trusted-seller', text: displayMessage(message), message };
  }
  const message: MessageDescriptor = { key: 'pay.review.unpinnedSignature', values: { key } };
  return { kind: 'valid-signature', text: displayMessage(message), message };
}

export interface Review {
  readonly invoice: Invoice;
  readonly trust: TrustView;
  readonly encrypted: boolean;
  readonly expiry: ExpiryStatus;
  readonly chain: ChainConfig | undefined;
  readonly token: { readonly symbol: string; readonly decimals: number; readonly address: Address | 'native'; readonly config: TokenConfig | undefined } | undefined;
  readonly totals: { readonly subtotal: bigint; readonly tax: bigint; readonly total: bigint };
  readonly manifest: DeploymentManifest | undefined;
  /** Reasons payment cannot proceed. Empty means the review may continue. */
  readonly blockers: readonly string[];
  readonly blockerMessages: readonly MessageDescriptor[];
  /** Things the payer should check before paying. They never block (L2-F4). */
  readonly warnings: readonly string[];
  readonly warningMessages: readonly MessageDescriptor[];
}

/**
 * Fiat currency each stablecoin symbol is designed to track. Used only to compare a fixed token amount with a
 * same-currency fiat total in the review (L2-F4): never as a price, never to block.
 */
const STABLECOIN_CURRENCY: ReadonlyMap<string, string> = new Map([['USDC', 'USD'], ['EURC', 'EUR']]);

/**
 * L2-F4: in `fixed_token` mode the payer pays the token amount, and the fiat total is only the seller's statement that
 * nothing converts or checks. For a USD or EUR stablecoin and a total in that same currency, a difference of more than
 * 1 % is flagged so the payer reads the amount they will really pay. No price feed is used; an invoice with no line
 * items and a zero total states no fiat figure, so there is nothing to compare.
 */
export function fixedAmountWarnings(inv: Invoice, token: Review['token']): readonly string[] {
  return fixedAmountWarningMessages(inv, token).map((message) => displayMessage(message));
}

function fixedAmountWarningMessages(inv: Invoice, token: Review['token']): readonly MessageDescriptor[] {
  if (inv.amountPolicy.mode !== 'fixed_token' || token === undefined || STABLECOIN_CURRENCY.get(token.symbol) !== inv.fiat.currency) return [];
  const fiat = BigInt(inv.fiat.minorUnits);
  if (fiat === 0n && inv.lineItems.length === 0) return [];
  const amount = BigInt(inv.amountPolicy.tokenAmount);
  // Both at one scale: token base units times 10^fiatDecimals, fiat minor units times 10^tokenDecimals.
  const a = amount * 10n ** BigInt(fiatDecimals(inv.fiat.currency));
  const f = fiat * 10n ** BigInt(token.decimals);
  if ((a > f ? a - f : f - a) * 100n <= f) return [];
  return [
    { key: 'pay.review.fixedAmountMismatch', values: { symbol: token.symbol, currency: inv.fiat.currency, amount: formatUnits(amount, token.decimals), fiat: formatFiat(fiat, inv.fiat.currency) } },
  ];
}

/** Resolves chain/token and collects every reason the payment must not proceed, plus non-blocking warnings. Pure. */
export function reviewInvoice(parsed: ParsedInvoice, nowSeconds: number, manifest: ManifestState): Review {
  const inv = parsed.invoice;
  const blockerMessages: MessageDescriptor[] = [];
  const trust = trustView(parsed);
  if (trust.kind === 'invalid-signature') blockerMessages.push(trust.message);
  const expiry = checkExpiry(inv, nowSeconds);
  if (expiry.invoiceExpired) blockerMessages.push({ key: 'pay.review.invoiceExpired' });
  if (inv.amountPolicy.mode === 'fiat_quote' && expiry.quoteExpired) blockerMessages.push({ key: 'pay.review.quoteExpired' });
  const totals = computeTotals(inv.lineItems, inv.tax.rateBps, BigInt(inv.tax.minorUnits));
  if (inv.lineItems.length > 0 && totals.total !== BigInt(inv.fiat.minorUnits)) {
    blockerMessages.push({ key: 'pay.review.totalsMismatch' });
  }
  const chain = findChain(inv.chainId);
  if (chain === undefined) blockerMessages.push({ key: 'pay.review.unknownChain', values: { chain: String(inv.chainId) } });
  else if (!chain.enabled) blockerMessages.push({ key: 'pay.review.disabledChain', values: { chain: chain.name } });
  let token: Review['token'];
  if (inv.token === 'native') {
    token = { symbol: chain?.nativeSymbol ?? 'native', decimals: 18, address: 'native', config: undefined };
  } else {
    const cfg = findToken(inv.chainId, inv.token);
    if (cfg === undefined) blockerMessages.push({ key: 'pay.review.disallowedToken' });
    else token = { symbol: cfg.symbol, decimals: cfg.decimals, address: cfg.address, config: cfg };
  }
  let loaded: DeploymentManifest | undefined;
  if (manifest.status === 'loaded') loaded = manifest.manifest;
  else if (chain?.enabled === true) {
    blockerMessages.push({ key: manifest.status === 'invalid' ? 'pay.review.invalidManifest' : 'pay.review.missingManifest' });
  }
  const warningMessages = fixedAmountWarningMessages(inv, token);
  return {
    invoice: inv, trust, encrypted: parsed.encrypted, expiry, chain, token, totals, manifest: loaded,
    blockerMessages, warningMessages,
    blockers: blockerMessages.map((message) => displayMessage(message)),
    warnings: warningMessages.map((message) => displayMessage(message)),
  };
}

/** A client that refuses all network use; lets the adapter build calldata with no RPC configured. */
export function offlineClient(chainId: number): RpcClient {
  const no = (): Promise<never> => Promise.reject(new UserFacingError({ key: 'error.pay.noRPCIsConfiguredForThisChain' }));
  return { chainId, request: no, blockNumber: no, getBlock: no, getLogs: no };
}

export interface PayContext {
  readonly review: Review;
  readonly adapter: ChainAdapter;
  readonly request: PaymentRequest;
  readonly manifest: DeploymentManifest;
  readonly chain: ChainConfig;
  readonly client: RpcClient;
  readonly quotedTokenAmount: bigint | undefined;
}

export interface FeedDeps {
  readonly findFeedFn?: typeof findFeed;
  readonly nowSeconds: number;
}

/**
 * Builds the payment request from a review that has no blockers. For `fiat_quote` invoices the token amount comes
 * from a configured Chainlink feed through the user's RPC; with no feed or no RPC this fails closed.
 */
export async function createPayContext(review: Review, client: RpcClient | undefined, deps: FeedDeps): Promise<PayContext> {
  const { chain, manifest, token } = review;
  if (review.blockers.length > 0 || chain === undefined || manifest === undefined || token === undefined) {
    throw new UserFacingError({ key: 'error.pay.thisPaymentIsBlockedResolveTheItemsInTheReview' });
  }
  const rpc = client ?? offlineClient(chain.chainId);
  const adapter = createEvmAdapter({ chain, deployment: manifest, client: rpc });
  let quoted: bigint | undefined;
  const inv = review.invoice;
  if (inv.amountPolicy.mode === 'fiat_quote') {
    if (client === undefined) throw new UserFacingError({ key: 'error.pay.thisInvoiceIsPricedInFiatConfigureAnRPCFor' });
    const feed = (deps.findFeedFn ?? findFeed)(chain.chainId, token.symbol, inv.fiat.currency);
    if (feed === undefined) {
      throw new UserFacingError({ key: 'error.pay.missingPriceFeed', values: { symbol: token.symbol, currency: inv.fiat.currency, chain: chain.name } });
    }
    const price = await readPrice(createAggregatorReader(client), feed.address, {
      now: BigInt(deps.nowSeconds),
      maxAgeSeconds: BigInt(Math.min(Math.max(inv.quote.expiresAt - inv.quote.timestamp, 60), 86_400)),
    });
    quoted = fiatToTokenAmount({
      fiatMinorUnits: BigInt(inv.fiat.minorUnits),
      fiatDecimals: fiatDecimals(inv.fiat.currency),
      fiatCurrency: inv.fiat.currency,
      priceQuoteCurrency: feed.quote,
      price,
      tokenDecimals: token.decimals,
      side: 'payer',
    });
  }
  const request = adapter.buildPaymentRequest(inv, quoted === undefined ? {} : { quotedTokenAmount: quoted });
  return { review, adapter, request, manifest, chain, client: rpc, quotedTokenAmount: quoted };
}

/** Default sweep-gas estimate (per-token table fallback floor). Conservative for plain ERC-20 transfers. */
export const SWEEP_GAS_ESTIMATE = 100_000n;
/** Upper bound for a simulated sweep; above it the token is treated as unsuitable for a buffer (fail closed). */
export const MAX_SIMULATED_SWEEP_GAS = 500_000n;
/** Simulated gas is scaled by this margin (bps over 100 %) to absorb drift between the payer's and the stealth sweep. */
export const SWEEP_SIMULATION_MARGIN_BPS = 2_500n;
/** Hard cap on any gas buffer (0.01 native unit). */
export const MAX_BUFFER_WEI = 10n ** 16n;
/** Spec 13: a buffer quote older than 60 s is rejected. */
export const BUFFER_QUOTE_TTL_SECONDS = 60;
/** Fixed non-zero recipient for the sweep simulation, so the estimate includes a zero-to-non-zero balance write. */
const SWEEP_SIMULATION_RECIPIENT = '0x000000000000000000000000000000000000dEaD' as Address;

export interface BufferQuote {
  readonly bufferWei: bigint;
  readonly maxFeePerGas: bigint;
  readonly gasLimit: bigint;
  readonly safetyBps: bigint;
  readonly quotedAt: number;
  readonly expiresAt: number;
  /** `simulated`: gasLimit covers an `eth_estimateGas` of the token transfer; `default`: table value only. */
  readonly gasSource: 'simulated' | 'default';
  /** Set when a v2 invoice's `bufferPolicy.minWei` raised the estimate (ADR-0024); shown to the payer. */
  readonly raisedToSellerMinimum?: boolean;
}

/** Whether the invoice lets the payer add a gas buffer at all (v1: yes; v2: only when the seller accepted). */
export function bufferOffered(invoice: Invoice): boolean {
  if (invoice.token === 'native') return false;
  return invoice.bufferPolicy === undefined || invoice.bufferPolicy.accepted;
}

/** Checks a buffer amount against the app cap and, for v2 invoices, the seller's policy (ADR-0024). */
function assertBufferWithinPolicy(bufferWei: bigint, invoice: Invoice): void {
  const p = invoice.bufferPolicy;
  if (p !== undefined && !p.accepted) throw new UserFacingError({ key: 'error.pay.theSellerDoesNotAcceptAGasBufferForThis' });
  if (bufferWei > MAX_BUFFER_WEI) throw new UserFacingError({ key: 'error.pay.theGasBufferExceedsTheSafetyCap' });
  if (p === undefined) return;
  if (bufferWei > BigInt(p.maxWei)) throw new UserFacingError({ key: 'error.pay.theGasBufferWouldExceedTheSellerSMaximumFor' });
  if (bufferWei < BigInt(p.minWei)) throw new UserFacingError({ key: 'error.pay.theGasBufferIsBelowTheSellerSMinimumFor' });
}

/**
 * Applies a v2 invoice's seller `bufferPolicy` to a fresh quote (ADR-0024): declined -> refused; an estimate below
 * `minWei` is raised to `minWei` (flagged so the UI shows it); anything above `min(maxWei, app cap)` is refused, as is a
 * seller floor above the app cap. v1 invoices return the quote unchanged.
 */
export function applyBufferPolicy(quote: BufferQuote, invoice: Invoice): BufferQuote {
  const p = invoice.bufferPolicy;
  if (p === undefined) return quote;
  if (!p.accepted) throw new UserFacingError({ key: 'error.pay.theSellerDoesNotAcceptAGasBufferForThis' });
  const min = BigInt(p.minWei);
  if (min > MAX_BUFFER_WEI) throw new UserFacingError({ key: 'error.pay.theSellerSMinimumGasBufferIsAboveThisApp' });
  const out = quote.bufferWei < min ? { ...quote, bufferWei: min, raisedToSellerMinimum: true } : quote;
  assertBufferWithinPolicy(out.bufferWei, invoice);
  return out;
}

/** Token transfer the seller's sweep will perform, simulated from the payer who holds the tokens now. */
export interface SweepSimulation {
  readonly token: Address;
  readonly from: Address;
  readonly amount: bigint;
}

/**
 * Feature 1 / spec 13: native buffer sized from the user's RPC gas price and, when `sweep` is given, a token-specific
 * `eth_estimateGas` of the transfer. Simulation failure fails closed: a token whose transfer cannot be simulated may
 * have hooks or restrictions that a table default would underfund.
 */
export async function quoteBuffer(rpc: Pick<RpcClient, 'request'>, nowSeconds: number, sweep?: SweepSimulation): Promise<BufferQuote> {
  let gasLimit = SWEEP_GAS_ESTIMATE;
  if (sweep !== undefined) {
    let simulated: bigint;
    try {
      const data = encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [SWEEP_SIMULATION_RECIPIENT, sweep.amount] });
      simulated = parseQuantity(await rpc.request('eth_estimateGas', [{ from: sweep.from, to: sweep.token, data }]));
    } catch {
      throw new UserFacingError({ key: 'error.pay.theTokenTransferCouldNotBeSimulatedSoASafe' });
    }
    if (simulated === 0n || simulated > MAX_SIMULATED_SWEEP_GAS) {
      throw new UserFacingError({ key: 'error.pay.theSimulatedTokenTransferNeedsAnUnexpectedAmountOfGas' });
    }
    const margined = (simulated * (FEE_SCHEDULE.BPS + SWEEP_SIMULATION_MARGIN_BPS) + FEE_SCHEDULE.BPS - 1n) / FEE_SCHEDULE.BPS;
    if (margined > gasLimit) gasLimit = margined;
  }
  const gasPrice = parseQuantity(await rpc.request('eth_gasPrice', []));
  const maxFeePerGas = gasPrice * 2n;
  const bufferWei = calculateBuffer({ estimatedSweepGas: gasLimit, maxFeePerGas, safetyBps: FEE_SCHEDULE.DEFAULT_BUFFER_SAFETY_BPS });
  if (bufferWei > MAX_BUFFER_WEI) throw new UserFacingError({ key: 'error.pay.theEstimatedGasBufferExceedsTheSafetyCapGasLooks' });
  return {
    bufferWei, maxFeePerGas, gasLimit, safetyBps: FEE_SCHEDULE.DEFAULT_BUFFER_SAFETY_BPS,
    quotedAt: nowSeconds, expiresAt: nowSeconds + BUFFER_QUOTE_TTL_SECONDS, gasSource: sweep === undefined ? 'default' : 'simulated',
  };
}

/**
 * Re-estimate before the wallet is asked (spec 13 "re-estimate at confirm"): the buffer value is fixed in the built
 * calldata, so a fresh quote at the same gas limit must not exceed it. Guards against fee spikes between prepare and
 * send (for example while an approval confirms). Never raises the buffer silently; the user must prepare again.
 */
export async function assertBufferStillSufficient(built: BuiltPayment, rpc: Pick<RpcClient, 'request'> | undefined): Promise<void> {
  const quote = builtBufferQuotes.get(built);
  if (quote === undefined) return;
  if (rpc === undefined) throw new UserFacingError({ key: 'error.pay.aGasBufferNeedsAnRPCForThisChainTo' });
  const gasPrice = parseQuantity(await rpc.request('eth_gasPrice', []));
  // The quote's safety margin exists to absorb drift, so only the margin-free requirement at today's price must fit;
  // otherwise every small fee tick would force the user to prepare again.
  const required = calculateBuffer({ estimatedSweepGas: quote.gasLimit, maxFeePerGas: gasPrice * 2n, safetyBps: 0n });
  if (required > built.tx.value) {
    throw new UserFacingError({ key: 'error.pay.gasPricesRoseSinceTheBufferWasQuotedSoThe' });
  }
}

/**
 * Spec 13 TTL at send: a prepared buffer quote is valid only until its `expiresAt`. The calldata is never rewritten;
 * the payer must prepare again. Callers pass a fresh clock before and after every await.
 */
export function assertPreparedBufferFresh(built: BuiltPayment, nowSeconds: number): void {
  const quote = builtBufferQuotes.get(built);
  if (quote !== undefined && nowSeconds >= quote.expiresAt) {
    throw new UserFacingError({ key: 'error.pay.theGasBufferQuoteExpiredBeforeSendingNothingWasSent' });
  }
}

export interface FinalBuildOptions {
  readonly nowSeconds: number;
  readonly deadlineSeconds?: number;
  readonly permitSignature?: Hex;
  readonly buffer?: BufferQuote;
}

/** Router deadline window for a prepared payment. */
export const DEADLINE_SECONDS = 20 * 60;

/** First second at which the invoice may no longer be paid: its signed expiry and, for `fiat_quote`, the seller quote expiry. */
export function invoicePayableUntil(invoice: Invoice): number {
  return invoice.amountPolicy.mode === 'fiat_quote' ? Math.min(invoice.expiresAt, invoice.quote.expiresAt) : invoice.expiresAt;
}

/** Reapplies the review-time `checkExpiry` rules; every final pre-sign/pre-submit guard calls this with a fresh clock. */
export function assertInvoiceStillPayable(invoice: Invoice, nowSeconds: number): void {
  const expiry = checkExpiry(invoice, nowSeconds);
  if (expiry.invoiceExpired) throw new UserFacingError({ key: 'error.pay.thisInvoiceHasExpiredNothingWasSent' });
  if (invoice.amountPolicy.mode === 'fiat_quote' && expiry.quoteExpired) throw new UserFacingError({ key: 'error.pay.theSellerSPriceQuoteHasExpiredNothingWasSent' });
}

/**
 * Last second a deadline may name: the router and ERC-2612 accept a tx mined AT the deadline second, while
 * `checkExpiry` treats `expiresAt` itself as expired.
 */
function lastPayableSecond(invoice: Invoice): number {
  return invoicePayableUntil(invoice) - 1;
}

/** One router (and permit) deadline: the 20-minute window, never past the invoice's last payable second. */
export function boundedDeadline(invoice: Invoice, nowSeconds: number): number {
  assertInvoiceStillPayable(invoice, nowSeconds);
  return Math.min(nowSeconds + DEADLINE_SECONDS, lastPayableSecond(invoice));
}
const builtPaymentContexts = new WeakMap<BuiltPayment, PayContext>();
const builtBufferQuotes = new WeakMap<BuiltPayment, BufferQuote>();

/** Builds the transaction and the preview from the SAME call; the UI renders `preview` and sends `tx`. */
export function buildFinal(ctx: PayContext, opts: FinalBuildOptions): BuiltPayment {
  if (opts.buffer !== undefined) {
    if (ctx.review.invoice.token === 'native') throw new UserFacingError({ key: 'error.pay.aGasBufferAppliesToTokenPaymentsOnly' });
    if (opts.nowSeconds >= opts.buffer.expiresAt) throw new UserFacingError({ key: 'error.pay.theGasBufferQuoteExpiredRefreshItAndReviewAgain' });
    assertBufferWithinPolicy(opts.buffer.bufferWei, ctx.review.invoice);
  }
  const inv = ctx.review.invoice;
  assertInvoiceStillPayable(inv, opts.nowSeconds);
  if (opts.deadlineSeconds !== undefined && opts.deadlineSeconds > lastPayableSecond(inv)) {
    throw new UserFacingError({ key: 'error.pay.blockedThePaymentDeadlineWouldOutliveTheInvoicePrepareIt' });
  }
  const deadline = BigInt(opts.deadlineSeconds ?? boundedDeadline(inv, opts.nowSeconds));
  const built = ctx.request.build({
    deadline,
    now: BigInt(opts.nowSeconds),
    ...(opts.permitSignature === undefined ? {} : { permitSignature: opts.permitSignature }),
    ...(opts.buffer === undefined ? {} : { buffer: { bufferWei: opts.buffer.bufferWei, maxBufferWei: opts.buffer.bufferWei } }),
  });
  builtPaymentContexts.set(built, ctx);
  if (opts.buffer !== undefined) builtBufferQuotes.set(built, opts.buffer);
  return built;
}

/**
 * The last gate before the wallet is asked to send: the calldata the wallet will receive is decoded and compared to the
 * preview the user saw, and the preview is compared to the review (router from the manifest, token, gross, chain).
 */
export function assertReadyToSend(built: BuiltPayment, ctx: PayContext): void {
  if (builtPaymentContexts.get(built) !== ctx) throw new UserFacingError({ key: 'error.pay.blockedThePreparedPaymentBelongsToADifferentReviewedInvoice' });
  assertPreviewMatchesCalldata(built.preview, built.tx, ctx.chain.chainId);
  const p = built.preview;
  const inv = ctx.review.invoice;
  const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();
  if (!same(built.tx.to, ctx.manifest.router) || !same(p.router, ctx.manifest.router)) throw new UserFacingError({ key: 'error.pay.blockedTheTransactionDoesNotTargetTheManifestRouter' });
  if (p.chainId !== inv.chainId) throw new UserFacingError({ key: 'error.pay.blockedChainDiffersFromTheInvoice' });
  if (p.token === 'native' ? inv.token !== 'native' : !same(p.token, inv.token)) throw new UserFacingError({ key: 'error.pay.blockedTokenDiffersFromTheInvoice' });
  if (p.gross !== ctx.request.grossAmount || p.fee !== ctx.request.feeAmount || p.net !== ctx.request.netAmount) {
    throw new UserFacingError({ key: 'error.pay.blockedAmountsDifferFromTheReviewedAmounts' });
  }
}

/** Independent decode of the final calldata (what the wallet will really receive), for display next to the preview. */
export function decodeForDisplay(built: BuiltPayment, chainId: number): ReturnType<typeof decodePaymentCalldata> {
  return decodePaymentCalldata(built.tx, chainId);
}

/* ---------------------------- allowance and permit ---------------------------- */

export function buildApproveTx(token: Address, spender: Address, amount: bigint): { to: Address; data: Hex; value: bigint } {
  return { to: token, data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [spender, amount] }), value: 0n };
}

/** Confirms approve calldata approves exactly `spender` for `amount` on `token`. */
export function assertApproveTx(tx: { to: Address; data: Hex; value: bigint }, token: Address, spender: Address, amount: bigint): void {
  let decoded: ReturnType<typeof decodeFunctionData<typeof erc20Abi>>;
  try {
    decoded = decodeFunctionData({ abi: erc20Abi, data: tx.data });
  } catch {
    throw new UserFacingError({ key: 'error.pay.blockedApprovalCalldataCouldNotBeDecoded' });
  }
  if (decoded.functionName !== 'approve' || tx.value !== 0n || tx.to.toLowerCase() !== token.toLowerCase()) {
    throw new UserFacingError({ key: 'error.pay.blockedUnexpectedApprovalTransaction' });
  }
  const [s, a] = decoded.args;
  if (s.toLowerCase() !== spender.toLowerCase() || a !== amount) throw new UserFacingError({ key: 'error.pay.blockedApprovalSpenderOrAmountDiffersFromThePreview' });
}

export async function readAllowance(rpc: Pick<RpcClient, 'request'>, token: Address, owner: Address, spender: Address): Promise<bigint> {
  const data = encodeFunctionData({ abi: erc20Abi, functionName: 'allowance', args: [owner, spender] });
  const r = await rpc.request('eth_call', [{ to: token, data }, 'latest']);
  if (typeof r !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(r)) throw new UserFacingError({ key: 'error.pay.yourRPCReturnedAnUnexpectedAllowance' });
  return BigInt(r);
}

export function permitReader(rpc: Pick<RpcClient, 'request'>, version: string): PermitReader {
  const call = async (to: Address, data: Hex): Promise<Hex> => {
    const r = await rpc.request('eth_call', [{ to, data }, 'latest']);
    if (typeof r !== 'string' || !/^0x(?:[0-9a-fA-F]{2})*$/.test(r)) throw new UserFacingError({ key: 'error.pay.yourRPCReturnedAnUnexpectedResult' });
    return r as Hex;
  };
  return {
    async name(token) {
      const data = encodeFunctionData({ abi: erc20MetadataAbi, functionName: 'name' });
      return decodeString(await call(token, data));
    },
    version() {
      return Promise.resolve(version);
    },
    async nonce(token, owner) {
      const data = encodeFunctionData({ abi: erc2612PermitAbi, functionName: 'nonces', args: [owner] });
      return BigInt(await call(token, data));
    },
    async domainSeparator(token) {
      const data = encodeFunctionData({ abi: erc2612PermitAbi, functionName: 'DOMAIN_SEPARATOR' });
      return call(token, data);
    },
  };
}

/** Spec 04: one user-facing sentence per permit pre-flight state. Never suggests a silent retry. */
const PERMIT_STATE_KEYS: Readonly<Record<PermitState, MessageKey>> = {
  ok_to_permit: 'pay.permit.okToPermit',
  already_allowed: 'pay.permit.alreadyAllowed',
  nonce_consumed: 'pay.permit.nonceConsumed',
  sig_invalid: 'pay.permit.sigInvalid',
  expired: 'pay.permit.expired',
  unsupported_token: 'pay.permit.unsupportedToken',
};

export function permitStateDescriptor(state: PermitState): MessageDescriptor {
  return { key: PERMIT_STATE_KEYS[state] };
}

export function permitStateMessage(state: PermitState, t?: Translator['t']): string {
  return displayMessage(permitStateDescriptor(state), t);
}


/**
 * Reads for the spec 04 permit classifier over the user's RPC. `simulatePermit` is a static `permit(...)` call: only a
 * node-reported execution failure ({@link reportsRevert}) or a malformed result counts as "the token would not accept
 * it". Any other error (timeout, HTTP 429/5xx, dropped connection) rejects, so the payment stops with an RPC error and
 * the permit is not reported as rejected (R04-3; the {@link PermitPreflightReader} contract).
 */
export function permitPreflightReader(rpc: Pick<RpcClient, 'request'>): PermitPreflightReader {
  const base = permitReader(rpc, '1');
  return {
    allowance: (token, owner, spender) => readAllowance(rpc, token, owner, spender),
    nonce: (token, owner) => base.nonce(token, owner),
    async domainSeparator(token) {
      const data = encodeFunctionData({ abi: erc2612PermitAbi, functionName: 'DOMAIN_SEPARATOR' });
      const r = await rpc.request('eth_call', [{ to: token, data }, 'latest']);
      if (typeof r !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(r)) throw new UserFacingError({ key: 'error.pay.yourRPCReturnedAnUnexpectedDOMAINSEPARATOR' });
      return r as Hex;
    },
    async simulatePermit(token, a) {
      const data = encodeFunctionData({ abi: erc2612PermitAbi, functionName: 'permit', args: [a.owner, a.spender, a.value, a.deadline, a.v, a.r, a.s] });
      let r: unknown;
      try {
        r = await rpc.request('eth_call', [{ from: a.owner, to: token, data }, 'latest']);
      } catch (e) {
        if (reportsRevert(e)) return false;
        throw e;
      }
      return typeof r === 'string' && /^0x(?:[0-9a-fA-F]{2})*$/.test(r);
    },
  };
}

function decodeString(data: Hex): string {
  return decodeFunctionResult({ abi: erc20MetadataAbi, functionName: 'name', data });
}

/** JSON for `eth_signTypedData_v4` with the EIP712Domain type made explicit and bigints as decimal strings. */
export function typedDataJson(td: PermitTypedData): string {
  return JSON.stringify(
    {
      types: {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'version', type: 'string' },
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' },
        ],
        ...td.types,
      },
      primaryType: td.primaryType,
      domain: td.domain,
      message: td.message,
    },
    (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v),
  );
}

/** Verifies a wallet-returned permit signature really recovers to the payer account. */
export async function assertPermitSigner(td: PermitTypedData, signature: Hex, account: Address): Promise<void> {
  const recovered = await recoverAddress({ hash: permitDigest(td), signature });
  if (getAddress(recovered) !== getAddress(account)) throw new UserFacingError({ key: 'error.pay.blockedThePermitSignatureDoesNotMatchYourAccount' });
}

/**
 * Builds permit typed data. ERC-2612 tokens use domain version "1" or "2" (USDC uses "2"); each candidate is accepted
 * only if the domain separator computed locally equals the token's on-chain `DOMAIN_SEPARATOR`.
 */
export async function buildPermit(
  rpc: Pick<RpcClient, 'request'>,
  p: { readonly chainId: number; readonly token: Address; readonly owner: Address; readonly spender: Address; readonly value: bigint; readonly deadline: bigint },
): Promise<PermitTypedData> {
  let last: unknown;
  for (const version of ['2', '1']) {
    try {
      return await buildPermitTypedData({ ...p, reader: permitReader(rpc, version) });
    } catch (e) {
      last = e;
    }
  }
  throw last instanceof Error ? last : new UserFacingError({ key: 'error.pay.couldNotBuildThePermitRequest' });
}

// i18n-use: error.pay.aGasBufferAppliesToTokenPaymentsOnly error.pay.aGasBufferNeedsAnRPCForThisChainTo error.pay.blockedAmountsDifferFromTheReviewedAmounts error.pay.blockedApprovalCalldataCouldNotBeDecoded error.pay.blockedApprovalSpenderOrAmountDiffersFromThePreview error.pay.blockedChainDiffersFromTheInvoice error.pay.blockedThePaymentDeadlineWouldOutliveTheInvoicePrepareIt error.pay.blockedThePermitSignatureDoesNotMatchYourAccount error.pay.blockedThePreparedPaymentBelongsToADifferentReviewedInvoice error.pay.blockedTheTransactionDoesNotTargetTheManifestRouter error.pay.blockedTokenDiffersFromTheInvoice error.pay.blockedUnexpectedApprovalTransaction error.pay.couldNotBuildThePermitRequest error.pay.gasPricesRoseSinceTheBufferWasQuotedSoThe error.pay.missingPriceFeed error.pay.noRPCIsConfiguredForThisChain error.pay.theEstimatedGasBufferExceedsTheSafetyCapGasLooks error.pay.theGasBufferExceedsTheSafetyCap error.pay.theGasBufferIsBelowTheSellerSMinimumFor error.pay.theGasBufferQuoteExpiredBeforeSendingNothingWasSent error.pay.theGasBufferQuoteExpiredRefreshItAndReviewAgain error.pay.theGasBufferWouldExceedTheSellerSMaximumFor error.pay.theSellerDoesNotAcceptAGasBufferForThis error.pay.theSellerSMinimumGasBufferIsAboveThisApp error.pay.theSellerSPriceQuoteHasExpiredNothingWasSent error.pay.theSimulatedTokenTransferNeedsAnUnexpectedAmountOfGas error.pay.theTokenTransferCouldNotBeSimulatedSoASafe error.pay.thisInvoiceHasExpiredNothingWasSent error.pay.thisInvoiceIsPricedInFiatConfigureAnRPCFor error.pay.thisPaymentIsBlockedResolveTheItemsInTheReview error.pay.yourRPCReturnedAnUnexpectedAllowance error.pay.yourRPCReturnedAnUnexpectedDOMAINSEPARATOR error.pay.yourRPCReturnedAnUnexpectedResult pay.permit.alreadyAllowed pay.permit.expired pay.permit.nonceConsumed pay.permit.okToPermit pay.permit.sigInvalid pay.permit.unsupportedToken pay.review.disabledChain pay.review.disallowedToken pay.review.fixedAmountMismatch pay.review.invalidManifest pay.review.invalidSignature pay.review.invoiceExpired pay.review.missingManifest pay.review.pinnedSignature pay.review.quoteExpired pay.review.totalsMismatch pay.review.unknownChain pay.review.unpinnedSignature
