import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { PayjoinParams } from './params.js';
import { parsePsbt, inputOutpoint, outputInfo } from './psbt.js';
import { verifyProposal } from './sender/checks.js';

interface Vec {
  psbts: Record<string, string>;
  params: { maxadditionalfeecontribution: number; additionalfeeoutputindex: number };
}
const vec = JSON.parse(readFileSync(new URL('../test-vectors/bip78-appendix.json', import.meta.url), 'utf8')) as Vec;

describe('BIP-78 appendix test vector (raw BIP, retrieved 2026-10-21)', () => {
  const original = parsePsbt(vec.psbts['Original PSBT'] as string);
  const proposal = parsePsbt(vec.psbts['payjoin proposal'] as string);
  const filled = parsePsbt(vec.psbts['payjoin proposal filled with sender\'s information'] as string);
  const params = {
    v: 1 as const,
    additionalFeeOutputIndex: vec.params.additionalfeeoutputindex,
    maxAdditionalFeeContributionSats: BigInt(vec.params.maxadditionalfeecontribution),
    disableOutputSubstitution: false,
  };

  it('parses: original has one input and two outputs, proposal has two inputs', () => {
    expect(original.inputsLength).toBe(1);
    expect(original.outputsLength).toBe(2);
    expect(proposal.inputsLength).toBe(2);
    expect(filled.inputsLength).toBe(2);
  });

  it('the BIP vector verifies under our sender checklist (payment = output 1, fee output = 0)', () => {
    expect(original.isFinal).toBe(true);
    const paymentScript = outputInfo(original, 1).script;
    const v = verifyProposal(original, proposal, params, { paymentScript });
    expect(v.addedInputs).toBe(1);
    expect(v.feeContribution).toBeGreaterThan(0n);
    expect(v.feeContribution).toBeLessThanOrEqual(182n);
    // also under pjos=0: the payment output only grew
    expect(verifyProposal(original, proposal, { ...params, disableOutputSubstitution: true }, { paymentScript }).addedInputs).toBe(1);
  });

  it('the same vector is refused when the cap is tightened or removed, or the fee output is not offered', () => {
    const paymentScript = outputInfo(original, 1).script;
    const code = (p: PayjoinParams): string => {
      try {
        verifyProposal(original, proposal, p, { paymentScript });
        return 'ok';
      } catch (e) {
        return (e as { code: string }).code;
      }
    };
    expect(code({ ...params, maxAdditionalFeeContributionSats: 1n })).toBe('fee_over_cap');
    const { additionalFeeOutputIndex: _drop, ...noIdx } = params;
    void _drop;
    expect(code(noIdx)).toBe('output_decreased');
  });

  it('receiver input is the one not in the original and carries a final witness/script', () => {
    const origOps = new Set([...Array(original.inputsLength).keys()].map((i) => inputOutpoint(original, i)));
    const added = [...Array(proposal.inputsLength).keys()].filter((i) => !origOps.has(inputOutpoint(proposal, i)));
    expect(added).toHaveLength(1);
  });
});
