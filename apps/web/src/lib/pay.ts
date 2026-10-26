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
import { UserFacingError } from './errors';
import { fiatDecimals } from './format';
import { computeTotals } from './invoiceCreate';
import type { ManifestState } from './manifest';

export type TrustView =
  | { readonly kind: 'invalid-signature'; readonly text: string }
  | { readonly kind: 'valid-signature'; readonly text: string }
  | { readonly kind: 'trusted-seller'; readonly text: string };

/**
 * ADR-0010 wording rule: a valid signature never reads as "verified seller". Only a pinned key may be called pinned.
 */
export function trustView(parsed: ParsedInvoice): TrustView {
  const key = parsed.invoice.signer;
  if (parsed.trust === 'invalid-signature') {
    return { kind: 'invalid-signature', text: 'The invoice signature is INVALID. Do not pay.' };
  }
  if (parsed.trust === 'trusted-seller') {
    return { kind: 'trusted-seller', text: `Signature matches key ${key} (pinned by you). This identifies the key, not a legal seller.` };
  }
  return { kind: 'valid-signature', text: `Signature matches key ${key} (not pinned). This only shows the link was not altered by someone without that key.` };
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
}

/** Resolves chain/token and collects every reason the payment must not proceed. Pure. */
export function reviewInvoice(parsed: ParsedInvoice, nowSeconds: number, manifest: ManifestState): Review {
  const inv = parsed.invoice;
  const blockers: string[] = [];
  const trust = trustView(parsed);
  if (trust.kind === 'invalid-signature') blockers.push(trust.text);
  const expiry = checkExpiry(inv, nowSeconds);
  if (expiry.invoiceExpired) blockers.push('This invoice has expired.');
  if (inv.amountPolicy.mode === 'fiat_quote' && expiry.quoteExpired) blockers.push('The seller’s price quote has expired. Ask for a new invoice.');
  const totals = computeTotals(inv.lineItems, inv.tax.rateBps, BigInt(inv.tax.minorUnits));
  if (inv.lineItems.length > 0 && totals.total !== BigInt(inv.fiat.minorUnits)) {
    blockers.push('The invoice totals do not add up (line items plus tax differ from the fiat total). Do not pay.');
  }
  const chain = findChain(inv.chainId);
  if (chain === undefined) blockers.push(`Unknown chain ${String(inv.chainId)}.`);
  else if (!chain.enabled) blockers.push(`Payments are disabled on ${chain.name}: this chain is not enabled in this release.`);
  let token: Review['token'];
  if (inv.token === 'native') {
    token = { symbol: chain?.nativeSymbol ?? 'native', decimals: 18, address: 'native', config: undefined };
  } else {
    const cfg = findToken(inv.chainId, inv.token);
    if (cfg === undefined) blockers.push('This token is not on the allowlist for this chain.');
    else token = { symbol: cfg.symbol, decimals: cfg.decimals, address: cfg.address, config: cfg };
  }
  let loaded: DeploymentManifest | undefined;
  if (manifest.status === 'loaded') loaded = manifest.manifest;
  else if (chain?.enabled === true) {
    blockers.push(
      manifest.status === 'invalid'
        ? 'Payments disabled on this chain: the deployment manifest failed validation.'
        : 'Payments disabled on this chain: no deployment manifest is loaded.',
    );
  }
  return { invoice: inv, trust, encrypted: parsed.encrypted, expiry, chain, token, totals, manifest: loaded, blockers };
}

/** A client that refuses all network use; lets the adapter build calldata with no RPC configured. */
export function offlineClient(chainId: number): RpcClient {
  const no = (): Promise<never> => Promise.reject(new UserFacingError('No RPC is configured for this chain.'));
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
    throw new UserFacingError('This payment is blocked. Resolve the items in the review first.');
  }
  const rpc = client ?? offlineClient(chain.chainId);
  const adapter = createEvmAdapter({ chain, deployment: manifest, client: rpc });
  let quoted: bigint | undefined;
  const inv = review.invoice;
  if (inv.amountPolicy.mode === 'fiat_quote') {
    if (client === undefined) throw new UserFacingError('This invoice is priced in fiat. Configure an RPC for this chain in Settings so the app can read the price feed.');
    const feed = (deps.findFeedFn ?? findFeed)(chain.chainId, token.symbol, inv.fiat.currency);
    if (feed === undefined) {
      throw new UserFacingError(`No price feed is configured for ${token.symbol}/${inv.fiat.currency} on ${chain.name}. This invoice cannot be paid from this app version.`);
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
  if (p !== undefined && !p.accepted) throw new UserFacingError('The seller does not accept a gas buffer for this invoice. Pay without one.');
  if (bufferWei > MAX_BUFFER_WEI) throw new UserFacingError('The gas buffer exceeds the safety cap.');
  if (p === undefined) return;
  if (bufferWei > BigInt(p.maxWei)) throw new UserFacingError('The gas buffer would exceed the seller’s maximum for this invoice. Pay without a buffer or try later.');
  if (bufferWei < BigInt(p.minWei)) throw new UserFacingError('The gas buffer is below the seller’s minimum for this invoice. Prepare it again.');
}

/**
 * Applies a v2 invoice's seller `bufferPolicy` to a fresh quote (ADR-0024): declined -> refused; an estimate below
 * `minWei` is raised to `minWei` (flagged so the UI shows it); anything above `min(maxWei, app cap)` is refused, as is a
 * seller floor above the app cap. v1 invoices return the quote unchanged.
 */
export function applyBufferPolicy(quote: BufferQuote, invoice: Invoice): BufferQuote {
  const p = invoice.bufferPolicy;
  if (p === undefined) return quote;
  if (!p.accepted) throw new UserFacingError('The seller does not accept a gas buffer for this invoice. Pay without one.');
  const min = BigInt(p.minWei);
  if (min > MAX_BUFFER_WEI) throw new UserFacingError('The seller’s minimum gas buffer is above this app’s safety cap. Pay without a buffer.');
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
      throw new UserFacingError('The token transfer could not be simulated, so a safe gas buffer cannot be sized. Pay without a buffer or try again.');
    }
    if (simulated === 0n || simulated > MAX_SIMULATED_SWEEP_GAS) {
      throw new UserFacingError('The simulated token transfer needs an unexpected amount of gas. A gas buffer is not offered for this token.');
    }
    const margined = (simulated * (FEE_SCHEDULE.BPS + SWEEP_SIMULATION_MARGIN_BPS) + FEE_SCHEDULE.BPS - 1n) / FEE_SCHEDULE.BPS;
    if (margined > gasLimit) gasLimit = margined;
  }
  const gasPrice = parseQuantity(await rpc.request('eth_gasPrice', []));
  const maxFeePerGas = gasPrice * 2n;
  const bufferWei = calculateBuffer({ estimatedSweepGas: gasLimit, maxFeePerGas, safetyBps: FEE_SCHEDULE.DEFAULT_BUFFER_SAFETY_BPS });
  if (bufferWei > MAX_BUFFER_WEI) throw new UserFacingError('The estimated gas buffer exceeds the safety cap. Gas looks unusually high; try again later.');
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
  if (rpc === undefined) throw new UserFacingError('A gas buffer needs an RPC for this chain to re-check gas before sending.');
  const gasPrice = parseQuantity(await rpc.request('eth_gasPrice', []));
  // The quote's safety margin exists to absorb drift, so only the margin-free requirement at today's price must fit;
  // otherwise every small fee tick would force the user to prepare again.
  const required = calculateBuffer({ estimatedSweepGas: quote.gasLimit, maxFeePerGas: gasPrice * 2n, safetyBps: 0n });
  if (required > built.tx.value) {
    throw new UserFacingError('Gas prices rose since the buffer was quoted, so the prepared buffer may not cover the sweep. Prepare the payment again.');
  }
}

/**
 * Spec 13 TTL at send: a prepared buffer quote is valid only until its `expiresAt`. The calldata is never rewritten;
 * the payer must prepare again. Callers pass a fresh clock before and after every await.
 */
export function assertPreparedBufferFresh(built: BuiltPayment, nowSeconds: number): void {
  const quote = builtBufferQuotes.get(built);
  if (quote !== undefined && nowSeconds >= quote.expiresAt) {
    throw new UserFacingError('The gas buffer quote expired before sending. Nothing was sent. Prepare the payment again.');
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
  if (expiry.invoiceExpired) throw new UserFacingError('This invoice has expired. Nothing was sent.');
  if (invoice.amountPolicy.mode === 'fiat_quote' && expiry.quoteExpired) throw new UserFacingError('The seller’s price quote has expired. Nothing was sent. Ask for a new invoice.');
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
    if (ctx.review.invoice.token === 'native') throw new UserFacingError('A gas buffer applies to token payments only.');
    if (opts.nowSeconds >= opts.buffer.expiresAt) throw new UserFacingError('The gas buffer quote expired. Refresh it and review again.');
    assertBufferWithinPolicy(opts.buffer.bufferWei, ctx.review.invoice);
  }
  const inv = ctx.review.invoice;
  assertInvoiceStillPayable(inv, opts.nowSeconds);
  if (opts.deadlineSeconds !== undefined && opts.deadlineSeconds > lastPayableSecond(inv)) {
    throw new UserFacingError('Blocked: the payment deadline would outlive the invoice. Prepare it again.');
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
  if (builtPaymentContexts.get(built) !== ctx) throw new UserFacingError('Blocked: the prepared payment belongs to a different reviewed invoice. Prepare it again.');
  assertPreviewMatchesCalldata(built.preview, built.tx, ctx.chain.chainId);
  const p = built.preview;
  const inv = ctx.review.invoice;
  const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();
  if (!same(built.tx.to, ctx.manifest.router) || !same(p.router, ctx.manifest.router)) throw new UserFacingError('Blocked: the transaction does not target the manifest router.');
  if (p.chainId !== inv.chainId) throw new UserFacingError('Blocked: chain differs from the invoice.');
  if (p.token === 'native' ? inv.token !== 'native' : !same(p.token, inv.token)) throw new UserFacingError('Blocked: token differs from the invoice.');
  if (p.gross !== ctx.request.grossAmount || p.fee !== ctx.request.feeAmount || p.net !== ctx.request.netAmount) {
    throw new UserFacingError('Blocked: amounts differ from the reviewed amounts.');
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
    throw new UserFacingError('Blocked: approval calldata could not be decoded.');
  }
  if (decoded.functionName !== 'approve' || tx.value !== 0n || tx.to.toLowerCase() !== token.toLowerCase()) {
    throw new UserFacingError('Blocked: unexpected approval transaction.');
  }
  const [s, a] = decoded.args;
  if (s.toLowerCase() !== spender.toLowerCase() || a !== amount) throw new UserFacingError('Blocked: approval spender or amount differs from the preview.');
}

export async function readAllowance(rpc: Pick<RpcClient, 'request'>, token: Address, owner: Address, spender: Address): Promise<bigint> {
  const data = encodeFunctionData({ abi: erc20Abi, functionName: 'allowance', args: [owner, spender] });
  const r = await rpc.request('eth_call', [{ to: token, data }, 'latest']);
  if (typeof r !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(r)) throw new UserFacingError('Your RPC returned an unexpected allowance.');
  return BigInt(r);
}

export function permitReader(rpc: Pick<RpcClient, 'request'>, version: string): PermitReader {
  const call = async (to: Address, data: Hex): Promise<Hex> => {
    const r = await rpc.request('eth_call', [{ to, data }, 'latest']);
    if (typeof r !== 'string' || !/^0x(?:[0-9a-fA-F]{2})*$/.test(r)) throw new UserFacingError('Your RPC returned an unexpected result.');
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
const PERMIT_STATE_TEXT: Readonly<Record<PermitState, string>> = {
  ok_to_permit: 'The permit checks passed: the token will accept this signature for exactly the shown amount.',
  already_allowed: 'Your existing allowance already covers this payment, so no permit is needed and none will be used.',
  nonce_consumed: 'This permit was already used or replaced (its nonce is spent) and your allowance does not cover the payment. Nothing was paid. Prepare the payment again, or pay with a one-time approval.',
  sig_invalid: 'The token rejected this permit signature. Nothing was paid and it will not be retried automatically. Press Prepare again to pay with a one-time approval instead, or add a gas buffer.',
  expired: 'The permit expired before it could be used. Nothing was paid. Prepare the payment again.',
  unsupported_token: 'This token does not accept standard ERC-2612 permits. Nothing was signed or paid. Press Prepare again to pay with a one-time approval instead.',
};

export function permitStateMessage(state: PermitState): string {
  return PERMIT_STATE_TEXT[state];
}

/**
 * Reads for the spec 04 permit classifier over the user's RPC. `simulatePermit` is a static `permit(...)` call; any
 * rejection counts as "the token would not accept it" (fail closed: the user falls back to an approval).
 */
export function permitPreflightReader(rpc: Pick<RpcClient, 'request'>): PermitPreflightReader {
  const base = permitReader(rpc, '1');
  return {
    allowance: (token, owner, spender) => readAllowance(rpc, token, owner, spender),
    nonce: (token, owner) => base.nonce(token, owner),
    async domainSeparator(token) {
      const data = encodeFunctionData({ abi: erc2612PermitAbi, functionName: 'DOMAIN_SEPARATOR' });
      const r = await rpc.request('eth_call', [{ to: token, data }, 'latest']);
      if (typeof r !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(r)) throw new UserFacingError('Your RPC returned an unexpected DOMAIN_SEPARATOR.');
      return r as Hex;
    },
    async simulatePermit(token, a) {
      const data = encodeFunctionData({ abi: erc2612PermitAbi, functionName: 'permit', args: [a.owner, a.spender, a.value, a.deadline, a.v, a.r, a.s] });
      try {
        const r = await rpc.request('eth_call', [{ from: a.owner, to: token, data }, 'latest']);
        return typeof r === 'string' && /^0x(?:[0-9a-fA-F]{2})*$/.test(r);
      } catch {
        return false;
      }
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
  if (getAddress(recovered) !== getAddress(account)) throw new UserFacingError('Blocked: the permit signature does not match your account.');
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
  throw last instanceof Error ? last : new UserFacingError('Could not build the permit request.');
}
