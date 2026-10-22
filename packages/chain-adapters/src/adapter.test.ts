import { checkAnnouncement, deriveStealthPayment, generateKeySet, encodeMetaAddress } from '@ghostpay/core-crypto';
import { encodeAbiParameters } from 'viem/utils';
import { describe, expect, it } from 'vitest';
import { createEvmAdapter } from './adapter.js';
import { ChainAdapterError } from './errors.js';
import { FAKE, MAINNET, SEPOLIA, USDC_SEPOLIA, invoiceFor, manifest, manifestJson } from './fixtures.testutil.js';
import { validateManifest } from './deployments.js';
import { assertPreviewMatchesCalldata } from './router.js';
import { ANNOUNCEMENT_TOPIC } from './logs.js';
import { createClient } from './rpc.js';
import { fakeTransport, noSleep } from './rpc.testutil.js';
import type { Hex } from './types.js';

const deployment = validateManifest(manifestJson(), 11155111);
const mkClient = (logs: unknown[] = [], head = 20, opts: { readonly reorgOnHeadCall?: number } = {}) => {
  let headCalls = 0;
  let fork = 0;
  return createClient(SEPOLIA, 'https://rpc.example.test', {
    sleep: noSleep,
    transport: fakeTransport((m, p) => {
      if (m === 'eth_chainId') return '0xaa36a7';
      if (m === 'eth_blockNumber') {
        headCalls++;
        if (headCalls === opts.reorgOnHeadCall) fork = 1;
        return `0x${head.toString(16)}`;
      }
      if (m === 'eth_getBlockByNumber') {
        const number = BigInt(p[0] as string);
        if (fork === 1) return { number: p[0], hash: `0x${'f'.repeat(64)}`, parentHash: `0x${'e'.repeat(64)}` };
        return {
          number: p[0],
          hash: `0x${number.toString(16).padStart(64, '0')}`,
          parentHash: `0x${(number > 0n ? number - 1n : 0n).toString(16).padStart(64, '0')}`,
        };
      }
      const f = p[0] as { fromBlock: string; toBlock: string };
      return (logs as { blockNumber: string }[]).filter((l) => BigInt(l.blockNumber) >= BigInt(f.fromBlock) && BigInt(l.blockNumber) <= BigInt(f.toBlock));
    }),
  });
};
const adapter = async (logs: unknown[] = [], head = 20) => createEvmAdapter({ chain: SEPOLIA, deployment, client: await mkClient(logs, head) });

describe('createEvmAdapter', () => {
  it('exposes family, chainId and an honest fee capability', async () => {
    const a = await adapter();
    expect(a.family).toBe('evm');
    expect(a.chainId).toBe('11155111');
    expect(a.fees).toEqual({ checkout: 'enforced', checkoutBps: 25, gasSponsorship: 'enforced', flatSecurity: 'not_deployed' });
  });
  it('fails closed on disabled chain and mismatches', async () => {
    const client = await mkClient();
    expect(() => createEvmAdapter({ chain: MAINNET, deployment: validateManifest(manifestJson(1), 1), client })).toThrow(/CHAIN_DISABLED/);
    expect(() => createEvmAdapter({ chain: SEPOLIA, deployment: validateManifest(manifestJson(84532), 84532), client })).toThrow(/CHAIN_MISMATCH/);
    expect(() => createEvmAdapter({ chain: SEPOLIA, deployment, client: { ...client, chainId: 1 } })).toThrow(/CHAIN_MISMATCH/);
    void manifest;
  });

  it('parseRecipient canonicalizes and rejects garbage', async () => {
    const a = await adapter();
    const keys = generateKeySet();
    const meta = encodeMetaAddress(keys);
    const r = a.parseRecipient(meta.toUpperCase().replace('ST:ETH:0X', 'st:eth:0x'));
    expect(r.canonical).toBe(meta);
    expect(r.family).toBe('evm');
    expect(() => a.parseRecipient('st:eth:0x12')).toThrow();
    expect(() => a.parseRecipient('bc1qxyz')).toThrow();
  });

  describe('buildPaymentRequest', () => {
    const meta = encodeMetaAddress(generateKeySet());
    it('seller_pays: gross is the invoice amount; build() yields a checked tx', async () => {
      const a = await adapter();
      const req = a.buildPaymentRequest(invoiceFor(meta));
      expect(req).toMatchObject({ family: 'evm', chainId: '11155111', grossAmount: 10_000_000n, feeAmount: 25_000n, netAmount: 9_975_000n, router: FAKE.router, feeRecipient: FAKE.feeRecipient, asset: USDC_SEPOLIA.toLowerCase() });
      const built = req.build({ deadline: 4_000_000_000n });
      assertPreviewMatchesCalldata(built.preview, built.tx, 11155111);
      expect(built.preview.gross).toBe(10_000_000n);
      // two builds use fresh stealth addresses
      expect(req.build({ deadline: 4_000_000_000n }).preview.stealth).not.toBe(built.preview.stealth);
    });
    it('payer_pays: seller receives at least the invoice amount', async () => {
      const a = await adapter();
      const req = a.buildPaymentRequest(invoiceFor(meta, { feePolicy: 'payer_pays' }));
      expect(req.netAmount >= 10_000_000n).toBe(true);
      expect(req.netAmount - 10_000_000n).toBeLessThanOrEqual(1n);
    });
    it('fiat_quote needs a quoted amount', async () => {
      const a = await adapter();
      const inv = invoiceFor(meta, { amountPolicy: { mode: 'fiat_quote' } });
      expect(() => a.buildPaymentRequest(inv)).toThrow(/quotedTokenAmount/);
      expect(() => a.buildPaymentRequest(inv, { quotedTokenAmount: 0n })).toThrow(/quotedTokenAmount/);
      expect(a.buildPaymentRequest(inv, { quotedTokenAmount: 4_000n }).grossAmount).toBe(4_000n);
    });
    it('rejects invoices for another chain (cross-chain payment impossible)', async () => {
      const a = await adapter();
      expect(() => a.buildPaymentRequest(invoiceFor(meta, { chainId: 84532 }))).toThrow(/CHAIN_MISMATCH/);
    });
    it('rejects a malformed meta-address and a token off the allowlist at build time', async () => {
      const a = await adapter();
      expect(() => a.buildPaymentRequest(invoiceFor('st:eth:0xdead'))).toThrow();
      const req = a.buildPaymentRequest(invoiceFor(meta, { token: '0x00000000000000000000000000000000000000ff' }));
      expect(() => req.build({ deadline: 4_000_000_000n })).toThrow(/UNSUPPORTED_TOKEN/);
    });
    it('passes optional build options through', async () => {
      const a = await adapter();
      const req = a.buildPaymentRequest(invoiceFor(meta));
      const sig: Hex = `0x${'11'.repeat(32)}${'22'.repeat(32)}1c`;
      expect(req.build({ deadline: 4_000_000_000n, now: 1n, minNet: 1n, permitSignature: sig }).preview.method).toBe('payERC20WithPermit');
      expect(req.build({ deadline: 4_000_000_000n, buffer: { bufferWei: 3n } }).preview.method).toBe('payERC20WithBuffer');
      expect(() => req.build({ deadline: 5n, now: 5n })).toThrow(ChainAdapterError);
    });
  });

  describe('scan', () => {
    function announcementLog(meta: string, block: number, router = FAKE.router) {
      const p = deriveStealthPayment(meta);
      const net = 9_975_000n;
      const metaHex = `0x${Buffer.from(p.metadataPrefix).toString('hex')}a9059cbb${USDC_SEPOLIA.slice(2).toLowerCase()}${net.toString(16).padStart(64, '0')}`;
      return {
        address: FAKE.announcer,
        topics: [ANNOUNCEMENT_TOPIC, `0x${'0'.repeat(63)}1`, `0x${p.stealthAddress.slice(2).toLowerCase().padStart(64, '0')}`, `0x${router.slice(2).toLowerCase().padStart(64, '0')}`],
        data: encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], [`0x${Buffer.from(p.ephemeralPublicKey).toString('hex')}`, metaHex as Hex]),
        blockNumber: `0x${block.toString(16)}`,
        blockHash: `0x${block.toString(16).padStart(64, '0')}`,
        logIndex: '0x0',
      };
    }
    const collect = async (a: Awaited<ReturnType<typeof adapter>>, keys: ReturnType<typeof generateKeySet>, range = { fromBlock: 0n }, signal = new AbortController().signal) => {
      const out = [];
      for await (const d of a.scan(range, { viewingSecret: keys.viewingSecret, spendingPublicKey: keys.spendingPublicKey }, signal)) out.push(d);
      return out;
    };
    it('detects only payments for the viewing key and classifies router payments', async () => {
      const mine = generateKeySet();
      const other = generateKeySet();
      const logs = [announcementLog(encodeMetaAddress(mine), 3), announcementLog(encodeMetaAddress(other), 4), announcementLog(encodeMetaAddress(mine), 5, getAddr('0x00000000000000000000000000000000000000ee'))];
      const a = await adapter(logs);
      const found = await collect(a, mine);
      expect(found).toHaveLength(2);
      expect(found.map((f) => f.viaRouter)).toEqual([true, false]);
      expect(found[0]?.metadata).toMatchObject({ kind: 'erc20', token: USDC_SEPOLIA, netAmount: 9_975_000n });
    });
    it('non-router layout metadata yields metadata undefined', async () => {
      const mine = generateKeySet();
      const log = announcementLog(encodeMetaAddress(mine), 3);
      const p = deriveStealthPayment(encodeMetaAddress(mine));
      const custom = { ...log, topics: [ANNOUNCEMENT_TOPIC, log.topics[1], `0x${p.stealthAddress.slice(2).toLowerCase().padStart(64, '0')}`, log.topics[3]], data: encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], [`0x${Buffer.from(p.ephemeralPublicKey).toString('hex')}`, `0x${Buffer.from(p.metadataPrefix).toString('hex')}12`]) };
      const found = await collect(await adapter([custom]), mine);
      expect(found).toHaveLength(1);
      expect(found[0]?.metadata).toBeUndefined();
      void checkAnnouncement;
    });
    it('respects toBlock and abort', async () => {
      const mine = generateKeySet();
      const logs = [announcementLog(encodeMetaAddress(mine), 3), announcementLog(encodeMetaAddress(mine), 15)];
      const a = await adapter(logs);
      expect(await collect(a, mine, { fromBlock: 0n, toBlock: 10n } as never)).toHaveLength(1);
      const ac = new AbortController();
      ac.abort();
      expect(await collect(a, mine, { fromBlock: 0n }, ac.signal)).toHaveLength(0);
      // abort during iteration
      const ac2 = new AbortController();
      const it = a.scan({ fromBlock: 0n }, { viewingSecret: mine.viewingSecret, spendingPublicKey: mine.spendingPublicKey }, ac2.signal);
      const first = await it[Symbol.asyncIterator]().next();
      expect(first.done).toBe(false);
      ac2.abort();
    });
    it('keeps paging while truncated and stops at toBlock', async () => {
      const mine = generateKeySet();
      const logs = [announcementLog(encodeMetaAddress(mine), 3), announcementLog(encodeMetaAddress(mine), 55_000)];
      const a = await adapter(logs, 60_000);
      // 60 001 blocks / 1000 per request = 61 requests > default cap of 50 per fetch: needs a second page.
      expect(await collect(a, mine)).toHaveLength(2);
      expect(await collect(a, mine, { fromBlock: 0n, toBlock: 5n } as never)).toHaveLength(1);
    });
    it('does not release earlier-page matches if a later page detects a reorg', async () => {
      const mine = generateKeySet();
      const logs = [announcementLog(encodeMetaAddress(mine), 3)];
      const client = await mkClient(logs, 60_000, { reorgOnHeadCall: 3 });
      const a = createEvmAdapter({ chain: SEPOLIA, deployment, client });
      const yielded: unknown[] = [];
      await expect(async () => {
        for await (const item of a.scan({ fromBlock: 0n }, { viewingSecret: mine.viewingSecret, spendingPublicKey: mine.spendingPublicKey }, new AbortController().signal)) yielded.push(item);
      }).rejects.toThrow(/reorganised|canonical block/);
      expect(yielded).toHaveLength(0);
    });
  });
});

function getAddr(a: string): `0x${string}` {
  return a as `0x${string}`;
}
