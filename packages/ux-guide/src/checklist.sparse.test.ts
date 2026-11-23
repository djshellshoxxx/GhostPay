import { describe, expect, it } from 'vitest';
import { evaluateChecklist, type SendCheckInput } from './checklist.js';

const ADDR = '0xAAAA1111bbbb2222cccc3333dddd4444eeee5555';

function validInput(): SendCheckInput {
  return {
    recipient: {
      address: ADDR,
      source: 'contact',
      valid: true,
      network: 'eth',
      inContacts: true,
      previouslyPaid: true,
      changedSinceEntry: false,
    },
    wallet: {
      network: 'eth',
      ownAddresses: ['0x0000000000000000000000000000000000000001'],
    },
    amount: { baseUnits: '1000', feeBaseUnits: '10', balanceBaseUnits: '5000', fiat: 50 },
    profile: 'everyday',
    backupConfirmed: true,
    knownAddresses: [{ address: ADDR, label: 'Alice' }],
    addressReviewed: false,
    acknowledged: [],
  };
}

function expectInvalid(input: SendCheckInput): void {
  const result = evaluateChecklist(input);
  expect(result.canSend).toBe(false);
  expect(result.blockers.map((item) => item.id)).toEqual(['input_invalid']);
}

describe('pre-send checklist sparse safety arrays', () => {
  it('rejects a hole in knownAddresses instead of throwing during lookalike detection', () => {
    const sparse = new Array<{ address: string; label: string }>(1);
    expectInvalid({ ...validInput(), knownAddresses: sparse });
  });

  it('rejects an interior hole before a valid known address', () => {
    const sparse = new Array<{ address: string; label: string }>(2);
    sparse[1] = { address: ADDR, label: 'Alice' };
    expectInvalid({ ...validInput(), knownAddresses: sparse });
  });

  it('rejects missing wallet own-address entries instead of silently accepting them', () => {
    const sparse = new Array<string>(1);
    expectInvalid({ ...validInput(), wallet: { network: 'eth', ownAddresses: sparse } });
  });

  it('rejects missing acknowledged-warning entries', () => {
    const sparse = new Array<string>(1);
    expectInvalid({ ...validInput(), acknowledged: sparse });
  });

  it('continues accepting dense valid arrays and preserves ordinary successful sends', () => {
    const result = evaluateChecklist(validInput());
    expect(result.canSend).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.pendingWarnings).toEqual([]);
  });

  it('continues rejecting dense malformed known-address records', () => {
    expectInvalid({
      ...validInput(),
      knownAddresses: [{ address: ADDR, label: 7 } as unknown as { address: string; label: string }],
    });
  });
});
