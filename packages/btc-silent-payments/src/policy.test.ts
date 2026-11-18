import { describe, expect, it } from 'vitest';
import { SilentPaymentError } from './errors.js';
import {
  checkDestinationReuse,
  EMPTY_DESTINATION_HISTORY,
  groupOutputsByLabel,
  MAX_DESTINATION_HISTORY_ENTRIES,
  MAX_DESTINATION_LENGTH,
  normalizeDestination,
  parseDestinationHistory,
  recordDestination,
  selectOutputsForSweep,
  serializeDestinationHistory,
  SpendPolicyError,
  type DestinationHistory,
} from './policy.js';
import { DEFAULT_WALLET_DUST_SATS } from './spend.js';

const code = (f: () => unknown): string | undefined => {
  try {
    f();
  } catch (e) {
    return e instanceof SilentPaymentError ? e.code : `OTHER:${String(e)}`;
  }
  return undefined;
};
const policyCode = (f: () => unknown): string | undefined => {
  try {
    f();
  } catch (e) {
    return e instanceof SpendPolicyError ? e.policy : `OTHER:${String(e)}`;
  }
  return undefined;
};

const BC1 = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
const SP = 'sp1qq' + 'x'.repeat(108);
const LEGACY = '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2';

describe('destination history: bounded, serializable, address-only', () => {
  it('starts empty, records and counts, and round-trips through JSON', () => {
    const h1 = recordDestination(EMPTY_DESTINATION_HISTORY, BC1);
    const h2 = recordDestination(recordDestination(h1, SP), BC1.toUpperCase());
    expect(EMPTY_DESTINATION_HISTORY.entries).toHaveLength(0);
    expect(h2.entries).toEqual([
      { destination: BC1, count: 2 },
      { destination: SP, count: 1 },
    ]);
    const json = serializeDestinationHistory(h2);
    expect(JSON.parse(json)).toEqual({ version: 1, entries: h2.entries });
    expect(parseDestinationHistory(json)).toEqual(h2);
    expect(parseDestinationHistory(JSON.parse(json))).toEqual(h2);
  });

  it('normalizes bech32 case and whitespace but keeps base58 case', () => {
    expect(normalizeDestination(`  ${BC1.toUpperCase()} `)).toBe(BC1);
    expect(normalizeDestination(LEGACY)).toBe(LEGACY);
    expect(code(() => normalizeDestination(''))).toBe('INVALID_INPUT');
    expect(code(() => normalizeDestination(5 as unknown as string))).toBe('INVALID_INPUT');
    expect(code(() => normalizeDestination('   '))).toBe('INVALID_INPUT');
    expect(code(() => normalizeDestination('bc1q\u0000abc'))).toBe('INVALID_INPUT');
    expect(code(() => normalizeDestination('bc1q abc'))).toBe('INVALID_INPUT');
    expect(code(() => normalizeDestination('x'.repeat(MAX_DESTINATION_LENGTH + 1)))).toBe('INVALID_INPUT');
    expect(normalizeDestination('x'.repeat(MAX_DESTINATION_LENGTH))).toHaveLength(MAX_DESTINATION_LENGTH);
  });

  it('is bounded: the oldest entry is evicted once the cap is reached', () => {
    let h: DestinationHistory = EMPTY_DESTINATION_HISTORY;
    for (let i = 0; i < MAX_DESTINATION_HISTORY_ENTRIES; i++) h = recordDestination(h, `bc1q${String(i)}`);
    expect(h.entries).toHaveLength(MAX_DESTINATION_HISTORY_ENTRIES);
    expect(h.entries[0]?.destination).toBe('bc1q0');
    h = recordDestination(h, 'bc1qnew');
    expect(h.entries).toHaveLength(MAX_DESTINATION_HISTORY_ENTRIES);
    expect(h.entries[0]?.destination).toBe('bc1q1');
    expect(h.entries.at(-1)).toEqual({ destination: 'bc1qnew', count: 1 });
    // Re-recording an existing entry neither grows nor evicts.
    const again = recordDestination(h, 'bc1q1');
    expect(again.entries).toHaveLength(MAX_DESTINATION_HISTORY_ENTRIES);
    expect(again.entries[0]).toEqual({ destination: 'bc1q1', count: 2 });
  });

  it('rejects malformed, oversized and secret-looking input on parse', () => {
    const entry = (destination: string, count = 1) => ({ destination, count });
    const ok = { version: 1, entries: [entry(BC1)] };
    expect(parseDestinationHistory(ok)).toEqual(ok);
    const bad: unknown[] = [
      '{',
      'null',
      null,
      [],
      42,
      'x',
      { version: 2, entries: [] },
      { version: 1 },
      { entries: [] },
      { version: 1, entries: {} },
      { version: 1, entries: [], extra: true },
      { version: 1, entries: [null] },
      { version: 1, entries: [[]] },
      { version: 1, entries: [{ destination: BC1 }] },
      { version: 1, entries: [{ count: 1 }] },
      { version: 1, entries: [{ destination: BC1, count: 1, scanSecret: 'ff' }] },
      { version: 1, entries: [entry(BC1, 0)] },
      { version: 1, entries: [entry(BC1, -1)] },
      { version: 1, entries: [entry(BC1, 1.5)] },
      { version: 1, entries: [entry(BC1, Number.MAX_SAFE_INTEGER + 2)] },
      { version: 1, entries: [{ destination: BC1, count: '1' }] },
      { version: 1, entries: [entry('')] },
      { version: 1, entries: [entry(' ' + BC1)] },
      { version: 1, entries: [entry(BC1.toUpperCase())] },
      { version: 1, entries: [entry('x'.repeat(MAX_DESTINATION_LENGTH + 1))] },
      { version: 1, entries: [entry(BC1), entry(BC1)] },
      { version: 1, entries: Array.from({ length: MAX_DESTINATION_HISTORY_ENTRIES + 1 }, (_, i) => entry(`bc1q${String(i)}`)) },
    ];
    for (const b of bad) expect(code(() => parseDestinationHistory(b)), JSON.stringify(b)?.slice(0, 80)).toBe('INVALID_INPUT');
    const full = { version: 1, entries: Array.from({ length: MAX_DESTINATION_HISTORY_ENTRIES }, (_, i) => entry(`bc1q${String(i)}`)) };
    expect(parseDestinationHistory(full).entries).toHaveLength(MAX_DESTINATION_HISTORY_ENTRIES);
  });

  it('does not keep a reference to the parsed input', () => {
    const input = { version: 1, entries: [{ destination: BC1, count: 1 }] };
    const h = parseDestinationHistory(input);
    (input.entries[0] as { count: number }).count = 99;
    expect(h.entries[0]?.count).toBe(1);
  });
});

describe('checkDestinationReuse', () => {
  const h = recordDestination(recordDestination(recordDestination(EMPTY_DESTINATION_HISTORY, BC1), BC1), SP);

  it('is fresh for an unseen destination', () => {
    expect(checkDestinationReuse(LEGACY, h)).toEqual({ reused: false, firstSeenCount: 0, code: 'FRESH' });
    expect(checkDestinationReuse(BC1, EMPTY_DESTINATION_HISTORY)).toEqual({ reused: false, firstSeenCount: 0, code: 'FRESH' });
  });

  it('flags a regular address paid before, case-insensitively for bech32', () => {
    expect(checkDestinationReuse(BC1, h)).toEqual({ reused: true, firstSeenCount: 2, code: 'ADDRESS_REUSED' });
    expect(checkDestinationReuse(` ${BC1.toUpperCase()}`, h)).toEqual({ reused: true, firstSeenCount: 2, code: 'ADDRESS_REUSED' });
  });

  it('reports a repeated silent payment address with its own code (on-chain unlinkable)', () => {
    expect(checkDestinationReuse(SP, h)).toEqual({ reused: true, firstSeenCount: 1, code: 'SILENT_PAYMENT_REPEATED' });
    expect(checkDestinationReuse('t' + SP, h)).toEqual({ reused: false, firstSeenCount: 0, code: 'FRESH' });
  });

  it('validates the destination and never touches the history', () => {
    expect(code(() => checkDestinationReuse('', h))).toBe('INVALID_INPUT');
    expect(h.entries).toHaveLength(2);
  });
});

interface O {
  readonly id: string;
  readonly label: number | null;
  readonly amountSats: bigint;
}
const o = (id: string, label: number | null, amountSats: bigint): O => ({ id, label, amountSats });
const ids = (xs: readonly O[]): string[] => xs.map((x) => x.id);

describe('groupOutputsByLabel', () => {
  it('groups by label index, keeping unlabeled (null) and change (0) apart, in first-seen order', () => {
    const outs = [o('a', null, 5000n), o('b', 1, 5000n), o('c', 0, 5000n), o('d', 1, 7000n), o('e', null, 100n)];
    const g = groupOutputsByLabel(outs);
    expect([...g.keys()]).toEqual([null, 1, 0]);
    expect(ids(g.get(null) ?? [])).toEqual(['a', 'e']);
    expect(ids(g.get(1) ?? [])).toEqual(['b', 'd']);
    expect(ids(g.get(0) ?? [])).toEqual(['c']);
    expect(groupOutputsByLabel([]).size).toBe(0);
  });

  it('rejects invalid labels and amounts', () => {
    expect(code(() => groupOutputsByLabel([o('x', -1, 1n)]))).toBe('INVALID_LABEL');
    expect(code(() => groupOutputsByLabel([o('x', 1.5, 1n)]))).toBe('INVALID_LABEL');
    expect(code(() => groupOutputsByLabel([o('x', 2 ** 32, 1n)]))).toBe('INVALID_LABEL');
    expect(code(() => groupOutputsByLabel([o('x', 1, 0n)]))).toBe('INVALID_AMOUNT');
    expect(code(() => groupOutputsByLabel([o('x', 1, 5 as unknown as bigint)]))).toBe('INVALID_AMOUNT');
    expect(code(() => groupOutputsByLabel([o('x', 1, 21_000_000n * 100_000_000n + 1n)]))).toBe('INVALID_AMOUNT');
  });
});

describe('selectOutputsForSweep', () => {
  const outs = [o('a', null, 5000n), o('b', 1, 5000n), o('c', 1, 999n), o('d', 2, 8000n), o('e', 2, 546n), o('f', 1, 1000n)];

  it('single-label mode takes one label only and excludes wallet dust by default', () => {
    const s = selectOutputsForSweep({ outputs: outs, mode: 'single-label', label: 1 });
    expect(ids(s.outputs)).toEqual(['b', 'f']);
    expect(ids(s.excludedDust)).toEqual(['c']);
    expect(s.labels).toEqual([1]);
    expect(s.mixesLabels).toBe(false);
    expect(s.totalSats).toBe(6000n);
    expect(ids(selectOutputsForSweep({ outputs: outs, mode: 'single-label', label: null }).outputs)).toEqual(['a']);
    const none = selectOutputsForSweep({ outputs: outs, mode: 'single-label', label: 7 });
    expect(none.outputs).toEqual([]);
    expect(none.labels).toEqual([]);
    expect(none.totalSats).toBe(0n);
  });

  it('dust boundaries: 546 and 999 excluded, 1000 kept; includeDust and walletDustSats override', () => {
    expect(DEFAULT_WALLET_DUST_SATS).toBe(1000n);
    const two = selectOutputsForSweep({ outputs: outs, mode: 'single-label', label: 2 });
    expect(ids(two.outputs)).toEqual(['d']);
    expect(ids(two.excludedDust)).toEqual(['e']);
    const all = selectOutputsForSweep({ outputs: outs, mode: 'single-label', label: 1, includeDust: true });
    expect(ids(all.outputs)).toEqual(['b', 'c', 'f']);
    expect(all.excludedDust).toEqual([]);
    const lower = selectOutputsForSweep({ outputs: outs, mode: 'single-label', label: 1, walletDustSats: 999n });
    expect(ids(lower.outputs)).toEqual(['b', 'c', 'f']);
    const higher = selectOutputsForSweep({ outputs: outs, mode: 'single-label', label: 1, walletDustSats: 1001n });
    expect(ids(higher.outputs)).toEqual(['b']);
    expect(ids(higher.excludedDust)).toEqual(['c', 'f']);
    expect(code(() => selectOutputsForSweep({ outputs: outs, mode: 'single-label', label: 1, walletDustSats: -1n }))).toBe('INVALID_INPUT');
  });

  it("'all' refuses to mix labels in one transaction unless forced, with a typed error", () => {
    expect(policyCode(() => selectOutputsForSweep({ outputs: outs, mode: 'all' }))).toBe('LABEL_MIX');
    expect(code(() => selectOutputsForSweep({ outputs: outs, mode: 'all' }))).toBe('INVALID_INPUT');
    expect(policyCode(() => selectOutputsForSweep({ outputs: outs, mode: 'all', force: false }))).toBe('LABEL_MIX');
    let err: unknown;
    try {
      selectOutputsForSweep({ outputs: outs, mode: 'all' });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(SpendPolicyError);
    expect(err).toBeInstanceOf(SilentPaymentError);
    expect((err as SpendPolicyError).name).toBe('SpendPolicyError');
    expect((err as SpendPolicyError).message).toMatch(/label/);
    expect((err as SpendPolicyError).message).not.toMatch(/[0-9]{3,}|bc1|sp1/);

    const forced = selectOutputsForSweep({ outputs: outs, mode: 'all', force: true });
    expect(ids(forced.outputs)).toEqual(['a', 'b', 'd', 'f']);
    expect(forced.labels).toEqual([null, 1, 2]);
    expect(forced.mixesLabels).toBe(true);
    expect(ids(forced.excludedDust)).toEqual(['c', 'e']);
    expect(forced.totalSats).toBe(19_000n);
  });

  it("'all' with a single label present (after dust exclusion) needs no force", () => {
    const one = selectOutputsForSweep({ outputs: [o('a', 3, 5000n), o('b', 3, 6000n), o('z', 4, 600n)], mode: 'all' });
    expect(ids(one.outputs)).toEqual(['a', 'b']);
    expect(one.labels).toEqual([3]);
    expect(one.mixesLabels).toBe(false);
    expect(policyCode(() => selectOutputsForSweep({ outputs: [o('a', 3, 5000n), o('z', 4, 600n)], mode: 'all', includeDust: true }))).toBe('LABEL_MIX');
    expect(selectOutputsForSweep({ outputs: [], mode: 'all' }).outputs).toEqual([]);
  });

  it('fails closed on bad parameters', () => {
    expect(code(() => selectOutputsForSweep({ outputs: outs, mode: 'single-label' }))).toBe('INVALID_INPUT');
    expect(code(() => selectOutputsForSweep({ outputs: outs, mode: 'all', label: 1 }))).toBe('INVALID_INPUT');
    expect(code(() => selectOutputsForSweep({ outputs: outs, mode: 'some' as 'all' }))).toBe('INVALID_INPUT');
    expect(code(() => selectOutputsForSweep({ outputs: [o('x', 1, -1n)], mode: 'all' }))).toBe('INVALID_AMOUNT');
    expect(code(() => selectOutputsForSweep({ outputs: [o('x', 2 ** 32, 1n)], mode: 'all' }))).toBe('INVALID_LABEL');
  });

  it('is pure: inputs are not mutated and the selection is frozen', () => {
    const copy = outs.map((x) => ({ ...x }));
    const s = selectOutputsForSweep({ outputs: copy, mode: 'single-label', label: 1 });
    expect(copy).toEqual(outs);
    expect(Object.isFrozen(s)).toBe(true);
    expect(Object.isFrozen(s.outputs)).toBe(true);
  });
});
