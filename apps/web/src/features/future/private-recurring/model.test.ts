import { describe, expect, it } from 'vitest';
import {
  MAX_RECURRING_PLANS, MAX_RECURRING_SNAPSHOT_BYTES, RecurringError,
  parseRecurringSnapshot, validateRecurringPlan, validateRecurringSnapshot,
} from './index';
import { invoiceReference, planFixture, snapshotFixture } from './fixtures.testutil';

describe('F10 browser plan decoding', () => {
  it('preserves large token base units exactly and returns detached frozen terms', () => {
    const input = planFixture();
    const parsed = validateRecurringPlan(input);
    input.cadence.every = 2;
    input.amountAtomic = '2';
    expect(parsed.amountAtomic).toBe('1000000000000000001');
    expect(parsed.cadence).toEqual({ kind: 'monthly', every: 1 });
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.cadence)).toBe(true);
    expect(validateRecurringPlan(planFixture({ amountAtomic: ((1n << 256n) - 1n).toString() })).amountAtomic)
      .toBe(((1n << 256n) - 1n).toString());
  });

  it.each(['0', '01', '-1', '1.0', '1e18', ' 1', '1 ', '1\n', '1\r', '1\u2028', (1n << 256n).toString(), 100])(
    'rejects noncanonical or out-of-range token amount %s', amountAtomic => {
      expect(() => validateRecurringPlan(planFixture({ amountAtomic }))).toThrowError(new RecurringError('AMOUNT'));
    },
  );

  it('does not reinterpret a fiat billing plan as token-atomic terms', () => {
    const { amountAtomic: _unused, ...withoutAtomic } = planFixture();
    void _unused;
    expect(() => validateRecurringPlan({ ...withoutAtomic, amountMinor: '100', currency: 'USD' }))
      .toThrowError(new RecurringError('SCHEMA'));
  });

  it.each(['America/Vancouver', 'Asia/Kathmandu', 'UTC'])('accepts supported presentation timezone %s', displayTimeZone => {
    expect(validateRecurringPlan(planFixture({ displayTimeZone })).displayTimeZone).toBe(displayTimeZone);
  });

  it.each(['Mars/City', '', '+01:00', 'UTC\n', 'x'.repeat(129)])('rejects invalid timezone %s', displayTimeZone => {
    expect(() => validateRecurringPlan(planFixture({ displayTimeZone }))).toThrowError(new RecurringError('TIMEZONE'));
  });

  it('supports canonical EVM ERC-20 identifiers without inferring decimals or prices', () => {
    const assetId = `eip155:8453/erc20:0x${'a'.repeat(40)}`;
    expect(validateRecurringPlan(planFixture({ assetId })).assetId).toBe(assetId);
  });

  it.each(['ETH', 'native', 'eip155:01/slip44:60', 'eip155:0/slip44:60', 'eip155:9007199254740992/slip44:60',
    'eip155:1/slip44:060', 'eip155:1/slip44:2147483648', 'eip155:1/slip44:60\n', `eip155:1/erc20:0x${'A'.repeat(40)}`])(
    'rejects ambiguous or unsupported asset identifier %s', assetId => {
      expect(() => validateRecurringPlan(planFixture({ assetId }))).toThrowError(new RecurringError('ASSET'));
    },
  );

  it.each([{ kind: 'monthly', every: 0 }, { kind: 'weekly', every: 25 }, { kind: 'custom', seconds: 3599 },
    { kind: 'custom', seconds: 366 * 86_400 + 1 }, { kind: 'daily', every: 1 }])('preserves existing cadence bounds', cadence => {
    expect(() => validateRecurringPlan(planFixture({ cadence }))).toThrowError(new RecurringError('SCHEDULE'));
  });

  it('rejects unknown fields, host paths, private fields, symbols, and accessors before reading them', () => {
    expect(() => validateRecurringPlan(planFixture({ privateKey: 'fixture-private-value' }))).toThrowError(new RecurringError('SCHEMA'));
    expect(() => validateRecurringPlan(planFixture({ templateRef: '/tmp/invoice.json' }))).toThrowError(new RecurringError('REFERENCE'));
    expect(() => validateRecurringPlan(planFixture({ planId: 'plan-1\n' }))).toThrowError(new RecurringError('REFERENCE'));
    const symbol = { ...planFixture(), [Symbol('extra')]: 1 };
    expect(() => validateRecurringPlan(symbol)).toThrowError(new RecurringError('SCHEMA'));
    let reads = 0;
    const input = planFixture();
    Object.defineProperty(input, 'amountAtomic', { enumerable: true, get: () => { reads++; return '1'; } });
    expect(() => validateRecurringPlan(input)).toThrowError(new RecurringError('SCHEMA'));
    expect(reads).toBe(0);
  });
});

describe('F10 staged browser snapshots', () => {
  it.each([undefined, null, 1, {}, []])('rejects non-text intake with a fixed typed error', input => {
    expect(() => parseRecurringSnapshot(input)).toThrowError(new RecurringError('SCHEMA'));
  });

  it('round-trips planning references without accepting them as settlement evidence', () => {
    const input = snapshotFixture({ revision: 'terms-2', amountAtomic: '2' });
    input.plans[0]!.nextPeriodIndex = 1;
    input.outbox.push(invoiceReference(0, { planRevision: 'terms-1' }));
    const result = parseRecurringSnapshot(JSON.stringify(input));
    expect(result.outbox[0]).toEqual(invoiceReference(0));
    expect(result.plans[0]!.plan.amountAtomic).toBe('2');
    expect(Object.isFrozen(result.outbox)).toBe(true);
    expect(Object.isFrozen(result.outbox[0])).toBe(true);
    expect(result.outbox[0]).not.toHaveProperty('amountAtomic');
    expect(result.outbox[0]).not.toHaveProperty('settled');
  });

  it('rejects duplicate plan identities even when their revisions differ', () => {
    const input = snapshotFixture();
    input.plans.push({ plan: planFixture({ revision: 'other' }), nextPeriodIndex: 0 });
    expect(() => validateRecurringSnapshot(input)).toThrowError(new RecurringError('DUPLICATE'));
  });

  it('rejects duplicate plan-period identities and shared invoice artifacts', () => {
    const input = snapshotFixture();
    input.plans[0]!.nextPeriodIndex = 2;
    input.outbox.push(invoiceReference(0), invoiceReference(0, { status: 'exported' }));
    expect(() => validateRecurringSnapshot(input)).toThrowError(new RecurringError('DUPLICATE'));
    input.outbox[1] = invoiceReference(1, { artifactRef: 'artifact-0' });
    expect(() => validateRecurringSnapshot(input)).toThrowError(new RecurringError('DUPLICATE'));
  });

  it.each([
    { eventId: 'wrong' }, { planId: 'missing' }, { kind: 'reminder' }, { status: 'final' },
  ])('rejects inconsistent or unsupported outbox metadata', override => {
    const input = snapshotFixture();
    input.plans[0]!.nextPeriodIndex = 1;
    input.outbox.push(invoiceReference(0, override));
    expect(() => validateRecurringSnapshot(input)).toThrowError(new RecurringError('SNAPSHOT'));
  });

  it('refuses a cursor that could issue an already recorded period again', () => {
    const input = snapshotFixture();
    input.outbox.push(invoiceReference(0));
    expect(() => validateRecurringSnapshot(input)).toThrowError(new RecurringError('SNAPSHOT'));
  });

  it('rejects CLI paths, claimed payment finality, unsupported versions, and duplicate JSON properties', () => {
    const input = snapshotFixture();
    expect(() => validateRecurringSnapshot({ ...input, outboxPath: '/tmp/outbox' })).toThrowError(new RecurringError('SCHEMA'));
    expect(() => validateRecurringSnapshot({ ...input, schema: 'ghostpay.recurring-snapshot/2' })).toThrowError(new RecurringError('SCHEMA'));
    input.plans[0]!.nextPeriodIndex = 1;
    input.outbox.push({ ...invoiceReference(0), paymentFinal: true });
    expect(() => validateRecurringSnapshot(input)).toThrowError(new RecurringError('SCHEMA'));
    const json = JSON.stringify(snapshotFixture()).replace('"revision":"snapshot-1"', '"revision":"snapshot-1","revision":"snapshot-2"');
    expect(() => parseRecurringSnapshot(json)).toThrowError(new RecurringError('SCHEMA'));
  });

  it('bounds records and UTF-8 bytes before parsing', () => {
    const input = snapshotFixture();
    input.plans = Array.from({ length: MAX_RECURRING_PLANS + 1 }, (_, i) => ({ plan: planFixture({ planId: `plan-${i}` }), nextPeriodIndex: 0 }));
    expect(() => validateRecurringSnapshot(input)).toThrowError(new RecurringError('LIMIT'));
    expect(() => validateRecurringSnapshot({ ...snapshotFixture(), outbox: Array.from({ length: 1001 }, () => invoiceReference(0)) }))
      .toThrowError(new RecurringError('LIMIT'));
    expect(() => parseRecurringSnapshot(' '.repeat(MAX_RECURRING_SNAPSHOT_BYTES + 1))).toThrowError(new RecurringError('LIMIT'));
    expect(() => parseRecurringSnapshot('é'.repeat(MAX_RECURRING_SNAPSHOT_BYTES / 2 + 1))).toThrowError(new RecurringError('LIMIT'));
  });

  it.each([-0, -1, 1.5, NaN, Infinity, 100001])('rejects invalid next period index %s', nextPeriodIndex => {
    const input = snapshotFixture();
    input.plans[0]!.nextPeriodIndex = nextPeriodIndex;
    expect(() => validateRecurringSnapshot(input)).toThrowError(new RecurringError('SCHEDULE'));
  });

  it('refuses sparse arrays and array accessors without invoking them', () => {
    const sparse = new Array<unknown>(1);
    expect(() => validateRecurringSnapshot({ ...snapshotFixture(), plans: sparse })).toThrowError(new RecurringError('SCHEMA'));
    const input = snapshotFixture();
    let reads = 0;
    Object.defineProperty(input.plans, '0', { enumerable: true, get: () => { reads++; return null; } });
    expect(() => validateRecurringSnapshot(input)).toThrowError(new RecurringError('SCHEMA'));
    expect(reads).toBe(0);
  });
});
