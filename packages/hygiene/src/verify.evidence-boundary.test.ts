import { describe, expect, it } from 'vitest';
import { addressFreeReceipt, spentCheck, sweepConfirmed, type VerifyRpc } from './verify.js';
import { A1, A2, TOKEN, TX, log } from './fixtures.testutil.js';

const STEALTH = '0xabcdef0123456789abcdef0123456789abcdef01';
const DEST = '0x9999999999999999999999999999999999999999';
const BLOCK_HASH = `0x${'cd'.repeat(32)}`;

function row(from: string, to: string, value: bigint, opts: {
  emitter?: string; block?: string; index?: string; hash?: string;
} = {}): Record<string, unknown> {
  return {
    ...log({ from, to, value, ...(opts.block === undefined ? {} : { block: opts.block }) }),
    address: opts.emitter ?? TOKEN,
    blockHash: opts.hash ?? BLOCK_HASH,
    logIndex: opts.index ?? '0x0',
  };
}

function rpcWith(...rows: unknown[]): VerifyRpc {
  return {
    chainId: 84532,
    request: () => Promise.resolve(rows),
  };
}

const receipt = {
  token: TOKEN as `0x${string}`,
  block: 100n,
  txHash: TX as `0x${string}`,
  stealth: STEALTH as `0x${string}`,
  net: 20n,
};

describe('GP-BUG-11: bind ERC-20 evidence to the requested log filter', () => {
  it('ignores a matching receipt forged under a different token emitter', async () => {
    const logRow = row(A1, STEALTH, 20n, { emitter: A2 });
    await expect(addressFreeReceipt(rpcWith(logRow), receipt)).resolves.toBe('absent');
  });

  it('ignores a matching transaction returned from a different block', async () => {
    const logRow = row(A1, STEALTH, 20n, { block: '0x65' });
    await expect(addressFreeReceipt(rpcWith(logRow), receipt)).resolves.toBe('absent');
  });

  it('does not interpret an old sweep Transfer as a new confirmation', async () => {
    const logRow = row(STEALTH, DEST, 20n, { block: '0x64' });
    await expect(sweepConfirmed(rpcWith(logRow), {
      token: TOKEN,
      from: STEALTH,
      to: DEST,
      net: 20n,
      head: 500n,
    })).resolves.toBe(false);
  });

  it('deduplicates the same event identity before calculating an outflow', async () => {
    const logRow = row(STEALTH, DEST, 4n);
    const result = await spentCheck(rpcWith(logRow, { ...logRow }), {
      token: TOKEN,
      stealth: STEALTH,
      fromBlock: 100n,
      head: 100n,
      net: 10n,
      routerOnly: true,
    });
    expect(result.outflow).toBe(4n);
    expect(result.balanceEstimate).toBe(6n);
  });

  it('discards conflicting rows that claim the same block hash and log index', async () => {
    const accepted = row(A1, STEALTH, 20n);
    const contradictory = row(A1, STEALTH, 999n);
    await expect(addressFreeReceipt(rpcWith(accepted, contradictory), receipt)).resolves.toBe('absent');
  });

  it('refuses receipt evidence without a usable log index or block identity', async () => {
    const logRow = row(A1, STEALTH, 20n);
    const missingIndex = { ...logRow };
    const missingHash = { ...logRow };
    delete missingIndex['logIndex'];
    delete missingHash['blockHash'];
    await expect(addressFreeReceipt(rpcWith(missingIndex), receipt)).resolves.toBe('absent');
    await expect(addressFreeReceipt(rpcWith(missingHash), receipt)).resolves.toBe('absent');
  });

  it('accepts distinct matching events with valid identities', async () => {
    const others = row(A1, A2, 5n, { index: '0x0' });
    const target = row(A1, STEALTH, 20n, { index: '0x1' });
    await expect(addressFreeReceipt(rpcWith(others, target), receipt)).resolves.toBe('confirmed');
  });
});
