import { evaluateApprovals, MAX_CLOCK_SKEW_SECONDS, MAX_TIMESTAMP, parseAccountState, parseProposalExchange } from '@ghostpay/merchant-multisig';
import { noPositionals, requireValue, type Parsed } from '../args.js';
import { OUT_OPTS, type Ctx } from '../ctx.js';
import { CliError, failError } from '../io.js';
import type { Command } from './types.js';

async function inspect(ctx: Ctx, a: Parsed): Promise<number> {
  noPositionals(a);
  const stateText = await ctx.read(requireValue(a, 'state'));
  const requestText = await ctx.read(requireValue(a, 'in'));
  const now = ctx.io.nowSeconds();
  if (!Number.isSafeInteger(now) || now < 0 || now > MAX_TIMESTAMP) throw failError('CLOCK_INVALID', 'current time is outside the supported range.');
  let state; let request;
  try {
    state = parseAccountState(stateText); request = parseProposalExchange(requestText, state.policy);
  } catch { throw failError('REFUND_REQUEST_INVALID', 'refund request, approval signatures or supplied account state are invalid.'); }
  const p = request.proposal;
  if (p.kind !== 'refund') throw failError('NOT_REFUND', 'the supplied proposal is not a refund request.');
  const approvals = evaluateApprovals(state.policy, p, request.approvals);
  const queued = state.queued.find(q => q.digest === approvals.digest);
  const expired = now >= p.expiresAt;
  const status = expired ? 'expired' : p.createdAt > now + MAX_CLOCK_SKEW_SECONDS ? 'future-request'
    : !approvals.thresholdMet ? 'awaiting-approvals'
      : queued !== undefined ? now < queued.executableAt ? 'timelocked' : 'off-chain-ready'
        : p.nonce !== state.nextNonce ? 'nonce-consumed'
          : now + state.policy.timelocks.refund >= p.expiresAt ? 'expires-before-timelock' : 'ready-for-off-chain-recording';
  const report = { ok: true, schemaVersion: 1, kind: 'refund', status, expired, proposalDigest: approvals.digest,
    amount: p.amount, chainId: p.chainId, approvalCount: approvals.approvedBy.length, requiredApprovals: approvals.threshold,
    offChainQuorum: approvals.thresholdMet, authorityVerified: false, stateFreshnessVerified: false,
    paymentVerified: false, executed: false, ...(queued === undefined ? {} : { executableAt: queued.executableAt }) };
  const wrote = await ctx.writeOut(a, JSON.stringify(report, null, 2) + '\n');
  ctx.out({ ...report, ...(wrote ? { out: a.values.get('out') } : {}) },
    `Refund request: ${status}. ${approvals.approvedBy.length}/${approvals.threshold} approvals under the supplied off-chain policy.\nThe original payment, refund authority and account-state freshness are not independently established. No funds were moved.`);
  return 0;
}

export const refundCommands: readonly Command[] = [
  ...(['inspect', 'status'] as const).map((action): Command => ({
    path: ['merchant', 'refunds', action], summary: 'inspect off-chain refund approvals without executing a transfer',
    usage: `ghostpay merchant refunds ${action} --in PROPOSAL --state ACCOUNT [--out REPORT]\n  Example: ghostpay merchant refunds ${action} --in refund.json --state account.json --json\n  Uses canonical merchant-multisig exchange files. Signatures are checked against the supplied policy; neither that policy nor an imported account snapshot establishes on-chain authority.`,
    opts: { in: 'value', state: 'value', ...OUT_OPTS }, handler: inspect,
  })),
  { path: ['merchant', 'refunds', 'execute'], summary: 'explain the unavailable real-refund authority boundary',
    usage: 'ghostpay merchant refunds execute\n  Always exits 5. Real refund execution requires accepted original-payment verification and refund-authority interfaces; the fixture workflow cannot move real funds.',
    opts: {}, handler: (_ctx, a) => { noPositionals(a); return Promise.reject(new CliError('unsupported', 'REFUND_EXECUTION_UNSUPPORTED', 'real refund execution is unavailable until original-payment and refund-authority interfaces are accepted.')); } },
];
