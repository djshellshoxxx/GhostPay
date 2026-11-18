import { Address, NETWORK } from '@scure/btc-signer';
import { describe, expect, it } from 'vitest';
import { SilentPaymentError } from './errors.js';
import { fakeTxid, p2wpkhInput } from './fixtures.testutil.js';
import { generateSilentPaymentKeys } from './keys.js';
import { silentPaymentAddress } from './labels.js';
import { computeTransactionTweak, scanOutputsForTweak } from './receiver.js';
import { seededRng } from './rng.testutil.js';
import { createSilentPaymentOutputs } from './sender.js';
import {
  buildSpendTransaction,
  DEFAULT_WALLET_DUST_SATS,
  DUST_LIMIT_SATS,
  estimateKeyPathVsize,
  MAX_FEE_RATE_SAT_PER_VB,
  previewSweep,
  type SpendableOutput,
} from './spend.js';

const code = (f: () => unknown): string | undefined => {
  try {
    f();
  } catch (e) {
    return e instanceof SilentPaymentError ? e.code : `OTHER:${String(e)}`;
  }
  return undefined;
};

const wallet = generateSilentPaymentKeys(seededRng('policy-spend'));
const dest = Address(NETWORK).encode({ type: 'wpkh', hash: new Uint8Array(20).fill(7) });

function fund(seed: string, amountSats: bigint): SpendableOutput[] {
  const t = p2wpkhInput(seed);
  const outs = createSilentPaymentOutputs({
    inputs: [t.key],
    outpoints: [{ txid: t.input.txid, vout: t.input.vout }],
    recipients: [silentPaymentAddress(wallet, 'mainnet')],
    network: 'mainnet',
  });
  const tw = computeTransactionTweak([t.input]);
  if (tw === null) throw new Error('ineligible');
  const [f] = scanOutputsForTweak(
    { scanSecret: wallet.scanSecret, spendPublicKey: wallet.spendPublicKey },
    tw.tweak,
    outs.map((o) => o.xOnlyPublicKey),
  );
  if (f === undefined) throw new Error('not found');
  return [{ txid: fakeTxid(`pf-${seed}`), vout: 0, amountSats, xOnlyPublicKey: f.xOnlyPublicKey, spendTweak: f.spendTweak }];
}

// One P2TR input swept to a P2WPKH output: exact vsize, so the fee at an integer rate is exact.
const VSIZE = estimateKeyPathVsize(1, [22]);
const preview = (total: bigint, over: Partial<Parameters<typeof previewSweep>[0]> = {}) =>
  previewSweep({ inputAmountsSats: [total], address: dest, feeRate: 10, network: 'mainnet', ...over });

describe('fee guard (spec 11: refuse fee > 50% of the swept value unless forced)', () => {
  const fee = 10n * BigInt(VSIZE);

  it('allows a fee of exactly 50% of the inputs', () => {
    const pv = preview(2n * fee);
    expect(pv.feeSats).toBe(fee);
    expect(pv.sendSats).toBe(fee);
  });

  it('refuses one satoshi above 50%, without the old 10 000 sat floor', () => {
    expect(code(() => preview(2n * fee - 1n))).toBe('FEE_TOO_HIGH');
    expect(fee < 10_000n).toBe(true);
    expect(code(() => preview(2n * fee - 1n, { forceHighFee: false }))).toBe('FEE_TOO_HIGH');
  });

  it('forceHighFee accepts the same sweep, but never a fee rate above the hard cap or a fee above the inputs', () => {
    const pv = preview(2n * fee - 1n, { forceHighFee: true });
    expect(pv.feeSats).toBe(fee);
    expect(pv.sendSats).toBe(fee - 1n);
    expect(code(() => preview(2n * fee - 1n, { forceHighFee: true, feeRate: MAX_FEE_RATE_SAT_PER_VB + 1 }))).toBe('FEE_TOO_HIGH');
    expect(code(() => preview(fee, { forceHighFee: true }))).toBe('INSUFFICIENT_FUNDS');
  });

  it('buildSpendTransaction applies the same rule and the same flag', () => {
    const over = fund('fee-over', 2n * fee - 1n);
    const common = { spendSecret: wallet.spendSecret, destinations: [{ address: dest }], feeRate: 10, network: 'mainnet' as const };
    expect(code(() => buildSpendTransaction({ ...common, outputs: over }))).toBe('FEE_TOO_HIGH');
    const r = buildSpendTransaction({ ...common, outputs: over, forceHighFee: true });
    expect(r.feeSats).toBe(fee);
    expect(buildSpendTransaction({ ...common, outputs: fund('fee-exact', 2n * fee) }).feeSats).toBe(fee);
  });
});

describe('dust floor (546 sat consensus floor is the hard minimum for created outputs)', () => {
  const fee = BigInt(VSIZE); // rate 1 sat/vB

  it('exports the two thresholds', () => {
    expect(DUST_LIMIT_SATS).toBe(546n);
    expect(DEFAULT_WALLET_DUST_SATS).toBe(1000n);
  });

  it('a sweep output of 545 sats is dust, 546 is not, whatever lower limit the caller passes', () => {
    expect(code(() => preview(fee + 545n, { feeRate: 1 }))).toBe('DUST_OUTPUT');
    expect(preview(fee + 546n, { feeRate: 1 }).sendSats).toBe(546n);
    expect(code(() => preview(fee + 545n, { feeRate: 1, dustLimitSats: 0n }))).toBe('DUST_OUTPUT');
    expect(code(() => preview(fee + 545n, { feeRate: 1, dustLimitSats: 300n }))).toBe('DUST_OUTPUT');
    expect(code(() => preview(fee + 999n, { feeRate: 1, dustLimitSats: 1000n }))).toBe('DUST_OUTPUT');
    expect(preview(fee + 1000n, { feeRate: 1, dustLimitSats: 1000n }).sendSats).toBe(1000n);
    expect(code(() => preview(fee + 546n, { feeRate: 1, dustLimitSats: -1n }))).toBe('INVALID_INPUT');
  });

  it('buildSpendTransaction clamps a caller dust limit below the floor up to 546', () => {
    const common = { spendSecret: wallet.spendSecret, destinations: [{ address: dest }], feeRate: 1, network: 'mainnet' as const };
    expect(code(() => buildSpendTransaction({ ...common, outputs: fund('dust-545', fee + 545n), dustLimitSats: 0n }))).toBe('DUST_OUTPUT');
    const r = buildSpendTransaction({ ...common, outputs: fund('dust-546', fee + 546n), dustLimitSats: 0n });
    expect(r.feeSats).toBe(fee);
  });
});
