import {
  computeTransactionTweak,
  parseRawTransaction,
  reverseHex,
  SilentPaymentError,
  verifyBlockData,
  verifyWitnessCommitment,
  txInputFromHex,
  type ParsedTransaction,
  type BlockOutput,
  type BlockOutputs,
  type BlockTweaks,
  type TweakSource,
  type TxInput,
} from '@ghostpay/btc-silent-payments';
import { MAINNET_GENESIS, type BtcNetworkInfo } from './network';

/** Subset of `fetch` used here (the app's injected `Services.fetchFn`). */
export type EsploraFetch = (url: string, init: RequestInit) => Promise<Response>;

/** Esplora returns 25 transactions per `/block/:hash/txs/:start` page. */
const PAGE = 25;
/** Largest response body read, in bytes; a bigger one is cancelled while it streams. */
const MAX_TEXT = 16 * 1024 * 1024;
/** Default per-request deadline (headers and body), in ms. */
const TIMEOUT_MS = 30_000;
/**
 * Most transactions a valid block can hold: 4,000,000 weight units / 240 for the smallest possible (60-byte)
 * transaction. A larger claimed count is refused before any page is downloaded; anything up to it is read in full.
 */
const MAX_BLOCK_TXS = 16_666;
const HEX64 = /^[0-9a-f]{64}$/;

function bad(): never {
  throw new SilentPaymentError('INVALID_RESPONSE');
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function uint(v: unknown): number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : bad();
}

function hexStr(v: unknown, minLen = 0): string {
  if (typeof v !== 'string' || v.length % 2 !== 0 || v.length < minLen || !/^[0-9a-fA-F]*$/.test(v)) return bad();
  return v.toLowerCase();
}

/**
 * Validates the user-entered Esplora base URL. https is required, except plain http to a loopback
 * host (the local regtest shim). No credentials, query or fragment.
 */
export function normalizeEsploraUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new SilentPaymentError('INVALID_INPUT');
  }
  const loopback = u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]';
  const okProto = u.protocol === 'https:' || (u.protocol === 'http:' && loopback);
  if (!okProto || u.username !== '' || u.password !== '' || u.search !== '' || u.hash !== '') {
    throw new SilentPaymentError('INVALID_INPUT');
  }
  return `${u.origin}${u.pathname.replace(/\/+$/, '')}`;
}

export interface EsploraTx {
  readonly txid: string;
  readonly inputs: readonly TxInput[] | null; // null: coinbase
  readonly outputs: readonly { readonly scriptPubKey: Uint8Array; readonly valueSats: bigint }[];
  /** Strict re-parse of the serialized transaction (txid and wtxid recomputed). */
  readonly raw: ParsedTransaction;
}

function hexToBytes(h: string): Uint8Array {
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(h.slice(2 * i, 2 * i + 2), 16);
  return out;
}

function u32le(n: number): string {
  return [0, 8, 16, 24].map((sh) => ((n >>> sh) & 0xff).toString(16).padStart(2, '0')).join('');
}

function u64le(n: bigint): string {
  let s = '';
  for (let i = 0n; i < 8n; i++) s += Number((n >> (8n * i)) & 0xffn).toString(16).padStart(2, '0');
  return s;
}

function witnessItems(i: Record<string, unknown>): string[] {
  const w = i['witness'];
  if (w === undefined || w === null) return [];
  if (!Array.isArray(w)) return bad();
  return w.map((x: unknown) => hexStr(x));
}

/**
 * Re-serializes the transaction from Esplora's JSON fields, witness included (BIP-144), so the package can
 * recompute its txid and wtxid. The txid binds inputs and outputs to the header Merkle root; the wtxid binds the
 * witness through the coinbase commitment ({@link verifyWitnessCommitment}). Prevout scripts are still NOT bound
 * (they live in earlier blocks): a server that alters them can hide a payment but cannot forge one.
 */
function serializeTx(v: Record<string, unknown>, vin: readonly unknown[], vout: readonly unknown[]): string {
  const version = v['version'];
  const locktime = uint(v['locktime']);
  if (typeof version !== 'number' || !Number.isInteger(version) || version < -0x80000000 || version > 0xffffffff || locktime > 0xffffffff) return bad();
  const witnesses: string[][] = [];
  let ins = '';
  for (const i of vin) {
    if (!isRecord(i)) return bad();
    const prev = hexStr(i['txid'], 64);
    const index = uint(i['vout']);
    const sequence = uint(i['sequence']);
    if (!HEX64.test(prev) || index > 0xffffffff || sequence > 0xffffffff) return bad();
    const scriptSig = hexStr(i['scriptsig'] ?? '');
    ins += reverseHex(prev) + u32le(index) + compact(scriptSig.length / 2) + scriptSig + u32le(sequence);
    witnesses.push(witnessItems(i));
  }
  let outs = '';
  for (const o of vout) {
    if (!isRecord(o)) return bad();
    const script = hexStr(o['scriptpubkey']);
    outs += u64le(BigInt(uint(o['value']))) + compact(script.length / 2) + script;
  }
  const segwit = witnesses.some((w) => w.length > 0);
  const wit = segwit ? witnesses.map((w) => compact(w.length) + w.map((h) => compact(h.length / 2) + h).join('')).join('') : '';
  return u32le(version >>> 0) + (segwit ? '0001' : '') + compact(vin.length) + ins + compact(vout.length) + outs + wit + u32le(locktime);
}

function parseTx(v: unknown): EsploraTx {
  if (!isRecord(v)) return bad();
  const txid = hexStr(v['txid'], 64);
  if (!HEX64.test(txid)) return bad();
  const vin = v['vin'];
  const vout = v['vout'];
  if (!Array.isArray(vin) || !Array.isArray(vout) || vin.length === 0 || vin.length > 100_000 || vout.length > 100_000) return bad();
  const raw = parseRawTransaction(serializeTx(v, vin, vout));
  if (raw.txid !== txid) return bad();
  const outputs = vout.map((o: unknown) => {
    if (!isRecord(o)) return bad();
    return { scriptPubKey: hexToBytes(hexStr(o['scriptpubkey'])), valueSats: BigInt(uint(o['value'])) };
  });
  return { txid, inputs: parseInputs(vin), outputs, raw };
}

function parseInputs(vin: readonly unknown[]): readonly TxInput[] | null {
  const out: TxInput[] = [];
  for (const i of vin) {
    if (!isRecord(i)) return bad();
    if (i['is_coinbase'] === true) return null;
    const prevout = i['prevout'];
    if (!isRecord(prevout)) return bad();
    const witness = i['witness'];
    if (witness !== undefined && witness !== null && !Array.isArray(witness)) return bad();
    out.push(
      txInputFromHex({
        txid: hexStr(i['txid'], 64),
        vout: uint(i['vout']),
        scriptSig: hexStr(i['scriptsig'] ?? ''),
        txinwitness: encodeWitness((witness ?? []) as readonly unknown[]),
        prevoutScriptPubKey: hexStr(prevout['scriptpubkey']),
      }),
    );
  }
  return out;
}

function compact(n: number): string {
  if (n < 0xfd) return n.toString(16).padStart(2, '0');
  if (n <= 0xffff) return `fd${(n & 0xff).toString(16).padStart(2, '0')}${(n >> 8).toString(16).padStart(2, '0')}`;
  return `fe${[0, 8, 16, 24].map((s) => ((n >>> s) & 0xff).toString(16).padStart(2, '0')).join('')}`;
}

/** Esplora lists witness items as hex strings; the package parses a serialized witness. */
function encodeWitness(items: readonly unknown[]): string {
  if (items.length === 0) return '';
  return compact(items.length) + items.map((w) => {
    const h = hexStr(w);
    return compact(h.length / 2) + h;
  }).join('');
}

/**
 * Reads the body as UTF-8 text through a byte cap, so a hostile server cannot make the tab buffer an unbounded body:
 * a declared `Content-Length` above it is refused unread, and the download is cancelled as soon as the streamed bytes
 * pass it. An abort of `signal` cancels the download too, even when the fetch implementation does not.
 * @throws {SilentPaymentError} `INVALID_RESPONSE` past the cap; stream errors and the abort reason propagate as thrown.
 */
async function readCapped(res: Response, max: number, signal: AbortSignal): Promise<string> {
  if (Number(res.headers.get('content-length')) > max) {
    await res.body?.cancel().catch(() => undefined);
    return bad();
  }
  if (res.body === null) return '';
  const reader = res.body.getReader();
  const stop = (): void => {
    reader.cancel().catch(() => undefined);
  };
  signal.addEventListener('abort', stop, { once: true });
  // Already aborted (a fetch implementation that ignored the signal): no event will come, so stop now.
  if (signal.aborted) stop();
  try {
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      total += value.byteLength;
      if (total > max) {
        await reader.cancel().catch(() => undefined);
        return bad();
      }
      chunks.push(value);
    }
    const all = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      all.set(c, off);
      off += c.byteLength;
    }
    return new TextDecoder().decode(all);
  } finally {
    signal.removeEventListener('abort', stop);
  }
}

export interface EsploraClientOptions {
  readonly baseUrl: string;
  readonly fetchFn: EsploraFetch;
  /** Deadline per request in ms, body download included (default 30 s). The caller's signal can end it sooner. */
  readonly timeoutMs?: number;
}

/**
 * Minimal client for the Esplora REST API (the Blockstream/mempool.space style used by many servers).
 * Endpoints: `GET /blocks/tip/height`, `GET /block-height/:h`, `GET /block/:hash`, `GET /block/:hash/txs/:start`,
 * `GET /block/:hash/header`, `GET /tx/:txid/outspend/:vout`, `GET /fee-estimates`, `POST /tx`.
 *
 * @security Responses are untrusted and validated. Only block heights, outpoints and the raw
 * transaction you broadcast are sent; no key material ever reaches this class. Requests send no
 * credentials or referrer, bypass the HTTP cache, refuse redirects and end at a deadline; bodies are
 * read through a size cap.
 */
export class EsploraClient {
  public readonly baseUrl: string;
  private readonly fetchFn: EsploraFetch;
  private readonly timeoutMs: number;

  public constructor(options: EsploraClientOptions) {
    this.baseUrl = normalizeEsploraUrl(options.baseUrl);
    this.fetchFn = options.fetchFn;
    this.timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  }

  private async text(path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<string> {
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const combined = signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
    const failure = (): SilentPaymentError => new SilentPaymentError(signal?.aborted === true ? 'ABORTED' : 'TRANSPORT_FAILURE');
    let res: Response;
    try {
      res = await this.fetchFn(`${this.baseUrl}${path}`, {
        ...init,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        redirect: 'error',
        cache: 'no-store',
        signal: combined,
      });
    } catch {
      throw failure();
    }
    if (!res.ok) throw new SilentPaymentError('TRANSPORT_FAILURE');
    try {
      return await readCapped(res, MAX_TEXT, combined);
    } catch (e) {
      if (e instanceof SilentPaymentError) throw e;
      throw failure();
    }
  }

  private async json(path: string, signal?: AbortSignal): Promise<unknown> {
    const t = await this.text(path, {}, signal);
    try {
      return JSON.parse(t) as unknown;
    } catch {
      return bad();
    }
  }

  public async tipHeight(signal?: AbortSignal): Promise<number> {
    const t = (await this.text('/blocks/tip/height', {}, signal)).trim();
    return /^\d{1,10}$/.test(t) ? Number(t) : bad();
  }

  public async blockHash(height: number, signal?: AbortSignal): Promise<string> {
    if (!Number.isInteger(height) || height < 0 || height > 0xffffffff) throw new SilentPaymentError('INVALID_INPUT');
    const t = (await this.text(`/block-height/${String(height)}`, {}, signal)).trim().toLowerCase();
    return HEX64.test(t) ? t : bad();
  }

  /**
   * All transactions of a block, in block order. The page count comes from the block's `tx_count`: electrs answers
   * a start index at or past the end with an HTTP error, not an empty page, so a full last page must not lead to
   * another request. The count itself is the server's word; the header Merkle root check catches a wrong one.
   */
  public async blockTxs(hash: string, signal?: AbortSignal): Promise<readonly EsploraTx[]> {
    if (!HEX64.test(hash)) throw new SilentPaymentError('INVALID_INPUT');
    const info = await this.json(`/block/${hash}`, signal);
    if (!isRecord(info) || info['id'] !== hash) return bad();
    const count = uint(info['tx_count']);
    if (count === 0 || count > MAX_BLOCK_TXS) return bad();
    const txs: EsploraTx[] = [];
    for (let start = 0; start < count; start += PAGE) {
      const body = await this.json(`/block/${hash}/txs/${String(start)}`, signal);
      if (!Array.isArray(body) || body.length !== Math.min(PAGE, count - start)) return bad();
      for (const t of body) txs.push(parseTx(t));
    }
    return txs;
  }

  /** The 80-byte block header as hex. */
  public async blockHeader(hash: string, signal?: AbortSignal): Promise<string> {
    if (!HEX64.test(hash)) throw new SilentPaymentError('INVALID_INPUT');
    const t = (await this.text(`/block/${hash}/header`, {}, signal)).trim().toLowerCase();
    return /^[0-9a-f]{160}$/.test(t) ? t : bad();
  }

  /** True when the outpoint is unspent according to the server (mempool included). */
  public async isUnspent(txid: string, vout: number, signal?: AbortSignal): Promise<boolean> {
    if (!HEX64.test(txid) || !Number.isInteger(vout) || vout < 0) throw new SilentPaymentError('INVALID_INPUT');
    const body = await this.json(`/tx/${txid}/outspend/${String(vout)}`, signal);
    if (!isRecord(body) || typeof body['spent'] !== 'boolean') return bad();
    return !body['spent'];
  }

  /** sat/vB estimate for confirmation within `target` blocks, or undefined when the server has none. */
  public async feeRate(target: number, signal?: AbortSignal): Promise<number | undefined> {
    const body = await this.json('/fee-estimates', signal);
    if (!isRecord(body)) return bad();
    const v = body[String(target)];
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined;
  }

  /** Broadcasts a raw transaction (hex). Returns the txid the server reports. */
  public async broadcast(rawHex: string): Promise<string> {
    if (!/^[0-9a-f]+$/.test(rawHex) || rawHex.length % 2 !== 0) throw new SilentPaymentError('INVALID_INPUT');
    const t = (await this.text('/tx', { method: 'POST', body: rawHex, headers: { 'content-type': 'text/plain' } })).trim().toLowerCase();
    return HEX64.test(t) ? t : bad();
  }

  /**
   * Checks the server is on the expected network by comparing block 0 with the known genesis hash.
   * A server that reports the Bitcoin mainnet genesis is always refused (mainnet is disabled).
   */
  public async checkNetwork(net: BtcNetworkInfo, signal?: AbortSignal): Promise<void> {
    const g = await this.blockHash(0, signal);
    if (g === MAINNET_GENESIS || g !== net.genesisHash) throw new SilentPaymentError('NETWORK_MISMATCH');
  }
}

interface Parsed {
  readonly blockHash: string;
  readonly tweaks: BlockTweaks['tweaks'];
  readonly outputs: readonly BlockOutput[];
}

/**
 * {@link TweakSource} built on plain Esplora data: tweaks are computed locally from each block's
 * transactions (BIP-352 `input_hash * A`), so any Esplora server works. Heavy (downloads whole
 * blocks) but the server only learns which block heights you read.
 *
 * Each block is checked before use: header hash equals the served block hash, proof of work meets
 * the network limit, recomputed txids produce the header Merkle root, recomputed wtxids match the
 * coinbase witness commitment (BIP-141), and consecutive heights link (height 1 links to the pinned
 * genesis). This source alone is NOT best-chain validation: it applies no retarget, chain work or fork
 * choice (the package's `HeaderChain` does, given a pinned checkpoint), and test-network proof of work is
 * cheap, so a dishonest server can still serve a low-work fork. Prevout scripts are not bound to any
 * header, and spent state (`isUnspent`) remains the server's word.
 */
export class EsploraTweakSource implements TweakSource {
  private readonly cache = new Map<number, Promise<Parsed>>();
  /** Recently verified height -> hash, for header linkage across this source's lifetime. */
  private readonly linked = new Map<number, string>();
  private readonly prevOf = new Map<number, string>();

  public constructor(private readonly client: EsploraClient, private readonly net: BtcNetworkInfo) {
    this.linked.set(0, net.genesisHash);
  }

  public getTipHeight(signal?: AbortSignal): Promise<number> {
    return this.client.tipHeight(signal);
  }

  private load(height: number, signal?: AbortSignal): Promise<Parsed> {
    let p = this.cache.get(height);
    if (p === undefined) {
      p = this.fetchBlock(height, signal);
      this.cache.set(height, p);
      p.catch(() => {
        this.cache.delete(height);
      });
      if (this.cache.size > 4) {
        const oldest = this.cache.keys().next().value;
        if (oldest !== undefined) this.cache.delete(oldest);
      }
    }
    return p;
  }

  private async fetchBlock(height: number, signal?: AbortSignal): Promise<Parsed> {
    const blockHash = await this.client.blockHash(height, signal);
    // Genesis is pinned by checkNetwork; its only transaction is an unspendable coinbase.
    if (height === 0) {
      if (blockHash !== this.net.genesisHash) throw new SilentPaymentError('NETWORK_MISMATCH');
      return { blockHash, tweaks: [], outputs: [] };
    }
    const [headerHex, txs] = await Promise.all([this.client.blockHeader(blockHash, signal), this.client.blockTxs(blockHash, signal)]);
    const header = verifyBlockData({ headerHex, expectedHash: blockHash, txids: txs.map((t) => t.txid), network: this.net.id });
    verifyWitnessCommitment(txs.map((t) => t.raw)); // binds witnesses (input public keys) via the coinbase wtxid commitment
    const below = this.linked.get(height - 1);
    const above = this.linked.get(height + 1);
    if ((below !== undefined && header.prevHash !== below) || (above !== undefined && this.prevOf.get(height + 1) !== blockHash)) {
      throw new SilentPaymentError('REORG_DETECTED');
    }
    this.linked.set(height, blockHash);
    this.prevOf.set(height, header.prevHash);
    while (this.linked.size > 64) {
      const oldest = [...this.linked.keys()].filter((h) => h !== 0).sort((a, b) => a - b)[0];
      if (oldest === undefined) break;
      this.linked.delete(oldest);
      this.prevOf.delete(oldest);
    }
    const tweaks: BlockTweaks['tweaks'][number][] = [];
    const outputs: BlockOutput[] = [];
    for (const tx of txs) {
      if (tx.inputs === null) continue; // coinbase
      let tweak;
      try {
        tweak = computeTransactionTweak(tx.inputs);
      } catch {
        continue; // malformed or ineligible: BIP-352 says skip
      }
      if (tweak === null) continue;
      tweaks.push(tweak.tweak);
      tx.outputs.forEach((o, vout) => {
        const s = o.scriptPubKey;
        if (s.length === 34 && s[0] === 0x51 && s[1] === 0x20) {
          outputs.push({ xOnlyPublicKey: s.slice(2), txid: tx.txid, vout, amountSats: o.valueSats });
        }
      });
    }
    return { blockHash, tweaks, outputs };
  }

  public async getTweaks(height: number, signal?: AbortSignal): Promise<BlockTweaks> {
    const p = await this.load(height, signal);
    return { height, blockHash: p.blockHash, tweaks: p.tweaks };
  }

  public async getOutputs(height: number, signal?: AbortSignal): Promise<BlockOutputs> {
    const p = await this.load(height, signal);
    return { height, blockHash: p.blockHash, outputs: p.outputs };
  }
}
