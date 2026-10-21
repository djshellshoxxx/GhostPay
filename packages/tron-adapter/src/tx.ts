import { secp256k1 } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { unsafeRevealSecret, zeroize, type SecretScalar } from '@ghostpay/core-crypto';
import { decodeTronAddress, tronAddressFromHex as tronAddressFromHexUnsafe, tronAddressFromPublicKey } from './address.js';
import { fail } from './errors.js';
import { concat, decodeFields, fBytes, fVarint } from './protobuf.js';

/** ABI selector of `transfer(address,uint256)`. */
export const TRC20_TRANSFER_SELECTOR = 'a9059cbb';
/** `Transaction.Contract.ContractType` values (java-tron `Tron.proto`). */
export const CONTRACT_TYPE_TRANSFER = 1;
export const CONTRACT_TYPE_TRIGGER_SMART_CONTRACT = 31;
const TYPE_URL_PREFIX = 'type.googleapis.com/protocol.';
const U64_MAX = (1n << 64n) - 1n;
const U256_MAX = (1n << 256n) - 1n;
/** Default transaction validity: 10 minutes (node cap is 24h, unverified here). */
export const DEFAULT_EXPIRATION_MS = 10 * 60 * 1000;

/** Reference block (a recent block id) that anchors a transaction against replay on forks. */
export interface RefBlock {
  readonly number: bigint;
  /** 32-byte block id, hex (as `blockID` in node responses). */
  readonly blockId: string;
}

/** Fields shared by both builders. */
export interface RawTxCommon {
  /** Sender, base58. */
  readonly owner: string;
  readonly refBlock: RefBlock;
  readonly timestampMs: bigint;
  readonly expirationMs?: bigint;
  /** Optional tx-level memo bytes (`raw_data.data`); stealth announcements go here. */
  readonly memo?: Uint8Array;
}

/** TRC-20 `transfer(to, amount)` call. */
export interface Trc20TransferInput extends RawTxCommon {
  /** Token contract, base58. */
  readonly contract: string;
  /** Recipient, base58. */
  readonly to: string;
  readonly amount: bigint;
  /** Max sun burnable for energy; REQUIRED, > 0 (no hidden default). */
  readonly feeLimitSun: bigint;
}

/** Native TRX transfer (amount in sun, 1 TRX = 1_000_000 sun). */
export interface TrxTransferInput extends RawTxCommon {
  readonly to: string;
  readonly amountSun: bigint;
}

/** An unsigned transaction. `txID = sha256(rawData)`. */
export interface UnsignedTronTx {
  readonly rawData: Uint8Array;
  readonly rawDataHex: string;
  readonly txID: string;
}

/** ABI-encoded `transfer(address,uint256)` calldata (68 bytes). */
export function encodeTrc20TransferData(to: string, amount: bigint): Uint8Array {
  if (amount <= 0n || amount > U256_MAX) fail('INVALID_AMOUNT');
  const out = new Uint8Array(68);
  out.set(hexToBytes(TRC20_TRANSFER_SELECTOR), 0);
  out.set(decodeTronAddress(to).subarray(1), 4 + 12);
  let a = amount;
  for (let i = 67; i >= 36; i--) {
    out[i] = Number(a & 0xffn);
    a >>= 8n;
  }
  return out;
}

function contractEnvelope(type: number, typeName: string, value: Uint8Array): Uint8Array {
  const any = concat(fBytes(1, new TextEncoder().encode(TYPE_URL_PREFIX + typeName)), fBytes(2, value));
  return concat(fVarint(1, type), fBytes(2, any));
}

function rawData(c: RawTxCommon, contract: Uint8Array, feeLimitSun: bigint): UnsignedTronTx {
  const id = hexToBytesStrict(c.refBlock.blockId, 32);
  if (c.refBlock.number < 0n || c.refBlock.number > U64_MAX) fail('INVALID_INPUT');
  const refBlockBytes = Uint8Array.of(Number((c.refBlock.number >> 8n) & 0xffn), Number(c.refBlock.number & 0xffn));
  const refBlockHash = id.subarray(8, 16);
  const expiration = c.expirationMs ?? c.timestampMs + BigInt(DEFAULT_EXPIRATION_MS);
  if (c.timestampMs <= 0n || expiration <= c.timestampMs || expiration > U64_MAX) fail('INVALID_INPUT');
  if (feeLimitSun < 0n || feeLimitSun > U64_MAX) fail('INVALID_INPUT');
  const raw = concat(
    fBytes(1, refBlockBytes),
    fBytes(4, refBlockHash),
    fVarint(8, expiration),
    fBytes(10, c.memo ?? new Uint8Array(0)),
    fBytes(11, contract),
    fVarint(14, c.timestampMs),
    fVarint(18, feeLimitSun),
  );
  return { rawData: raw, rawDataHex: bytesToHex(raw), txID: bytesToHex(sha256(raw)) };
}

function hexToBytesStrict(hex: string, len: number): Uint8Array {
  if (typeof hex !== 'string' || hex.length !== len * 2 || !/^[0-9a-fA-F]+$/.test(hex)) return fail('INVALID_INPUT');
  return hexToBytes(hex);
}

/** Builds an unsigned TRC-20 transfer (`TriggerSmartContract` calling `transfer`). */
export function buildTrc20Transfer(i: Trc20TransferInput): UnsignedTronTx {
  if (i.feeLimitSun <= 0n) fail('INVALID_INPUT');
  const owner = decodeTronAddress(i.owner);
  const contract = decodeTronAddress(i.contract);
  const value = concat(fBytes(1, owner), fBytes(2, contract), fBytes(4, encodeTrc20TransferData(i.to, i.amount)));
  return rawData(i, contractEnvelope(CONTRACT_TYPE_TRIGGER_SMART_CONTRACT, 'TriggerSmartContract', value), i.feeLimitSun);
}

/** Builds an unsigned native TRX transfer. */
export function buildTrxTransfer(i: TrxTransferInput): UnsignedTronTx {
  if (i.amountSun <= 0n || i.amountSun > U64_MAX) fail('INVALID_AMOUNT');
  const value = concat(fBytes(1, decodeTronAddress(i.owner)), fBytes(2, decodeTronAddress(i.to)), fVarint(3, i.amountSun));
  return rawData(i, contractEnvelope(CONTRACT_TYPE_TRANSFER, 'TransferContract', value), 0n);
}

/** Decoded view of a `Transaction.raw` for review/verification (never trust a node-built tx). */
export interface DecodedRawTx {
  readonly kind: 'trx' | 'trc20';
  readonly owner: string;
  readonly to: string;
  /** TRC-20 contract (base58); undefined for TRX. */
  readonly contract?: string;
  /** sun for TRX, token base units for TRC-20. */
  readonly amount: bigint;
  readonly memo: Uint8Array;
  readonly expirationMs: bigint;
  readonly timestampMs: bigint;
  readonly feeLimitSun: bigint;
  readonly refBlockBytes: Uint8Array;
  readonly refBlockHash: Uint8Array;
}

/** Strictly decodes the transactions this package builds. Rejects anything else. */
export function decodeRawTx(raw: Uint8Array): DecodedRawTx {
  const f = decodeFields(raw);
  const one = (n: number): Uint8Array | undefined => f.find((x) => x.field === n)?.bytes;
  const v = (n: number): bigint => f.find((x) => x.field === n)?.varint ?? 0n;
  if (f.some((x) => ![1, 4, 8, 10, 11, 14, 18].includes(x.field))) fail('INVALID_PROTOBUF');
  if (f.filter((x) => x.field === 11).length !== 1) fail('INVALID_PROTOBUF');
  const contractBytes = one(11) as Uint8Array;
  const cf = decodeFields(contractBytes);
  const type = Number(cf.find((x) => x.field === 1)?.varint ?? 0n);
  const param = cf.find((x) => x.field === 2)?.bytes;
  if (param === undefined) return fail('INVALID_PROTOBUF');
  const any = decodeFields(param);
  const url = new TextDecoder().decode(any.find((x) => x.field === 1)?.bytes ?? new Uint8Array(0));
  const val = any.find((x) => x.field === 2)?.bytes;
  if (val === undefined) return fail('INVALID_PROTOBUF');
  const vf = decodeFields(val);
  const vb = (n: number): Uint8Array => vf.find((x) => x.field === n)?.bytes ?? new Uint8Array(0);
  const common = {
    memo: one(10) ?? new Uint8Array(0),
    expirationMs: v(8),
    timestampMs: v(14),
    feeLimitSun: v(18),
    refBlockBytes: one(1) ?? new Uint8Array(0),
    refBlockHash: one(4) ?? new Uint8Array(0),
  };
  const addr = (b: Uint8Array): string => {
    const hex = bytesToHex(b);
    if (hex.length !== 42) return fail('INVALID_PROTOBUF');
    return tronAddressFromHexUnsafe(hex);
  };
  if (type === CONTRACT_TYPE_TRANSFER && url === `${TYPE_URL_PREFIX}TransferContract`) {
    return { kind: 'trx', owner: addr(vb(1)), to: addr(vb(2)), amount: vf.find((x) => x.field === 3)?.varint ?? 0n, ...common };
  }
  if (type === CONTRACT_TYPE_TRIGGER_SMART_CONTRACT && url === `${TYPE_URL_PREFIX}TriggerSmartContract`) {
    const data = vb(4);
    if (data.length !== 68 || bytesToHex(data.subarray(0, 4)) !== TRC20_TRANSFER_SELECTOR) return fail('INVALID_PROTOBUF');
    if (data.subarray(4, 16).some((b) => b !== 0)) return fail('INVALID_PROTOBUF');
    const to = addr(concat(Uint8Array.of(0x41), data.subarray(16, 36)));
    let amount = 0n;
    for (const b of data.subarray(36, 68)) amount = (amount << 8n) | BigInt(b);
    return { kind: 'trc20', owner: addr(vb(1)), to, contract: addr(vb(2)), amount, ...common };
  }
  return fail('INVALID_PROTOBUF');
}


/**
 * Signs `txID` bytes (sha256 of raw_data) with a secp256k1 key. TRON signature = r || s || recId
 * (65 bytes, recId 0/1). The signature is self-verified by public-key recovery against `signer`.
 * @security `secret` must be a verified stealth key (see `deriveTronStealthKey`).
 */
export function signTronTx(tx: UnsignedTronTx, secret: SecretScalar): string {
  const key = unsafeRevealSecret(secret);
  try {
    const digest = hexToBytes(tx.txID);
    if (bytesToHex(sha256(tx.rawData)) !== tx.txID) return fail('INVALID_INPUT');
    const rec = secp256k1.sign(digest, key, { prehash: false, format: 'recovered' });
    const v = rec[0] as number;
    if (v > 1) return fail('SIGNATURE_INVALID');
    const sig = concat(rec.subarray(1), Uint8Array.of(v));
    const pub = secp256k1.getPublicKey(key, true);
    const recovered = secp256k1.recoverPublicKey(rec, digest, { prehash: false });
    if (tronAddressFromPublicKey(recovered) !== tronAddressFromPublicKey(pub)) return fail('SIGNATURE_INVALID');
    return bytesToHex(sig);
  } finally {
    zeroize(key);
  }
}

/** Recovers the signer address of a 65-byte (r||s||recId) signature over `txID`. */
export function recoverTronSigner(txID: string, signatureHex: string): string {
  const sig = hexToBytesStrict(signatureHex, 65);
  const v = sig[64] as number;
  if (v > 1) return fail('SIGNATURE_INVALID');
  const rec = concat(Uint8Array.of(v), sig.subarray(0, 64));
  try {
    return tronAddressFromPublicKey(secp256k1.recoverPublicKey(rec, hexToBytesStrict(txID, 32), { prehash: false }));
  } catch {
    return fail('SIGNATURE_INVALID');
  }
}

/**
 * Hex of the full signed `Transaction` protobuf (`raw_data` field 1 + `signature` field 2).
 * Accepted by the node's `/wallet/broadcasthex` (UNVERIFIED here, see docs/chains/tron.md);
 * this package never broadcasts.
 */
export function encodeSignedTransactionHex(tx: UnsignedTronTx, signatureHex: string): string {
  return bytesToHex(concat(fBytes(1, tx.rawData), fBytes(2, hexToBytesStrict(signatureHex, 65))));
}
