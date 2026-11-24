// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAddress } from 'viem/utils';
import { checkDestinationReuse } from './destinationReuse';

const payer = '0xde709f2102306220921060314715629080e2fb77';
const address = '0x5aeda56215b167893e80b4fe645ba6d5bab767de';
const other = '0x1111111111111111111111111111111111111111';
const invoice = { kind: 'invoice' as const, payer, invoiceDigest: 'a'.repeat(64) };
const second = { ...invoice, invoiceDigest: 'b'.repeat(64) };
const seller = { kind: 'sweep' as const, metaAddress: 'synthetic-profile-a' };

beforeEach(() => { sessionStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('local EVM destination history', () => {
  it('compares complete normalized addresses, prioritizing distinct signed invoices over a retry', () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(checkDestinationReuse(invoice, 84532, address, true)).toBeUndefined();
    expect(checkDestinationReuse(invoice, 84532, getAddress(address), true)).toBe('same-invoice');
    expect(checkDestinationReuse(second, 84532, other, true)).toBeUndefined();
    expect(checkDestinationReuse(second, 84532, address, true)).toBe('different-invoice');
    expect(checkDestinationReuse(invoice, 84532, address, true)).toBe('different-invoice');
    expect(checkDestinationReuse(second, 84532, address.slice(0, -1) + 'f', true)).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('separates payers, sellers, and networks and canonicalizes payer case', () => {
    for (const chain of [84532, 11155111]) {
      expect(checkDestinationReuse(invoice, chain, address, true)).toBeUndefined();
      expect(checkDestinationReuse({ ...second, payer: getAddress(payer) }, chain, address, false)).toBe('different-invoice');
      expect(checkDestinationReuse({ ...invoice, payer: other }, chain, address, false)).toBeUndefined();
      expect(checkDestinationReuse(seller, chain, address, false)).toBeUndefined();
      expect(checkDestinationReuse(seller, chain, address, true)).toBeUndefined();
      expect(checkDestinationReuse(seller, chain, '  ' + getAddress(address) + ' ', false)).toBe('repeat-sweep');
      expect(checkDestinationReuse({ ...seller, metaAddress: 'synthetic-profile-b' }, chain, address, false)).toBeUndefined();
    }
  });

  it('rejects malformed input without storing a record', () => {
    for (const bad of ['0x123', address.slice(0, -2) + 'zz', '0X' + address.slice(2),
      '0x5Aeda56215b167893e80b4fe645ba6d5bab767de', address + '0']) {
      expect(checkDestinationReuse(invoice, 84532, bad, true)).toBeUndefined();
    }
    expect(checkDestinationReuse(invoice, NaN, address, true)).toBeUndefined();
    expect(checkDestinationReuse({ ...invoice, payer: 'wrong' }, 84532, address, true)).toBeUndefined();
    expect(sessionStorage.length).toBe(0);
  });

  it('stores only bounded tab-scoped fingerprints and tolerates denied or corrupt storage', () => {
    expect(checkDestinationReuse(seller, 84532, address, false)).toBeUndefined();
    expect(sessionStorage.length).toBe(0);
    checkDestinationReuse(invoice, 84532, address, true);
    const key = sessionStorage.key(0)!;
    for (const raw of [address.slice(2), payer.slice(2), invoice.invoiceDigest]) {
      expect(sessionStorage.getItem(key)).not.toContain(raw);
    }
    expect(localStorage.getItem(key)).toBeNull();
    for (let i = 0; i < 128; i++) checkDestinationReuse(seller, 84532, '0x' + i.toString(16).padStart(40, '0'), true);
    expect(checkDestinationReuse(invoice, 84532, address, false)).toBeUndefined();
    expect(sessionStorage.getItem(key)!.length).toBeLessThan(18_000);
    sessionStorage.setItem(key, '{');
    expect(checkDestinationReuse(invoice, 84532, address, true)).toBe('unavailable');
    expect(sessionStorage.getItem(key)).toBe('{');
    sessionStorage.clear();
    checkDestinationReuse(invoice, 84532, address, true);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(checkDestinationReuse(second, 84532, address, true)).toBe('different-invoice');
    expect(checkDestinationReuse(invoice, 84532, other, true)).toBe('unavailable');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    expect(checkDestinationReuse(seller, 84532, address, false)).toBe('unavailable');
  });
});
