import { createScanState, recordScannedBlock, type ScanState } from '@ghostpay/btc-silent-payments';
import { describe, expect, it } from 'vitest';
import { createDecipheriv, hkdfSync } from 'node:crypto';
import type { ReconciliationVaultStore } from '../../lib/reconciliationVault';
import { BtcScanVault } from './scanStore';
import { walletA } from './fixtures.testutil';
import { walletFromSeedHex, wipeWallet } from './wallet';
import { btcNetwork } from './network';

class Store implements ReconciliationVaultStore {
  readonly values = new Map<string, string>();
  read(key: string): Promise<string | null> { return Promise.resolve(this.values.get(key) ?? null); }
  compareAndSwap(key: string, expected: string | null, next: string, guard: () => void): Promise<boolean> {
    guard();
    if ((this.values.get(key) ?? null) !== expected) return Promise.resolve(false);
    this.values.set(key, next); return Promise.resolve(true);
  }
}
const sample = (): ScanState => recordScannedBlock(createScanState('regtest', 1), 1, 'ab'.repeat(32), []);

describe('encrypted BTC scan continuity', () => {
  it('reloads through a fresh vault without persisting keys or plaintext state', async () => {
    const store = new Store(); const wallet = walletA();
    const first = await BtcScanVault.open(wallet, store, () => undefined);
    expect(await first.load()).toBeUndefined();
    await first.save(sample()); first.lock();
    const bytes = JSON.stringify([...store.values]);
    expect(bytes).not.toContain('lastHeight'); expect(bytes).not.toContain('ab'.repeat(32));
    expect(bytes).not.toContain(wallet.address);
    const second = await BtcScanVault.open(wallet, store, () => undefined);
    expect(await second.load()).toEqual(sample());
  });

  it('binds encrypted continuity to the exact source policy without exposing its URLs', async () => {
    const store = new Store(); const wallet = walletA();
    const policy = 'https://private-source.test|http|light';
    const first = await BtcScanVault.open(wallet, store, () => undefined, policy);
    await first.load(); await first.save(sample()); first.lock();
    expect(JSON.stringify([...store.values])).not.toContain('private-source');
    const same = await BtcScanVault.open(wallet, store, () => undefined, policy);
    expect(await same.load()).toEqual(sample());
    const defaultMode = await BtcScanVault.open(wallet, store, () => undefined);
    expect(await defaultMode.load()).toBeUndefined();
    const other = await BtcScanVault.open(wallet, store, () => undefined, policy + '|second');
    expect(await other.load()).toBeUndefined(); await other.save(sample());
    const entries = [...store.values]; store.values.set(entries[1]![0], entries[0]![1]);
    await expect(other.load()).rejects.toThrow(); same.lock(); defaultMode.lock(); other.lock();
    await expect(BtcScanVault.open(wallet, store, () => undefined, 'x'.repeat(8193))).rejects.toThrow();
  });

  it('uses independently verifiable domain-separated HKDF/AES-GCM with fresh ciphertext', async () => {
    const store = new Store(); const wallet = walletA();
    const vault = await BtcScanVault.open(wallet, store, () => undefined);
    await vault.load(); await vault.save(sample());
    const encoded = [...store.values.values()][0]!;
    const e = JSON.parse(encoded) as { version: number; scope: string; salt: string; iv: string; ciphertext: string };
    const domain = 'GhostPay/BTC/scan-state/v1';
    const key = hkdfSync('sha256', wallet.keys.scanSecret, Buffer.from(e.salt, 'hex'), `${domain}:${e.scope}`, 32);
    const ciphertext = Buffer.from(e.ciphertext, 'hex');
    const decipher = createDecipheriv('aes-256-gcm', new Uint8Array(key), Buffer.from(e.iv, 'hex'));
    decipher.setAAD(Buffer.from(`${domain}:${e.version}:${e.scope}:${e.salt}:${e.iv}`));
    decipher.setAuthTag(ciphertext.subarray(-16));
    const plain = Buffer.concat([decipher.update(ciphertext.subarray(0, -16)), decipher.final()]);
    expect(JSON.parse(plain.toString())).toEqual(sample()); plain.fill(0); new Uint8Array(key).fill(0);
    await vault.save(sample()); expect([...store.values.values()][0]).not.toBe(encoded);
  });

  it('separates wallet/network scopes and rejects swapped or corrupt ciphertext', async () => {
    const store = new Store(); const wallet = walletA();
    const vault = await BtcScanVault.open(wallet, store, () => undefined);
    await vault.load(); await vault.save(sample());
    const other = walletFromSeedHex('02'.repeat(32), btcNetwork('regtest'));
    const otherVault = await BtcScanVault.open(other, store, () => undefined);
    expect(await otherVault.load()).toBeUndefined();
    const networkVault = await BtcScanVault.open({ ...wallet, net: btcNetwork('signet') }, store, () => undefined);
    expect(await networkVault.load()).toBeUndefined();
    await expect(vault.save(createScanState('signet', 1))).rejects.toThrow();
    await otherVault.save(sample());
    const [key, text] = [...store.values][0]!;
    const [otherKey] = [...store.values][1]!;
    store.values.set(otherKey, text);
    await expect(otherVault.load()).rejects.toThrow();
    store.values.set(key, text.slice(0, -2) + '??');
    await expect(vault.load()).rejects.toThrow(); wipeWallet(other);
  });

  it('refuses stale writes after lock, session replacement and concurrent tab writes', async () => {
    const store = new Store(); const wallet = walletA(); let live = true;
    const guard = (): void => { if (!live) throw new Error('stale session'); };
    const one = await BtcScanVault.open(wallet, store, guard);
    const two = await BtcScanVault.open(wallet, store, () => undefined);
    await one.load(); await two.load(); await one.save(sample());
    await expect(two.save(sample())).rejects.toThrow();
    const before = JSON.stringify([...store.values]); live = false;
    await expect(one.save(sample())).rejects.toThrow('stale session');
    expect(JSON.stringify([...store.values])).toBe(before);
    two.lock(); await expect(two.load()).rejects.toThrow();
  });

  it('does not commit an encrypted write after a delayed save loses its session', async () => {
    const store = new Store(); const wallet = walletA(); let live = true;
    const vault = await BtcScanVault.open(wallet, store, () => { if (!live) throw new Error('stale session'); });
    await vault.load();
    const original = store.compareAndSwap.bind(store);
    let ready: () => void = () => undefined; const entered = new Promise<void>((resolve) => { ready = resolve; });
    let release: () => void = () => undefined; const gate = new Promise<void>((resolve) => { release = resolve; });
    store.compareAndSwap = async (...args) => { ready(); await gate; return original(...args); };
    const saving = vault.save(sample()); await entered; live = false; release();
    await expect(saving).rejects.toThrow('stale session'); expect(store.values.size).toBe(0);
  });

  it('invalidates a stale tab across multiple save/forget cycles (no tombstone ABA)', async () => {
    const store = new Store(); const wallet = walletA();
    const one = await BtcScanVault.open(wallet, store, () => undefined);
    await one.load(); await one.forget();
    const stale = await BtcScanVault.open(wallet, store, () => undefined); await stale.load();
    await one.save(sample()); await one.forget();
    await expect(stale.save(sample())).rejects.toThrow();
    const staleAgain = await BtcScanVault.open(wallet, store, () => undefined); await staleAgain.load();
    await one.forget();
    await expect(staleAgain.save(sample())).rejects.toThrow();
  });

  it('forgets with a compare-and-swap tombstone and cannot revive a stale tab', async () => {
    const store = new Store(); const wallet = walletA();
    const one = await BtcScanVault.open(wallet, store, () => undefined);
    await one.load(); await one.save(sample());
    const stale = await BtcScanVault.open(wallet, store, () => undefined); await stale.load();
    await one.forget(); expect(await one.load()).toBeUndefined();
    await expect(stale.save(sample())).rejects.toThrow();
    expect(JSON.stringify([...store.values])).not.toContain('lastHeight');
  });
});
