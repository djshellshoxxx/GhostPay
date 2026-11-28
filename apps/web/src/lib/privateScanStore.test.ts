import { createCipheriv, createDecipheriv, hkdfSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Address, Hex } from '@ghostpay/chain-adapters';
import type { ScanMatch } from './scanClient';
import type { ReconciliationVaultStore } from './reconciliationVault';
import { PrivateScanVault, PRIVATE_SCAN_MAX_MATCHES, isPrivateScanTombstone, ScanStateError, type PrivateScanScope, type PrivateScanState } from './privateScanStore';
import { captureSessionGuard, clearSession, importSession } from './session';

const DOMAIN = 'GhostPay/EVM/private-scan/v5';
const KEY = new Uint8Array(32).fill(19);
const HASH: Hex = `0x${'ab'.repeat(32)}`;
const ROUTER: Address = `0x${'34'.repeat(20)}`;
const SCOPE: PrivateScanScope = {
  chainId: 84532, sellerKeyId: '12'.repeat(32), announcer: `0x${'56'.repeat(20)}`,
  router: ROUTER, finalityDepth: 12, deep: false, configuration: 'selected-rpc-configuration',
};
const MATCH: ScanMatch = {
  chainId: SCOPE.chainId,
  stealthAddress: `0x${'78'.repeat(20)}`,
  announcement: {
    schemeId: 1n, stealthAddress: `0x${'78'.repeat(20)}`, caller: ROUTER,
    ephemeralPublicKey: '0x0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
    metadata: '0x01', blockNumber: 20n, blockHash: HASH, logIndex: 1,
    transactionHash: `0x${'bc'.repeat(32)}`, blockTimestamp: '1800000000', id: `${HASH}:1`,
  },
  metadata: undefined, viaRouter: true, tagMatches: true, receipt: 'verified',
};
const sample = (): PrivateScanState => ({
  startBlock: 0n, cursor: { nextBlock: 77n, last: { number: 76n, hash: HASH } },
  matches: [MATCH], routerOnlyBlocks: [33n],
});

class Store implements ReconciliationVaultStore {
  readonly values = new Map<string, string>();
  read(key: string): Promise<string | null> { return Promise.resolve(this.values.get(key) ?? null); }
  compareAndSwap(key: string, expected: string | null, next: string, guard: () => void): Promise<boolean> {
    guard();
    if ((this.values.get(key) ?? null) !== expected) return Promise.resolve(false);
    this.values.set(key, next);
    return Promise.resolve(true);
  }
}

const open = (store: Store, scope: PrivateScanScope = SCOPE, guard: () => void = () => undefined, raw = KEY.slice()) =>
  PrivateScanVault.open(scope, raw, store, guard);
const entry = (store: Store): readonly [string, string] => [...store.values][0]!;

interface Envelope { readonly version: number; readonly salt: string; readonly iv: string; readonly ciphertext: string }

/** Independent Node crypto implementation permits authenticated-invalid-plaintext tests, not only bit flips. */
function editPlaintext(store: Store, change: (value: Record<string, unknown>) => void): void {
  const [slot, encoded] = entry(store);
  const e = JSON.parse(encoded) as Envelope;
  const derived = new Uint8Array(hkdfSync('sha256', KEY, Buffer.from(e.salt, 'hex'), `${DOMAIN}/key|${slot}`, 32));
  const sealed = Buffer.from(e.ciphertext, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', derived, Buffer.from(e.iv, 'hex'));
  decipher.setAAD(Buffer.from(`${DOMAIN}|${e.version}|${slot}|${e.salt}|${e.iv}`));
  decipher.setAuthTag(sealed.subarray(-16));
  const plaintext = Buffer.concat([decipher.update(sealed.subarray(0, -16)), decipher.final()]);
  const value = JSON.parse(plaintext.toString()) as Record<string, unknown>;
  change(value);
  const cipher = createCipheriv('aes-256-gcm', derived, Buffer.from(e.iv, 'hex'));
  cipher.setAAD(Buffer.from(`${DOMAIN}|${e.version}|${slot}|${e.salt}|${e.iv}`));
  const next = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final(), cipher.getAuthTag()]);
  store.values.set(slot, JSON.stringify({ ...e, ciphertext: next.toString('hex') }));
  plaintext.fill(0); derived.fill(0);
}

describe('encrypted private seller scan journal', () => {
  it('atomically restores cursor and discoveries while discarding persisted payment authority', async () => {
    const store = new Store(); const raw = KEY.slice();
    const vault = await open(store, SCOPE, () => undefined, raw);
    expect(raw.every((b) => b === 0)).toBe(true);
    expect(await vault.load()).toBeUndefined();
    await vault.save(sample()); vault.lock();
    const restored = await open(store);
    expect(await restored.load()).toEqual({ ...sample(), matches: [{ ...MATCH, receipt: 'claimed' }] });
  });

  it('stores only an opaque private slot, encryption parameters and ciphertext', async () => {
    const store = new Store(); const vault = await open(store);
    await vault.load(); await vault.save(sample());
    const [slot, encoded] = entry(store);
    expect(slot).toMatch(/^ghostpay\.scan\.checkpoint\.v5\.[0-9a-f]{64}$/);
    expect(Object.keys(JSON.parse(encoded) as object).sort()).toEqual(['ciphertext', 'iv', 'salt', 'version']);
    const all = JSON.stringify([...store.values]);
    for (const sensitive of [SCOPE.sellerKeyId, SCOPE.configuration, ROUTER, MATCH.stealthAddress, HASH, 'nextBlock', 'matches', 'blockTimestamp', Buffer.from(KEY).toString('hex')])
      expect(all).not.toContain(sensitive);
  });

  it.each([
    { chainId: 1 }, { sellerKeyId: '90'.repeat(32) }, { deep: true }, { finalityDepth: 30 },
    { announcer: `0x${'a1'.repeat(20)}` }, { router: `0x${'b2'.repeat(20)}` },
    { configuration: 'different-selected-rpc' },
  ] satisfies readonly Partial<PrivateScanScope>[])('isolates every security-relevant scanning dimension: %j', async (change) => {
    const store = new Store(); const one = await open(store);
    await one.load(); await one.save(sample());
    const changed = await open(store, { ...SCOPE, ...change });
    expect(await changed.load()).toBeUndefined();
    await changed.forget();
    const secondSlot = [...store.values.keys()].find((key) => key !== entry(store)[0])!;
    store.values.set(secondSlot, entry(store)[1]);
    await expect(changed.load()).rejects.toMatchObject({ code: 'invalid' });
  });

  it('does not reuse another private viewing key, or plaintext v1-v4 progress', async () => {
    const store = new Store(); const one = await open(store);
    await one.load(); await one.save(sample());
    const other = await open(store, SCOPE, () => undefined, new Uint8Array(32).fill(20));
    expect(await other.load()).toBeUndefined();
    const legacy = new Store();
    for (const version of [1, 2, 3, 4]) legacy.values.set(`ghostpay.scan.checkpoint.v${version}.${SCOPE.sellerKeyId}`, '{"nextBlock":"9000"}');
    expect(await (await open(legacy)).load()).toBeUndefined();
  });

  it('requires a successful load before writing and rejects malformed progress', async () => {
    const store = new Store(); const vault = await open(store);
    await expect(vault.save(sample())).rejects.toMatchObject({ code: 'invalid' });
    await vault.load();
    const reserved = entry(store)[1];
    for (const cursor of [
      { nextBlock: -1n }, { nextBlock: 10_000_000_002n }, { nextBlock: 77n },
      { nextBlock: 77n, last: { number: 75n, hash: HASH } },
      { nextBlock: 77n, last: { number: 76n, hash: '0x1234' as Hex } },
    ]) await expect(vault.save({ ...sample(), cursor })).rejects.toMatchObject({ code: 'invalid' });
    expect(entry(store)[1]).toBe(reserved);
    expect(isPrivateScanTombstone(reserved)).toBe(true);
    await vault.save({ cursor: { nextBlock: 50n }, startBlock: 50n, matches: [] });
    expect((await vault.load())?.cursor.nextBlock).toBe(50n);
  });

  it.each(['version', 'ciphertext', 'iv', 'extra', 'json'] as const)('rejects a corrupt %s envelope and permits explicit forgetting', async (field) => {
    const store = new Store(); const vault = await open(store);
    await vault.load(); await vault.save(sample());
    const [slot, encoded] = entry(store); const e = JSON.parse(encoded) as Record<string, unknown>;
    if (field === 'version') e.version = 999;
    if (field === 'ciphertext') e.ciphertext = '00'.repeat(32);
    if (field === 'iv') e.iv = '00';
    if (field === 'extra') e.privateKey = 'test-marker';
    store.values.set(slot, field === 'json' ? 'not json' : JSON.stringify(e));
    await expect(vault.load()).rejects.toMatchObject({ code: 'invalid' });
    await expect(vault.save(sample())).rejects.toMatchObject({ code: 'invalid' });
    await vault.forget(); expect(await vault.load()).toBeUndefined();
  });

  it.each(['version', 'scope', 'cursor', 'record', 'duplicates', 'unknown'] as const)('validates authenticated %s plaintext, not merely storage-key presence', async (field) => {
    const store = new Store(); const vault = await open(store);
    await vault.load(); await vault.save(sample());
    editPlaintext(store, (plain) => {
      const state = plain.state as Record<string, unknown>;
      if (field === 'version') plain.version = 999;
      if (field === 'scope') plain.scope = '00'.repeat(32);
      if (field === 'cursor') state.cursor = { nextBlock: '77', last: { number: '4', hash: HASH } };
      if (field === 'record') (state.matches as Record<string, unknown>[])[0]!.blockHash = '0xbad';
      if (field === 'duplicates') (state.matches as unknown[]).push((state.matches as unknown[])[0]);
      if (field === 'unknown') state.secret = 'marker';
    });
    await expect(vault.load()).rejects.toMatchObject({ code: 'invalid' });
  });

  it('uses fresh random envelopes on every write and supports independent HKDF/AES-GCM verification', async () => {
    const store = new Store(); const vault = await open(store);
    await vault.load(); await vault.save(sample()); const first = entry(store)[1];
    editPlaintext(store, (plain) => {
      expect(plain.version).toBe(1);
      expect((plain.state as { cursor: unknown }).cursor).toEqual({ nextBlock: '77', last: { number: '76', hash: HASH } });
    });
    await vault.load(); await vault.save(sample());
    expect(entry(store)[1]).not.toBe(first);
  });

  it('detects concurrent writers and never drops the other tab’s discoveries', async () => {
    const store = new Store(); const one = await open(store); const two = await open(store);
    await one.load(); await two.load(); await one.save(sample());
    const before = entry(store)[1];
    await expect(two.save({ ...sample(), matches: [] })).rejects.toMatchObject({ code: 'conflict' });
    expect(entry(store)[1]).toBe(before);
    expect((await two.load())?.matches).toHaveLength(1);
  });

  it('also compare-and-swaps overlapping saves made through the same handle', async () => {
    const store = new Store(); const vault = await open(store); await vault.load();
    const results = await Promise.allSettled([vault.save(sample()), vault.save(sample())]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected');
    expect(rejected?.status === 'rejected' ? rejected.reason : undefined).toMatchObject({ code: 'conflict' });
    expect((await vault.load())?.matches).toHaveLength(1);
  });

  it('does not revive a deleted journal through stale-tab writes or tombstone ABA', async () => {
    const store = new Store(); const one = await open(store);
    await one.load(); await one.forget();
    const stale = await open(store); expect(await stale.load()).toBeUndefined();
    await one.save(sample()); await one.forget();
    await expect(stale.save(sample())).rejects.toMatchObject({ code: 'conflict' });
    const later = await open(store); await later.load(); await one.forget();
    await expect(later.save(sample())).rejects.toMatchObject({ code: 'conflict' });
    expect(await one.load()).toBeUndefined();
  });

  it('reserves an empty context before scanning so deletion invalidates a tab without saved discoveries', async () => {
    const store = new Store(); const vault = await open(store);
    expect(await vault.load()).toBeUndefined();
    expect(isPrivateScanTombstone(entry(store)[1])).toBe(true);
    const deleting = await open(store); await deleting.load(); await deleting.forget();
    await expect(vault.save(sample())).rejects.toMatchObject({ code: 'conflict' });
    expect(await deleting.load()).toBeUndefined();
  });

  it('reports a simultaneous first-open reservation conflict without overwriting either row', async () => {
    const store = new Store(); const one = await open(store); const two = await open(store);
    const results = await Promise.allSettled([one.load(), two.load()]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected');
    expect(rejected?.status === 'rejected' ? rejected.reason : undefined).toMatchObject({ code: 'conflict' });
    expect(store.values.size).toBe(1);
    expect(isPrivateScanTombstone(entry(store)[1])).toBe(true);
  });

  it('keeps the prior cursor and discoveries intact when transaction commit fails', async () => {
    const store = new Store(); const vault = await open(store);
    await vault.load(); await vault.save(sample()); const before = entry(store)[1];
    store.compareAndSwap = () => Promise.reject(new Error('sensitive storage details'));
    await expect(vault.save({ ...sample(), cursor: { nextBlock: 99n, last: { number: 98n, hash: HASH } } })).rejects.toMatchObject({ code: 'unavailable' });
    expect(entry(store)[1]).toBe(before);
  });

  it.each(['lock', 'replacement'] as const)('blocks delayed transactions after %s without exposing foreign errors', async (change) => {
    const store = new Store(); let live = true;
    const vault = await open(store, SCOPE, () => { if (!live) throw new Error('sensitive session marker'); });
    await vault.load(); const reserved = entry(store)[1]; const compare = store.compareAndSwap.bind(store);
    let entered!: () => void; const waiting = new Promise<void>((resolve) => { entered = resolve; });
    let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
    store.compareAndSwap = async (...args) => { entered(); await gate; return compare(...args); };
    const saving = vault.save(sample()); await waiting;
    if (change === 'lock') vault.lock(); else live = false;
    release(); await expect(saving).rejects.toMatchObject({ code: 'stale' });
    expect(entry(store)[1]).toBe(reserved);
    expect(isPrivateScanTombstone(reserved)).toBe(true);
    await expect(vault.load()).rejects.not.toThrow('sensitive session marker');
  });

  it('rejects the original session even after silently clearing and reinstalling identical keys', async () => {
    const keys = { spendingKeyHex: '01'.repeat(32), viewingKeyHex: '02'.repeat(32), signingKeyHex: '03'.repeat(32) };
    importSession(keys);
    try {
      const store = new Store(); const vault = await open(store, SCOPE, captureSessionGuard());
      await vault.load(); const reserved = entry(store)[1];
      clearSession(false); importSession(keys);
      await expect(vault.save(sample())).rejects.toMatchObject({ code: 'stale' });
      expect(entry(store)[1]).toBe(reserved);
      const fresh = await open(store, SCOPE, captureSessionGuard());
      expect(await fresh.load()).toBeUndefined(); await fresh.save(sample());
      expect((await fresh.load())?.matches).toHaveLength(1);
    } finally { clearSession(false); }
  });

  it('redacts read failures and tampered exported errors from an injected storage adapter', async () => {
    const store = new Store(); const vault = await open(store);
    store.read = () => Promise.reject(new Error('secret RPC or storage payload'));
    const failure = await vault.load().catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: 'unavailable' });
    expect(failure).not.toHaveProperty('cause');
    expect(String(failure)).not.toContain('secret RPC');
    store.read = Store.prototype.read.bind(store); await vault.load();
    store.compareAndSwap = () => Promise.reject(Object.assign(new ScanStateError('conflict'), { message: 'private payload', cause: 'secret' }));
    const saving = await vault.save(sample()).catch((error: unknown) => error);
    expect(saving).toMatchObject({ code: 'conflict' });
    expect(saving).not.toHaveProperty('cause');
    expect(String(saving)).not.toContain('private payload');
  });

  it('wipes supplied key bytes even when scope validation or the initial session check fails', async () => {
    for (const kind of ['scope', 'guard', 'key'] as const) {
      const raw = kind === 'key' ? new Uint8Array(31).fill(19) : KEY.slice();
      await expect(open(new Store(), kind === 'scope' ? { ...SCOPE, chainId: -1 } : SCOPE, () => {
        if (kind === 'guard') throw new Error('secret');
      }, raw)).rejects.toBeInstanceOf(ScanStateError);
      expect(raw.every((b) => b === 0)).toBe(true);
    }
  });

  it('bounds metadata, discovery count, and schema fields before encryption', async () => {
    const store = new Store(); const vault = await open(store); await vault.load();
    const reserved = entry(store)[1];
    await expect(vault.save({ ...sample(), matches: Array.from({ length: PRIVATE_SCAN_MAX_MATCHES + 1 }, () => MATCH) })).rejects.toMatchObject({ code: 'limit' });
    await expect(vault.save({ ...sample(), matches: [{ ...MATCH, announcement: { ...MATCH.announcement, metadata: `0x${'aa'.repeat(4097)}` } }] })).rejects.toMatchObject({ code: 'limit' });
    await expect(vault.save({ ...sample(), matches: [{ ...MATCH, chainId: 1 }] })).rejects.toMatchObject({ code: 'invalid' });
    expect(entry(store)[1]).toBe(reserved);
    expect(isPrivateScanTombstone(reserved)).toBe(true);
  });

  it('round-trips a large bounded journal and refuses an over-cap document without advancing', async () => {
    const store = new Store(); const vault = await open(store); await vault.load();
    const matches = (length: number): ScanMatch[] => Array.from({ length }, (_, index) => ({
      ...MATCH, announcement: { ...MATCH.announcement, logIndex: index, id: `${HASH}:${String(index)}`, metadata: `0x${'ab'.repeat(4096)}` },
    }));
    await vault.save({ ...sample(), matches: matches(200) });
    expect((await vault.load())?.matches).toHaveLength(200);
    const before = entry(store)[1];
    await expect(vault.save({ ...sample(), matches: matches(300) })).rejects.toMatchObject({ code: 'limit' });
    expect(entry(store)[1]).toBe(before);
  });
});
