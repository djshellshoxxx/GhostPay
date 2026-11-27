import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAINS, grossForNet, routerSplit, type Address } from '@ghostpay/chain-adapters';
import { buildErc20Metadata, deriveStealthPayment } from '@ghostpay/core-crypto';
import { invoiceDigest, type ParsedInvoice } from '@ghostpay/invoice-schema';
import { bytesToHex } from '@noble/hashes/utils.js';
import { stubJournalWindow } from '../test/locks';
import { AnvilWallet, KEYS, erc20AnvilAvailable, erc20AnvilRequired, startLocalChain, type LocalChain } from './erc20Anvil.testutil';
import { approveAndPay, approveRouter, finalize, foreignRouterPayment, newSeller, payerSetup, realNow, scanSeller, signedInvoice, signedRawInvoice } from './erc20Flow.testutil';
import { recordFromObservedMatch, recordFromVerifiedMatch } from './reconciliationLedger';
import { registrationFromInvoice } from './reconciliationMatch';
import { ReconciliationVault } from './reconciliationVault';
import { bindReceiptToInvoice, receiptBindingForInvoice, signReceipt } from './receipts';
import { checkpointKeyId, type ScanMatch } from './scanClient';
import { clearSession, getSessionPublic, revealViewingKey, withSessionSecrets } from './session';
import { summarizeInvoicePayments } from '@ghostpay/ux-vault/portable';

// Seller side of the ERC-20 path on a real local chain: scan, reconciliation vault, invoice matching and bound receipts
// for exact, under-, over-, wrong-token and forged payments. Amounts and evidence come from the real router, announcer
// and token code; only the vault's backing store is in memory.
it('needs anvil and the compiled contracts when REQUIRE_ANVIL=1', () => {
  if (erc20AnvilRequired) expect(erc20AnvilAvailable, 'REQUIRE_ANVIL=1 needs anvil and packages/contracts/out (run forge build)').toBe(true);
});

const keyIdOfSession = (): string => {
  const pub = getSessionPublic();
  if (pub === undefined) throw new Error('no seller session');
  return checkpointKeyId(pub.spendingPublicKey, pub.viewingPublicKey);
};

describe.skipIf(!erc20AnvilAvailable)('ERC-20 seller reconciliation on a real local chain', () => {
  let local: LocalChain;
  beforeAll(async () => { local = await startLocalChain(); }, 120_000);
  afterAll(() => { local?.stop(); });
  beforeEach(() => { stubJournalWindow(vi.stubGlobal); newSeller(); });
  afterEach(() => { clearSession(); vi.unstubAllGlobals(); });

  async function openVault(): Promise<{ vault: Awaited<ReturnType<typeof makeVault>>; sellerKeyId: string; scope: { chainId: number; sellerKeyId: string } }> {
    const sellerKeyId = keyIdOfSession();
    return { vault: await makeVault(sellerKeyId), sellerKeyId, scope: { chainId: local.chainId, sellerKeyId } };
  }
  async function makeVault(sellerKeyId: string): Promise<ReconciliationVault> {
    const data = new Map<string, string>();
    const vault = new ReconciliationVault({
      read: (key) => Promise.resolve(data.get(key) ?? null),
      compareAndSwap: (key, expected, next, guard) => { guard(); if ((data.get(key) ?? null) !== expected) return Promise.resolve(false); data.set(key, next); return Promise.resolve(true); },
    }, { chainId: local.chainId, sellerKeyId }, () => undefined);
    await vault.unlock(revealViewingKey());
    return vault;
  }
  /** Registers `parsed` and feeds the scan's router matches through the vault exactly as the Scan view does. */
  async function observe(vault: ReconciliationVault, sellerKeyId: string, parsed: ParsedInvoice, matches: readonly ScanMatch[]): Promise<ReturnType<typeof recordFromObservedMatch>[]> {
    await vault.registerInvoice(registrationFromInvoice(parsed.invoice));
    const records = matches.filter((m) => m.viaRouter && m.metadata !== undefined && m.announcement.transactionHash !== undefined).map((m) => recordFromObservedMatch(m, sellerKeyId));
    await vault.observeInvoicePayments(records);
    return records;
  }
  const digestOf = (parsed: ParsedInvoice): string => `0x${bytesToHex(invoiceDigest(parsed.invoice))}`;

  it('exact payment: pending is never matched, final is one exact proposal, linking yields equal and a receipt bound to the digest, tx and recipient', async () => {
    const parsed = await signedInvoice(local);
    const setup = await payerSetup(local, parsed, new AnvilWallet(local, KEYS.payer));
    const { built, result } = await approveAndPay(setup);
    const { vault, sellerKeyId, scope } = await openVault();
    const registered = registrationFromInvoice(parsed.invoice);
    expect(registered.expectedNetMinorUnits).toBe(routerSplit(100_000_000n).net.toString());

    // Before finality the chain evidence is pending: recorded, but never proposed for an invoice and never credited.
    const early = await scanSeller(local);
    expect(early.map((m) => m.receipt)).toEqual(['pending']);
    const pendingRecords = await observe(vault, sellerKeyId, parsed, early);
    expect(pendingRecords[0]?.evidenceStatus).toBe('pending-at-scan');
    expect([...(await vault.proposals(pendingRecords)).values()].map((p) => p.kind)).toEqual(['none']);
    expect(summarizeInvoicePayments(registered, await vault.read(), scope).kind).toBe('unlinked');

    await finalize(local);
    const matches = await scanSeller(local);
    expect(matches).toHaveLength(1);
    const match = matches[0]!;
    expect(match).toMatchObject({ receipt: 'verified', viaRouter: true, stealthAddress: built.preview.stealth });
    expect(match.announcement.transactionHash?.toLowerCase()).toBe(result.hash);
    const records = await observe(vault, sellerKeyId, parsed, matches);
    expect(records[0]).toMatchObject({ evidenceStatus: 'verified-at-scan', asset: local.usdc.toLowerCase(), amountMinorUnits: registered.expectedNetMinorUnits });
    const proposals = await vault.proposals(records);
    expect([...proposals.values()].map((p) => p.kind)).toEqual(['exact']);
    await vault.confirmProposal(records[0]!, registered.invoiceDigest, { current: records });
    expect(summarizeInvoicePayments(registered, await vault.read(), scope)).toMatchObject({ kind: 'equal', observationCount: 1, observedMinorUnits: registered.expectedNetMinorUnits });

    // A rescan of the same chain evidence does not credit the invoice twice.
    const again = await scanSeller(local);
    await vault.observeInvoicePayments(again.map((m) => recordFromObservedMatch(m, sellerKeyId)));
    expect(summarizeInvoicePayments(registered, await vault.read(), scope)).toMatchObject({ kind: 'equal', observationCount: 1 });

    // The receipt is bound to the signed invoice, this transaction, this recipient and the exact router net.
    const binding = withSessionSecrets((s) => receiptBindingForInvoice(parsed, match, getSessionPublic()!.signerPublicKey, s.keys, realNow()));
    expect(binding).toMatchObject({ invoiceDigest: digestOf(parsed), chainId: local.chainId, asset: local.usdc.toLowerCase(), amountMinorUnits: registered.expectedNetMinorUnits, txHash: result.hash, stealthAddress: built.preview.stealth.toLowerCase() });
    const receipt = withSessionSecrets((s) => signReceipt({
      invoiceDigest: binding.invoiceDigest, chainId: binding.chainId, txHash: binding.txHash!, stealthAddress: binding.stealthAddress!,
      asset: binding.asset, amountMinorUnits: binding.amountMinorUnits, issuedAt: realNow(),
    }, s.signingKey));
    expect(bindReceiptToInvoice(receipt, binding).signerMatch).toBe('invoice-signing-key');
  });

  it('payer_pays with an awkward amount: the seller receives exactly the invoice amount, the registration expects exactly that, one exact proposal', async () => {
    const parsed = await signedInvoice(local, { feePolicy: 'payer_pays', tokenAmount: '1234.567891' });
    const registered = registrationFromInvoice(parsed.invoice);
    expect(registered.expectedNetMinorUnits).toBe('1234567891');
    const setup = await payerSetup(local, parsed, new AnvilWallet(local, KEYS.payer));
    expect(setup.ctx.request.netAmount).toBe(1_234_567_891n);
    const { built } = await approveAndPay(setup);
    expect(await local.balanceOf(local.usdc, built.preview.stealth)).toBe(1_234_567_891n);
    await finalize(local);
    const matches = await scanSeller(local);
    const { vault, sellerKeyId, scope } = await openVault();
    const records = await observe(vault, sellerKeyId, parsed, matches);
    expect([...(await vault.proposals(records)).values()].map((p) => p.kind)).toEqual(['exact']);
    await vault.confirmProposal(records[0]!, registered.invoiceDigest, { current: records });
    expect(summarizeInvoicePayments(registered, await vault.read(), scope)).toMatchObject({ kind: 'equal', observedMinorUnits: '1234567891' });
  });

  describe.each([
    { label: 'underpayment', gross: 90_000_000n, kind: 'below' as const },
    { label: 'overpayment', gross: 110_000_000n, kind: 'above' as const },
    { label: 'dust payment', gross: 399n, kind: 'below' as const },
  ])('$label by another payer', ({ gross, kind }) => {
    it('is never proposed, linked or receipted automatically; a manual link is reported as below/above with the real amounts', async () => {
      const parsed = await signedInvoice(local);
      const registered = registrationFromInvoice(parsed.invoice);
      await approveRouter(local, KEYS.payer2, local.usdc, gross);
      const { hash } = await foreignRouterPayment(local, KEYS.payer2, local.usdc, gross);
      await finalize(local);
      const matches = await scanSeller(local);
      expect(matches).toHaveLength(1);
      const match = matches[0]!;
      const net = routerSplit(gross).net;
      // The chain truth: the router really delivered this net, finalised, from the router.
      expect(match).toMatchObject({ receipt: 'verified', viaRouter: true });
      expect(match.metadata).toMatchObject({ kind: 'erc20', netAmount: net });
      expect(await local.balanceOf(local.usdc, match.stealthAddress)).toBe(net);
      expect(match.announcement.transactionHash?.toLowerCase()).toBe(hash);

      const { vault, sellerKeyId, scope } = await openVault();
      const records = await observe(vault, sellerKeyId, parsed, matches);
      expect(records[0]).toMatchObject({ evidenceStatus: 'verified-at-scan', amountMinorUnits: net.toString() });
      expect([...(await vault.proposals(records)).values()].map((p) => p.kind)).toEqual(['none']);
      await expect(vault.confirmProposal(records[0]!, registered.invoiceDigest, { current: records })).rejects.toThrow(/no longer has a single exact invoice match/);
      expect(summarizeInvoicePayments(registered, await vault.read(), scope)).toMatchObject({ kind: 'unlinked', observationCount: 0 });
      // The vault keeps only observations that could pay a registered invoice (data minimisation), so an off-amount
      // payment is neither credited nor stored by the scan. It stays visible in the scan result with its real amount.
      expect(await vault.read()).toEqual([]);
      // No signed receipt can be produced for an invoice whose amount the payment does not equal.
      let refusal: unknown;
      try { withSessionSecrets((s) => receiptBindingForInvoice(parsed, match, getSessionPublic()!.signerPublicKey, s.keys, realNow())); } catch (error) { refusal = error; }
      expect((refusal as { translation?: { key?: string } }).translation?.key).toBe('receipt.validation.sellerAmountMismatch');
      // The seller may still link it by hand; the summary then says below/above with the exact observed and expected nets.
      await vault.save(recordFromVerifiedMatch(match, sellerKeyId, registered.invoiceDigest));
      expect(summarizeInvoicePayments(registered, await vault.read(), scope)).toEqual({
        kind, observedMinorUnits: net.toString(), expectedMinorUnits: registered.expectedNetMinorUnits, observationCount: 1,
      });
    });
  });

  it('partial payments: below after the first, equal once a second payment completes the exact net (both linked by hand)', async () => {
    const parsed = await signedInvoice(local);
    const registered = registrationFromInvoice(parsed.invoice);
    await approveRouter(local, KEYS.payer2, local.usdc, 100_000_000n);
    await foreignRouterPayment(local, KEYS.payer2, local.usdc, 90_000_000n);
    await finalize(local);
    const { vault, sellerKeyId, scope } = await openVault();
    const [first] = await scanSeller(local);
    await vault.save(recordFromVerifiedMatch(first!, sellerKeyId, registered.invoiceDigest));
    expect(summarizeInvoicePayments(registered, await vault.read(), scope)).toMatchObject({ kind: 'below', observedMinorUnits: routerSplit(90_000_000n).net.toString(), observationCount: 1 });
    await foreignRouterPayment(local, KEYS.payer2, local.usdc, 10_000_000n);
    await finalize(local);
    const matches = await scanSeller(local);
    expect(matches).toHaveLength(2);
    for (const m of matches) await vault.save(recordFromVerifiedMatch(m, sellerKeyId, registered.invoiceDigest));
    expect(summarizeInvoicePayments(registered, await vault.read(), scope)).toEqual({
      kind: 'equal', observedMinorUnits: registered.expectedNetMinorUnits, expectedMinorUnits: registered.expectedNetMinorUnits, observationCount: 2,
    });
  });

  it('a payer who pays twice: nothing links automatically; hand-linking both is reported as above, never as a single equal payment', async () => {
    const parsed = await signedInvoice(local);
    const registered = registrationFromInvoice(parsed.invoice);
    const first = await approveAndPay(await payerSetup(local, parsed, new AnvilWallet(local, KEYS.payer)));
    await approveRouter(local, KEYS.payer2, local.usdc, 100_000_000n);
    const second = await foreignRouterPayment(local, KEYS.payer2, local.usdc, 100_000_000n);
    expect(second.hash).not.toBe(first.result.hash);
    await finalize(local);
    const matches = await scanSeller(local);
    expect(matches.map((m) => m.receipt)).toEqual(['verified', 'verified']);
    const { vault, sellerKeyId, scope } = await openVault();
    const records = await observe(vault, sellerKeyId, parsed, matches);
    // Two exact candidates for one invoice: the seller must choose; nothing is linked automatically.
    expect([...(await vault.proposals(records)).values()].map((p) => p.kind)).toEqual(['ambiguous', 'ambiguous']);
    await expect(vault.confirmProposal(records[0]!, registered.invoiceDigest, { current: records })).rejects.toThrow(/no longer has a single exact invoice match/);
    expect(summarizeInvoicePayments(registered, await vault.read(), scope).kind).toBe('unlinked');
    await vault.save(recordFromVerifiedMatch(matches.find((m) => m.announcement.transactionHash?.toLowerCase() === first.result.hash)!, sellerKeyId, registered.invoiceDigest));
    expect(summarizeInvoicePayments(registered, await vault.read(), scope)).toMatchObject({ kind: 'equal', observationCount: 1 });
    await vault.save(recordFromVerifiedMatch(matches.find((m) => m.announcement.transactionHash?.toLowerCase() === second.hash)!, sellerKeyId, registered.invoiceDigest));
    expect(summarizeInvoicePayments(registered, await vault.read(), scope)).toMatchObject({ kind: 'above', observationCount: 2, observedMinorUnits: (2n * BigInt(registered.expectedNetMinorUnits)).toString() });
  });

  it('a payment in another allowlisted token (EURC) never matches or receipts a USDC invoice', async () => {
    expect(local.eurc).toBeDefined();
    const eurc = local.eurc as Address;
    const parsed = await signedInvoice(local);
    const registered = registrationFromInvoice(parsed.invoice);
    await approveRouter(local, KEYS.payer2, eurc, 100_000_000n);
    await foreignRouterPayment(local, KEYS.payer2, eurc, 100_000_000n);
    await finalize(local);
    const matches = await scanSeller(local);
    expect(matches).toHaveLength(1);
    expect(matches[0]?.metadata).toMatchObject({ kind: 'erc20' });
    expect((matches[0]?.metadata as { token: string }).token.toLowerCase()).toBe(eurc.toLowerCase());
    const { vault, sellerKeyId, scope } = await openVault();
    const records = await observe(vault, sellerKeyId, parsed, matches);
    expect(records[0]?.asset).toBe(eurc.toLowerCase());
    expect([...(await vault.proposals(records)).values()].map((p) => p.kind)).toEqual(['none']);
    expect(summarizeInvoicePayments(registered, await vault.read(), scope).kind).toBe('unlinked');
    let refusal: unknown;
    try { withSessionSecrets((s) => receiptBindingForInvoice(parsed, matches[0]!, getSessionPublic()!.signerPublicKey, s.keys, realNow())); } catch (error) { refusal = error; }
    expect((refusal as { translation?: { key?: string } }).translation?.key).toBe('receipt.validation.invoiceAssetMismatch');
  });

  it('a forged direct announcement claiming an ERC-20 payment is only ever "claimed": no funds, no record, no receipt', async () => {
    const parsed = await signedInvoice(local);
    const pub = getSessionPublic()!;
    const payment = deriveStealthPayment(pub.metaAddress);
    const net = routerSplit(100_000_000n).net;
    const metadata = `0x${bytesToHex(buildErc20Metadata(payment.viewTag, local.usdc.toLowerCase(), net))}`;
    const announce = (await import('viem')).encodeFunctionData({
      abi: [{ type: 'function', name: 'announce', stateMutability: 'nonpayable', inputs: [{ name: 'schemeId', type: 'uint256' }, { name: 'stealthAddress', type: 'address' }, { name: 'ephemeralPubKey', type: 'bytes' }, { name: 'metadata', type: 'bytes' }], outputs: [] }],
      functionName: 'announce',
      args: [1n, payment.stealthAddress, `0x${bytesToHex(payment.ephemeralPublicKey)}`, metadata as `0x${string}`],
    });
    await local.send(KEYS.attacker, { to: local.announcer, data: announce });
    await finalize(local);
    expect(await local.balanceOf(local.usdc, payment.stealthAddress)).toBe(0n);
    const matches = await scanSeller(local);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ viaRouter: false, receipt: 'claimed' });
    expect(matches[0]?.metadata).toMatchObject({ kind: 'erc20', netAmount: net });
    expect(() => recordFromVerifiedMatch(matches[0]!, keyIdOfSession())).toThrow();
    expect(() => recordFromObservedMatch(matches[0]!, keyIdOfSession())).toThrow();
    let refusal: unknown;
    try { withSessionSecrets((s) => receiptBindingForInvoice(parsed, matches[0]!, pub.signerPublicKey, s.keys, realNow())); } catch (error) { refusal = error; }
    expect((refusal as { translation?: { key?: string } }).translation?.key).toBe('receipt.validation.completePayment');
  });

  it('an invoice for another chain is never bound to a payment found on this chain', async () => {
    const sepolia = CHAINS.find((c) => c.chainId === 11155111)!;
    expect(sepolia.chainId).not.toBe(local.chainId);
    const parsed = await signedRawInvoice({ chainId: sepolia.chainId, token: '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238', tokenAmount: grossForNet(routerSplit(100_000_000n).net).toString() });
    await approveRouter(local, KEYS.payer2, local.usdc, 100_000_000n);
    await foreignRouterPayment(local, KEYS.payer2, local.usdc, 100_000_000n);
    await finalize(local);
    const [match] = await scanSeller(local);
    let refusal: unknown;
    try { withSessionSecrets((s) => receiptBindingForInvoice(parsed, match!, getSessionPublic()!.signerPublicKey, s.keys, realNow())); } catch (error) { refusal = error; }
    expect((refusal as { translation?: { key?: string } }).translation?.key).toBe('receipt.validation.invoiceChainMismatch');
  });

  it('keeps the unverified path honest: a verified record cannot be built from a pending or claimed match', async () => {
    const parsed = await signedInvoice(local);
    await approveAndPay(await payerSetup(local, parsed, new AnvilWallet(local, KEYS.payer)));
    const [pending] = await scanSeller(local);
    expect(pending?.receipt).toBe('pending');
    expect(() => recordFromVerifiedMatch(pending!, keyIdOfSession())).toThrow(/verified router scan match/i);
    expect(recordFromObservedMatch(pending!, keyIdOfSession()).evidenceStatus).toBe('pending-at-scan');
  });
});
