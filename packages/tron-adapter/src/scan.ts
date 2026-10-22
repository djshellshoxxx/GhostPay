import { keccak_256 } from '@noble/hashes/sha3.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import type { CompressedPoint, SecretScalar } from '@ghostpay/core-crypto';
import { tronAddressFromHex, tronAddressToHex } from './address.js';
import { fail } from './errors.js';
import { checkTronAnnouncement } from './meta.js';
import { getBlockRange, getNowBlock, getTransactionInfo, type TronRpc } from './rpc.js';
import { TRC20_TRANSFER_SELECTOR } from './tx.js';

/** keccak256("Transfer(address,address,uint256)") as hex, the ERC-20/TRC-20 event topic. */
export const TRANSFER_TOPIC = bytesToHex(keccak_256(new TextEncoder().encode('Transfer(address,address,uint256)')));

/** A payment that matches the viewing key. */
export interface DetectedTronPayment {
  readonly stealthAddress: string;
  readonly txID: string;
  readonly blockNumber: bigint;
  /** `'native'` (TRX, amount in sun) or TRC-20 contract (base58). */
  readonly asset: string;
  readonly amount: bigint;
  readonly payer: string;
  /** False unless native or the contract is in `trustedTokens` (fail closed when unset). Never credit untrusted tokens as value. */
  readonly trustedToken: boolean;
}

/** Scan options. */
export interface TronScanOptions {
  readonly fromBlock: bigint;
  /** Inclusive; defaults to the node head. */
  readonly toBlock?: bigint;
  readonly viewingSecret: SecretScalar;
  readonly spendingPublicKey: CompressedPoint;
  /** Base58 TRC-20 contracts considered real value (fake-token spoofing defence). Unset: no token is trusted. */
  readonly trustedTokens?: readonly string[];
  readonly pageSize?: number;
  readonly signal: AbortSignal;
}

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const HEX = /^[0-9a-f]*$/i;

interface Candidate {
  readonly to: string;
  readonly asset: string;
  readonly amount: bigint;
  readonly payer: string;
  readonly memo: Uint8Array;
  readonly contractHex?: string;
}

/** @internal Extracts a GhostPay-shaped candidate from a block transaction; undefined if not one. */
export function parseCandidate(tx: unknown): (Candidate & { txID: string }) | undefined {
  if (!isRec(tx) || typeof tx['txID'] !== 'string') return undefined;
  const raw = tx['raw_data'];
  const rawHex = tx['raw_data_hex'];
  if (!isRec(raw) || typeof rawHex !== 'string' || !HEX.test(rawHex) || rawHex.length % 2 !== 0) return undefined;
  // Never trust a node-supplied id: recompute it from the bytes the node claims it signed.
  if (bytesToHex(sha256(hexToBytes(rawHex))) !== tx['txID'].toLowerCase()) return undefined;
  const ret = tx['ret'];
  if (!Array.isArray(ret) || !isRec(ret[0]) || ret[0]['contractRet'] !== 'SUCCESS') return undefined;
  const memoHex = raw['data'];
  if (typeof memoHex !== 'string' || !HEX.test(memoHex) || memoHex.length !== 76) return undefined;
  const contracts = raw['contract'];
  if (!Array.isArray(contracts) || contracts.length !== 1 || !isRec(contracts[0])) return undefined;
  const c = contracts[0];
  const value = isRec(c['parameter']) && isRec(c['parameter']['value']) ? c['parameter']['value'] : undefined;
  if (value === undefined || typeof value['owner_address'] !== 'string') return undefined;
  const memo = hexToBytes(memoHex);
  try {
    const payer = tronAddressFromHex(value['owner_address']);
    const txID = tx['txID'].toLowerCase();
    if (c['type'] === 'TransferContract') {
      const amt = value['amount'];
      if (typeof value['to_address'] !== 'string' || typeof amt !== 'number' || !Number.isSafeInteger(amt) || amt <= 0) return undefined;
      return { txID, to: tronAddressFromHex(value['to_address']), asset: 'native', amount: BigInt(amt), payer, memo };
    }
    if (c['type'] === 'TriggerSmartContract') {
      const data = value['data'];
      const ch = value['contract_address'];
      if (typeof data !== 'string' || typeof ch !== 'string' || data.length !== 136 || !HEX.test(data)) return undefined;
      if (data.slice(0, 8).toLowerCase() !== TRC20_TRANSFER_SELECTOR || !/^0{24}$/.test(data.slice(8, 32))) return undefined;
      if (value['call_value'] !== undefined && value['call_value'] !== 0) return undefined;
      return {
        txID,
        to: tronAddressFromHex(`41${data.slice(32, 72)}`),
        asset: tronAddressFromHex(ch),
        amount: BigInt(`0x${data.slice(72, 136)}`),
        payer,
        memo,
        contractHex: ch.toLowerCase(),
      };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/** Confirms a TRC-20 `Transfer(from, to, amount)` event really happened in the receipt. */
async function confirmTrc20(rpc: TronRpc, c: Candidate & { txID: string }, signal: AbortSignal): Promise<boolean> {
  const info = await getTransactionInfo(rpc, c.txID, signal);
  if (!info.resultOk) return false;
  const contract20 = (c.contractHex ?? '').slice(2);
  const toTopic = `${'0'.repeat(24)}${tronAddressToHex(c.to).slice(2)}`;
  const amountData = c.amount.toString(16).padStart(64, '0');
  return info.logs.some(
    (l) =>
      (l.address.length === 42 ? l.address.slice(2) : l.address) === contract20 &&
      l.topics.length === 3 &&
      l.topics[0] === TRANSFER_TOPIC &&
      l.topics[2] === toTopic &&
      l.data === amountData,
  );
}

/**
 * Scans blocks for GhostPay memos that pay the viewing key. No announcer contract is used
 * (ADR-0019): the announcement lives in `raw_data.data` of the payment transaction itself.
 * TRC-20 credits are confirmed against the receipt's `Transfer` log. Malformed or hostile
 * transactions are skipped, never thrown on.
 */
export async function* scanTron(rpc: TronRpc, o: TronScanOptions): AsyncGenerator<DetectedTronPayment> {
  const page = BigInt(Math.min(Math.max(o.pageSize ?? 50, 1), 100));
  const head = o.toBlock ?? (await getNowBlock(rpc, o.signal)).number;
  const trusted = o.trustedTokens === undefined ? undefined : new Set(o.trustedTokens);
  for (let start = o.fromBlock; start <= head; start += page) {
    if (o.signal.aborted) return fail('ABORTED');
    const end = start + page - 1n > head ? head : start + page - 1n;
    for (const block of await getBlockRange(rpc, start, end, o.signal)) {
      for (const tx of block.transactions) {
        const c = parseCandidate(tx);
        if (c === undefined) continue;
        if (!checkTronAnnouncement({ stealthAddress: c.to, memo: c.memo }, o.viewingSecret, o.spendingPublicKey)) continue;
        if (c.asset !== 'native' && !(await confirmTrc20(rpc, c, o.signal))) continue;
        yield {
          stealthAddress: c.to,
          txID: c.txID,
          blockNumber: block.number,
          asset: c.asset,
          amount: c.amount,
          payer: c.payer,
          trustedToken: c.asset === 'native' || (trusted?.has(c.asset) ?? false),
        };
      }
    }
  }
}
