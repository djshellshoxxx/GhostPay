import { describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { existingSellerOperations } from './keyRoleInventory';

// The inventory is metadata. Importing it must not load any of the implementations.
vi.mock('@ghostpay/core-crypto', () => { throw new Error('unexpected crypto import'); });
vi.mock('@ghostpay/policy-scheme', () => { throw new Error('unexpected policy import'); });
vi.mock('@ghostpay/invoice-schema', () => { throw new Error('unexpected invoice import'); });

const expected = {
  view: ['checkAnnouncement', 'checkScheme2Announcement'],
  spend: ['deriveStealthSecret', 'deriveScheme2OwnerKey'],
  'invoice-sign': ['signInvoice', 'signReceipt'],
  'identity-sign': [],
  'device-auth': [],
  'service-authorize': [],
} as const;

describe('existing seller key operation inventory', () => {
  it.each(Object.entries(expected))('describes only the source operations of %s', (role, names) => {
    const listed = existingSellerOperations(role);
    expect(listed).toEqual(names);
    expect(Object.isFrozen(listed)).toBe(true);
    for (const [otherRole, operations] of Object.entries(expected)) {
      if (otherRole !== role) {
        for (const operation of operations) expect(listed).not.toContain(operation);
      }
    }
  });

  it('leaves private export, unrestricted signing, spending requests and fee consent out of the inventory', () => {
    for (const role of Object.keys(expected)) {
      const operations = existingSellerOperations(role);
      for (const absent of ['exportKeystore', 'revealViewingKey', 'signMessage', 'sendTransaction', 'approveFee']) {
        expect(operations).not.toContain(absent);
      }
    }
  });

  it('returns no entries for unknown or non-string role values', () => {
    for (const role of [null, undefined, 0, false, {}, ['view'], 'constructor', '__proto__', 'VIEW', 'view ']) {
      expect(existingSellerOperations(role)).toEqual([]);
    }
    fc.assert(fc.property(fc.string().filter((role) => !Object.hasOwn(expected, role)), (role) => {
      expect(existingSellerOperations(role)).toEqual([]);
    }), { seed: 602311, numRuns: 200 });
  });
});
