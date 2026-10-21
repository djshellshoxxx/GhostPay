import {
  buildErc20Metadata,
  buildNativeMetadata,
  checkAnnouncement,
  deriveStealthPayment,
  encodeMetaAddress,
  generateKeySet,
  parseMetadata,
  type StealthKeySet,
} from '@ghostpay/core-crypto';
import { encodeAbiParameters, keccak256 } from 'viem/utils';
import { describe, expect, it } from 'vitest';
import { checkAnnouncementDeep } from './deepscan.js';
import { FAKE, SEPOLIA, USDC_SEPOLIA } from './fixtures.testutil.js';
import { ANNOUNCEMENT_TOPIC, type ScannedAnnouncement } from './logs.js';
import { dedupeClaims, verifyClaimedPayment, verifyPaymentByTxHash, type ClaimedPayment } from './payments.js';
import { createClient, type RpcClient } from './rpc.js';
import { fakeTransport, noSleep } from './rpc.testutil.js';
import type { Address, Hex } from './types.js';

const hex = (b: Uint8Array): Hex => `0x${Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')}`;
const ANN = '0x55649E01B5Df198D18D95b5cc5051630cfD45564' as Address;
const BLOCK_HASH: Hex = `0x${'ab'.repeat(32)}`;
const TX: Hex = `0x${'cd'.repeat(32)}`;
const NET = 9_975_000n;
const TRANSFER_TOPIC = keccak256(new TextEncoder().encode('Transfer(address,address,uint256)'));
const pad = (a: string): Hex => `0x${'0'.repeat(24)}${a.slice(2).toLowerCase()}`;
const word = (n: bigint): Hex => `0x${n.toString(16).padStart(64, '0')}`;

const keys: StealthKeySet = generateKeySet();
const meta = encodeMetaAddress(keys);

interface Made {
  claim: ClaimedPayment;
}
function make(over: { caller?: Address; token?: 'native' | Address; net?: bigint; wrongTag?: boolean; block?: bigint; logIndex?: number; tx?: Hex | null } = {}): Made {
  const pay = deriveStealthPayment(meta);
  const tag = over.wrongTag === true ? (pay.viewTag[0] as number) ^ 0x5a : (pay.viewTag[0] as number);
  const token = over.token ?? USDC_SEPOLIA;
  const net = over.net ?? NET;
  const md = token === 'native' ? buildNativeMetadata(tag, net) : buildErc20Metadata(tag, token, net);
  const announcement: ScannedAnnouncement = {
    schemeId: 1n,
    stealthAddress: pay.stealthAddress,
    ephemeralPublicKey: hex(pay.ephemeralPublicKey),
    metadata: hex(md),
    caller: over.caller ?? FAKE.router,
    blockNumber: over.block ?? 100n,
    blockHash: BLOCK_HASH,
    logIndex: over.logIndex ?? 4,
    ...(over.tx === null ? {} : { transactionHash: over.tx ?? TX }),
    id: `${BLOCK_HASH}:${String(over.logIndex ?? 4)}`,
  };
  return {
    claim: {
      stealthAddress: pay.stealthAddress,
      announcement,
      metadata: parseMetadata(announcement.metadata),
      viaRouter: (over.caller ?? FAKE.router) === FAKE.router,
    },
  };
}

interface World {
  head?: bigint;
  canonicalHash?: Hex | null;
  transferLogs?: unknown[];
  balance?: bigint;
  receipt?: unknown;
  tx?: unknown;
  failBalance?: boolean;
  failAll?: boolean;
  calls?: string[];
}
function node(w: World): Promise<RpcClient> {
  return createClient(SEPOLIA, 'https://rpc.example.test', {
    sleep: noSleep,
    retries: 0,
    chainRecheckMs: 0,
    transport: fakeTransport((m, p) => {
      w.calls?.push(m);
      if (m === 'eth_chainId') return '0xaa36a7';
      if (w.failAll === true) throw new Error('down');
      if (m === 'eth_blockNumber') return `0x${(w.head ?? 150n).toString(16)}`;
      if (m === 'eth_getBlockByNumber') {
        if (w.canonicalHash === null) return null;
        return { number: p[0], hash: w.canonicalHash ?? BLOCK_HASH, parentHash: `0x${'11'.repeat(32)}` };
      }
      if (m === 'eth_getLogs') return w.transferLogs ?? [];
      if (m === 'eth_getBalance') return `0x${(w.balance ?? 0n).toString(16)}`;
      if (m === 'eth_call') {
        if (w.failBalance === true) throw new Error('no');
        return word(w.balance ?? 0n);
      }
      if (m === 'eth_getTransactionReceipt') return w.receipt ?? null;
      if (m === 'eth_getTransactionByHash') return w.tx ?? null;
      return null;
    }),
  });
}
const transferLog = (c: ClaimedPayment, over: Record<string, unknown> = {}): Record<string, unknown> => ({
  address: USDC_SEPOLIA,
  blockHash: BLOCK_HASH,
  topics: [TRANSFER_TOPIC, pad(FAKE.router), pad(c.stealthAddress)],
  data: word(NET),
  ...over,
});
const base = (client: RpcClient, claim: ClaimedPayment) => ({ chain: { ...SEPOLIA, finalityDepth: 64 }, client, router: FAKE.router, announcer: ANN, claim });

describe('dedupeClaims', () => {
  it('collapses replays of the same (stealth address, ephemeral key) and prefers the router announcement', () => {
    const a = make({ caller: FAKE.announcer, net: 10n ** 12n, block: 90n });
    const router = { ...make().claim };
    const replay = {
      ...router,
      announcement: { ...router.announcement, caller: FAKE.announcer, blockNumber: 50n },
      viaRouter: false,
    };
    const genuineLater = { ...router, announcement: { ...router.announcement, blockNumber: 120n } };
    const r = dedupeClaims([replay, genuineLater, a.claim]);
    expect(r.items).toHaveLength(2);
    expect(r.duplicates).toBe(1);
    expect(r.items[0]?.viaRouter).toBe(true);
    // same group, both router: earliest block wins, then lowest log index
    const e1 = { ...router, announcement: { ...router.announcement, blockNumber: 70n, logIndex: 9 } };
    const e2 = { ...router, announcement: { ...router.announcement, blockNumber: 70n, logIndex: 2 } };
    expect(dedupeClaims([e1, e2]).items[0]?.announcement.logIndex).toBe(2);
    expect(dedupeClaims([e2, e1]).items[0]?.announcement.logIndex).toBe(2);
    expect(dedupeClaims([]).items).toEqual([]);
  });
});

describe('verifyClaimedPayment', () => {
  it('RECEIVED: router announcement, canonical block, matching token Transfer; shows depth versus finality', async () => {
    const { claim } = make();
    const v = await verifyClaimedPayment(base(await node({ transferLogs: [transferLog(claim)], balance: NET }), claim));
    expect(v.status).toBe('received');
    expect(v.evidence).toEqual(['router-caller', 'block-hash', 'transfer-log']);
    expect(v.confirmations).toBe(51n);
    expect(v.final).toBe(false);
    expect(v.observedBalance).toBe(NET);
    const deep = await verifyClaimedPayment(base(await node({ transferLogs: [transferLog(claim)], head: 400n }), claim));
    expect(deep.final).toBe(true);
    expect(deep.observedBalance).toBe(0n); // already swept: still received, evidenced by the Transfer log
  });
  it('NON-ROUTER announcements are never "received", whatever they claim', async () => {
    const { claim } = make({ caller: FAKE.announcer, net: 10n ** 30n });
    const calls: string[] = [];
    const v = await verifyClaimedPayment(base(await node({ transferLogs: [transferLog(claim)], calls }), claim));
    expect(v.status).toBe('unverified-announcement');
    expect(v.reason).toMatch(/Anyone can post/);
    expect(v.evidence).toEqual([]);
    expect(calls).not.toContain('eth_getLogs');
  });
  it('does not read balances of unlisted (attacker-named) tokens', async () => {
    const evil = '0x00000000000000000000000000000000deadbeef' as Address;
    const { claim } = make({ caller: FAKE.announcer, token: evil });
    const calls: string[] = [];
    const v = await verifyClaimedPayment(base(await node({ calls, balance: 5n }), claim));
    expect(v.observedBalance).toBeUndefined();
    expect(calls).not.toContain('eth_call');
  });
  it('router claim without a matching Transfer is unverified', async () => {
    const { claim } = make();
    const w = (logs: unknown[]) => node({ transferLogs: logs });
    for (const logs of [
      [],
      [transferLog(claim, { data: word(NET + 1n) })],
      [transferLog(claim, { address: FAKE.announcer })],
      [transferLog(claim, { blockHash: `0x${'ee'.repeat(32)}` })],
      [transferLog(claim, { removed: true })],
      [transferLog(claim, { data: '0x12' })],
      [null],
    ]) {
      const v = await verifyClaimedPayment(base(await w(logs), claim));
      expect(v.status).toBe('unverified-claim');
      expect(v.reason).toMatch(/No matching token Transfer/);
    }
  });
  it('a non-canonical block hash or a missing block is unverified (fabricated or reorged log)', async () => {
    const { claim } = make();
    expect((await verifyClaimedPayment(base(await node({ canonicalHash: `0x${'ee'.repeat(32)}`, transferLogs: [transferLog(claim)] }), claim))).reason).toMatch(/canonical hash/);
    expect((await verifyClaimedPayment(base(await node({ canonicalHash: null }), claim))).status).toBe('unverified-claim');
  });
  it('RPC failure degrades to unverified instead of throwing', async () => {
    const { claim } = make();
    const v = await verifyClaimedPayment(base(await node({ failAll: true }), claim));
    expect(v.status).toBe('unverified-claim');
    expect(v.reason).toMatch(/could not confirm/);
    const v2 = await verifyClaimedPayment(base(await node({ failBalance: true, transferLogs: [transferLog(claim)] }), claim));
    expect(v2.status).toBe('received');
    expect(v2.observedBalance).toBeUndefined();
  });
  it('router announcement with foreign metadata is unverified', async () => {
    const { claim } = make();
    const v = await verifyClaimedPayment(base(await node({}), { ...claim, metadata: undefined }));
    expect(v.status).toBe('unverified-claim');
    expect(v.reason).toMatch(/not in the router layout/);
  });
  it('block ahead of the head gives 0 confirmations', async () => {
    const { claim } = make({ block: 500n });
    const v = await verifyClaimedPayment(base(await node({ head: 150n, transferLogs: [transferLog(claim)] }), claim));
    expect(v.confirmations).toBe(0n);
  });

  describe('native', () => {
    const nativeOk = (c: ClaimedPayment) => ({
      receipt: { status: '0x1', blockHash: BLOCK_HASH, logs: [{ address: ANN, logIndex: `0x${c.announcement.logIndex.toString(16)}` }] },
      tx: { to: FAKE.router, value: `0x${(NET + 25_000n).toString(16)}` },
    });
    it('received when the balance covers the claim', async () => {
      const { claim } = make({ token: 'native' });
      const v = await verifyClaimedPayment(base(await node({ balance: NET }), claim));
      expect(v.status).toBe('received');
      expect(v.evidence).toEqual(['router-caller', 'block-hash', 'balance']);
    });
    it('received after a sweep when the receipt shows a successful router call carrying enough value', async () => {
      const { claim } = make({ token: 'native' });
      const v = await verifyClaimedPayment(base(await node({ balance: 0n, ...nativeOk(claim) }), claim));
      expect(v.status).toBe('received');
      expect(v.evidence).toContain('receipt');
    });
    it('unverified when neither balance nor receipt supports the claim', async () => {
      const { claim } = make({ token: 'native' });
      const ok = nativeOk(claim);
      const cases: World[] = [
        { balance: 1n },
        { balance: 0n, receipt: { ...ok.receipt, status: '0x0' }, tx: ok.tx },
        { balance: 0n, receipt: { ...ok.receipt, blockHash: `0x${'ee'.repeat(32)}` }, tx: ok.tx },
        { balance: 0n, receipt: { ...ok.receipt, logs: [{ address: ANN, logIndex: '0x99' }] }, tx: ok.tx },
        { balance: 0n, receipt: { ...ok.receipt, logs: 'x' }, tx: ok.tx },
        { balance: 0n, receipt: ok.receipt, tx: { ...ok.tx, to: FAKE.announcer } },
        { balance: 0n, receipt: ok.receipt, tx: { ...ok.tx, value: '0x1' } },
        { balance: 0n, receipt: null, tx: ok.tx },
        { balance: 0n, receipt: ok.receipt, tx: null },
      ];
      for (const w of cases) expect((await verifyClaimedPayment(base(await node(w), claim))).status).toBe('unverified-claim');
      const noTx = make({ token: 'native', tx: null }).claim;
      expect((await verifyClaimedPayment(base(await node({ balance: 0n, ...nativeOk(noTx) }), noTx))).status).toBe('unverified-claim');
    });
  });
});

describe('checkAnnouncementDeep', () => {
  it('agrees with core-crypto checkAnnouncement whenever the view tag is right', () => {
    for (let i = 0; i < 20; i++) {
      const { claim } = make();
      const a = claim.announcement;
      const normal = checkAnnouncement(a, keys.viewingSecret, keys.spendingPublicKey);
      const deep = checkAnnouncementDeep(a, keys.viewingSecret, keys.spendingPublicKey);
      expect(normal.matches).toBe(true);
      expect(deep).toEqual({ matches: true, stealthAddress: (normal as { stealthAddress: Address }).stealthAddress, tagMatches: true });
    }
  });
  it('finds a payment whose payer published a WRONG view tag, which the tag filter misses (D4)', () => {
    const { claim } = make({ wrongTag: true });
    const a = claim.announcement;
    expect(checkAnnouncement(a, keys.viewingSecret, keys.spendingPublicKey).matches).toBe(false);
    const deep = checkAnnouncementDeep(a, keys.viewingSecret, keys.spendingPublicKey);
    expect(deep.matches).toBe(true);
    expect(deep.matches && deep.tagMatches).toBe(false);
  });
  it('does not match other recipients, tampered addresses or malformed input, and never throws', () => {
    const { claim } = make();
    const a = claim.announcement;
    const stranger = generateKeySet();
    expect(checkAnnouncementDeep(a, stranger.viewingSecret, stranger.spendingPublicKey).matches).toBe(false);
    expect(checkAnnouncementDeep({ ...a, stealthAddress: FAKE.router }, keys.viewingSecret, keys.spendingPublicKey).matches).toBe(false);
    expect(checkAnnouncementDeep({ ...a, stealthAddress: 'nope' }, keys.viewingSecret, keys.spendingPublicKey).matches).toBe(false);
    expect(checkAnnouncementDeep({ ...a, ephemeralPublicKey: '0x1234' }, keys.viewingSecret, keys.spendingPublicKey).matches).toBe(false);
    expect(checkAnnouncementDeep({ ...a, ephemeralPublicKey: `0x02${'ff'.repeat(32)}` }, keys.viewingSecret, keys.spendingPublicKey).matches).toBe(false);
    expect(checkAnnouncementDeep({ ...a, metadata: '0x' }, keys.viewingSecret, keys.spendingPublicKey).matches).toBe(false);
    expect(checkAnnouncementDeep({ ...a, metadata: 'zz' }, keys.viewingSecret, keys.spendingPublicKey).matches).toBe(false);
    expect(checkAnnouncementDeep({ ...a, schemeId: 2n }, keys.viewingSecret, keys.spendingPublicKey).matches).toBe(false);
  });
});

describe('verifyPaymentByTxHash', () => {
  function receiptFor(claims: ClaimedPayment[], over: Record<string, unknown> = {}): unknown {
    return {
      status: '0x1',
      blockNumber: '0x64',
      blockHash: BLOCK_HASH,
      logs: claims.map((c, i) => ({
        address: ANN,
        topics: [ANNOUNCEMENT_TOPIC, word(1n), pad(c.stealthAddress), pad(c.announcement.caller)],
        data: encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], [c.announcement.ephemeralPublicKey as Hex, c.announcement.metadata as Hex]),
        blockNumber: '0x64',
        blockHash: BLOCK_HASH,
        logIndex: `0x${(i + 4).toString(16)}`,
      })),
      ...over,
    };
  }
  const input = (client: RpcClient, txHash: string = TX) => ({
    chain: { ...SEPOLIA, finalityDepth: 64 },
    client,
    router: FAKE.router,
    announcer: ANN,
    txHash,
    viewingSecret: keys.viewingSecret,
    spendingPublicKey: keys.spendingPublicKey,
  });

  it('finds and verifies a payment even though the payer published a wrong view tag', async () => {
    const { claim } = make({ wrongTag: true });
    const w: World = { receipt: receiptFor([claim]), transferLogs: [transferLog(claim)] };
    const res = await verifyPaymentByTxHash(input(await node(w)));
    expect(res).toHaveLength(1);
    expect(res[0]?.tagMatches).toBe(false);
    expect(res[0]?.verification.status).toBe('received');
    expect(res[0]?.claim.stealthAddress).toBe(claim.stealthAddress);
  });
  it('ignores announcements for other recipients and non-router announcements in the same transaction', async () => {
    const mine = make().claim;
    const fake = make({ caller: FAKE.announcer }).claim; // for the same seller but not from the router
    const strangerPay = deriveStealthPayment(encodeMetaAddress(generateKeySet()));
    const stranger: ClaimedPayment = { ...mine, stealthAddress: strangerPay.stealthAddress, announcement: { ...mine.announcement, stealthAddress: strangerPay.stealthAddress, ephemeralPublicKey: hex(strangerPay.ephemeralPublicKey) } };
    const w: World = { receipt: receiptFor([fake, stranger]), transferLogs: [] };
    expect(await verifyPaymentByTxHash(input(await node(w)))).toEqual([]);
  });
  it('skips hostile log entries without failing', async () => {
    const mine = make().claim;
    const r = receiptFor([mine]) as { logs: unknown[] };
    r.logs.unshift(null, { address: '0x00000000000000000000000000000000deadbeef', topics: [] }, { address: ANN, topics: 'x' }, { address: ANN, topics: [ANNOUNCEMENT_TOPIC] }, { address: ANN, topics: [ANNOUNCEMENT_TOPIC, word(1n), word(1n), word(2n)], data: '0x', blockNumber: '0x64', blockHash: BLOCK_HASH, logIndex: '0x1' });
    const res = await verifyPaymentByTxHash(input(await node({ receipt: r, transferLogs: [transferLog(mine)] })));
    expect(res).toHaveLength(1);
  });
  it('rejects bad input, unknown, failed and malformed receipts', async () => {
    const mine = make().claim;
    await expect(verifyPaymentByTxHash(input(await node({}), '0x12'))).rejects.toThrow(/INVALID_INPUT/);
    await expect(verifyPaymentByTxHash(input(await node({})))).rejects.toThrow(/does not know/);
    await expect(verifyPaymentByTxHash(input(await node({ receipt: receiptFor([mine], { status: '0x0' }) })))).rejects.toThrow(/did not succeed/);
    await expect(verifyPaymentByTxHash(input(await node({ receipt: 'x' })))).rejects.toThrow(/malformed receipt/);
    await expect(verifyPaymentByTxHash(input(await node({ receipt: receiptFor([mine], { logs: 'x' }) })))).rejects.toThrow(/malformed receipt logs/);
    await expect(verifyPaymentByTxHash(input(await node({ receipt: receiptFor([mine], { logs: new Array(2001).fill(null) }) })))).rejects.toThrow(/malformed receipt logs/);
  });
  it('lowercases the hash it sends', async () => {
    const mine = make().claim;
    const res = await verifyPaymentByTxHash(input(await node({ receipt: receiptFor([mine]), transferLogs: [transferLog(mine)] }), TX.toUpperCase().replace('0X', '0x')));
    expect(res).toHaveLength(1);
  });
});
