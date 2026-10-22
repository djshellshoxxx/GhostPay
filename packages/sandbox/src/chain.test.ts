import { describe, expect, it } from 'vitest';
import {
  FAUCET_COOLDOWN_SECONDS,
  FAUCET_DEFAULT_AMOUNT,
  FAUCET_MAX_AMOUNT,
  ManualClock,
  MockChain,
  SandboxError,
  type Announcement,
  type Payment,
} from './index.js';

function setup(): { chain: MockChain; clock: ManualClock; a: string; b: string } {
  const clock = new ManualClock();
  const chain = new MockChain({ clock });
  const a = chain.account(0);
  const b = chain.account(1);
  chain.faucet(a, 1000n);
  return { chain, clock, a, b };
}

describe('MockChain basics', () => {
  it('refuses live chain ids and is flagged test', () => {
    expect(() => new MockChain({ chainId: 1 })).toThrow(SandboxError);
    expect(() => new MockChain({ chainId: 8453 })).toThrow(/reserved/);
    expect(new MockChain().test).toBe(true);
    expect(new MockChain().chainId).toBe(31337);
  });
  it('accounts deterministic and distinct', () => {
    const c1 = new MockChain({ seed: 's' });
    const c2 = new MockChain({ seed: 's' });
    expect(c1.account(0)).toBe(c2.account(0));
    expect(c1.account(0)).not.toBe(c1.account(1));
    expect(c1.account(0)).not.toBe(new MockChain({ seed: 't' }).account(0));
    expect(() => c1.account(-1)).toThrow(SandboxError);
  });
  it('same call sequence gives identical block hashes', () => {
    const run = (): string => {
      const { chain, a, b } = setup();
      chain.submit({ from: a, to: b, amount: 5n });
      return chain.mine().hash;
    };
    expect(run()).toBe(run());
  });
  it('transfers move exact balances and emit Payment', () => {
    const { chain, a, b } = setup();
    const h = chain.submit({ from: a, to: b, amount: 400n });
    expect(chain.getTx(h).status).toBe('pending');
    expect(chain.confirmations(h)).toBe(0);
    chain.mine();
    expect(chain.getTx(h).status).toBe('success');
    expect(chain.balanceOf(a)).toBe(600n);
    expect(chain.balanceOf(b)).toBe(400n);
    expect(chain.confirmations(h)).toBe(1);
    chain.mineBlocks(2);
    expect(chain.confirmations(h)).toBe(3);
    const ev = chain.getEvents({ type: 'Payment' }) as Payment[];
    expect(ev).toHaveLength(1);
    expect(ev[0]?.amount).toBe(400n);
    expect(chain.getBlock(0)?.number).toBe(0);
  });
  it('insufficient balance fails without moving funds', () => {
    const { chain, a, b } = setup();
    const h = chain.submit({ from: a, to: b, amount: 1001n });
    chain.mine();
    expect(chain.getTx(h).status).toBe('failed');
    expect(chain.balanceOf(a)).toBe(1000n);
    expect(chain.balanceOf(b)).toBe(0n);
    expect(chain.getEvents({ type: 'Payment' })).toHaveLength(0);
  });
  it('token balances are separate from native', () => {
    const { chain, a, b } = setup();
    const tok = `0x${'a'.repeat(40)}`;
    chain.submit({ from: a, to: b, amount: 1n, token: tok });
    chain.mine();
    expect(chain.balanceOf(b, tok)).toBe(0n);
    expect(chain.balanceOf(b, 'native')).toBe(0n);
  });
  it('announcements are emitted with the payment', () => {
    const { chain, a, b } = setup();
    chain.submit({ from: a, to: b, amount: 10n, announce: { ephemeralPubKey: '0x02aa', viewTag: '0x12' } });
    chain.submit({ from: a, to: b, amount: 10n, announce: { ephemeralPubKey: '0x02bb', viewTag: '0x13', metadata: '0x99' } });
    chain.mine();
    const ann = chain.getEvents({ type: 'Announcement' }) as Announcement[];
    expect(ann.map((e) => e.metadata)).toEqual(['0x', '0x99']);
    expect(ann[0]?.stealthAddress).toBe(b);
    expect(chain.getEvents({ fromBlock: 99 })).toHaveLength(0);
    expect(chain.getEvents({ toBlock: 0 })).toHaveLength(0);
  });
  it('validates inputs', () => {
    const { chain, a, b } = setup();
    expect(() => chain.submit({ from: 'nope', to: b, amount: 1n })).toThrow(SandboxError);
    expect(() => chain.submit({ from: a, to: b.toUpperCase(), amount: 1n })).toThrow(SandboxError);
    expect(() => chain.submit({ from: a, to: b, amount: 0n })).toThrow(SandboxError);
    expect(() => chain.submit({ from: a, to: b, amount: -1n })).toThrow(SandboxError);
    expect(() => chain.submit({ from: a, to: b, amount: 1n << 256n })).toThrow(SandboxError);
    expect(() => chain.submit({ from: a, to: b, amount: 1n, token: 'usdc' })).toThrow(SandboxError);
    expect(() => chain.submit({ from: a, to: b, amount: 1n, announce: { ephemeralPubKey: '', viewTag: '1' } })).toThrow(SandboxError);
    expect(() => chain.getTx('0x00')).toThrow(/unknown/);
    expect(() => chain.mineBlocks(0)).toThrow(SandboxError);
    expect(() => chain.balanceOf('x')).toThrow(SandboxError);
  });
});

describe('faucet', () => {
  it('drips default, enforces cap and cooldown with clock control', () => {
    const clock = new ManualClock();
    const chain = new MockChain({ clock });
    const a = chain.account(0);
    chain.faucet(a);
    expect(chain.balanceOf(a)).toBe(FAUCET_DEFAULT_AMOUNT);
    expect(() => chain.faucet(a)).toThrow(/cooldown/);
    clock.advance(FAUCET_COOLDOWN_SECONDS - 1);
    expect(() => chain.faucet(a)).toThrow(/cooldown/);
    clock.advance(1);
    chain.faucet(a, FAUCET_MAX_AMOUNT);
    expect(chain.balanceOf(a)).toBe(FAUCET_DEFAULT_AMOUNT + FAUCET_MAX_AMOUNT);
    clock.advance(60);
    expect(() => chain.faucet(a, FAUCET_MAX_AMOUNT + 1n)).toThrow(/cap/);
    expect(() => chain.faucet(a, 0n)).toThrow(SandboxError);
    expect(() => chain.faucet('bad')).toThrow(SandboxError);
    expect(chain.faucet(chain.account(5))).toMatch(/^0x/);
  });
});

describe('clock and delay injection', () => {
  it('delayed tx is not mined until the clock catches up', () => {
    const { chain, clock, a, b } = setup();
    chain.faults.delaySeconds = 30;
    const h = chain.submit({ from: a, to: b, amount: 1n });
    chain.mine();
    expect(chain.getTx(h).status).toBe('pending');
    clock.advance(29);
    chain.mine();
    expect(chain.getTx(h).status).toBe('pending');
    clock.advance(1);
    chain.mine();
    expect(chain.getTx(h).status).toBe('success');
    expect(chain.getBlock(chain.height)?.timestamp).toBe(clock.now());
  });
});

describe('fault injection', () => {
  it('failNext reverts exactly N txs', () => {
    const { chain, a, b } = setup();
    chain.faults.failNext = 1;
    const h1 = chain.submit({ from: a, to: b, amount: 1n });
    const h2 = chain.submit({ from: a, to: b, amount: 1n });
    chain.mine();
    expect(chain.getTx(h1).status).toBe('failed');
    expect(chain.getTx(h1).blockNumber).toBe(chain.height);
    expect(chain.getTx(h2).status).toBe('success');
    expect(chain.balanceOf(b)).toBe(1n);
    expect(chain.faults.failNext).toBe(0);
  });
  it('dropNext never mines', () => {
    const { chain, a, b } = setup();
    chain.faults.dropNext = 1;
    const h = chain.submit({ from: a, to: b, amount: 1n });
    chain.mineBlocks(3);
    expect(chain.getTx(h).status).toBe('dropped');
    expect(chain.balanceOf(b)).toBe(0n);
  });
});

describe('reorg', () => {
  it('replay: state reverts then tx re-mines in a block with a new hash', () => {
    const { chain, a, b } = setup();
    const h = chain.submit({ from: a, to: b, amount: 100n, announce: { ephemeralPubKey: '0x02aa', viewTag: '0x01' } });
    const mined = chain.mine();
    chain.mine();
    expect(chain.height).toBe(3);
    chain.reorg(2);
    expect(chain.height).toBe(1);
    expect(chain.balanceOf(b)).toBe(0n);
    expect(chain.balanceOf(a)).toBe(1000n);
    expect(chain.getEvents()).toHaveLength(0);
    expect(chain.getTx(h).status).toBe('pending');
    expect(chain.confirmations(h)).toBe(0);
    const again = chain.mine();
    expect(again.number).toBe(mined.number);
    expect(again.hash).not.toBe(mined.hash);
    expect(chain.balanceOf(b)).toBe(100n);
    expect(chain.getEvents({ type: 'Announcement' })).toHaveLength(1);
  });
  it('no replay drops transfers; faucet mints in removed blocks vanish', () => {
    const { chain, a, b } = setup();
    const h = chain.submit({ from: a, to: b, amount: 100n });
    chain.mine();
    chain.reorg(2, { replay: false });
    expect(chain.getTx(h).status).toBe('dropped');
    expect(chain.balanceOf(a)).toBe(0n);
    chain.mine();
    expect(chain.balanceOf(b)).toBe(0n);
  });
  it('rejects bad depths', () => {
    const { chain } = setup();
    expect(() => chain.reorg(0)).toThrow(SandboxError);
    expect(() => chain.reorg(2)).toThrow(SandboxError);
    expect(() => chain.reorg(1.5)).toThrow(SandboxError);
    expect(() => chain.reorg(1)).not.toThrow();
  });
});
