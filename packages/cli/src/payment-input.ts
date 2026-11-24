import {
  CANONICAL_ANNOUNCER, MAX_PLAUSIBLE_HEAD, findChain, parseQuantity, validateAnnouncementLog,
  type Address, type ChainConfig, type ClaimedPayment, type RpcLog,
} from '@ghostpay/chain-adapters';
import { parseMetadata } from '@ghostpay/core-crypto';
import { parseStrictJson } from '@ghostpay/invoice-schema';
import { CliError, failError } from './io.js';

export interface ExpectedPayment {
  readonly recipient: Address;
  readonly asset: Address | 'native';
  readonly amount: bigint;
}

export interface PaymentObservation {
  readonly chain: ChainConfig;
  readonly claim: ClaimedPayment;
  readonly expected?: ExpectedPayment;
}

export function record(value: unknown, allowed: readonly string[], required = allowed): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value) ||
      Object.keys(value).some((key) => !allowed.includes(key)) || required.some((key) => !Object.hasOwn(value, key)))
    throw failError('INVALID_INPUT', 'input has missing, unknown or ambiguous fields.');
  return value as Record<string, unknown>;
}

export function publicAddress(value: unknown): Address {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value))
    throw failError('INVALID_INPUT', 'expected a 20-byte EVM address.');
  return value.toLowerCase() as Address;
}

export function decimal(value: unknown, maximum = (1n << 256n) - 1n): bigint {
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]{0,77})$/.test(value) || BigInt(value) > maximum)
    throw failError('INVALID_INPUT', 'expected a canonical bounded decimal integer string.');
  return BigInt(value);
}

export function expectedPayment(value: unknown): ExpectedPayment {
  const r = record(value, ['recipient', 'asset', 'amount']);
  const amount = decimal(r['amount']);
  if (amount === 0n) throw failError('INVALID_INPUT', 'expected payment amount must be positive.');
  return { recipient: publicAddress(r['recipient']), asset: r['asset'] === 'native' ? 'native' : publicAddress(r['asset']), amount };
}

/** An observation is untrusted public event data, never a stored verification assertion. */
export function parsePaymentObservation(text: string, router?: Address): PaymentObservation {
  const r = record(parseStrictJson(text), ['version', 'family', 'chainId', 'log', 'expected'], ['version', 'family', 'chainId', 'log']);
  if (r['version'] !== 1) throw new CliError('unsupported', 'UNSUPPORTED_VERSION', 'unsupported payment observation version.');
  if (r['family'] !== 'evm') throw new CliError('unsupported', 'UNSUPPORTED_OPERATION', 'live payment verification currently supports EVM scheme 1 only.');
  if (typeof r['chainId'] !== 'number' || !Number.isSafeInteger(r['chainId'])) throw failError('INVALID_INPUT', 'invalid observation chain.');
  const chain = findChain(r['chainId']);
  if (chain === undefined) throw new CliError('unsupported', 'UNSUPPORTED_CHAIN', 'unknown observation chain.');
  const log = record(r['log'], ['address', 'topics', 'data', 'blockNumber', 'blockHash', 'transactionHash', 'logIndex', 'removed'],
    ['address', 'topics', 'data', 'blockNumber', 'blockHash', 'transactionHash', 'logIndex']);
  if (log['removed'] !== undefined && typeof log['removed'] !== 'boolean') throw failError('INVALID_INPUT', 'removed must be a boolean when supplied.');
  const block = parseQuantity(log['blockNumber']);
  if (block > MAX_PLAUSIBLE_HEAD || typeof log['transactionHash'] !== 'string' || !/^0x[0-9a-f]{64}$/.test(log['transactionHash']))
    throw failError('INVALID_INPUT', 'invalid observation position.');
  const announcement = validateAnnouncementLog(log as unknown as RpcLog, CANONICAL_ANNOUNCER, 1n, block, block);
  if (announcement === undefined) throw failError('INVALID_LOG', 'announcement content is malformed or unsupported.');
  let metadata: ClaimedPayment['metadata'];
  try { metadata = parseMetadata(announcement.metadata); } catch { metadata = undefined; }
  return {
    chain,
    claim: {
      stealthAddress: announcement.stealthAddress, announcement, metadata,
      viaRouter: router !== undefined && announcement.caller.toLowerCase() === router.toLowerCase(),
    },
    ...(r['expected'] === undefined ? {} : { expected: expectedPayment(r['expected']) }),
  };
}

export function assertExpectedPayment(observation: PaymentObservation): ExpectedPayment {
  const expected = observation.expected;
  if (expected === undefined) throw failError('EXPECTED_PAYMENT_REQUIRED', 'verification requires expected recipient, asset and amount from the original payment request.');
  const metadata = observation.claim.metadata;
  const asset = metadata?.kind === 'native' ? 'native' : metadata?.token.toLowerCase();
  if (expected.recipient !== observation.claim.stealthAddress.toLowerCase())
    throw failError('RECIPIENT_MISMATCH', 'announcement recipient differs from the expected recipient.');
  if (asset !== expected.asset) throw failError('ASSET_MISMATCH', 'announcement asset differs from the expected asset.');
  if (metadata?.netAmount !== expected.amount) throw failError('AMOUNT_MISMATCH', 'announcement amount differs from the expected amount.');
  return expected;
}
