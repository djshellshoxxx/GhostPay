import { describe, expect, it } from 'vitest';
import { decodeArchive, encodeArchive, type ArchiveContents } from './tagArchive';
import type { TagPayload, TagSnapshotEntry } from './tags';

// Runs WITHOUT v8 coverage (vitest.nocov.config.ts; `npm test` runs both). V8 block coverage deoptimises the scrypt hot
// loop ~10x, which pushed this 150-case fuzz past its deadline (13.9 s uncovered vs >120 s covered). The cases, the
// 120 s deadline and the KDF cost are unchanged; tagArchive.ts coverage still comes from tagArchive.test.ts.
const N = 1 << 14; // tests only; production default is 2^17
const PASS = 'correct horse battery staple 7';
const addr = (i: number): string => `0x${i.toString(16).padStart(40, '0')}`;
const payload = (i: number): TagPayload => ({
  stealthAddress: addr(i + 1),
  announcementId: `0x${'ab'.repeat(32)}:${String(i)}`,
  logIndex: i,
  clientLabel: `Client number ${String(i)}`,
});
const entries = (n: number): TagSnapshotEntry[] => Array.from({ length: n }, (_, i) => ({ chainId: 84532, createdAt: 1, updatedAt: 2, payload: payload(i) }));
const contents = (records: readonly TagSnapshotEntry[]): ArchiveContents => ({ createdAt: 1_700_000_000_000, keyVersion: 1, records, history: {} });

describe('archive failure modes (fuzz)', () => {
  it('fuzz: random and mutated inputs only ever fail with a user-facing error, never crash', async () => {
    const good = await encodeArchive(contents(entries(2)), PASS, { N });
    let seed = 12345;
    const rnd = (n: number): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    for (let i = 0; i < 150; i++) {
      const b = i % 3 === 0 ? Uint8Array.from({ length: rnd(300) }, () => rnd(256)) : good.slice();
      if (i % 3 !== 0) for (let k = 0; k < 1 + rnd(4); k++) { const at = 8 + rnd(b.length - 8); b[at] = (b[at] as number) ^ (1 + rnd(255)); }
      try {
        await decodeArchive(b, PASS);
        throw new Error('accepted a mutated archive');
      } catch (e) {
        expect((e as Error).name === 'UserFacingError' || (e as Error).constructor.name === 'UserFacingError', String((e as Error).message)).toBe(true);
      }
    }
  }, 120_000);
});
