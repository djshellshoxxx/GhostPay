import { isAddress } from 'viem';
import { ReviewRefusedError, require_ } from './errors.js';
import type {
  Address,
  DirectSweepIntent,
  Intent,
  MismatchCode,
  ReasonCode,
  ReviewContext,
  ReviewPolicy,
  ReviewResult,
  UnknownIntent,
} from './types.js';

const BPS = 10_000n;

/** Fields compared with `expected`, per kind (every one has its own reason code). */
const FIELD_REASON: Readonly<Record<string, MismatchCode>> = {
  chainId: 'CHAIN_MISMATCH',
  method: 'MISMATCH_METHOD',
  router: 'MISMATCH_ROUTER',
  token: 'MISMATCH_TOKEN',
  stealth: 'MISMATCH_STEALTH',
  gross: 'MISMATCH_GROSS',
  minNet: 'MISMATCH_MIN_NET',
  fee: 'MISMATCH_FEE',
  deadline: 'MISMATCH_DEADLINE',
  metadata: 'MISMATCH_METADATA',
  ephemeralKey: 'MISMATCH_EPHEMERAL_KEY',
  spender: 'MISMATCH_SPENDER',
  amount: 'MISMATCH_AMOUNT',
  from: 'MISMATCH_FROM',
  to: 'MISMATCH_TO',
  maxFeePerGas: 'MISMATCH_MAX_FEE_PER_GAS',
  maxPriorityFeePerGas: 'MISMATCH_MAX_PRIORITY_FEE_PER_GAS',
  gasLimit: 'MISMATCH_GAS_LIMIT',
  verifyingContract: 'MISMATCH_VERIFYING_CONTRACT',
  owner: 'MISMATCH_OWNER',
  destination: 'MISMATCH_DESTINATION',
  feeTo: 'MISMATCH_FEE_TO',
  value: 'MISMATCH_VALUE',
  nonce: 'MISMATCH_NONCE',
};

const KIND_FIELDS: Readonly<Record<Intent['kind'], readonly string[]>> = {
  router_payment: ['chainId', 'method', 'router', 'token', 'stealth', 'gross', 'minNet', 'fee', 'deadline', 'metadata', 'ephemeralKey'],
  erc20_approve: ['chainId', 'token', 'spender', 'amount'],
  direct_sweep: ['chainId', 'from', 'token', 'to', 'amount', 'maxFeePerGas', 'maxPriorityFeePerGas', 'gasLimit'],
  relayed_sweep_sig: ['chainId', 'verifyingContract', 'owner', 'token', 'destination', 'amount', 'fee', 'feeTo', 'deadline', 'nonce'],
  permit_sig: ['chainId', 'token', 'owner', 'spender', 'value', 'nonce', 'deadline'],
};

function same(a: unknown, b: unknown): boolean {
  return typeof a === 'string' && typeof b === 'string' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

const eq = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

function validatePolicy(p: ReviewPolicy): void {
  const addrOk = (a: string): boolean => typeof a === 'string' && isAddress(a, { strict: false });
  const c = p.contracts;
  require_(addrOk(c.router) && addrOk(c.sweepRelayer) && addrOk(c.announcer) && addrOk(p.feeRecipient), 'INVALID_POLICY', 'contract addresses');
  require_(typeof p.feeCaps.maxFeePerGasWei === 'bigint' && p.feeCaps.maxFeePerGasWei > 0n, 'INVALID_POLICY', 'maxFeePerGasWei');
  require_(typeof p.feeCaps.maxGasLimit === 'bigint' && p.feeCaps.maxGasLimit > 0n, 'INVALID_POLICY', 'maxGasLimit');
  require_(Number.isInteger(p.feeCaps.maxFeeShareBps) && p.feeCaps.maxFeeShareBps >= 0 && p.feeCaps.maxFeeShareBps <= 10_000, 'INVALID_POLICY', 'maxFeeShareBps');
  require_(Number.isInteger(p.maxDeadlineSeconds) && p.maxDeadlineSeconds > 0, 'INVALID_POLICY', 'maxDeadlineSeconds');
}

function tokenListed(policy: ReviewPolicy, chainId: number, token: string): boolean {
  const set = policy.tokens.get(chainId);
  if (set === undefined) return false;
  for (const t of set) if (eq(t, token)) return true;
  return false;
}

function deadlineReasons(deadline: bigint, now: number, policy: ReviewPolicy, out: ReasonCode[]): void {
  if (deadline <= BigInt(now)) out.push('DEADLINE_EXPIRED');
  else if (deadline > BigInt(now) + BigInt(policy.maxDeadlineSeconds)) out.push('DEADLINE_BEYOND_POLICY');
}

function shareExceeded(fee: bigint, base: bigint, policy: ReviewPolicy): boolean {
  return fee * BPS > base * BigInt(policy.feeCaps.maxFeeShareBps);
}

function policyReasons(i: Intent, policy: ReviewPolicy, now: number, ctx: ReviewContext): ReasonCode[] {
  const out: ReasonCode[] = [];
  const { router, sweepRelayer, announcer } = policy.contracts;
  const listed = (token: Address | 'native'): boolean => token === 'native' || tokenListed(policy, i.chainId, token);
  switch (i.kind) {
    case 'router_payment':
      if (!eq(i.router, router)) out.push('UNKNOWN_TO');
      if (!listed(i.token)) out.push('TOKEN_NOT_ALLOWLISTED');
      deadlineReasons(i.deadline, now, policy, out);
      if (shareExceeded(i.fee, i.gross, policy)) out.push('FEE_SHARE_ABOVE_CAP');
      break;
    case 'erc20_approve':
      if (!listed(i.token)) out.push('TOKEN_NOT_ALLOWLISTED');
      if (!eq(i.spender, router)) out.push('SPENDER_NOT_ROUTER');
      if (ctx.paymentGross === undefined) out.push('APPROVE_WITHOUT_PAYMENT');
      else if (i.amount > ctx.paymentGross) out.push('APPROVE_EXCEEDS_GROSS');
      break;
    case 'direct_sweep':
      directSweepReasons(i, policy, listed(i.token), out);
      if ([router, sweepRelayer, announcer].some((c) => eq(c, i.to))) out.push('DESTINATION_IS_PROTOCOL_CONTRACT');
      break;
    case 'relayed_sweep_sig':
      if (!eq(i.verifyingContract, sweepRelayer)) out.push('UNKNOWN_TO');
      if (!listed(i.token)) out.push('TOKEN_NOT_ALLOWLISTED');
      if (!eq(i.feeTo, policy.feeRecipient)) out.push('FEE_RECIPIENT_MISMATCH');
      deadlineReasons(i.deadline, now, policy, out);
      if (shareExceeded(i.fee, i.amount, policy)) out.push('FEE_SHARE_ABOVE_CAP');
      break;
    case 'permit_sig':
      if (!listed(i.token)) out.push('TOKEN_NOT_ALLOWLISTED');
      if (!eq(i.spender, router) && !eq(i.spender, sweepRelayer)) out.push('SPENDER_NOT_MANIFEST');
      deadlineReasons(i.deadline, now, policy, out);
      break;
  }
  return out;
}

function directSweepReasons(i: DirectSweepIntent, policy: ReviewPolicy, tokenOk: boolean, out: ReasonCode[]): void {
  if (!tokenOk) out.push('TOKEN_NOT_ALLOWLISTED');
  if (i.maxFeePerGas > policy.feeCaps.maxFeePerGasWei) out.push('FEE_PER_GAS_ABOVE_CAP');
  if (i.gasLimit > policy.feeCaps.maxGasLimit) out.push('GAS_LIMIT_ABOVE_CAP');
  if (i.token === 'native' && shareExceeded(i.maxFeePerGas * i.gasLimit, i.amount, policy)) out.push('FEE_SHARE_ABOVE_CAP');
}

/**
 * Compares a decoded intent with the intent the user reviewed and with the allowlist policy.
 *
 * @remarks Policy rules look only at the decoded `intent` (what will be signed); `expected` is used
 * only for the field-by-field comparison, so each rule and each field yields exactly its own reason
 * code. Reasons are de-duplicated, in a stable order. An `unknown` intent is always refused with
 * its decode reason. When the kinds differ only `MISMATCH_KIND` (plus policy reasons) is reported.
 * Rules: unknown `to`, token not allowlisted (native is judged by calldata shape only), spender not
 * the manifest router, approve above the payment gross (S3-19), `maxFeePerGas`/gas limit above cap,
 * fee share above cap, deadline expired or beyond policy, relayer `feeTo` not the policy recipient,
 * chain mismatch, any differing field.
 *
 * @security Fail-closed: `ok: true` is returned only when no reason applies. `now` must come from a
 * trustworthy clock (unix seconds). A compromised caller that supplies both `intent` and `expected`
 * from the same tampered source defeats the comparison (spec D7); the policy still applies.
 * @param intent Output of `decodeTx` / `decodeTypedData` for the bytes about to be signed.
 * @param expected Intent the user reviewed (built independently of the signed bytes).
 * @param policy Allowlists and caps from the authenticated manifest.
 * @param now Current unix time in seconds.
 * @param ctx Optional flow facts (the payment gross for approvals).
 * @returns `{ ok: true }` or the list of reasons.
 * @throws {TxReviewError} `INVALID_POLICY` or `INVALID_INPUT` for a malformed policy or clock.
 */
export function review(
  intent: Intent | UnknownIntent,
  expected: Intent,
  policy: ReviewPolicy,
  now: number,
  ctx: ReviewContext = {},
): ReviewResult {
  validatePolicy(policy);
  require_(Number.isSafeInteger(now) && now >= 0, 'INVALID_INPUT', 'now');
  if (intent.kind === 'unknown') return { ok: false, reasons: [intent.reason] };
  const reasons = new Set<ReasonCode>(policyReasons(intent, policy, now, ctx));
  if (intent.kind !== expected.kind) {
    reasons.add('MISMATCH_KIND');
  } else {
    const a = intent as unknown as Record<string, unknown>;
    const e = expected as unknown as Record<string, unknown>;
    for (const f of KIND_FIELDS[intent.kind]) {
      if (!same(a[f], e[f])) reasons.add(FIELD_REASON[f] as MismatchCode);
    }
  }
  return reasons.size === 0 ? { ok: true } : { ok: false, reasons: [...reasons] };
}

/**
 * Like {@link review} but throws when the verdict is not ok.
 *
 * @security Call this immediately before every signature or wallet prompt; do not catch and continue.
 * @param intent See {@link review}.
 * @param expected See {@link review}.
 * @param policy See {@link review}.
 * @param now See {@link review}.
 * @param ctx See {@link review}.
 * @throws {ReviewRefusedError} With every reason when the review fails.
 * @throws {TxReviewError} `INVALID_POLICY` or `INVALID_INPUT`.
 */
export function assertReviewed(
  intent: Intent | UnknownIntent,
  expected: Intent,
  policy: ReviewPolicy,
  now: number,
  ctx: ReviewContext = {},
): void {
  const r = review(intent, expected, policy, now, ctx);
  if (!r.ok) throw new ReviewRefusedError(r.reasons);
}
