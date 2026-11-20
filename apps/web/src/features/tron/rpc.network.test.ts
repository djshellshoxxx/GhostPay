import { describe, expect, it } from 'vitest';
import { mockTron, walletA } from './fixtures.testutil';
import { MAINNET_GENESIS, NILE_GENESIS, SHASTA_GENESIS, type TronNetworkId } from './network';
import { checkNetwork, createRpc } from './rpc';

function nodeWithGenesis(genesis: string) {
  const chain = mockTron(walletA());
  chain.genesis = genesis;
  return { chain, rpc: createRpc('http://127.0.0.1:9090', chain.fetchFn) };
}

describe('TRON selected-network genesis guard (TRON-4 / GP-BUG-15)', () => {
  it.each([
    ['nile', NILE_GENESIS],
    ['shasta', SHASTA_GENESIS],
  ] as const)('accepts only the known %s genesis for that testnet', async (selected, genesis) => {
    const { rpc } = nodeWithGenesis(genesis.toUpperCase());
    await expect(checkNetwork(rpc, selected)).resolves.toBeUndefined();
  });

  it.each([
    ['nile', SHASTA_GENESIS],
    ['shasta', NILE_GENESIS],
    ['nile', '0'.repeat(64)],
    ['shasta', '0'.repeat(64)],
  ] as const)('rejects %s when the endpoint reports a different or unknown genesis', async (selected, genesis) => {
    const { chain, rpc } = nodeWithGenesis(genesis);
    await expect(checkNetwork(rpc, selected)).rejects.toMatchObject({
      translation: { key: 'tron.error.chainMismatch' },
    });
    expect(chain.calls).not.toContain('/wallet/getnowblock');
  });

  it.each(['nile', 'shasta', 'local'] as const)('always rejects mainnet genesis with %s selected', async (selected) => {
    const { rpc } = nodeWithGenesis(MAINNET_GENESIS);
    await expect(checkNetwork(rpc, selected)).rejects.toMatchObject({
      translation: { key: 'tron.error.mainnet' },
    });
  });

  it('rejects a mainnet selection before querying a node', async () => {
    const { chain, rpc } = nodeWithGenesis(NILE_GENESIS);
    await expect(checkNetwork(rpc, 'mainnet')).rejects.toMatchObject({
      translation: { key: 'tron.error.mainnet' },
    });
    expect(chain.calls).toHaveLength(0);
  });

  it.each([NILE_GENESIS, SHASTA_GENESIS])('does not mislabel a public testnet as local', async (genesis) => {
    const { rpc } = nodeWithGenesis(genesis);
    await expect(checkNetwork(rpc, 'local')).rejects.toMatchObject({
      translation: { key: 'tron.error.chainMismatch' },
    });
  });

  it('allows an explicit local selection only for an unrecognized non-mainnet genesis', async () => {
    const { rpc } = nodeWithGenesis('0'.repeat(64));
    await expect(checkNetwork(rpc, 'local')).resolves.toBeUndefined();
  });

  it('fails closed for unexpected runtime network identifiers', async () => {
    const { rpc } = nodeWithGenesis(NILE_GENESIS);
    await expect(checkNetwork(rpc, 'typo' as TronNetworkId)).rejects.toMatchObject({
      translation: { key: 'tron.error.chainMismatch' },
    });
  });
});
