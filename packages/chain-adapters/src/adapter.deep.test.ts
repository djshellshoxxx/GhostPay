import { deriveStealthPayment, encodeMetaAddress, generateKeySet } from '@ghostpay/core-crypto';
import { encodeAbiParameters, getAddress } from 'viem/utils';
import { describe, expect, it } from 'vitest';
import { createEvmAdapter } from './adapter.js';
import { validateManifest } from './deployments.js';
import { FAKE, SEPOLIA, USDC_SEPOLIA, manifestJson } from './fixtures.testutil.js';
import { ANNOUNCEMENT_TOPIC } from './logs.js';
import { createClient } from './rpc.js';
import { fakeTransport, noSleep } from './rpc.testutil.js';
import type { Hex } from './types.js';

const policyFields = {
  policyImplementation: getAddress('0x0000000000000000000000000000000000000e55'),
  policyFactory: getAddress('0x0000000000000000000000000000000000000f66'),
  policyFeeToken: getAddress('0x0000000000000000000000000000000000000a77'),
  policyFlatFee: '5000000',
  policyFeeRecipient: getAddress('0x0000000000000000000000000000000000000b88'),
};
function withPolicy(): Record<string, unknown> {
  const m = manifestJson();
  return {
    ...m,
    ...policyFields,
    deployTx: { ...(m['deployTx'] as object), policyImplementation: `0x${'5'.repeat(64)}`, policyFactory: `0x${'6'.repeat(64)}` },
    bytecodeHashes: { ...(m['bytecodeHashes'] as object), policyImplementation: `0x${'7'.repeat(64)}`, policyFactory: `0x${'8'.repeat(64)}` },
  };
}
const client = (logs: unknown[] = [], seen?: { from: bigint; to: bigint }[]) =>
  createClient(SEPOLIA, 'https://rpc.example.test', {
    sleep: noSleep,
    transport: fakeTransport((m, p) => {
      if (m === 'eth_chainId') return '0xaa36a7';
      if (m === 'eth_blockNumber') return '0x14';
      if (m === 'eth_getBlockByNumber') {
        const n = BigInt(p[0] as string);
        const hash = n === 3n ? `0x${'3'.repeat(64)}` : `0x${'a'.repeat(63)}1`;
        return { number: p[0], hash, parentHash: `0x${'b'.repeat(64)}` };
      }
      if (m === 'eth_getLogs') {
        const filter = p[0] as { fromBlock: string; toBlock: string };
        const from = BigInt(filter.fromBlock);
        const to = BigInt(filter.toBlock);
        seen?.push({ from, to });
        return logs.filter((l) => {
          const n = BigInt((l as { blockNumber: string }).blockNumber);
          return n >= from && n <= to;
        });
      }
      return logs;
    }),
  });

describe('flatSecurity capability follows the manifest policy section (A-17)', () => {
  it('is not_deployed without a policy section and available with one', async () => {
    const without = createEvmAdapter({ chain: SEPOLIA, deployment: validateManifest(manifestJson(), 11155111), client: await client() });
    expect(without.fees.flatSecurity).toBe('not_deployed');
    const withP = createEvmAdapter({ chain: SEPOLIA, deployment: validateManifest(withPolicy(), 11155111), client: await client() });
    expect(withP.fees.flatSecurity).toBe('available');
    expect(withP.fees.checkout).toBe('enforced');
  });
});

describe('scan({ deep })', () => {
  let seq = 0;
  const log = (meta: string, caller: string, wrongTag: boolean) => {
    const p = deriveStealthPayment(meta);
    const tag = wrongTag ? (p.viewTag[0] as number) ^ 0x33 : (p.viewTag[0] as number);
    const metaHex = `0x${tag.toString(16).padStart(2, '0')}a9059cbb${USDC_SEPOLIA.slice(2).toLowerCase()}${(9_975_000n).toString(16).padStart(64, '0')}`;
    return {
      address: FAKE.announcer,
      topics: [ANNOUNCEMENT_TOPIC, `0x${'0'.repeat(63)}1`, `0x${p.stealthAddress.slice(2).toLowerCase().padStart(64, '0')}`, `0x${caller.slice(2).toLowerCase().padStart(64, '0')}`],
      data: encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], [`0x${Buffer.from(p.ephemeralPublicKey).toString('hex')}`, metaHex as Hex]),
      blockNumber: '0x3',
      blockHash: `0x${'3'.repeat(64)}`,
      logIndex: `0x${(seq++).toString(16)}`,
    };
  };
  const run = async (logs: unknown[], mine: ReturnType<typeof generateKeySet>, deep: boolean) => {
    const a = createEvmAdapter({ chain: SEPOLIA, deployment: validateManifest(manifestJson(), 11155111), client: await client(logs) });
    const out = [];
    for await (const d of a.scan({ fromBlock: 0n, deep }, { viewingSecret: mine.viewingSecret, spendingPublicKey: mine.spendingPublicKey }, new AbortController().signal)) out.push(d);
    return out;
  };

  it('misses a wrong-view-tag router payment normally and finds it in deep mode, flagged', async () => {
    const mine = generateKeySet();
    const meta = encodeMetaAddress(mine);
    const logs = [log(meta, FAKE.router, true), log(meta, FAKE.router, false)];
    expect(await run(logs, mine, false)).toHaveLength(1);
    const deep = await run(logs, mine, true);
    expect(deep).toHaveLength(2);
    expect(deep.map((d) => d.tagMatches).sort()).toEqual([false, true]);
    expect(deep.every((d) => d.viaRouter)).toBe(true);
  });
  it('keeps non-router announcements tag-filtered even in deep mode, and ignores other recipients', async () => {
    const mine = generateKeySet();
    const other = generateKeySet();
    const logs = [log(encodeMetaAddress(mine), FAKE.announcer, true), log(encodeMetaAddress(other), FAKE.router, true)];
    expect(await run(logs, mine, true)).toHaveLength(0);
  });
  it('ordinary matches carry no tagMatches flag', async () => {
    const mine = generateKeySet();
    const found = await run([log(encodeMetaAddress(mine), FAKE.router, false)], mine, false);
    expect(found[0]).not.toHaveProperty('tagMatches');
  });
  it('passes an explicit inclusive upper bound into the log query', async () => {
    const mine = generateKeySet();
    const seen: { from: bigint; to: bigint }[] = [];
    const a = createEvmAdapter({
      chain: SEPOLIA,
      deployment: validateManifest(manifestJson(), 11155111),
      client: await client([log(encodeMetaAddress(mine), FAKE.router, false)], seen),
    });
    const out = [];
    for await (const d of a.scan({ fromBlock: 0n, toBlock: 2n }, { viewingSecret: mine.viewingSecret, spendingPublicKey: mine.spendingPublicKey }, new AbortController().signal)) out.push(d);
    expect(out).toHaveLength(0);
    expect(seen).toEqual([{ from: 0n, to: 2n }]);
  });
});
