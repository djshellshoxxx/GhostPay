import { describe, expect, it } from 'vitest';
import { checkDeployment, deploymentProblem } from './deployment';
import { decryptKeystore, encryptKeystore, passphraseProblem, passphraseStrength } from './keystore';
import { sanitizeDisplayText } from './sanitize';
import { DEFAULT_SETTINGS, sanitizeSettings } from './settings';
import { MemoryTagStore, TagVault } from './tags';
import { walletWarnings, discoverWallets, type WalletInfo, type WindowLike } from './wallet';
import { fakeManifest, fakeVerified } from '../test/fakeManifest';
import { mockRpc } from '../test/mockRpc';

describe('S3-13: keystore import ceilings and passphrase policy', () => {
  const META = { metaAddress: 'st:eth:0xabc', signer: '02' + 'ab'.repeat(32) };
  const secrets = { spendingKey: new Uint8Array(32).fill(1), viewingKey: new Uint8Array(32).fill(2), signingKey: new Uint8Array(32).fill(3) };

  it('rejects attacker-chosen scrypt costs above the export profile BEFORE deriving anything', async () => {
    const good = JSON.parse(await encryptKeystore(secrets, META, 'correct horse battery', { N: 1 << 14 })) as { kdfParams: Record<string, number> };
    const t0 = Date.now();
    for (const [k, v] of [['N', 1 << 19], ['N', 1 << 20], ['r', 9], ['r', 16], ['p', 3], ['p', 4]] as const) {
      const f = structuredClone(good);
      f.kdfParams[k] = v;
      await expect(decryptKeystore(JSON.stringify(f), 'correct horse battery')).rejects.toThrow(/not a valid GhostPay keystore/);
    }
    expect(Date.now() - t0).toBeLessThan(2000); // none of them paid for a derivation
  });
  it('still accepts the export profile bounds (N up to 2^18, r up to 8, p up to 2)', async () => {
    const good = JSON.parse(await encryptKeystore(secrets, META, 'correct horse battery', { N: 1 << 14 })) as { kdfParams: Record<string, number> };
    const f = structuredClone(good);
    f.kdfParams['p'] = 2; // changes the AAD-bound params, so it fails authentication, but must get past the ceiling
    await expect(decryptKeystore(JSON.stringify(f), 'correct horse battery')).rejects.toThrow(/Wrong passphrase/);
  });
  it('estimates strength and enforces 14 characters', () => {
    expect(passphraseStrength('short')).toMatchObject({ score: 0, label: 'too short' });
    expect(passphraseStrength('aaaaaaaaaaaaaaaa').score).toBe(1);
    expect(passphraseStrength('passwordpassword').score).toBe(1);
    expect(passphraseStrength('12345678901234').score).toBe(1);
    expect(passphraseStrength('a long passphrase').score).toBeGreaterThanOrEqual(2);
    expect(passphraseStrength('correct horse battery staple')).toMatchObject({ score: 4, label: 'strong' });
    expect(passphraseProblem('1234567890123')).toMatch(/at least 14/);
    expect(passphraseProblem('aaaaaaaaaaaaaaaa')).toMatch(/too easy to guess/);
    expect(passphraseProblem('correct horse battery staple')).toBeUndefined();
  });
  it('counts characters, not UTF-16 units', () => {
    expect(passphraseStrength('😀'.repeat(7)).label).toBe('too short');
  });
});

describe('S3-12: display sanitiser', () => {
  it('makes bidi, zero-width, tag and private-use characters visible', () => {
    const s = sanitizeDisplayText('pay‮evil⁦x​y\u{E0041}z');
    expect(s.text).toBe('pay⟨U+202E⟩evil⟨U+2066⟩x⟨U+200B⟩y⟨U+E0041⟩z⟨U+E000⟩');
    expect(s.replaced).toBe(5);
  });
  it('leaves ordinary text, emoji and accents alone', () => {
    const s = sanitizeDisplayText('Café 日本語 – ok');
    expect(s).toEqual({ text: 'Café 日本語 – ok', replaced: 0, mixedScript: false });
  });
  it('flags a word that mixes Latin with Cyrillic or Greek (lookalikes)', () => {
    expect(sanitizeDisplayText('pаypal').mixedScript).toBe(true); // Cyrillic "а"
    expect(sanitizeDisplayText('Привет world').mixedScript).toBe(false); // separate words in separate alphabets
    expect(sanitizeDisplayText('αβγ x').mixedScript).toBe(false);
  });
});

describe('S3-22: wallet picker', () => {
  const w = (over: Partial<WalletInfo> & { id: string; name: string }): WalletInfo => ({ kind: 'eip6963', provider: { request: () => Promise.resolve(null) }, rdns: 'io.example', ...over });
  it('warns about duplicate names, lookalikes, non-ASCII and a missing rdns', () => {
    const list = [
      w({ id: 'a', name: 'MetaMask', rdns: 'io.metamask' }),
      w({ id: 'b', name: 'metamask', rdns: 'evil.example' }),
      w({ id: 'c', name: 'Wаllet' }), // Cyrillic a
      w({ id: 'd', name: 'Wället' }),
      w({ id: 'e', name: 'Plain' }),
      w({ id: 'f', name: 'NoRdns' }),
      w({ id: 'g', name: 'Spoof', conflict: true }),
    ];
    delete (list[5] as { rdns?: string }).rdns;
    const m = walletWarnings(list);
    expect(m.get('a')?.[0]).toMatch(/same name/);
    expect(m.get('b')?.[0]).toMatch(/same name/);
    expect(m.get('c')?.join(' ')).toMatch(/different alphabets/);
    expect(m.get('d')?.join(' ')).toMatch(/non-ASCII/);
    expect(m.has('e')).toBe(false);
    expect(m.get('f')?.join(' ')).toMatch(/reverse-DNS/);
    expect(m.get('g')?.join(' ')).toMatch(/announced twice/);
    expect(walletWarnings([{ id: 'injected', name: 'Browser wallet', kind: 'injected', provider: { request: () => Promise.resolve(null) } }]).size).toBe(0);
  });

  it('strips format characters from announced names and flags a uuid announced twice with a different identity', async () => {
    const listeners: ((e: Event) => void)[] = [];
    const win: WindowLike = {
      addEventListener: (_t, l) => { listeners.push(l); },
      removeEventListener: () => undefined,
      dispatchEvent: () => {
        const provider = { request: () => Promise.resolve(null) };
        const announce = (info: Record<string, unknown>): void => {
          for (const l of listeners) l(new CustomEvent('eip6963:announceProvider', { detail: { info, provider } }));
        };
        announce({ uuid: 'u1', name: 'Real‮Wallet', rdns: 'io.real' });
        announce({ uuid: 'u1', name: 'Real‮Wallet', rdns: 'io.real' }); // identical repeat: fine
        announce({ uuid: 'u2', name: 'Other', rdns: 'io.other' });
        announce({ uuid: 'u2', name: 'Imposter', rdns: 'evil.example' });
        return true;
      },
    };
    const list = await discoverWallets(win, 0);
    expect(list.find((x) => x.id === '6963:u1')).toMatchObject({ name: 'RealWallet' });
    expect(list.find((x) => x.id === '6963:u1')?.conflict).toBeUndefined();
    const u2 = list.find((x) => x.id === '6963:u2');
    expect(u2).toMatchObject({ name: 'Other', conflict: true });
  });
});

describe('S3-16: tag vault record binding', () => {
  const key = (): Uint8Array => new Uint8Array(32).fill(7);
  const A = '0x' + 'aa'.repeat(20);
  const B = '0x' + 'bb'.repeat(20);
  const payload = (addr: string, label: string, n: number) => ({ stealthAddress: addr, announcementId: `0x${n.toString(16).padStart(64, '0')}:0`, logIndex: 0, clientLabel: label });

  it('refuses ciphertext spliced between two records of the same chain', async () => {
    const store = new MemoryTagStore();
    const vault = new TagVault(store);
    await vault.unlock(key());
    await vault.save(84532, payload(A, 'Alice', 1));
    await vault.save(84532, payload(B, 'Bob', 2));
    const all = await store.getAll();
    const a = all.find((r) => r.recordId !== all[0]?.recordId) ?? all[1];
    const b = all[0];
    if (a === undefined || b === undefined) throw new Error('setup');
    // Attacker with write access to IndexedDB swaps iv + ciphertext between the two records.
    await store.put({ ...a, iv: b.iv, ciphertext: b.ciphertext });
    await store.put({ ...b, iv: a.iv, ciphertext: a.ciphertext });
    await expect(vault.find(84532, A)).rejects.toThrow(/could not be decrypted/);
    await expect(vault.find(84532, B)).rejects.toThrow(/could not be decrypted/);
  });
  it('refuses a copy of a record registered under another address\'s lookup token', async () => {
    const store = new MemoryTagStore();
    const vault = new TagVault(store);
    await vault.unlock(key());
    await vault.save(84532, payload(A, 'Alice', 1));
    await vault.save(84532, payload(B, 'Bob', 2));
    const all = await store.getAll();
    const alice = all[0];
    const bob = all[1];
    if (alice === undefined || bob === undefined) throw new Error('setup');
    // The attacker replaces Bob's record with Alice's ciphertext under Bob's lookup token and record id.
    await store.put({ ...alice, recordId: bob.recordId, lookupKey: bob.lookupKey });
    const bobAddress = (await vault.find(84532, A).catch(() => undefined)) === undefined ? A : B;
    await expect(vault.find(84532, bobAddress === A ? A : B)).rejects.toThrow(/could not be decrypted|does not belong/);
  });
  it('round-trips normally and still lists every record', async () => {
    const vault = new TagVault(new MemoryTagStore());
    await vault.unlock(key());
    await vault.save(84532, payload(A, 'Alice', 1));
    await vault.save(84532, payload(A, 'Alice again', 1));
    expect((await vault.find(84532, A))?.clientLabel).toBe('Alice again');
    expect(await vault.list(84532)).toHaveLength(1);
  });
});

describe('S3-14: second provider setting', () => {
  it('keeps valid secondary RPC URLs and drops junk', () => {
    const s = sanitizeSettings({ rpcUrls: { '84532': 'https://a.test' }, secondaryRpcUrls: { '84532': 'https://b.test', '1': 'http://insecure.test', x: 'https://c.test', '5': 7 } });
    expect(s.rpcUrlsSecondary).toEqual({ '84532': 'https://b.test/' });
    expect(DEFAULT_SETTINGS.rpcUrlsSecondary).toEqual({});
    expect(sanitizeSettings(null).rpcUrlsSecondary).toEqual({});
  });
});

describe('S3-01: deployment check', () => {
  const m = fakeManifest(84532);
  const rpc = mockRpc(84532, () => null);
  it('is verified only when the read-back succeeds; the values come from the chain', async () => {
    const r = await checkDeployment(m, rpc, undefined, () => Promise.resolve({ ...fakeVerified(m), feeRecipient: '0x9999999999999999999999999999999999999999', providers: 1 }));
    expect(r.status === 'verified' && r.verified.feeRecipient).toBe('0x9999999999999999999999999999999999999999');
    expect(deploymentProblem(r)).toBeUndefined();
  });
  it('passes the second provider through', async () => {
    let seen: unknown;
    await checkDeployment(m, rpc, mockRpc(84532, () => null), (_m, _c, o) => { seen = o?.secondary; return Promise.resolve(fakeVerified(m)); });
    expect(seen).toBeDefined();
  });
  it('fails closed with a fixed-form reason, and reports no RPC', async () => {
    const failing = (): Promise<never> => Promise.reject(Object.assign(new Error('DEPLOYMENT_UNVERIFIED: router code hash differs from the manifest'), { name: 'ChainAdapterError' }));
    const bad = await checkDeployment(m, rpc, undefined, failing);
    expect(bad).toEqual({ status: 'unverified', reason: 'router code hash differs from the manifest' });
    expect(deploymentProblem(bad)).toMatch(/Payments are disabled/);
    const weird = await checkDeployment(m, rpc, undefined, () => Promise.reject(new Error('https://secret@rpc.example/leak')));
    expect(JSON.stringify(weird)).not.toMatch(/secret|leak/);
    expect(await checkDeployment(m, undefined, undefined)).toEqual({ status: 'no-rpc' });
    expect(deploymentProblem({ status: 'no-rpc' })).toMatch(/Configure an RPC/);
    expect(deploymentProblem('checking')).toMatch(/Checking/);
    expect(deploymentProblem(undefined)).toMatch(/Checking/);
  });
});
