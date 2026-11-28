import { assertTestnetChain, MetadataHardeningError, requireInput } from './guard.js';
import { requireBigint, requireRecord } from './validate.js';

/** Default bucket: 10 000 gas (spec MH-WAL-1). */
export const DEFAULT_GAS_BUCKET = 10_000n;
/** Largest gas estimate accepted: a block gas limit is far below 2^64. */
const MAX_GAS = (1n << 64n) - 1n;

/** Options for {@link bucketGasLimit}. */
export interface GasBucketOptions {
  readonly chainId: number;
  /** Bucket size in gas, >= 1. Default 10 000. */
  readonly bucket?: bigint;
  /** Extra headroom in basis points applied before bucketing (relayer today: 2000 = +20 %). */
  readonly headroomBps?: number;
}

/**
 * MH-WAL-1 (payer) / MH-WAL-2 (relayer): rounds a gas limit up to a bucket grid.
 *
 * @remarks Monotone, result >= estimate. Hides wallet/estimator-specific padding only. Does NOT
 * hide tx type, tip pattern, nonce or payer address. Unused gas is refunded.
 * @throws {MetadataHardeningError} `INVALID_INPUT` for a non-bigint estimate or bucket, or an
 * estimate above 2^64 - 1.
 */
export function bucketGasLimit(estimate: bigint, opts: GasBucketOptions): bigint {
  requireRecord(opts, 'options');
  assertTestnetChain(opts.chainId);
  requireBigint(estimate, 'gas estimate');
  requireInput(estimate > 0n && estimate <= MAX_GAS, 'gas estimate must be positive');
  if (opts.bucket !== undefined) requireBigint(opts.bucket, 'bucket');
  const bucket = opts.bucket ?? DEFAULT_GAS_BUCKET;
  requireInput(bucket >= 1n && bucket <= 1_000_000n, 'bucket out of range');
  const headroom = opts.headroomBps ?? 0;
  requireInput(Number.isInteger(headroom) && headroom >= 0 && headroom <= 10_000, 'headroom out of range');
  const padded = (estimate * BigInt(10_000 + headroom) + 9_999n) / 10_000n;
  const result = ((padded + bucket - 1n) / bucket) * bucket;
  if (result > MAX_GAS) throw new MetadataHardeningError('LIMIT_EXCEEDED', 'gas limit exceeds 2^64 - 1');
  return result;
}

const ALLOWED_TX_FIELDS: ReadonlySet<string> = new Set(['from', 'to', 'data', 'value', 'chainId', 'gas']);
/**
 * Transaction field names safe to print (JSON-RPC, EIP-1559/2930/4844/7702). Anything else is
 * withheld: a key can be any caller text, including a secret-shaped identifier or control characters.
 */
const KNOWN_TX_FIELDS: ReadonlySet<string> = new Set([
  'nonce', 'gasPrice', 'gasLimit', 'maxFeePerGas', 'maxPriorityFeePerGas', 'maxFeePerBlobGas', 'type', 'accessList', 'authorizationList',
  'blobVersionedHashes', 'blobs', 'kzgProofs', 'input', 'chain', 'hash', 'r', 's', 'v', 'yParity', 'blockHash', 'blockNumber', 'transactionIndex',
]);

/**
 * MH-WAL-1 R3: a payer tx request may carry only the existing fields plus `gas`. Exotic fee
 * fields would themselves be a fingerprint.
 *
 * @remarks Checks own enumerable string keys (what a JSON-RPC serialiser would send). The message
 * names the first offending field only when it is a known transaction field name; any other key is
 * "(name withheld)", so a hostile key cannot inject log lines or smuggle data into logs.
 * @throws {MetadataHardeningError} `POLICY_REJECTED` naming the first offending field.
 */
export function assertOnlyAllowedTxFields(tx: Readonly<Record<string, unknown>>): void {
  requireRecord(tx, 'transaction request');
  for (const k of Object.keys(tx)) {
    if (!ALLOWED_TX_FIELDS.has(k)) {
      throw new MetadataHardeningError('POLICY_REJECTED', `tx field not allowed: ${KNOWN_TX_FIELDS.has(k) ? k : '(name withheld)'}`);
    }
  }
}
