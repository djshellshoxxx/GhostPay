import {
  chainlinkAggregatorAbi,
  eip712DomainSeparator,
  erc20Abi,
  erc20MetadataAbi,
  erc2612PermitAbi,
  type Address,
  type BuiltPayment,
  type Hex,
  type FeedConfig,
} from '@ghostpay/chain-adapters';
import { createInvoice, signInvoice, parseFragment, encodeFragment } from '@ghostpay/invoice-schema';
import { decodeFunctionData, encodeFunctionResult } from 'viem/utils';
import { privateKeyToAccount } from 'viem/accounts';
import { afterEach, describe, expect, it } from 'vitest';
import { FAKE_FEE_RECIPIENT, FAKE_ROUTER, fakeManifest } from '../test/fakeManifest';
import { BASE_FORM, NOW, USDC_84532, makeParsed } from '../test/invoiceFixtures';
import { mockRpc } from '../test/mockRpc';
import { buildInvoiceLink } from './invoiceCreate';
import {
  BUFFER_QUOTE_TTL_SECONDS,
  MAX_BUFFER_WEI,
  assertApproveTx,
  assertPermitSigner,
  assertReadyToSend,
  buildApproveTx,
  buildFinal,
  buildPermit,
  createPayContext,
  decodeForDisplay,
  fixedAmountWarnings,
  offlineClient,
  permitReader,
  quoteBuffer,
  assertBufferStillSufficient,
  applyBufferPolicy,
  bufferOffered,
  MAX_SIMULATED_SWEEP_GAS,
  SWEEP_GAS_ESTIMATE,
  readAllowance,
  reviewInvoice,
  trustView,
  typedDataJson,
  type PayContext,
} from './pay';
import { clearSession, generateSession, requireSession } from './session';
import type { ManifestState } from './manifest';
import { currentSignerHex } from '../test/keys';

const LOADED = (chainId: number): ManifestState => ({ status: 'loaded', manifest: fakeManifest(chainId) });

afterEach(() => {
  clearSession();
});

describe('trustView (ADR-0010 wording)', () => {
  it('never says "verified seller"; shows the key and "not pinned"', async () => {
    const { parsed } = await makeParsed();
    const t = trustView(parsed);
    expect(t.kind).toBe('valid-signature');
    expect(t.text).toContain(`Signature matches key ${parsed.invoice.signer} (not pinned)`);
    expect(t.text.toLowerCase()).not.toContain('verified seller');
  });
  it('describes a pinned key as pinned, still not as a legal identity', async () => {
    generateSession();
    const link = await buildInvoiceLink(BASE_FORM, 'https://a/', NOW);
    const pinned = await parseFragment(link.fragment, { pinnedSigners: [currentSignerHex()] });
    const t = trustView(pinned);
    expect(t.kind).toBe('trusted-seller');
    expect(t.text).toContain('(pinned by you)');
    expect(t.text).toContain('not a legal seller');
  });
  it('flags an invalid signature as a hard stop', async () => {
    const { parsed } = await makeParsed();
    const t = trustView({ ...parsed, trust: 'invalid-signature', verification: { signatureValid: false, signerPinned: false } });
    expect(t.kind).toBe('invalid-signature');
    expect(t.text).toMatch(/INVALID/);
  });
});

describe('reviewInvoice', () => {
  it('has no blockers for a good invoice with a loaded manifest', async () => {
    const { parsed } = await makeParsed();
    const r = reviewInvoice(parsed, NOW + 10, LOADED(84532));
    expect(r.blockers).toEqual([]);
    expect(r.token).toMatchObject({ symbol: 'USDC', decimals: 6 });
    expect(r.chain?.name).toBe('Base Sepolia');
    expect(r.manifest?.feeRecipient).toBe(FAKE_FEE_RECIPIENT);
    expect(r.totals.total).toBe(10_000n);
  });
  it('says payments are disabled when no manifest is loaded (absent or invalid)', async () => {
    const { parsed } = await makeParsed();
    expect(reviewInvoice(parsed, NOW, { status: 'absent' }).blockers).toContain('Payments disabled on this chain: no deployment manifest is loaded.');
    expect(reviewInvoice(parsed, NOW, { status: 'invalid', reason: 'x' }).blockers.join(' ')).toMatch(/failed validation/);
    expect(reviewInvoice(parsed, NOW, { status: 'absent' }).manifest).toBeUndefined();
  });
  it('blocks expired invoices and expired fiat quotes', async () => {
    const { parsed } = await makeParsed();
    expect(reviewInvoice(parsed, NOW + 24 * 3600 + 1, LOADED(84532)).blockers).toContain('This invoice has expired.');
    const { parsed: fiat } = await makeParsed({ amountMode: 'fiat_quote' });
    expect(reviewInvoice(fiat, NOW + 16 * 60, LOADED(84532)).blockers.join(' ')).toMatch(/quote has expired/);
    expect(reviewInvoice(parsed, NOW + 16 * 60, LOADED(84532)).blockers.join(' ')).not.toMatch(/quote has expired/);
  });
  it('blocks mainnets (disabled) and unknown chains', async () => {
    const mainnet = await parseOf({ chainId: 8453, token: 'native' });
    expect(reviewInvoice(mainnet, NOW, LOADED(8453)).blockers.join(' ')).toMatch(/disabled on Base/);
    const unknown = await parseOf({ chainId: 999_999, token: 'native' });
    expect(reviewInvoice(unknown, NOW, { status: 'absent' }).blockers.join(' ')).toMatch(/Unknown chain/);
  });
  it('blocks tokens that are not allowlisted', async () => {
    const t = await parseOf({ token: '0x0000000000000000000000000000000000000001' });
    expect(reviewInvoice(t, NOW, LOADED(84532)).blockers.join(' ')).toMatch(/allowlist/);
  });
  it('blocks totals that do not add up', async () => {
    const t = await parseOf({ fiat: { currency: 'USD', minorUnits: '99999' } });
    expect(reviewInvoice(t, NOW, LOADED(84532)).blockers.join(' ')).toMatch(/totals do not add up/);
  });
  it('blocks an invalid signature', async () => {
    const { parsed } = await makeParsed();
    const bad = { ...parsed, trust: 'invalid-signature' as const, verification: { signatureValid: false, signerPinned: false } };
    expect(reviewInvoice(bad, NOW, LOADED(84532)).blockers.join(' ')).toMatch(/INVALID/);
  });
  it('describes native tokens with the chain symbol', async () => {
    const { parsed } = await makeParsed({ token: 'native', tokenAmount: '0.5' });
    expect(reviewInvoice(parsed, NOW, LOADED(84532)).token).toMatchObject({ symbol: 'ETH', decimals: 18, address: 'native' });
  });
});

describe('fixed token amount against the seller-stated fiat total (L2-F4)', () => {
  const warningsFor = async (patch: Parameters<typeof makeParsed>[0]): Promise<readonly string[]> =>
    reviewInvoice((await makeParsed(patch)).parsed, NOW, LOADED(84532)).warnings;
  const oneItem = (unitPrice: string): Parameters<typeof makeParsed>[0] => ({ lineItems: [{ description: 'Consulting', quantity: '1', unitPrice }] });

  it('warns, without blocking, when a USD stablecoin amount is more than 1 % away from the USD total', async () => {
    const { parsed } = await makeParsed({ ...oneItem('10.00'), tokenAmount: '1000' });
    const r = reviewInvoice(parsed, NOW, LOADED(84532));
    expect(r.blockers).toEqual([]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatch(/fixed amount of 1000 USDC differs by more than 1 % from the seller-stated total of USD 10\.00/);
    expect(r.warnings[0]).toMatch(/You pay the token amount/);
  });
  it('accepts a difference of up to 1 % in either direction', async () => {
    expect(await warningsFor({ tokenAmount: '100' })).toEqual([]);
    expect(await warningsFor({ tokenAmount: '101' })).toEqual([]);
    expect(await warningsFor({ tokenAmount: '99' })).toEqual([]);
    expect(await warningsFor({ tokenAmount: '101.000001' })).toHaveLength(1);
    expect(await warningsFor({ tokenAmount: '98.999999' })).toHaveLength(1);
  });
  it('compares only a stablecoin with a total in its own currency, and only in fixed-token mode', async () => {
    expect(await warningsFor({ currency: 'EUR', tokenAmount: '1000' })).toEqual([]);
    expect(await warningsFor({ token: 'native', tokenAmount: '1000' })).toEqual([]);
    expect(await warningsFor({ amountMode: 'fiat_quote' })).toEqual([]);
  });
  it('flags zero-priced line items, but not an invoice that states no fiat figure at all', async () => {
    expect(await warningsFor({ ...oneItem('0'), tokenAmount: '1000' })).toHaveLength(1);
    const none = await parseOf({ lineItems: [], fiat: { currency: 'USD', minorUnits: '0' } });
    expect(reviewInvoice(none, NOW, LOADED(84532)).warnings).toEqual([]);
  });
  it('knows EUR stablecoins too, at their own decimals', async () => {
    const { parsed } = await makeParsed({ currency: 'EUR', tokenAmount: '100' });
    const eurc = { symbol: 'EURC', decimals: 6, address: USDC_84532 as Address, config: undefined };
    expect(fixedAmountWarnings(parsed.invoice, eurc)).toEqual([]);
    const far = await makeParsed({ currency: 'EUR', ...oneItem('10.00'), tokenAmount: '100' });
    expect(fixedAmountWarnings(far.parsed.invoice, eurc).join(' ')).toMatch(/EURC is a EUR stablecoin.*100 EURC.*EUR 10\.00/);
    expect(fixedAmountWarnings(far.parsed.invoice, undefined)).toEqual([]);
  });
});

async function parseOf(overrides: Record<string, unknown>): Promise<Awaited<ReturnType<typeof parseFragment>>> {
  generateSession();
  const { parsed } = await makeParsed();
  const inv = createInvoice({ ...stripId(parsed.invoice), ...overrides } as never);
  const signed = signInvoice(inv, signingKey());
  return parseFragment(await encodeFragment(signed));
}
function stripId(i: object): Record<string, unknown> {
  const { v: _v, schemeId: _s, nonce: _n, ...rest } = i as Record<string, unknown>;
  void _v;
  void _s;
  void _n;
  return rest;
}
function signingKey(): Uint8Array {
  return Uint8Array.from(requireSession().signingKey);
}

describe('createPayContext and amounts', () => {
  async function ctxFor(patch: Parameters<typeof makeParsed>[0] = {}, manifest = LOADED(84532)): Promise<PayContext> {
    const { parsed } = await makeParsed(patch);
    return createPayContext(reviewInvoice(parsed, NOW, manifest), undefined, { nowSeconds: NOW });
  }
  it('computes gross, 0.25 % fee and net (seller pays)', async () => {
    const c = await ctxFor();
    expect(c.request.grossAmount).toBe(100_000_000n);
    expect(c.request.feeAmount).toBe(250_000n);
    expect(c.request.netAmount).toBe(99_750_000n);
    expect(c.request.feeRecipient).toBe(FAKE_FEE_RECIPIENT);
    expect(c.request.router).toBe(FAKE_ROUTER);
  });
  it('payer-pays grosses up so the seller nets the invoice amount', async () => {
    const c = await ctxFor({ feePolicy: 'payer_pays' });
    expect(c.request.netAmount).toBeGreaterThanOrEqual(100_000_000n);
    expect(c.request.grossAmount).toBeGreaterThan(100_000_000n);
  });
  it('refuses a blocked review', async () => {
    const { parsed } = await makeParsed();
    await expect(createPayContext(reviewInvoice(parsed, NOW, { status: 'absent' }), undefined, { nowSeconds: NOW })).rejects.toThrow(/blocked/);
  });
  it('fiat-quote invoices need an RPC and a configured feed (fail closed)', async () => {
    const { parsed } = await makeParsed({ amountMode: 'fiat_quote' });
    const review = reviewInvoice(parsed, NOW, LOADED(84532));
    await expect(createPayContext(review, undefined, { nowSeconds: NOW })).rejects.toThrow(/Configure an RPC/);
    await expect(createPayContext(review, mockRpc(84532, () => '0x'), { nowSeconds: NOW })).rejects.toThrow(/No price feed is configured/);
  });
  it('converts fiat with a fresh feed, rounding up for the payer', async () => {
    const { parsed } = await makeParsed({ amountMode: 'fiat_quote' });
    const review = reviewInvoice(parsed, NOW, LOADED(84532));
    const feed: FeedConfig = { chainId: 84532, address: '0x7777777777777777777777777777777777777777', base: 'USDC', quote: 'USD', sourceRef: 'docs/chains/SOURCES-2026-10-25.md (retrieved 2026-10-25)' };
    const rpc = mockRpc(84532, (method, params) => {
      expect(method).toBe('eth_call');
      const data = (params[0] as { data: string }).data;
      if (data.startsWith('0x313ce567')) return encodeFunctionResult({ abi: chainlinkAggregatorAbi, functionName: 'decimals', result: 8 });
      return encodeFunctionResult({ abi: chainlinkAggregatorAbi, functionName: 'latestRoundData', result: [1n, 100_000_000n, BigInt(NOW), BigInt(NOW), 1n] });
    });
    const c = await createPayContext(review, rpc, { nowSeconds: NOW, findFeedFn: () => feed });
    expect(c.quotedTokenAmount).toBe(100_000_000n); // 100.00 USD at 1.00 USD per USDC, 6 decimals
    expect(c.request.grossAmount).toBe(100_000_000n);
  });
  it('offline client refuses every network call', async () => {
    const c = offlineClient(1);
    await expect(c.request('x', [])).rejects.toThrow(/No RPC/);
    await expect(c.blockNumber()).rejects.toThrow();
  });
});

describe('buildFinal and the preview-equals-calldata gate', () => {
  async function built(patch: Parameters<typeof makeParsed>[0] = {}, opts: Partial<Parameters<typeof buildFinal>[1]> = {}): Promise<{ ctx: PayContext; b: BuiltPayment }> {
    const { parsed } = await makeParsed(patch);
    const ctx = await createPayContext(reviewInvoice(parsed, NOW, LOADED(84532)), undefined, { nowSeconds: NOW });
    return { ctx, b: buildFinal(ctx, { nowSeconds: NOW, ...opts }) };
  }
  it('builds ERC-20 and native payments that pass the gate', async () => {
    const e = await built();
    expect(e.b.preview.method).toBe('payERC20');
    expect(() => assertReadyToSend(e.b, e.ctx)).not.toThrow();
    expect(decodeForDisplay(e.b, 84532).gross).toBe(100_000_000n);
    const n = await built({ token: 'native', tokenAmount: '0.5' });
    expect(n.b.preview.method).toBe('payNative');
    expect(n.b.tx.value).toBe(500_000_000_000_000_000n);
    expect(() => assertReadyToSend(n.b, n.ctx)).not.toThrow();
  });
  it('uses a fresh one-time address and ephemeral key every time', async () => {
    const { parsed } = await makeParsed();
    const ctx = await createPayContext(reviewInvoice(parsed, NOW, LOADED(84532)), undefined, { nowSeconds: NOW });
    const a = buildFinal(ctx, { nowSeconds: NOW });
    const b = buildFinal(ctx, { nowSeconds: NOW });
    expect(a.preview.stealth).not.toBe(b.preview.stealth);
    expect(a.preview.ephemeralPublicKey).not.toBe(b.preview.ephemeralPublicKey);
  });
  it('refuses to rebind a prepared payment to another invoice with the same chain, token, and amount', async () => {
    const first = await built({ token: 'native', tokenAmount: '0.5' });
    const second = await built({ token: 'native', tokenAmount: '0.5' });
    expect(first.b.preview.stealth).not.toBe(second.b.preview.stealth);
    expect(() => assertReadyToSend(first.b, second.ctx)).toThrow(/different reviewed invoice/);
  });
  it('REFUSES when the calldata was mutated after the preview was made', async () => {
    const { ctx, b } = await built();
    const flip = (hex: string, at: number): `0x${string}` => `0x${hex.slice(2, at)}${hex[at] === '0' ? '1' : '0'}${hex.slice(at + 1)}` as `0x${string}`;
    // Mutate the amount word area, the destination area and the metadata tail.
    for (const at of [20, 80, 140, b.tx.data.length - 10]) {
      const tampered: BuiltPayment = { ...b, tx: { ...b.tx, data: flip(b.tx.data, at) } };
      expect(() => assertReadyToSend(tampered, ctx), `offset ${String(at)}`).toThrow();
    }
  });
  it('REFUSES a changed target, value, or a different preview than the reviewed amounts', async () => {
    const { ctx, b } = await built();
    expect(() => assertReadyToSend({ ...b, tx: { ...b.tx, to: '0x9999999999999999999999999999999999999999' } }, ctx)).toThrow();
    expect(() => assertReadyToSend({ ...b, tx: { ...b.tx, value: 1n } }, ctx)).toThrow();
    expect(() => assertReadyToSend({ ...b, preview: { ...b.preview, gross: b.preview.gross + 1n } }, ctx)).toThrow();
    const otherCtx: PayContext = { ...ctx, request: { ...ctx.request, grossAmount: ctx.request.grossAmount + 1n } };
    expect(() => assertReadyToSend(b, otherCtx)).toThrow(/different reviewed invoice/);
    const otherManifest: PayContext = { ...ctx, manifest: { ...ctx.manifest, router: '0x8888888888888888888888888888888888888888' } };
    expect(() => assertReadyToSend(b, otherManifest)).toThrow(/different reviewed invoice/);
  });
  it('REFUSES when token or chain in the preview differ from the invoice', async () => {
    const { ctx, b } = await built();
    const invoiceNative = { ...ctx, review: { ...ctx.review, invoice: { ...ctx.review.invoice, token: 'native' } } };
    expect(() => assertReadyToSend(b, invoiceNative)).toThrow(/different reviewed invoice/);
    const n = await built({ token: 'native', tokenAmount: '0.1' });
    const invoiceErc = { ...n.ctx, review: { ...n.ctx.review, invoice: { ...n.ctx.review.invoice, token: USDC_84532 } } };
    expect(() => assertReadyToSend(n.b, invoiceErc)).toThrow(/different reviewed invoice/);
    const wrongChain = { ...ctx, review: { ...ctx.review, invoice: { ...ctx.review.invoice, chainId: 1 } } };
    expect(() => assertReadyToSend(b, wrongChain)).toThrow(/different reviewed invoice/);
  });
  it('builds buffer payments with a capped, unexpired quote only', async () => {
    const { parsed } = await makeParsed();
    const ctx = await createPayContext(reviewInvoice(parsed, NOW, LOADED(84532)), undefined, { nowSeconds: NOW });
    const q = { bufferWei: 123_456n, maxFeePerGas: 1n, gasLimit: 1n, safetyBps: 2000n, quotedAt: NOW, expiresAt: NOW + BUFFER_QUOTE_TTL_SECONDS, gasSource: 'default' as const };
    const b = buildFinal(ctx, { nowSeconds: NOW, buffer: q });
    expect(b.preview.method).toBe('payERC20WithBuffer');
    expect(b.tx.value).toBe(123_456n);
    expect(() => assertReadyToSend(b, ctx)).not.toThrow();
    expect(() => buildFinal(ctx, { nowSeconds: NOW + 200, buffer: q })).toThrow(/expired/);
    expect(() => buildFinal(ctx, { nowSeconds: NOW, buffer: { ...q, bufferWei: MAX_BUFFER_WEI + 1n } })).toThrow(/safety cap/);
    const native = await built({ token: 'native', tokenAmount: '0.1' });
    expect(() => buildFinal(native.ctx, { nowSeconds: NOW, buffer: q })).toThrow(/token payments only/);
  });
});

describe('seller bufferPolicy (invoice v2, ADR-0024)', () => {
  const gwei = mockRpc(84532, () => '0x3b9aca00'); // quote = 0.00024 ETH = 240_000_000_000_000 wei
  const QUOTED = 240_000_000_000_000n;
  async function v2ctx(policy: { accepted: boolean; maxWei: string; minWei: string }): Promise<PayContext> {
    const { parsed } = await makeParsed({ bufferPolicy: { ...policy, refund: 'none' } });
    expect(parsed.invoice.v).toBe(2);
    return createPayContext(reviewInvoice(parsed, NOW, LOADED(84532)), undefined, { nowSeconds: NOW });
  }

  it('v1 invoices keep the app-only rules', async () => {
    const { parsed } = await makeParsed();
    const q = await quoteBuffer(gwei, NOW);
    expect(bufferOffered(parsed.invoice)).toBe(true);
    expect(applyBufferPolicy(q, parsed.invoice)).toBe(q);
  });

  it('declined: no buffer is offered, quoted or built', async () => {
    const ctx = await v2ctx({ accepted: false, maxWei: '0', minWei: '0' });
    const q = await quoteBuffer(gwei, NOW);
    expect(bufferOffered(ctx.review.invoice)).toBe(false);
    expect(() => applyBufferPolicy(q, ctx.review.invoice)).toThrow(/does not accept a gas buffer/);
    expect(() => buildFinal(ctx, { nowSeconds: NOW, buffer: q })).toThrow(/does not accept a gas buffer/);
  });

  it('within bounds: the estimate is used unchanged', async () => {
    const ctx = await v2ctx({ accepted: true, maxWei: (QUOTED * 2n).toString(), minWei: '1' });
    const q = await quoteBuffer(gwei, NOW);
    const p = applyBufferPolicy(q, ctx.review.invoice);
    expect(p.bufferWei).toBe(QUOTED);
    expect(buildFinal(ctx, { nowSeconds: NOW, buffer: p }).tx.value).toBe(QUOTED);
  });

  it('dust floor: an estimate below minWei is raised to minWei and flagged for display', async () => {
    const min = QUOTED + 1n;
    const ctx = await v2ctx({ accepted: true, maxWei: (QUOTED * 2n).toString(), minWei: min.toString() });
    const p = applyBufferPolicy(await quoteBuffer(gwei, NOW), ctx.review.invoice);
    expect(p.bufferWei).toBe(min);
    expect(p.raisedToSellerMinimum).toBe(true);
    expect(buildFinal(ctx, { nowSeconds: NOW, buffer: p }).tx.value).toBe(min);
  });

  it('over the seller maximum (or a floor above the app cap) is refused; buildFinal enforces the bounds too', async () => {
    const ctx = await v2ctx({ accepted: true, maxWei: (QUOTED - 1n).toString(), minWei: '1' });
    const q = await quoteBuffer(gwei, NOW);
    expect(() => applyBufferPolicy(q, ctx.review.invoice)).toThrow(/seller.s maximum/);
    expect(() => buildFinal(ctx, { nowSeconds: NOW, buffer: q })).toThrow(/seller.s maximum/);
    const high = await v2ctx({ accepted: true, maxWei: (MAX_BUFFER_WEI * 2n).toString(), minWei: (MAX_BUFFER_WEI + 1n).toString() });
    expect(() => applyBufferPolicy(q, high.review.invoice)).toThrow(/safety cap/);
    const floor = await v2ctx({ accepted: true, maxWei: (QUOTED * 2n).toString(), minWei: (QUOTED + 1n).toString() });
    expect(() => buildFinal(floor, { nowSeconds: NOW, buffer: q })).toThrow(/seller.s minimum/);
  });
});

describe('quoteBuffer (Feature 1)', () => {
  it('sizes the buffer from the RPC gas price with 20 % safety', async () => {
    const q = await quoteBuffer(mockRpc(84532, () => '0x3b9aca00'), NOW); // 1 gwei
    // 100_000 gas * 2 gwei * 1.2
    expect(q.bufferWei).toBe(100_000n * 2_000_000_000n * 12n / 10n);
    expect(q.expiresAt - q.quotedAt).toBe(BUFFER_QUOTE_TTL_SECONDS);
  });
  it('fails closed when gas is absurdly high or the RPC misbehaves', async () => {
    await expect(quoteBuffer(mockRpc(84532, () => `0x${(10n ** 12n).toString(16)}`), NOW)).rejects.toThrow(/safety cap/);
    await expect(quoteBuffer(mockRpc(84532, () => 'nope'), NOW)).rejects.toThrow();
  });
  it('rejects quotes older than 60 s (spec 13)', () => {
    expect(BUFFER_QUOTE_TTL_SECONDS).toBe(60);
  });
  const SWEEP = { token: USDC_84532 as Address, from: '0x5555555555555555555555555555555555555555' as Address, amount: 1_000_000n };
  const gasRpc = (estimate: () => unknown) => mockRpc(84532, (method) => (method === 'eth_estimateGas' ? estimate() : '0x3b9aca00'));
  it('uses a token-specific transfer simulation, margined, never below the default table value', async () => {
    const rpc = gasRpc(() => `0x${(200_000).toString(16)}`);
    const q = await quoteBuffer(rpc, NOW, SWEEP);
    expect(q.gasSource).toBe('simulated');
    expect(q.gasLimit).toBe(250_000n);
    expect(q.bufferWei).toBe(250_000n * 2_000_000_000n * 12n / 10n);
    const call = rpc.calls.find((c) => c.method === 'eth_estimateGas')!;
    const [tx] = call.params as [{ from: string; to: string; data: Hex }];
    expect(tx.to).toBe(SWEEP.token);
    expect(tx.from).toBe(SWEEP.from);
    const decoded = decodeFunctionData({ abi: erc20Abi, data: tx.data });
    expect(decoded.functionName).toBe('transfer');
    expect(decoded.args[1]).toBe(SWEEP.amount);
    // A cheap simulated transfer keeps the conservative default floor.
    expect((await quoteBuffer(gasRpc(() => '0xc350'), NOW, SWEEP)).gasLimit).toBe(SWEEP_GAS_ESTIMATE);
    expect((await quoteBuffer(gasRpc(() => '0x3b9aca00'), NOW)).gasSource).toBe('default');
  });
  it('fails closed when the sweep simulation fails or is implausible', async () => {
    await expect(quoteBuffer(gasRpc(() => { throw new Error('execution reverted'); }), NOW, SWEEP)).rejects.toThrow(/could not be simulated/);
    await expect(quoteBuffer(gasRpc(() => 'garbage'), NOW, SWEEP)).rejects.toThrow(/could not be simulated/);
    await expect(quoteBuffer(gasRpc(() => '0x0'), NOW, SWEEP)).rejects.toThrow(/unexpected amount of gas/);
    await expect(quoteBuffer(gasRpc(() => `0x${(MAX_SIMULATED_SWEEP_GAS + 1n).toString(16)}`), NOW, SWEEP)).rejects.toThrow(/unexpected amount of gas/);
  });
});

describe('assertBufferStillSufficient (spec 13 re-estimate before send)', () => {
  const quoteAt = (gwei: bigint) => ({ bufferWei: 100_000n * gwei * 2_000_000_000n * 12n / 10n, maxFeePerGas: gwei * 2_000_000_000n, gasLimit: 100_000n, safetyBps: 2000n, quotedAt: NOW, expiresAt: NOW + BUFFER_QUOTE_TTL_SECONDS, gasSource: 'default' as const });
  const priced = (gwei: bigint) => mockRpc(84532, () => `0x${(gwei * 1_000_000_000n).toString(16)}`);
  it('passes when gas is unchanged, lower or within the safety margin; blocks when gas rose beyond it', async () => {
    const { parsed } = await makeParsed();
    const ctx = await createPayContext(reviewInvoice(parsed, NOW, LOADED(84532)), undefined, { nowSeconds: NOW });
    const b = buildFinal(ctx, { nowSeconds: NOW, buffer: quoteAt(1n) });
    await expect(assertBufferStillSufficient(b, priced(1n))).resolves.toBeUndefined();
    await expect(assertBufferStillSufficient(b, mockRpc(84532, () => '0x1'))).resolves.toBeUndefined();
    // Drift inside the 20 % safety margin is tolerated; beyond it the send is blocked.
    await expect(assertBufferStillSufficient(b, mockRpc(84532, () => `0x${(1_200_000_000n).toString(16)}`))).resolves.toBeUndefined();
    await expect(assertBufferStillSufficient(b, mockRpc(84532, () => `0x${(1_200_000_001n).toString(16)}`))).rejects.toThrow(/Gas prices rose/);
    await expect(assertBufferStillSufficient(b, priced(2n))).rejects.toThrow(/Gas prices rose/);
    await expect(assertBufferStillSufficient(b, undefined)).rejects.toThrow(/needs an RPC/);
    await expect(assertBufferStillSufficient(b, mockRpc(84532, () => 'nope'))).rejects.toThrow();
  });
  it('is a no-op for payments built without a buffer', async () => {
    const { parsed } = await makeParsed();
    const ctx = await createPayContext(reviewInvoice(parsed, NOW, LOADED(84532)), undefined, { nowSeconds: NOW });
    const b = buildFinal(ctx, { nowSeconds: NOW });
    const rpc = priced(1000n);
    await expect(assertBufferStillSufficient(b, undefined)).resolves.toBeUndefined();
    await expect(assertBufferStillSufficient(b, rpc)).resolves.toBeUndefined();
    expect(rpc.calls).toHaveLength(0);
  });
});

describe('approval helpers', () => {
  const OWNER = '0x5555555555555555555555555555555555555555';
  it('builds and asserts exact approvals', () => {
    const tx = buildApproveTx(USDC_84532, FAKE_ROUTER, 5n);
    expect(() => assertApproveTx(tx, USDC_84532, FAKE_ROUTER, 5n)).not.toThrow();
    expect(() => assertApproveTx(tx, USDC_84532, FAKE_ROUTER, 6n)).toThrow(/spender or amount/);
    expect(() => assertApproveTx(tx, USDC_84532, '0x9999999999999999999999999999999999999999', 5n)).toThrow(/spender or amount/);
    expect(() => assertApproveTx({ ...tx, value: 1n }, USDC_84532, FAKE_ROUTER, 5n)).toThrow(/unexpected approval/);
    expect(() => assertApproveTx({ ...tx, to: '0x9999999999999999999999999999999999999999' }, USDC_84532, FAKE_ROUTER, 5n)).toThrow(/unexpected approval/);
    expect(() => assertApproveTx({ ...tx, data: '0x1234' }, USDC_84532, FAKE_ROUTER, 5n)).toThrow(/could not be decoded/);
    expect(() => assertApproveTx({ ...tx, data: '0xa9059cbb' + '0'.repeat(128) as `0x${string}` }, USDC_84532, FAKE_ROUTER, 5n)).toThrow(/unexpected approval/);
  });
  it('reads allowances strictly', async () => {
    expect(await readAllowance(mockRpc(1, () => `0x${'0'.repeat(63)}7`), USDC_84532, OWNER, FAKE_ROUTER)).toBe(7n);
    await expect(readAllowance(mockRpc(1, () => '0x1'), USDC_84532, OWNER, FAKE_ROUTER)).rejects.toThrow(/unexpected allowance/);
  });
});

describe('permit (ERC-2612)', () => {
  const account = privateKeyToAccount(`0x${'ab'.repeat(32)}`);
  const NAME = 'USDC';
  function tokenRpc(version: string, chainId = 84532): ReturnType<typeof mockRpc> {
    return mockRpc(chainId, (_m, params) => {
      const data = (params[0] as { data: string }).data;
      if (data.startsWith('0x06fdde03')) return encodeFunctionResult({ abi: erc20MetadataAbi, functionName: 'name', result: NAME });
      if (data.startsWith('0x7ecebe00')) return encodeFunctionResult({ abi: erc2612PermitAbi, functionName: 'nonces', result: 3n });
      if (data.startsWith('0x3644e515')) {
        return eip712DomainSeparator({ name: NAME, version, chainId, verifyingContract: USDC_84532 });
      }
      throw new Error('unexpected call');
    });
  }
  const P = { chainId: 84532, token: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const, owner: account.address, spender: FAKE_ROUTER, value: 5n, deadline: BigInt(NOW + 1200) };

  it('probes domain versions 2 then 1 and accepts only a matching DOMAIN_SEPARATOR', async () => {
    const v2 = await buildPermit(tokenRpc('2'), P);
    expect(v2.domain.version).toBe('2');
    expect(v2.message.nonce).toBe(3n);
    const v1 = await buildPermit(tokenRpc('1'), P);
    expect(v1.domain.version).toBe('1');
    await expect(buildPermit(tokenRpc('9'), P)).rejects.toThrow(/DOMAIN_SEPARATOR/);
  });
  it('serialises typed data with an explicit EIP712Domain and string bigints', async () => {
    const td = await buildPermit(tokenRpc('2'), P);
    const json = JSON.parse(typedDataJson(td)) as { types: Record<string, unknown>; message: Record<string, unknown>; primaryType: string };
    expect(Object.keys(json.types)).toEqual(['EIP712Domain', 'Permit']);
    expect(json.message['value']).toBe('5');
    expect(json.primaryType).toBe('Permit');
  });
  it('accepts only a signature that recovers to the payer', async () => {
    const td = await buildPermit(tokenRpc('2'), P);
    const sig = await account.signTypedData({ domain: td.domain, types: td.types, primaryType: 'Permit', message: td.message });
    await expect(assertPermitSigner(td, sig, account.address)).resolves.toBeUndefined();
    await expect(assertPermitSigner(td, sig, '0x5555555555555555555555555555555555555555')).rejects.toThrow(/does not match your account/);
  });
  it('rejects malformed RPC results in the reader', async () => {
    const bad = permitReader(mockRpc(1, () => 42), '1');
    await expect(bad.name(USDC_84532)).rejects.toThrow(/unexpected result/);
    expect(await permitReader(mockRpc(1, () => '0x'), '7').version(USDC_84532)).toBe('7');
  });
});
