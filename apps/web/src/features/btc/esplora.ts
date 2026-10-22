import {
  computeTransactionTweak,
  SilentPaymentError,
  txInputFromHex,
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
const MAX_TEXT = 16 * 1024 * 1024;
const MAX_PAGES = 400; // 10_000 transactions; bigger blocks are refused rather than silently truncated
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
}

function hexToBytes(h: string): Uint8Array {
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(h.slice(2 * i, 2 * i + 2), 16);
  return out;
}

function parseTx(v: unknown): EsploraTx {
  if (!isRecord(v)) return bad();
  const txid = hexStr(v['txid'], 64);
  if (!HEX64.test(txid)) return bad();
  const vin = v['vin'];
  const vout = v['vout'];
  if (!Array.isArray(vin) || !Array.isArray(vout) || vin.length > 100_000 || vout.length > 100_000) return bad();
  const outputs = vout.map((o: unknown) => {
    if (!isRecord(o)) return bad();
    return { scriptPubKey: hexToBytes(hexStr(o['scriptpubkey'])), valueSats: BigInt(uint(o['value'])) };
  });
  return { txid, inputs: parseInputs(vin), outputs };
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

export interface EsploraClientOptions {
  readonly baseUrl: string;
  readonly fetchFn: EsploraFetch;
}

/**
 * Minimal client for the Esplora REST API (the Blockstream/mempool.space style used by many servers).
 * Endpoints: `GET /blocks/tip/height`, `GET /block-height/:h`, `GET /block/:hash/txs/:start`,
 * `GET /tx/:txid/outspend/:vout`, `GET /fee-estimates`, `POST /tx`.
 *
 * @security Responses are untrusted and validated. Only block heights, outpoints and the raw
 * transaction you broadcast are sent; no key material ever reaches this class.
 */
export class EsploraClient {
  public readonly baseUrl: string;
  private readonly fetchFn: EsploraFetch;

  public constructor(options: EsploraClientOptions) {
    this.baseUrl = normalizeEsploraUrl(options.baseUrl);
    this.fetchFn = options.fetchFn;
  }

  private async text(path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<string> {
    let res: Response;
    try {
      res = await this.fetchFn(`${this.baseUrl}${path}`, {
        ...init,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        ...(signal === undefined ? {} : { signal }),
      });
    } catch {
      throw new SilentPaymentError(signal?.aborted === true ? 'ABORTED' : 'TRANSPORT_FAILURE');
    }
    if (!res.ok) throw new SilentPaymentError('TRANSPORT_FAILURE');
    const body = await res.text();
    if (body.length > MAX_TEXT) return bad();
    return body;
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

  /** All transactions of a block, in block order. */
  public async blockTxs(hash: string, signal?: AbortSignal): Promise<readonly EsploraTx[]> {
    if (!HEX64.test(hash)) throw new SilentPaymentError('INVALID_INPUT');
    const txs: EsploraTx[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const body = await this.json(`/block/${hash}/txs/${String(page * PAGE)}`, signal);
      if (!Array.isArray(body) || body.length > PAGE) return bad();
      for (const t of body) txs.push(parseTx(t));
      if (body.length < PAGE) return txs;
    }
    return bad();
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
 */
export class EsploraTweakSource implements TweakSource {
  private readonly cache = new Map<number, Promise<Parsed>>();

  public constructor(private readonly client: EsploraClient) {}

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
    const txs = await this.client.blockTxs(blockHash, signal);
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
