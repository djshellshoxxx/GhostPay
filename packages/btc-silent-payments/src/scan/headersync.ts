import { fail, SilentPaymentError, type SilentPaymentErrorCode } from '../errors.js';
import { parseHeader } from '../header.js';
import type { ConnectResult, HeaderChain } from '../headerchain.js';
import type { BlockOutputs, BlockTweaks, TweakSource } from './types.js';

/**
 * Where raw block headers come from (own node, Esplora, Electrum). Untrusted: everything it returns is
 * validated by {@link HeaderChain}.
 *
 * @security PRIVACY CONTRACT: receives only heights and counts, never keys or addresses.
 */
export interface HeaderSource {
  getTipHeight(signal?: AbortSignal): Promise<number>;
  /** `count` consecutive 80-byte headers as hex, starting at `fromHeight`. */
  getHeaders(fromHeight: number, count: number, signal?: AbortSignal): Promise<readonly string[]>;
}

export interface SyncOptions {
  /** Highest height to sync (default: the source's tip). */
  readonly toHeight?: number;
  /** Headers per request (default 2000). */
  readonly batchSize?: number;
  /** Largest number of headers one call downloads (default 50 000); call again to continue. */
  readonly maxHeaders?: number;
  readonly signal?: AbortSignal;
}

export interface SyncResult extends ConnectResult {
  /** Headers downloaded by this call (fork probes included). */
  readonly fetched: number;
}

function checkAbort(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) fail('ABORTED');
}

async function call<T>(f: () => Promise<T>): Promise<T> {
  try {
    return await f();
  } catch (e) {
    if (e instanceof SilentPaymentError) throw e;
    return fail('TRANSPORT_FAILURE');
  }
}

async function fetchHeaders(source: HeaderSource, from: number, count: number, signal?: AbortSignal): Promise<string[]> {
  checkAbort(signal);
  const r: unknown = await call(() => source.getHeaders(from, count, signal));
  if (!Array.isArray(r) || r.length !== count || !r.every((x) => typeof x === 'string')) return fail('INVALID_RESPONSE');
  return r;
}

/**
 * Brings `chain` up to date with one header source: finds the last header both share (probing back in
 * doubling steps, never below the checkpoint), downloads the source's headers above it and lets
 * {@link HeaderChain.connect} validate them and keep whichever chain has more work.
 *
 * @throws {SilentPaymentError} `INVALID_INPUT`, `ABORTED`, `TRANSPORT_FAILURE`, `INVALID_RESPONSE`,
 * `INVALID_HEADER` (also when the source disagrees with the pinned checkpoint).
 * @security The source learns which header ranges are requested, nothing else.
 */
export async function syncHeaderChain(chain: HeaderChain, source: HeaderSource, o: SyncOptions = {}): Promise<SyncResult> {
  const batch = o.batchSize ?? 2000;
  const max = o.maxHeaders ?? 50_000;
  if (!Number.isSafeInteger(batch) || batch < 1 || batch > 100_000 || !Number.isSafeInteger(max) || max < 1) return fail('INVALID_INPUT');
  checkAbort(o.signal);
  const cp = chain.checkpointHeight;
  const sourceTip = o.toHeight ?? (await call(() => source.getTipHeight(o.signal)));
  if (!Number.isSafeInteger(sourceTip) || sourceTip < cp || sourceTip > 0xffffffff) return fail('INVALID_RESPONSE');

  let fetched = 0;
  let h = Math.min(chain.tipHeight, sourceTip);
  let step = 1;
  for (;;) {
    const [hex] = await fetchHeaders(source, h, 1, o.signal);
    fetched++;
    if (parseHeader(hex as string).hash === chain.hashAt(h)) break;
    if (h === cp) return fail('INVALID_HEADER');
    h = Math.max(cp, h - step);
    step *= 2;
  }
  const last = Math.min(sourceTip, h + max);
  if (last <= h) return { adopted: false, reorg: false, forkHeight: h, tipHeight: chain.tipHeight, fetched };
  const all: string[] = [];
  for (let from = h + 1; from <= last; from += batch) {
    const n = Math.min(batch, last - from + 1);
    all.push(...(await fetchHeaders(source, from, n, o.signal)));
    fetched += n;
  }
  return { ...chain.connect(all), fetched };
}

export type SourceSyncResult = { readonly ok: true; readonly result: SyncResult } | { readonly ok: false; readonly code: SilentPaymentErrorCode };

/**
 * Syncs from several independent sources in turn. The chain ends on the most-work valid chain any of them
 * served; a failing source is reported, not fatal. A source that withholds a heavier chain cannot be
 * detected here, which is why more than one source helps.
 */
export async function syncHeaderChainFromSources(
  chain: HeaderChain,
  sources: readonly HeaderSource[],
  o: SyncOptions = {},
): Promise<SourceSyncResult[]> {
  const out: SourceSyncResult[] = [];
  for (const s of sources) {
    try {
      out.push({ ok: true, result: await syncHeaderChain(chain, s, o) });
    } catch (e) {
      if (!(e instanceof SilentPaymentError) || e.code === 'ABORTED') throw e;
      out.push({ ok: false, code: e.code });
    }
  }
  return out;
}

/**
 * Wraps a {@link TweakSource} so that only blocks on the verified best header chain are used: the tip is
 * capped at the verified height (minus `minConfirmations - 1`), and every block hash the inner source
 * reports must equal the verified hash at that height (else `REORG_DETECTED`).
 *
 * This binds blocks to the most-work header chain known to `chain`. It does not by itself prove the
 * block CONTENTS (tweaks, outputs) are right; combine with per-block Merkle/witness checks or a second source.
 */
export class HeaderAnchoredTweakSource implements TweakSource {
  private readonly minConf: number;

  public constructor(
    private readonly inner: TweakSource,
    private readonly chain: HeaderChain,
    o: { readonly minConfirmations?: number } = {},
  ) {
    this.minConf = o.minConfirmations ?? 1;
    if (!Number.isSafeInteger(this.minConf) || this.minConf < 1) fail('INVALID_INPUT');
  }

  public async getTipHeight(signal?: AbortSignal): Promise<number> {
    const t = await this.inner.getTipHeight(signal);
    return Math.min(t, this.chain.tipHeight - (this.minConf - 1));
  }

  private expect(height: number, blockHash: string): void {
    const want = this.chain.hashAt(height);
    if (want === undefined || height > this.chain.tipHeight - (this.minConf - 1)) fail('INVALID_INPUT');
    if (blockHash !== want) fail('REORG_DETECTED');
  }

  public async getTweaks(height: number, signal?: AbortSignal): Promise<BlockTweaks> {
    if (this.chain.hashAt(height) === undefined) return fail('INVALID_INPUT');
    const t = await this.inner.getTweaks(height, signal);
    this.expect(height, t.blockHash);
    return t;
  }

  public async getOutputs(height: number, signal?: AbortSignal): Promise<BlockOutputs> {
    if (this.chain.hashAt(height) === undefined) return fail('INVALID_INPUT');
    const r = await this.inner.getOutputs(height, signal);
    this.expect(height, r.blockHash);
    return r;
  }
}
