import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAddress } from 'viem/utils';
import { checkDestinationReuse } from './destinationReuse';

const payer = '0x8ba1f109551bd432803012645ac136ddd64dba72';
const address = '0x5aeda56215b167893e80b4fe645ba6d5bab767de';
const other = '0x1111111111111111111111111111111111111111';
const invoice = { kind: 'invoice' as const, payer, invoiceDigest: 'a'.repeat(64) };
const second = { ...invoice, invoiceDigest: 'b'.repeat(64) };
const seller = { kind: 'sweep' as const, metaAddress: 'synthetic-profile-a' };

const records = new Map<string, string>();
const storage = {
  getItem: (key: string) => records.get(key) ?? null,
  setItem: (key: string, value: string) => { records.set(key, value); },
};
const persistentWrite = vi.fn();
beforeEach(() => {
  records.clear();
  persistentWrite.mockClear();
  vi.stubGlobal('window', { sessionStorage: storage, localStorage: { setItem: persistentWrite } });
});
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
    expect(getAddress(payer)).not.toBe(payer);
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
    expect(records.size).toBe(0);
  });

  it('stores only bounded tab-scoped fingerprints and tolerates denied or corrupt storage', () => {
    expect(checkDestinationReuse(seller, 84532, address, false)).toBeUndefined();
    expect(records.size).toBe(0);
    checkDestinationReuse(invoice, 84532, address, true);
    const key = 'ghostpay.destination-review.v1';
    for (const raw of [address.slice(2), payer.slice(2), invoice.invoiceDigest]) {
      expect(storage.getItem(key)).not.toContain(raw);
    }
    expect(persistentWrite).not.toHaveBeenCalled();
    for (let i = 0; i < 128; i++) checkDestinationReuse(seller, 84532, '0x' + i.toString(16).padStart(40, '0'), true);
    expect(checkDestinationReuse(invoice, 84532, address, false)).toBeUndefined();
    expect(storage.getItem(key)!.length).toBeLessThan(18_000);
    storage.setItem(key, '{');
    expect(checkDestinationReuse(invoice, 84532, address, true)).toBe('unavailable');
    expect(storage.getItem(key)).toBe('{');
    records.clear();
    checkDestinationReuse(invoice, 84532, address, true);
    vi.spyOn(storage, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(checkDestinationReuse(second, 84532, address, true)).toBe('different-invoice');
    expect(checkDestinationReuse(invoice, 84532, other, true)).toBe('unavailable');
    vi.spyOn(storage, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    expect(checkDestinationReuse(seller, 84532, address, false)).toBe('unavailable');
  });
});
