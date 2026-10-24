import { fail } from './errors.js';
import { POW_LIMIT, checkProofOfWork, parseHeader, targetFromBits, type BlockHeader, type HeaderNetwork } from './header.js';

/**
 * Header-chain validation and best-chain (most-work) selection for a light client.
 *
 * What this checks, per header, mirroring Bitcoin Core `ContextualCheckBlockHeader` / `GetNextWorkRequired`:
 * linkage to the parent, proof of work against its own `nBits` and the network `powLimit`, `nBits` equal to the
 * value the difficulty rules require (2016-block retarget with the 4x clamp; the testnet min-difficulty exception;
 * BIP-94 first-block-of-period retarget and timewarp rule on testnet4; no retarget on regtest), timestamp above
 * the median of the previous 11 blocks, at most two hours in the future, and BIP-34/66/65 minimum versions.
 * Among competing branches it keeps the one with the most cumulative work.
 *
 * What it does NOT check: anything inside blocks (transactions, scripts, signet block signatures), checkpoints
 * or assumevalid beyond the caller's pinned starting header, and headers below that starting header. It is a
 * header-only (SPV-style) view: it shows which chain has the most proof of work among the headers it was given,
 * not that the chain is valid. A source that withholds a heavier chain is not detected; ask several sources.
 * On test networks proof of work is cheap, so an attacker can out-work an honest source there.
 */

export interface ChainParams {
  readonly network: HeaderNetwork;
  readonly powLimit: bigint;
  /** Compact form of `powLimit` (what min-difficulty blocks carry). */
  readonly powLimitBits: number;
  /** Blocks per difficulty period (2016). */
  readonly interval: number;
  /** Seconds per period (two weeks). */
  readonly targetTimespan: number;
  /** Seconds per block (600). */
  readonly targetSpacing: number;
  readonly allowMinDifficultyBlocks: boolean;
  readonly noRetargeting: boolean;
  /** BIP-94: retarget from the first block of the period and limit timewarp at period starts. */
  readonly enforceBip94: boolean;
  /** Heights from which nVersion must be >= 2, 3 and 4 (BIP-34, BIP-66, BIP-65). */
  readonly bip34Height: number;
  readonly bip66Height: number;
  readonly bip65Height: number;
}

/** BIP-94 `MAX_TIMEWARP`. */
const MAX_TIMEWARP = 600;
/** Core `MAX_FUTURE_BLOCK_TIME`. */
const MAX_FUTURE_BLOCK_TIME = 2 * 60 * 60;
const MEDIAN_TIME_SPAN = 11;
const MAX_BATCH = 100_000;
const MASK_256 = (1n << 256n) - 1n;

/** Smallest compact encoding of a target (arith_uint256::GetCompact for non-negative values). */
export function compactFromTarget(target: bigint): number {
  if (target < 0n || target > MASK_256) return fail('INVALID_INPUT');
  let size = 0;
  for (let t = target; t > 0n; t >>= 8n) size++;
  let compact = size <= 3 ? Number(target << BigInt(8 * (3 - size))) : Number(target >> BigInt(8 * (size - 3)));
  if ((compact & 0x00800000) !== 0) {
    compact >>>= 8;
    size++;
  }
  return ((compact | (size << 24)) >>> 0);
}

function params(network: HeaderNetwork, over: Partial<ChainParams>): ChainParams {
  const powLimit = POW_LIMIT[network];
  return Object.freeze({
    network,
    powLimit,
    powLimitBits: compactFromTarget(powLimit),
    interval: 2016,
    targetTimespan: 14 * 24 * 60 * 60,
    targetSpacing: 600,
    allowMinDifficultyBlocks: false,
    noRetargeting: false,
    enforceBip94: false,
    bip34Height: 1,
    bip66Height: 1,
    bip65Height: 1,
    ...over,
  });
}

/** Consensus parameters from Bitcoin Core `src/kernel/chainparams.cpp`. */
export const CHAIN_PARAMS: Readonly<Record<HeaderNetwork, ChainParams>> = Object.freeze({
  mainnet: params('mainnet', { bip34Height: 227931, bip66Height: 363725, bip65Height: 388381 }),
  testnet4: params('testnet4', { allowMinDifficultyBlocks: true, enforceBip94: true }),
  signet: params('signet', {}),
  regtest: params('regtest', { allowMinDifficultyBlocks: true, noRetargeting: true }),
});

/** Expected work of one block at `bits`: `2^256 / (target + 1)` (Core `GetBlockProof`). */
export function blockWork(bits: number): bigint {
  return (1n << 256n) / (targetFromBits(bits) + 1n);
}

/**
 * Core `CalculateNextWorkRequired`: retarget from the period's first and last block. Multiplication wraps at
 * 256 bits exactly like `arith_uint256` (never reached with real network parameters).
 */
export function calculateNextWorkRequired(
  p: { readonly lastBits: number; readonly lastTime: number; readonly firstTime: number; readonly firstBits: number },
  c: ChainParams,
): number {
  if (c.noRetargeting) return p.lastBits;
  let actual = p.lastTime - p.firstTime;
  if (actual < c.targetTimespan / 4) actual = Math.floor(c.targetTimespan / 4);
  if (actual > c.targetTimespan * 4) actual = c.targetTimespan * 4;
  let target = targetFromBits(c.enforceBip94 ? p.firstBits : p.lastBits);
  target = (target * BigInt(actual)) & MASK_256;
  target /= BigInt(c.targetTimespan);
  if (target > c.powLimit) target = c.powLimit;
  return compactFromTarget(target);
}

interface Entry {
  readonly height: number;
  readonly hex: string;
  readonly header: BlockHeader;
  /** Cumulative work from the checkpoint (inclusive). */
  readonly work: bigint;
}

/** A trusted starting point: its hash is pinned by the caller (app constant or own node). */
export interface HeaderCheckpoint {
  /** Must be a multiple of the difficulty interval (genesis = 0), so every retarget after it is computable. */
  readonly height: number;
  readonly hash: string;
  readonly headerHex: string;
  /**
   * Up to 10 headers immediately below the checkpoint (oldest first), authenticated by hash linkage to it.
   * They make the median-time-past rule exact right after the checkpoint; without them it is skipped until
   * 11 headers are known.
   */
  readonly previousHeaders?: readonly string[];
}

export interface ConnectResult {
  /** The batch is now (part of) the active chain. */
  readonly adopted: boolean;
  /** The active chain lost blocks above `forkHeight`. */
  readonly reorg: boolean;
  /** Height of the last header shared by the active chain and the batch. */
  readonly forkHeight: number;
  readonly tipHeight: number;
}

/** JSON form of a {@link HeaderChain}; re-validated in full by {@link HeaderChain.fromJSON}. */
export interface SerializedHeaderChain {
  readonly version: 1;
  readonly network: HeaderNetwork;
  readonly checkpoint: { readonly height: number; readonly hash: string; readonly headerHex: string; readonly previousHeaders: readonly string[] };
  /** Active-chain headers above the checkpoint, in height order. */
  readonly headers: readonly string[];
}

export interface HeaderChainOptions {
  readonly params: ChainParams;
  readonly checkpoint: HeaderCheckpoint;
  /** Current Unix time in seconds (default: system clock). */
  readonly now?: () => number;
}

const HEX64 = /^[0-9a-f]{64}$/;

function invalid(): never {
  return fail('INVALID_HEADER');
}

/** Best (most-work) header chain above a pinned checkpoint. */
export class HeaderChain {
  private readonly active: Entry[];
  private readonly byHash = new Map<string, number>();
  private readonly before: readonly BlockHeader[];

  private constructor(
    public readonly params: ChainParams,
    private readonly checkpoint: Required<HeaderCheckpoint>,
    private readonly now: () => number,
  ) {
    const header = parseHeader(checkpoint.headerHex);
    if (!HEX64.test(checkpoint.hash) || header.hash !== checkpoint.hash) invalid();
    if (!Number.isSafeInteger(checkpoint.height) || checkpoint.height < 0 || checkpoint.height % params.interval !== 0) invalid();
    const prev = checkpoint.previousHeaders.map((h) => parseHeader(h));
    if (prev.length > MEDIAN_TIME_SPAN - 1 || prev.length > checkpoint.height) invalid();
    let child = header;
    for (let i = prev.length - 1; i >= 0; i--) {
      const p = prev[i] as BlockHeader;
      if (child.prevHash !== p.hash) invalid();
      child = p;
    }
    this.before = prev;
    this.active = [{ height: checkpoint.height, hex: checkpoint.headerHex, header, work: blockWork(header.bits) }];
    this.byHash.set(header.hash, checkpoint.height);
  }

  /** Starts a chain at a pinned checkpoint. */
  public static create(o: HeaderChainOptions): HeaderChain {
    const cp = { ...o.checkpoint, hash: o.checkpoint.hash.toLowerCase(), previousHeaders: o.checkpoint.previousHeaders ?? [] };
    return new HeaderChain(o.params, cp, o.now ?? (() => Math.floor(Date.now() / 1000)));
  }

  /** Rebuilds a chain from {@link toJSON} output, re-validating every header. */
  public static fromJSON(j: SerializedHeaderChain, o: { readonly now?: () => number; readonly params?: ChainParams } = {}): HeaderChain {
    if (typeof j !== 'object' || j === null || j.version !== 1 || !Object.hasOwn(CHAIN_PARAMS, j.network) || !Array.isArray(j.headers)) {
      return fail('INVALID_INPUT');
    }
    const params = o.params ?? CHAIN_PARAMS[j.network];
    if (params.network !== j.network) return fail('INVALID_INPUT');
    const chain = HeaderChain.create({ params, checkpoint: j.checkpoint, ...(o.now === undefined ? {} : { now: o.now }) });
    if (j.headers.length > 0) {
      const r = chain.connect(j.headers);
      if (r.tipHeight !== j.checkpoint.height + j.headers.length) invalid();
    }
    return chain;
  }

  public toJSON(): SerializedHeaderChain {
    return {
      version: 1,
      network: this.params.network,
      checkpoint: { ...this.checkpoint },
      headers: this.active.slice(1).map((e) => e.hex),
    };
  }

  public get tipHeight(): number {
    return this.tip().height;
  }

  public get tipHash(): string {
    return this.tip().header.hash;
  }

  /** Cumulative work of the active chain counted from the checkpoint (inclusive). */
  public get tipWork(): bigint {
    return this.tip().work;
  }

  public get checkpointHeight(): number {
    return this.checkpoint.height;
  }

  /** True when the median-time-past rule can be applied to the very next header after the checkpoint. */
  public get mtpContextComplete(): boolean {
    return this.before.length >= Math.min(MEDIAN_TIME_SPAN - 1, this.checkpoint.height);
  }

  /** Active-chain hash at `height`, or `undefined` outside the known range. */
  public hashAt(height: number): string | undefined {
    return this.entry(height)?.header.hash;
  }

  public headerAt(height: number): BlockHeader | undefined {
    return this.entry(height)?.header;
  }

  /** `nBits` a header on top of the current tip with timestamp `time` must carry. */
  public nextBits(time: number): number {
    const ctx = (h: number): Entry | undefined => this.entry(h);
    return this.requiredBits(this.tip(), time, ctx);
  }

  /**
   * Validates a batch of consecutive headers whose first header's parent is in the active chain and adopts
   * it when the resulting chain has strictly more work than the current one. Leading headers already in the
   * active chain are skipped. The whole batch is validated before anything changes.
   *
   * @throws {SilentPaymentError} `INVALID_INPUT` (empty or oversized batch), `INVALID_RESPONSE` (malformed
   * header, proof of work), `INVALID_HEADER` (unknown parent, broken linkage, wrong nBits, timestamp rules,
   * version).
   */
  public connect(headersHex: readonly string[]): ConnectResult {
    if (!Array.isArray(headersHex) || headersHex.length === 0 || headersHex.length > MAX_BATCH) return fail('INVALID_INPUT');
    const headers = headersHex.map((h: string) => {
      const header = parseHeader(h);
      return { hex: h.toLowerCase(), header };
    });
    const first = headers[0] as { header: BlockHeader };
    const parentHeight = this.byHash.get(first.header.prevHash);
    if (parentHeight === undefined) return invalid();
    // Skip the prefix that is already active.
    let skip = 0;
    while (skip < headers.length && this.hashAt(parentHeight + 1 + skip) === (headers[skip] as { header: BlockHeader }).header.hash) skip++;
    const forkHeight = parentHeight + skip;
    if (skip === headers.length) return { adopted: false, reorg: false, forkHeight, tipHeight: this.tipHeight };

    const branch: Entry[] = [];
    const ctx = (h: number): Entry | undefined => (h > forkHeight ? branch[h - forkHeight - 1] : this.entry(h));
    let parent = this.entry(forkHeight) as Entry;
    for (let i = skip; i < headers.length; i++) {
      const { hex, header } = headers[i] as { hex: string; header: BlockHeader };
      this.validate(parent, header, ctx);
      const e: Entry = { height: parent.height + 1, hex, header, work: parent.work + blockWork(header.bits) };
      branch.push(e);
      parent = e;
    }
    if (parent.work <= this.tipWork) return { adopted: false, reorg: false, forkHeight, tipHeight: this.tipHeight };
    const reorg = forkHeight < this.tipHeight;
    for (const old of this.active.splice(forkHeight - this.checkpoint.height + 1)) this.byHash.delete(old.header.hash);
    for (const e of branch) {
      this.active.push(e);
      this.byHash.set(e.header.hash, e.height);
    }
    return { adopted: true, reorg, forkHeight, tipHeight: this.tipHeight };
  }

  private tip(): Entry {
    return this.active[this.active.length - 1] as Entry;
  }

  private entry(height: number): Entry | undefined {
    if (!Number.isInteger(height) || height < this.checkpoint.height) return undefined;
    return this.active[height - this.checkpoint.height];
  }

  /** Timestamps of up to 11 blocks ending at `last` (inclusive), or `undefined` when context is missing. */
  private medianTimePast(last: Entry, ctx: (h: number) => Entry | undefined): number | undefined {
    const times: number[] = [];
    for (let h = last.height; h >= 0 && times.length < MEDIAN_TIME_SPAN; h--) {
      const e = ctx(h);
      if (e !== undefined) {
        times.push(e.header.time);
        continue;
      }
      const idx = this.before.length - (this.checkpoint.height - h);
      const b = this.before[idx];
      if (b === undefined) return undefined;
      times.push(b.time);
    }
    times.sort((a, b) => a - b);
    return times[Math.floor(times.length / 2)];
  }

  private requiredBits(last: Entry, time: number, ctx: (h: number) => Entry | undefined): number {
    const c = this.params;
    const height = last.height + 1;
    if (height % c.interval !== 0) {
      if (c.allowMinDifficultyBlocks) {
        if (time > last.header.time + c.targetSpacing * 2) return c.powLimitBits;
        let e = last;
        while (e.height % c.interval !== 0 && e.header.bits === c.powLimitBits) {
          const prev = ctx(e.height - 1);
          if (prev === undefined) break;
          e = prev;
        }
        return e.header.bits;
      }
      return last.header.bits;
    }
    const firstEntry = ctx(last.height - (c.interval - 1));
    if (firstEntry === undefined) return invalid();
    return calculateNextWorkRequired(
      { lastBits: last.header.bits, lastTime: last.header.time, firstTime: firstEntry.header.time, firstBits: firstEntry.header.bits },
      c,
    );
  }

  private validate(parent: Entry, h: BlockHeader, ctx: (height: number) => Entry | undefined): void {
    const c = this.params;
    const height = parent.height + 1;
    if (h.prevHash !== parent.header.hash) invalid();
    checkProofOfWork(h, c.network);
    if (h.bits !== this.requiredBits(parent, h.time, ctx)) invalid();
    const mtp = this.medianTimePast(parent, ctx);
    if (mtp !== undefined && h.time <= mtp) invalid();
    if (h.time > this.now() + MAX_FUTURE_BLOCK_TIME) invalid();
    if (c.enforceBip94 && height % c.interval === 0 && h.time < parent.header.time - MAX_TIMEWARP) invalid();
    if ((h.version < 2 && height >= c.bip34Height) || (h.version < 3 && height >= c.bip66Height) || (h.version < 4 && height >= c.bip65Height)) {
      invalid();
    }
  }
}
