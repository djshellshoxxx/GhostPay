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
async function unlocked(store = new Store(), guard = (): void => undefined): Promise<ReconciliationVault> {
  const vault = new ReconciliationVault(store, scope, guard);
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
    await vault.invalidateFrom(100n);
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
    await vault.invalidateFrom(100n, [record]);
    await expect(vault.save(record)).rejects.toThrow(/invalidated/);
  });

  it('invalidates restored old history while preserving a freshly rescanned canonical block hash', async () => {
    const old = await unlocked();
    await old.save(record);
    const backup = await old.exportEncrypted();
    const target = await unlocked();
    await target.invalidateFrom(100n, [record]);
    const blockHash = `0x${'e'.repeat(64)}`;
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
    const invalidation = vault.invalidateFrom(100n, observations);
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
    await vault.invalidateFrom(100n, observations.slice(0, MAX_RECONCILIATION_RECORDS - 1));
    await expect(vault.invalidateFrom(100n, observations.slice(-1))).rejects.toThrow(
      /read.only|capacity|safety limit/i,
    );
    await expect(vault.save(observations.at(-1)!)).rejects.toThrow(/read.only|capacity/i);
  });

  it('does not release an empty plaintext snapshot when lock runs before the read continuation', async () => {
    const vault = await unlocked();
    const reading = vault.read();
    queueMicrotask(() => vault.lock());
    await expect(reading).rejects.toThrow(/locked|stale/);
  });
});
