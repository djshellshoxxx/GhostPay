import type { PaymentRecord } from './types.js';

export const SENDER = '0x1111111111111111111111111111111111111111';
export const RECIPIENT = '0x2222222222222222222222222222222222222222';
export const TX = '0x' + 'ab'.repeat(32);

export function record(over: Record<string, unknown> = {}): PaymentRecord {
  return {
    createdAt: '2026-03-04T05:06:07.089Z',
    chain: 'eip155:8453',
    asset: { symbol: 'USDC', decimals: 6 },
    amountBase: '1500000',
    memo: 'Lunch split',
    txHash: TX,
    sender: SENDER,
    recipient: RECIPIENT,
    recipientKind: 'stealth',
    ...over,
  };
}
