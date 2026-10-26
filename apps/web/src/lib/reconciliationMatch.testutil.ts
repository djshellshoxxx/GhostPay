import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { createInvoice, type Invoice, type NewInvoice } from '@ghostpay/invoice-schema';

const pub = (n: number): string => {
  const k = new Uint8Array(32);
  k[31] = n;
  return bytesToHex(secp256k1.getPublicKey(k, true));
};
export const NOW = 1_800_000_000;
export const USDC = '0x036cbd53842c5426634e7929541ec2318f3dcf7e';
export function testInvoice(overrides: Partial<NewInvoice> = {}): Invoice {
  return createInvoice({
    chainId: 84532,
    metaAddress: `st:eth:0x${pub(3)}${pub(4)}`,
    fiat: { currency: 'USD', minorUnits: '0' },
    token: 'native',
    amountPolicy: { mode: 'fixed_token', tokenAmount: '1000000' },
    quote: { source: 'seller:fixed', timestamp: NOW, expiresAt: NOW + 600, maxSlippageBps: 50 },
    expiresAt: NOW + 3600,
    lineItems: [{ description: 'Secret consulting', quantity: '1', unitMinorUnits: '0' }],
    tax: { rateBps: 0, minorUnits: '0' },
    feePolicy: 'seller_pays',
    memo: 'private memo',
    signer: pub(7),
    ...overrides,
  });
}
