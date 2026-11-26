import { describe, expect, it } from 'vitest';
import { type Contact } from './contacts.js';
import { findDuplicateGroups } from './confusables.js';

const A = '0x' + 'abcd' + '0'.repeat(32) + '1234';
const B = '0x' + 'abcd' + '9'.repeat(32) + '1234';
const C = '0x' + '5'.repeat(40);

function contact(id: string, label: string, address: string, network = 'eth'): Contact {
  return { id: id.repeat(32), label, address, network, tags: [], note: '', createdAt: 0, updatedAt: 0 };
}

describe('duplicate groups retain independent warning kinds', () => {
  it('retains a distinct-address lookalike warning even when the labels are equal', () => {
    const first = contact('1', 'Alice', A);
    const second = contact('2', 'ALICE', B);
    expect(findDuplicateGroups({ contacts: [first, second] })).toEqual([
      { kind: 'lookalike-address', contactIds: [first.id, second.id] },
      { kind: 'duplicate-label', contactIds: [first.id, second.id] },
    ]);
  });

  it('retains confusable labels even when the addresses are equal', () => {
    const first = contact('1', 'Alice', A);
    const second = contact('2', 'A1ice', A);
    expect(findDuplicateGroups({ contacts: [first, second] })).toEqual([
      { kind: 'exact-address', contactIds: [first.id, second.id] },
      { kind: 'confusable-label', contactIds: [first.id, second.id] },
    ]);
  });

  it('still suppresses redundant groups of the corresponding exact kind', () => {
    const first = contact('1', 'Alice', A);
    const second = contact('2', 'ALICE', A);
    expect(findDuplicateGroups({ contacts: [first, second] })).toEqual([
      { kind: 'exact-address', contactIds: [first.id, second.id] },
      { kind: 'duplicate-label', contactIds: [first.id, second.id] },
    ]);
  });

  it('preserves network separation and unrelated records', () => {
    const first = contact('1', 'Alice', A);
    const second = contact('2', 'ALICE', B, 'op');
    const third = contact('3', 'Bob', C);
    expect(findDuplicateGroups({ contacts: [first, second, third] })).toEqual([
      { kind: 'duplicate-label', contactIds: [first.id, second.id] },
    ]);
  });

  it('keeps a lookalike group containing a smaller exact-address subgroup', () => {
    const first = contact('1', 'Alice', A);
    const second = contact('2', 'Bob', A);
    const third = contact('3', 'Carol', B);
    expect(findDuplicateGroups({ contacts: [first, second, third] })).toEqual([
      { kind: 'exact-address', contactIds: [first.id, second.id] },
      { kind: 'lookalike-address', contactIds: [first.id, second.id, third.id] },
    ]);
  });
});
