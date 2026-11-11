import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  FileStateBackend,
  MemoryStateBackend,
  StateError,
  StateJournal,
  acquireStateLock,
  decodeState,
  encodeState,
  type ChainState,
} from './stateStore.js';

const dirs: string[] = [];
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), 'relayer-state-'));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const H = `0x${'ab'.repeat(32)}` as const;
const sample: ChainState = {
  budget: { day: 21990, spentWei: 123n },
  sends: [
    { id: '0123456789abcdef', nonce: 7, txHash: H, reservedWei: 10n ** 30n, reservedDay: 21990, gasPriceWei: 1n, status: 'pending', createdAtMs: 5 },
    { id: 'fedcba9876543210', nonce: 8, reservedWei: 0n, reservedDay: 21990, gasPriceWei: 2n, status: 'reserved', createdAtMs: 6 },
  ],
};
const doc = (chains: Record<string, unknown>): string => JSON.stringify({ version: 1, chains });
const goodSend = { id: '0123456789abcdef', nonce: 1, reservedWei: '1', reservedDay: 1, gasPriceWei: '1', status: 'reserved', createdAtMs: 1 };
const withSend = (over: Record<string, unknown>): string => doc({ '1': { budget: { day: 1, spentWei: '0' }, sends: [{ ...goodSend, ...over }] } });

describe('encodeState / decodeState', () => {
  it('round-trips exactly, with sorted chains and lower-case hashes, and carries no order data', () => {
    const text = encodeState(new Map([[84532, sample], [1, { budget: { day: 0, spentWei: 0n }, sends: [] }]]));
    expect(Object.keys((JSON.parse(text) as { chains: object }).chains)).toEqual(['1', '84532']);
    expect(decodeState(text).get(84532)).toEqual(sample);
    expect(text).not.toMatch(/owner|destination|token|amount|fee|sig/i);
    const upper = encodeState(new Map([[1, { ...sample, sends: [{ ...sample.sends[0], txHash: `0x${'AB'.repeat(32)}` } as never] }]]));
    expect(upper).toContain(H);
  });

  it.each([
    ['not JSON', '{'],
    ['root', '[]'],
    ['unexpected root key', JSON.stringify({ version: 1, chains: {}, extra: 1 })],
    ['missing key', JSON.stringify({ version: 1 })],
    ['version', JSON.stringify({ version: 2, chains: {} })],
    ['chain id', doc({ '0': { budget: { day: 1, spentWei: '0' }, sends: [] } })],
    ['chain id text', doc({ abc: { budget: { day: 1, spentWei: '0' }, sends: [] } })],
    ['budget day', doc({ '1': { budget: { day: -1, spentWei: '0' }, sends: [] } })],
    ['budget wei', doc({ '1': { budget: { day: 1, spentWei: '01' }, sends: [] } })],
    ['budget wei type', doc({ '1': { budget: { day: 1, spentWei: 5 }, sends: [] } })],
    ['sends type', doc({ '1': { budget: { day: 1, spentWei: '0' }, sends: {} } })],
    ['too many sends', doc({ '1': { budget: { day: 1, spentWei: '0' }, sends: Array.from({ length: 65 }, () => goodSend) } })],
    ['send id', withSend({ id: 'XYZ' })],
    ['status', withSend({ status: 'done' })],
    ['hash', withSend({ txHash: '0x12' })],
    ['pending without hash', withSend({ status: 'pending' })],
    ['nonce', withSend({ nonce: 1.5 })],
    ['unknown send key', withSend({ owner: '0x00' })],
  ])('rejects %s', (_what, text) => {
    expect(() => decodeState(text)).toThrow(StateError);
  });

  it('rejects duplicate record ids', () => {
    expect(() => decodeState(doc({ '1': { budget: { day: 1, spentWei: '0' }, sends: [goodSend, goodSend] } }))).toThrow(/id/);
  });

  it('accepts a hashless signed record (a client that lost the hash after handoff)', () => {
    expect(decodeState(withSend({ status: 'signed' })).get(1)?.sends[0]?.status).toBe('signed');
  });
});

describe('FileStateBackend', () => {
  it('reads null before the first write, writes atomically with mode 0600 and leaves no temp files', () => {
    const d = tmp();
    const b = new FileStateBackend(join(d, 'state.json'));
    expect(b.read()).toBeNull();
    b.write('one');
    b.write('two');
    expect(b.read()).toBe('two');
    expect(statSync(join(d, 'state.json')).mode & 0o777).toBe(0o600);
    expect(readdirSync(d)).toEqual(['state.json']);
  });

  it('fails closed on a directory, an oversized file and an unwritable location', () => {
    const d = tmp();
    mkdirSync(join(d, 'dir'));
    expect(() => new FileStateBackend(join(d, 'dir')).read()).toThrow('not a regular file');
    writeFileSync(join(d, 'big.json'), Buffer.alloc((1 << 20) + 1));
    expect(() => new FileStateBackend(join(d, 'big.json')).read()).toThrow('too large');
    expect(() => new FileStateBackend(join(d, 'missing', 'state.json')).write('x')).toThrow('cannot be written');
    expect(() => new FileStateBackend(join(d, 'big.json', 'x')).read()).toThrow('cannot be read');
  });

  it('removes its temp file when the rename fails', () => {
    const d = tmp();
    mkdirSync(join(d, 'state.json'));
    mkdirSync(join(d, 'state.json', 'occupied'));
    expect(() => new FileStateBackend(join(d, 'state.json')).write('x')).toThrow(StateError);
    expect(readdirSync(d)).toEqual(['state.json']);
  });
});

describe('StateJournal', () => {
  it('adds, updates and removes records with the budget in the same write, and persists across reopen', () => {
    const b = new MemoryStateBackend();
    const j = new StateJournal(b, () => 42);
    expect(j.chain(1)).toEqual({ budget: { day: 0, spentWei: 0n }, sends: [] });
    const id = j.addSend(1, { nonce: 3, reservedWei: 9n, reservedDay: 2, gasPriceWei: 1n, status: 'reserved' }, { day: 2, spentWei: 9n });
    j.updateSend(1, id, { status: 'signed', txHash: H });
    j.updateSend(1, 'ffffffffffffffff', { status: 'pending' }); // unknown id: no-op
    expect(new StateJournal(b).chain(1)).toEqual({
      budget: { day: 2, spentWei: 9n },
      sends: [{ id, nonce: 3, txHash: H, reservedWei: 9n, reservedDay: 2, gasPriceWei: 1n, status: 'signed', createdAtMs: 42 }],
    });
    const before = b.writes;
    j.removeSend(1, 'ffffffffffffffff'); // nothing to do: no write
    j.setBudget(1, 2, 9n); // unchanged: no write
    expect(b.writes).toBe(before);
    j.removeSend(1, id, { day: 2, spentWei: 4n });
    j.setBudget(1, 3, 1n);
    expect(new StateJournal(b).chain(1)).toEqual({ budget: { day: 3, spentWei: 1n }, sends: [] });
    expect(j.chainIds()).toEqual([1]);
  });

  it('keeps the in-memory copy unchanged when a write fails', () => {
    const b = new MemoryStateBackend();
    const j = new StateJournal(b);
    b.failWith = new StateError('state file cannot be written');
    expect(() => j.addSend(1, { nonce: 1, reservedWei: 1n, reservedDay: 1, gasPriceWei: 1n, status: 'reserved' }, { day: 1, spentWei: 1n })).toThrow(StateError);
    expect(j.chain(1).sends).toEqual([]);
  });

  it('refuses more than 64 unsettled records per chain', () => {
    const j = new StateJournal(new MemoryStateBackend());
    for (let i = 0; i < 64; i += 1) j.addSend(1, { nonce: i, reservedWei: 1n, reservedDay: 1, gasPriceWei: 1n, status: 'reserved' }, { day: 1, spentWei: 1n });
    expect(() => j.addSend(1, { nonce: 99, reservedWei: 1n, reservedDay: 1, gasPriceWei: 1n, status: 'reserved' }, { day: 1, spentWei: 1n })).toThrow('too many');
  });

  it('refuses to start from a corrupt file instead of resetting the budget', () => {
    const b = new MemoryStateBackend();
    b.text = '{"version":1,"chains":{"1":{"budget":{"day":1}}}}';
    expect(() => new StateJournal(b)).toThrow(StateError);
  });
});

describe('acquireStateLock', () => {
  it('refuses a second live writer, takes over a stale lock or one left by this host and pid, and releases only its own', () => {
    const d = tmp();
    const file = join(d, 'state.json');
    let now = 1_000_000;
    const a = acquireStateLock(file, { pid: 10, host: 'h1', now: () => now });
    expect(() => acquireStateLock(file, { pid: 11, host: 'h1', now: () => now })).toThrow('locked by another');
    expect(() => acquireStateLock(file, { pid: 10, host: 'h2', now: () => now })).toThrow('locked by another');
    now += 10_000;
    a.heartbeat();
    now += 25_000;
    expect(() => acquireStateLock(file, { pid: 11, host: 'h1', now: () => now })).toThrow('locked by another'); // beat 25 s ago
    const restarted = acquireStateLock(file, { pid: 10, host: 'h1', now: () => now }); // same container restarted
    now += 31_000;
    const b = acquireStateLock(file, { pid: 12, host: 'h3', now: () => now }); // stale: taken over
    expect(() => restarted.heartbeat()).toThrow('taken over');
    a.release(); // not ours any more: the new holder keeps it
    expect(() => acquireStateLock(file, { pid: 13, host: 'h3', now: () => now })).toThrow('locked by another');
    b.release();
    b.release();
    expect(readdirSync(d)).toEqual([]);
    expect(() => a.heartbeat()).toThrow('taken over');
  });

  it('treats an unparsable lock file as stale', () => {
    const d = tmp();
    const file = join(d, 'state.json');
    writeFileSync(`${file}.lock`, 'garbage');
    const l = acquireStateLock(file, { pid: 1, host: 'h', now: () => 0 });
    l.heartbeat();
    writeFileSync(`${file}.lock`, 'garbage');
    expect(() => l.heartbeat()).toThrow('taken over');
  });
});
