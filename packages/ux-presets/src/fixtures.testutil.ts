import type { PayContext, PaymentRecord, Preset } from './types.js';
import type { StorageAdapter } from './store.js';

/** Exact fake data only; the "addresses" are not real on any chain. */
export const ADDR_A = 'addr_alice_0001';
export const ADDR_B = 'addr_mallory_0002';

export const validateFake = (_chain: string, a: string): boolean => /^addr_[a-z]+_[0-9]{4}$/.test(a);

export const NOW = 1_800_000_000_000;

export const record = (o: Partial<PaymentRecord> = {}): PaymentRecord => ({
  id: 'pay_1',
  payeeRef: 'contact:alice',
  address: ADDR_A,
  chain: 'eip155:1',
  asset: 'native',
  amount: 1_500_000_000_000_000_000n,
  fee: 2_100_000_000_000n,
  privacyProfile: 'standard',
  memo: 'rent',
  addressRisk: 'low',
  paidAt: NOW - 86_400_000,
  ...o,
});

export const ctx = (o: Partial<PayContext> = {}): PayContext => ({
  now: NOW,
  resolvedAddress: ADDR_A,
  addressRisk: 'low',
  quotedFee: 2_100_000_000_000n,
  validateAddress: validateFake,
  ...o,
});

export const preset = (o: Partial<Preset> = {}): Preset => ({
  id: 'preset_1',
  label: 'Rent',
  payeeRef: 'contact:alice',
  chain: 'eip155:1',
  asset: 'native',
  amountRule: { kind: 'fixed', amount: 1_500_000_000_000_000_000n },
  privacyProfile: 'standard',
  memo: 'rent',
  createdAt: NOW - 1000,
  updatedAt: NOW,
  ...o,
});

export class MemStorage implements StorageAdapter {
  readonly data = new Map<string, string>();
  failGet = false;
  failPut = false;
  puts = 0;
  get(slot: string): Promise<string | null> {
    if (this.failGet) return Promise.reject(new Error('secret-path-detail'));
    return Promise.resolve(this.data.get(slot) ?? null);
  }
  put(slot: string, value: string): Promise<void> {
    if (this.failPut) return Promise.reject(new Error('secret-path-detail'));
    this.puts++;
    this.data.set(slot, value);
    return Promise.resolve();
  }
}

export const keyBytes = (fill: number): Uint8Array => new Uint8Array(32).fill(fill);
