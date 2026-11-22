import { describe, expect, it } from 'vitest';
import { mockRpc } from '../test/mockRpc';
import { sweepFeeReserve, type SweepTxFields } from './opStackFee';

const OP_STACK_TX: SweepTxFields = {
  chainId: 84532, // Base Sepolia
  nonce: 7,
  maxFeePerGas: 2_000_000_000n,
  maxPriorityFeePerGas: 100_000_000n,
  gas: 21_000n,
  to: '0x7777777777777777777777777777777777777777',
  value: 1_000_000n,
  data: '0x',
};

describe('OP Stack fee-reserve serialization failures', () => {
  it.each([
    ['negative nonce', { nonce: -1 }],
    ['negative gas limit', { gas: -1n }],
    ['negative transfer value', { value: -1n }],
    ['tip above fee cap', { maxPriorityFeePerGas: 2_000_000_001n }],
  ] as const)('fails closed with a typed public error on %s before contacting the oracle', async (_name, fields) => {
    const rpc = mockRpc(84532, () => { throw new Error('must not query oracle'); });
    await expect(sweepFeeReserve(rpc, { ...OP_STACK_TX, ...fields })).rejects.toMatchObject({
      name: 'UserFacingError',
      translation: { key: 'error.sweep.couldNotReadTheL1DataFeeFromThisChain' },
    });
    expect(rpc.calls).toHaveLength(0);
  });

  it('keeps non-OP chains independent of OP Stack serialization and oracle requests', async () => {
    const rpc = mockRpc(11155111, () => { throw new Error('must not query oracle'); });
    expect(await sweepFeeReserve(rpc, { ...OP_STACK_TX, chainId: 11155111 })).toBe(0n);
    expect(rpc.calls).toHaveLength(0);
  });

  it('preserves valid OP Stack L1 plus operator fee arithmetic', async () => {
    const rpc = mockRpc(84532, (method) => {
      if (method !== 'eth_call') throw new Error('unexpected request');
      return `0x${'0'.repeat(63)}3`;
    });
    expect(await sweepFeeReserve(rpc, OP_STACK_TX)).toBe(12n);
    expect(rpc.calls).toHaveLength(2);
  });
});
