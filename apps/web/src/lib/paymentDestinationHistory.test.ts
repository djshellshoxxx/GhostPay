import { describe, expect, it } from 'vitest';
import { ATTEMPT_JOURNAL_KEY, beginAttempt, clearAttempt, finishAttempt, readAttempts, paymentHistoryNotice, rememberPaymentDestination, type AttemptInput } from './duplicateAttemptJournal';

const payer = '0xabcdef0123456789abcdef0123456789abcdef01';
const destination = '0xABcDEF0123456789AbcDeF0123456789AbcDEF02';
const fresh = '0xabcdef0123456789abcdef0123456789abcdef03';
const invoice = (n: number): string => '0x' + n.toString(16).padStart(64, '0');
const input = (n: number, chainId = 84532): AttemptInput => ({ key: invoice(n), account: payer, chainId, kind: 'payment' });
function tab() {
  const data = new Map<string, string>();
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); }, removeItem: (k: string) => { data.delete(k); } };
}

describe('local checkout destination history', () => {
  it.each([11155111, 84532, 421614, 11155420, 80002, 43113, 97])('compares the recipient bytes only within the reviewed payer and chain (%i)', (chainId) => {
    const store = tab();
    const attempt = beginAttempt(input(1, chainId), store);
    rememberPaymentDestination(attempt, destination, store);
    const next = input(2, chainId);
    expect(paymentHistoryNotice(next, '  ' + destination.toLowerCase() + '  ', store)).toBe('destination');
    expect(paymentHistoryNotice({ ...next, account: '0x' + payer.slice(2).toUpperCase() }, destination, store)).toBe('destination');
    expect(paymentHistoryNotice({ ...next, account: fresh }, destination, store)).toBeUndefined();
    expect(paymentHistoryNotice({ ...next, chainId: chainId === 84532 ? 11155111 : 84532 }, destination, store)).toBeUndefined();
    expect(paymentHistoryNotice(next, fresh, store)).toBeUndefined();
    expect(paymentHistoryNotice(next, destination.slice(0, -1), store)).toBeUndefined();
    expect(paymentHistoryNotice(input(1, chainId), fresh, store)).toBe('invoice');
    expect(paymentHistoryNotice(input(1, chainId), destination, store)).toBe('invoice-destination');
    expect([...store.data.values()].join('').toLowerCase()).not.toContain(destination.toLowerCase());
  });

  it('survives reload, handles overlapping attempts, and follows confirmed clearing', () => {
    const store = tab();
    const first = beginAttempt(input(1), store);
    const second = beginAttempt(input(2), store);
    rememberPaymentDestination(second, fresh, store);
    rememberPaymentDestination(first, destination, store);
    finishAttempt(second, invoice(3), store);
    finishAttempt(first, invoice(4), store);
    const restored = tab();
    for (const [key, value] of store.data) restored.setItem(key, value);
    expect(paymentHistoryNotice(input(3), fresh, restored)).toBe('destination');
    expect(paymentHistoryNotice(input(2), destination, restored)).toBe('destination');
    clearAttempt(first.id, true, restored);
    expect(paymentHistoryNotice(input(3), destination, restored)).toBeUndefined();
    expect(paymentHistoryNotice(input(3), fresh, restored)).toBe('destination');
    clearAttempt(second.key, true, restored);
    expect([...restored.data.keys()]).toEqual([ATTEMPT_JOURNAL_KEY]);
    expect(paymentHistoryNotice(input(1), destination, tab())).toBeUndefined();
  });

  it('ignores approvals and previews, and uses a distinct fingerprint per request', () => {
    const store = tab();
    const approval = beginAttempt({ ...input(1), kind: 'approval' }, store);
    rememberPaymentDestination(approval, destination, store);
    expect(paymentHistoryNotice(input(1), destination, store)).toBeUndefined();
    expect(paymentHistoryNotice(input(2), destination, store)).toBeUndefined();
    expect(store.data.size).toBe(1);
    for (const n of [2, 3]) rememberPaymentDestination(beginAttempt(input(n), store), destination, store);
    const tags = [...store.data].filter(([key]) => key !== ATTEMPT_JOURNAL_KEY).map(([, tag]) => tag);
    expect(new Set(tags).size).toBe(2);
    expect(paymentHistoryNotice(input(2), destination, store)).toBe('destination');
  });

  it('handles older records and advisory storage failures without changing the duplicate-attempt barrier', () => {
    const store = tab();
    const attempt = beginAttempt(input(1), store);
    const denied = { ...store, setItem: () => { throw new Error('quota'); } };
    rememberPaymentDestination(attempt, destination, denied);
    expect(paymentHistoryNotice(input(2), destination, store)).toBeUndefined();
    expect(paymentHistoryNotice(input(1), fresh, store)).toBe('invoice');
    expect(() => beginAttempt(input(1), store)).toThrow(/previous/i);
    expect(paymentHistoryNotice(input(2), fresh, { ...store, getItem: () => { throw new Error('denied'); } })).toBe('unavailable');
    expect(readAttempts(store)).toEqual([attempt]);
  });
});
