import { ChainAdapterError } from '@ghostpay/chain-adapters';
import { GhostPayCryptoError } from '@ghostpay/core-crypto';
import { FragmentFormatError, FragmentTooLargeError, SchemaError, DecryptionError } from '@ghostpay/invoice-schema';
import { describe, expect, it } from 'vitest';
import { UserFacingError, userMessage } from './errors';

describe('userMessage', () => {
  it('passes user-facing messages through', () => {
    expect(userMessage(new UserFacingError('Hello'))).toBe('Hello');
  });
  it('maps invoice errors to fixed text, with a schema path only', () => {
    expect(userMessage(new FragmentFormatError())).toMatch(/not a GhostPay v1/);
    expect(userMessage(new FragmentTooLargeError())).toMatch(/16 KiB/);
    expect(userMessage(new DecryptionError())).toMatch(/changed or damaged/);
    expect(userMessage(new SchemaError('fiat.minorUnits'))).toMatch(/field: fiat\.minorUnits/);
  });
  it('does not echo chain or crypto details beyond the code', () => {
    expect(userMessage(new ChainAdapterError('PREVIEW_MISMATCH', 'secret detail'))).toBe('Blocked by a safety check (PREVIEW_MISMATCH).');
    expect(userMessage(new GhostPayCryptoError('INVALID_POINT'))).toBe('A cryptographic check failed (INVALID_POINT).');
  });
  it('hides unknown errors', () => {
    expect(userMessage(new Error('private key 0xabc'))).toBe('Something went wrong. Nothing was sent.');
    expect(userMessage('x')).toBe('Something went wrong. Nothing was sent.');
  });
});
