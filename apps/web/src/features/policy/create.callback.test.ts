import { describe, expect, it } from 'vitest';
import { createPolicyMetaAddress } from './create';
import { account } from './fixtures.testutil';

describe('policy limit row validation', () => {
  it('keeps the filtered row index in validation errors', () => {
    const a = account('acct-002');
    const input = {
      spendingPublicKeyHex: a.spendingPublicKey,
      viewingPublicKeyHex: a.viewingPublicKey,
      destination: a.policy.destination,
      delaySeconds: 3600n,
      limits: [
        { token: '', limit: '', windowSeconds: '' },
        { token: 'native', limit: '5', windowSeconds: '60' },
        { token: 'invalid-address', limit: '10', windowSeconds: '60' },
      ],
    };
    expect(() => createPolicyMetaAddress(input)).toThrow('Limit 2: token must be a checksummed address or "native".');
  });
});
