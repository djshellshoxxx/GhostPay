import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { MAX_BLOCK_NUMBER, type Hex } from './wire.js';

/** A stored canonical block header. */
export interface StoredHeader {
  readonly number: bigint;
  readonly hash: Hex;
  readonly parentHash: Hex;
  /** Announcer logs of this block that are not served (outside record limits or undecodable). */
  readonly omitted: number;
}

/** A stored announcement with its chain position. */
export interface StoredAnnouncement {
  readonly blockNumber: bigint;
  readonly blockHash: Hex;
  readonly logIndex: number;
  readonly transactionHash: Hex;
  readonly schemeId: bigint;
  readonly stealthAddress: Hex;
  readonly caller: Hex;
  readonly ephemeralPublicKey: Hex;
  readonly metadata: Hex;
}

/** One block to append: its header and every served announcement of it. */
export interface BlockBatch {
  readonly header: StoredHeader;
  readonly announcements: readonly StoredAnnouncement[];
}

/** Identity of a store; a mismatch on reopen is refused. */
export interface StoreIdentity {
  readonly chainId: number;
  readonly announcer: Hex;
  /** First indexed block (already aligned down to the window grid). */
  readonly indexedFrom: bigint;
}

/** Error with a fixed message, raised for store misuse or corruption. */
export class StoreError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'StoreError';
  }
}

const SCHEMA_VERSION = '1';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
CREATE TABLE IF NOT EXISTS headers (
  number INTEGER PRIMARY KEY,
  hash TEXT NOT NULL,
  parent_hash TEXT NOT NULL,
  omitted INTEGER NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS announcements (
  block_number INTEGER NOT NULL,
  log_index INTEGER NOT NULL,
  block_hash TEXT NOT NULL,
  transaction_hash TEXT NOT NULL,
  scheme_id TEXT NOT NULL,
  stealth_address TEXT NOT NULL,
  caller TEXT NOT NULL,
  ephemeral_public_key TEXT NOT NULL,
  metadata TEXT NOT NULL,
  PRIMARY KEY (block_number, log_index)
) STRICT, WITHOUT ROWID;
`;

type Row = Record<string, unknown>;

const num = (n: bigint): number => {
  if (n < 0n || n > MAX_BLOCK_NUMBER) throw new StoreError('block number out of range');
  return Number(n);
};

function toHeader(r: Row): StoredHeader {
  return { number: BigInt(r['number'] as number), hash: r['hash'] as Hex, parentHash: r['parent_hash'] as Hex, omitted: r['omitted'] as number };
}

function toAnnouncement(r: Row): StoredAnnouncement {
  return {
    blockNumber: BigInt(r['block_number'] as number),
    blockHash: r['block_hash'] as Hex,
    logIndex: r['log_index'] as number,
    transactionHash: r['transaction_hash'] as Hex,
    schemeId: BigInt(r['scheme_id'] as string),
    stealthAddress: r['stealth_address'] as Hex,
    caller: r['caller'] as Hex,
    ephemeralPublicKey: r['ephemeral_public_key'] as Hex,
    metadata: r['metadata'] as Hex,
  };
}

/**
 * Rollback-safe persistence of the canonical announcer index (SQLite via `node:sqlite`, WAL, synchronous FULL).
 *
 * Invariants enforced on every write: headers form one contiguous parent-linked chain starting at `indexedFrom`;
 * announcements exist only for stored blocks and carry that block's hash; a block and its announcements are committed
 * in one transaction; a rollback deletes every block above the common ancestor and its announcements in one
 * transaction. A crash therefore leaves the store at a block boundary.
 *
 * @security Holds public chain data only. Never stores request data, client addresses or timing.
 */
export class LogStore {
  private readonly db: DatabaseSync;
  private readonly identity: StoreIdentity;
  private readonly q: {
    tip: StatementSync;
    header: StatementSync;
    headers: StatementSync;
    anns: StatementSync;
    insHeader: StatementSync;
    insAnn: StatementSync;
    delHeaders: StatementSync;
    delAnns: StatementSync;
    getMeta: StatementSync;
    setMeta: StatementSync;
  };

  private constructor(db: DatabaseSync, identity: StoreIdentity) {
    this.db = db;
    this.identity = identity;
    this.q = {
      tip: db.prepare('SELECT * FROM headers ORDER BY number DESC LIMIT 1'),
      header: db.prepare('SELECT * FROM headers WHERE number = ?'),
      headers: db.prepare('SELECT * FROM headers WHERE number BETWEEN ? AND ? ORDER BY number'),
      anns: db.prepare('SELECT * FROM announcements WHERE block_number BETWEEN ? AND ? ORDER BY block_number, log_index LIMIT ?'),
      insHeader: db.prepare('INSERT INTO headers (number, hash, parent_hash, omitted) VALUES (?, ?, ?, ?)'),
      insAnn: db.prepare(
        'INSERT INTO announcements (block_number, log_index, block_hash, transaction_hash, scheme_id, stealth_address, caller, ephemeral_public_key, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ),
      delHeaders: db.prepare('DELETE FROM headers WHERE number > ?'),
      delAnns: db.prepare('DELETE FROM announcements WHERE block_number > ?'),
      getMeta: db.prepare('SELECT value FROM meta WHERE key = ?'),
      setMeta: db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'),
    };
  }

  /**
   * Opens (or creates) a store at `path` (`':memory:'` for tests). An existing store must have the same identity.
   * @throws StoreError on identity or schema mismatch.
   */
  public static open(path: string, identity: StoreIdentity): LogStore {
    num(identity.indexedFrom);
    const db = new DatabaseSync(path);
    try {
      db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;');
      db.exec(SCHEMA);
      const store = new LogStore(db, identity);
      const want: Record<string, string> = {
        schema: SCHEMA_VERSION,
        chainId: String(identity.chainId),
        announcer: identity.announcer.toLowerCase(),
        indexedFrom: identity.indexedFrom.toString(),
      };
      for (const [key, value] of Object.entries(want)) {
        const have = store.meta(key);
        if (have === undefined) store.q.setMeta.run(key, value);
        else if (have !== value) throw new StoreError('store identity mismatch');
      }
      return store;
    } catch (e) {
      db.close();
      throw e;
    }
  }

  private meta(key: string): string | undefined {
    const r = this.q.getMeta.get(key) as Row | undefined;
    return r === undefined ? undefined : (r['value'] as string);
  }

  /** First indexed block. */
  public get indexedFrom(): bigint {
    return this.identity.indexedFrom;
  }

  /** True once {@link halt} has been called; persisted. */
  public get halted(): boolean {
    return this.meta('halted') === '1';
  }

  /** Stops serving and ingesting until an operator rebuilds the store. */
  public halt(): void {
    this.q.setMeta.run('halted', '1');
  }

  /** Highest stored block, if any. */
  public tip(): StoredHeader | undefined {
    const r = this.q.tip.get() as Row | undefined;
    return r === undefined ? undefined : toHeader(r);
  }

  /** Stored header at `n`, if any. */
  public header(n: bigint): StoredHeader | undefined {
    const r = this.q.header.get(num(n)) as Row | undefined;
    return r === undefined ? undefined : toHeader(r);
  }

  /** Stored headers in `[from, to]`, ascending. */
  public headers(from: bigint, to: bigint): StoredHeader[] {
    return (this.q.headers.all(num(from), num(to)) as Row[]).map(toHeader);
  }

  /** Up to `limit` announcements in blocks `[from, to]`, ordered by `(blockNumber, logIndex)`. */
  public announcements(from: bigint, to: bigint, limit: number): StoredAnnouncement[] {
    return (this.q.anns.all(num(from), num(to), limit) as Row[]).map(toAnnouncement);
  }

  /**
   * Appends consecutive blocks atomically. The first must extend the tip (or start the index at `indexedFrom`), each
   * next one must link to its predecessor, and every announcement must carry its block's number and hash.
   * @throws StoreError and writes nothing when any link or announcement does not fit.
   */
  public appendBlocks(blocks: readonly BlockBatch[]): void {
    let prev = this.tip();
    for (const b of blocks) {
      const h = b.header;
      const expected = prev === undefined ? this.identity.indexedFrom : prev.number + 1n;
      if (h.number !== expected || (prev !== undefined && h.parentHash !== prev.hash)) throw new StoreError('block does not extend the stored chain');
      for (const a of b.announcements) {
        if (a.blockNumber !== h.number || a.blockHash !== h.hash) throw new StoreError('announcement does not belong to its block');
      }
      prev = h;
    }
    this.tx(() => {
      for (const { header: h, announcements } of blocks) {
        this.q.insHeader.run(num(h.number), h.hash, h.parentHash, h.omitted);
        for (const a of announcements) {
          this.q.insAnn.run(num(a.blockNumber), a.logIndex, a.blockHash, a.transactionHash, a.schemeId.toString(), a.stealthAddress, a.caller, a.ephemeralPublicKey, a.metadata);
        }
      }
    });
  }

  /** Deletes every block above `ancestor` (and its announcements) atomically. `indexedFrom - 1` empties the store. */
  public rollbackTo(ancestor: bigint): void {
    if (ancestor < this.identity.indexedFrom - 1n) throw new StoreError('rollback below the indexed range');
    const n = Number(ancestor);
    this.tx(() => {
      this.q.delAnns.run(n);
      this.q.delHeaders.run(n);
    });
  }

  private tx(fn: () => void): void {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      fn();
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  /** Closes the database. */
  public close(): void {
    this.db.close();
  }
}
