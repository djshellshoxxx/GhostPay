import { describe, expect, it } from 'vitest';
import { SilentPaymentError } from './errors.js';
import { generateSilentPaymentKeys } from './keys.js';
import { silentPaymentAddress } from './labels.js';
import { seededRng } from './rng.testutil.js';
import { previewSweep, type PreviewSweepParams } from './spend.js';

const wallet = generateSilentPaymentKeys(seededRng('preview-cross-network-regression'));
const mainAddress = silentPaymentAddress(wallet, 'mainnet');
const testAddress = silentPaymentAddress(wallet, 'testnet');
const common = { inputAmountsSats: [100_000n], feeRate: 1 } as const;

function codeOf(params: PreviewSweepParams): string {
  try {
    previewSweep(params);
    return 'NO_THROW';
  } catch (error) {
    return error instanceof SilentPaymentError ? error.code : 'OTHER';
  }
}

describe('previewSweep silent-payment destination validation (GP-BUG-17)', () => {
  it('rejects a valid testnet silent-payment address when previewing mainnet', () => {
    expect(codeOf({ ...common, network: 'mainnet', address: testAddress })).toBe('NETWORK_MISMATCH');
  });

  it('rejects a valid mainnet silent-payment address when previewing testnet', () => {
    expect(codeOf({ ...common, network: 'testnet', address: mainAddress })).toBe('NETWORK_MISMATCH');
  });

  it('preserves fee/amount calculation for legitimate matching-network destinations', () => {
    for (const [network, address] of [['mainnet', mainAddress], ['testnet', testAddress]] as const) {
      const preview = previewSweep({ ...common, network, address });
      expect(preview.destinationIsSilentPayment).toBe(true);
      expect(preview.vsize).toBe(111);
      expect(preview.feeSats).toBe(111n);
      expect(preview.sendSats).toBe(99_889n);
    }
  });

  it('rejects a malformed silent-payment address rather than treating its prefix as sufficient', () => {
    expect(codeOf({ ...common, network: 'mainnet', address: 'sp1qqqqqqq' })).toBe('INVALID_ADDRESS');
  });
});
