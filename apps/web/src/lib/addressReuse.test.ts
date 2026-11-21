import { describe, expect, it } from 'vitest';
import { getAddress } from 'viem/utils';
import { LocalAddressReuseLedger, type AddressReuseCandidate, type AddressReuseScope } from './addressReuse';

const scope: AddressReuseScope = { chainId: 84532, account: '0x5555555555555555555555555555555555555555' };
const address = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
const candidate: AddressReuseCandidate = { destination: address, paymentId: '1'.repeat(64) };
const another = { ...candidate, paymentId: '2'.repeat(64) };

describe('local destination observations', () => {
  it('requires an explicitly bound wallet and never records a preview', () => {
    const ledger = new LocalAddressReuseLedger();
    expect(ledger.inspect(scope, candidate)).toBe('unavailable');
    expect(ledger.observeSubmission(scope, candidate)).toBe(false);
    expect(ledger.bind(scope)).toBe(true);
    expect(ledger.inspect(scope, candidate)).toBe('not-observed');
    expect(ledger.inspect(scope, another)).toBe('not-observed');
  });

  it('distinguishes same-payment retry, a different payment and an intended repeat', () => {
    const ledger = new LocalAddressReuseLedger(); ledger.bind(scope);
    expect(ledger.observeSubmission(scope, candidate)).toBe(true);
    expect(ledger.inspect(scope, candidate)).toBe('same-payment');
    expect(ledger.inspect(scope, another)).toBe('reused');
    expect(ledger.inspect(scope, { ...another, intent: 'repeat' })).toBe('deliberate-repeat');
    expect(ledger.observeSubmission(scope, another)).toBe(true);
    // Recording the new request must not hide the earlier distinct-invoice reuse on a retry.
    expect(ledger.inspect(scope, another)).toBe('reused');
    expect(ledger.inspect(scope, { ...another, paymentId: '3'.repeat(64) })).toBe('reused');
  });

  it('normalizes checksum case while refusing an invalid mixed-case checksum', () => {
    const ledger = new LocalAddressReuseLedger(); ledger.bind(scope);
    ledger.observeSubmission(scope, candidate);
    expect(ledger.inspect(scope, { ...another, destination: getAddress(address) })).toBe('reused');
    expect(ledger.inspect(scope, { ...another, destination: '0xAbcdefabcdefabcdefabcdefabcdefabcdefabcd' })).toBe('unavailable');
  });

  it('keeps an identical rebind but clears when account or chain scope changes', () => {
    const ledger = new LocalAddressReuseLedger(); ledger.bind(scope); ledger.observeSubmission(scope, candidate);
    ledger.bind({ ...scope });
    expect(ledger.inspect(scope, another)).toBe('reused');
    const otherChain = { ...scope, chainId: 1 };
    expect(ledger.inspect(otherChain, candidate)).toBe('unavailable');
    ledger.bind(otherChain);
    expect(ledger.inspect(otherChain, another)).toBe('not-observed');
    ledger.observeSubmission(otherChain, candidate);
    const otherAccount = { ...otherChain, account: '0x6666666666666666666666666666666666666666' };
    ledger.bind(otherAccount);
    expect(ledger.inspect(otherAccount, another)).toBe('not-observed');
    expect(ledger.inspect(otherChain, another)).toBe('unavailable');
  });

  it('preserves bounded prior evidence and labels missing history after saturation', () => {
    const ledger = new LocalAddressReuseLedger(1); ledger.bind(scope); ledger.observeSubmission(scope, candidate);
    expect(ledger.observeSubmission(scope, candidate)).toBe(true);
    expect(ledger.observeSubmission(scope, another)).toBe(false);
    expect(ledger.inspect(scope, another)).toBe('reused');
    expect(ledger.inspect(scope, { ...another, destination: '0x7777777777777777777777777777777777777777' })).toBe('limited-history');
    ledger.clear(); ledger.bind(scope);
    expect(ledger.inspect(scope, another)).toBe('not-observed');
  });

  it.each([0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])('rejects invalid chain %s without changing a valid observation', (chainId) => {
    const ledger = new LocalAddressReuseLedger(); ledger.bind(scope); ledger.observeSubmission(scope, candidate);
    expect(ledger.observeSubmission({ ...scope, chainId }, another)).toBe(false);
    expect(ledger.inspect({ ...scope, chainId }, another)).toBe('unavailable');
    expect(ledger.inspect(scope, another)).toBe('reused');
  });

  it.each(['', 'private invoice text', '0x' + '1'.repeat(64), 'a'.repeat(65), 'G'.repeat(64)])('rejects invalid payment identity %s', (paymentId) => {
    const ledger = new LocalAddressReuseLedger(); ledger.bind(scope);
    expect(ledger.inspect(scope, { ...candidate, paymentId })).toBe('unavailable');
    expect(ledger.observeSubmission(scope, { ...candidate, paymentId })).toBe(false);
  });

  it('rejects unexpected runtime shapes and invalid intent without coercion', () => {
    const ledger = new LocalAddressReuseLedger(); ledger.bind(scope);
    expect(ledger.inspect(null as unknown as AddressReuseScope, candidate)).toBe('unavailable');
    expect(ledger.observeSubmission(scope, null as unknown as AddressReuseCandidate)).toBe(false);
    expect(ledger.inspect(scope, { ...candidate, intent: 'invalid' } as unknown as AddressReuseCandidate)).toBe('unavailable');
    expect(ledger.inspect(scope, { ...candidate, destination: 123 } as unknown as AddressReuseCandidate)).toBe('unavailable');
    expect(ledger.bind({ ...scope, account: 'invalid' })).toBe(false);
    expect(ledger.inspect(scope, candidate)).toBe('unavailable');
  });

  it.each([0, -1, 257, NaN, 1.5])('rejects an invalid observation capacity %s', (capacity) => {
    expect(() => new LocalAddressReuseLedger(capacity)).toThrow('Invalid local address observation limit.');
  });
});
