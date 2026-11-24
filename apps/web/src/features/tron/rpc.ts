import { SOURCE_TRANSLATOR } from '../../i18n/source';
import type { MessageKey } from '../../i18n/catalog';
import type { Translator } from '../../i18n/translator';
import { UserFacingError, displayMessage, type DisplayMessage, type MessageDescriptor } from '../../lib/errors';
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
export class TronViewError extends UserFacingError {
  public constructor(message: string | MessageDescriptor) {
    super(message);
    this.name = 'TronViewError';
  }
}

/** Node client over the injected fetch (the app's only network path). Throws on a bad URL. */
export function createRpc(url: string, fetchFn: (url: string, init: RequestInit) => Promise<Response>): TronRpc {
  return createHttpRpc({ baseUrl: url.trim(), fetch: (input, init) => fetchFn(input instanceof Request ? input.url : String(input), init ?? {}) });
}

const rec = (v: unknown): Record<string, unknown> => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new TronViewError({ key: 'tron.error.response' });
  return v as Record<string, unknown>;
};

/** Refuses a node whose block 0 is the TRON mainnet genesis block, whatever network was selected. */
export async function checkNetwork(rpc: TronRpc, signal?: AbortSignal): Promise<void> {
  const [genesis] = await getBlockRange(rpc, 0n, 0n, signal);
  if (genesis === undefined) throw new TronViewError({ key: 'tron.error.firstBlock' });
  if (genesis.blockId.toLowerCase() === MAINNET_GENESIS) {
    throw new TronViewError({ key: 'tron.error.mainnet' });
  }
}

async function account(rpc: TronRpc, address: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
  return rec(await rpc.post('/wallet/getaccount', { address, visible: true }, signal));
}

/** Balance in sun; an account that was never used on-chain reads as zero. */
export async function getBalanceSun(rpc: TronRpc, address: string, signal?: AbortSignal): Promise<bigint> {
  const b = (await account(rpc, address, signal))['balance'];
  if (b === undefined) return 0n;
  if (typeof b !== 'number' || !Number.isSafeInteger(b) || b < 0) throw new TronViewError({ key: 'tron.error.response' });
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
    throw new TronViewError({ key: 'tron.error.response' });
  }
  if (bytesToHex(sha256(hexToBytes(rawHex))) !== txID.toLowerCase()) throw new TronViewError({ key: 'tron.error.response' });
  const memo = hexToBytes(data);
  if (parseAnnouncementMemo(memo) === undefined) throw new TronViewError({ key: 'tron.error.memo' });
  return memo;
}

/** Submits a signed transaction (hex) and checks the node acknowledges the same transaction id. */
export async function broadcastHex(rpc: TronRpc, signedHex: string, txID: string, signal?: AbortSignal): Promise<string> {
  const r = rec(await rpc.post('/wallet/broadcasthex', { transaction: signedHex }, signal));
  if (r['result'] !== true) throw new TronViewError({ key: 'tron.error.rejected' });
  if (typeof r['txid'] !== 'string' || r['txid'].toLowerCase() !== txID.toLowerCase()) {
    throw new TronViewError({ key: 'tron.error.differentTx' });
  }
  return txID;
}

const FRIENDLY: Readonly<Record<string, MessageKey>> = {
  INVALID_ADDRESS: 'tron.error.invalidAddress',
  INVALID_META_ADDRESS: 'tron.error.invalidMetaAddress',
  INVALID_AMOUNT: 'tron.error.invalidAmount',
  INVALID_INPUT: 'tron.error.invalidInput',
  INVALID_MEMO: 'tron.error.invalidMemo',
  INVALID_PROTOBUF: 'tron.error.invalidProtobuf',
  CHAIN_MISMATCH: 'tron.error.chainMismatch',
  CHAIN_DISABLED: 'tron.error.chainDisabled',
  TRANSPORT_FAILURE: 'tron.error.transportFailure',
  INVALID_RESPONSE: 'tron.error.invalidResponse',
  INSECURE_ENDPOINT: 'tron.error.insecureEndpoint',
  ABORTED: 'tron.error.aborted',
  UNSUPPORTED: 'tron.error.unsupported',
  KEY_MISMATCH: 'tron.error.keyMismatch',
  SIGNATURE_INVALID: 'tron.error.signatureInvalid',
};

/** Capture only catalog-backed public diagnostics before an async result enters view state. */
export function captureTronErrorMessage(e: unknown): DisplayMessage {
  if (e instanceof TronViewError) return e.translation ?? e.message;
  return { key: e instanceof TronAdapterError ? FRIENDLY[e.code] ?? 'error.unknown' : 'error.unknown' };
}

export function tronErrorMessage(e: unknown, t: Translator['t'] = SOURCE_TRANSLATOR.t): string {
  return displayMessage(captureTronErrorMessage(e), t);
}

// i18n-use: tron.error.response tron.error.firstBlock tron.error.mainnet tron.error.memo tron.error.rejected tron.error.differentTx tron.error.invalidAddress tron.error.invalidMetaAddress tron.error.invalidAmount tron.error.invalidInput tron.error.invalidMemo tron.error.invalidProtobuf tron.error.chainMismatch tron.error.chainDisabled tron.error.transportFailure tron.error.invalidResponse tron.error.insecureEndpoint tron.error.aborted tron.error.unsupported tron.error.keyMismatch tron.error.signatureInvalid
