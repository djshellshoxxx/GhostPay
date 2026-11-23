import { describe, expect, it } from 'vitest';
import { buildFeePrivacyPreview, DEFAULT_FEE_SCHEDULE, type FeePreviewInput } from './preview.js';

const ASSET = { id: 'usdc', symbol: 'USDC', decimals: 6 } as const;
const ETH = { id: 'native:ETH', symbol: 'ETH', decimals: 18 } as const;
const BAD_ALIAS = { ...ASSET, symbol: 'WRONG' } as const;
const feeRecipient = '0x1111111111111111111111111111111111111111';

function sample(overrides: Partial<FeePreviewInput> = {}): FeePreviewInput {
  return {
    route: 'router',
    asset: ASSET,
    amount: 100_000_000n,
    amountMode: 'gross',
    feeSchedule: DEFAULT_FEE_SCHEDULE,
    feeRecipient,
    recipientFromSignedManifest: true,
    privacy: { usesStealthAddress: true, sweepMode: 'self', timingJitter: true },
    ...overrides,
  };
}

describe('fee preview cannot combine different symbols under one asset id', () => {
  it.each([
    ['network fee', { networkFee: { asset: BAD_ALIAS, amount: 10n } }],
    ['router gas buffer', { gasBuffer: { asset: BAD_ALIAS, amount: 10n } }],
    ['flat security fee', { flatSecurityFee: { asset: BAD_ALIAS, amount: 10n } }],
  ] as const)('blocks %s when asset id and decimals match but symbol differs', (_name, overrides) => {
    const result = buildFeePrivacyPreview(sample(overrides));
    expect(result.canProceed).toBe(false);
    expect(result.warnings.map((warning) => warning.message.key)).toContain(
      'fees.preview.warn.assetMismatch',
    );
  });

  it('preserves aggregation when id, symbol and decimals all agree', () => {
    const result = buildFeePrivacyPreview(sample({
      networkFee: { asset: { ...ASSET }, amount: 10n },
      gasBuffer: { asset: { ...ASSET }, amount: 20n },
      flatSecurityFee: { asset: { ...ASSET }, amount: 30n },
    }));
    expect(result.canProceed).toBe(true);
    expect(result.payerTotals).toEqual([
      { assetId: 'usdc', symbol: 'USDC', decimals: 6, amount: 100_000_060n, display: '100.00006' },
    ]);
  });

  it('keeps distinct asset ids separate even when their symbols differ', () => {
    const result = buildFeePrivacyPreview(sample({
      networkFee: { asset: ETH, amount: 10n },
    }));
    expect(result.canProceed).toBe(true);
    expect(result.payerTotals).toHaveLength(2);
    expect(result.warnings.map((warning) => warning.message.key)).not.toContain(
      'fees.preview.warn.assetMismatch',
    );
  });

  it('continues to block mismatched decimals for the same asset id', () => {
    const result = buildFeePrivacyPreview(sample({
      networkFee: { asset: { ...ASSET, decimals: 18 }, amount: 10n },
    }));
    expect(result.canProceed).toBe(false);
    expect(result.warnings.map((warning) => warning.message.key)).toContain(
      'fees.preview.warn.assetMismatch',
    );
  });
});
