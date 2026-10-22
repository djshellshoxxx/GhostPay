import { describe, expect, it } from 'vitest';
import type { ScanMatch } from './scanClient';
import {
  clearReconciliationRecords,
  exportReconciliationLedger,
  invalidateReconciliationAtOrAfter,
  isReconciliationLedgerEnabled,
  MAX_RECONCILIATION_RECORDS,
  readReconciliationRecords,
  recordFromVerifiedMatch,
  RECONCILIATION_LEDGER_DATA_KEY,
  RECONCILIATION_LEDGER_ENABLED_KEY,
  saveReconciliationRecord,
  searchReconciliationRecords,
  setReconciliationLedgerEnabled,
} from './reconciliationLedger';

class MemoryStorage {
  private readonly data = new Map<string, string>();
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  setItem(key: string, value: string): void { this.data.set(key, value); }
  removeItem(key: string): void { this.data.delete(key); }
}

const KEY = 'a'.repeat(64);
const TX = `0x${'b'.repeat(64)}`;
const BLOCK_HASH = `0x${'c'.repeat(64)}`;
const ADDRESS = `0x${'d'.repeat(40)}`;
const TOKEN = `0x${'e'.repeat(40)}`;

function match(overrides: Partial<ScanMatch> = {}): ScanMatch {
  return {
    chainId: 84532,
    announcement: {
      transactionHash: TX,
      blockNumber: 123n,
      blockHash: BLOCK_HASH,
      logIndex: 4,
      id: `${BLOCK_HASH}:4`,
      schemeId: 1n,
      caller: `0x${'1'.repeat(40)}`,
      stealthAddress: ADDRESS,
      ephemeralPublicKey: `0x02${'2'.repeat(64)}`,
      metadata: '0x',
    },
    stealthAddress: ADDRESS,
    metadata: { kind: 'erc20', token: TOKEN, netAmount: 123456789012345678901n, viewTag: 5 },
    viaRouter: true,
    tagMatches: true,
    receipt: 'verified',
    ...overrides,
  } as unknown as ScanMatch;
}

describe('local verified-scan reconciliation ledger', () => {
  it('constructs a privacy-minimal record from verified router evidence only', () => {
    const record = recordFromVerifiedMatch(match(), KEY, `0x${'f'.repeat(64)}`, 1_800_000_000_000);
    expect(record).toMatchObject({
      version: 1,
      sellerKeyId: KEY,
      chainId: 84532,
      transactionHash: TX,
      blockNumber: '123',
      blockHash: BLOCK_HASH,
      logIndex: 4,
      stealthAddress: ADDRESS,
      asset: TOKEN,
      amountMinorUnits: '123456789012345678901',
      invoiceDigest: `0x${'f'.repeat(64)}`,
      evidenceStatus: 'verified-at-scan',
      evidenceSource: 'verified-router-scan',
    });
    expect(record.id).toBe(`${KEY}:84532:${TX}:${ADDRESS}:${BLOCK_HASH}:4`);
    expect(JSON.stringify(record)).not.toMatch(/privateKey|signingKey|clientLabel|signature|receipt/i);
  });

  it.each([
    ['claimed announcement', { receipt: 'claimed' }],
    ['direct announcement', { viaRouter: false }],
    ['missing parsed metadata', { metadata: undefined }],
    ['missing transaction hash', { announcement: { ...match().announcement, transactionHash: undefined } }],
  ] as const)('rejects %s as ledger evidence', (_case, overrides) => {
    expect(() => recordFromVerifiedMatch(match(overrides as Partial<ScanMatch>), KEY)).toThrow(/Only a verified router scan match|no transaction hash/);
  });

  it('requires valid seller scope and a lowercase, exact invoice digest', () => {
    expect(() => recordFromVerifiedMatch(match(), 'bad')).toThrow(/seller key scope/);
    expect(() => recordFromVerifiedMatch(match(), KEY, '0xABC')).toThrow(/Invoice digest/);
    expect(() => recordFromVerifiedMatch(match(), KEY, undefined, 0)).toThrow(/timestamp/);
    expect(() => recordFromVerifiedMatch(match(), KEY, undefined, Number.MAX_SAFE_INTEGER)).toThrow(/timestamp/);
  });

  it('requires opt-in, persists verified entries across reads, and deduplicates repeat saves', () => {
    const storage = new MemoryStorage();
    const record = recordFromVerifiedMatch(match(), KEY, undefined, 1_800_000_000_000);
    expect(isReconciliationLedgerEnabled(storage)).toBe(false);
    expect(() => saveReconciliationRecord(record, storage)).toThrow(/Enable the local/);
    setReconciliationLedgerEnabled(true, storage);
    expect(storage.getItem(RECONCILIATION_LEDGER_ENABLED_KEY)).toBe('1');
    expect(saveReconciliationRecord(record, storage)).toEqual([record]);
    expect(readReconciliationRecords(storage)).toEqual([record]);
    expect(saveReconciliationRecord(record, storage)).toEqual([record]);
    expect(storage.getItem(RECONCILIATION_LEDGER_DATA_KEY)).toContain('verified-router-scan');
    const linked = recordFromVerifiedMatch(match(), KEY, `0x${'f'.repeat(64)}`, 1_800_000_000_000);
    expect(saveReconciliationRecord(linked, storage)[0]?.invoiceDigest).toBe(linked.invoiceDigest);
    expect(() => saveReconciliationRecord(recordFromVerifiedMatch(match(), KEY, `0x${'1'.repeat(64)}`), storage)).toThrow(/different invoice digest/);
  });

  it('searches stable record fields and exports a versioned JSON document', () => {
    const first = recordFromVerifiedMatch(match(), KEY, `0x${'f'.repeat(64)}`, 1_800_000_000_000);
    const second = recordFromVerifiedMatch(match({ chainId: 1, announcement: { ...match().announcement, transactionHash: `0x${'9'.repeat(64)}`, blockNumber: 125n } as never }), 'b'.repeat(64), undefined, 1_800_000_000_100);
    const records = [first, second];
    expect(searchReconciliationRecords(records, ' 0xBBBB ')).toEqual([first]);
    expect(searchReconciliationRecords(records, 'invoice digest')).toEqual([]);
    expect(searchReconciliationRecords(records, '1').length).toBe(2);
    const decoded = JSON.parse(exportReconciliationLedger(records)) as { version: number; records: unknown[] };
    expect(decoded.version).toBe(1);
    expect(decoded.records).toEqual(records);
  });

  it('marks matching scoped records invalid after a reorg but preserves earlier and other-seller evidence', () => {
    const storage = new MemoryStorage();
    setReconciliationLedgerEnabled(true, storage);
    const active = recordFromVerifiedMatch(match(), KEY, undefined, 1_800_000_000_000);
    const earlier = recordFromVerifiedMatch(match({ announcement: { ...match().announcement, blockNumber: 80n, blockHash: `0x${'8'.repeat(64)}`, logIndex: 2 } as never }), KEY, undefined, 1_800_000_000_010);
    const otherSeller = recordFromVerifiedMatch(match({ announcement: { ...match().announcement, transactionHash: `0x${'9'.repeat(64)}` } as never }), 'b'.repeat(64), undefined, 1_800_000_000_020);
    saveReconciliationRecord(active, storage);
    saveReconciliationRecord(earlier, storage);
    saveReconciliationRecord(otherSeller, storage);
    const records = invalidateReconciliationAtOrAfter(84532, KEY, 100n, storage);
    expect(records.find((entry) => entry.id === active.id)?.evidenceStatus).toBe('invalidated-after-reorg');
    expect(records.find((entry) => entry.id === earlier.id)?.evidenceStatus).toBe('verified-at-scan');
    expect(records.find((entry) => entry.id === otherSeller.id)?.evidenceStatus).toBe('verified-at-scan');
    expect(readReconciliationRecords(storage)).toEqual(records);
  });

  it('fails closed on corrupt, claimed, tampered, oversized and duplicate persisted entries', () => {
    const storage = new MemoryStorage();
    const record = recordFromVerifiedMatch(match(), KEY, undefined, 1_800_000_000_000);
    storage.setItem(RECONCILIATION_LEDGER_DATA_KEY, '{bad json');
    expect(() => readReconciliationRecords(storage)).toThrow(/corrupt/);
    storage.setItem(RECONCILIATION_LEDGER_DATA_KEY, JSON.stringify({ version: 1, records: [{ ...record, evidenceSource: 'seller-receipt' }] }));
    expect(() => readReconciliationRecords(storage)).toThrow(/evidence source/);
    storage.setItem(RECONCILIATION_LEDGER_DATA_KEY, JSON.stringify({ version: 1, records: [{ ...record, amountMinorUnits: '0' }] }));
    expect(() => readReconciliationRecords(storage)).toThrow(/amount/);
    storage.setItem(RECONCILIATION_LEDGER_DATA_KEY, JSON.stringify({ version: 1, records: [record, record] }));
    expect(() => readReconciliationRecords(storage)).toThrow(/duplicate/);
    storage.setItem(RECONCILIATION_LEDGER_DATA_KEY, JSON.stringify({ version: 1, records: [record], trusted: true }));
    expect(() => readReconciliationRecords(storage)).toThrow(/unsupported format/);
    storage.setItem(RECONCILIATION_LEDGER_DATA_KEY, 'x'.repeat(2_000_001));
    expect(() => readReconciliationRecords(storage)).toThrow(/safety limit/);
  });

  it('accepts the record cap but rejects one entry beyond it', () => {
    const storage = new MemoryStorage();
    const base = recordFromVerifiedMatch(match(), KEY, undefined, 1_800_000_000_000);
    const records = Array.from({ length: MAX_RECONCILIATION_RECORDS }, (_, index) => {
      const transactionHash = `0x${(BigInt(index + 1)).toString(16).padStart(64, '0')}`;
      return { ...base, transactionHash, id: `${KEY}:84532:${transactionHash}:${ADDRESS}:${BLOCK_HASH}:4` };
    });
    storage.setItem(RECONCILIATION_LEDGER_DATA_KEY, JSON.stringify({ version: 1, records }));
    expect(readReconciliationRecords(storage)).toHaveLength(MAX_RECONCILIATION_RECORDS);
    const exported = JSON.parse(exportReconciliationLedger(readReconciliationRecords(storage))) as { records: unknown[] };
    expect(exported.records).toHaveLength(MAX_RECONCILIATION_RECORDS);
    storage.setItem(RECONCILIATION_LEDGER_ENABLED_KEY, '1');
    const fullRecord = recordFromVerifiedMatch(match({ announcement: { ...match().announcement, transactionHash: `0x${'f'.repeat(64)}` } as never }), KEY, undefined, 1_800_000_000_001);
    expect(() => saveReconciliationRecord(fullRecord, storage)).toThrow(/ledger is full/);
    expect(readReconciliationRecords(storage)).toHaveLength(MAX_RECONCILIATION_RECORDS);
    storage.setItem(RECONCILIATION_LEDGER_DATA_KEY, JSON.stringify({ version: 1, records: [...records, records[0]] }));
    expect(() => readReconciliationRecords(storage)).toThrow(/unsupported format/);
  });

  it('clears records without disabling the opt-in and disables by removing both ledger keys', () => {
    const storage = new MemoryStorage();
    setReconciliationLedgerEnabled(true, storage);
    saveReconciliationRecord(recordFromVerifiedMatch(match(), KEY, undefined, 1_800_000_000_000), storage);
    clearReconciliationRecords(storage);
    expect(readReconciliationRecords(storage)).toEqual([]);
    expect(isReconciliationLedgerEnabled(storage)).toBe(true);
    setReconciliationLedgerEnabled(false, storage);
    expect(isReconciliationLedgerEnabled(storage)).toBe(false);
    expect(storage.getItem(RECONCILIATION_LEDGER_DATA_KEY)).toBeNull();
  });

  it('surfaces storage write failures rather than claiming the record was saved', () => {
    const storage = new MemoryStorage();
    setReconciliationLedgerEnabled(true, storage);
    const failing = {
      getItem: storage.getItem.bind(storage),
      removeItem: storage.removeItem.bind(storage),
      setItem: () => { throw new Error('quota exceeded'); },
    };
    expect(() => saveReconciliationRecord(recordFromVerifiedMatch(match(), KEY), failing)).toThrow('quota exceeded');
  });
});
