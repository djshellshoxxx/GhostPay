import { parseHeader, SilentPaymentError } from '@ghostpay/btc-silent-payments';
import { describe, expect, it } from 'vitest';
import { EsploraClient, EsploraTweakSource, normalizeEsploraUrl } from './esplora';
import { coinbase, mineHeader, mockChain, paymentTx, walletA, withTxid, withWitnessCommitment, SEED_B } from './fixtures.testutil';
import { BTC_NETWORKS, btcNetwork, MAINNET_GENESIS } from './network';
import { MAX_SCAN_BLOCKS, scanForPayments } from './scan';
import { walletFromSeedHex } from './wallet';

const BASE = 'https://esplora.test/api';

function codeOf(p: Promise<unknown>): Promise<string> {
  return p.then(
    () => 'none',
    (e: unknown) => (e instanceof SilentPaymentError ? e.code : 'other'),
  );
}

/**
 * One block served the way electrs serves it: `/block/:hash` reports `tx_count`, `/block/:hash/txs/:start` returns
 * up to 25 transactions, and a start index at or past the end (or not a multiple of 25) is an HTTP 400.
 */
function electrsBlock(txs: readonly unknown[], info: Record<string, unknown> = {}) {
  const hash = 'a'.repeat(64);
  const requests: string[] = [];
  const fetchFn = (url: string): Promise<Response> => {
    const path = url.slice(BASE.length);
    requests.push(path);
    if (path === `/block/${hash}`) return Promise.resolve(new Response(JSON.stringify({ id: hash, tx_count: txs.length, ...info })));
    const m = /^\/block\/[0-9a-f]{64}\/txs\/(\d+)$/.exec(path);
    const start = Number(m?.[1]);
    if (m === null || start >= txs.length || start % 25 !== 0) return Promise.resolve(new Response('start index out of range', { status: 400 }));
    return Promise.resolve(new Response(JSON.stringify(txs.slice(start, start + 25))));
  };
  return { hash, requests, client: new EsploraClient({ baseUrl: BASE, fetchFn }) };
}

/** Client for block `a…a`: its summary reports `txCount` transactions and every page request returns `page` as is. */
function servePage(page: unknown, txCount = Array.isArray(page) ? page.length : 1): EsploraClient {
  const hash = 'a'.repeat(64);
  return new EsploraClient({
    baseUrl: BASE,
    fetchFn: (url) => Promise.resolve(new Response(JSON.stringify(url.endsWith(`/block/${hash}`) ? { id: hash, tx_count: txCount } : page))),
  });
}

const SIMPLE_TX = withTxid({
  version: 2,
  locktime: 0,
  vin: [{ txid: '12'.repeat(32), vout: 0, sequence: 0xffffffff, prevout: { scriptpubkey: `0014${'6'.repeat(40)}` }, scriptsig: '', witness: [], is_coinbase: false }],
  vout: [{ scriptpubkey: `0014${'5'.repeat(40)}`, value: 1_000 }],
});

describe('normalizeEsploraUrl', () => {
  it('accepts https and loopback http, trims trailing slashes', () => {
    expect(normalizeEsploraUrl(' https://a.example/api/ ')).toBe('https://a.example/api');
    expect(normalizeEsploraUrl('http://127.0.0.1:3002')).toBe('http://127.0.0.1:3002');
    expect(normalizeEsploraUrl('http://localhost:3002/')).toBe('http://localhost:3002');
  });
  it('refuses plain http to remote hosts, credentials, query, fragment, junk', () => {
    for (const bad of ['http://a.example/api', 'https://u:p@a.example', 'https://a.example/?k=1', 'https://a.example/#x', 'ftp://a', 'nope', '']) {
      expect(() => normalizeEsploraUrl(bad)).toThrow(SilentPaymentError);
    }
  });
});

describe('network table', () => {
  it('has mainnet disabled and every test network enabled', () => {
    expect(btcNetwork('mainnet').enabled).toBe(false);
    expect(BTC_NETWORKS.filter((n) => n.enabled).map((n) => n.id)).toEqual(['testnet4', 'signet', 'regtest']);
    expect(() => walletFromSeedHex('11'.repeat(32), btcNetwork('mainnet'))).toThrow(/disabled/);
  });
  it('rejects a bad seed', () => {
    expect(() => walletFromSeedHex('zz', btcNetwork('regtest'))).toThrow(/64 hexadecimal/);
  });
});

describe('EsploraClient', () => {
  const mk = (netId: 'regtest' | 'signet' = 'regtest') => {
    const chain = mockChain(netId, walletA(netId));
    return { chain, client: new EsploraClient({ baseUrl: BASE, fetchFn: chain.fetchFn }) };
  };

  it('reads tip, hashes, pages and spent state', async () => {
    const { chain, client } = mk();
    expect(await client.tipHeight()).toBe(4);
    expect(await client.blockHash(0)).toBe(btcNetwork('regtest').genesisHash);
    const hash2 = await client.blockHash(2);
    const txs = await client.blockTxs(hash2);
    expect(txs).toHaveLength(30);
    expect(txs[0]?.inputs).toBeNull();
    expect(chain.requests.filter((r) => r.includes('/txs/'))).toEqual([`GET /block/${hash2}/txs/0`, `GET /block/${hash2}/txs/25`]);
    const pay = (await client.blockTxs(await client.blockHash(3)))[2];
    expect(pay?.outputs[1]?.valueSats).toBe(50_000n);
    expect(await client.isUnspent(pay?.txid ?? '', 1)).toBe(true);
    chain.spent.add(`${pay?.txid ?? ''}:1`);
    expect(await client.isUnspent(pay?.txid ?? '', 1)).toBe(false);
    expect(await client.feeRate(1)).toBe(3.5);
    expect(await client.feeRate(25)).toBeUndefined();
  });

  it('broadcasts raw hex and validates the txid answer', async () => {
    const { chain, client } = mk();
    expect(await client.broadcast('0200ff')).toMatch(/^[0-9a-f]{64}$/);
    expect(chain.broadcasts).toEqual(['0200ff']);
    expect(await codeOf(client.broadcast('xyz'))).toBe('INVALID_INPUT');
    const odd = new EsploraClient({ baseUrl: BASE, fetchFn: () => Promise.resolve(new Response('not a txid')) });
    expect(await codeOf(odd.broadcast('00'))).toBe('INVALID_RESPONSE');
  });

  it('fails closed on transport errors, aborts and malformed data', async () => {
    const { chain, client } = mk();
    chain.failPath = '/blocks/tip/height';
    expect(await codeOf(client.tipHeight())).toBe('TRANSPORT_FAILURE');
    const down = new EsploraClient({ baseUrl: BASE, fetchFn: () => Promise.reject(new Error('offline')) });
    expect(await codeOf(down.tipHeight())).toBe('TRANSPORT_FAILURE');
    const ac = new AbortController();
    ac.abort();
    expect(await codeOf(down.tipHeight(ac.signal))).toBe('ABORTED');
    expect(await codeOf(client.blockHash(-1))).toBe('INVALID_INPUT');
    expect(await codeOf(client.blockTxs('abc'))).toBe('INVALID_INPUT');
    expect(await codeOf(client.isUnspent('zz', 0))).toBe('INVALID_INPUT');

    const respond = (body: string) => new EsploraClient({ baseUrl: BASE, fetchFn: () => Promise.resolve(new Response(body)) });
    expect(await codeOf(respond('12x').tipHeight())).toBe('INVALID_RESPONSE');
    expect(await codeOf(respond('nothex').blockHash(1))).toBe('INVALID_RESPONSE');
    expect(await codeOf(respond('{not json').isUnspent('a'.repeat(64), 0))).toBe('INVALID_RESPONSE');
    expect(await codeOf(respond('{"spent":"no"}').isUnspent('a'.repeat(64), 0))).toBe('INVALID_RESPONSE');
    expect(await codeOf(respond('[1]').feeRate(1))).toBe('INVALID_RESPONSE');
    expect(await codeOf(respond('{"1":"x"}').feeRate(1).then((v) => (v === undefined ? Promise.reject(new SilentPaymentError('INVALID_RESPONSE')) : v)))).toBe('INVALID_RESPONSE');
    expect(await codeOf(servePage({}).blockTxs('a'.repeat(64)))).toBe('INVALID_RESPONSE');
  });

  it('rejects malformed transactions', async () => {
    const h = 'a'.repeat(64);
    const bad: unknown[] = [
      [1],
      [{ txid: 'zz', vin: [], vout: [] }],
      [{ txid: h, vin: 'x', vout: [] }],
      [{ txid: h, vin: [], vout: [1] }],
      [{ txid: h, vin: [], vout: [{ scriptpubkey: 'zz', value: 1 }] }],
      [{ txid: h, vin: [], vout: [{ scriptpubkey: '51', value: -1 }] }],
      [{ txid: h, vin: [1], vout: [] }],
      [{ txid: h, vin: [{ txid: h, vout: 0, prevout: null, scriptsig: '', witness: [], is_coinbase: false }], vout: [] }],
      [{ txid: h, vin: [{ txid: h, vout: 0, prevout: { scriptpubkey: '00' }, scriptsig: '', witness: 'x', is_coinbase: false }], vout: [] }],
    ];
    for (const b of bad) {
      expect(await codeOf(servePage(b).blockTxs(h))).toBe('INVALID_RESPONSE');
    }
    // A page longer than 25, or longer than the block summary announced, is refused before any transaction is parsed.
    expect(await codeOf(servePage(Array.from({ length: 26 }, () => SIMPLE_TX), 30).blockTxs(h))).toBe('INVALID_RESPONSE');
    expect(await codeOf(servePage([SIMPLE_TX, SIMPLE_TX], 1).blockTxs(h))).toBe('INVALID_RESPONSE');
  });

  it('encodes witnesses of any size (compact size boundaries)', async () => {
    const h = 'a'.repeat(64);
    const big = 'ab'.repeat(300);
    const tx = withTxid({
      version: 2,
      locktime: 0,
      vin: [
        { txid: h, vout: 0, sequence: 0xffffffff, prevout: { scriptpubkey: `0014${'6'.repeat(40)}` }, scriptsig: '', witness: [big, '', ...Array.from({ length: 300 }, () => '01')], is_coinbase: false },
        { txid: h, vout: 1, sequence: 0xffffffff, prevout: { scriptpubkey: '00' }, scriptsig: '', witness: null as unknown as string[], is_coinbase: false },
      ],
      vout: [{ scriptpubkey: '51', value: 1 }],
    });
    const [t] = await servePage([tx]).blockTxs(h);
    expect(t?.inputs?.[0]?.witness).toHaveLength(302);
    expect(t?.inputs?.[0]?.witness[0]).toHaveLength(300);
    expect(t?.inputs?.[1]?.witness).toHaveLength(0);
  });

  it('recomputes txids like an independent implementation and rejects edited transaction content', async () => {
    const tx = withTxid({
      version: 1, locktime: 500_000,
      vin: [{ txid: '12'.repeat(32), vout: 7, sequence: 0, prevout: { scriptpubkey: `0014${'6'.repeat(40)}` }, scriptsig: '00'.repeat(300), witness: [], is_coinbase: false }],
      vout: Array.from({ length: 260 }, (_, k) => ({ scriptpubkey: `0014${'5'.repeat(40)}`, value: 1_000 + k })),
    });
    const serve = (body: unknown) => servePage([body]);
    expect((await serve(tx).blockTxs('a'.repeat(64)))[0]?.txid).toBe(tx.txid);
    const edits: unknown[] = [
      { ...tx, vout: tx.vout.map((o, k) => (k === 3 ? { ...o, value: o.value + 1 } : o)) },
      { ...tx, vout: tx.vout.slice(1) },
      { ...tx, vin: [{ ...tx.vin[0]!, vout: 8 }] },
      { ...tx, vin: [{ ...tx.vin[0]!, sequence: 1 }] },
      { ...tx, locktime: 0 },
      { ...tx, version: 2 },
      { ...tx, version: undefined },
      { ...tx, locktime: undefined },
      { ...tx, vin: [{ ...tx.vin[0]!, sequence: undefined }] },
      { ...tx, vin: [] },
    ];
    for (const e of edits) expect(await codeOf(serve(e).blockTxs('a'.repeat(64)))).toBe('INVALID_RESPONSE');
  });

  it('requests exactly the pages a block has, also when its last page is full (electrs answers 400 past the end)', async () => {
    for (const n of [1, 24, 25, 26, 50]) {
      const { client, hash, requests } = electrsBlock(Array.from({ length: n }, () => SIMPLE_TX));
      expect(await client.blockTxs(hash)).toHaveLength(n);
      const pages = Array.from({ length: Math.ceil(n / 25) }, (_, k) => `/block/${hash}/txs/${String(k * 25)}`);
      expect(requests.filter((r) => r.includes('/txs/'))).toEqual(pages);
    }
  });

  it('reads blocks of more than 10,000 transactions in full and refuses an impossible transaction count unread', async () => {
    const big = electrsBlock(Array.from({ length: 10_001 }, () => SIMPLE_TX));
    expect(await big.client.blockTxs(big.hash)).toHaveLength(10_001);
    expect(big.requests.filter((r) => r.includes('/txs/'))).toHaveLength(401);
    // 4,000,000 weight units hold at most 16,666 of the smallest (60-byte) transactions.
    const impossible = electrsBlock([SIMPLE_TX], { tx_count: 16_667 });
    expect(await codeOf(impossible.client.blockTxs(impossible.hash))).toBe('INVALID_RESPONSE');
    expect(impossible.requests.some((r) => r.includes('/txs/'))).toBe(false);
  });

  it('refuses a block summary or pages that disagree with the transaction count', async () => {
    const txs = Array.from({ length: 30 }, () => SIMPLE_TX);
    for (const info of [{ tx_count: 0 }, { tx_count: 1.5 }, { tx_count: '30' }, { tx_count: 31 }, { tx_count: 29 }, { id: 'b'.repeat(64) }]) {
      const { client, hash } = electrsBlock(txs, info);
      expect(await codeOf(client.blockTxs(hash))).toBe('INVALID_RESPONSE');
    }
    const notRecord = new EsploraClient({ baseUrl: BASE, fetchFn: () => Promise.resolve(new Response('[]')) });
    expect(await codeOf(notRecord.blockTxs('a'.repeat(64)))).toBe('INVALID_RESPONSE');
  });

  it('checks the genesis hash and always refuses mainnet', async () => {
    const { client } = mk('regtest');
    await expect(client.checkNetwork(btcNetwork('regtest'))).resolves.toBeUndefined();
    expect(await codeOf(client.checkNetwork(btcNetwork('signet')))).toBe('NETWORK_MISMATCH');
    const main = new EsploraClient({ baseUrl: BASE, fetchFn: () => Promise.resolve(new Response(MAINNET_GENESIS)) });
    expect(await codeOf(main.checkNetwork(btcNetwork('mainnet')))).toBe('NETWORK_MISMATCH');
  });
});

describe('EsploraTweakSource and scanning', () => {
  it('derives tweaks locally, skips coinbase, and caches per block', async () => {
    const chain = mockChain('regtest', walletA());
    const src = new EsploraTweakSource(new EsploraClient({ baseUrl: BASE, fetchFn: chain.fetchFn }), btcNetwork('regtest'));
    expect(await src.getTipHeight()).toBe(4);
    const [tw, outs] = await Promise.all([src.getTweaks(3), src.getOutputs(3)]);
    expect(tw.tweaks).toHaveLength(2);
    expect(outs.outputs).toHaveLength(1);
    expect(tw.blockHash).toBe(outs.blockHash);
    expect(outs.outputs[0]?.amountSats).toBe(50_000n);
    expect(chain.requests.filter((r) => r.includes('/block-height/3'))).toHaveLength(1);
    expect((await src.getTweaks(4)).tweaks).toHaveLength(0);
  });

  it('retries a block after a failed fetch and bounds its cache', async () => {
    const chain = mockChain('regtest', walletA());
    const src = new EsploraTweakSource(new EsploraClient({ baseUrl: BASE, fetchFn: chain.fetchFn }), btcNetwork('regtest'));
    chain.failPath = '/block-height/1';
    await expect(src.getTweaks(1)).rejects.toThrow();
    chain.failPath = undefined;
    expect((await src.getTweaks(1)).tweaks).toHaveLength(1);
    for (const h of [0, 2, 3, 4]) await src.getTweaks(h);
    await src.getTweaks(1);
    expect(chain.requests.filter((r) => r.includes('/block-height/1'))).toHaveLength(3);
  });

  it('skips transactions whose inputs cannot yield a tweak', async () => {
    const w = walletA();
    const chain = mockChain('regtest', w);
    const blk = chain.blocks[1];
    if (blk === undefined) throw new Error('fixture');
    blk.txs.push(withTxid({
      version: 2,
      locktime: 0,
      vin: [{ txid: 'f'.repeat(64), vout: 0, sequence: 0xffffffff, prevout: { scriptpubkey: `0014${'6'.repeat(40)}` }, scriptsig: '', witness: ['00', '02'.repeat(5)], is_coinbase: false }],
      vout: [{ scriptpubkey: `5120${'ab'.repeat(32)}`, value: 5 }],
    }));
    blk.txs = withWitnessCommitment([coinbase(1), ...blk.txs.slice(1)]); // keep the block valid: re-commit to the new witness
    blk.header = mineHeader(btcNetwork('regtest').genesisHash, blk.txs);
    blk.hash = parseHeader(blk.header).hash;
    const src = new EsploraTweakSource(new EsploraClient({ baseUrl: BASE, fetchFn: chain.fetchFn }), btcNetwork('regtest'));
    expect((await src.getTweaks(1)).tweaks).toHaveLength(1);
    expect((await src.getOutputs(1)).outputs).toHaveLength(0);
  });

  it('refuses witness data the coinbase does not commit to (BIP-141), even when every txid still matches', async () => {
    const w = walletA();
    const run = async (edit: (txs: ReturnType<typeof mockChain>['blocks'][number]['txs']) => void): Promise<string> => {
      const chain = mockChain('regtest', w);
      const blk = chain.blocks[3];
      if (blk === undefined) throw new Error('fixture');
      edit(blk.txs);
      const src = new EsploraTweakSource(new EsploraClient({ baseUrl: BASE, fetchFn: chain.fetchFn }), btcNetwork('regtest'));
      try {
        await src.getTweaks(3);
        return 'OK';
      } catch (e) {
        return e instanceof SilentPaymentError ? e.code : 'OTHER';
      }
    };
    expect(await run(() => undefined)).toBe('OK');
    // Swap the payment's input public key in the witness: txid (and header Merkle root) unchanged.
    expect(await run((txs) => { const vin = txs[2]!.vin[0]!; vin.witness = [vin.witness[0]!, `02${'77'.repeat(32)}`]; })).toBe('INVALID_RESPONSE');
    // Drop the commitment output: also changes the coinbase txid, so the Merkle root catches it first.
    expect(await run((txs) => { txs[0]!.vout.pop(); })).toBe('INVALID_RESPONSE');
    // Remove the reserved value from the coinbase witness: txid unchanged, commitment check fails.
    expect(await run((txs) => { txs[0]!.vin[0]!.witness = []; })).toBe('INVALID_RESPONSE');
  });

  it('finds the payment, reports spent outputs, and finds nothing for another wallet', async () => {
    const w = walletA();
    const chain = mockChain('regtest', w);
    const client = new EsploraClient({ baseUrl: BASE, fetchFn: chain.fetchFn });
    const seen: number[] = [];
    const res = await scanForPayments({ client, wallet: w, fromHeight: 1, onBlock: (h) => seen.push(h) });
    expect(res.toHeight).toBe(4);
    expect(res.found).toHaveLength(1);
    expect(res.found[0]).toMatchObject({ vout: 1, amountSats: 50_000n, height: 3, label: null });
    expect(seen).toEqual([3]);
    // The server only ever saw heights, hashes, outpoints (no key material).
    for (const r of chain.requests) expect(r).toMatch(/^GET \/(blocks\/tip\/height|block-height\/\d+|block\/[0-9a-f]{64}|block\/[0-9a-f]{64}\/txs\/\d+|block\/[0-9a-f]{64}\/header|tx\/[0-9a-f]{64}\/outspend\/\d+)$/);

    chain.spent.add(`${res.found[0]?.txid ?? ''}:1`);
    const again = await scanForPayments({ client, wallet: w, fromHeight: 3, toHeight: 3 });
    expect(again.found).toHaveLength(0);
    expect(again.spentCount).toBe(1);

    const other = walletFromSeedHex(SEED_B, btcNetwork('regtest'));
    expect((await scanForPayments({ client, wallet: other, fromHeight: 0 })).found).toHaveLength(0);
  });

  it('binds scanned data to a proof-of-work header: omitted, injected, edited or unlinked blocks are refused', async () => {
    const w = walletA();
    const fresh = () => {
      const chain = mockChain('regtest', w);
      return { chain, src: new EsploraTweakSource(new EsploraClient({ baseUrl: BASE, fetchFn: chain.fetchFn }), btcNetwork('regtest')) };
    };
    const code = (p: Promise<unknown>) => codeOf(p);
    // Omitting the payment (a hiding server) breaks the Merkle root.
    let { chain, src } = fresh();
    chain.blocks[3]!.txs.splice(2, 1);
    expect(await code(src.getOutputs(3))).toBe('INVALID_RESPONSE');
    // Injecting a self-consistent transaction without a matching header also breaks it.
    ({ chain, src } = fresh());
    chain.blocks[3]!.txs.push(paymentTx(77, w, SEED_B, 1_000_000));
    expect(await code(src.getOutputs(3))).toBe('INVALID_RESPONSE');
    // Header that does not hash to the served block hash.
    ({ chain, src } = fresh());
    chain.blocks[3]!.header = chain.blocks[4]!.header!;
    expect(await code(src.getOutputs(3))).toBe('INVALID_RESPONSE');
    // Regtest-easy proof of work is refused on a test network with a real limit.
    ({ chain } = fresh());
    const strict = new EsploraTweakSource(new EsploraClient({ baseUrl: BASE, fetchFn: chain.fetchFn }), btcNetwork('testnet4'));
    expect(await code(strict.getOutputs(3))).toBe('INVALID_RESPONSE');
    // A valid block that does not extend the block below it (or the pinned genesis) is a fork.
    ({ chain, src } = fresh());
    await src.getOutputs(2);
    const forked = mineHeader('ab'.repeat(32), chain.blocks[3]!.txs);
    chain.blocks[3]!.header = forked;
    chain.blocks[3]!.hash = parseHeader(forked).hash;
    expect(await code(src.getOutputs(3))).toBe('REORG_DETECTED');
    ({ chain, src } = fresh());
    const orphan = mineHeader('cd'.repeat(32), chain.blocks[1]!.txs);
    chain.blocks[1]!.header = orphan;
    chain.blocks[1]!.hash = parseHeader(orphan).hash;
    expect(await code(src.getOutputs(1))).toBe('REORG_DETECTED');
    // Linkage is checked from above too: block 2 seen first, then a replacement block 1.
    ({ chain, src } = fresh());
    await src.getOutputs(2);
    const other = mineHeader(btcNetwork('regtest').genesisHash, [coinbase(99)]);
    chain.blocks[1] = { hash: parseHeader(other).hash, header: other, txs: [coinbase(99)] };
    expect(await code(src.getOutputs(1))).toBe('REORG_DETECTED');
    // Genesis is never downloaded and must equal the pinned hash.
    ({ chain, src } = fresh());
    expect((await src.getOutputs(0)).outputs).toEqual([]);
    expect(chain.requests.some((r) => r.includes('/header'))).toBe(false);
    chain.blocks[0]!.hash = 'ee'.repeat(32);
    ({ src } = { src: new EsploraTweakSource(new EsploraClient({ baseUrl: BASE, fetchFn: chain.fetchFn }), btcNetwork('regtest')) });
    expect(await code(src.getOutputs(0))).toBe('NETWORK_MISMATCH');
  });

  it('scans a block whose transaction count is a multiple of 25', async () => {
    const w = walletA();
    const chain = mockChain('regtest', w, { block2Txs: 25 });
    const client = new EsploraClient({ baseUrl: BASE, fetchFn: chain.fetchFn });
    const res = await scanForPayments({ client, wallet: w, fromHeight: 1 });
    expect(res.found).toHaveLength(1);
    expect(chain.requests.filter((r) => r.includes('/txs/') && r.includes(chain.blocks[2]!.hash))).toHaveLength(1);
  });

  it('validates the range', async () => {
    const w = walletA();
    const chain = mockChain('regtest', w);
    const client = new EsploraClient({ baseUrl: BASE, fetchFn: chain.fetchFn });
    expect(await codeOf(scanForPayments({ client, wallet: w, fromHeight: -1 }))).toBe('INVALID_INPUT');
    expect((await scanForPayments({ client, wallet: w, fromHeight: 99 })).found).toEqual([]);
    chain.blocks.length = 1;
    const many = { ...client, tipHeight: () => Promise.resolve(MAX_SCAN_BLOCKS + 10) } as unknown as EsploraClient;
    expect(await codeOf(scanForPayments({ client: many, wallet: w, fromHeight: 0 }))).toBe('INVALID_INPUT');
  });

  it('stops quietly when aborted', async () => {
    const w = walletA();
    const chain = mockChain('regtest', w);
    const client = new EsploraClient({ baseUrl: BASE, fetchFn: chain.fetchFn });
    const ac = new AbortController();
    ac.abort();
    expect((await scanForPayments({ client, wallet: w, fromHeight: 0, signal: ac.signal }).catch(() => ({ found: [] }))).found).toHaveLength(0);
  });
});
