import { describe, expect, it } from 'vitest';
import { buildFeePrivacyPreview, DEFAULT_FEE_SCHEDULE, type FeePreviewInput } from './preview.js';

const ASSET = { id: 'usdc', symbol: 'USDC', decimals: 6 } as const;
const WRONG_SYMBOL = { ...ASSET, symbol: 'WRONG' } as const;
const WRONG_DECIMALS = { ...ASSET, decimals: 18 } as const;

function sample(overrides: Partial<FeePreviewInput> = {}): FeePreviewInput {
  return {
    route: 'direct',
    asset: ASSET,
    amount: 1_000_000n,
    amountMode: 'gross',
    feeSchedule: DEFAULT_FEE_SCHEDULE,
    privacy: { usesStealthAddress: true, sweepMode: 'self', timingJitter: true },
    ...overrides,
  };
}

describe('fee previews retain payment asset identity without a checkout fee line', () => {
  it.each([
    ['direct network symbol', { networkFee: { asset: WRONG_SYMBOL, amount: 10n } }],
    ['direct network decimals', { networkFee: { asset: WRONG_DECIMALS, amount: 10n } }],
    ['direct security fee', { flatSecurityFee: { asset: WRONG_SYMBOL, amount: 10n } }],
    [
      'unenforceable router network symbol',
      {
        route: 'router',
        checkoutStatus: 'not_enforceable',
        networkFee: { asset: WRONG_SYMBOL, amount: 10n },
      },
    ],
    [
      'zero-fee router network symbol',
      {
        route: 'router',
        feeSchedule: { ...DEFAULT_FEE_SCHEDULE, routerFeeBps: 0 },
        networkFee: { asset: WRONG_SYMBOL, amount: 10n },
      },
    ],
    [
      'consistent fee identities that differ from the payment',
      {
        networkFee: { asset: WRONG_SYMBOL, amount: 10n },
        flatSecurityFee: { asset: WRONG_SYMBOL, amount: 20n },
      },
    ],
  ] satisfies readonly (readonly [string, Partial<FeePreviewInput>])[])(
    'blocks %s from relabelling the payment total',
    (_label, overrides) => {
      const result = buildFeePrivacyPreview(sample(overrides));
      expect(result.lines.map((line) => line.id)).not.toContain('F-PAY');
      expect(result.canProceed).toBe(false);
      expect(result.warnings).toContainEqual({
        severity: 'block',
        message: { key: 'fees.preview.warn.assetMismatch', params: {} },
      });
    },
  );

  it.each([
    ['direct', {}],
    ['unenforceable router', { route: 'router', checkoutStatus: 'not_enforceable' }],
    ['zero-fee router', { route: 'router', feeSchedule: { ...DEFAULT_FEE_SCHEDULE, routerFeeBps: 0 } }],
  ] satisfies readonly (readonly [string, Partial<FeePreviewInput>])[])(
    'preserves valid same-asset aggregation for %s',
    (_label, overrides) => {
      const result = buildFeePrivacyPreview(sample({
        ...overrides,
        networkFee: { asset: { ...ASSET }, amount: 10n },
        flatSecurityFee: { asset: { ...ASSET }, amount: 20n },
      }));
      expect(result.canProceed).toBe(true);
      expect(result.payerTotals).toEqual([
        { assetId: 'usdc', symbol: 'USDC', decimals: 6, amount: 1_000_030n, display: '1.00003' },
      ]);
    },
  );

  it('preserves separate direct-payment and network assets', () => {
    const result = buildFeePrivacyPreview(sample({
      networkFee: { asset: { id: 'eth', symbol: 'ETH', decimals: 18 }, amount: 10n },
    }));
    expect(result.canProceed).toBe(true);
    expect(result.payerTotals).toHaveLength(2);
    expect(result.payerTotals[0]).toEqual({
      assetId: 'usdc', symbol: 'USDC', decimals: 6, amount: 1_000_000n, display: '1',
    });
  });
});
