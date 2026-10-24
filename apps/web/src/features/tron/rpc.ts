import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import {
  createHttpRpc,
  getBlockRange,
  getChainParametersRaw,
  parseAnnouncementMemo,
  parseChainParameters,
  TronAdapterError,
  type TronChainParams,
  type TronRpc,
} from '@ghostpay/tron-adapter';
import { MAINNET_GENESIS } from './network';

/** An error whose message is written for the user and safe to display. */
export class TronViewError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'TronViewError';
  }
}

/** Node client over the injected fetch (the app's only network path). Throws on a bad URL. */
export function createRpc(url: string, fetchFn: (url: string, init: RequestInit) => Promise<Response>): TronRpc {
  return createHttpRpc({ baseUrl: url.trim(), fetch: (input, init) => fetchFn(input instanceof Request ? input.url : String(input), init ?? {}) });
}

const rec = (v: unknown): Record<string, unknown> => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new TronViewError('The node sent an unexpected answer.');
  return v as Record<string, unknown>;
};

/** Refuses a node whose block 0 is the TRON mainnet genesis block, whatever network was selected. */
export async function checkNetwork(rpc: TronRpc, signal?: AbortSignal): Promise<void> {
  const [genesis] = await getBlockRange(rpc, 0n, 0n, signal);
  if (genesis === undefined) throw new TronViewError('The node did not report its first block.');
  if (genesis.blockId.toLowerCase() === MAINNET_GENESIS) {
    throw new TronViewError('This node reports TRON mainnet. Mainnet is disabled.');
  }
}

async function account(rpc: TronRpc, address: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
  return rec(await rpc.post('/wallet/getaccount', { address, visible: true }, signal));
}

/** Balance in sun; an account that was never used on-chain reads as zero. */
export async function getBalanceSun(rpc: TronRpc, address: string, signal?: AbortSignal): Promise<bigint> {
  const b = (await account(rpc, address, signal))['balance'];
  if (b === undefined) return 0n;
  if (typeof b !== 'number' || !Number.isSafeInteger(b) || b < 0) throw new TronViewError('The node sent an unexpected answer.');
  return BigInt(b);
}

/** True when the address has been activated on-chain (a transfer to a new address burns extra TRX). */
export async function isActivated(rpc: TronRpc, address: string, signal?: AbortSignal): Promise<boolean> {
  return Object.keys(await account(rpc, address, signal)).length > 0;
}

export async function getChainParams(rpc: TronRpc, signal?: AbortSignal): Promise<TronChainParams> {
  return parseChainParameters(await getChainParametersRaw(rpc, signal));
}

/**
 * The 38-byte announcement memo of a funding transaction. The id is recomputed from the raw bytes
 * so a node cannot substitute another transaction; the key derived from the memo is checked against
 * the one-time address before use, so a wrong memo can only fail, never mis-sign.
 */
export async function fetchMemo(rpc: TronRpc, txID: string, signal?: AbortSignal): Promise<Uint8Array> {
  const tx = rec(await rpc.post('/wallet/gettransactionbyid', { value: txID }, signal));
  const rawHex = tx['raw_data_hex'];
  const data = rec(tx['raw_data'])['data'];
  if (typeof rawHex !== 'string' || !/^(?:[0-9a-f]{2})+$/i.test(rawHex) || typeof data !== 'string' || !/^(?:[0-9a-f]{2})+$/i.test(data)) {
    throw new TronViewError('The node sent an unexpected answer.');
  }
  if (bytesToHex(sha256(hexToBytes(rawHex))) !== txID.toLowerCase()) throw new TronViewError('The node sent an unexpected answer.');
  const memo = hexToBytes(data);
  if (parseAnnouncementMemo(memo) === undefined) throw new TronViewError('The funding transaction has no readable announcement.');
  return memo;
}

/** Submits a signed transaction (hex) and checks the node acknowledges the same transaction id. */
export async function broadcastHex(rpc: TronRpc, signedHex: string, txID: string, signal?: AbortSignal): Promise<string> {
  const r = rec(await rpc.post('/wallet/broadcasthex', { transaction: signedHex }, signal));
  if (r['result'] !== true) throw new TronViewError('The node rejected the transaction.');
  if (typeof r['txid'] !== 'string' || r['txid'].toLowerCase() !== txID.toLowerCase()) {
    throw new TronViewError('The node acknowledged a different transaction than the one that was signed.');
  }
  return txID;
}

const FRIENDLY: Readonly<Record<string, string>> = {
  INVALID_ADDRESS: 'That is not a valid TRON address.',
  INVALID_META_ADDRESS: 'That is not a valid TRON stealth address.',
  INSECURE_ENDPOINT: 'The node URL must use https (http only for localhost).',
  TRANSPORT_FAILURE: 'The node could not be reached or refused the request.',
  INVALID_RESPONSE: 'The node sent an answer this app cannot read.',
  INVALID_INPUT: 'One of the inputs is not valid.',
  INVALID_AMOUNT: 'The amount is not valid.',
  KEY_MISMATCH: 'The announcement does not match this wallet.',
  ABORTED: 'Cancelled.',
};

export function tronErrorMessage(e: unknown): string {
  if (e instanceof TronViewError) return e.message;
  if (e instanceof TronAdapterError) return FRIENDLY[e.code] ?? e.message;
  return 'Something went wrong. Nothing was sent.';
}
