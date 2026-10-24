import { describe, expect, it } from 'vitest';
import type { ScanMatch } from './scanClient';
import {
  clearReconciliationRecords,
  exportReconciliationLedger,
  exportUntrustedLegacyReconciliation,
  isReconciliationLedgerEnabled,
  MAX_RECONCILIATION_RECORDS,
  readReconciliationRecords,
  recordFromVerifiedMatch,
  RECONCILIATION_LEDGER_DATA_KEY,
  saveReconciliationRecord,
  searchReconciliationRecords,
  setReconciliationLedgerEnabled,
} from './reconciliationLedger';

class MemoryStorage {
  private readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
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
    expect(() => recordFromVerifiedMatch(match(overrides as Partial<ScanMatch>), KEY)).toThrow(
      /Only a verified router scan match|no transaction hash/,
    );
  });

  it('requires valid seller scope and a lowercase, exact invoice digest', () => {
    expect(() => recordFromVerifiedMatch(match(), 'bad')).toThrow(/seller key scope/);
    expect(() => recordFromVerifiedMatch(match(), KEY, '0xABC')).toThrow(/Invoice digest/);
    expect(() => recordFromVerifiedMatch(match(), KEY, undefined, 0)).toThrow(/timestamp/);
    expect(() => recordFromVerifiedMatch(match(), KEY, undefined, Number.MAX_SAFE_INTEGER)).toThrow(
      /timestamp/,
    );
  });

  it('preserves existing legacy records for untrusted read/export/delete without permitting a new plaintext write', () => {
    const storage = new MemoryStorage();
    const record = recordFromVerifiedMatch(match(), KEY, undefined, 1_800_000_000_000);
    storage.setItem(RECONCILIATION_LEDGER_DATA_KEY, JSON.stringify({ version: 1, records: [record] }));
    expect(readReconciliationRecords(storage)).toEqual([record]);
    expect(() => saveReconciliationRecord(record, storage)).toThrow(/legacy.*read.only/i);
    expect(() => setReconciliationLedgerEnabled(true, storage)).toThrow(/legacy.*read.only/i);
    expect(readReconciliationRecords(storage)).toEqual([record]);
    expect(
      (JSON.parse(exportReconciliationLedger(readReconciliationRecords(storage))) as { records: unknown[] })
        .records,
    ).toEqual([record]);
    clearReconciliationRecords(storage);
    expect(storage.getItem(RECONCILIATION_LEDGER_DATA_KEY)).toBeNull();
  });

  it('searches stable record fields and exports a versioned JSON document', () => {
    const first = recordFromVerifiedMatch(match(), KEY, `0x${'f'.repeat(64)}`, 1_800_000_000_000);
    const second = recordFromVerifiedMatch(
      match({
        chainId: 1,
        announcement: {
          ...match().announcement,
          transactionHash: `0x${'9'.repeat(64)}`,
          blockNumber: 125n,
        } as never,
      }),
      'b'.repeat(64),
      undefined,
      1_800_000_000_100,
    );
    const records = [first, second];
    expect(searchReconciliationRecords(records, ' 0xBBBB ')).toEqual([first]);
    expect(searchReconciliationRecords(records, 'invoice digest')).toEqual([]);
    expect(searchReconciliationRecords(records, '1').length).toBe(2);
    const decoded = JSON.parse(exportReconciliationLedger(records)) as {
      version: number;
      records: unknown[];
    };
    expect(decoded.version).toBe(1);
    expect(decoded.records).toEqual(records);
  });

  it('fails closed on corrupt, claimed, tampered, oversized and duplicate persisted entries', () => {
    const storage = new MemoryStorage();
    const record = recordFromVerifiedMatch(match(), KEY, undefined, 1_800_000_000_000);
    storage.setItem(RECONCILIATION_LEDGER_DATA_KEY, '{bad json');
    expect(() => readReconciliationRecords(storage)).toThrow(/corrupt/);
    storage.setItem(
      RECONCILIATION_LEDGER_DATA_KEY,
      JSON.stringify({ version: 1, records: [{ ...record, evidenceSource: 'seller-receipt' }] }),
    );
    expect(() => readReconciliationRecords(storage)).toThrow(/evidence source/);
    storage.setItem(
      RECONCILIATION_LEDGER_DATA_KEY,
      JSON.stringify({ version: 1, records: [{ ...record, amountMinorUnits: '0' }] }),
    );
    expect(() => readReconciliationRecords(storage)).toThrow(/amount/);
    storage.setItem(
      RECONCILIATION_LEDGER_DATA_KEY,
      JSON.stringify({ version: 1, records: [record, record] }),
    );
    expect(() => readReconciliationRecords(storage)).toThrow(/duplicate/);
    storage.setItem(
      RECONCILIATION_LEDGER_DATA_KEY,
      JSON.stringify({ version: 1, records: [record], trusted: true }),
    );
    expect(() => readReconciliationRecords(storage)).toThrow(/unsupported format/);
    storage.setItem(RECONCILIATION_LEDGER_DATA_KEY, 'x'.repeat(2_000_001));
    expect(() => readReconciliationRecords(storage)).toThrow(/safety limit/);
  });

  it('accepts the record cap but rejects one entry beyond it', () => {
    const storage = new MemoryStorage();
    const base = recordFromVerifiedMatch(match(), KEY, undefined, 1_800_000_000_000);
    const records = Array.from({ length: MAX_RECONCILIATION_RECORDS }, (_, index) => {
      const transactionHash = `0x${BigInt(index + 1)
        .toString(16)
        .padStart(64, '0')}`;
      return { ...base, transactionHash, id: `${KEY}:84532:${transactionHash}:${ADDRESS}:${BLOCK_HASH}:4` };
    });
    storage.setItem(RECONCILIATION_LEDGER_DATA_KEY, JSON.stringify({ version: 1, records }));
    expect(readReconciliationRecords(storage)).toHaveLength(MAX_RECONCILIATION_RECORDS);
    const exported = JSON.parse(exportReconciliationLedger(readReconciliationRecords(storage))) as {
      records: unknown[];
    };
    expect(exported.records).toHaveLength(MAX_RECONCILIATION_RECORDS);
    storage.setItem(
      RECONCILIATION_LEDGER_DATA_KEY,
      JSON.stringify({ version: 1, records: [...records, records[0]] }),
    );
    expect(() => readReconciliationRecords(storage)).toThrow(/unsupported format/);
  });

  it('can delete legacy records even when unreadable and never replaces plaintext', () => {
    const storage = new MemoryStorage();
    storage.setItem(RECONCILIATION_LEDGER_DATA_KEY, '{broken');
    clearReconciliationRecords(storage);
    expect(readReconciliationRecords(storage)).toEqual([]);
    expect(isReconciliationLedgerEnabled(storage)).toBe(false);
  });
  it('exports malformed bounded legacy data byte-for-byte as explicitly untrusted text', () => {
    const storage = new MemoryStorage();
    const raw = '{"unknown":true,"version":999}';
    storage.setItem(RECONCILIATION_LEDGER_DATA_KEY, raw);
    expect(exportUntrustedLegacyReconciliation(storage)).toBe(raw);
    storage.setItem(RECONCILIATION_LEDGER_DATA_KEY, 'x'.repeat(2_000_001));
    expect(() => exportUntrustedLegacyReconciliation(storage)).toThrow(/limit/);
  });
});
