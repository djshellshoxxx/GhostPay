// TEST-ONLY flow helpers for the ERC-20 qualification: they call the same app library functions the Pay, Scan and
// Sweep views call (reviewInvoice, createPayContext, payExec, runScan, reconciliation records, directSweep) against a
// LocalChain from erc20Anvil.testutil.ts. Nothing here is bundled.
import { buildPaymentTx, grossForNet, routerNet, type Address, type BuiltPayment, type DeploymentManifest, type Hex } from '@ghostpay/chain-adapters';
import { deriveStealthPayment } from '@ghostpay/core-crypto';
import { createInvoice, encodeFragment, parseFragment, signInvoice, type Invoice, type ParsedInvoice } from '@ghostpay/invoice-schema';
import { InlineWorker } from '../test/inlineWorker';
import { BASE_FORM } from '../test/invoiceFixtures';
import type { AnvilWallet, LocalChain } from './erc20Anvil.testutil';
import { buildInvoiceLink, type InvoiceForm } from './invoiceCreate';
import { createPayContext, reviewInvoice, type BufferQuote, type PayContext } from './pay';
import { grantApproval, planApproval, preparePayment, sendPayment, type Runtime, type SubmitResult } from './payExec';
import { checkpointKeyId, runScan, type ScanMatch } from './scanClient';
import { generateSession, getSessionPublic, revealViewingKey, withSessionSecrets } from './session';
import { connectWallet, type WalletInfo, type WalletSession } from './wallet';

export const noStatus = (): void => undefined;
export const realNow = (): number => Math.floor(Date.now() / 1000);

export const walletInfo = (wallet: AnvilWallet): WalletInfo => ({ id: 'anvil', name: 'Synthetic anvil wallet', kind: 'injected', provider: wallet });

/** A real signed fixed-token invoice for `tokenAmount` whole tokens (6 decimals) of `token`, parsed like the Pay view does. */
export async function signedInvoice(local: LocalChain, patch: Partial<InvoiceForm> = {}, nowSeconds = realNow()): Promise<ParsedInvoice> {
  const created = await buildInvoiceLink({ ...BASE_FORM, chainId: local.chainId, token: local.usdc.toLowerCase(), ...patch }, 'https://app.test/', nowSeconds);
  return parseFragment(created.fragment);
}

/**
 * A validly signed invoice a hostile or mistaken seller could publish: the form refuses unlisted tokens, so the invoice
 * is assembled with the schema directly. Signed with the loaded session key like any other invoice.
 */
export async function signedRawInvoice(over: Partial<Pick<Invoice, 'chainId' | 'token'>> & { readonly tokenAmount?: string }, nowSeconds = realNow()): Promise<ParsedInvoice> {
  const pub = getSessionPublic();
  if (pub === undefined) throw new Error('a seller session is required');
  const invoice = createInvoice({
    chainId: over.chainId ?? 84532,
    metaAddress: pub.metaAddress,
    fiat: { currency: 'USD', minorUnits: '10000' },
    token: over.token ?? '0x1111111111111111111111111111111111111111',
    amountPolicy: { mode: 'fixed_token', tokenAmount: over.tokenAmount ?? '100000000' },
    quote: { source: 'seller:fixed', timestamp: nowSeconds, expiresAt: nowSeconds + 900, maxSlippageBps: 50 },
    expiresAt: nowSeconds + 86_400,
    lineItems: [],
    tax: { rateBps: 0, minorUnits: '0' },
    feePolicy: 'seller_pays',
    signer: pub.signerPublicKey,
  });
  const signed = withSessionSecrets((s) => signInvoice(invoice, s.signingKey));
  return parseFragment(await encodeFragment(signed, { encrypt: false }));
}

export interface PayerSetup {
  readonly ctx: PayContext;
  readonly session: WalletSession;
  readonly rt: Runtime;
}

export const runtimeFor = (local: LocalChain, overrides: Partial<Runtime> = {}): Runtime => ({
  // A real, short wait: anvil mines on its own thread right after a transaction arrives, so polling must not spin.
  rpc: local.rpc, nowSeconds: realNow, sleep: (ms) => new Promise((done) => { setTimeout(done, Math.min(ms, 20)); }), ...overrides,
});

/** Review -> pay context -> wallet connection, exactly as the Pay view orders them. */
export async function payerSetup(local: LocalChain, parsed: ParsedInvoice, wallet: AnvilWallet, manifest: DeploymentManifest = local.manifest, overrides: Partial<Runtime> = {}): Promise<PayerSetup> {
  const review = reviewInvoice(parsed, realNow(), { status: 'loaded', manifest });
  const ctx = await createPayContext(review, local.rpc, { nowSeconds: realNow() });
  const session = await connectWallet(walletInfo(wallet), local.chainId);
  return { ctx, session, rt: runtimeFor(local, overrides) };
}

/** The exact-allowance step, only when the router's allowance is below the gross. Returns whether an approval was sent. */
export async function approveIfNeeded(setup: PayerSetup): Promise<boolean> {
  const token = setup.ctx.review.token?.address;
  if (token === undefined || token === 'native') throw new Error('an ERC-20 invoice is required');
  const plan = await planApproval(setup.ctx, setup.session, token, setup.rt);
  if (plan.required) await grantApproval(setup.session, setup.ctx, plan, setup.rt, noStatus);
  return plan.required;
}

/** Prepare (no permit) and send the router call, exactly as the Pay view does after the final review. */
export async function prepareAndSend(setup: PayerSetup, buffer?: BufferQuote): Promise<{ readonly built: BuiltPayment; readonly result: SubmitResult }> {
  const built = await preparePayment(setup.session, setup.ctx, { usePermit: false, ...(buffer === undefined ? {} : { buffer }) }, setup.rt, noStatus);
  const result = await sendPayment(setup.session, setup.ctx, built, setup.rt, noStatus);
  return { built, result };
}

/** Allowance step (when needed) then the router call. Returns what `sendPayment` returned. */
export async function approveAndPay(setup: PayerSetup, buffer?: BufferQuote): Promise<{ readonly built: BuiltPayment; readonly result: SubmitResult }> {
  await approveIfNeeded(setup);
  return prepareAndSend(setup, buffer);
}

/**
 * A router payment sent by something other than the app (another wallet, a script): the exact calldata the router
 * accepts, for any gross. The app's own guards are not involved, so this is how off-invoice amounts reach the seller.
 */
export async function foreignRouterPayment(local: LocalChain, payerKey: Hex, token: Address, gross: bigint, meta: string = getSessionPublic()?.metaAddress ?? ''): Promise<{ readonly hash: Hex; readonly built: BuiltPayment }> {
  const built = buildPaymentTx({
    chain: local.chain, deployment: local.manifest, invoice: { chainId: local.chainId, token: token.toLowerCase() },
    payment: deriveStealthPayment(meta), grossAmount: gross, deadline: BigInt(realNow() + 900),
    findTokenFn: (_c, address) => ({ chainId: local.chainId, address, symbol: 'T', decimals: 6, permit: false }) as never,
  });
  const hash = await local.send(payerKey, { to: built.tx.to, data: built.tx.data, value: built.tx.value });
  return { hash, built };
}

/** Lets the payer's router allowance cover `gross` (a plain ERC-20 approve from the key). */
export async function approveRouter(local: LocalChain, payerKey: Hex, token: Address, amount: bigint): Promise<void> {
  const data = `0x095ea7b3${local.router.slice(2).toLowerCase().padStart(64, '0')}${amount.toString(16).padStart(64, '0')}` as Hex;
  await local.send(payerKey, { to: token, data });
  // Explicitly mined: with automine off a pending approval would not take effect, and any queued transaction goes in too.
  await local.mine(1);
}

/** Mines `finalityDepth` blocks so router-attested payments reach `verified`. */
export const finalize = async (local: LocalChain): Promise<void> => { await local.mine(local.chain.finalityDepth + 1); };

/** One full scan from block 0 with the loaded seller session, through the real scan worker protocol. */
export async function scanSeller(local: LocalChain, options: { readonly deep?: boolean } = {}): Promise<readonly ScanMatch[]> {
  const pub = getSessionPublic();
  if (pub === undefined) throw new Error('a seller session is required');
  const result = await runScan({
    chain: local.chain, manifest: local.manifest, client: local.rpc, cursor: { nextBlock: 0n },
    spendingPublicKeyHex: pub.spendingPublicKey, keyId: checkpointKeyId(pub.spendingPublicKey, pub.viewingPublicKey),
    viewingKey: revealViewingKey(), createWorker: () => new InlineWorker(), signal: new AbortController().signal,
    ...(options.deep === true ? { deep: true } : {}),
  });
  return result.matches;
}

export const newSeller = (): ReturnType<typeof generateSession> => generateSession();

/** Gross a payer must send so the seller's router net equals `net` (payer_pays), and the net of a gross (seller_pays). */
export const netOf = (gross: bigint): bigint => routerNet(gross);
export const grossOf = (net: bigint): bigint => grossForNet(net);
export const hexOfBytes = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
