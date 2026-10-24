import { getNowBlock, scanTron, type TronRpc } from '@ghostpay/tron-adapter';
import { fetchMemo, getBalanceSun, TronViewError } from './rpc';
import type { TronWallet } from './wallet';

/** A detected one-time address that still holds TRX. */
export interface FoundPayment {
  readonly txID: string;
  readonly blockNumber: bigint;
  readonly stealthAddress: string;
  /** Sun credited by the funding transaction. */
  readonly receivedSun: bigint;
  /** Current balance of the one-time address, in sun. */
  readonly balanceSun: bigint;
  /** Announcement memo of the funding transaction (public data). */
  readonly memo: Uint8Array;
}

export interface ScanResult {
  readonly fromBlock: bigint;
  readonly toBlock: bigint;
  readonly found: readonly FoundPayment[];
  /** Detected payments whose one-time address is already empty (not offered for sweeping). */
  readonly emptiedCount: number;
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
 * that are already empty. The viewing key stays in this process; the node sees block numbers,
 * the transactions requested and the balances checked.
 */
export async function scanForPayments(p: ScanParams): Promise<ScanResult> {
  const { rpc, wallet, fromBlock, signal } = p;
  if (fromBlock < 0n) throw new TronViewError('Enter the first block to scan.');
  const toBlock = (await getNowBlock(rpc, signal)).number;
  if (toBlock < fromBlock) return { fromBlock, toBlock, found: [], emptiedCount: 0, tokenCount: 0 };
  if (toBlock - fromBlock + 1n > BigInt(MAX_SCAN_BLOCKS)) {
    throw new TronViewError(`Scan at most ${String(MAX_SCAN_BLOCKS)} blocks at a time. Choose a later first block.`);
  }
  const found: FoundPayment[] = [];
  const seen = new Set<string>();
  let emptiedCount = 0;
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
    const balanceSun = await getBalanceSun(rpc, d.stealthAddress, signal);
    if (balanceSun === 0n) {
      emptiedCount++;
      continue;
    }
    found.push({
      txID: d.txID,
      blockNumber: d.blockNumber,
      stealthAddress: d.stealthAddress,
      receivedSun: d.amount,
      balanceSun,
      memo: await fetchMemo(rpc, d.txID, signal),
    });
  }
  return { fromBlock, toBlock, found, emptiedCount, tokenCount };
}
