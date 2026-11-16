import { create, fromBinary, toBinary, type DescMessage, type MessageShape } from '@bufbuild/protobuf';
import { BinaryReader, WireType } from '@bufbuild/protobuf/wire';
import { fail, SilentPaymentError } from '../errors.js';
import { toHex } from '../ecc.js';
import { parseCompressedPoint } from '../secret.js';
import type { BlindBitInfo } from './blindbit.js';
import { grpcWebUnary, type GrpcWebFetch } from './grpcWebUnary.js';
import type { BlockOutputs, BlockTweaks, TweakSource } from './types.js';
import { BlockHashResponseSchema, BlockHeightRequestSchema, FullBlockResponseSchema, InfoResponseSchema, type FullBlockResponse } from './proto/indexing_server_pb.js';
export type { GrpcWebFetch } from './grpcWebUnary.js';

const MAX_HEIGHT = 0xffff_ffffn;
const MAX_SATS = 2_100_000_000_000_000n;
const NETWORKS = new Set(['mainnet', 'testnet', 'testnet4', 'signet', 'regtest']);
const SERVICE = '/blindbit.oracle.v1.OracleService/';

/** Options for a manually selected HTTPS gRPC-Web proxy, never a raw gRPC listener. */
export interface BlindBitGrpcOptions {
  readonly baseUrl: string;
  /** Exact expected oracle network; testnet and testnet4 are deliberately not aliases. */
  readonly network: string;
  readonly fetch: GrpcWebFetch;
  readonly timeoutMs?: number;
  readonly maxResponseBytes?: number;
  readonly maxEntries?: number;
}

interface WireField { readonly wire: WireType.Varint | WireType.LengthDelimited; readonly limit?: number; readonly numericMax?: bigint; readonly child?: WireShape; readonly repeated?: boolean }
interface WireShape { readonly fields: Readonly<Record<number, WireField>> }
const idShape: WireShape = { fields: { 1: { wire: 2, limit: 32 }, 2: { wire: 0, numericMax: MAX_HEIGHT } } };
const outputShape: WireShape = { fields: { 1: { wire: 0, numericMax: MAX_HEIGHT }, 2: { wire: 0, numericMax: MAX_SATS }, 3: { wire: 2, limit: 32 } } };
const txShape: WireShape = { fields: { 1: { wire: 2, limit: 32 }, 2: { wire: 2, limit: 33 }, 3: { wire: 2 }, 4: { wire: 2, child: outputShape, repeated: true } } };
const blockShape: WireShape = { fields: { 1: { wire: 2, child: idShape }, 2: { wire: 2, child: txShape, repeated: true } } };
const infoShape: WireShape = { fields: { 1: { wire: 2, limit: 32 }, 2: { wire: 0, numericMax: MAX_HEIGHT }, 3: { wire: 0, numericMax: 1n }, 4: { wire: 0, numericMax: 1n }, 5: { wire: 0, numericMax: 1n }, 6: { wire: 0, numericMax: 1n } } };
const hashShape: WireShape = { fields: { 1: { wire: 2, limit: 32 } } };

/** Count repeated records before the generated decoder allocates arrays; use the vetted protobuf wire reader. */
function preflight(bytes: Uint8Array, shape: WireShape, maxEntries: number, counts = new Map<WireShape, number>()): void {
  const reader = new BinaryReader(bytes); const seen = new Set<number>();
  while (reader.pos < reader.len) {
    const [number, wire] = reader.tag(); const field = shape.fields[number];
    if (field === undefined || field.wire !== wire || (seen.has(number) && field.repeated !== true)) return fail('INVALID_RESPONSE');
    seen.add(number);
    if (wire === WireType.Varint) {
      const value = BigInt(reader.uint64());
      if (field.numericMax !== undefined && value > field.numericMax) return fail('INVALID_RESPONSE');
    } else {
      const value = reader.bytes();
      if (field.limit !== undefined && value.length > field.limit) return fail('INVALID_RESPONSE');
      if (field.child !== undefined) {
        if (field.repeated === true) {
          const count = (counts.get(field.child) ?? 0) + 1;
          if (count > maxEntries) return fail('INVALID_RESPONSE');
          counts.set(field.child, count);
        }
        preflight(value, field.child, maxEntries, counts);
      }
    }
  }
}
function height(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > Number(MAX_HEIGHT)) return fail('INVALID_INPUT');
  return value;
}
function hash(bytes: Uint8Array): string {
  if (bytes.length !== 32) return fail('INVALID_RESPONSE');
  // Pinned upstream GRPC.md specifies little-endian hashes/txids; the wallet uses conventional display order.
  return toHex(bytes.slice().reverse());
}
function baseUrl(input: string): string {
  if (typeof input !== 'string' || input.length > 2048) return fail('INVALID_INPUT');
  let url: URL; try { url = new URL(input); } catch { return fail('INVALID_INPUT'); }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') return fail('INVALID_INPUT');
  let path = url.pathname; while (path.endsWith('/')) path = path.slice(0, -1);
  return `${url.origin}${path}`;
}

/**
 * Optional block-level source using only unary GetInfo/GetBlockHashByHeight/GetFullBlock RPCs.
 * No scan key, address or per-wallet outpoint enters this class. The proxy sees IP and block heights.
 * Full-block data supplies exact outputs; shortened keys are never promoted into amounts or spend evidence.
 * Oracle assertions remain untrusted: use existing local header/own-node checks before accepting funds.
 * It deliberately does not expose getSpends: FullBlock contains eligible transactions, not every block spend.
 */
export class BlindBitGrpcClient implements TweakSource {
  private readonly base: string;
  private readonly timeout: number;
  private readonly maxBytes: number;
  private readonly maxEntries: number;
  private readonly network: string;
  private readonly transport: GrpcWebFetch;
  private inFlight = 0;
  public constructor(options: BlindBitGrpcOptions) {
    this.base = baseUrl(options.baseUrl);
    if (!NETWORKS.has(options.network)) fail('INVALID_INPUT');
    this.network = options.network;
    this.transport = options.fetch;
    this.timeout = options.timeoutMs ?? 30_000;
    this.maxBytes = options.maxResponseBytes ?? 4 * 1024 * 1024;
    this.maxEntries = options.maxEntries ?? 200_000;
    if (!Number.isSafeInteger(this.timeout) || this.timeout < 1 || this.timeout > 60_000 ||
      !Number.isSafeInteger(this.maxBytes) || this.maxBytes < 64 || this.maxBytes > 32 * 1024 * 1024 ||
      !Number.isSafeInteger(this.maxEntries) || this.maxEntries < 1 || this.maxEntries > 200_000) fail('INVALID_INPUT');
  }
  private async call<D extends DescMessage>(method: string, request: Uint8Array, schema: D, shape: WireShape, signal?: AbortSignal): Promise<MessageShape<D>> {
    if (this.inFlight >= 2) return fail('TRANSPORT_FAILURE');
    this.inFlight++;
    try {
      const bytes = await grpcWebUnary({ url: `${this.base}${SERVICE}${method}`, payload: request, fetch: this.transport, maxBytes: this.maxBytes, timeoutMs: this.timeout, ...(signal === undefined ? {} : { signal }) });
      preflight(bytes, shape, this.maxEntries);
      return fromBinary(schema, bytes, { readUnknownFields: false, recursionLimit: 4 });
    } catch (error) {
      if (error instanceof SilentPaymentError) throw error;
      return fail('INVALID_RESPONSE');
    } finally { this.inFlight--; }
  }
  public async getInfo(signal?: AbortSignal): Promise<BlindBitInfo> {
    const info = await this.call('GetInfo', new Uint8Array(), InfoResponseSchema, infoShape, signal);
    if (info.network !== this.network) return fail('NETWORK_MISMATCH');
    return { network: info.network, height: Number(info.height), tweaksOnly: info.tweaksOnly, tweaksFullBasic: info.tweaksFullBasic, tweaksFullWithDustFilter: info.tweaksFullWithDustFilter, tweaksCutThroughWithDustFilter: info.tweaksCutThroughWithDustFilter };
  }
  public async getTipHeight(signal?: AbortSignal): Promise<number> { return (await this.getInfo(signal)).height; }
  private async fullBlock(at: number, signal?: AbortSignal): Promise<FullBlockResponse> {
    height(at);
    const info = await this.getInfo(signal);
    if (info.tweaksOnly || !info.tweaksFullBasic) return fail('UNSUPPORTED');
    if (info.height < at) return fail('INVALID_RESPONSE');
    const request = toBinary(BlockHeightRequestSchema, create(BlockHeightRequestSchema, { blockHeight: BigInt(at) }));
    const expected = hash((await this.call('GetBlockHashByHeight', request, BlockHashResponseSchema, hashShape, signal)).blockHash);
    const block = await this.call('GetFullBlock', request, FullBlockResponseSchema, blockShape, signal);
    const id = block.blockIdentifier;
    if (id === undefined) return fail('INVALID_RESPONSE');
    if (id.blockHeight !== BigInt(at) || hash(id.blockHash) !== expected) return fail('REORG_DETECTED');
    const transactions = new Set<string>(); let inputs = 0;
    for (const tx of block.index) {
      const txid = hash(tx.txid);
      if (transactions.has(txid) || tx.inputs.length % 36 !== 0) return fail('INVALID_RESPONSE');
      transactions.add(txid); inputs += tx.inputs.length / 36;
      if (inputs > this.maxEntries) return fail('INVALID_RESPONSE');
      try { parseCompressedPoint(tx.tweak); } catch { return fail('INVALID_RESPONSE'); }
      const outputs = new Set<number>();
      for (const output of tx.utxos) {
        if (outputs.has(output.vout) || output.amount > MAX_SATS || output.pubkey.length !== 32) return fail('INVALID_RESPONSE');
        outputs.add(output.vout);
        try { parseCompressedPoint(Uint8Array.of(2, ...output.pubkey)); } catch { return fail('INVALID_RESPONSE'); }
      }
    }
    return block;
  }
  public async getTweaks(at: number, signal?: AbortSignal): Promise<BlockTweaks> {
    const block = await this.fullBlock(at, signal);
    return { height: at, blockHash: hash(block.blockIdentifier!.blockHash), tweaks: block.index.map((tx) => parseCompressedPoint(tx.tweak)) };
  }
  public async getOutputs(at: number, signal?: AbortSignal): Promise<BlockOutputs> {
    const block = await this.fullBlock(at, signal);
    return { height: at, blockHash: hash(block.blockIdentifier!.blockHash), outputs: block.index.flatMap((tx) => tx.utxos.map((out) => ({ txid: hash(tx.txid), vout: out.vout, amountSats: out.amount, xOnlyPublicKey: out.pubkey }))) };
  }
}
