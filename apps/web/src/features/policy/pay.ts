import type { RandomSource } from '@ghostpay/core-crypto';
import { erc20Abi } from '@ghostpay/chain-adapters';
import {
  buildPolicyPaymentTx,
  decodePolicyPaymentCalldata,
  decodeScheme2MetaAddress,
  deriveScheme2Payment,
  policyCoversToken,
  type Address,
  type DecodedPolicyPayment,
  type PolicyPayment,
  type PolicyRecord,
  type Scheme2Payment,
} from '@ghostpay/policy-scheme';
import { bytesToHex, encodeFunctionData, getAddress, isAddress } from 'viem/utils';
import { UserFacingError } from '../../lib/errors';
import type { TxRequest } from '../../lib/wallet';
import type { PolicyChainDeployment } from './chain';
import { selectPolicyRecordForSeller } from './recordIdentity';

export interface PolicyPayInput {
  readonly metaAddress: string;
  readonly deployment: PolicyChainDeployment;
  /** `'native'` or a checksummed ERC-20 address. */
  readonly token: string;
  readonly gross: bigint;
  readonly nowSec: bigint;
  /** Seconds the payment stays valid (default 20 minutes). */
  readonly validForSec?: bigint;
  readonly rng?: RandomSource;
  /** Validated policy records created or imported in this tab. */
  readonly knownRecords?: readonly PolicyRecord[];
}

/** A local record proves asset coverage; the meta-address alone cannot reveal the limits. */
export type PayeeTokenCoverage = 'covered' | 'unknown';

export interface PreparedPolicyPayment {
  readonly payment: Scheme2Payment;
  readonly built: PolicyPayment;
  /** ERC-20 only: `approve(router, gross)` that must be mined first. */
  readonly approval?: TxRequest;
  readonly token: Address | 'native';
  /** Payee meta-address as entered (trimmed); part of the duplicate-attempt scope, which must survive re-review. */
  readonly metaAddress: string;
  /** Coverage of the asset by the payee's loaded policy record, not a guarantee of recovery. */
  readonly tokenCoverage: PayeeTokenCoverage;
}

/**
 * Refuse an asset absent from a known payee's immutable withdrawal limits (SEC-11).
 * Only records validated by buildPolicyRecord/parsePolicyRecord belong in this list. A matching
 * policy commitment proves the same immutable limits even for a different seller, so a known
 * unsupported asset is always refused. Positive confirmation still requires both payee keys;
 * a shared policy hash never proves seller identity or authorizes recovery with another record.
 * Missing policy terms remain unknown: the meta-address alone does not disclose any asset leaves.
 * Recheck immediately before each wallet request because records can arrive after review.
 */
export function assertPayeeTokenCoverage(metaAddress: string, token: Address | 'native', records: readonly PolicyRecord[]): PayeeTokenCoverage {
  const meta = decodeScheme2MetaAddress(metaAddress.trim());
  const record = selectPolicyRecordForSeller(records, meta.policyHash, bytesToHex(meta.spendingPublicKey), bytesToHex(meta.viewingPublicKey));
  const terms = record ?? records.find((candidate) => candidate.policyHash === meta.policyHash);
  if (terms === undefined) return 'unknown';
  if (!policyCoversToken(terms, token)) throw new UserFacingError({ key: record === undefined ? 'policy.pay.committedAssetNotWithdrawable' : 'policy.pay.tokenNotWithdrawable' });
  return record === undefined ? 'unknown' : 'covered';
}

/** Check the decoded call against every announcement field of the locally derived payment. */
export function paysDerivedPayment(decoded: DecodedPolicyPayment, payment: Scheme2Payment, built: PolicyPayment): boolean {
  const metadata = decoded.metadata.toLowerCase();
  return decoded.method === built.method
    && decoded.stealth === payment.accountAddress
    && decoded.owner === payment.ownerAddress
    && decoded.policyHash === payment.policyHash
    && decoded.ephemeralPublicKey.toLowerCase() === bytesToHex(payment.ephemeralPublicKey).toLowerCase()
    && metadata === built.metadata.toLowerCase()
    && metadata.startsWith(bytesToHex(payment.metadataPrefix).toLowerCase());
}

/**
 * Derives a fresh policy account for the payee and builds the router call. The calldata is decoded
 * again and checked against the derived account and policy before it is returned, so a wallet prompt
 * never shows a call the client did not intend.
 *
 * @throws {UserFacingError} for input errors; policy-scheme errors pass through for `userMessage`.
 */
export function preparePolicyPayment(input: PolicyPayInput): PreparedPolicyPayment {
  try {
    decodeScheme2MetaAddress(input.metaAddress.trim());
  } catch {
    throw new UserFacingError('This is not a policy meta-address (it must start with st:eth:gp2:0x).');
  }
  const t = input.token.trim();
  const token: Address | 'native' = t.toLowerCase() === 'native' ? 'native' : isAddress(t, { strict: true }) ? getAddress(t) : (() => { throw new UserFacingError('The token must be "native" or a checksummed address.'); })();
  if (input.gross <= 0n) throw new UserFacingError('Enter an amount above zero.');
  const tokenCoverage = assertPayeeTokenCoverage(input.metaAddress, token, input.knownRecords ?? []);
  const payment = deriveScheme2Payment(input.metaAddress.trim(), input.deployment, input.rng);
  const built = buildPolicyPaymentTx({
    router: input.deployment.router,
    feeRecipient: input.deployment.feeRecipient,
    deployment: input.deployment,
    payment,
    token,
    gross: input.gross,
    deadline: input.nowSec + (input.validForSec ?? 1200n),
    now: input.nowSec,
  });
  const decoded = decodePolicyPaymentCalldata(built.tx.data, input.deployment);
  if (!paysDerivedPayment(decoded, payment, built) || built.tx.to !== input.deployment.router) {
    throw new UserFacingError('The prepared payment failed its self-check. Nothing was sent.');
  }
  const approval = token === 'native' ? undefined : { to: token, value: 0n, data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [input.deployment.router, input.gross] }) };
  return Object.freeze({ payment, built, token, tokenCoverage, metaAddress: input.metaAddress.trim(), ...(approval === undefined ? {} : { approval }) });
}

// i18n-use: policy.pay.tokenNotWithdrawable policy.pay.committedAssetNotWithdrawable
