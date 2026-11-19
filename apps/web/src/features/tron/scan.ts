import { getNowBlock, scanTron, type TronRpc } from '@ghostpay/tron-adapter';
import { TronViewError } from './rpc';
import type { TronWallet } from './wallet';

/**
 * A detected one-time address. Neither its balance nor its announcement memo is read during the scan (each would be a
 * per-match request to the node); `readSweepDetails` in `sweep.ts` reads them for the one address being reviewed.
 */
export interface FoundPayment {
  readonly txID: string;
  readonly blockNumber: bigint;
  readonly stealthAddress: string;
  /** Sun credited by the funding transaction. */
  readonly receivedSun: bigint;
}

export interface ScanResult {
  readonly fromBlock: bigint;
  readonly toBlock: bigint;
  readonly found: readonly FoundPayment[];
  /** TRC-20 payments detected but not swept by this view (they need energy and a trusted-token list). */
  readonly tokenCount: number;
}

/** Blocks per scan run: each block is downloaded whole through the node. */
export const MAX_SCAN_BLOCKS = 1000;

export interface ScanParams {
  readonly rpc: TronRpc;
  readonly wallet: TronWallet;
  readonly fromBlock: bigint;
  readonly signal: AbortSignal;
  readonly onFound?: (block: bigint) => void;
}

/**
 * Scans blocks from `fromBlock` to the node head for payments to the wallet and drops addresses
 * The viewing key stays in this process; the node sees block numbers and the transactions requested.
 * It sees no balance or memo request here: those are deferred to sweep time, one address at a time.
 */
export async function scanForPayments(p: ScanParams): Promise<ScanResult> {
  const { rpc, wallet, fromBlock, signal } = p;
  if (fromBlock < 0n) throw new TronViewError({ key: 'tron.block.required' });
  const toBlock = (await getNowBlock(rpc, signal)).number;
  if (toBlock < fromBlock) return { fromBlock, toBlock, found: [], tokenCount: 0 };
  if (toBlock - fromBlock + 1n > BigInt(MAX_SCAN_BLOCKS)) {
    throw new TronViewError({ key: 'tron.error.scanRange', values: { limit: String(MAX_SCAN_BLOCKS) } });
  }
  const found: FoundPayment[] = [];
  const seen = new Set<string>();
  let tokenCount = 0;
  for await (const d of scanTron(rpc, {
    fromBlock,
    toBlock,
    viewingSecret: wallet.keys.viewingSecret,
    spendingPublicKey: wallet.keys.spendingPublicKey,
    signal,
  })) {
    p.onFound?.(d.blockNumber);
    if (d.asset !== 'native') {
      tokenCount++;
      continue;
    }
    if (seen.has(d.stealthAddress)) continue;
    seen.add(d.stealthAddress);
    found.push({
      txID: d.txID,
      blockNumber: d.blockNumber,
      stealthAddress: d.stealthAddress,
      receivedSun: d.amount,
    });
  }
  return { fromBlock, toBlock, found, tokenCount };
}

// i18n-use: tron.block.required tron.error.scanRange
