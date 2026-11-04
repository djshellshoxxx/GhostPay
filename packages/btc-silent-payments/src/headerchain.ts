import { fail } from './errors.js';
import { POW_LIMIT, checkProofOfWork, parseHeader, parseHeaderRaw, targetFromBits, type BlockHeader, type HeaderNetwork } from './header.js';
import { fromHex, toHex } from './hexbytes.js';

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
 * header-only view, not SPV and not full validation: it shows which chain has the most proof of work among the
 * headers it was given, not that the chain is valid. A source that withholds a heavier chain is not detected; ask several sources.
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

/** What validation reads of a header in context. */
export interface HeaderNode {
  readonly height: number;
  readonly time: number;
  readonly bits: number;
}

const HEADER_BYTES = 80;
const HASH_BYTES = 32;

function u32At(b: Uint8Array, o: number): number {
  return ((b[o] as number) | ((b[o + 1] as number) << 8) | ((b[o + 2] as number) << 16) | ((b[o + 3] as number) << 24)) >>> 0;
}

/**
 * Consecutive headers stored compactly: 80 raw bytes and 32 display-order hash bytes each, in two growable byte
 * arrays (about 112 bytes per header instead of parsed objects and hex strings).
 */
/** @internal */
export class HeaderRun {
  private raw = new Uint8Array(HEADER_BYTES * 64);
  private hashes = new Uint8Array(HASH_BYTES * 64);
  public length = 0;

  public push(raw: Uint8Array, hash: Uint8Array): void {
    if ((this.length + 1) * HEADER_BYTES > this.raw.length) {
      const cap = this.raw.length * 2;
      const r = new Uint8Array(cap);
      r.set(this.raw);
      this.raw = r;
      const h = new Uint8Array((cap / HEADER_BYTES) * HASH_BYTES);
      h.set(this.hashes);
      this.hashes = h;
    }
    this.raw.set(raw, this.length * HEADER_BYTES);
    this.hashes.set(hash, this.length * HASH_BYTES);
    this.length++;
  }

  public truncate(n: number): void {
    this.length = n;
  }

  public time(i: number): number {
    return u32At(this.raw, i * HEADER_BYTES + 68);
  }

  public bits(i: number): number {
    return u32At(this.raw, i * HEADER_BYTES + 72);
  }

  public hashHex(i: number): string {
    return toHex(this.hashes.subarray(i * HASH_BYTES, (i + 1) * HASH_BYTES));
  }

  public hashEquals(i: number, hash: Uint8Array): boolean {
    const o = i * HASH_BYTES;
    for (let k = 0; k < HASH_BYTES; k++) if (this.hashes[o + k] !== hash[k]) return false;
    return true;
  }

  public rawAt(i: number): Uint8Array {
    return this.raw.subarray(i * HEADER_BYTES, (i + 1) * HEADER_BYTES);
  }

  public hashBytesAt(i: number): Uint8Array {
    return this.hashes.subarray(i * HASH_BYTES, (i + 1) * HASH_BYTES);
  }

  /** Hex of headers `from..to-1`, as one flat string (via an ASCII buffer). */
  public hexRange(from: number, to: number): string {
    const src = this.raw.subarray(from * HEADER_BYTES, to * HEADER_BYTES);
    const out = new Uint8Array(src.length * 2);
    for (let i = 0; i < src.length; i++) {
      const b = src[i] as number;
      out[2 * i] = HEX_ASCII[b >>> 4] as number;
      out[2 * i + 1] = HEX_ASCII[b & 15] as number;
    }
    return new TextDecoder().decode(out);
  }
}

const HEX_ASCII = Uint8Array.from('0123456789abcdef', (c) => c.charCodeAt(0));

/** Cumulative work is remembered every this many headers; values in between are summed from the bits. */
const WORK_STRIDE = 2016;
const workCache = new Map<number, bigint>();
function cachedBlockWork(bits: number): bigint {
  let w = workCache.get(bits);
  if (w === undefined) {
    w = blockWork(bits);
    if (workCache.size > 4096) workCache.clear();
    workCache.set(bits, w);
  }
  return w;
}

/**
 * A competing (or extending) branch being validated header by header on top of a block of the active chain. It
 * keeps its headers compactly and its running cumulative work, so a long branch can be streamed in chunks and
 * adopted as soon as it has strictly more work than the active chain. Any invalid header kills the branch.
 */
export class HeaderBranch {
  private readonly run = new HeaderRun();
  private workValue: bigint;
  private dead = false;
  private lastHash: string;

  /** @internal */
  public constructor(
    private readonly chain: HeaderChain,
    private fork: number,
    private readonly epoch: number,
  ) {
    this.workValue = chain.workAt(fork);
    this.lastHash = chain.hashAt(fork) as string;
  }

  /** Height of the last header shared with the active chain. */
  public get forkHeight(): number {
    return this.fork;
  }

  public get tipHeight(): number {
    return this.fork + this.run.length;
  }

  /** Headers of this branch above the fork point. */
  public get length(): number {
    return this.run.length;
  }

  public get work(): bigint {
    return this.workValue;
  }

  /** The branch has strictly more cumulative work than the active chain. */
  public get beatsActive(): boolean {
    return this.workValue > this.chain.tipWork;
  }

  /**
   * Validates and appends consecutive headers. Leading headers that are already active (while the branch is still
   * empty) move the fork point up instead.
   *
   * @throws {SilentPaymentError} `INVALID_INPUT` (empty, oversized, or the branch is dead or stale),
   * `INVALID_RESPONSE` (malformed header, proof of work), `INVALID_HEADER` (linkage and header-chain rules).
   */
  public add(headersHex: readonly string[]): void {
    if (this.dead || this.epoch !== this.chain.epochValue) return fail('INVALID_INPUT');
    if (!Array.isArray(headersHex) || headersHex.length === 0 || headersHex.length > MAX_BATCH) return fail('INVALID_INPUT');
    try {
      for (const hex of headersHex as readonly string[]) {
        const p = parseHeaderRaw(hex);
        if (this.run.length === 0 && this.fork < this.chain.tipHeight && this.chain.hashAt(this.fork + 1) === p.header.hash) {
          this.fork++;
          this.workValue += cachedBlockWork(p.header.bits);
          this.lastHash = p.header.hash;
          continue;
        }
        this.chain.validateOn(this, this.tipHeight, this.lastHash, p.header);
        this.run.push(p.raw, p.hash);
        this.workValue += cachedBlockWork(p.header.bits);
        this.lastHash = p.header.hash;
      }
    } catch (e) {
      this.dead = true;
      throw e;
    }
  }

  /** @internal Context lookup: branch headers above the fork point, active ones at or below it. */
  public node(height: number): HeaderNode | undefined {
    if (height > this.fork) {
      const i = height - this.fork - 1;
      return i < this.run.length ? { height, time: this.run.time(i), bits: this.run.bits(i) } : undefined;
    }
    return this.chain.nodeAt(height);
  }

  /** Makes this branch the active chain above its fork point. Only when it has strictly more work. */
  public adopt(): ConnectResult {
    if (this.dead || this.epoch !== this.chain.epochValue || this.run.length === 0 || !this.beatsActive) return fail('INVALID_INPUT');
    this.dead = true;
    return this.chain.replaceAbove(this.fork, this.run);
  }
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

const lowerHex = (v: unknown): string | undefined => (typeof v === 'string' ? v.toLowerCase() : undefined);

/** Exact equality of a stored checkpoint (untrusted shape) with the pinned one. */
function sameCheckpoint(stored: unknown, pinned: HeaderCheckpoint): boolean {
  if (typeof stored !== 'object' || stored === null) return false;
  const s = stored as Partial<Record<keyof HeaderCheckpoint, unknown>>;
  const prev: unknown = s.previousHeaders ?? [];
  const want = pinned.previousHeaders ?? [];
  return (
    s.height === pinned.height &&
    lowerHex(s.hash) === pinned.hash.toLowerCase() &&
    lowerHex(s.headerHex) === pinned.headerHex.toLowerCase() &&
    Array.isArray(prev) &&
    prev.length === want.length &&
    prev.every((h: unknown, i) => lowerHex(h) === want[i]?.toLowerCase())
  );
}

/** Best (most-work) header chain above a pinned checkpoint. */
export class HeaderChain {
  /** Active headers; index 0 is the checkpoint. */
  private readonly active = new HeaderRun();
  /** Cumulative work at active index `k * WORK_STRIDE` (inclusive). */
  private readonly strideWork: bigint[] = [];
  private tipWorkValue: bigint;
  private readonly before: readonly BlockHeader[];
  /** Bumped whenever the active chain changes, so a branch started earlier cannot be adopted. */
  private epoch = 0;

  private constructor(
    public readonly params: ChainParams,
    private readonly checkpoint: Required<HeaderCheckpoint>,
    private readonly now: () => number,
  ) {
    const p = parseHeaderRaw(checkpoint.headerHex);
    const header = p.header;
    if (!HEX64.test(checkpoint.hash) || header.hash !== checkpoint.hash) invalid();
    if (!Number.isSafeInteger(checkpoint.height) || checkpoint.height < 0 || checkpoint.height % params.interval !== 0) invalid();
    const prev = checkpoint.previousHeaders.map((h) => parseHeader(h));
    if (prev.length > MEDIAN_TIME_SPAN - 1 || prev.length > checkpoint.height) invalid();
    let child = header;
    for (let i = prev.length - 1; i >= 0; i--) {
      const ph = prev[i] as BlockHeader;
      if (child.prevHash !== ph.hash) invalid();
      child = ph;
    }
    this.before = prev;
    this.active.push(p.raw, p.hash);
    this.tipWorkValue = blockWork(header.bits);
    this.strideWork.push(this.tipWorkValue);
  }

  /** Starts a chain at a pinned checkpoint. */
  public static create(o: HeaderChainOptions): HeaderChain {
    const cp = { ...o.checkpoint, hash: o.checkpoint.hash.toLowerCase(), previousHeaders: o.checkpoint.previousHeaders ?? [] };
    return new HeaderChain(o.params, cp, o.now ?? (() => Math.floor(Date.now() / 1000)));
  }

  /**
   * Rebuilds a chain from {@link toJSON} output, re-validating every header (in batches, so any length that
   * {@link toJSON} can produce reloads).
   *
   * `o.checkpoint` (required) is the caller's pinned starting header. The stored checkpoint (height, hash, header
   * and previous headers) must equal it exactly, else `INVALID_HEADER`: stored data never chooses its own anchor.
   */
  public static fromJSON(
    j: SerializedHeaderChain,
    o: { readonly checkpoint: HeaderCheckpoint; readonly now?: () => number; readonly params?: ChainParams },
  ): HeaderChain {
    if (typeof o !== 'object' || o === null || typeof o.checkpoint !== 'object' || o.checkpoint === null) return fail('INVALID_INPUT');
    if (typeof j !== 'object' || j === null || j.version !== 1 || !Object.hasOwn(CHAIN_PARAMS, j.network) || !Array.isArray(j.headers)) {
      return fail('INVALID_INPUT');
    }
    const params = o.params ?? CHAIN_PARAMS[j.network];
    if (params.network !== j.network) return fail('INVALID_INPUT');
    if (!sameCheckpoint(j.checkpoint, o.checkpoint)) invalid();
    const chain = HeaderChain.create({ params, checkpoint: j.checkpoint, ...(o.now === undefined ? {} : { now: o.now }) });
    for (let i = 0; i < j.headers.length; i += MAX_BATCH) {
      const r = chain.connect(j.headers.slice(i, i + MAX_BATCH));
      if (r.tipHeight !== j.checkpoint.height + Math.min(j.headers.length, i + MAX_BATCH)) invalid();
    }
    return chain;
  }

  public toJSON(): SerializedHeaderChain {
    const headers: string[] = [];
    for (let i = 1; i < this.active.length; i++) headers.push(this.active.hexRange(i, i + 1));
    return { version: 1, network: this.params.network, checkpoint: { ...this.checkpoint }, headers };
  }

  /** The network and checkpoint part of {@link toJSON}, without the headers. */
  public anchor(): Pick<SerializedHeaderChain, 'network' | 'checkpoint'> {
    return { network: this.params.network, checkpoint: { ...this.checkpoint } };
  }

  /**
   * The active headers above the checkpoint as one hex string (160 characters per header, height order): a compact
   * form for storage. Reload by passing 160-character slices to {@link connect} on a chain created at the same
   * checkpoint.
   */
  public headersHex(): string {
    return this.active.hexRange(1, this.active.length);
  }

  public get tipHeight(): number {
    return this.checkpoint.height + this.active.length - 1;
  }

  public get tipHash(): string {
    return this.active.hashHex(this.active.length - 1);
  }

  /** Cumulative work of the active chain counted from the checkpoint (inclusive). */
  public get tipWork(): bigint {
    return this.tipWorkValue;
  }

  public get checkpointHeight(): number {
    return this.checkpoint.height;
  }

  /** True when the median-time-past rule can be applied to the very next header after the checkpoint. */
  public get mtpContextComplete(): boolean {
    return this.before.length >= Math.min(MEDIAN_TIME_SPAN - 1, this.checkpoint.height);
  }

  /** @internal */
  public get epochValue(): number {
    return this.epoch;
  }

  private index(height: number): number | undefined {
    if (!Number.isInteger(height) || height < this.checkpoint.height) return undefined;
    const i = height - this.checkpoint.height;
    return i < this.active.length ? i : undefined;
  }

  /** Active-chain hash at `height`, or `undefined` outside the known range. */
  public hashAt(height: number): string | undefined {
    const i = this.index(height);
    return i === undefined ? undefined : this.active.hashHex(i);
  }

  public headerAt(height: number): BlockHeader | undefined {
    const i = this.index(height);
    return i === undefined ? undefined : parseHeader(this.active.hexRange(i, i + 1));
  }

  /** Cumulative work of the active chain at `height` (inclusive). @internal */
  public workAt(height: number): bigint {
    const i = this.index(height);
    if (i === undefined) return fail('INVALID_INPUT');
    const k = Math.floor(i / WORK_STRIDE);
    let w = this.strideWork[k] as bigint;
    for (let j = k * WORK_STRIDE + 1; j <= i; j++) w += cachedBlockWork(this.active.bits(j));
    return w;
  }

  /** @internal */
  public nodeAt(height: number): HeaderNode | undefined {
    const i = this.index(height);
    return i === undefined ? undefined : { height, time: this.active.time(i), bits: this.active.bits(i) };
  }

  /** `nBits` a header on top of the current tip with timestamp `time` must carry. */
  public nextBits(time: number): number {
    return this.requiredBits(this.nodeAt(this.tipHeight) as HeaderNode, time, (h) => this.nodeAt(h));
  }

  /**
   * Starts a branch on the active block whose hash is `parentHash` (display hex), for streaming validation.
   * @throws {SilentPaymentError} `INVALID_HEADER` when no active block has that hash.
   */
  public branchFrom(parentHash: string): HeaderBranch {
    if (typeof parentHash !== 'string' || !HEX64.test(parentHash)) return invalid();
    const want = fromHex(parentHash);
    for (let i = this.active.length - 1; i >= 0; i--) {
      if (this.active.hashEquals(i, want)) return new HeaderBranch(this, this.checkpoint.height + i, this.epoch);
    }
    return invalid();
  }

  /** A branch on the active block at `height`. @throws `INVALID_INPUT` outside the active chain. */
  public branchAt(height: number): HeaderBranch {
    if (this.index(height) === undefined) return fail('INVALID_INPUT');
    return new HeaderBranch(this, height, this.epoch);
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
    const branch = this.branchFrom(parseHeader(headersHex[0] as string).prevHash);
    branch.add(headersHex);
    if (branch.length === 0 || !branch.beatsActive) {
      return { adopted: false, reorg: false, forkHeight: branch.forkHeight, tipHeight: this.tipHeight };
    }
    return branch.adopt();
  }

  /** @internal Called by {@link HeaderBranch.adopt}. */
  public replaceAbove(forkHeight: number, run: HeaderRun): ConnectResult {
    const reorg = forkHeight < this.tipHeight;
    const keep = forkHeight - this.checkpoint.height + 1;
    this.active.truncate(keep);
    this.strideWork.length = Math.floor((keep - 1) / WORK_STRIDE) + 1;
    let w = this.workAt(forkHeight);
    for (let r = 0; r < run.length; r++) {
      this.active.push(run.rawAt(r), run.hashBytesAt(r));
      w += cachedBlockWork(run.bits(r));
      if ((this.active.length - 1) % WORK_STRIDE === 0) this.strideWork.push(w);
    }
    this.tipWorkValue = w;
    this.epoch++;
    return { adopted: true, reorg, forkHeight, tipHeight: this.tipHeight };
  }

  /** @internal Validates header `h` on top of the branch tip (`parentHeight`, `parentHash`). */
  public validateOn(branch: HeaderBranch, parentHeight: number, parentHash: string, h: BlockHeader): void {
    const ctx = (height: number): HeaderNode | undefined => branch.node(height);
    const parent = ctx(parentHeight) as HeaderNode;
    const c = this.params;
    const height = parentHeight + 1;
    if (h.prevHash !== parentHash) invalid();
    checkProofOfWork(h, c.network);
    if (h.bits !== this.requiredBits(parent, h.time, ctx)) invalid();
    const mtp = this.medianTimePast(parent, ctx);
    if (mtp !== undefined && h.time <= mtp) invalid();
    if (h.time > this.now() + MAX_FUTURE_BLOCK_TIME) invalid();
    if (c.enforceBip94 && height % c.interval === 0 && h.time < parent.time - MAX_TIMEWARP) invalid();
    if ((h.version < 2 && height >= c.bip34Height) || (h.version < 3 && height >= c.bip66Height) || (h.version < 4 && height >= c.bip65Height)) {
      invalid();
    }
  }

  /** Timestamps of up to 11 blocks ending at `last` (inclusive), or `undefined` when context is missing. */
  private medianTimePast(last: HeaderNode, ctx: (h: number) => HeaderNode | undefined): number | undefined {
    const times: number[] = [];
    for (let h = last.height; h >= 0 && times.length < MEDIAN_TIME_SPAN; h--) {
      const e = ctx(h);
      if (e !== undefined) {
        times.push(e.time);
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

  private requiredBits(last: HeaderNode, time: number, ctx: (h: number) => HeaderNode | undefined): number {
    const c = this.params;
    const height = last.height + 1;
    if (height % c.interval !== 0) {
      if (c.allowMinDifficultyBlocks) {
        if (time > last.time + c.targetSpacing * 2) return c.powLimitBits;
        let e = last;
        while (e.height % c.interval !== 0 && e.bits === c.powLimitBits) {
          const prev = ctx(e.height - 1);
          if (prev === undefined) break;
          e = prev;
        }
        return e.bits;
      }
      return last.bits;
    }
    const firstEntry = ctx(last.height - (c.interval - 1));
    if (firstEntry === undefined) return invalid();
    return calculateNextWorkRequired({ lastBits: last.bits, lastTime: last.time, firstTime: firstEntry.time, firstBits: firstEntry.bits }, c);
  }
}
