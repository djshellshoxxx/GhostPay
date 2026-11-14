import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MockChain, readClock, readRandom, toHex } from './chain.js';
import { SandboxError } from './errors.js';
import { isTestAddress, isTestTxId } from './brand.js';
import { manualClock, seededRng } from './sandbox.testutil.js';

function mk(extra: Partial<ConstructorParameters<typeof MockChain>[0]> = {}) {
  const c = manualClock();
  const chain = new MockChain({ rng: seededRng(7), clock: c.clock, ...extra });
  return { chain, c };
}
const code = (f: () => unknown): string | undefined => {
  try {
    f();
  } catch (e) {
    return (e as SandboxError).code;
  }
  return undefined;
};

describe('helpers', () => {
  it('toHex', () => expect(toHex(new Uint8Array([0, 15, 255]))).toBe('000fff'));
  it('readRandom validates', () => {
    expect(code(() => readRandom(() => new Uint8Array(3), 4))).toBe('invalid-rng');
    expect(code(() => readRandom((() => [1, 2]) as never, 2))).toBe('invalid-rng');
  });
  it('readClock validates', () => {
    for (const v of [-1, 1.5, NaN, Infinity]) expect(code(() => readClock(() => v))).toBe('invalid-clock');
    expect(readClock(() => 5)).toBe(5);
  });
});

describe('construction', () => {
  it('validates options', () => {
    const c = manualClock().clock;
    expect(code(() => new MockChain({ rng: undefined as never, clock: c }))).toBe('invalid-option');
    expect(code(() => new MockChain({ rng: seededRng(), clock: undefined as never }))).toBe('invalid-option');
    for (const o of [
      { confirmationsRequired: 0 },
      { confirmationsRequired: 101 },
      { maxAccounts: 0 },
      { maxTransactions: 1.5 },
    ]) {
      expect(code(() => new MockChain({ rng: seededRng(), clock: c, ...o }))).toBe('invalid-option');
    }
  });
  it('defaults', () => {
    const { chain } = mk();
    expect(chain.confirmationsRequired).toBe(3);
    expect(chain.blockHeight).toBe(0);
  });
});

describe('accounts', () => {
  it('creates deterministic branded addresses from the rng', () => {
    const a = mk().chain.createAccount();
    const b = mk().chain.createAccount();
    expect(a).toBe(b);
    expect(isTestAddress(a)).toBe(true);
    const { chain } = mk();
    expect(chain.createAccount('A')).not.toBe(chain.createAccount('B'));
    expect(chain.listAccounts().map((x) => x.label)).toEqual(['A', 'B']);
    expect(chain.getAccount(a === a ? chain.listAccounts()[0]!.address : a).balance).toBe(0n);
  });
  it('rejects bad labels and enforces max accounts', () => {
    const { chain } = mk({ maxAccounts: 2 });
    for (const l of ['', '   ', 'x'.repeat(41), 'a\nb', 5 as never])
      expect(code(() => chain.createAccount(l))).toBe('invalid-option');
    chain.createAccount();
    chain.createAccount();
    expect(code(() => chain.createAccount())).toBe('limit-exceeded');
  });
  it('detects rng collisions', () => {
    const chain = new MockChain({ rng: () => new Uint8Array(16), clock: manualClock().clock });
    chain.createAccount();
    expect(code(() => chain.createAccount())).toBe('id-collision');
  });
  it('unknown / malformed addresses', () => {
    const { chain } = mk();
    expect(code(() => chain.getBalance('test1' + '00'.repeat(16)))).toBe('unknown-account');
    expect(code(() => chain.getBalance('bc1qxyz'))).toBe('invalid-address');
    expect(chain.hasAccount(5)).toBe(false);
    expect(chain.hasAccount('test1' + '00'.repeat(16))).toBe(false);
  });
});

describe('transfers and confirmations', () => {
  function funded() {
    const { chain, c } = mk();
    const a = chain.createAccount('A');
    const b = chain.createAccount('B');
    chain.mintFaucet(a, 1000n);
    chain.mine(3);
    return { chain, c, a, b };
  }
  it('faucet mint confirms after N blocks', () => {
    const { chain } = mk();
    const a = chain.createAccount();
    const tx = chain.mintFaucet(a, 500n);
    expect(tx).toMatchObject({
      kind: 'faucet',
      from: null,
      status: 'pending',
      confirmations: 0,
      network: 'sandbox-test',
    });
    expect(isTestTxId(tx.id)).toBe(true);
    expect(chain.mine(2)).toEqual([]);
    expect(chain.getTx(tx.id)).toMatchObject({ confirmations: 2, status: 'pending' });
    expect(chain.getBalance(a)).toBe(0n);
    expect(chain.mine(1)).toEqual([tx.id]);
    expect(chain.getTx(tx.id)).toMatchObject({ confirmations: 3, status: 'confirmed' });
    expect(chain.getBalance(a)).toBe(500n);
    expect(chain.mine(5)).toEqual([]);
    expect(chain.getTx(tx.id)?.confirmations).toBe(3);
  });
  it('transfer debits immediately, credits on confirmation', () => {
    const { chain, a, b } = funded();
    const tx = chain.transfer(a, b, 300n);
    expect(chain.getBalance(a)).toBe(700n);
    expect(chain.getBalance(b)).toBe(0n);
    expect(chain.totalSupply()).toBe(1000n);
    chain.mine(3);
    expect(chain.getBalance(b)).toBe(300n);
    expect(chain.getTx(tx.id)?.status).toBe('confirmed');
  });
  it('rejects overspend, self-send, zero, unknown', () => {
    const { chain, a, b } = funded();
    expect(code(() => chain.transfer(a, b, 1001n))).toBe('insufficient-funds');
    expect(code(() => chain.transfer(a, a, 1n))).toBe('same-account');
    expect(code(() => chain.transfer(a, b, 0n))).toBe('invalid-amount');
    expect(code(() => chain.transfer(a, b, 5 as never))).toBe('invalid-amount');
    expect(code(() => chain.transfer(a, 'test1' + '11'.repeat(16), 1n))).toBe('unknown-account');
    expect(code(() => chain.mintFaucet(a, -1n))).toBe('invalid-amount');
    expect(chain.getBalance(a)).toBe(1000n);
  });
  it('mine validates block count', () => {
    const { chain } = mk();
    for (const n of [0, 1001, 1.5]) expect(code(() => chain.mine(n))).toBe('invalid-option');
  });
  it('tx limit and tx collision', () => {
    const { chain } = mk({ maxTransactions: 1 });
    const a = chain.createAccount();
    chain.mintFaucet(a, 1n);
    expect(code(() => chain.mintFaucet(a, 1n))).toBe('limit-exceeded');
    const y = new MockChain({
      rng: (() => {
        let k = 0;
        return (l: number) => new Uint8Array(l).fill(k++ === 0 ? 9 : 5);
      })(),
      clock: manualClock().clock,
    });
    const acct = y.createAccount();
    y.mintFaucet(acct, 1n);
    expect(code(() => y.mintFaucet(acct, 1n))).toBe('id-collision');
  });
  it('listTxs newest first, getTx unknown and snapshots frozen', () => {
    const { chain, a, b } = funded();
    const t = chain.transfer(a, b, 1n);
    expect(chain.listTxs()[0]?.id).toBe(t.id);
    expect(chain.getTx('nope')).toBeUndefined();
    expect(chain.getTx(5)).toBeUndefined();
    expect(Object.isFrozen(t)).toBe(true);
  });
  it('reset clears everything', () => {
    const { chain, a } = funded();
    chain.reset();
    expect(chain.listAccounts()).toEqual([]);
    expect(chain.listTxs()).toEqual([]);
    expect(chain.blockHeight).toBe(0);
    expect(chain.totalMinted).toBe(0n);
    expect(code(() => chain.getBalance(a))).toBe('unknown-account');
  });
  it('property: supply conservation under random ops', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(
            fc.integer({ min: 0, max: 2 }),
            fc.integer({ min: 0, max: 2 }),
            fc.bigInt({ min: 1n, max: 500n }),
            fc.integer({ min: 0, max: 3 }),
          ),
          { maxLength: 40 },
        ),
        (ops) => {
          const { chain } = mk();
          const accts = [chain.createAccount(), chain.createAccount(), chain.createAccount()];
          for (const [i, j, amt, blocks] of ops) {
            try {
              chain.mintFaucet(accts[i]!, amt);
            } catch {
              /* none */
            }
            try {
              chain.transfer(accts[i]!, accts[j]!, amt / 2n + 1n);
            } catch {
              /* insufficient/self */
            }
            if (blocks > 0) chain.mine(blocks);
            expect(chain.totalSupply()).toBe(chain.totalMinted);
            for (const a of accts) expect(chain.getBalance(a) >= 0n).toBe(true);
          }
        },
      ),
    );
  });
});
