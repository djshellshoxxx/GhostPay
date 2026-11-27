import { describe, expect, it } from 'vitest';
import type { SweepLock } from './sweep';
import { readSweepAttempts, SWEEP_JOURNAL_KEY, SweepJournalUnavailableError, writeSweepAttempt, type SweepJournalStorage } from './sweepAttemptJournal';

const owner = `0x${'11'.repeat(20)}` as const;
const otherOwner = `0x${'22'.repeat(20)}` as const;
const hash = `0x${'33'.repeat(32)}` as const;
const otherHash = `0x${'44'.repeat(32)}` as const;
const direct: SweepLock = { chainId: 84532, owner, nonce: 3, expectedHash: hash, status: 'unknown-after-handoff' };
const directJson = JSON.stringify(direct);
const orderJson = JSON.stringify({ relayer: otherOwner, nonce: '7', deadline: 1_800_001_200 });
const relayedJson = JSON.stringify({ chainId: 84532, owner, status: 'unknown-after-handoff', order: JSON.parse(orderJson) as unknown });

describe('ambiguous persisted sweep locks', () => {
  it.each([
    ['resolved status after an unresolved status', directJson.replace('"status":"unknown-after-handoff"', '"status":"unknown-after-handoff","status":"included"')],
    ['repeated identical status', directJson.replace('"status":"unknown-after-handoff"', '"status":"unknown-after-handoff","status":"unknown-after-handoff"')],
    ['escaped duplicate status key', directJson.replace('"status":"unknown-after-handoff"', '"status":"unknown-after-handoff","st\\u0061tus":"reverted"')],
    ['chain identity', directJson.replace('"chainId":84532', '"chainId":84532,"chainId":11155111')],
    ['owner identity', directJson.replace(`"owner":"${owner}"`, `"owner":"${owner}","owner":"${otherOwner}"`)],
    ['expected transaction hash', directJson.replace(`"expectedHash":"${hash}"`, `"expectedHash":"${hash}","expectedHash":"${otherHash}"`)],
    ['direct nonce', directJson.replace('"nonce":3', '"nonce":3,"nonce":4')],
    ['relayed order nonce', relayedJson.replace('"nonce":"7"', '"nonce":"7","nonce":"8"')],
    ['relayed order deadline', relayedJson.replace('"deadline":1800001200', '"deadline":1800001200,"deadline":1')],
    ['relayed order contract', relayedJson.replace(`"relayer":"${otherOwner}"`, `"relayer":"${otherOwner}","relayer":"${owner}"`)],
    ['whole relayed order', relayedJson.replace(`"order":${orderJson}`, `"order":${orderJson},"order":${orderJson}`)],
  ])('refuses %s on read and before overwriting the journal', (_description, record) => {
    const raw = `[${record}]`;
    let stored = raw;
    let writes = 0;
    const storage: SweepJournalStorage = {
      getItem: (key) => key === SWEEP_JOURNAL_KEY ? stored : null,
      setItem: (_key, value) => { writes += 1; stored = value; },
    };

    expect(() => readSweepAttempts(storage)).toThrow(SweepJournalUnavailableError);
    expect(() => writeSweepAttempt(direct, storage)).toThrow(SweepJournalUnavailableError);
    expect(stored).toBe(raw);
    expect(writes).toBe(0);
  });

  it('preserves canonical direct replacement and full-width relayed order records', () => {
    const records = new Map<string, string>();
    const storage: SweepJournalStorage = {
      getItem: (key) => records.get(key) ?? null,
      setItem: (key, value) => { records.set(key, value); },
    };
    const replacement: SweepLock = { ...direct, nonce: Number.MAX_SAFE_INTEGER, otherHashes: [otherHash] };
    const relayed: SweepLock = {
      chainId: Number.MAX_SAFE_INTEGER,
      owner: otherOwner,
      order: { relayer: owner, nonce: 2n ** 256n - 1n, deadline: Number.MAX_SAFE_INTEGER },
      status: 'submitted',
    };
    writeSweepAttempt(replacement, storage);
    writeSweepAttempt(relayed, storage);
    expect(readSweepAttempts(storage)).toEqual([replacement, relayed]);
  });
});
