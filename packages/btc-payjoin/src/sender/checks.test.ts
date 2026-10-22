import { hex } from '@scure/base';
import { describe, expect, it } from 'vitest';
import type { PayjoinErrorCode } from '../errors.js';
import { rebuild, scenario, type ScenarioOpts } from '../fixtures.testutil.js';
import { checkFinalFeeRate, verifyProposal } from './checks.js';
import { inputOutpoint } from '../psbt.js';
import type * as btc from '@scure/btc-signer';

type S = Awaited<ReturnType<typeof scenario>>;
const run = (s: S, p: btc.Transaction, params = s.params) => verifyProposal(s.built.tx, p, params, { paymentScript: s.paymentScript });
const code = (f: () => unknown): PayjoinErrorCode | 'none' => {
  try {
    f();
    return 'none';
  } catch (e) {
    return (e as { code: PayjoinErrorCode }).code;
  }
};
const FEE: ScenarioOpts = { params: { maxAdditionalFeeContributionSats: 1000n } };

describe('verifyProposal: positive', () => {
  it('accepts an honest proposal and reports the added input', async () => {
    const s = await scenario(FEE);
    const v = run(s, s.proposal);
    expect(v.addedInputs).toBe(1);
    expect(v.proposalFee).toBeGreaterThan(v.originalFee);
    expect(v.feeContribution).toBeGreaterThanOrEqual(0n);
  });
  it('accepts a proposal where the receiver added no input (not a payjoin)', async () => {
    const s = await scenario(FEE);
    const noop = rebuild(s.built.tx, { mapInput: (i) => ({ ...i, finalScriptWitness: undefined, finalScriptSig: undefined }) });
    expect(run(s, noop).addedInputs).toBe(0);
  });
  it('accepts substitution of the payment output when allowed', async () => {
    const s = await scenario(FEE);
    const other = new Uint8Array(s.paymentScript);
    other[5] = (other[5] as number) ^ 1;
    const p = rebuild(s.proposal, { mapOutput: (o) => (hex.encode(o.script as Uint8Array) === hex.encode(s.paymentScript) ? { ...o, script: other, amount: 1n } : o) });
    expect(run(s, p).addedInputs).toBe(1);
  });
});

describe('verifyProposal: negative vectors (one per check)', () => {
  it('version changed', async () => {
    const s = await scenario(FEE);
    expect(code(() => run(s, rebuild(s.proposal, { version: 1 })))).toBe('version_or_locktime_changed');
  });
  it('nLockTime changed', async () => {
    const s = await scenario(FEE);
    expect(code(() => run(s, rebuild(s.proposal, { lockTime: 7 })))).toBe('version_or_locktime_changed');
  });
  it('original not finalized', async () => {
    const s = await scenario(FEE);
    const unfinal = rebuild(s.built.tx, { mapInput: (i) => ({ ...i, finalScriptWitness: undefined }) });
    expect(code(() => verifyProposal(unfinal, s.proposal, s.params, { paymentScript: s.paymentScript }))).toBe('psbt_not_finalized');
  });
  it('sender input sequence changed', async () => {
    const s = await scenario(FEE);
    const sOp = inputOutpoint(s.built.tx, 0);
    const p = rebuild(s.proposal, { mapInput: (i, k) => (inputOutpoint(s.proposal, k) === sOp ? { ...i, sequence: 5 } : i) });
    expect(code(() => run(s, p))).toBe('sequence_changed');
  });
  it('mixed sequence values (receiver input differs)', async () => {
    const s = await scenario(FEE);
    const sOp = inputOutpoint(s.built.tx, 0);
    const p = rebuild(s.proposal, { mapInput: (i, k) => (inputOutpoint(s.proposal, k) !== sOp ? { ...i, sequence: 5 } : i) });
    expect(code(() => run(s, p))).toBe('sequence_changed');
  });
  it('keypath on an input', async () => {
    const s = await scenario(FEE);
    const p = rebuild(s.proposal, { mapInput: (i, k) => (k === 0 ? { ...i, bip32Derivation: [[new Uint8Array(33).fill(2), { fingerprint: 1, path: [1] }]] } : i) });
    expect(code(() => run(s, p))).toBe('keypaths_present');
  });
  it('partial signature on an input', async () => {
    const s = await scenario(FEE);
    const p = rebuild(s.proposal, { mapInput: (i, k) => (k === 0 ? { ...i, tapKeySig: new Uint8Array(64) } : i) });
    expect(code(() => run(s, p))).toBe('partial_sigs_present');
  });
  it('receiver finalized a sender input', async () => {
    const s = await scenario(FEE);
    const sOp = inputOutpoint(s.built.tx, 0);
    const p = rebuild(s.proposal, { mapInput: (i, k) => (inputOutpoint(s.proposal, k) === sOp ? { ...i, finalScriptWitness: [new Uint8Array(1)] } : i) });
    expect(code(() => run(s, p))).toBe('sender_input_finalized');
  });
  it('receiver input not finalized', async () => {
    const s = await scenario(FEE);
    const sOp = inputOutpoint(s.built.tx, 0);
    const p = rebuild(s.proposal, { mapInput: (i, k) => (inputOutpoint(s.proposal, k) !== sOp ? { ...i, finalScriptWitness: undefined } : i) });
    expect(code(() => run(s, p))).toBe('receiver_input_not_finalized');
  });
  it('receiver input without utxo data', async () => {
    const s = await scenario(FEE);
    const sOp = inputOutpoint(s.built.tx, 0);
    const p = rebuild(s.proposal, { mapInput: (i, k) => (inputOutpoint(s.proposal, k) !== sOp ? { ...i, witnessUtxo: undefined } : i) });
    expect(code(() => run(s, p))).toBe('psbt_invalid');
  });
  it('duplicate input', async () => {
    const s = await scenario(FEE);
    const p = rebuild(s.proposal, { extraInputs: [s.proposal.getInput(0)] });
    expect(code(() => run(s, p))).toBe('psbt_invalid');
  });
  it('sender input missing', async () => {
    const s = await scenario(FEE);
    const sOp = inputOutpoint(s.built.tx, 0);
    const p = rebuild(s.proposal, { mapInput: (i, k) => (inputOutpoint(s.proposal, k) === sOp ? null : i) });
    expect(code(() => run(s, p))).toBe('input_missing');
  });
  it('sender inputs reordered', async () => {
    const s = await scenario({ ...FEE, senderAmounts: [60_000n, 60_000n] });
    const order = [...Array(s.proposal.inputsLength).keys()];
    const idx = order.filter((k) => s.built.signingData.has(inputOutpoint(s.proposal, k)));
    const [a, b] = idx as [number, number];
    order[a] = b;
    order[b] = a;
    expect(code(() => run(s, rebuild(s.proposal, { inputOrder: order })))).toBe('order_changed');
  });
  it('absolute fee decreased', async () => {
    const s = await scenario(FEE);
    const v = run(s, s.proposal);
    const bump = v.proposalFee - v.originalFee + 1n;
    const q = rebuild(s.proposal, {
      mapOutput: (o, k) => (k === s.checked.paymentIndex ? { ...o, amount: (o.amount as bigint) + bump } : o),
    });
    expect(code(() => run(s, q))).toBe('fee_decreased');
  });
  it('outputs exceeding inputs are invalid', async () => {
    const s = await scenario(FEE);
    const p = rebuild(s.proposal, { mapOutput: (o) => ({ ...o, amount: (o.amount as bigint) + 1_000_000n }) });
    expect(code(() => run(s, p))).toBe('psbt_invalid');
  });
  it('non-fee sender output missing', async () => {
    const s = await scenario(FEE);
    const ch = s.built.changeIndex as number;
    const changeScript = hex.encode(s.built.tx.getOutput(ch).script as Uint8Array);
    const p = rebuild(s.proposal, { mapOutput: (o) => (hex.encode(o.script as Uint8Array) === changeScript ? null : o) });
    expect(code(() => run(s, p))).toBe('output_missing');
  });
  it('sender output decreased when it is not the fee output', async () => {
    const s = await scenario({ params: { maxAdditionalFeeContributionSats: 1000n, additionalFeeOutputIndex: 0 } });
    // fee output index points at index 0; make the *other* sender output shrink.
    const ch = s.built.changeIndex as number;
    const chScript = hex.encode(s.built.tx.getOutput(ch).script as Uint8Array);
    const s2 = { ...s, params: { ...s.params, additionalFeeOutputIndex: s.built.paymentIndex } }; // pointing at payment: ignored
    const p = rebuild(s.proposal, {
      mapOutput: (o) => (hex.encode(o.script as Uint8Array) === chScript ? { ...o, amount: (o.amount as bigint) - 1n } : o),
    });
    // 1 sat less change, 1 sat more fee: fee check passes, output check must fail
    expect(code(() => run(s2, p))).toBe('output_decreased');
  });
  it('no fee-output parameters: any decrease of a sender output is refused', async () => {
    const s = await scenario({});
    const ch = s.built.changeIndex as number;
    const chScript = hex.encode(s.built.tx.getOutput(ch).script as Uint8Array);
    const p = rebuild(s.proposal, { mapOutput: (o) => (hex.encode(o.script as Uint8Array) === chScript ? { ...o, amount: (o.amount as bigint) - 1n } : o) });
    expect(code(() => run(s, p))).toBe('output_decreased');
  });
  it('fee contribution above maxadditionalfeecontribution', async () => {
    const s = await scenario(FEE);
    const ch = s.built.changeIndex as number;
    const chScript = hex.encode(s.built.tx.getOutput(ch).script as Uint8Array);
    const p = rebuild(s.proposal, { mapOutput: (o) => (hex.encode(o.script as Uint8Array) === chScript ? { ...o, amount: (o.amount as bigint) - 2000n } : o) });
    expect(code(() => run(s, p))).toBe('fee_over_cap');
  });
  it('fee contribution that is not only fee (value moved to the receiver)', async () => {
    const s = await scenario({ params: { maxAdditionalFeeContributionSats: 100_000n } });
    const ch = s.built.changeIndex as number;
    const chScript = hex.encode(s.built.tx.getOutput(ch).script as Uint8Array);
    const p = rebuild(s.proposal, {
      mapOutput: (o) => {
        const sc = hex.encode(o.script as Uint8Array);
        if (sc === chScript) return { ...o, amount: (o.amount as bigint) - 5000n };
        if (sc === hex.encode(s.paymentScript)) return { ...o, amount: (o.amount as bigint) + 5000n };
        return o;
      },
    });
    expect(code(() => run(s, p))).toBe('fee_over_cap');
  });
  it('fee contribution above the cost of the added inputs', async () => {
    const s = await scenario({ params: { maxAdditionalFeeContributionSats: 100_000n } });
    const ch = s.built.changeIndex as number;
    const chScript = hex.encode(s.built.tx.getOutput(ch).script as Uint8Array);
    // receiver pays 3000 extra fee itself, so additionalFee is large, but the sender share (1000) exceeds one input's cost
    const p = rebuild(s.proposal, {
      mapOutput: (o) => {
        const sc = hex.encode(o.script as Uint8Array);
        if (sc === chScript) return { ...o, amount: (o.amount as bigint) - 1000n };
        if (sc === hex.encode(s.paymentScript)) return { ...o, amount: (o.amount as bigint) - 3000n };
        return o;
      },
    });
    expect(code(() => run(s, p))).toBe('fee_over_cap');
  });
  it('keypath on an output', async () => {
    const s = await scenario(FEE);
    const p = rebuild(s.proposal, { mapOutput: (o, k) => (k === 0 ? { ...o, bip32Derivation: [[new Uint8Array(33).fill(2), { fingerprint: 1, path: [1] }]] } : o) });
    expect(code(() => run(s, p))).toBe('keypaths_present');
  });
  it('sender outputs reordered', async () => {
    const s = await scenario({ ...FEE, outputSubstitution: false, params: { maxAdditionalFeeContributionSats: 1000n, disableOutputSubstitution: true } });
    const n = s.proposal.outputsLength;
    const p = rebuild(s.proposal, { outputOrder: [...Array(n).keys()].reverse() });
    expect(code(() => run(s, p))).toBe('order_changed');
  });
  it('substitution forbidden: payment output removed or retargeted', async () => {
    const s = await scenario({ params: { maxAdditionalFeeContributionSats: 1000n, disableOutputSubstitution: true } });
    const other = new Uint8Array(s.paymentScript);
    other[5] = (other[5] as number) ^ 1;
    const p = rebuild(s.proposal, { mapOutput: (o) => (hex.encode(o.script as Uint8Array) === hex.encode(s.paymentScript) ? { ...o, script: other } : o) });
    expect(code(() => run(s, p))).toBe('output_substitution_forbidden');
  });
  it('substitution forbidden: payment output value decreased', async () => {
    const s = await scenario({ params: { maxAdditionalFeeContributionSats: 1000n, disableOutputSubstitution: true } });
    const p = rebuild(s.proposal, { mapOutput: (o) => (hex.encode(o.script as Uint8Array) === hex.encode(s.paymentScript) ? { ...o, amount: 546n } : o) });
    expect(code(() => run(s, p))).toBe('output_decreased');
  });
  it('invoice script absent from the original', async () => {
    const s = await scenario(FEE);
    const wrong = new Uint8Array(s.paymentScript);
    wrong[3] = (wrong[3] as number) ^ 1;
    expect(code(() => verifyProposal(s.built.tx, s.proposal, s.params, { paymentScript: wrong }))).toBe('output_missing');
  });
  it('a fee-output index equal to the payment output is ignored (no relaxation)', async () => {
    const s = await scenario({ params: { maxAdditionalFeeContributionSats: 1000n, additionalFeeOutputIndex: 0, disableOutputSubstitution: true } });
    const params = { ...s.params, additionalFeeOutputIndex: s.built.paymentIndex };
    const p = rebuild(s.proposal, { mapOutput: (o) => (hex.encode(o.script as Uint8Array) === hex.encode(s.paymentScript) ? { ...o, amount: 546n } : o) });
    expect(code(() => run(s, p, params))).toBe('output_decreased');
  });
  it('out-of-range fee-output index is ignored', async () => {
    const s = await scenario({ params: { maxAdditionalFeeContributionSats: 1000n, additionalFeeOutputIndex: 99 } });
    expect(run(s, s.proposal).addedInputs).toBe(1);
  });
});

describe('checkFinalFeeRate', () => {
  it('passes without minfeerate', async () => {
    const s = await scenario(FEE);
    expect(() => checkFinalFeeRate(s.proposal, s.params)).not.toThrow();
  });
  it('rejects a non-final transaction', async () => {
    const s = await scenario(FEE);
    expect(code(() => checkFinalFeeRate(s.proposal, { ...s.params, minFeeRateSatPerVb: 1 }))).toBe('psbt_not_finalized');
  });
  it('compares fee/vsize against minfeerate on a final tx', async () => {
    const s = await scenario(FEE);
    expect(() => checkFinalFeeRate(s.built.tx, { ...s.params, minFeeRateSatPerVb: 1 })).not.toThrow();
    expect(code(() => checkFinalFeeRate(s.built.tx, { ...s.params, minFeeRateSatPerVb: 500 }))).toBe('feerate_below_min');
  });
});
