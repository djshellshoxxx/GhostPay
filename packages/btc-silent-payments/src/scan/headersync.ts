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
  /** Largest number of headers one call downloads when extending the chain (default 50 000); call again to continue. */
  readonly maxHeaders?: number;
  /**
   * Most active headers a competing branch may replace (above the exact fork point, default 10 080, at most
   * 100 000). A deeper fork fails with `FORK_TOO_DEEP` and changes nothing. A branch counts as lighter only after it
   * was compared up to the source tip.
   */
  readonly maxForkHeaders?: number;
  readonly signal?: AbortSignal;
}

export interface SyncResult extends ConnectResult {
  /** Headers downloaded by this call (fork probes included). */
  readonly fetched: number;
  /** Tip height the source claimed. */
  readonly sourceTip: number;
  /**
   * Highest header the source served that this call compared with the chain: the tip reached (extension), the probe
   * that agreed, or the lowest header of a competing branch. Whether it is still on the chain afterwards says
   * whether the source conflicts with what was finally adopted.
   */
  readonly served: { readonly height: number; readonly hash: string };
}

/** How one source relates to the chain finally adopted by {@link syncHeaderChainFromSources}. */
export interface SourceAgreement {
  /** Tip height the source claimed. */
  readonly tipHeight: number;
  /** Blocks the source's tip is below the adopted tip (0 when level or ahead). */
  readonly behindBy: number;
  /** `behindBy` exceeds `maxBehind`. */
  readonly behind: boolean;
  /** The source's chain did not have more work than the adopted one: a prefix of it, or a branch that lost. */
  readonly lighter: boolean;
  /** A header the source served is not on the adopted chain. */
  readonly conflicting: boolean;
}

/** `requireAgreement` failure: the chain holds the most-work tip, `results` say which sources disagree and how. */
export class SourceDisagreementError extends SilentPaymentError {
  public constructor(public readonly results: readonly SourceSyncResult[]) {
    super('REORG_DETECTED');
  }
}

/** Upper bound of `maxForkHeaders`. */
export const MAX_FORK_HEADERS = 100_000;
/** Default `maxForkHeaders`: five difficulty periods of active headers may be replaced by one call. */
export const DEFAULT_FORK_HEADERS = 10_080;

/** A sync that failed after adopting a valid prefix of a heavier branch; `adopted` says what changed. */
export class PartialAdoptError extends SilentPaymentError {
  public constructor(code: SilentPaymentErrorCode, public readonly adopted: ConnectResult) {
    super(code);
  }
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
 * doubling steps, never below the checkpoint, then a binary search), then either extends the tip chunk by chunk or
 * streams the competing branch into a {@link HeaderBranch} and adopts it once it has strictly more work.
 *
 * @throws {SilentPaymentError} `INVALID_INPUT`, `ABORTED`, `TRANSPORT_FAILURE`, `INVALID_RESPONSE`,
 * `INVALID_HEADER` (also when the source disagrees with the pinned checkpoint, or an extension chunk does not build
 * on the tip), `FORK_TOO_DEEP` (the branch would replace more than `maxForkHeaders`), `FORK_UNRESOLVED` (a branch
 * that did not overtake within `maxHeaders` past the tip while the source claims more).
 * @security The source learns which header ranges are requested, nothing else.
 */
export async function syncHeaderChain(chain: HeaderChain, source: HeaderSource, o: SyncOptions = {}): Promise<SyncResult> {
  const batch = o.batchSize ?? 2000;
  const max = o.maxHeaders ?? 50_000;
  const maxFork = o.maxForkHeaders ?? DEFAULT_FORK_HEADERS;
  if (!Number.isSafeInteger(batch) || batch < 1 || batch > 100_000 || !Number.isSafeInteger(max) || max < 1) return fail('INVALID_INPUT');
  if (!Number.isSafeInteger(maxFork) || maxFork < 1 || maxFork > MAX_FORK_HEADERS) return fail('INVALID_INPUT');
  checkAbort(o.signal);
  const cp = chain.checkpointHeight;
  const sourceTip = o.toHeight ?? (await call(() => source.getTipHeight(o.signal)));
  if (!Number.isSafeInteger(sourceTip) || sourceTip < cp || sourceTip > 0xffffffff) return fail('INVALID_RESPONSE');

  let fetched = 0;
  let h = Math.min(chain.tipHeight, sourceTip);
  let step = 1;
  let forked = false;
  let miss = h;
  let missHash = '';
  for (;;) {
    const [hex] = await fetchHeaders(source, h, 1, o.signal);
    fetched++;
    const hash = parseHeader(hex as string).hash;
    if (hash === chain.hashAt(h)) break;
    if (h === cp) return fail('INVALID_HEADER');
    forked = true;
    miss = h;
    missHash = hash;
    h = Math.max(cp, h - step);
    step *= 2;
  }
  if (forked) {
    // The doubling probe can land up to twice the fork depth low: narrow down to the last shared header, so the fork
    // budget below counts the real depth.
    while (miss - h > 1) {
      const mid = h + Math.floor((miss - h) / 2);
      const [hex] = await fetchHeaders(source, mid, 1, o.signal);
      fetched++;
      const hash = parseHeader(hex as string).hash;
      if (hash === chain.hashAt(mid)) h = mid;
      else {
        miss = mid;
        missHash = hash;
      }
    }
  }
  const served = { height: miss, hash: missHash };
  if (!forked) {
    // Extending the active chain: each chunk must build on the current tip (a chunk that branches off lower down is
    // refused, never connected as a silent reorg), and is validated and connected before the next is requested.
    const last = Math.min(sourceTip, h + max);
    let adopted = false;
    for (let from = h + 1; from <= last; from += batch) {
      const n = Math.min(batch, last - from + 1);
      const chunk = await fetchHeaders(source, from, n, o.signal);
      fetched += n;
      if (parseHeader(chunk[0] as string).prevHash !== chain.tipHash) return fail('INVALID_HEADER');
      const before = chain.tipHeight;
      const r = chain.connect(chunk);
      // Belt and braces: a chunk on the tip has more work and no active prefix, so connect() always adopts it whole.
      if (!r.adopted || r.reorg || r.tipHeight !== before + n) return fail('INVALID_HEADER');
      adopted = true;
    }
    const top = adopted ? chain.tipHeight : h;
    return { adopted, reorg: false, forkHeight: h, tipHeight: chain.tipHeight, fetched, sourceTip, served: { height: top, hash: chain.hashAt(top) as string } };
  }
  // A competing branch. What must be compared is the active chain above the fork point; more than `maxFork` of it is
  // not evaluated (`FORK_TOO_DEEP`). The branch is streamed chunk by chunk into a compact validation context and
  // adopted as soon as its cumulative work is strictly greater; later calls extend it normally. At the first invalid
  // header the valid prefix is still adopted if it already has more work, then the error is reported. A branch that
  // has not overtaken `max` headers past the active tip, while the source claims more, is not evaluated in this call
  // (`FORK_UNRESOLVED`).
  if (chain.tipHeight - h > maxFork) return fail('FORK_TOO_DEEP');
  const branch = chain.branchAt(h);
  const last = Math.min(sourceTip, chain.tipHeight + max);
  for (let from = h + 1; from <= last; ) {
    const n = Math.min(batch, last - from + 1);
    const chunk = await fetchHeaders(source, from, n, o.signal);
    try {
      branch.add(chunk);
    } catch (e) {
      if (branch.length > 0 && branch.beatsActive && e instanceof SilentPaymentError) throw new PartialAdoptError(e.code, branch.adopt());
      throw e;
    }
    fetched += n;
    from += n;
    if (branch.beatsActive) return { ...branch.adopt(), fetched, sourceTip, served };
  }
  if (last < sourceTip) return fail('FORK_UNRESOLVED');
  return { adopted: false, reorg: false, forkHeight: branch.forkHeight, tipHeight: chain.tipHeight, fetched, sourceTip, served };
}

export type SourceSyncResult =
  | { readonly ok: true; readonly result: SyncResult; readonly agreement: SourceAgreement }
  | {
      readonly ok: false;
      readonly code: SilentPaymentErrorCode;
      /** What was adopted before the failure (a valid prefix of a heavier branch), if anything. */
      readonly adopted?: ConnectResult;
    };

export interface MultiSourceSyncOptions extends SyncOptions {
  /** Blocks a source's tip may lag the adopted tip before it counts as `behind` (default {@link DEFAULT_MAX_BEHIND}). */
  readonly maxBehind?: number;
  /**
   * `true`: a source that is `behind` or `conflicting` makes the call fail closed with {@link SourceDisagreementError}
   * after every source was synced (the chain keeps the most-work tip). Default `false`: it is only reported.
   */
  readonly requireAgreement?: boolean;
}

/** Default `maxBehind`: a source one hour of blocks behind is reported as lagging. */
export const DEFAULT_MAX_BEHIND = 6;

/** True when any successfully synced source is `behind` or `conflicting` (never with a single source). */
export function sourcesDisagree(results: readonly SourceSyncResult[]): boolean {
  return results.some((r) => r.ok && (r.agreement.behind || r.agreement.conflicting));
}

/**
 * Syncs from several independent sources in turn. The chain ends on the most-work valid chain any of them
 * served; a failing source is reported, not fatal. Each successful source also gets a {@link SourceAgreement}
 * against the finally adopted chain: how far its tip lags, whether its chain was lighter and whether a header it
 * served is off the adopted chain.
 *
 * Withholding cannot be proven, only disagreement: a source that serves a lighter or conflicting chain may be
 * lagging, partitioned or lying, and this call cannot tell which. A single source cannot be checked at all (its
 * chain is by definition the adopted one), which is why more than one independent source helps. A source that is
 * ahead of what `maxHeaders` allowed this call to adopt is not `behind`.
 *
 * @throws {SilentPaymentError} `INVALID_INPUT` (bad `maxBehind`), `ABORTED`; {@link SourceDisagreementError} with
 * `requireAgreement`.
 */
export async function syncHeaderChainFromSources(
  chain: HeaderChain,
  sources: readonly HeaderSource[],
  o: MultiSourceSyncOptions = {},
): Promise<SourceSyncResult[]> {
  const maxBehind = o.maxBehind ?? DEFAULT_MAX_BEHIND;
  if (!Number.isSafeInteger(maxBehind) || maxBehind < 0) return fail('INVALID_INPUT');
  const synced: (SyncResult | Exclude<SourceSyncResult, { ok: true }>)[] = [];
  for (const s of sources) {
    try {
      synced.push(await syncHeaderChain(chain, s, o));
    } catch (e) {
      if (!(e instanceof SilentPaymentError) || e.code === 'ABORTED') throw e;
      synced.push({ ok: false, code: e.code, ...(e instanceof PartialAdoptError ? { adopted: e.adopted } : {}) });
    }
  }
  const out: SourceSyncResult[] = synced.map((r) => {
    if ('ok' in r) return r;
    const conflicting = chain.hashAt(r.served.height) !== r.served.hash;
    const behindBy = Math.max(0, chain.tipHeight - r.sourceTip);
    return { ok: true, result: r, agreement: { tipHeight: r.sourceTip, behindBy, behind: behindBy > maxBehind, lighter: conflicting || behindBy > 0, conflicting } };
  });
  if (o.requireAgreement === true && sourcesDisagree(out)) throw new SourceDisagreementError(out);
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
