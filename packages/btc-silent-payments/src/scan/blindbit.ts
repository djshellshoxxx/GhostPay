import { fail } from '../errors.js';
import { parseHex, toHex } from '../ecc.js';
import { parseCompressedPoint, type CompressedPoint } from '../secret.js';
import type { BlockOutput, BlockOutputs, BlockTweaks, TweakSource } from './types.js';

/** Subset of the `fetch` Response used here. */
export interface FetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

/** Subset of `fetch`: only GET, no body, no headers are ever sent by {@link BlindBitClient}. */
export type FetchLike = (
  url: string,
  init: { readonly method: 'GET'; readonly signal?: AbortSignal },
) => Promise<FetchResponseLike>;

/** Options of {@link BlindBitClient}. */
export interface BlindBitClientOptions {
  /** Base URL of a BlindBit oracle the user chose (http or https), without credentials, query or fragment. */
  readonly baseUrl: string;
  /** Injected transport (global `fetch` in production, a recorder in tests). */
  readonly fetch: FetchLike;
}

/** `GET /info` payload (BlindBit-Oracle v2 `internal/server/README.md`, retrieved 2026-10-21). */
export interface BlindBitInfo {
  /** Network name reported by the oracle (the docs show `signet`; the full value set is undocumented). */
  readonly network: string;
  readonly height: number;
  readonly tweaksOnly: boolean;
  readonly tweaksFullBasic: boolean;
  readonly tweaksFullWithDustFilter: boolean;
  readonly tweaksCutThroughWithDustFilter: boolean;
}

const MAX_ENTRIES = 200_000;
const MAX_HEIGHT = 0xffffffff;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function uint(v: unknown): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) return fail('INVALID_RESPONSE');
  return v;
}

function hexString(v: unknown, bytes: number): string {
  if (typeof v !== 'string') return fail('INVALID_RESPONSE');
  try {
    return toHex(parseHex(v, bytes));
  } catch {
    return fail('INVALID_RESPONSE');
  }
}

function blockIdentifier(body: Record<string, unknown>, height: number): string {
  const id = body['block_identifier'];
  if (!isRecord(id)) return fail('INVALID_RESPONSE');
  if (uint(id['block_height']) !== height) return fail('REORG_DETECTED');
  return hexString(id['block_hash'], 32);
}

/**
 * HTTP client for a BlindBit oracle implementing {@link TweakSource}.
 *
 * @remarks VERIFIED against the BlindBit-Oracle v2 server README
 * (`internal/server/README.md`, retrieved 2026-10-21): `GET /info` (supported),
 * `GET /tweaks/:blockheight` and `GET /utxos/:blockheight` (both marked DEPRECATED in favour of
 * gRPC, which this client does not implement). The other deprecated routes (`/spent-outputs`,
 * `/compute-index`, `/full-block`) and the v1 `/filter` endpoints are NOT implemented
 * (see DEVIATIONS.md). Whether `/utxos`
 * lists spent outputs of the block is not documented; scanning only sees what the oracle returns.
 *
 * Privacy: every request is a bare `GET <base>/<info|tweaks|utxos>[/<height>]` without body,
 * headers or query. No key material can reach the transport because this class never receives any.
 * The oracle operator still learns which block heights you scan.
 *
 * @security Responses are untrusted; they are validated strictly and the client fails closed.
 */
export class BlindBitClient implements TweakSource {
  private readonly base: string;
  private readonly transport: FetchLike;

  public constructor(options: BlindBitClientOptions) {
    this.base = BlindBitClient.normalizeBase(options.baseUrl);
    this.transport = options.fetch;
  }

  private static normalizeBase(baseUrl: string): string {
    let url: URL;
    try {
      url = new URL(baseUrl);
    } catch {
      return fail('INVALID_INPUT');
    }
    const badProtocol = url.protocol !== 'http:' && url.protocol !== 'https:';
    if (badProtocol || url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') {
      return fail('INVALID_INPUT');
    }
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
  }

  private async get(path: string, signal?: AbortSignal): Promise<unknown> {
    let res: FetchResponseLike;
    try {
      res = await this.transport(
        `${this.base}${path}`,
        signal === undefined ? { method: 'GET' } : { method: 'GET', signal },
      );
    } catch {
      return signal?.aborted === true ? fail('ABORTED') : fail('TRANSPORT_FAILURE');
    }
    if (!res.ok) return fail('TRANSPORT_FAILURE');
    try {
      return await res.json();
    } catch {
      return fail('INVALID_RESPONSE');
    }
  }

  private static height(h: number): number {
    if (!Number.isInteger(h) || h < 0 || h > MAX_HEIGHT) return fail('INVALID_INPUT');
    return h;
  }

  public async getTipHeight(signal?: AbortSignal): Promise<number> {
    const body = await this.get('/info', signal);
    if (!isRecord(body)) return fail('INVALID_RESPONSE');
    return uint(body['height']);
  }

  /**
   * `GET /info`, the one HTTP route the v2 docs still mark as supported. Lets a caller check the
   * oracle's network and which tweak index it serves before scanning.
   *
   * @throws {SilentPaymentError} `INVALID_RESPONSE` for any missing or mistyped field.
   */
  public async getInfo(signal?: AbortSignal): Promise<BlindBitInfo> {
    const body = await this.get('/info', signal);
    if (!isRecord(body)) return fail('INVALID_RESPONSE');
    const flag = (k: string): boolean => {
      const v = body[k];
      return typeof v === 'boolean' ? v : fail('INVALID_RESPONSE');
    };
    const network = body['network'];
    if (typeof network !== 'string' || network.length === 0 || network.length > 32)
      return fail('INVALID_RESPONSE');
    return {
      network,
      height: uint(body['height']),
      tweaksOnly: flag('tweaks_only'),
      tweaksFullBasic: flag('tweaks_full_basic'),
      tweaksFullWithDustFilter: flag('tweaks_full_with_dust_filter'),
      tweaksCutThroughWithDustFilter: flag('tweaks_cut_through_with_dust_filter'),
    };
  }

  public async getTweaks(height: number, signal?: AbortSignal): Promise<BlockTweaks> {
    BlindBitClient.height(height);
    const body = await this.get(`/tweaks/${height}`, signal);
    if (!isRecord(body)) return fail('INVALID_RESPONSE');
    const blockHash = blockIdentifier(body, height);
    const index = body['index'];
    if (!Array.isArray(index) || index.length > MAX_ENTRIES) return fail('INVALID_RESPONSE');
    const tweaks: CompressedPoint[] = index.map((t: unknown) => {
      try {
        return parseCompressedPoint(parseHex(hexString(t, 33), 33));
      } catch {
        return fail('INVALID_RESPONSE');
      }
    });
    return { height, blockHash, tweaks };
  }

  public async getOutputs(height: number, signal?: AbortSignal): Promise<BlockOutputs> {
    BlindBitClient.height(height);
    const body = await this.get(`/utxos/${height}`, signal);
    if (!isRecord(body)) return fail('INVALID_RESPONSE');
    const blockHash = blockIdentifier(body, height);
    const index = body['index'];
    if (!Array.isArray(index) || index.length > MAX_ENTRIES) return fail('INVALID_RESPONSE');
    const outputs: BlockOutput[] = index.map((o: unknown) => {
      if (!isRecord(o)) return fail('INVALID_RESPONSE');
      return {
        xOnlyPublicKey: parseHex(hexString(o['pubkey'], 32), 32),
        txid: hexString(o['txid'], 32),
        vout: uint(o['vout']),
        amountSats: BigInt(uint(o['amount'])),
      };
    });
    return { height, blockHash, outputs };
  }
}
