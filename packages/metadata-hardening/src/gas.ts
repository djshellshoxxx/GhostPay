import { assertTestnetChain, MetadataHardeningError, requireInput } from './guard.js';

/** Default bucket: 10 000 gas (spec MH-WAL-1). */
export const DEFAULT_GAS_BUCKET = 10_000n;

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
 */
export function bucketGasLimit(estimate: bigint, opts: GasBucketOptions): bigint {
  assertTestnetChain(opts.chainId);
  requireInput(estimate > 0n, 'gas estimate must be positive');
  const bucket = opts.bucket ?? DEFAULT_GAS_BUCKET;
  requireInput(bucket >= 1n && bucket <= 1_000_000n, 'bucket out of range');
  const headroom = opts.headroomBps ?? 0;
  requireInput(Number.isInteger(headroom) && headroom >= 0 && headroom <= 10_000, 'headroom out of range');
  const padded = (estimate * BigInt(10_000 + headroom) + 9_999n) / 10_000n;
  return ((padded + bucket - 1n) / bucket) * bucket;
}

const ALLOWED_TX_FIELDS: ReadonlySet<string> = new Set(['from', 'to', 'data', 'value', 'chainId', 'gas']);

/**
 * MH-WAL-1 R3: a payer tx request may carry only the existing fields plus `gas`. Exotic fee
 * fields would themselves be a fingerprint.
 *
 * @throws {MetadataHardeningError} `POLICY_REJECTED` naming the first offending field.
 */
export function assertOnlyAllowedTxFields(tx: Readonly<Record<string, unknown>>): void {
  for (const k of Object.keys(tx)) {
    if (!ALLOWED_TX_FIELDS.has(k)) {
      throw new MetadataHardeningError('POLICY_REJECTED', `tx field not allowed: ${k.slice(0, 24)}`);
    }
  }
}
