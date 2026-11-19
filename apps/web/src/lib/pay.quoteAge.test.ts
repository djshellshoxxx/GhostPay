import { chainlinkAggregatorAbi, type FeedConfig } from '@ghostpay/chain-adapters';
import { encodeFunctionResult } from 'viem/utils';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeManifest } from '../test/fakeManifest';
import { makeParsed, NOW } from '../test/invoiceFixtures';
import { mockRpc } from '../test/mockRpc';
import { createPayContext, reviewInvoice } from './pay';
import { clearSession } from './session';

const FEED: FeedConfig = { chainId: 84532, address: '0x7777777777777777777777777777777777777777',
  base: 'ETH', quote: 'USD', decimals: 8, heartbeatSec: 1_200,
  sourceRef: 'deterministic test fixture; no external provider' };
afterEach(clearSession);

async function quote(age: number, feed: FeedConfig = FEED, quoteTtlMinutes = 1_440) {
  const { parsed } = await makeParsed({ amountMode: 'fiat_quote', token: 'native', quoteTtlMinutes });
  const review = reviewInvoice(parsed, NOW, { status: 'loaded', manifest: fakeManifest(84532) });
  let requests = 0;
  const rpc = mockRpc(84532, (_method, params) => {
    requests += 1;
    const data = (params[0] as { data: string }).data;
    if (data.startsWith('0x313ce567')) return encodeFunctionResult({ abi: chainlinkAggregatorAbi, functionName: 'decimals', result: 8 });
    return encodeFunctionResult({ abi: chainlinkAggregatorAbi, functionName: 'latestRoundData',
      result: [1n, 200_000_000_000n, BigInt(NOW - age), BigInt(NOW - age), 1n] });
  });
  return { execute: () => createPayContext(review, rpc, { nowSeconds: NOW, findFeedFn: () => feed }), requests: () => requests };
}

describe('LF-7aee9060b-1: fiat payment freshness is bounded independently of seller quote lifetime', () => {
  it('rejects an expired feed while the seller-authored quote is still valid for a day', async () => {
    const q = await quote(1_501);
    await expect(q.execute()).rejects.toThrow('QUOTE_FAILED: stale price');
  });
  it('accepts the exact feed freshness boundary', async () => {
    const q = await quote(1_500);
    await expect(q.execute()).resolves.toMatchObject({ quotedTokenAmount: 50_000_000_000_000_000n });
  });
  it('retains a shorter seller quote window', async () => {
    const q = await quote(61, FEED, 1);
    await expect(q.execute()).rejects.toThrow('QUOTE_FAILED: stale price');
  });
  it('refuses a feed with no configured heartbeat before any RPC request', async () => {
    const missing = { ...FEED };
    delete missing.heartbeatSec;
    const q = await quote(0, missing);
    await expect(q.execute()).rejects.toThrow(/freshness limit/);
    expect(q.requests()).toBe(0);
  });
  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 604_801])('refuses invalid configured heartbeat %s without RPC', async (heartbeatSec) => {
    const q = await quote(0, { ...FEED, heartbeatSec });
    await expect(q.execute()).rejects.toThrow(/freshness limit/);
    expect(q.requests()).toBe(0);
  });
});
