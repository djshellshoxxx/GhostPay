import { ManualClock, type Clock } from './clock.js';
import { SandboxError } from './errors.js';
import { mockAddress, mockHash } from './hash.js';
import { DEFAULT_TEST_CHAIN_ID, assertTestChainId } from './testmode.js';

const ADDR_RE = /^0x[0-9a-f]{40}$/;
const NATIVE = 'native';
/** Default faucet payout: 1 unit (1e18). */
export const FAUCET_DEFAULT_AMOUNT = 10n ** 18n;
/** Maximum faucet payout per request: 100 units. */
export const FAUCET_MAX_AMOUNT = 100n * 10n ** 18n;
/** Seconds an address must wait between faucet requests. */
export const FAUCET_COOLDOWN_SECONDS = 60;

export type TxStatus = 'pending' | 'success' | 'failed' | 'dropped';

export interface Announcement {
  readonly type: 'Announcement';
  readonly blockNumber: number;
  readonly txHash: string;
  readonly logIndex: number;
  readonly caller: string;
  readonly stealthAddress: string;
  readonly ephemeralPubKey: string;
  readonly viewTag: string;
  readonly metadata: string;
}

export interface Payment {
  readonly type: 'Payment';
  readonly blockNumber: number;
  readonly txHash: string;
  readonly logIndex: number;
  readonly from: string;
  readonly to: string;
  /** `'native'` or a lowercase token address. */
  readonly token: string;
  readonly amount: bigint;
}

export type ChainEvent = Announcement | Payment;

export interface TransferRequest {
  readonly from: string;
  readonly to: string;
  readonly amount: bigint;
  readonly token?: string;
  /** When present the tx also emits an Announcement for `to`. */
  readonly announce?: { readonly ephemeralPubKey: string; readonly viewTag: string; readonly metadata?: string };
}

export interface TxRecord {
  readonly hash: string;
  readonly request: TransferRequest;
  readonly kind: 'transfer' | 'faucet';
  status: TxStatus;
  blockNumber: number | undefined;
  /** Unix seconds before which the tx will not be mined (delay injection). */
  readonly readyAt: number;
}

export interface Block {
  readonly number: number;
  readonly hash: string;
  readonly parentHash: string;
  readonly timestamp: number;
  readonly txHashes: readonly string[];
}

/** Fault-injection knobs. All are consumed deterministically. */
export interface Faults {
  /** Seconds newly submitted txs wait before they can be mined. */
  delaySeconds: number;
  /** Next N submitted txs are included but revert (status `failed`). */
  failNext: number;
  /** Next N submitted txs are silently dropped (never mined). */
  dropNext: number;
}

export interface ChainOptions {
  readonly chainId?: number;
  readonly clock?: Clock;
  readonly seed?: string;
}

interface Snapshot {
  readonly balances: Map<string, bigint>;
}

const balKey = (token: string, addr: string): string => `${token}|${addr}`;

function checkAddress(a: string): string {
  if (typeof a !== 'string' || !ADDR_RE.test(a)) throw new SandboxError('INVALID_ADDRESS', 'address must be lowercase 0x + 40 hex');
  return a;
}

function checkAmount(v: bigint, allowZero = false): bigint {
  if (typeof v !== 'bigint' || v < 0n || (!allowZero && v === 0n) || v >= 1n << 256n)
    throw new SandboxError('INVALID_AMOUNT', 'amount must be a positive bigint below 2^256');
  return v;
}

function checkToken(t: string | undefined): string {
  return t === undefined || t === NATIVE ? NATIVE : checkAddress(t);
}

/**
 * Deterministic in-memory mock chain.
 *
 * @remarks Test-only. The chain id must be inside the reserved test range
 * (31337-31399) so mock data can never be confused with a live chain. Time comes
 * from an injectable clock; there is no randomness and no I/O, so the same call
 * sequence always yields the same block hashes.
 */
export class MockChain {
  public readonly chainId: number;
  /** Always `true`: the explicit TEST flag carried by every sandbox chain. */
  public readonly test = true as const;
  public readonly faults: Faults = { delaySeconds: 0, failNext: 0, dropNext: 0 };
  private readonly clock: Clock;
  private readonly seed: string;
  private epoch = 0;
  private txCounter = 0;
  private balances = new Map<string, bigint>();
  private readonly txs = new Map<string, TxRecord>();
  private pending: string[] = [];
  private blocks: Block[] = [];
  private events: ChainEvent[] = [];
  private snapshots: Snapshot[] = [];
  private readonly failing = new Set<string>();
  private readonly lastFaucet = new Map<string, number>();

  public constructor(options: ChainOptions = {}) {
    this.chainId = options.chainId ?? DEFAULT_TEST_CHAIN_ID;
    assertTestChainId(this.chainId);
    this.clock = options.clock ?? new ManualClock();
    this.seed = options.seed ?? 'ghostpay-sandbox';
    const genesis: Block = {
      number: 0,
      hash: mockHash(`${this.seed}:${this.chainId}:genesis`),
      parentHash: `0x${'0'.repeat(64)}`,
      timestamp: this.clock.now(),
      txHashes: [],
    };
    this.blocks.push(genesis);
    this.snapshots.push(this.snapshot());
  }

  /** Deterministic funded-able account addresses: `account(0)`, `account(1)`, ... */
  public account(index: number): string {
    if (!Number.isSafeInteger(index) || index < 0) throw new SandboxError('INVALID_CONFIG', 'account index must be a non-negative integer');
    return mockAddress(`${this.seed}:${this.chainId}:${index}`);
  }

  public get height(): number {
    return (this.blocks[this.blocks.length - 1] as Block).number;
  }

  public getBlock(n: number): Block | undefined {
    return this.blocks[n];
  }

  public balanceOf(address: string, token?: string): bigint {
    return this.balances.get(balKey(checkToken(token), checkAddress(address))) ?? 0n;
  }

  public getTx(hash: string): TxRecord {
    const tx = this.txs.get(hash);
    if (tx === undefined) throw new SandboxError('UNKNOWN_TX', 'unknown transaction');
    return tx;
  }

  /** Confirmations of a mined tx (1 = in the head block), 0 if not mined. */
  public confirmations(hash: string): number {
    const tx = this.getTx(hash);
    return tx.blockNumber === undefined ? 0 : this.height - tx.blockNumber + 1;
  }

  /** Events with block number within `[fromBlock, toBlock]`, in chain order. */
  public getEvents(filter: { fromBlock?: number; toBlock?: number; type?: ChainEvent['type'] } = {}): ChainEvent[] {
    const from = filter.fromBlock ?? 0;
    const to = filter.toBlock ?? Number.MAX_SAFE_INTEGER;
    return this.events.filter((e) => e.blockNumber >= from && e.blockNumber <= to && (filter.type === undefined || e.type === filter.type));
  }

  /**
   * Mints test funds to an address and mines a block containing the mint.
   *
   * @param address Lowercase address.
   * @param amount Defaults to 1e18, at most 100e18.
   * @throws {SandboxError} `FAUCET_LIMIT` above the cap, `FAUCET_COOLDOWN` within 60 s of the last drip.
   * @security Exists only on the sandbox chain; a live chain adapter has no faucet.
   */
  public faucet(address: string, amount: bigint = FAUCET_DEFAULT_AMOUNT): string {
    checkAddress(address);
    checkAmount(amount);
    if (amount > FAUCET_MAX_AMOUNT) throw new SandboxError('FAUCET_LIMIT', 'faucet amount above the per-request cap');
    const last = this.lastFaucet.get(address);
    if (last !== undefined && this.clock.now() < last + FAUCET_COOLDOWN_SECONDS)
      throw new SandboxError('FAUCET_COOLDOWN', 'faucet cooldown has not elapsed');
    this.lastFaucet.set(address, this.clock.now());
    const key = balKey(NATIVE, address);
    this.balances.set(key, (this.balances.get(key) ?? 0n) + amount);
    const hash = mockHash(`${this.seed}:${this.epoch}:faucet:${this.txCounter++}`);
    this.txs.set(hash, { hash, request: { from: address, to: address, amount }, kind: 'faucet', status: 'success', blockNumber: this.height + 1, readyAt: 0 });
    this.seal([hash]);
    return hash;
  }

  /**
   * Submits a transfer to the pending pool, subject to injected faults.
   * @returns The tx hash. A dropped tx keeps status `dropped` and is never mined.
   */
  public submit(request: TransferRequest): string {
    checkAddress(request.from);
    checkAddress(request.to);
    checkAmount(request.amount);
    const token = checkToken(request.token);
    if (request.announce !== undefined && (request.announce.ephemeralPubKey === '' || request.announce.viewTag === ''))
      throw new SandboxError('INVALID_CONFIG', 'announcement fields must be non-empty');
    const hash = mockHash(`${this.seed}:${this.epoch}:tx:${this.txCounter++}`);
    const readyAt = this.clock.now() + this.faults.delaySeconds;
    const record: TxRecord = { hash, request: { ...request, token }, kind: 'transfer', status: 'pending', blockNumber: undefined, readyAt };
    this.txs.set(hash, record);
    if (this.faults.dropNext > 0) {
      this.faults.dropNext--;
      record.status = 'dropped';
    } else {
      this.pending.push(hash);
      if (this.faults.failNext > 0) {
        this.faults.failNext--;
        this.failing.add(hash);
      }
    }
    return hash;
  }

  /**
   * Mines one block with every pending tx whose delay has elapsed.
   * @returns The new block.
   */
  public mine(): Block {
    const ready = this.pending.filter((h) => (this.txs.get(h) as TxRecord).readyAt <= this.clock.now());
    this.pending = this.pending.filter((h) => !ready.includes(h));
    const number = this.height + 1;
    for (const h of ready) this.execute(this.txs.get(h) as TxRecord, number);
    return this.seal(ready);
  }

  /** Mines `n` blocks. */
  public mineBlocks(n: number): Block {
    if (!Number.isSafeInteger(n) || n < 1) throw new SandboxError('INVALID_CONFIG', 'block count must be a positive integer');
    let b = this.mine();
    for (let i = 1; i < n; i++) b = this.mine();
    return b;
  }

  /**
   * Simulates a chain reorganisation: removes the last `depth` blocks, restores state, and
   * either returns their transfers to the pending pool (`replay: true`, default) or drops them.
   * Faucet mints in removed blocks are always dropped.
   * New blocks get different hashes (the reorg epoch is hashed in).
   * @throws {SandboxError} `REORG_DEPTH` if depth is < 1 or reaches genesis.
   */
  public reorg(depth: number, options: { replay?: boolean } = {}): void {
    if (!Number.isSafeInteger(depth) || depth < 1 || depth > this.height)
      throw new SandboxError('REORG_DEPTH', 'reorg depth must be between 1 and the chain height');
    const removed = this.blocks.splice(this.blocks.length - depth, depth);
    this.snapshots.splice(this.snapshots.length - depth, depth);
    const restore = this.snapshots[this.snapshots.length - 1] as Snapshot;
    this.balances = new Map(restore.balances);
    const cut = this.height;
    this.events = this.events.filter((e) => e.blockNumber <= cut);
    const replay = options.replay !== false;
    this.epoch++;
    for (const b of removed) {
      for (const h of b.txHashes) {
        const tx = this.txs.get(h) as TxRecord;
        tx.blockNumber = undefined;
        if (tx.kind === 'transfer' && replay) {
          tx.status = 'pending';
          this.pending.push(h);
        } else {
          tx.status = 'dropped';
        }
      }
    }
  }

  private execute(tx: TxRecord, blockNumber: number): void {
    const { from, to, amount, announce } = tx.request;
    const token = checkToken(tx.request.token);
    const fromKey = balKey(token, from);
    const have = this.balances.get(fromKey) ?? 0n;
    tx.blockNumber = blockNumber;
    if (this.failing.delete(tx.hash) || have < amount) {
      tx.status = 'failed';
      return;
    }
    tx.status = 'success';
    this.balances.set(fromKey, have - amount);
    const toKey = balKey(token, to);
    this.balances.set(toKey, (this.balances.get(toKey) ?? 0n) + amount);
    let logIndex = 0;
    this.events.push({ type: 'Payment', blockNumber, txHash: tx.hash, logIndex: logIndex++, from, to, token, amount });
    if (announce !== undefined)
      this.events.push({
        type: 'Announcement',
        blockNumber,
        txHash: tx.hash,
        logIndex,
        caller: from,
        stealthAddress: to,
        ephemeralPubKey: announce.ephemeralPubKey,
        viewTag: announce.viewTag,
        metadata: announce.metadata ?? '0x',
      });
  }

  private seal(txHashes: readonly string[]): Block {
    const parent = this.blocks[this.blocks.length - 1] as Block;
    const number = parent.number + 1;
    const block: Block = {
      number,
      hash: mockHash(`${this.seed}:${this.chainId}:${this.epoch}:${number}:${parent.hash}:${txHashes.join(',')}`),
      parentHash: parent.hash,
      timestamp: Math.max(this.clock.now(), parent.timestamp),
      txHashes,
    };
    this.blocks.push(block);
    for (const h of txHashes) {
      const tx = this.txs.get(h) as TxRecord;
      tx.blockNumber = number;
    }
    this.snapshots.push(this.snapshot());
    return block;
  }

  private snapshot(): Snapshot {
    return { balances: new Map(this.balances) };
  }
}
