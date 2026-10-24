import { parseCompressedPoint } from '@ghostpay/core-crypto';
import {
  MAX_DELAY,
  MIN_DELAY,
  UNLIMITED,
  ZERO_HASH,
  buildLimitsTree,
  buildPolicyRecord,
  computePolicyHash,
  encodeScheme2MetaAddress,
  validatePolicy,
  type PolicyRecord,
  type TokenLimit,
} from '@ghostpay/policy-scheme';
import { hexToBytes } from '@noble/hashes/utils.js';
import { getAddress, isAddress } from 'viem/utils';
import { UserFacingError } from '../../lib/errors';

/** Delay presets offered in the form; also the default delay candidates for policy re-discovery. */
export const DELAY_PRESETS: readonly { readonly seconds: bigint; readonly label: string }[] = [
  { seconds: 3600n, label: '1 hour' },
  { seconds: 86_400n, label: '1 day' },
  { seconds: 259_200n, label: '3 days' },
  { seconds: 604_800n, label: '7 days' },
  { seconds: 2_592_000n, label: '30 days' },
];

/** A limit row as typed in the form (decimal base units). */
export interface LimitRow {
  readonly token: string;
  readonly limit: string;
  readonly windowSeconds: string;
}

export interface CreatePolicyInput {
  readonly spendingPublicKeyHex: string;
  readonly viewingPublicKeyHex: string;
  readonly destination: string;
  readonly delaySeconds: bigint;
  readonly limits: readonly LimitRow[];
}

const DEC = /^(?:0|[1-9][0-9]{0,77})$/;

function row(r: LimitRow, i: number): TokenLimit {
  const token = r.token.trim() === '' || r.token.trim().toLowerCase() === 'native' ? '0x0000000000000000000000000000000000000000' : r.token.trim();
  if (!isAddress(token, { strict: true })) throw new UserFacingError(`Limit ${String(i + 1)}: token must be a checksummed address or "native".`);
  const limitText = r.limit.trim().toLowerCase();
  const limit = limitText === 'unlimited' ? UNLIMITED : DEC.test(limitText) ? BigInt(limitText) : undefined;
  if (limit === undefined || limit === 0n) throw new UserFacingError(`Limit ${String(i + 1)}: amount must be a positive whole number of base units or "unlimited".`);
  const w = r.windowSeconds.trim();
  if (!DEC.test(w)) throw new UserFacingError(`Limit ${String(i + 1)}: window must be whole seconds.`);
  const windowSeconds = BigInt(w);
  if (limit !== UNLIMITED && (windowSeconds === 0n || windowSeconds > 2n ** 64n - 1n)) throw new UserFacingError(`Limit ${String(i + 1)}: a capped token needs a window of at least one second.`);
  return { token: getAddress(token), limit, windowSeconds: limit === UNLIMITED ? 0n : windowSeconds };
}

/**
 * Builds a scheme-2 meta-address and its backup record from the seller's public keys and a policy.
 * No limits means `limitsRoot = 0` (every token, no cap). With limits, a token without a row can never
 * be withdrawn (contract P1), so the form warns about that.
 *
 * @throws {UserFacingError} for invalid input (fixed messages, no echo of the input).
 */
export function createPolicyMetaAddress(input: CreatePolicyInput): PolicyRecord {
  const dest = input.destination.trim();
  if (!isAddress(dest, { strict: true })) throw new UserFacingError('The destination must be a checksummed address.');
  if (input.delaySeconds < MIN_DELAY || input.delaySeconds > MAX_DELAY) throw new UserFacingError('The delay must be between 1 hour and 30 days.');
  const limits = input.limits.filter((r) => r.token.trim() !== '' || r.limit.trim() !== '' || r.windowSeconds.trim() !== '').map(row);
  const limitsRoot = limits.length === 0 ? ZERO_HASH : buildLimitsTree(limits).root;
  const policy = validatePolicy({ destination: getAddress(dest), delaySeconds: input.delaySeconds, limitsRoot });
  const metaAddress = encodeScheme2MetaAddress({
    spendingPublicKey: parseCompressedPoint(hexToBytes(input.spendingPublicKeyHex.replace(/^0x/, ''))),
    viewingPublicKey: parseCompressedPoint(hexToBytes(input.viewingPublicKeyHex.replace(/^0x/, ''))),
    policyHash: computePolicyHash(policy),
  });
  return buildPolicyRecord({ metaAddress, policy, limits });
}
