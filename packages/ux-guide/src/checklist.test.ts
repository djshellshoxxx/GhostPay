import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  buildAddressReview, evaluateChecklist, findLookalike, gradeAddressReview, isCleanAddress, normalizeAddress,
  type ItemId, type SendCheckInput,
} from './checklist.js';

// Exact fake data only.
const ADDR = '0xAAAA1111bbbb2222cccc3333dddd4444eeee5555';
const base = (over: Partial<SendCheckInput> = {}): SendCheckInput => ({
  recipient: { address: ADDR, source: 'contact', valid: true, network: 'eth', inContacts: true, previouslyPaid: true, changedSinceEntry: false },
  wallet: { network: 'eth', ownAddresses: ['0x0000000000000000000000000000000000000001'] },
  amount: { baseUnits: '1000', feeBaseUnits: '10', balanceBaseUnits: '5000', fiat: 50 },
  profile: 'everyday',
  backupConfirmed: true,
  knownAddresses: [{ address: ADDR, label: 'Alice' }],
  addressReviewed: false,
  acknowledged: [],
  ...over,
});
const rec = (o: Partial<SendCheckInput['recipient']>): SendCheckInput['recipient'] => ({ ...base().recipient, ...o });
const amt = (o: Partial<SendCheckInput['amount']>): SendCheckInput['amount'] => ({ ...base().amount, ...o });
const failing = (i: unknown): ItemId[] => {
  const r = evaluateChecklist(i);
  return r.items.filter((x) => !x.passed).map((x) => x.id);
};

describe('evaluateChecklist', () => {
  it('passes a clean contact send', () => {
    const r = evaluateChecklist(base());
    expect(r.canSend).toBe(true);
    expect(r.items).toHaveLength(13);
    expect(r.blockers).toEqual([]);
    expect(r.reviewNeeded).toBe(false);
  });
  it('blockers', () => {
    expect(failing(base({ recipient: rec({ valid: false }) }))).toEqual(['address_invalid']);
    expect(failing(base({ recipient: rec({ network: 'btc' }) }))).toEqual(['network_mismatch']);
    expect(failing(base({ backupConfirmed: false }))).toEqual(['backup_not_confirmed']);
    expect(failing(base({ amount: amt({ baseUnits: '0' }) }))).toEqual(['amount_invalid']);
    const r = evaluateChecklist(base({ amount: amt({ baseUnits: '4991' }) }));
    expect(r.canSend).toBe(false);
    expect(r.blockers.map((b) => b.id)).toEqual(['insufficient_funds']);
  });
  it('exact balance boundary', () => {
    expect(evaluateChecklist(base({ amount: amt({ baseUnits: '4990', feeBaseUnits: '10' }) })).blockers).toEqual([]);
    expect(evaluateChecklist(base({ amount: amt({ baseUnits: '4991', feeBaseUnits: '10' }) })).blockers).toHaveLength(1);
  });
  it('handles huge numbers with bigint precision', () => {
    const big = '9'.repeat(40);
    const r = evaluateChecklist(base({ amount: { baseUnits: big, feeBaseUnits: '1', balanceBaseUnits: big } }));
    expect(r.blockers.map((b) => b.id)).toEqual(['insufficient_funds']);
  });
  it('rejects malformed amounts', () => {
    for (const bad of ['', '-1', '1.5', '01', '1e3', ' 1', '0x10', '1'.repeat(79)]) {
      const r = evaluateChecklist(base({ amount: amt({ baseUnits: bad }) }));
      expect(r.canSend).toBe(false);
      expect(r.blockers.map((b) => b.id)).toContain('amount_invalid');
      expect(r.blockers.map((b) => b.id)).toContain('insufficient_funds');
    }
  });
  it('high fee warning needs ack (fee > 10% of amount)', () => {
    const i = base({ amount: amt({ baseUnits: '1000', feeBaseUnits: '101' }) });
    const r = evaluateChecklist(i);
    expect(r.pendingWarnings.map((w) => w.id)).toEqual(['high_fee']);
    expect(evaluateChecklist(base({ amount: amt({ feeBaseUnits: '100' }) })).canSend).toBe(true);
    expect(evaluateChecklist({ ...i, acknowledged: ['high_fee'] }).canSend).toBe(true);
  });
  it('new recipient warning, acknowledgement, and review requirement', () => {
    const i = base({ recipient: rec({ inContacts: false, previouslyPaid: false, source: 'typed' }), knownAddresses: [] });
    const r = evaluateChecklist(i);
    expect(r.pendingWarnings.map((w) => w.id)).toEqual(['first_time_recipient']);
    expect(r.blockers.map((b) => b.id)).toEqual(['address_review_required']);
    expect(r.reviewNeeded).toBe(true);
    const done = evaluateChecklist({ ...i, addressReviewed: true, acknowledged: ['first_time_recipient'] });
    expect(done.canSend).toBe(true);
    expect(done.reviewNeeded).toBe(false);
    const item = done.items.find((x) => x.id === 'first_time_recipient');
    expect(item).toMatchObject({ passed: false, acknowledged: true });
  });
  it('acknowledging cannot clear a blocker', () => {
    const i = base({ backupConfirmed: false, acknowledged: ['backup_not_confirmed', 'address_review_required'] });
    expect(evaluateChecklist(i).canSend).toBe(false);
  });
  it('review mode depends on profile', () => {
    const paid = rec({ inContacts: false, previouslyPaid: true, source: 'typed' });
    expect(evaluateChecklist(base({ recipient: paid })).reviewNeeded).toBe(false);
    expect(evaluateChecklist(base({ recipient: paid, profile: 'private' })).reviewNeeded).toBe(true);
    expect(evaluateChecklist(base({ profile: 'maximum' })).reviewNeeded).toBe(true);
    expect(evaluateChecklist(base({ profile: 'private' })).reviewNeeded).toBe(false);
  });
  it('look-alike (address poisoning) warning', () => {
    const fake = '0xAAAA9999999999999999999999999999999e5555';
    const r = evaluateChecklist(base({ recipient: rec({ address: fake, inContacts: false }) }));
    const w = r.pendingWarnings.find((x) => x.id === 'lookalike_address');
    expect(w?.params).toEqual({ label: 'Alice' });
    expect(r.canSend).toBe(false);
  });
  it('changed-since-entry, link source, self send, high value', () => {
    expect(failing(base({ recipient: rec({ changedSinceEntry: true }) }))).toEqual(['address_changed']);
    expect(failing(base({ recipient: rec({ source: 'link', inContacts: false, previouslyPaid: true }), knownAddresses: [] }))).toEqual(
      ['address_review_required', 'untrusted_source'].filter((x) => x === 'untrusted_source'),
    );
    expect(failing(base({ wallet: { network: 'eth', ownAddresses: [ADDR.toLowerCase()] } }))).toEqual(['self_send']);
    expect(failing(base({ amount: amt({ fiat: 1000 }) }))).toEqual(['high_value']);
    expect(failing(base({ amount: amt({ fiat: 999.99 }) }))).toEqual([]);
    expect(failing(base({ amount: amt({ fiat: 500 }), profile: 'private' }))).toEqual(['high_value']);
    expect(failing(base({ amount: { baseUnits: '1000', feeBaseUnits: '10', balanceBaseUnits: '5000' } }))).toEqual([]);
  });
  it('rejects spoofed address characters', () => {
    for (const bad of [ADDR + '​', ADDR.replace('A', 'А'), ' ' + ADDR, ADDR + '\n', '', 'x'.repeat(129)]) {
      expect(failing(base({ recipient: rec({ address: bad }) }))).toContain('address_invalid');
    }
  });
  it('fails closed on malformed input', () => {
    const bads: unknown[] = [
      null, 1, 'x', {}, { ...base(), recipient: null }, { ...base(), wallet: undefined }, { ...base(), amount: 3 },
      { ...base(), profile: 'nope' }, { ...base(), backupConfirmed: 'yes' }, { ...base(), addressReviewed: 1 },
      { ...base(), knownAddresses: 'x' }, { ...base(), knownAddresses: [null] }, { ...base(), knownAddresses: [{ address: 1, label: 'a' }] },
      { ...base(), acknowledged: [1] }, { ...base(), recipient: { ...base().recipient, source: 'telepathy' } },
      { ...base(), recipient: { ...base().recipient, valid: 'true' } }, { ...base(), recipient: { ...base().recipient, address: 5 } },
      { ...base(), wallet: { network: 'eth', ownAddresses: [3] } }, { ...base(), amount: { ...base().amount, baseUnits: 10 } },
      { ...base(), amount: { ...base().amount, fiat: NaN } }, { ...base(), amount: { ...base().amount, fiat: -1 } },
      { ...base(), amount: { ...base().amount, fiat: '5' } },
    ];
    for (const b of bads) {
      const r = evaluateChecklist(b);
      expect(r.canSend).toBe(false);
      expect(r.blockers.map((x) => x.id)).toEqual(['input_invalid']);
    }
  });
  it('property: canSend implies no failing blockers and every failing warning acknowledged', () => {
    fc.assert(
      fc.property(
        fc.record({
          valid: fc.boolean(), inContacts: fc.boolean(), previouslyPaid: fc.boolean(), changed: fc.boolean(),
          backup: fc.boolean(), reviewed: fc.boolean(), a: fc.nat(10_000), f: fc.nat(1000), b: fc.nat(20_000),
          profile: fc.constantFrom('everyday', 'private', 'maximum'),
          ack: fc.subarray(['first_time_recipient', 'lookalike_address', 'address_changed', 'untrusted_source', 'high_value', 'high_fee', 'self_send']),
        }),
        (x) => {
          const r = evaluateChecklist(base({
            recipient: rec({ valid: x.valid, inContacts: x.inContacts, previouslyPaid: x.previouslyPaid, changedSinceEntry: x.changed }),
            amount: { baseUnits: String(x.a), feeBaseUnits: String(x.f), balanceBaseUnits: String(x.b) },
            backupConfirmed: x.backup, addressReviewed: x.reviewed, profile: x.profile as 'everyday', acknowledged: x.ack,
          }));
          if (r.canSend) {
            expect(r.items.filter((i) => i.kind === 'blocker').every((i) => i.passed)).toBe(true);
            expect(r.items.filter((i) => i.kind === 'warning').every((i) => i.passed || i.acknowledged)).toBe(true);
            expect(BigInt(x.a) + BigInt(x.f)).toBeLessThanOrEqual(BigInt(x.b));
          }
        },
      ),
    );
  });
});

describe('address helpers', () => {
  it('normalize / clean', () => {
    expect(normalizeAddress('0xABcd')).toBe('0xabcd');
    expect(normalizeAddress('bc1QABC')).toBe('bc1QABC');
    expect(isCleanAddress('abc')).toBe(true);
    expect(isCleanAddress('a b')).toBe(false);
    expect(isCleanAddress(5)).toBe(false);
  });
  it('findLookalike', () => {
    const known = [{ address: 'abcd1111111111wxyz', label: 'Bob' }, { address: 'short', label: 'S' }];
    expect(findLookalike('abcd2222222222wxyz', known)?.label).toBe('Bob');
    expect(findLookalike('abcd1111111111wxyz', known)).toBeNull();
    expect(findLookalike('abcd2222222222wxy0', known)).toBeNull();
    expect(findLookalike('abcdwxyz', known)).toBeNull();
    expect(findLookalike('abcd2222222222wxyz', [{ address: 'abcdwxyz', label: 'x' }])).toBeNull();
  });
});

describe('address review challenge', () => {
  it('builds chunks and grades the retyped chunk', () => {
    const rv = buildAddressReview('abcdefghij', () => 2);
    expect(rv.chunks).toEqual(['abcd', 'efgh', 'ij']);
    expect(rv.challengeIndex).toBe(2);
    expect(rv.edge).toBe(5);
    expect(rv.promptKeys).toHaveLength(3);
    expect(gradeAddressReview('abcdefghij', rv, ' ij ')).toBe(true);
    expect(gradeAddressReview('abcdefghij', rv, 'IJ')).toBe(false);
    expect(gradeAddressReview('abcdefghij', rv, 'ik')).toBe(false);
  });
  it('hex addresses compare case-insensitively; edge capped at 6', () => {
    const rv = buildAddressReview(ADDR, () => 1);
    expect(rv.edge).toBe(6);
    expect(gradeAddressReview(ADDR, rv, 'AAA1'.toLowerCase())).toBe(false);
    expect(gradeAddressReview(ADDR, rv, rv.chunks[1]!.toUpperCase())).toBe(true);
  });
  it('rejects bad picks, unclean addresses, and mismatched review', () => {
    expect(() => buildAddressReview('abcd', () => 5)).toThrow(RangeError);
    expect(() => buildAddressReview('abcd', () => -1)).toThrow(RangeError);
    expect(() => buildAddressReview('abcd', () => 0.5)).toThrow(RangeError);
    expect(() => buildAddressReview('ab​cd', () => 0)).toThrow(RangeError);
    const rv = buildAddressReview('abcdefgh', () => 0);
    expect(gradeAddressReview('abcdefgX', rv, 'abcd')).toBe(false); // review built for another address
    expect(gradeAddressReview('abcd efgh', rv, 'abcd')).toBe(false);
    expect(gradeAddressReview('abcdefgh', { ...rv, challengeIndex: 9 }, 'abcd')).toBe(false);
  });
});
