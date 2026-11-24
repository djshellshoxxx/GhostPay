import { chainlinkAggregatorAbi, type QualifiedFeed } from '@ghostpay/chain-adapters';
import { encodeFunctionResult } from 'viem/utils';
import { NOW } from './invoiceFixtures';
import { mockRpc } from './mockRpc';

export const fixtureFeed: QualifiedFeed = {
  chainId: 84532, base: 'USDC', quote: 'USD', address: '0x7777777777777777777777777777777777777777',
  decimals: 8, heartbeatSec: 60, sourceRef: 'test fixture',
  qualification: {
    blockNumber: 1, blockHash: `0x${'ab'.repeat(32)}`,
    sequencerFeed: '0x3333333333333333333333333333333333333333',
    reference: { address: '0x2222222222222222222222222222222222222222', decimals: 18, maxAgeSec: 600 },
  },
};

export function priceRpc(updatedAt = NOW, decimals = 8, referenceTime = NOW, answer = 100_000_000n) {
  return mockRpc(fixtureFeed.chainId, (method, params) => {
    if (method !== 'eth_call') throw new Error('unexpected request');
    const { to, data } = params[0] as { to: string; data: string };
    const policy = fixtureFeed.qualification;
    const reference = to === policy.reference.address;
    const sequencer = to === policy.sequencerFeed;
    if (!sequencer && !reference && to !== fixtureFeed.address) throw new Error('unexpected feed');
    if (data === '0x313ce567') return encodeFunctionResult({ abi: chainlinkAggregatorAbi, functionName: 'decimals', result: reference ? 18 : decimals });
    const time = BigInt(sequencer ? NOW - 4000 : reference ? referenceTime : updatedAt);
    const value = sequencer ? 0n : reference ? answer * 10n ** 10n : answer;
    return encodeFunctionResult({ abi: chainlinkAggregatorAbi, functionName: 'latestRoundData', result: [7n, value, time, time, 7n] });
  });
}
