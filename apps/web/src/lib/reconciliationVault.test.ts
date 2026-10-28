import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { userMessage } from './errors';
import { describe, expect, it } from 'vitest';
import { ReconciliationVault, MAX_VAULT_BYTES, type ReconciliationVaultStore } from './reconciliationVault';
import { MAX_RECONCILIATION_RECORDS, type ReconciliationRecord } from './reconciliationLedger';

class Store implements ReconciliationVaultStore {
  readonly data = new Map<string, string>();
  read(key: string): Promise<string | null> {
    return Promise.resolve(this.data.get(key) ?? null);
  }
  compareAndSwap(key: string, expected: string | null, next: string, guard: () => void): Promise<boolean> {
    guard();
    if ((this.data.get(key) ?? null) !== expected) return Promise.resolve(false);
    this.data.set(key, next);
    return Promise.resolve(true);
  }
}
const scope = { sellerKeyId: 'a'.repeat(64), chainId: 84532 };
const record: ReconciliationRecord = {
  version: 1,
  sellerKeyId: scope.sellerKeyId,
  chainId: scope.chainId,
  transactionHash: `0x${'b'.repeat(64)}`,
  blockHash: `0x${'c'.repeat(64)}`,
  blockNumber: '123',
  stealthAddress: `0x${'d'.repeat(40)}`,
  logIndex: 4,
  asset: 'native',
  amountMinorUnits: '42',
  viewTagMatched: true,
  recordedAt: 1800000000000,
  evidenceStatus: 'verified-at-scan',
  evidenceSource: 'verified-router-scan',
  id: `${scope.sellerKeyId}:${scope.chainId}:0x${'b'.repeat(64)}:0x${'d'.repeat(40)}:0x${'c'.repeat(64)}:4`,
};
/** The chain now has another block at every height: each stored observation is orphaned. */
const orphanedEverywhere = (): Promise<string> => Promise.resolve(`0x${'9'.repeat(64)}`);
/** The same observation in another block. */
function variant(block: number, hashChar: string, over: Partial<ReconciliationRecord> = {}): ReconciliationRecord {
  const blockHash = `0x${hashChar.repeat(64)}`;
  return {
    ...record,
    blockNumber: String(block),
    blockHash,
    id: `${scope.sellerKeyId}:${scope.chainId}:${record.transactionHash}:${record.stealthAddress}:${blockHash}:4`,
    ...over,
  };
}
async function unlocked(store = new Store(), guard = (): void => undefined, now?: () => number): Promise<ReconciliationVault> {
  const vault = new ReconciliationVault(store, scope, guard, now);
  const key = new Uint8Array(32).fill(7);
  await vault.unlock(key);
  expect(key.every((b) => b === 0)).toBe(true);
  return vault;
}

function encryptBody(template: string, body: unknown): string {
  const parsed = JSON.parse(template) as Record<string, unknown>;
  const { ciphertext, ...header } = parsed;
  void ciphertext;
  header.iv = randomBytes(12).toString('hex');
  const key = hkdfSync(
    'sha256',
    Buffer.alloc(32, 7),
    Buffer.from(header.salt as string, 'hex'),
    `GhostPay/reconciliation/v1/aes-gcm|${scope.sellerKeyId}:${scope.chainId}`,
    32,
  );
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(key), Buffer.from(header.iv as string, 'hex'));
  cipher.setAAD(Buffer.from(JSON.stringify(header)));
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  const encrypted = Buffer.concat([cipher.update(text), cipher.final(), cipher.getAuthTag()]);
  return JSON.stringify({ ...header, ciphertext: encrypted.toString('hex') });
}

describe('encrypted reconciliation vault', () => {
  it('persists ciphertext only and reloads live historical observations with a fresh nonce', async () => {
    const store = new Store();
    const vault = await unlocked(store);
    await vault.save(record);
    const first = [...store.data.values()][0]!;
    expect(first).not.toContain(record.transactionHash);
    expect(first).not.toContain('verified-router-scan');
    expect((await (await unlocked(store)).read())[0]).toMatchObject({ ...record, provenance: 'live-scan' });
    await vault.save({ ...record, invoiceDigest: `0x${'f'.repeat(64)}` });
    expect([...store.data.values()][0]).not.toBe(first);
  });

  it('fails closed for tampered ciphertext, wrong seller, chain and key', async () => {
    const store = new Store();
    const vault = await unlocked(store);
    await vault.save(record);
    const encrypted = await vault.exportEncrypted();
    for (const changed of [
      { ...scope, chainId: 1 },
      { ...scope, sellerKeyId: 'e'.repeat(64) },
    ]) {
      const other = new ReconciliationVault(store, changed, () => undefined);
      await other.unlock(new Uint8Array(32).fill(7));
      await expect(other.previewImport(encrypted)).rejects.toThrow(/scope/);
    }
    const other = new ReconciliationVault(store, scope, () => undefined);
    await other.unlock(new Uint8Array(32).fill(8));
    await expect(other.read()).rejects.toThrow(/decrypt/);
    const parsed = JSON.parse(encrypted) as { ciphertext: string };
    parsed.ciphertext = `${parsed.ciphertext[0] === '0' ? '1' : '0'}${parsed.ciphertext.slice(1)}`;
    await expect(vault.previewImport(JSON.stringify(parsed))).rejects.toThrow(/decrypt/);
  });

  it('requires preview and explicit activation and never promotes imported observations to proof', async () => {
    const source = await unlocked();
    await source.save(record);
    const target = await unlocked();
    const preview = await target.previewImport(await source.exportEncrypted());
    expect(preview.recordCount).toBe(1);
    expect(await target.read()).toEqual([]);
    expect(JSON.stringify(preview)).not.toContain(record.transactionHash);
    await target.activateImport(preview);
    expect((await target.read())[0]?.provenance).toBe('imported-history');
    await expect(target.activateImport({ ...preview })).rejects.toThrow(/preview/);
  });

  it('retains reorg tombstones across record deletion and import of an older encrypted backup', async () => {
    const store = new Store();
    const vault = await unlocked(store);
    await vault.save(record);
    const old = await vault.exportEncrypted();
    await vault.invalidateFrom(100n, [], orphanedEverywhere);
    expect((await vault.read())[0]?.evidenceStatus).toBe('invalidated-after-reorg');
    await vault.clearRecords();
    expect(await vault.read()).toEqual([]);
    const resumed = await unlocked(store);
    await resumed.activateImport(await resumed.previewImport(old));
    expect((await resumed.read())[0]?.evidenceStatus).toBe('invalidated-after-reorg');
    await expect(resumed.save(record)).rejects.toThrow(/invalidated/);
  });

  it('uses exact ciphertext CAS so concurrent writers preserve both changes or fail visibly', async () => {
    const store = new Store();
    const left = await unlocked(store);
    const right = await unlocked(store);
    const second = { ...record, invoiceDigest: `0x${'f'.repeat(64)}` };
    const results = await Promise.allSettled([left.save(record), right.save(second)]);
    expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
    const saved = await left.read();
    expect(saved).toHaveLength(1);
    if (results.every((r) => r.status === 'fulfilled'))
      expect(saved[0]?.invoiceDigest).toBe(second.invoiceDigest);
  });

  it('rejects stale sessions, locked access, foreign records and oversized imports without writes', async () => {
    const store = new Store();
    let current = true;
    const vault = await unlocked(store, () => {
      if (!current) throw new Error('session changed');
    });
    await expect(vault.save({ ...record, chainId: 1 })).rejects.toThrow();
    await expect(vault.previewImport('x'.repeat(MAX_VAULT_BYTES + 1))).rejects.toThrow(/limit/);
    current = false;
    await expect(vault.save(record)).rejects.toThrow('session changed');
    expect(store.data.size).toBe(0);
    vault.lock();
    await expect(vault.read()).rejects.toThrow();
  });
  it('rejects duplicate envelope fields and handles a large bounded ciphertext without regex stack overflow', async () => {
    const vault = await unlocked();
    await vault.save(record);
    const text = await vault.exportEncrypted();
    await expect(
      vault.previewImport(text.replace('{', '{"format":"ghostpay-reconciliation",')),
    ).rejects.toThrow(/format/);
    const envelope = JSON.parse(text) as { ciphertext: string };
    envelope.ciphertext = 'ff'.repeat(1_000_000);
    await expect(vault.previewImport(JSON.stringify(envelope))).rejects.toThrow(/decrypt/);
  });

  it('rejects operations that cross lock and re-unlock while storage is pending', async () => {
    const store = new Store();
    const vault = await unlocked(store);
    await vault.save(record);
    let release!: (value: string | null) => void;
    store.read = () =>
      new Promise((resolve) => {
        release = resolve;
      });
    const reading = vault.read();
    vault.lock();
    await vault.unlock(new Uint8Array(32).fill(7));
    release([...store.data.values()][0]!);
    await expect(reading).rejects.toThrow(/stale/);
  });

  it('tombstones observed scan results even when a pending save has not persisted them yet', async () => {
    const vault = await unlocked();
    await vault.invalidateFrom(100n, [record], orphanedEverywhere);
    await expect(vault.save(record)).rejects.toThrow(/invalidated/);
  });

  it('invalidates only observations whose block hash is no longer canonical (L1-03, L3-F1)', async () => {
    const vault = await unlocked();
    const kept = variant(150, 'e');
    const orphaned = variant(160, 'f');
    const pending = variant(170, '1');
    await vault.save(kept);
    await vault.save(orphaned);
    // Providers may answer in mixed case; the comparison is on the hash value.
    const chain = (height: bigint): Promise<string> => Promise.resolve(height === 150n ? `0x${'E'.repeat(64)}` : `0x${'2'.repeat(64)}`);
    await vault.invalidateFrom(100n, [pending], chain);
    const after = await vault.read();
    expect(after.find((r) => r.id === kept.id)?.evidenceStatus).toBe('verified-at-scan');
    expect(after.find((r) => r.id === orphaned.id)?.evidenceStatus).toBe('invalidated-after-reorg');
    // The unchanged block can be recorded again by a later scan; orphaned observations stay blocked for good.
    await expect(vault.save(kept)).resolves.toBeUndefined();
    await expect(vault.save(orphaned)).rejects.toThrow(/invalidated by a reorg/);
    await expect(vault.save(pending)).rejects.toThrow(/invalidated by a reorg/);
  });

  it('writes nothing when a canonical block hash cannot be read, so the reorg is retried later (L3-F1)', async () => {
    const store = new Store();
    const vault = await unlocked(store);
    await vault.save(record);
    const before = [...store.data.values()][0];
    await expect(vault.invalidateFrom(100n, [], () => Promise.reject(new Error('RPC_FAILURE: block unavailable')))).rejects.toThrow(/RPC_FAILURE/);
    await expect(vault.invalidateFrom(100n, [], () => Promise.resolve('0x1234'))).rejects.toThrow(/canonical block hash/);
    expect([...store.data.values()][0]).toBe(before);
    expect((await vault.read())[0]?.evidenceStatus).toBe('verified-at-scan');
  });

  it('restores later canonical history unchanged and previews exactly what activation invalidates (L1-03)', async () => {
    const vault = await unlocked();
    const template = await vault.exportEncrypted();
    const orphaned = { ...variant(123, 'c'), evidenceStatus: 'invalidated-after-reorg' as const, provenance: 'live-scan' };
    const later = { ...variant(200, 'f'), recordedAt: record.recordedAt + 1000, provenance: 'live-scan' };
    // The source vault saw a reorg at 100 (orphaned record tombstoned), then saved a later canonical observation.
    const backup = encryptBody(template, { version: 2, records: [orphaned, later], invalidatedFrom: '100', tombstones: [orphaned.id], saturated: false, invoices: [], receipts: [] });
    const preview = await vault.previewImport(backup);
    expect(preview.invalidatedCount).toBe(1);
    await vault.activateImport(preview);
    const restored = await vault.read();
    expect(restored.find((r) => r.id === later.id)).toMatchObject({ evidenceStatus: 'verified-at-scan', provenance: 'imported-history' });
    expect(restored.find((r) => r.id === orphaned.id)?.evidenceStatus).toBe('invalidated-after-reorg');
    // A fresh rescan can still record the canonical observation as live evidence.
    await vault.save(variant(200, 'f'));
    expect((await vault.read()).find((r) => r.id === later.id)?.provenance).toBe('live-scan');
  });

  it('applies a local reorg cutoff only to imported observations recorded before it; a fresh scan revives them (L1-03)', async () => {
    const at = 1_850_000_000_000;
    const vault = await unlocked(new Store(), undefined, () => at);
    await vault.invalidateFrom(100n, [], orphanedEverywhere);
    const earlier = variant(150, 'e', { recordedAt: at - 1 });
    const later = variant(160, 'f', { recordedAt: at + 1 });
    const source = await unlocked();
    await source.save(earlier);
    await source.save(later);
    const preview = await vault.previewImport(await source.exportEncrypted());
    expect(preview.invalidatedCount).toBe(1);
    await vault.activateImport(preview);
    const merged = await vault.read();
    expect(merged.find((r) => r.id === earlier.id)?.evidenceStatus).toBe('invalidated-after-reorg');
    expect(merged.find((r) => r.id === later.id)?.evidenceStatus).toBe('verified-at-scan');
    // The precautionary invalidation was never a tombstone: a fresh verified observation replaces it.
    await vault.save(earlier);
    expect((await vault.read()).find((r) => r.id === earlier.id)).toMatchObject({ evidenceStatus: 'verified-at-scan', provenance: 'live-scan' });
  });

  it('keeps applying a legacy cutoff without a recorded time to every imported observation at or above it', async () => {
    const store = new Store();
    const vault = await unlocked(store);
    const template = await vault.exportEncrypted();
    store.data.set(`${scope.sellerKeyId}:${scope.chainId}`, encryptBody(template, { version: 2, records: [], invalidatedFrom: '100', tombstones: [], saturated: false, invoices: [], receipts: [] }));
    const source = await unlocked();
    await source.save(variant(150, 'e', { recordedAt: 8_000_000_000_000_000 }));
    await source.save(variant(90, 'f'));
    const preview = await vault.previewImport(await source.exportEncrypted());
    expect(preview.invalidatedCount).toBe(1);
    await vault.activateImport(preview);
    expect((await vault.read()).map((r) => [r.blockNumber, r.evidenceStatus])).toEqual([['150', 'invalidated-after-reorg'], ['90', 'verified-at-scan']]);
  });

  it('invalidates restored old history while preserving a freshly rescanned canonical block hash', async () => {
    const old = await unlocked();
    await old.save(record);
    const backup = await old.exportEncrypted();
    const target = await unlocked();
    const blockHash = `0x${'e'.repeat(64)}`;
    await target.invalidateFrom(100n, [record], () => Promise.resolve(blockHash));
    const fresh = {
      ...record,
      blockHash,
      id: `${scope.sellerKeyId}:${scope.chainId}:${record.transactionHash}:${record.stealthAddress}:${blockHash}:4`,
    };
    await target.save(fresh);
    await target.activateImport(await target.previewImport(backup));
    const restored = await target.read();
    expect(restored.find((item) => item.id === record.id)?.evidenceStatus).toBe('invalidated-after-reorg');
    expect(restored.find((item) => item.id === fresh.id)).toMatchObject({
      evidenceStatus: 'verified-at-scan',
      provenance: 'live-scan',
    });
  });

  it('cross-checks the domain-separated HKDF/AES-GCM envelope with the independent Node crypto API', async () => {
    const vault = await unlocked();
    await vault.save(record);
    const envelope = JSON.parse(await vault.exportEncrypted()) as {
      salt: string;
      iv: string;
      ciphertext: string;
    };
    const { ciphertext, ...header } = envelope;
    const key = hkdfSync(
      'sha256',
      Buffer.alloc(32, 7),
      Buffer.from(envelope.salt, 'hex'),
      `GhostPay/reconciliation/v1/aes-gcm|${scope.sellerKeyId}:${scope.chainId}`,
      32,
    );
    const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key), Buffer.from(envelope.iv, 'hex'));
    decipher.setAAD(Buffer.from(JSON.stringify(header)));
    const bytes = Buffer.from(ciphertext, 'hex');
    decipher.setAuthTag(bytes.subarray(-16));
    const doc = JSON.parse(
      Buffer.concat([decipher.update(bytes.subarray(0, -16)), decipher.final()]).toString(),
    ) as { records: unknown[] };
    expect(doc.records).toEqual([{ ...record, provenance: 'live-scan' }]);
  });

  it('rejects malformed decrypted schemas, duplicate identities, foreign scope and record overflow without activating', async () => {
    const vault = await unlocked();
    const template = await vault.exportEncrypted();
    const valid = { ...record, provenance: 'live-scan' };
    for (const body of [
      { version: 1, records: [valid], invalidatedFrom: null, saturated: false, tombstones: [], extra: true },
      { version: 1, records: [valid, valid], invalidatedFrom: null, saturated: false, tombstones: [] },
      {
        version: 1,
        records: [{ ...valid, chainId: 1 }],
        invalidatedFrom: null,
        saturated: false,
        tombstones: [],
      },
      {
        version: 1,
        records: [{ ...valid, provenance: 'seller-receipt' }],
        invalidatedFrom: null,
        saturated: false,
        tombstones: [],
      },
      { version: 1, records: [], invalidatedFrom: '-1', saturated: false, tombstones: [] },
      { version: 1, records: [], invalidatedFrom: null, saturated: false, tombstones: ['foreign'] },
      {
        version: 1,
        records: Array.from({ length: MAX_RECONCILIATION_RECORDS + 1 }, () => valid),
        invalidatedFrom: null,
        saturated: false,
        tombstones: [],
      },
      '{"version":1,"version":1,"records":[],"invalidatedFrom":null,"tombstones":[],"saturated":false}',
    ])
      await expect(vault.previewImport(encryptBody(template, body))).rejects.toThrow();
    expect(await vault.read()).toEqual([]);
  });

  it('accepts bounded record collections then refuses a new record past the cap atomically', async () => {
    const vault = await unlocked();
    const template = await vault.exportEncrypted();
    const records = Array.from({ length: MAX_RECONCILIATION_RECORDS }, (_, index) => {
      const transactionHash = `0x${BigInt(index + 1)
        .toString(16)
        .padStart(64, '0')}`;
      return {
        ...record,
        transactionHash,
        id: `${scope.sellerKeyId}:${scope.chainId}:${transactionHash}:${record.stealthAddress}:${record.blockHash}:4`,
        provenance: 'live-scan',
      };
    });
    await vault.activateImport(
      await vault.previewImport(
        encryptBody(template, {
          version: 1,
          records,
          invalidatedFrom: null,
          saturated: false,
          tombstones: [],
        }),
      ),
    );
    await expect(vault.save(record)).rejects.toThrow(/limit|many/);
    expect(await vault.read()).toHaveLength(MAX_RECONCILIATION_RECORDS);
  });

  it('preserves disjoint writes under concurrent ciphertext CAS', async () => {
    const store = new Store();
    const left = await unlocked(store);
    const right = await unlocked(store);
    const transactionHash = `0x${'e'.repeat(64)}`;
    const second = {
      ...record,
      transactionHash,
      id: `${scope.sellerKeyId}:${scope.chainId}:${transactionHash}:${record.stealthAddress}:${record.blockHash}:4`,
    };
    await Promise.all([left.save(record), right.save(second)]);
    expect((await left.read()).map((r) => r.transactionHash).sort()).toEqual(
      [record.transactionHash, second.transactionHash].sort(),
    );
  });

  it('reports repeated storage conflicts and clears preview authority when locking', async () => {
    const store = new Store();
    const vault = await unlocked(store);
    await vault.save(record);
    const preview = await vault.previewImport(await vault.exportEncrypted());
    vault.lock();
    await vault.unlock(new Uint8Array(32).fill(7));
    await expect(vault.activateImport(preview)).rejects.toThrow(/preview/);
    store.compareAndSwap = () => Promise.resolve(false);
    await expect(vault.save(record)).rejects.toThrow(/another tab/);
  });

  it('wipes rejected unlock inputs and leaves no previous unlock active after failure', async () => {
    const vault = await unlocked();
    const short = new Uint8Array(3).fill(4);
    await expect(vault.unlock(short)).rejects.toThrow(/viewing key/);
    expect(short).toEqual(new Uint8Array(3));
    await expect(vault.read()).rejects.toThrow(/locked/);
  });
  it('durably invalidates and becomes explicitly read-only when one reorg exceeds the tombstone cap', async () => {
    const vault = await unlocked();
    await vault.save(record);
    const observations = Array.from({ length: MAX_RECONCILIATION_RECORDS + 1 }, (_, index) => {
      const transactionHash = `0x${BigInt(index + 1)
        .toString(16)
        .padStart(64, '0')}`;
      return {
        ...record,
        transactionHash,
        id: `${scope.sellerKeyId}:${scope.chainId}:${transactionHash}:${record.stealthAddress}:${record.blockHash}:4`,
      };
    });
    const invalidation = vault.invalidateFrom(100n, observations, orphanedEverywhere);
    await expect(invalidation).rejects.toThrow(/read.only|capacity|safety limit/i);
    expect(userMessage(await invalidation.catch((error: unknown) => error))).toMatch(
      /Reorg invalidation was saved/,
    );
    expect((await vault.read())[0]?.evidenceStatus).toBe('invalidated-after-reorg');
    await expect(vault.save(observations.at(-1)!)).rejects.toThrow(/read.only|capacity/i);
    const backup = await vault.exportEncrypted();
    await vault.clearRecords();
    await vault.activateImport(await vault.previewImport(backup));
    expect((await vault.read())[0]?.evidenceStatus).toBe('invalidated-after-reorg');
    await expect(vault.save(observations.at(-1)!)).rejects.toThrow(/read.only|capacity/i);
  });
  it('persists a saturated cutoff across cumulative reorg observations at the capacity boundary', async () => {
    const vault = await unlocked();
    await vault.save(record);
    const observations = Array.from({ length: MAX_RECONCILIATION_RECORDS }, (_, index) => {
      const transactionHash = `0x${BigInt(index + 1)
        .toString(16)
        .padStart(64, '0')}`;
      return {
        ...record,
        transactionHash,
        id: `${scope.sellerKeyId}:${scope.chainId}:${transactionHash}:${record.stealthAddress}:${record.blockHash}:4`,
      };
    });
    await vault.invalidateFrom(100n, observations.slice(0, MAX_RECONCILIATION_RECORDS - 1), orphanedEverywhere);
    await expect(vault.invalidateFrom(100n, observations.slice(-1), orphanedEverywhere)).rejects.toThrow(
      /read.only|capacity|safety limit/i,
    );
    await expect(vault.save(observations.at(-1)!)).rejects.toThrow(/read.only|capacity/i);
  });

  it.each(['read', 'readState'] as const)(
    'does not release an empty plaintext snapshot when lock runs before the %s continuation',
    async (method) => {
      const vault = await unlocked();
      const reading = vault[method]();
      queueMicrotask(() => vault.lock());
      await expect(reading).rejects.toThrow(/locked|stale/);
    },
  );
  it('previews and reports a read-only empty backup before explicit activation', async () => {
    const vault = await unlocked();
    const template = await vault.exportEncrypted();
    const backup = encryptBody(template, {
      version: 1,
      records: [],
      invalidatedFrom: '100',
      saturated: true,
      tombstones: [],
    });
    const preview = await vault.previewImport(backup);
    expect(preview).toEqual({ recordCount: 0, invalidatedCount: 0, readOnly: true, invoiceCount: 0, receiptCount: 0 });
    expect((await vault.readState()).readOnly).toBe(false);
    await vault.activateImport(preview);
    expect(await vault.readState()).toEqual({ records: [], readOnly: true, invoices: [], receipts: [] });
    vault.lock();
    await vault.unlock(new Uint8Array(32).fill(7));
    expect((await vault.readState()).readOnly).toBe(true);
  });
  it('warns when individually writable backup histories would saturate the combined vault', async () => {
    const vault = await unlocked();
    await vault.invalidateFrom(100n, [record], orphanedEverywhere);
    const template = await vault.exportEncrypted();
    const tombstones = Array.from(
      { length: MAX_RECONCILIATION_RECORDS },
      (_, index) =>
        `${scope.sellerKeyId}:${scope.chainId}:0x${BigInt(index + 1)
          .toString(16)
          .padStart(64, '0')}:${record.stealthAddress}:${record.blockHash}:4`,
    );
    const backup = encryptBody(template, {
      version: 1,
      records: [],
      invalidatedFrom: '100',
      saturated: false,
      tombstones,
    });
    const preview = await vault.previewImport(backup);
    expect(preview.readOnly).toBe(true);
    expect((await vault.readState()).readOnly).toBe(false);
    await vault.activateImport(preview);
    expect((await vault.readState()).readOnly).toBe(true);
  });
});
