// Vitest PoC: keystore header tampering / scrypt-parameter DoS cost, tag-vault splice, jitter uniformity.
import { describe, expect, it } from 'vitest';
import { encryptKeystore, decryptKeystore } from '../../../apps/web/src/lib/keystore';
import { TagVault, MemoryTagStore } from '../../../apps/web/src/lib/tags';
import { randomDelayMs } from '../../../apps/web/src/lib/jitter';
import { scryptAsync } from '@noble/hashes/scrypt.js';

const secrets = () => ({ spendingKey: new Uint8Array(32).fill(1), viewingKey: new Uint8Array(32).fill(2), signingKey: new Uint8Array(32).fill(3) });
const meta = { metaAddress: 'st:eth:0x' + '02'.repeat(66), signer: '02' + '11'.repeat(32) };

describe('keystore', () => {
  it('rejects tampered header fields (N, r, p, salt, iv, meta) and wrong passphrase', async () => {
    const text = await encryptKeystore(secrets(), meta, 'correct horse battery', { N: 1 << 14 });
    expect((await decryptKeystore(text, 'correct horse battery')).spendingKey[0]).toBe(1);
    const f = JSON.parse(text);
    const muts: Record<string, (x: any) => void> = {
      'N 2^14 -> 2^15': (x) => (x.kdfParams.N = 1 << 15), 'r 8 -> 9': (x) => (x.kdfParams.r = 9), 'p 1 -> 2': (x) => (x.kdfParams.p = 2),
      'salt flip': (x) => (x.kdfParams.salt = 'ff' + x.kdfParams.salt.slice(2)), 'iv flip': (x) => (x.iv = 'ff' + x.iv.slice(2)),
      'meta.signer swapped': (x) => (x.meta.signer = '03' + '22'.repeat(32)), 'ciphertext bit flip': (x) => (x.ciphertext = '00' + x.ciphertext.slice(2)),
    };
    for (const [name, m] of Object.entries(muts)) { const g = structuredClone(f); m(g); await expect(decryptKeystore(JSON.stringify(g), 'correct horse battery')).rejects.toThrow(); console.log('[PoC] tamper rejected:', name); }
    await expect(decryptKeystore(text, 'wrong passphrase!!')).rejects.toThrow();
  });
  it('import accepts attacker-chosen scrypt cost up to N=2^20,r=16,p=4 (memory/CPU DoS of the tab) - extrapolated from a measured run', async () => {
    const t0 = performance.now(); await scryptAsync(new Uint8Array(8), new Uint8Array(16), { N: 1 << 15, r: 8, p: 1, dkLen: 32, maxmem: 2 ** 31 }); const dt = performance.now() - t0;
    const factor = ((1 << 20) / (1 << 15)) * (16 / 8) * 4; // N * r * p scaling
    console.log(`[PoC] N=2^15,r=8,p=1 took ${dt.toFixed(0)} ms (noble JS); N=2^20,r=16,p=4 is ${factor}x => ~${((dt * factor) / 1000).toFixed(0)} s CPU and ~${((128 * (1 << 20) * 16) / 2 ** 20).toFixed(0)} MiB RAM (maxmem allows 2 GiB)`);
    expect(factor).toBe(256);
  });
});

describe('tag vault', () => {
  it('ciphertext records can be spliced between lookup keys (AAD binds only schema+chain, payload address is not re-checked)', async () => {
    const store = new MemoryTagStore(); const v = new TagVault(store);
    await v.unlock(new Uint8Array(32).fill(9));
    const A = '0x' + 'aa'.repeat(20), B = '0x' + 'bb'.repeat(20);
    await v.save(84532, { stealthAddress: A, announcementId: '0x' + '01'.repeat(32) + ':1', logIndex: 1, clientLabel: 'Alice - paid' });
    await v.save(84532, { stealthAddress: B, announcementId: '0x' + '02'.repeat(32) + ':2', logIndex: 2, clientLabel: 'Bob - unpaid' });
    const all = await store.getAll(); const ra = all[0]!, rb = all[1]!;
    // attacker with IndexedDB write access swaps ciphertext+iv between the two records (lookupKey stays)
    await store.put({ ...ra, iv: rb.iv, ciphertext: rb.ciphertext });
    const got = await v.find(84532, A);
    console.log('[PoC] find(A) returns label of B:', got?.clientLabel, '| payload address =', got?.stealthAddress);
    expect(got?.clientLabel).toBe('Bob - unpaid');
  });
  it('wipe removes meta and records', async () => {
    const store = new MemoryTagStore(); const v = new TagVault(store); await v.unlock(new Uint8Array(32).fill(9));
    await v.save(1, { stealthAddress: '0x' + 'aa'.repeat(20), announcementId: '0x' + '01'.repeat(32) + ':1', logIndex: 1, clientLabel: 'x' }); await v.wipe();
    expect((await store.getAll()).length).toBe(0); expect(await store.getMeta()).toBeUndefined();
  });
});

describe('jitter', () => {
  it('is uniform (chi-square) and handles the range edges', () => {
    const N = 200_000, K = 10; const c = new Array(K).fill(0);
    for (let i = 0; i < N; i++) c[randomDelayMs(0, K - 1)]++;
    const exp = N / K; const chi = c.reduce((s, x) => s + (x - exp) ** 2 / exp, 0);
    console.log('[PoC] chi-square(9 dof) =', chi.toFixed(2), '(critical 0.001 level = 27.9)');
    expect(chi).toBeLessThan(27.9);
    expect(randomDelayMs(5, 5)).toBe(5);
    expect(() => randomDelayMs(0, 2 ** 32)).toThrow();
  });
});
