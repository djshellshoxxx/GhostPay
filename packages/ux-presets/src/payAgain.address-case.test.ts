import { describe, expect, it } from 'vitest';
import { ctx, record } from './fixtures.testutil.js';
import { derivePayAgain } from './payAgain.js';

const MIXED = '0xAbCdEf0123456789abcdef0123456789ABCDEF01';
const SAME_BYTES_LOWER = MIXED.toLowerCase();
const DIFFERENT = '0xabcdef0123456789abcdef0123456789abcdef02';
const validEvm = (_chain: string, address: string): boolean => /^0x[0-9a-fA-F]{40}$/.test(address);

describe('pay-again address comparison by chain', () => {
  it('does not block when the same EVM 20-byte address is resolved with different hex letter case', () => {
    const r = derivePayAgain(
      record({ chain: 'eip155:1', address: MIXED }),
      ctx({ resolvedAddress: SAME_BYTES_LOWER, validateAddress: validEvm }),
    );
    expect(r).toMatchObject({
      ok: true,
      value: {
        blocked: false,
        address: SAME_BYTES_LOWER,
        autoSend: false,
        requiresReview: true,
        flags: [],
      },
    });
  });

  it('continues blocking genuinely changed EVM recipients', () => {
    const r = derivePayAgain(
      record({ chain: 'eip155:1', address: MIXED }),
      ctx({ resolvedAddress: DIFFERENT, validateAddress: validEvm }),
    );
    expect(r).toMatchObject({
      ok: true,
      value: { blocked: true, flags: [{ code: 'address-changed', severity: 'block' }] },
    });
  });

  it('keeps case significant on non-EVM chains', () => {
    const r = derivePayAgain(
      record({ chain: 'solana:devnet', address: 'CaseSensitivePayee' }),
      ctx({ resolvedAddress: 'casesensitivepayee', validateAddress: () => true }),
    );
    expect(r).toMatchObject({
      ok: true,
      value: { blocked: true, flags: [{ code: 'address-changed', severity: 'block' }] },
    });
  });

  it('does not normalize malformed EVM-style text or non-40-byte hexadecimal strings', () => {
    const r = derivePayAgain(
      record({ chain: 'eip155:1', address: '0xABCDEF' }),
      ctx({ resolvedAddress: '0xabcdef', validateAddress: () => true }),
    );
    expect(r).toMatchObject({
      ok: true,
      value: { blocked: true, flags: [{ code: 'address-changed', severity: 'block' }] },
    });
  });
});
