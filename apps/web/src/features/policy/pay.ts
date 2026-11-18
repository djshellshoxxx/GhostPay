import type { RandomSource } from '@ghostpay/core-crypto';
import { erc20Abi } from '@ghostpay/chain-adapters';
import {
  buildPolicyPaymentTx,
  decodePolicyPaymentCalldata,
  decodeScheme2MetaAddress,
  deriveScheme2Payment,
  policyCoversToken,
  type Address,
  type PolicyPayment,
  type PolicyRecord,
  type Scheme2Payment,
} from '@ghostpay/policy-scheme';
import { encodeFunctionData, getAddress, isAddress } from 'viem/utils';
import { UserFacingError } from '../../lib/errors';
import type { TxRequest } from '../../lib/wallet';
import type { PolicyChainDeployment } from './chain';

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
  /** Verified policy records loaded in this tab (created or imported); see {@link assertPayeeTokenCoverage}. */
  readonly knownRecords?: readonly PolicyRecord[];
}

/**
 * What the payer can know about whether the payee's policy can withdraw the asset (SEC-11): `'covered'` when a
 * verified record of the meta-address's policy is loaded and has a limit for the asset (or no limits at all);
 * `'unknown'` when no such record is loaded.
 */
export type PayeeTokenCoverage = 'covered' | 'unknown';

export interface PreparedPolicyPayment {
  readonly payment: Scheme2Payment;
  readonly built: PolicyPayment;
  /** ERC-20 only: `approve(router, gross)` that must be mined first. */
  readonly approval?: TxRequest;
  readonly token: Address | 'native';
  /** Payee meta-address as entered (trimmed); part of the duplicate-attempt scope, which must survive re-review. */
  readonly metaAddress: string;
  /** Whether a loaded policy record shows the payee can withdraw `token`; `'unknown'` means the payer cannot check. */
  readonly tokenCoverage: PayeeTokenCoverage;
}

/**
 * SEC-11 payer gate. With a non-zero limits root, the policy account can never withdraw an asset that has no limits
 * leaf, while the router accepts any token or native payment. A scheme-2 meta-address carries only the spending key,
 * viewing key and policy hash, so a payer who holds just the meta-address cannot know the leaves: that case is
 * `'unknown'` and the review states the risk. When a verified record of the same policy hash is loaded in this tab
 * (`parsePolicyRecord`/`buildPolicyRecord` checked it against the hash), the answer is known and an asset the policy
 * cannot withdraw is refused before any wallet request.
 *
 * @throws {UserFacingError} `policy.pay.tokenNotWithdrawable` when the loaded record has limits and none for `token`.
 */
export function assertPayeeTokenCoverage(metaAddress: string, token: Address | 'native', records: readonly PolicyRecord[]): PayeeTokenCoverage {
  const { policyHash } = decodeScheme2MetaAddress(metaAddress.trim());
  const record = records.find((r) => r.policyHash === policyHash);
  if (record === undefined) return 'unknown';
  if (!policyCoversToken(record, token)) throw new UserFacingError({ key: 'policy.pay.tokenNotWithdrawable' });
  return 'covered';
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
  if (decoded.stealth !== payment.accountAddress || decoded.owner !== payment.ownerAddress || decoded.policyHash !== payment.policyHash || built.tx.to !== input.deployment.router) {
    throw new UserFacingError('The prepared payment failed its self-check. Nothing was sent.');
  }
  const approval = token === 'native' ? undefined : { to: token, value: 0n, data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [input.deployment.router, input.gross] }) };
  return Object.freeze({ payment, built, token, metaAddress: input.metaAddress.trim(), tokenCoverage, ...(approval === undefined ? {} : { approval }) });
}

// i18n-use: policy.pay.tokenNotWithdrawable
