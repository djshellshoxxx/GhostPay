import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { InvoicePreviewRetention, readRetentionDelay, type RetentionDelay, type RetentionPreview } from './metadataRetention';

const DELAYS: readonly RetentionDelay[] = [0, 300_000, 900_000, 3_600_000];
const storageWith = (raw: string | null): { getItem(key: string): string | null } => ({ getItem: () => raw });

describe('retention preference under generated input (#287 item 4)', () => {
  it('turns any stored text into a supported delay, and only an exact {"delay":N} record enables cleanup', () => {
    const stored = fc.oneof(
      { weight: 2, arbitrary: fc.string({ unit: 'binary', maxLength: 200 }) },
      { weight: 2, arbitrary: fc.anything().map((value) => { try { return JSON.stringify(value) ?? 'null'; } catch { return 'null'; } }) },
      { weight: 3, arbitrary: fc.record({ delay: fc.oneof(fc.constantFrom<unknown>(...DELAYS, '300000', 300_000.5, -300_000, Number.POSITIVE_INFINITY, null), fc.integer()) }, { requiredKeys: [] })
        .chain((record) => fc.constantFrom(JSON.stringify(record), ` ${JSON.stringify(record)}`, JSON.stringify({ ...record, extra: 1 }), JSON.stringify([record]))) },
      { weight: 1, arbitrary: fc.constantFrom('{"delay":300000,"delay":0}', '{"__proto__":{"delay":300000}}', '{"delay":3600000}'.padEnd(129, ' ')) },
    );
    fc.assert(fc.property(fc.option(stored, { nil: null }), (raw) => {
      const delay = readRetentionDelay(storageWith(raw));
      expect(DELAYS).toContain(delay);
      if (delay !== 0) {
        // Never enabled by an ambiguous, oversized or extended record.
        expect(raw).not.toBeNull();
        expect(raw!.length).toBeLessThanOrEqual(128);
        expect(JSON.parse(raw!)).toEqual({ delay });
      }
    }), { numRuns: 3000, seed: 20261125 });
  });

  it('never throws for a storage object that throws or returns a non-string', () => {
    const hostile = [
      { getItem: (): string | null => { throw new Error('denied'); } },
      { getItem: (): string | null => 42 as unknown as string },
      { getItem: (): string | null => ({ toString: () => '{"delay":300000}' }) as unknown as string },
    ];
    for (const storage of hostile) expect(readRetentionDelay(storage)).toBe(0);
  });
});

type Op =
  | { readonly kind: 'register'; readonly at: number; readonly fails: boolean }
  | { readonly kind: 'dispose'; readonly pick: number }
  | { readonly kind: 'preview' }
  | { readonly kind: 'confirm'; readonly pick: number }
  | { readonly kind: 'expire'; readonly delay: RetentionDelay; readonly now: number };

const op: fc.Arbitrary<Op> = fc.oneof(
  { weight: 4, arbitrary: fc.record({ kind: fc.constant('register' as const), at: fc.integer({ min: 0, max: 10_000_000 }), fails: fc.boolean() }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant('dispose' as const), pick: fc.nat() }) },
  { weight: 2, arbitrary: fc.constant({ kind: 'preview' as const }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant('confirm' as const), pick: fc.nat() }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant('expire' as const), delay: fc.constantFrom(...DELAYS), now: fc.integer({ min: -5, max: 20_000_000 }) }) },
);

describe('presentation retention registry, model-checked over generated operation sequences', () => {
  it('clears only live, eligible, unchanged registrations and never more than 32', () => {
    fc.assert(fc.property(fc.array(op, { maxLength: 80 }), (ops) => {
      const registry = new InvoicePreviewRetention();
      // Model: every registration, whether its owner disposed it, how often its clear() ran.
      interface ModelEntry { at: number; fails: boolean; disposed: boolean; cleared: number; dispose: () => void }
      const entries: ModelEntry[] = [];
      const plans: { preview: RetentionPreview; revision: number; live: number }[] = [];
      const live = (): typeof entries => entries.filter((e) => !e.disposed && e.cleared === 0);
      for (const o of ops) {
        if (o.kind === 'register') {
          const entry: ModelEntry = { at: o.at, fails: o.fails, disposed: false, cleared: 0, dispose: () => undefined };
          const before = live().length;
          try {
            entry.dispose = registry.register(() => {
              if (entry.disposed) throw new Error('cleared after disposal');
              if (entry.fails) throw new Error('adapter failure');
              entry.cleared++;
            }, o.at);
            entries.push(entry);
          } catch {
            // Capacity is the only reason a valid registration is refused.
            expect(before).toBeGreaterThanOrEqual(32);
          }
        } else if (o.kind === 'dispose') {
          const e = entries[o.pick % Math.max(entries.length, 1)];
          if (e !== undefined) { e.dispose(); e.disposed = true; }
        } else if (o.kind === 'preview') {
          const preview = registry.preview();
          expect(preview.count).toBe(live().length);
          plans.push({ preview, revision: registry.getRevision(), live: preview.count });
        } else if (o.kind === 'confirm') {
          const plan = plans.splice(o.pick % Math.max(plans.length, 1), 1)[0];
          if (plan === undefined) continue;
          const clearedBefore = entries.reduce((n, e) => n + e.cleared, 0);
          const stale = plan.revision !== registry.getRevision();
          const result = registry.confirm(plan.preview);
          const clearedNow = entries.reduce((n, e) => n + e.cleared, 0) - clearedBefore;
          if (stale) {
            expect(result).toEqual({ kind: 'stale' });
            expect(clearedNow).toBe(0);
          } else {
            expect(result.kind).toBe('cleared');
            if (result.kind === 'cleared') {
              expect(result.count).toBe(clearedNow);
              expect(result.count + result.failed).toBeLessThanOrEqual(plan.live);
            }
          }
          // A plan is single use.
          expect(registry.confirm(plan.preview)).toEqual({ kind: 'stale' });
        } else {
          const clearedBefore = entries.reduce((n, e) => n + e.cleared, 0);
          const eligible = live().filter((e) => o.delay !== 0 && o.now >= 0 && o.now >= e.at && o.now - e.at >= o.delay && !e.fails).length;
          const count = registry.expire(o.delay, o.now);
          expect(count).toBe(eligible);
          expect(entries.reduce((n, e) => n + e.cleared, 0) - clearedBefore).toBe(count);
        }
        for (const e of entries) expect(e.cleared).toBeLessThanOrEqual(1);
        expect(live().length).toBeLessThanOrEqual(32);
      }
    }), { numRuns: 1500, seed: 20261125 });
  });
});
