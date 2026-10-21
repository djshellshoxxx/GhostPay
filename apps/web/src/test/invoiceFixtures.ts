import { parseFragment, type ParsedInvoice } from '@ghostpay/invoice-schema';
import { buildInvoiceLink, type InvoiceForm } from '../lib/invoiceCreate';
import { generateSession } from '../lib/session';

export const NOW = 1_800_000_000;
export const USDC_84532 = '0x036cbd53842c5426634e7929541ec2318f3dcf7e';

export const BASE_FORM: InvoiceForm = {
  chainId: 84532,
  token: USDC_84532,
  currency: 'USD',
  lineItems: [{ description: 'Consulting', quantity: '2', unitPrice: '50.00' }],
  taxRatePercent: '0',
  feePolicy: 'seller_pays',
  amountMode: 'fixed_token',
  tokenAmount: '100',
  expiryHours: 24,
  quoteTtlMinutes: 15,
  maxSlippageBps: 50,
  memo: '',
  encrypt: false,
};

/** Creates keys (if none), builds a real signed link and parses it back like the Pay view would. */
export async function makeParsed(patch: Partial<InvoiceForm> = {}, pinned: readonly string[] = []): Promise<{ parsed: ParsedInvoice; fragment: string; link: string }> {
  generateSession();
  const created = await buildInvoiceLink({ ...BASE_FORM, ...patch }, 'https://app.test/', NOW);
  const parsed = await parseFragment(created.fragment, { pinnedSigners: pinned });
  return { parsed, fragment: created.fragment, link: created.link };
}
