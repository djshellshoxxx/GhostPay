import { createSilentPaymentOutputs, merkleRoot, parseHeader, reverseHex, sha256d, silentPaymentKeysFromSeed, targetFromBits } from '@ghostpay/btc-silent-payments';
import { Transaction } from '@scure/btc-signer';
import { GENESIS_HEADERS, type IdbFactoryLike } from './headers';
import { btcNetwork, type BtcNetworkId } from './network';
import { walletFromSeedHex, type BtcWallet } from './wallet';

export const SEED_A = '11'.repeat(32);
export const SEED_B = '22'.repeat(32);

const hex = (n: number, ch: string): string => ch.repeat(n);
const HASH = (i: number): string => i.toString(16).padStart(64, '0');

export interface EsploraVin {
  txid: string;
  vout: number;
  sequence: number;
  prevout: { scriptpubkey: string } | null;
  scriptsig: string;
  witness: string[];
  is_coinbase: boolean;
}
export interface EsploraTxJson {
  txid: string;
  version: number;
  locktime: number;
  vin: EsploraVin[];
  vout: { scriptpubkey: string; value: number }[];
}
export interface MockBlock {
  hash: string;
  /** 80-byte header hex (absent for genesis, which the scanner never downloads). */
  header?: string;
  txs: EsploraTxJson[];
}

/**
 * Txid from an independent implementation (@scure/btc-signer), so the app's own serializer is tested
 * against it rather than against itself.
 */
export function withTxid(tx: Omit<EsploraTxJson, 'txid'>): EsploraTxJson {
  const t = new Transaction({ version: tx.version, lockTime: tx.locktime, allowUnknownInputs: true, allowUnknownOutputs: true, disableScriptCheck: true });
  // Outputs first: an input with a final scriptSig counts as signed and freezes the outputs.
  for (const o of tx.vout) t.addOutput({ script: Uint8Array.from(Buffer.from(o.scriptpubkey, 'hex')), amount: BigInt(o.value) });
  for (const i of tx.vin) t.addInput({ txid: i.txid, index: i.vout, sequence: i.sequence, finalScriptSig: Uint8Array.from(Buffer.from(i.scriptsig, 'hex')) });
  return { ...tx, txid: t.id };
}

const le32 = (n: number): string => Array.from([0, 8, 16, 24], (sh) => ((n >>> sh) & 0xff).toString(16).padStart(2, '0')).join('');

/** Regtest-difficulty header over the block's txids, nonce ground until it meets 0x207fffff. */
export function mineHeader(prevHash: string, txs: readonly EsploraTxJson[], bits = 0x207fffff, time = 1_700_000_000): string {
  const root = merkleRoot(txs.map((t) => t.txid));
  for (let nonce = 0; ; nonce++) {
    const hex = `${le32(0x20000000)}${reverseHex(prevHash)}${reverseHex(root)}${le32(time)}${le32(bits)}${le32(nonce)}`;
    if (BigInt(`0x${parseHeader(hex).hash}`) <= targetFromBits(bits)) return hex;
  }
}

const varint = (n: number): string => (n < 0xfd ? n.toString(16).padStart(2, '0') : `fd${(n & 0xff).toString(16).padStart(2, '0')}${(n >> 8).toString(16).padStart(2, '0')}`);
const le64 = (v: number): string => le32(v % 2 ** 32) + le32(Math.floor(v / 2 ** 32));

/** wtxid by direct BIP-144 serialization (test-side implementation, independent of the app's). */
export function wtxidOf(tx: EsploraTxJson): string {
  const segwit = tx.vin.some((i) => i.witness.length > 0);
  let s = le32(tx.version) + (segwit ? '0001' : '') + varint(tx.vin.length);
  for (const i of tx.vin) s += reverseHex(i.txid) + le32(i.vout) + varint(i.scriptsig.length / 2) + i.scriptsig + le32(i.sequence);
  s += varint(tx.vout.length);
  for (const o of tx.vout) s += le64(o.value) + varint(o.scriptpubkey.length / 2) + o.scriptpubkey;
  if (segwit) for (const i of tx.vin) s += varint(i.witness.length) + i.witness.map((w) => varint(w.length / 2) + w).join('');
  s += le32(tx.locktime);
  return reverseHex(toHex(sha256d(Uint8Array.from(Buffer.from(s, 'hex')))));
}

/** Adds the BIP-141 witness commitment (and the 32-byte reserved value) to the coinbase when any tx has a witness. */
export function withWitnessCommitment(txs: readonly EsploraTxJson[]): EsploraTxJson[] {
  const [cb, ...rest] = txs;
  if (cb === undefined || !rest.some((t) => t.vin.some((i) => i.witness.length > 0))) return [...txs];
  const reserved = '00'.repeat(32);
  const root = merkleRoot(['0'.repeat(64), ...rest.map(wtxidOf)]);
  const commitment = toHex(sha256d(Uint8Array.from(Buffer.from(reverseHex(root) + reserved, 'hex'))));
  const coinbaseTx = withTxid({
    version: cb.version,
    locktime: cb.locktime,
    vin: cb.vin.map((i) => ({ ...i, witness: [reserved] })),
    vout: [...cb.vout, { scriptpubkey: `6a24aa21a9ed${commitment}`, value: 0 }],
  });
  return [coinbaseTx, ...rest];
}

/** Time of block `height` in mined test chains: ten minutes apart, so the header-chain timestamp rules hold. */
export const blockTime = (height: number, offset = 0): number => 1_700_000_000 + 600 * height + offset;

/** Builds linked blocks above `genesisHash` (coinbases commit to witnesses like bitcoind's). */
export function mineChain(genesisHash: string, rawBodies: readonly EsploraTxJson[][]): MockBlock[] {
  const out: MockBlock[] = [{ hash: genesisHash, txs: [] }];
  for (const txs of rawBodies.map(withWitnessCommitment)) {
    const header = mineHeader(out[out.length - 1]!.hash, txs, 0x207fffff, blockTime(out.length));
    out.push({ hash: parseHeader(header).hash, header, txs });
  }
  return out;
}

/**
 * Replaces the blocks from `fromHeight` up with a different branch of `length` blocks (coinbase only, distinct by
 * `tag`), mined on the block below. A longer branch has more work at regtest difficulty.
 */
export function forkChain(blocks: MockBlock[], fromHeight: number, length: number, tag: number): void {
  blocks.splice(fromHeight);
  for (let i = 0; i < length; i++) {
    const height = blocks.length;
    const txs = [coinbase(0x500 + tag * 16 + i)];
    const header = mineHeader(blocks[height - 1]!.hash, txs, 0x207fffff, blockTime(height, tag));
    blocks.push({ hash: parseHeader(header).hash, header, txs });
  }
}

/** Esplora `/blocks/:height` summary of a header (the fields the app rebuilds a header from). */
export function blockSummary(height: number, headerHex: string): Record<string, unknown> {
  const h = parseHeader(headerHex);
  return {
    id: h.hash,
    height,
    version: h.version,
    timestamp: h.time,
    bits: h.bits,
    nonce: h.nonce,
    merkle_root: h.merkleRoot,
    previousblockhash: height === 0 ? null : h.prevHash,
    tx_count: 1,
  };
}

function toHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

export function coinbase(i: number): EsploraTxJson {
  return withTxid({
    version: 2,
    locktime: 0,
    vin: [{ txid: hex(64, '0'), vout: 0xffffffff, sequence: 0xffffffff, prevout: null, scriptsig: `03${i.toString(16).padStart(6, '0')}`, witness: [], is_coinbase: true }],
    vout: [{ scriptpubkey: `0014${hex(40, '9')}`, value: 5_000_000_000 }],
  });
}

/** A transaction that has no silent payment output (decoy). */
export function decoyTx(i: number, senderSeedHex: string): EsploraTxJson {
  const s = silentPaymentKeysFromSeed(Uint8Array.from(Buffer.from(senderSeedHex, 'hex')), { network: 'testnet' });
  return withTxid({
    version: 2,
    locktime: 0,
    vin: [
      {
        txid: HASH(0x3000 + i),
        vout: 0,
        sequence: 0xfffffffd,
        prevout: { scriptpubkey: `0014${hex(40, '7')}` },
        scriptsig: '',
        witness: [hex(142, '3'), toHex(s.scanPublicKey)],
        is_coinbase: false,
      },
    ],
    vout: [{ scriptpubkey: `0014${hex(40, '5')}`, value: 10_000 }],
  });
}

/** A real BIP-352 payment of `amountSats` to `recipient`, sent from a P2WPKH input. */
export function paymentTx(i: number, recipient: BtcWallet, senderSeedHex: string, amountSats: number): EsploraTxJson {
  const sender = silentPaymentKeysFromSeed(Uint8Array.from(Buffer.from(senderSeedHex, 'hex')), { network: 'testnet' });
  const fundingTxid = HASH(0x3000 + i);
  const [out] = createSilentPaymentOutputs({
    inputs: [{ privateKey: sender.scanSecret, isTaproot: false }],
    outpoints: [{ txid: fundingTxid, vout: 0 }],
    recipients: [recipient.address],
    network: 'testnet',
  });
  if (out === undefined) throw new Error('no output');
  return withTxid({
    version: 2,
    locktime: 0,
    vin: [
      {
        txid: fundingTxid,
        vout: 0,
        sequence: 0xfffffffd,
        prevout: { scriptpubkey: `0014${hex(40, '6')}` },
        scriptsig: '',
        witness: [hex(142, '3'), toHex(sender.scanPublicKey)],
        is_coinbase: false,
      },
    ],
    vout: [
      { scriptpubkey: `0014${hex(40, '5')}`, value: 1_234 },
      { scriptpubkey: `5120${toHex(out.xOnlyPublicKey)}`, value: amountSats },
    ],
  });
}

export interface MockChain {
  readonly blocks: MockBlock[];
  readonly spent: Set<string>;
  readonly broadcasts: string[];
  readonly requests: string[];
  /** Makes the next request for this path fail with HTTP 500. */
  failPath: string | undefined;
  /** Serve `GET /blocks/:height` (default true); false acts like a server without it (HTTP 404). */
  summaries: boolean;
  /** Rewrites each `/blocks/:height` summary before it is served (tampering tests). */
  summaryEdit?: (s: Record<string, unknown>) => Record<string, unknown>;
  fetchFn: (url: string, init: RequestInit) => Promise<Response>;
}

export interface MockChainOptions {
  /** Transactions in block 2 (default 30: two pages). 25 fills its only page exactly. At most 30. */
  readonly block2Txs?: number;
  /** Payments to `recipient` in block 3 (default 1): 50_000 sats, then 40_000, 30_000, ... */
  readonly payments?: number;
}

/**
 * In-memory Esplora server at `https://esplora.test/api`. Block 0 has the genesis hash of `netId`;
 * block 3 holds one payment of 50_000 sats to `recipient`; block 2 is large enough to need 2 pages.
 * Paging behaves like electrs: `/block/:hash` reports `tx_count`, and a start index at or past the end of the
 * block (or not a multiple of 25) is an HTTP 400, not an empty page.
 */
export function mockChain(netId: BtcNetworkId, recipient: BtcWallet, opts: MockChainOptions = {}): MockChain {
  const net = btcNetwork(netId);
  const blocks: MockBlock[] = mineChain(net.genesisHash, [
    [coinbase(1), decoyTx(1, SEED_B)],
    [coinbase(2), ...Array.from({ length: (opts.block2Txs ?? 30) - 1 }, (_, k) => decoyTx(10 + k, SEED_B))],
    [coinbase(3), decoyTx(40, SEED_B), ...Array.from({ length: opts.payments ?? 1 }, (_, k) => paymentTx(50 + k, recipient, SEED_B, 50_000 - 10_000 * k))],
    [coinbase(4)],
  ]);
  const chain: MockChain = {
    blocks,
    spent: new Set<string>(),
    broadcasts: [],
    requests: [],
    failPath: undefined,
    summaries: true,
    fetchFn: (url, init) => {
      const base = 'https://esplora.test/api';
      if (!url.startsWith(base)) return Promise.reject(new Error(`unexpected host ${url}`));
      const path = url.slice(base.length);
      chain.requests.push(`${init.method ?? 'GET'} ${path}`);
      const text = (body: string): Promise<Response> => Promise.resolve(new Response(body, { status: 200 }));
      const json = (v: unknown): Promise<Response> => text(JSON.stringify(v));
      if (chain.failPath === path) return Promise.resolve(new Response('boom', { status: 500 }));
      let m: RegExpExecArray | null;
      if (path === '/blocks/tip/height') return text(String(blocks.length - 1));
      if ((m = /^\/blocks\/(\d+)$/.exec(path)) && chain.summaries) {
        const top = Math.min(Number(m[1]), blocks.length - 1);
        const genesis = netId === 'mainnet' ? undefined : GENESIS_HEADERS[netId];
        const list: unknown[] = [];
        for (let h = top; h >= 0 && h > top - 10; h--) {
          const hdr = h === 0 ? genesis : blocks[h]!.header;
          if (hdr !== undefined) list.push(chain.summaryEdit?.(blockSummary(h, hdr)) ?? blockSummary(h, hdr));
        }
        return json(list);
      }
      if ((m = /^\/block-height\/(\d+)$/.exec(path))) {
        const b = blocks[Number(m[1])];
        return b === undefined ? Promise.resolve(new Response('Block not found', { status: 404 })) : text(b.hash);
      }
      if ((m = /^\/block\/([0-9a-f]{64})$/.exec(path))) {
        const height = blocks.findIndex((x) => x.hash === m?.[1]);
        const b = blocks[height];
        return b === undefined ? Promise.resolve(new Response('Block not found', { status: 404 })) : json({ id: b.hash, height, tx_count: b.txs.length });
      }
      if ((m = /^\/block\/([0-9a-f]{64})\/txs\/(\d+)$/.exec(path))) {
        const b = blocks.find((x) => x.hash === m?.[1]);
        if (b === undefined) return Promise.resolve(new Response('nope', { status: 404 }));
        const start = Number(m[2]);
        if (start >= b.txs.length || start % 25 !== 0) return Promise.resolve(new Response('start index out of range', { status: 400 }));
        return json(b.txs.slice(start, start + 25));
      }
      if ((m = /^\/block\/([0-9a-f]{64})\/header$/.exec(path))) {
        const b = blocks.find((x) => x.hash === m?.[1]);
        return b?.header === undefined ? Promise.resolve(new Response('nope', { status: 404 })) : text(b.header);
      }
      if ((m = /^\/tx\/([0-9a-f]{64})\/outspend\/(\d+)$/.exec(path))) {
        return json({ spent: chain.spent.has(`${m[1]}:${m[2]}`) });
      }
      if (path === '/fee-estimates') return json({ '1': 3.5, '6': 1.2 });
      if (path === '/tx' && init.method === 'POST') {
        chain.broadcasts.push(typeof init.body === 'string' ? init.body : '');
        return text(HASH(0x9999));
      }
      return Promise.resolve(new Response('not found', { status: 404 }));
    },
  };
  return chain;
}

export function walletA(netId: BtcNetworkId = 'regtest'): BtcWallet {
  return walletFromSeedHex(SEED_A, btcNetwork(netId));
}

/** Just enough of IndexedDB for the header store: one database, one object store, async request callbacks. */
export function fakeIdb(o: { failOpen?: boolean; failGet?: boolean } = {}): IdbFactoryLike & { data: Map<string, unknown>; opens: number } {
  const data = new Map<string, unknown>();
  const names = new Set<string>();
  const req = <T,>(f: () => T, fail = false): IDBRequest<T> => {
    const r = {} as { result: T; onsuccess?: () => void; onerror?: () => void };
    setTimeout(() => {
      if (fail) { r.onerror?.(); return; }
      r.result = f();
      r.onsuccess?.();
    }, 0);
    return r as unknown as IDBRequest<T>;
  };
  const db = {
    objectStoreNames: { contains: (n: string) => names.has(n) },
    createObjectStore: (n: string) => { names.add(n); },
    transaction: () => ({
      objectStore: () => ({
        get: (k: string) => req(() => data.get(k), o.failGet),
        put: (v: unknown, k: string) => req(() => { data.set(k, v); return k; }),
      }),
    }),
  };
  const f = {
    data,
    opens: 0,
    open: () => {
      f.opens++;
      const r = {} as { result: unknown; onupgradeneeded?: () => void; onsuccess?: () => void; onerror?: () => void };
      setTimeout(() => {
        if (o.failOpen === true) { r.onerror?.(); return; }
        r.result = db;
        r.onupgradeneeded?.();
        r.onsuccess?.();
      }, 0);
      return r as unknown as IDBOpenDBRequest;
    },
  };
  return f;
}
