import { SilentPaymentError, type BlockOutputs, type BlockSpends, type BlockTweaks, type TweakSource } from '@ghostpay/btc-silent-payments';
import { bytesToHex } from '@noble/hashes/utils.js';
import { normalizeEsploraUrl } from './esplora';

export interface BtcOracleEndpoint { readonly kind: 'http' | 'grpc'; readonly url: string }
export interface BtcOracleConfig extends BtcOracleEndpoint {
  readonly mode?: 'full' | 'light';
  readonly second?: BtcOracleEndpoint;
}
export interface BtcOracleBlock { readonly tweaks: BlockTweaks; readonly outputs: BlockOutputs }
/** More than the maximum taproot outputs or transactions that fit a four-million-weight block. */
export const MAX_ORACLE_ENTRIES = 25_000;
export type ReadOracleBlock = (height: number, signal?: AbortSignal) => Promise<BtcOracleBlock>;

export function normalizeOracleConfig(config: BtcOracleConfig, esploraUrl: string): BtcOracleConfig {
  if (config === null || typeof config !== 'object' || !['http', 'grpc'].includes(config.kind) || typeof config.url !== 'string' || config.url.length > 2048)
    throw new SilentPaymentError('INVALID_INPUT');
  const url = normalizeEsploraUrl(config.url);
  if ((config.kind === 'grpc' && new URL(url).protocol !== 'https:') || new URL(url).origin === new URL(normalizeEsploraUrl(esploraUrl)).origin ||
      (config.mode !== undefined && config.mode !== 'full' && config.mode !== 'light'))
    throw new SilentPaymentError('INVALID_INPUT');
  if (config.second !== undefined && (config.second === null || typeof config.second !== 'object')) throw new SilentPaymentError('INVALID_INPUT');
  const second = config.second === undefined ? undefined : normalizeOracleConfig({ kind: config.second.kind, url: config.second.url }, esploraUrl);
  if (second !== undefined && new URL(second.url).origin === new URL(url).origin) throw new SilentPaymentError('INVALID_INPUT');
  return { kind: config.kind, url, ...(config.mode === undefined ? {} : { mode: config.mode }), ...(second === undefined ? {} : { second }) };
}

/** Cache only public block data; validate all message fields before the scanner consumes a light source. */
export class OracleTweakSource implements TweakSource {
  private readonly cache = new Map<number, Promise<BtcOracleBlock>>();
  public constructor(private readonly read: ReadOracleBlock, private readonly tip: () => Promise<number>) {}
  public getTipHeight(): Promise<number> { return this.tip(); }
  private load(height: number, signal?: AbortSignal): Promise<BtcOracleBlock> {
    let p = this.cache.get(height);
    if (p === undefined) {
      p = this.read(height, signal).then((block) => { validateOracleBlock(block, height); return block; });
      this.cache.set(height, p); void p.catch(() => { this.cache.delete(height); });
      if (this.cache.size > 4) this.cache.delete(this.cache.keys().next().value!);
    }
    return p;
  }
  public async getTweaks(height: number, signal?: AbortSignal): Promise<BlockTweaks> { return (await this.load(height, signal)).tweaks; }
  public async getOutputs(height: number, signal?: AbortSignal): Promise<BlockOutputs> { return (await this.load(height, signal)).outputs; }
}

function same(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort(); const right = [...b].sort();
  return left.every((value, i) => value === right[i]);
}
function outputKey(o: BlockOutputs['outputs'][number]): string {
  if (o === null || typeof o !== 'object' || !(o.xOnlyPublicKey instanceof Uint8Array) || o.xOnlyPublicKey.length !== 32 ||
      typeof o.txid !== 'string' || !/^[0-9a-f]{64}$/.test(o.txid) || !Number.isInteger(o.vout) || o.vout! < 0 || o.vout! > 0xffff_ffff ||
      typeof o.amountSats !== 'bigint' || o.amountSats < 0n || o.amountSats > 2_100_000_000_000_000n) throw new SilentPaymentError('INVALID_RESPONSE');
  return `${bytesToHex(o.xOnlyPublicKey)}|${o.txid}|${String(o.vout)}|${String(o.amountSats)}`;
}
function tweakKey(t: Uint8Array): string {
  if (!(t instanceof Uint8Array) || t.length !== 33) throw new SilentPaymentError('INVALID_RESPONSE');
  return bytesToHex(t);
}
export function validateOracleBlock(block: BtcOracleBlock, height: number): void {
  if (block === null || typeof block !== 'object' || block.tweaks === null || typeof block.tweaks !== 'object' || block.outputs === null || typeof block.outputs !== 'object' ||
      !Array.isArray(block.tweaks.tweaks) || !Array.isArray(block.outputs.outputs) || block.tweaks.tweaks.length > MAX_ORACLE_ENTRIES || block.outputs.outputs.length > MAX_ORACLE_ENTRIES)
    throw new SilentPaymentError('INVALID_RESPONSE');
  if (block.tweaks.height !== height || block.outputs.height !== height || typeof block.tweaks.blockHash !== 'string' || !/^[0-9a-f]{64}$/.test(block.tweaks.blockHash) || block.outputs.blockHash !== block.tweaks.blockHash)
    throw new SilentPaymentError('REORG_DETECTED');
  block.tweaks.tweaks.forEach(tweakKey); block.outputs.outputs.forEach(outputKey);
}

/**
 * Retains the full-block source as payment authority. Every block's complete tweak/output multisets must also
 * agree with the selected oracle, including blocks with no wallet match. No wallet-derived value enters readOracle.
 * This deliberately retains full-block bandwidth and proof checks; it is not a lightweight SPV implementation.
 */
export class CrossCheckedTweakSource implements TweakSource {
  private readonly cache = new Map<number, Promise<BtcOracleBlock>>();
  /**
   * Present only when the local source lists block spends (the oracle serves tweaks and outputs only). The list is
   * bound to the cross-checked block: its hash must equal the hash both sources agreed on for that height.
   */
  public readonly getSpends?: (height: number, signal?: AbortSignal) => Promise<BlockSpends>;
  public constructor(private readonly local: TweakSource, private readonly readOracle: ReadOracleBlock) {
    const spends = local.getSpends?.bind(local);
    if (spends !== undefined) {
      this.getSpends = async (height: number, signal?: AbortSignal): Promise<BlockSpends> => {
        const [checked, list] = await Promise.all([this.load(height, signal), spends(height, signal)]);
        if (list.height !== height || list.blockHash !== checked.tweaks.blockHash) throw new SilentPaymentError('REORG_DETECTED');
        return list;
      };
    }
  }
  public getTipHeight(signal?: AbortSignal): Promise<number> { return this.local.getTipHeight(signal); }
  private load(height: number, signal?: AbortSignal): Promise<BtcOracleBlock> {
    let pending = this.cache.get(height);
    if (pending === undefined) {
      pending = this.check(height, signal); this.cache.set(height, pending);
      void pending.catch(() => { this.cache.delete(height); });
      if (this.cache.size > 4) this.cache.delete(this.cache.keys().next().value!);
    }
    return pending;
  }
  private async check(height: number, signal?: AbortSignal): Promise<BtcOracleBlock> {
    const [tweaks, outputs, oracle] = await Promise.all([this.local.getTweaks(height, signal), this.local.getOutputs(height, signal), this.readOracle(height, signal)]);
    if (signal?.aborted === true) throw new SilentPaymentError('ABORTED');
    if (oracle === null || typeof oracle !== 'object' || oracle.tweaks === null || oracle.outputs === null ||
        typeof oracle.tweaks !== 'object' || typeof oracle.outputs !== 'object') throw new SilentPaymentError('INVALID_RESPONSE');
    if (tweaks.height !== height || outputs.height !== height || tweaks.blockHash !== outputs.blockHash ||
        oracle.tweaks.height !== height || oracle.outputs.height !== height || oracle.tweaks.blockHash !== tweaks.blockHash || oracle.outputs.blockHash !== tweaks.blockHash)
      throw new SilentPaymentError('REORG_DETECTED');
    if (!Array.isArray(oracle.tweaks.tweaks) || !Array.isArray(oracle.outputs.outputs) || oracle.tweaks.tweaks.length > MAX_ORACLE_ENTRIES || oracle.outputs.outputs.length > MAX_ORACLE_ENTRIES ||
        !same(tweaks.tweaks.map(tweakKey), oracle.tweaks.tweaks.map(tweakKey)) || !same(outputs.outputs.map(outputKey), oracle.outputs.outputs.map(outputKey)))
      throw new SilentPaymentError('INVALID_RESPONSE');
    return { tweaks, outputs };
  }
  public async getTweaks(height: number, signal?: AbortSignal): Promise<BlockTweaks> { return (await this.load(height, signal)).tweaks; }
  public async getOutputs(height: number, signal?: AbortSignal): Promise<BlockOutputs> { return (await this.load(height, signal)).outputs; }
}
