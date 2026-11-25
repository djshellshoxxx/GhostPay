/**
 * Maps an existing GhostPay invoice (`@ghostpay/invoice-schema` v1/v2, unchanged) onto confidential router amounts.
 * The invoice format gains no field: a confidential payment of an ordinary invoice is a payer-side choice, and an
 * invoice that cannot be represented exactly is refused rather than rounded or converted.
 */
import { checkExpiry, invoiceDigest, validateInvoice, type Invoice } from '@ghostpay/invoice-schema';
import { bytesToHex } from 'viem';
import { check, fail } from './errors.js';
import { networkId, type ConfidentialAssetV1, type Digest } from './asset.js';
import { amountsFromGross, type RecordAmounts } from './record.js';
import { confidentialGrossForNet, parseDecimalUnits, toConfidentialUnits } from './units.js';

/** Result of {@link mapInvoiceAmounts}. */
export interface InvoiceAmounts {
  readonly invoiceDigest: Digest;
  readonly feePolicy: Invoice['feePolicy'];
  readonly amounts: RecordAmounts;
}

/**
 * @param invoice A parsed invoice; it is re-validated here because a typed value can still be a forged object.
 * @param asset Decoded, approved confidential asset whose `underlying` is the invoice token.
 * @param nowSec Injected clock (unix seconds).
 * @throws {P13Error} `P13_INVOICE_INCOMPATIBLE` (invalid or expired invoice, other network, native ETH, other token,
 * fiat-quoted amount); `P13_PRECISION` / `P13_AMOUNT_RANGE` when the amount does not fit the confidential token exactly.
 */
export function mapInvoiceAmounts(invoice: Invoice, asset: ConfidentialAssetV1, nowSec: number): InvoiceAmounts {
  let inv: Invoice;
  try {
    inv = validateInvoice(invoice);
  } catch {
    return fail('P13_INVOICE_INCOMPATIBLE', 'invoice does not validate');
  }
  let expired: boolean;
  try {
    expired = checkExpiry(inv, nowSec).invoiceExpired;
  } catch {
    return fail('P13_INVOICE_INCOMPATIBLE', 'invalid clock');
  }
  check(!expired, 'P13_INVOICE_INCOMPATIBLE', 'invoice expired');
  check(networkId(inv.chainId) === asset.asset.network, 'P13_INVOICE_INCOMPATIBLE', 'invoice is for another network');
  check(inv.token !== 'native', 'P13_INVOICE_INCOMPATIBLE', 'native ETH amounts cannot be confidential');
  check(inv.token === asset.underlying.asset, 'P13_INVOICE_INCOMPATIBLE', 'invoice token is not the wrapped asset');
  if (inv.amountPolicy.mode !== 'fixed_token') fail('P13_INVOICE_INCOMPATIBLE', 'fiat-quoted invoices are not supported');
  const confidential = toConfidentialUnits(parseDecimalUnits(inv.amountPolicy.tokenAmount), parseDecimalUnits(asset.rate));
  const gross = inv.feePolicy === 'payer_pays' ? confidentialGrossForNet(confidential) : confidential;
  return {
    invoiceDigest: `keccak256:${bytesToHex(invoiceDigest(inv)).slice(2)}`,
    feePolicy: inv.feePolicy,
    amounts: amountsFromGross(gross),
  };
}
