import { expect, it } from 'vitest';
import { ManualClock, MockChain } from './index.js';

const setup = () => {
  const clock = new ManualClock();
  const chain = new MockChain({ clock });
  const from = chain.account(0), to = chain.account(1);
  chain.faucet(from, 100n);
  return { chain, clock, from, to };
};

it('detaches submitted announcements and transaction snapshots', () => {
  const { chain, from, to } = setup();
  const announce = { ephemeralPubKey: '0x02aa', viewTag: '0x01', metadata: '0x99' };
  const hash = chain.submit({ from, to, amount: 5n, announce });
  announce.metadata = 'changed';
  const tx = chain.getTx(hash);
  tx.status = 'dropped';
  (tx.request as { amount: bigint }).amount = 99n;
  (tx.request.announce as { metadata: string }).metadata = 'also changed';
  chain.mine();
  expect(chain.balanceOf(to)).toBe(5n);
  expect(chain.getTx(hash).status).toBe('success');
  expect(chain.getEvents({ type: 'Announcement' })[0]).toMatchObject({ metadata: '0x99' });
  expect(tx.status).toBe('dropped');
});

it('detaches mined blocks, queried blocks and event snapshots', () => {
  const { chain, from, to } = setup();
  const hash = chain.submit({ from, to, amount: 5n });
  const block = chain.mine();
  (block.txHashes as string[]).length = 0;
  (chain.getBlock(chain.height) as { number: number }).number = 999;
  (chain.getEvents()[0] as { amount: bigint }).amount = 99n;
  expect(chain.height).toBe(2);
  expect(chain.getEvents()[0]).toMatchObject({ amount: 5n });
  chain.reorg(1);
  expect(chain.getTx(hash).status).toBe('pending');
  chain.mine();
  expect(chain.balanceOf(to)).toBe(5n);
});

it.each([NaN, Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1])('rejects invalid fault controls before mutation: %s', (value) => {
  for (const field of ['delaySeconds', 'failNext', 'dropNext'] as const) {
    const { chain, from, to } = setup();
    chain.faults[field] = value;
    expect(() => chain.submit({ from, to, amount: 5n })).toThrow(/fault/);
    chain.faults[field] = 0;
    const hash = chain.submit({ from, to, amount: 5n });
    const fresh = setup();
    expect(hash).toBe(fresh.chain.submit({ from, to, amount: 5n }));
  }
});

it('rejects clock overflow without advancing it', () => {
  const clock = new ManualClock(Number.MAX_SAFE_INTEGER - 1);
  expect(() => clock.advance(2)).toThrow(/clock/);
  expect(clock.now()).toBe(Number.MAX_SAFE_INTEGER - 1);
});

it('rejects an unsafe ready time without submitting', () => {
  const { chain, from, to } = setup();
  chain.faults.delaySeconds = Number.MAX_SAFE_INTEGER;
  expect(() => chain.submit({ from, to, amount: 1n })).toThrow(/fault/);
});

it('keeps injected failure attached to the transaction across reorg replay', () => {
  const { chain, from, to } = setup();
  chain.faults.failNext = 1;
  const failed = chain.submit({ from, to, amount: 5n });
  const succeeded = chain.submit({ from, to, amount: 7n });
  chain.mine();
  chain.reorg(1);
  chain.mine();
  expect(chain.getTx(failed).status).toBe('failed');
  expect(chain.getTx(succeeded).status).toBe('success');
  expect(chain.balanceOf(from) + chain.balanceOf(to)).toBe(100n);
  expect(chain.balanceOf(to)).toBe(7n);
});

it('validates custom clocks before mutating balances, transactions or blocks', () => {
  let now = 100;
  const chain = new MockChain({ clock: { now: () => now } });
  const from = chain.account(0), to = chain.account(1);
  chain.faucet(from, 100n);
  const hash = chain.submit({ from, to, amount: 5n });
  now = NaN;
  expect(() => chain.mine()).toThrow(/clock/);
  expect(() => chain.faucet(to)).toThrow(/clock/);
  expect(() => chain.submit({ from, to, amount: 1n })).toThrow(/clock/);
  expect(chain.height).toBe(1);
  expect(chain.balanceOf(from)).toBe(100n);
  expect(chain.getTx(hash).status).toBe('pending');
  expect(() => new MockChain({ clock: { now: () => Infinity } })).toThrow(/clock/);
  now = 99;
  expect(chain.mine().timestamp).toBe(100);
});

it.each([null, { ephemeralPubKey: 3, viewTag: 'tag' }, { ephemeralPubKey: 'key', viewTag: 0 }, { ephemeralPubKey: 'key', viewTag: 'tag', metadata: 3 }])('rejects malformed announcement values', (announce) => {
  const { chain, from, to } = setup();
  expect(() => chain.submit({ from, to, amount: 5n, announce: announce as never })).toThrow(/announcement/);
});
