import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex, concatBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { describe, expect, it } from 'vitest';
import { MultisigError } from './errors.js';
import { DAY, T0, cancel, config, payout, policy2of3, refund } from './fixtures.testutil.js';
import {
  MAX_PROPOSAL_LIFETIME_SECONDS,
  canonicalProposalBytes,
  proposalDigestHex,
  validateProposal,
  type Proposal,
} from './proposal.js';

const POL = policy2of3();

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    if (e instanceof MultisigError) return `${e.code}:${e.path ?? ''}`;
    throw e;
  }
  return undefined;
}

describe('validateProposal', () => {
  it('accepts every kind and freezes the result', () => {
    for (const p of [payout(POL), refund(POL), config(POL), cancel(POL, 'ab'.repeat(32))] as Proposal[]) {
      const v = validateProposal(p);
      expect(Object.isFrozen(v)).toBe(true);
      expect(v.kind).toBe(p.kind);
    }
  });

  it('rejects non-canonical, fractional, zero, negative and oversize amounts', () => {
    for (const amount of [
      '0',
      '01',
      '1.5',
      '-1',
      '1e6',
      ' 1',
      '',
      'NaN',
      (1n << 256n).toString(),
      1 as never,
    ]) {
      expect(code(() => validateProposal(payout(POL, { amount })))).toBe('PROPOSAL:amount');
    }
    expect(validateProposal(payout(POL, { amount: ((1n << 256n) - 1n).toString() })).kind).toBe('payout');
  });

  it('rejects bad lifetimes', () => {
    expect(code(() => validateProposal(payout(POL, { expiresAt: T0 })))).toBe('PROPOSAL:expiresAt');
    expect(code(() => validateProposal(payout(POL, { expiresAt: T0 - 1 })))).toBe('PROPOSAL:expiresAt');
    expect(
      code(() => validateProposal(payout(POL, { expiresAt: T0 + MAX_PROPOSAL_LIFETIME_SECONDS + 1 }))),
    ).toBe('PROPOSAL:expiresAt');
    expect(code(() => validateProposal(payout(POL, { createdAt: -5 })))).toBe('PROPOSAL:createdAt');
    expect(code(() => validateProposal(payout(POL, { createdAt: 1.5 })))).toBe('PROPOSAL:createdAt');
  });

  it('rejects unknown kinds, extra keys, cross-kind fields and bad formats', () => {
    expect(code(() => validateProposal({ ...payout(POL), kind: 'drain' }))).toBe('PROPOSAL:kind');
    expect(code(() => validateProposal({ ...payout(POL), invoiceId: 'x' }))).toBe('PROPOSAL:');
    expect(code(() => validateProposal({ ...payout(POL), extra: true }))).toBe('PROPOSAL:');
    expect(code(() => validateProposal(payout(POL, { to: 'bad address' })))).toBe('PROPOSAL:to');
    expect(code(() => validateProposal(payout(POL, { asset: '../etc' })))).toBe('PROPOSAL:asset');
    expect(code(() => validateProposal(payout(POL, { nonce: '-1' })))).toBe('PROPOSAL:nonce');
    expect(code(() => validateProposal(payout(POL, { policyHash: 'AB'.repeat(32) })))).toBe(
      'PROPOSAL:policyHash',
    );
    expect(code(() => validateProposal(refund(POL, { invoiceId: 'a b' })))).toBe('PROPOSAL:invoiceId');
    expect(code(() => validateProposal(cancel(POL, 'zz')))).toBe('PROPOSAL:targetDigest');
    expect(code(() => validateProposal(payout(POL, { accountId: 'UP' })))).toBe('PROPOSAL:accountId');
    expect(code(() => validateProposal(payout(POL, { chainId: '0' })))).toBe('PROPOSAL:chainId');
    expect(code(() => validateProposal('payout'))).toBe('PROPOSAL:');
  });

  it('validates the new policy of a config proposal', () => {
    const bad = config(POL);
    const np = { ...bad.newPolicy, threshold: 4 };
    expect(code(() => validateProposal({ ...bad, newPolicy: np }))).toBe('POLICY:newPolicy.threshold');
  });
});

describe('proposalDigest', () => {
  it('is deterministic and pinned (test vector)', () => {
    const d = proposalDigestHex(payout(POL));
    expect(d).toBe(proposalDigestHex(payout(POL)));
    expect(d).toMatch(/^[0-9a-f]{64}$/);
    expect(d).toBe('65b56119d77639946d108ea628767e46cbaedd46c8435a68f55c307073dfd646');
  });

  it('changes when any signed field changes', () => {
    const base = proposalDigestHex(payout(POL));
    const variants: Proposal[] = [
      payout(POL, { accountId: 'other' }),
      payout(POL, { chainId: '1' }),
      payout(POL, { policyHash: '00'.repeat(32) }),
      payout(POL, { nonce: '1' }),
      payout(POL, { createdAt: T0 + 1 }),
      payout(POL, { expiresAt: T0 + DAY }),
      payout(POL, { asset: 'eip155:8453/slip44:60' }),
      payout(POL, { to: '0x1111111111111111111111111111111111111112' }),
      payout(POL, { amount: '250000001' }),
      { ...refund(POL), to: payout(POL).to, amount: payout(POL).amount, asset: payout(POL).asset },
    ];
    const set = new Set(variants.map((v) => proposalDigestHex(v)));
    expect(set.size).toBe(variants.length);
    expect(set.has(base)).toBe(false);
  });

  it('is injective across field boundaries (TLV, no concatenation ambiguity)', () => {
    const a = proposalDigestHex(payout(POL, { asset: 'ab', to: 'c' }));
    const b = proposalDigestHex(payout(POL, { asset: 'a', to: 'bc' }));
    expect(a).not.toBe(b);
  });

  it('is domain separated from the invoice signing domain', () => {
    const bytes = canonicalProposalBytes(payout(POL));
    const asInvoice = bytesToHex(keccak_256(concatBytes(utf8ToBytes('GhostPay.Invoice.v1\0'), bytes)));
    expect(asInvoice).not.toBe(proposalDigestHex(payout(POL)));
  });

  it('binds config bodies and cancel targets', () => {
    const c1 = config(POL);
    const c2 = config(POL, { newPolicy: { ...c1.newPolicy, threshold: 3 } });
    expect(proposalDigestHex(c1)).not.toBe(proposalDigestHex(c2));
    expect(proposalDigestHex(cancel(POL, 'ab'.repeat(32)))).not.toBe(
      proposalDigestHex(cancel(POL, 'ac'.repeat(32))),
    );
  });
});
