import { describe, expect, it } from 'vitest';
import { BillingError, chunkBatches, confirmBatch, hashItems, previewBatch, type BatchPreview, type ImportOptions, type PayoutItem } from './index.js';
import { META, OTHER_META } from './fixtures.testutil.js';

const A = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';
const B = '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359';
const C = '0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB';
const opts: ImportOptions = {
  chainId: 8453, token: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', decimals: 6,
  limits: { minAmount: 1_000_000n, perRecipientMax: 10_000_000_000n, maxRecipients: 100, maxTotal: 50_000_000_000n },
};
const H = 'destination,amount,label\n';
const ok = (csv: string, o: ImportOptions = opts): BatchPreview => {
  const r = previewBatch(csv, o);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r;
};
const issues = (csv: string, o: ImportOptions = opts) => {
  const r = previewBatch(csv, o);
  if (r.ok) throw new Error('expected failure');
  return r.issues;
};

describe('previewBatch happy path', () => {
  const p = ok(`${H}${A},1250.75,Alice (payroll)\n${B},3,Bob\n${META},100,Private Carol\n`);
  it('parses amounts into base units and totals', () => {
    expect(p.items.map((i) => i.amount)).toEqual([1_250_750_000n, 3_000_000n, 100_000_000n]);
    expect(p.total).toBe(1_353_750_000n);
    expect(p.items.map((i) => i.kind)).toEqual(['address', 'address', 'meta']);
    expect(p.previewHash).toBe(hashItems(8453, opts.token, 6, p.items));
  });
  it('lowercase addresses only if allowed (canonicalized to EIP-55)', () => {
    expect(issues(`${H}${A.toLowerCase()},5,x`)[0]).toMatchObject({ row: 2, field: 'destination' });
    expect(ok(`${H}${A.toLowerCase()},5,x`, { ...opts, allowLowercaseAddress: true }).items[0]?.destination).toBe(A);
  });
  it('hash changes with any field', () => {
    const base = p.previewHash;
    expect(ok(`${H}${A},1250.76,Alice (payroll)\n${B},3,Bob\n${META},100,Private Carol\n`).previewHash).not.toBe(base);
    expect(ok(`${H}${A},1250.75,Alice (payroll)\n${B},3,Bob\n${META},100,Private Carol\n`, { ...opts, chainId: 1 }).previewHash).not.toBe(base);
  });
});

describe('adversarial rows', () => {
  it('collects all issues with row/field only', () => {
    const r = issues(`${H}${A},abc,x\n0xnope,5,x\n${B},5,=cmd\n${C},0.5,ok\n`);
    expect(r).toEqual([
      { row: 2, field: 'amount', code: 'invalid amount' },
      { row: 3, field: 'destination', code: 'invalid destination' },
      { row: 4, field: 'label', code: 'invalid label' },
      { row: 5, field: 'amount', code: 'invalid amount' },
    ]);
  });
  it('homoglyph address, bad checksum, fullwidth digits, scientific notation, negatives', () => {
    const cyr = A.replace('a', 'а');
    const bad = A.slice(0, 5) + (A[5] === 'a' ? 'A' : 'a') + A.slice(6);
    const rows = [`${cyr},5,x`, `${bad},5,x`, `${B},５,x`, `${B},1e6,x`, `${B},-5,x`, `${B},5.0000001,x`, `${B},,x`, `${B},999999999999999999,x`];
    for (const row of rows) expect(issues(H + row)).not.toHaveLength(0);
  });
  it('formula and character-class labels', () => {
    for (const label of ['=1+1', '+x', '-x', '@x', ' =x', 'a<b>', 'a‮b'.replace('‮', ' '), 'x'.repeat(65)])
      expect(issues(`${H}${A},5,${label}`).some((i) => i.field === 'label')).toBe(true);
    expect(ok(`${H}${A},5,Zoë O'Neil & Co.`).items[0]?.label).toBe("Zoë O'Neil & Co.");
  });
  it('bad header, empty body, structural errors', () => {
    expect(issues('destination,amount\n' + `${A},5`)).toEqual([{ row: 1, field: 'header', code: 'bad header' }]);
    expect(issues('Destination,amount,label\n' + `${A},5,x`)[0]?.field).toBe('header');
    expect(issues(H)[0]).toMatchObject({ field: 'file', code: 'no data rows' });
    expect(issues(`${H}${A},5`)[0]).toMatchObject({ field: 'file', row: 2 });
    expect(issues('')[0]?.field).toBe('file');
  });
  it('amount limits: min and per-recipient max', () => {
    expect(issues(`${H}${A},0.999999,x`)[0]?.field).toBe('amount');
    expect(issues(`${H}${A},10000.000001,x`)[0]?.field).toBe('amount');
    expect(ok(`${H}${A},10000,x`).total).toBe(10_000_000_000n);
  });
  it('recipient and total caps', () => {
    const o = { ...opts, limits: { ...opts.limits, maxRecipients: 2 } };
    expect(issues(`${H}${A},5,a\n${B},5,b\n${C},5,c`, o)).toEqual([{ row: 0, field: 'file', code: 'too many recipients' }]);
    const t = { ...opts, limits: { ...opts.limits, maxTotal: 9_999_999n } };
    expect(issues(`${H}${A},5,a\n${B},5,b`, t)[0]?.code).toBe('total above max');
  });
});

describe('dedupe', () => {
  const csv = `${H}${A},5,a\n${A.toLowerCase()},7,a2\n${B},5,b\n${META},1,m\n${META},2,m\n`;
  it('rejects duplicates by default (case-insensitive)', () => {
    expect(issues(csv, { ...opts, allowLowercaseAddress: true })).toEqual([
      { row: 3, field: 'destination', code: 'duplicate destination' },
      { row: 6, field: 'destination', code: 'duplicate destination' },
    ]);
  });
  it('merge sums and reports; merged value still capped', () => {
    const p = ok(csv, { ...opts, allowLowercaseAddress: true, duplicates: 'merge' });
    expect(p.items.map((i) => i.amount)).toEqual([12_000_000n, 5_000_000n, 3_000_000n]);
    expect(p.merged).toBe(2);
    const tight = { ...opts, duplicates: 'merge' as const, limits: { ...opts.limits, perRecipientMax: 6_000_000n } };
    expect(issues(`${H}${A},4,a\n${A},4,b`, tight)[0]?.code).toBe('merged above max');
  });
});

describe('confirmBatch', () => {
  const p = ok(`${H}${A},10,a\n${B},20,b\n`);
  it('creates a plan only for the exact previewed hash', () => {
    const plan = confirmBatch(p, p.previewHash);
    expect(plan.planId).toBe(p.previewHash);
    expect(plan.total).toBe(30_000_000n);
    expect(plan.items).toBe(p.items);
  });
  it('rejects wrong hash, tampered items, tampered total/hash', () => {
    expect(() => confirmBatch(p, 'f'.repeat(64))).toThrow(BillingError);
    expect(() => confirmBatch(p, '')).toThrow(BillingError);
    const swapped: PayoutItem[] = [{ ...(p.items[0] as PayoutItem), destination: C }, p.items[1] as PayoutItem];
    expect(() => confirmBatch({ ...p, items: swapped }, p.previewHash)).toThrow(BillingError);
    const inflated = [{ ...(p.items[0] as PayoutItem), amount: 999_999_999n }, p.items[1] as PayoutItem];
    const forged = { ...p, items: inflated };
    expect(() => confirmBatch(forged, hashItems(8453, p.token, 6, inflated))).toThrow(BillingError); // previewHash stale
    expect(() => confirmBatch({ ...p, total: 1n }, p.previewHash)).toThrow(BillingError);
  });
});

describe('chunkBatches', () => {
  const plan = confirmBatch(ok(`${H}${A},10,a\n${B},20,b\n${C},30,c\n${META},40,d\n${OTHER_META},50,e\n`), ok(`${H}${A},10,a\n${B},20,b\n${C},30,c\n${META},40,d\n${OTHER_META},50,e\n`).previewHash);
  it('splits by count', () => {
    const b = chunkBatches(plan, 2, 1_000_000_000_000n);
    expect(b.map((x) => x.items.length)).toEqual([2, 2, 1]);
    expect(b.reduce((a, x) => a + x.total, 0n)).toBe(150_000_000n);
  });
  it('splits by total (order preserved, greedy)', () => {
    const b = chunkBatches(plan, 10, 60_000_000n);
    expect(b.map((x) => x.total)).toEqual([60_000_000n, 40_000_000n, 50_000_000n]);
    expect(b.flatMap((x) => x.items.map((i) => i.label))).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
  it('ids are deterministic and unique', () => {
    const a = chunkBatches(plan, 2, 10n ** 12n);
    const b = chunkBatches(plan, 2, 10n ** 12n);
    expect(a.map((x) => x.batchId)).toEqual(b.map((x) => x.batchId));
    expect(new Set(a.map((x) => x.batchId)).size).toBe(3);
  });
  it('rejects bad size and oversize item', () => {
    expect(() => chunkBatches(plan, 0, 1n)).toThrow(BillingError);
    expect(() => chunkBatches(plan, 1001, 1n)).toThrow(BillingError);
    expect(() => chunkBatches(plan, 5, 49_999_999n)).toThrow(/exceeds/);
  });
});
