import type { ParsedMetadata } from '@ghostpay/core-crypto';
import { describe, expect, it } from 'vitest';
import { FAKE, USDC_SEPOLIA } from './fixtures.testutil.js';
import type { ScannedAnnouncement } from './logs.js';
import type { RpcLog } from './rpc.js';
import { TRANSFER_TOPIC, verifyAnnouncementAmount } from './verify.js';
import type { Address, Hex } from './types.js';

const STEALTH = '0x00000000000000000000000000000000000000AA' as Address;
const TX: Hex = `0x${'cd'.repeat(32)}`;
const BH: Hex = `0x${'05'.repeat(32)}`;
const pad = (a: string): string => `0x${a.toLowerCase().replace('0x', '').padStart(64, '0')}`;

const ann = (over: Partial<ScannedAnnouncement> = {}): ScannedAnnouncement => ({
  schemeId: 1n, stealthAddress: STEALTH, ephemeralPublicKey: '0x02', metadata: '0x00', caller: FAKE.router,
  blockNumber: 5n, blockHash: BH, logIndex: 0, id: 'x', transactionHash: TX, ...over,
});

function withoutTx(a: ScannedAnnouncement): ScannedAnnouncement {
  const copy: { -readonly [K in keyof ScannedAnnouncement]?: ScannedAnnouncement[K] } = { ...a };
  delete copy.transactionHash;
  return copy as ScannedAnnouncement;
}

const erc20Meta = (net = 1000n): ParsedMetadata => ({ viewTag: 1, kind: 'erc20', token: USDC_SEPOLIA, netAmount: net });
const nativeMeta: ParsedMetadata = { viewTag: 1, kind: 'native', token: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', netAmount: 5n };

function transfer(over: Partial<RpcLog> = {}, amount = 1000n): RpcLog {
  return {
    address: USDC_SEPOLIA, topics: [TRANSFER_TOPIC, pad('0x1234'), pad(STEALTH)], data: `0x${amount.toString(16).padStart(64, '0')}`,
    blockNumber: '0x5', blockHash: BH, transactionHash: TX, logIndex: '0x1', ...over,
  };
}

const client = (logs: RpcLog[] | Error) => {
  const calls: unknown[] = [];
  return {
    calls, chainId: 11155111,
    getLogs: (f: unknown) => { calls.push(f); return logs instanceof Error ? Promise.reject(logs) : Promise.resolve(logs); },
  };
};
const run = (c: ReturnType<typeof client>, over: Partial<Parameters<typeof verifyAnnouncementAmount>[0]> = {}) =>
  verifyAnnouncementAmount({ client: c, announcement: ann(), metadata: erc20Meta(), viaRouter: false, ...over });

describe('verifyAnnouncementAmount', () => {
  it('trusts the manifest router without extra RPC calls', async () => {
    const c = client([]);
    expect(await run(c, { viaRouter: true })).toEqual({ status: 'verified', source: 'router', token: USDC_SEPOLIA, amount: 1000n });
    expect(c.calls).toHaveLength(0);
  });

  it('without metadata it is only claimed', async () => {
    expect(await run(client([]), { metadata: undefined })).toEqual({ status: 'claimed', reason: 'no_metadata' });
  });

  it('native direct payments stay claimed', async () => {
    const r = await run(client([]), { metadata: nativeMeta });
    expect(r).toMatchObject({ status: 'claimed', reason: 'native_unverifiable' });
  });

  it('non-allowlisted tokens stay claimed and are not queried', async () => {
    const c = client([transfer()]);
    const r = await run(c, { metadata: { ...erc20Meta(), token: '0x0000000000000000000000000000000000000bad' } });
    expect(r).toMatchObject({ status: 'claimed', reason: 'token_not_allowlisted' });
    expect(c.calls).toHaveLength(0);
  });

  it('verifies via Transfer logs to the stealth address and queries the right filter', async () => {
    const c = client([transfer()]);
    const r = await run(c);
    expect(r).toEqual({ status: 'verified', source: 'transfer_logs', token: USDC_SEPOLIA, amount: 1000n });
    expect(c.calls[0]).toEqual({ address: USDC_SEPOLIA, topics: [TRANSFER_TOPIC, null, pad(STEALTH)], fromBlock: 5n, toBlock: 5n });
  });

  it('reports what the logs prove, not what the metadata claims', async () => {
    const r = await run(client([transfer({}, 10n)]), { metadata: erc20Meta(1_000_000n) });
    expect(r).toMatchObject({ status: 'verified', amount: 10n });
  });

  it('sums several transfers and counts a duplicated log once', async () => {
    const r = await run(client([transfer({ logIndex: '0x1' }, 3n), transfer({ logIndex: '0x2' }, 4n), transfer({ logIndex: '0x2' }, 4n)]));
    expect(r).toMatchObject({ status: 'verified', amount: 7n });
  });

  it('ignores logs that are wrong in any respect', async () => {
    const bad: RpcLog[] = [
      transfer({ address: '0x0000000000000000000000000000000000000bad' }),
      transfer({ removed: true }),
      transfer({ topics: [TRANSFER_TOPIC, pad('0x1'), pad(STEALTH), pad('0x9')] }),
      transfer({ topics: [TRANSFER_TOPIC, pad('0x1'), pad('0x00000000000000000000000000000000000000bb')] }),
      transfer({ topics: ['0x' + '11'.repeat(32), pad('0x1'), pad(STEALTH)] }),
      transfer({ topics: [5 as never, pad('0x1'), pad(STEALTH)] }),
      transfer({ data: '0x12' }),
      transfer({ blockHash: `0x${'06'.repeat(32)}` }),
      transfer({ transactionHash: `0x${'ee'.repeat(32)}` }),
      null as never,
    ];
    expect(await run(client(bad))).toMatchObject({ status: 'claimed', reason: 'no_transfer_found' });
  });

  it('without a known tx hash any same-block transfer to the stealth address counts', async () => {
    const r = await run(client([transfer({ transactionHash: `0x${'ee'.repeat(32)}` })]), { announcement: withoutTx(ann()) });
    expect(r).toMatchObject({ status: 'verified' });
  });

  it('degrades to claimed when the RPC fails and honours a custom allowlist', async () => {
    expect(await run(client(new Error('x')))).toMatchObject({ status: 'claimed', reason: 'verification_failed' });
    const r = await run(client([transfer()]), { isAllowedToken: () => false });
    expect(r).toMatchObject({ reason: 'token_not_allowlisted' });
  });
});
