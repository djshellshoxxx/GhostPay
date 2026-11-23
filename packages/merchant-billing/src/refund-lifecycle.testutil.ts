import {
  createOutcomeAuthority,
  evmPaymentId,
  operatorAuthorization,
  RefundBook,
  type AttemptInput,
  type PaymentEvidence,
  type RefundLedger,
  type RefundRecord,
  type VerifiedPaymentOutcome,
} from './refund-lifecycle.js';
import { metaOf, REFUND_META } from './fixtures.testutil.js';

export const T0 = 1_800_000_000;
export const TX = `0x${'ab'.repeat(32)}`;
export const TOKEN = '0x036cbd53842c5426634e7929541ec2318f3dcf7e';
export const ROUTER = '0x1000000000000000000000000000000000000001';
export const SELLER = '0x2000000000000000000000000000000000000002';
export const PAYER = '0x3000000000000000000000000000000000000003';
export const ONE_TIME = '0x4000000000000000000000000000000000000004';
export const DEST_META = REFUND_META;
export const PAY_META = metaOf(21, 22);
export const hashOf = (n: number): string => `0x${n.toString(16).padStart(64, '0')}`;
export const addrOf = (n: number): string => `0x${n.toString(16).padStart(40, '0')}`;

export function evidence(over: Partial<PaymentEvidence> = {}): PaymentEvidence {
  const chainId = over.chainId ?? 84532;
  const transactionHash = over.transactionHash ?? TX;
  return {
    paymentId: evmPaymentId(chainId, transactionHash), invoiceId: 'inv-0001', chainId, assetId: TOKEN, amount: 1_000_000n,
    transactionHash, logIndex: 3, senderAddress: PAYER, recipientAddress: ONE_TIME, status: 'finalized', blockNumber: 100n,
    blockHash: hashOf(100), blockTimestamp: T0 - 600, confirmations: 20n, evidenceId: `${TOKEN}:100:${transactionHash}:4`,
    verifier: 'evm-router-v1', verifiedAt: T0, ...over,
  };
}

export function harness(): {
  book: RefundBook;
  mint: (over?: Partial<PaymentEvidence>) => VerifiedPaymentOutcome;
  foreignMint: (over?: Partial<PaymentEvidence>) => VerifiedPaymentOutcome;
} {
  const { minter, checker } = createOutcomeAuthority('evm-router-v1');
  const foreign = createOutcomeAuthority('evm-router-v1');
  return {
    book: new RefundBook(checker),
    mint: (over = {}) => minter.mint(evidence(over)),
    foreignMint: (over = {}) => foreign.minter.mint(evidence(over)),
  };
}

export function attemptInput(over: Partial<AttemptInput> = {}, n = 1): AttemptInput {
  return {
    chainId: 84532, from: SELLER, to: ROUTER, data: `0x12345678${'00'.repeat(32)}`, value: 0n, gross: 1_002_506n, netAmount: 400_000n,
    assetId: TOKEN, stealthAddress: addrOf(0x5000 + n), ephemeralPublicKey: `0x02${n.toString(16).padStart(64, '0')}`,
    deadline: T0 + 1800, startBlock: 180n, ...over,
  };
}

/** Request + authorize + prepare a 400_000 refund; returns the ledger and the prepared record. */
export function preparedLedger(h = harness(), key = 'refund-0001', n = 1, ledger: RefundLedger = []): { ledger: RefundLedger; record: RefundRecord; h: ReturnType<typeof harness> } {
  const requested = h.book.request(ledger, h.mint(), { idempotencyKey: key, amount: 400_000n, destinationMeta: DEST_META, reason: 'overpayment', linkedMetas: [PAY_META] }, T0);
  const auth = operatorAuthorization(requested.record, 'operator-1', T0, 3600);
  const authorized = h.book.authorize(requested.ledger, requested.record.refundId, auth, T0);
  const prepared = h.book.prepare(authorized.ledger, requested.record.refundId, h.mint(), attemptInput({}, n), T0);
  return { ledger: prepared.ledger, record: prepared.record, h };
}

export function transferObs(record: RefundRecord, over: Record<string, unknown> = {}): {
  kind: 'transfer-verified'; transactionHash: string; from: string; stealthAddress: string; ephemeralPublicKey: string;
  assetId: string; netAmount: bigint; blockNumber: bigint; blockHash: string; confirmations: bigint; final: boolean;
} {
  const a = record.attempt!;
  return {
    kind: 'transfer-verified', transactionHash: a.transactionHash ?? hashOf(0xbeef), from: a.from, stealthAddress: a.stealthAddress,
    ephemeralPublicKey: a.ephemeralPublicKey, assetId: a.assetId, netAmount: record.amount, blockNumber: 200n, blockHash: hashOf(200),
    confirmations: 2n, final: false, ...over,
  } as never;
}
