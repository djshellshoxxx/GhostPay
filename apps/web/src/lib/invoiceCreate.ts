import { findChain, findToken, tokensForChain } from '@ghostpay/chain-adapters';
import {
  FRAGMENT_PREFIX,
  createInvoice,
  encodeFragment,
  signInvoice,
  type BufferPolicy,
  type Invoice,
  type LineItem,
  type RandomSource,
} from '@ghostpay/invoice-schema';
import { UserFacingError } from './errors';
import { fiatDecimals, parseUnits, taxFor } from './format';
import { getSessionPublic, withSessionSecrets } from './session';
import { passphraseProblemMessage } from './keystore';

export interface LineItemInput {
  readonly description: string;
  readonly quantity: string;
  /** Decimal fiat amount per unit, e.g. `50.00`. */
  readonly unitPrice: string;
}

export interface InvoiceForm {
  readonly chainId: number;
  /** `native` or a lowercase token address from the allowlist. */
  readonly token: string;
  readonly currency: string;
  readonly lineItems: readonly LineItemInput[];
  readonly taxRatePercent: string;
  readonly feePolicy: 'payer_pays' | 'seller_pays';
  readonly amountMode: 'fiat_quote' | 'fixed_token';
  /** Decimal token amount (token units) when `amountMode` is `fixed_token`. */
  readonly tokenAmount: string;
  readonly expiryHours: number;
  readonly quoteTtlMinutes: number;
  readonly maxSlippageBps: number;
  readonly memo: string;
  readonly encrypt: boolean;
  /** Protect the whole invoice with a secret shared out of band. */
  readonly passphrase?: string;
  /** Seller gas-buffer policy; when set the invoice is schema v2 (ADR-0024). Set by the Create page's gas buffer control (full profile, token invoices only). */
  readonly bufferPolicy?: BufferPolicy;
}

export interface CreatedInvoice {
  readonly invoice: Invoice;
  readonly fragment: string;
  readonly link: string;
  readonly encrypted: boolean;
  readonly passphraseProtected: boolean;
}

/** Totals in fiat minor units, computed with integer math. */
export interface Totals {
  readonly subtotal: bigint;
  readonly tax: bigint;
  readonly total: bigint;
}

/** Sums line items and tax. Throws `UserFacingError` on malformed input. */
export function computeTotals(items: readonly LineItem[], taxRateBps: number, taxOverride?: bigint): Totals {
  const subtotal = items.reduce((acc, it) => acc + BigInt(it.quantity) * BigInt(it.unitMinorUnits), 0n);
  const tax = taxOverride ?? taxFor(subtotal, taxRateBps);
  return { subtotal, tax, total: subtotal + tax };
}

function percentToBps(text: string): number {
  const v = parseUnits(text === '' ? '0' : text, 2);
  if (v === undefined || v > 10_000n) throw new UserFacingError({ key: 'error.invoiceCreate.taxRateMustBeAPercentageBetween0And100' });
  return Number(v);
}

/** The token decimals for a token field value (`native` is 18). */
export function tokenDecimals(chainId: number, token: string): number {
  if (token === 'native') return 18;
  const t = findToken(chainId, token);
  if (t === undefined) throw new UserFacingError({ key: 'error.invoiceCreate.thatTokenIsNotOnTheAllowlistForThisChain' });
  return t.decimals;
}

function tokenSymbol(chainId: number, token: string): string {
  if (token === 'native') return (findChain(chainId)?.nativeSymbol ?? 'native').toLowerCase();
  return (findToken(chainId, token)?.symbol ?? 'token').toLowerCase();
}

/** Token choices for a chain: native plus allowlisted tokens. */
export function tokenChoices(chainId: number): readonly { value: string; label: string }[] {
  const chain = findChain(chainId);
  const native = { value: 'native', label: chain?.nativeSymbol ?? 'native' };
  return [native, ...tokensForChain(chainId).map((t) => ({ value: t.address.toLowerCase(), label: t.symbol }))];
}

/** Builds, signs and encodes an invoice with the in-memory signing key. Nothing is stored or sent. */
export async function buildInvoiceLink(
  form: InvoiceForm,
  baseUrl: string,
  nowSeconds: number,
  rng?: RandomSource,
): Promise<CreatedInvoice> {
  const pub = getSessionPublic();
  if (pub === undefined) throw new UserFacingError({ key: 'error.invoiceCreate.loadOrGenerateSellerKeysFirstSellerKeys' });
  const chain = findChain(form.chainId);
  if (form.passphrase !== undefined) {
    const problem = passphraseProblemMessage(form.passphrase);
    if (problem !== undefined) throw new UserFacingError(problem);
  }
  if (chain === undefined) throw new UserFacingError({ key: 'error.invoiceCreate.unknownChain' });
  if (!/^[A-Z]{3}$/.test(form.currency)) throw new UserFacingError({ key: 'error.invoiceCreate.currencyMustBeAThreeLetterISOCodeSuchAs' });
  const fd = fiatDecimals(form.currency);
  const items: LineItem[] = form.lineItems.map((li, i) => {
    const unit = parseUnits(li.unitPrice, fd);
    if (unit === undefined) throw new UserFacingError({ key: 'error.invoiceCreate.linePrice', values: { line: String(i + 1), digits: String(fd) } });
    if (!/^[1-9][0-9]{0,8}$/.test(li.quantity)) throw new UserFacingError({ key: 'error.invoiceCreate.lineQuantity', values: { line: String(i + 1) } });
    return { description: li.description.normalize('NFC'), quantity: li.quantity, unitMinorUnits: unit.toString() };
  });
  const rateBps = percentToBps(form.taxRatePercent);
  const totals = computeTotals(items, rateBps);
  let amountPolicy: Invoice['amountPolicy'];
  if (form.amountMode === 'fixed_token') {
    const units = parseUnits(form.tokenAmount, tokenDecimals(form.chainId, form.token));
    if (units === undefined || units <= 0n) throw new UserFacingError({ key: 'error.invoiceCreate.enterAPositiveTokenAmountWithNoMoreDecimalsThan' });
    amountPolicy = { mode: 'fixed_token', tokenAmount: units.toString() };
  } else {
    if (totals.total <= 0n) throw new UserFacingError({ key: 'error.invoiceCreate.addAtLeastOneLineItemWithAPositivePrice' });
    amountPolicy = { mode: 'fiat_quote' };
  }
  if (form.token !== 'native') tokenDecimals(form.chainId, form.token);
  if (!Number.isInteger(form.expiryHours) || form.expiryHours < 1 || form.expiryHours > 24 * 90) throw new UserFacingError({ key: 'error.invoiceCreate.expiryMustBeBetween1HourAnd90Days' });
  if (!Number.isInteger(form.quoteTtlMinutes) || form.quoteTtlMinutes < 1 || form.quoteTtlMinutes > 1440) throw new UserFacingError({ key: 'error.invoiceCreate.quoteValidityMustBeBetween1And1440Minutes' });
  if (!Number.isInteger(form.maxSlippageBps) || form.maxSlippageBps < 0 || form.maxSlippageBps > 10_000) throw new UserFacingError({ key: 'error.invoiceCreate.slippageMustBeBetween0And10000BasisPoints' });
  const memo = form.memo.trim();
  const invoice = createInvoice(
    {
      chainId: form.chainId,
      metaAddress: pub.metaAddress,
      fiat: { currency: form.currency, minorUnits: totals.total.toString() },
      token: form.token,
      amountPolicy,
      quote: {
        source: amountPolicy.mode === 'fixed_token' ? 'seller:fixed' : `chainlink:${tokenSymbol(form.chainId, form.token)}-${form.currency.toLowerCase()}`,
        timestamp: nowSeconds,
        expiresAt: nowSeconds + form.quoteTtlMinutes * 60,
        maxSlippageBps: form.maxSlippageBps,
      },
      expiresAt: nowSeconds + form.expiryHours * 3600,
      lineItems: items,
      tax: { rateBps, minorUnits: totals.tax.toString() },
      feePolicy: form.feePolicy,
      ...(memo === '' ? {} : { memo }),
      signer: pub.signerPublicKey,
      ...(form.bufferPolicy === undefined ? {} : { bufferPolicy: form.bufferPolicy }),
    },
    rng,
  );
  // The scalars are borrowed for this call only and wiped before it returns (L1-07). Nothing above awaits, so they belong to `pub`.
  const signed = withSessionSecrets((s) => signInvoice(invoice, s.signingKey));
  const fragment = await encodeFragment(signed, {
    encrypt: form.passphrase === undefined ? form.encrypt : true,
    ...(form.passphrase === undefined ? {} : { passphrase: form.passphrase }),
    ...(rng === undefined ? {} : { rng }),
  });
  if (!fragment.startsWith(FRAGMENT_PREFIX)) throw new UserFacingError({ key: 'error.invoiceCreate.internalErrorUnexpectedFragment' });
  return { invoice, fragment, link: `${baseUrl}${fragment}`, encrypted: form.encrypt || form.passphrase !== undefined, passphraseProtected: form.passphrase !== undefined };
}

// i18n-use: error.invoiceCreate.taxRateMustBeAPercentageBetween0And100 error.invoiceCreate.thatTokenIsNotOnTheAllowlistForThisChain error.invoiceCreate.loadOrGenerateSellerKeysFirstSellerKeys error.invoiceCreate.unknownChain error.invoiceCreate.currencyMustBeAThreeLetterISOCodeSuchAs error.invoiceCreate.enterAPositiveTokenAmountWithNoMoreDecimalsThan error.invoiceCreate.addAtLeastOneLineItemWithAPositivePrice error.invoiceCreate.expiryMustBeBetween1HourAnd90Days error.invoiceCreate.quoteValidityMustBeBetween1And1440Minutes error.invoiceCreate.slippageMustBeBetween0And10000BasisPoints error.invoiceCreate.internalErrorUnexpectedFragment

// i18n-use: error.invoiceCreate.linePrice

// i18n-use: error.invoiceCreate.lineQuantity
