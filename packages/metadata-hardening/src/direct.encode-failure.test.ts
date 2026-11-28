import { generateKeySet } from '@ghostpay/core-crypto';
import { describe, expect, it, vi } from 'vitest';
import { MetadataHardeningError } from './guard.js';
import { seededRng } from './testutil.testutil.js';

// viem's own errors embed the encoded arguments; whatever it throws must never reach the caller.
vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('viem')>();
  return {
    ...actual,
    encodeFunctionData: () => {
      throw new Error('viem failure containing sentinel-secret-7f3a and 0x1111111111111111111111111111111111111111');
    },
  };
});

describe('MH-FEE-1 buildDirectPayment: encoder failure', () => {
  it('is reported as a typed error without the encoder text', async () => {
    const { buildDirectPayment } = await import('./direct.js');
    try {
      buildDirectPayment({
        chainId: 31337,
        announcer: '0x55649E01B5Df198D18D95b5cc5051630cfD45564',
        routerAddress: '0x2222222222222222222222222222222222222222',
        stealthAddress: '0x1111111111111111111111111111111111111111',
        asset: { kind: 'native' },
        amount: 1n,
        ephemeralPublicKey: generateKeySet(seededRng(9)).spendingPublicKey,
        metadata: new Uint8Array([1]),
      });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(MetadataHardeningError);
      expect((e as MetadataHardeningError).code).toBe('INVALID_INPUT');
      expect((e as Error).message).not.toMatch(/sentinel|0x1111/);
    }
  });
});
