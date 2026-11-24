import assert from 'node:assert/strict';
import test from 'node:test';
import { chainlinkAggregatorAbi } from '@ghostpay/chain-adapters';
import { encodeFunctionData, encodeFunctionResult, keccak256 } from 'viem/utils';
import { replay } from '../verify-price-feeds.mjs';

const primary = '0x1111111111111111111111111111111111111111';
const reference = '0x2222222222222222222222222222222222222222';
const blockHash = '0x' + 'ab'.repeat(32);
const feed = { address: primary, base: 'ETH', quote: 'USD', decimals: 8, heartbeatSec: 60, chainId: 11155111,
  qualification: { blockNumber: 12, blockHash, reference: { address: reference, decimals: 18, maxAgeSec: 90 } } };
const word = (functionName, result) => [
  encodeFunctionData({ abi: chainlinkAggregatorAbi, functionName }),
  encodeFunctionResult({ abi: chainlinkAggregatorAbi, functionName, result }),
];
function observation(scale, time = 990n) {
  return { codeHash: keccak256('0x6001'), ...Object.fromEntries([word('decimals', scale),
    word('latestRoundData', [3n, 2500n * 10n ** BigInt(scale), time, time, 3n])]) };
}
const snapshot = () => ({ chainId: feed.chainId, blockNumber: 12, blockHash, timestamp: 1000,
  calls: { [primary]: observation(8), [reference]: observation(18) } });

test('replays the captured ABI bytes across decimal scales at the pinned chain and time', async () => {
  const result = await replay(feed, snapshot());
  assert.equal(result.answer, 250000000000n);
  assert.equal(result.roundId, 3n);
  assert.equal(result.expiresAt, 1057n);
});
test('refuses missing code, wrong chain or block, stale reference and precision disagreement', async () => {
  for (const mutate of [
    s => { s.chainId++; }, s => { s.blockNumber++; }, s => { s.blockHash = '0x' + '11'.repeat(32); },
    s => { s.calls[primary].codeHash = keccak256('0x'); }, s => { delete s.calls[reference]; },
    s => { s.calls[reference] = observation(18, 909n); }, s => { s.calls[primary] = observation(18); },
  ]) {
    const data = snapshot();
    mutate(data);
    await assert.rejects(replay(feed, data));
  }
});
