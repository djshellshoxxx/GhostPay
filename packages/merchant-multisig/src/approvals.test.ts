import { describe, expect, it } from 'vitest';
import { MAX_APPROVALS, evaluateApprovals, signProposal, type Approval } from './approvals.js';
import { MultisigError } from './errors.js';
import { K1, K2, K3, K4, payout, policy2of3, pub, refund } from './fixtures.testutil.js';
import { policyHash } from './policy.js';

const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const POL = policy2of3();
const PROP = payout(POL);

function malleate(sigHex: string): string {
  const s = BigInt('0x' + sigHex.slice(64));
  return sigHex.slice(0, 64) + (N - s).toString(16).padStart(64, '0');
}

describe('signProposal', () => {
  it('produces a 64-byte low-s signature from the signer key', () => {
    const a = signProposal(PROP, K1);
    expect(a.signer).toBe(pub(K1));
    expect(a.signature).toMatch(/^[0-9a-f]{128}$/);
    expect(BigInt('0x' + a.signature.slice(64)) <= N / 2n).toBe(true);
    expect(signProposal(PROP, K1)).toEqual(a); // RFC 6979: deterministic
  });

  it('refuses invalid secret keys', () => {
    expect(() => signProposal(PROP, new Uint8Array(32))).toThrow(MultisigError);
    expect(() => signProposal(PROP, new Uint8Array(31).fill(1))).toThrow(MultisigError);
  });
});

describe('evaluateApprovals', () => {
  it('meets 2-of-3 with two distinct valid signers', () => {
    const r = evaluateApprovals(POL, PROP, [signProposal(PROP, K1), signProposal(PROP, K3)]);
    expect(r.thresholdMet).toBe(true);
    expect(r.approvedBy).toEqual([pub(K1), pub(K3)].sort());
    expect(r.rejected).toEqual([]);
  });

  it('does not meet threshold with one signer', () => {
    const r = evaluateApprovals(POL, PROP, [signProposal(PROP, K2)]);
    expect(r.thresholdMet).toBe(false);
    expect(r.approvedBy).toHaveLength(1);
  });

  it('counts a signer once even if they submit the same approval repeatedly', () => {
    const a = signProposal(PROP, K1);
    const r = evaluateApprovals(POL, PROP, [a, a, a]);
    expect(r.thresholdMet).toBe(false);
    expect(r.rejected).toEqual([
      { index: 1, reason: 'DUPLICATE_SIGNER' },
      { index: 2, reason: 'DUPLICATE_SIGNER' },
    ]);
  });

  it('rejects the high-s malleated twin of a valid signature', () => {
    const a = signProposal(PROP, K1);
    const twin: Approval = { signer: a.signer, signature: malleate(a.signature) };
    const r = evaluateApprovals(POL, PROP, [twin, signProposal(PROP, K2)]);
    expect(r.rejected).toEqual([{ index: 0, reason: 'BAD_SIGNATURE' }]);
    expect(r.thresholdMet).toBe(false);
  });

  it('rejects outsiders, signatures over other proposals, and impersonation', () => {
    const outsider = signProposal(PROP, K4);
    const otherProp = signProposal(payout(POL, { amount: '1' }), K2);
    const impersonate: Approval = { signer: pub(K2), signature: signProposal(PROP, K4).signature };
    const r = evaluateApprovals(POL, PROP, [outsider, otherProp, impersonate, signProposal(PROP, K1)]);
    expect(r.rejected).toEqual([
      { index: 0, reason: 'UNKNOWN_SIGNER' },
      { index: 1, reason: 'BAD_SIGNATURE' },
      { index: 2, reason: 'BAD_SIGNATURE' },
    ]);
    expect(r.thresholdMet).toBe(false);
  });

  it('a payout approval cannot be reused as a refund approval', () => {
    const p = payout(POL);
    const { kind: _k, ...rest } = p;
    void _k;
    const asRefund = refund(POL, { ...rest, invoiceId: 'inv_x' });
    const r = evaluateApprovals(POL, asRefund, [signProposal(p, K1), signProposal(p, K2)]);
    expect(r.approvedBy).toEqual([]);
  });

  it('reports malformed approvals without throwing', () => {
    const good = signProposal(PROP, K1);
    const r = evaluateApprovals(POL, PROP, [
      null as never,
      { signer: good.signer.toUpperCase(), signature: good.signature },
      { signer: good.signer, signature: good.signature + '00' },
      { signer: good.signer } as never,
      'x' as never,
      { signer: good.signer, signature: 'f'.repeat(128) },
    ]);
    expect(r.rejected.map((x) => x.reason)).toEqual([
      'MALFORMED',
      'MALFORMED',
      'MALFORMED',
      'MALFORMED',
      'MALFORMED',
      'BAD_SIGNATURE',
    ]);
  });

  it('bounds the number of approvals', () => {
    const many = Array.from({ length: MAX_APPROVALS + 1 }, () => signProposal(PROP, K1));
    expect(() => evaluateApprovals(POL, PROP, many)).toThrow(/size limit/);
    expect(() => evaluateApprovals(POL, PROP, 'x' as never)).toThrow(MultisigError);
  });

  it('enforces binding to account, chain and policy hash (cross-replay)', () => {
    const other = policy2of3({ accountId: 'other-shop' });
    const pForOther = payout(other);
    const sigs = [signProposal(pForOther, K1), signProposal(pForOther, K2)];
    expect(() => evaluateApprovals(POL, pForOther, sigs)).toThrow(/different account/);
    const pChain = payout(POL, { chainId: '1' });
    expect(() => evaluateApprovals(POL, pChain, [])).toThrow(/different account/);
    const rotated = policy2of3({ version: 1 });
    expect(policyHash(rotated)).not.toBe(policyHash(POL));
    expect(() => evaluateApprovals(rotated, PROP, [])).toThrow(MultisigError);
  });
});
