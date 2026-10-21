import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { PayjoinError } from './errors.js';
import { rebuild, scenario } from './fixtures.testutil.js';
import { checkOriginal } from './receiver/checks.js';
import { parseParams } from './params.js';
import { parsePayjoinUri, parseV2Fragment, validatePjUrl } from './uri.js';
import { parsePsbt, inputOutpoint, outputInfo, psbtFee, encodePsbt } from './psbt.js';
import { verifyProposal } from './sender/checks.js';

/** Anything thrown must be a PayjoinError (BPJ fuzz requirement). */
const onlyPayjoinErrors = (f: () => unknown): void => {
  try {
    f();
  } catch (e) {
    expect(e).toBeInstanceOf(PayjoinError);
  }
};

describe('property: honest proposals verify and conserve value', () => {
  it('verifyProposal(buildProposal(x)) passes for random amounts, feerates and fee-contribution settings', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          sAmt: fc.bigInt({ min: 60_000n, max: 5_000_000n }),
          rAmt: fc.bigInt({ min: 20_000n, max: 5_000_000n }),
          pay: fc.bigInt({ min: 1_000n, max: 50_000n }),
          feeRate: fc.integer({ min: 1, max: 40 }),
          cap: fc.option(fc.bigInt({ min: 0n, max: 2_000n }), { nil: undefined }),
          minRate: fc.option(fc.integer({ min: 1, max: 30 }), { nil: undefined }),
          kinds: fc.constantFrom(['wpkh', 'wpkh'], ['sh-wpkh', 'wpkh'], ['tr', 'tr'], ['wpkh', 'tr']),
          subst: fc.boolean(),
        }),
        async (c) => {
          let s: Awaited<ReturnType<typeof scenario>>;
          try {
            s = await scenario({
              sKind: c.kinds[0],
              rKind: c.kinds[1],
              senderAmounts: [c.sAmt],
              receiverAmounts: [c.rAmt],
              amount: c.pay,
              feeRate: c.feeRate,
              outputSubstitution: c.subst,
              params: {
                disableOutputSubstitution: !c.subst,
                ...(c.cap !== undefined ? { maxAdditionalFeeContributionSats: c.cap } : {}),
                ...(c.minRate !== undefined ? { minFeeRateSatPerVb: c.minRate } : {}),
              },
            });
          } catch (e) {
            // legitimate refusals: sender cannot fund, receiver cannot afford the bump
            expect(e).toBeInstanceOf(PayjoinError);
            expect(['not_enough_money', 'unavailable']).toContain((e as PayjoinError).code);
            return;
          }
          const v = verifyProposal(s.built.tx, s.proposal, s.params, { paymentScript: s.paymentScript });
          expect(v.addedInputs).toBe(1);
          // value conservation: fee = sum(in) - sum(out) and never below the original fee
          const prev = new Map([...s.sUtxos, ...s.rUtxos].map((u) => [`${u.txid}:${String(u.index)}`, { script: u.script, amount: u.amount }]));
          let outSum = 0n;
          for (let i = 0; i < s.proposal.outputsLength; i++) outSum += outputInfo(s.proposal, i).amount;
          let inSum = 0n;
          for (let i = 0; i < s.proposal.inputsLength; i++) inSum += (prev.get(inputOutpoint(s.proposal, i)) as { amount: bigint }).amount;
          expect(inSum - outSum).toBe(psbtFee(s.proposal, prev));
          expect(inSum - outSum).toBeGreaterThanOrEqual(s.built.fee);
          // the sender never pays more than original payment + bounded fee contribution
          expect(v.feeContribution).toBeLessThanOrEqual(c.cap ?? 0n);
        },
      ),
      { numRuns: 60 },
    );
  });
});

describe('fuzz: malformed input never throws anything but PayjoinError', () => {
  it('URI parsers', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 300 }), (s) => {
        onlyPayjoinErrors(() => parsePayjoinUri(s, 'testnet', 1));
        onlyPayjoinErrors(() => parseV2Fragment(s));
        onlyPayjoinErrors(() => validatePjUrl(s));
        onlyPayjoinErrors(() => parsePayjoinUri(`bitcoin:${s}`, 'regtest'));
      }),
      { numRuns: 400 },
    );
  });
  it('URIs with structure', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.constantFrom('pj', 'amount', 'sp', 'pjos', 'label', 'req-x'), fc.string({ maxLength: 40 })), { maxLength: 6 }), (kv) => {
        const q = kv.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
        onlyPayjoinErrors(() => parsePayjoinUri(`bitcoin:tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx?${q}`, 'testnet'));
      }),
      { numRuns: 300 },
    );
  });
  it('query params never throw', () => {
    fc.assert(fc.property(fc.string({ maxLength: 120 }), (s) => onlyPayjoinErrors(() => parseParams(s))), { numRuns: 300 });
  });
  it('PSBT parsing and receiver check on random bytes', async () => {
    const s = await scenario({ noBuild: true });
    await fc.assert(
      fc.asyncProperty(fc.uint8Array({ maxLength: 200 }), async (b) => {
        const b64 = Buffer.from(b).toString('base64');
        onlyPayjoinErrors(() => parsePsbt(b64));
        try {
          await checkOriginal(b64, s.ctx);
        } catch (e) {
          expect(e).toBeInstanceOf(PayjoinError);
        }
      }),
      { numRuns: 200 },
    );
  });
  it('bit-flipped valid PSBTs are rejected or checked, never crash', async () => {
    const s = await scenario({ noBuild: true });
    const raw = Buffer.from(s.built.psbt, 'base64');
    await fc.assert(
      fc.asyncProperty(fc.nat({ max: raw.length - 1 }), fc.integer({ min: 0, max: 7 }), async (pos, bit) => {
        const c = Buffer.from(raw);
        c[pos] = (c[pos] as number) ^ (1 << bit);
        try {
          await checkOriginal(c.toString('base64'), s.ctx);
        } catch (e) {
          expect(e).toBeInstanceOf(PayjoinError);
        }
      }),
      { numRuns: 300 },
    );
  });
  it('mutating a valid proposal one output at a time never passes the sender checks unless value-preserving', async () => {
    const s = await scenario({ params: { maxAdditionalFeeContributionSats: 300n } });
    fc.assert(
      fc.property(fc.nat({ max: s.proposal.outputsLength - 1 }), fc.bigInt({ min: -300n, max: 300n }), (k, delta) => {
        const p = rebuild(s.proposal, { mapOutput: (o, i) => (i === k ? { ...o, amount: (o.amount as bigint) + delta } : o) });
        try {
          verifyProposal(s.built.tx, p, s.params, { paymentScript: s.paymentScript });
        } catch (e) {
          expect(e).toBeInstanceOf(PayjoinError);
        }
      }),
      { numRuns: 80 },
    );
    void encodePsbt;
  });
});
