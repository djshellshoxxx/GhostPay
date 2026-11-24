// Opt-in local SQLite store, Node >=22.13. Not a distributed/cloud lease service.
import { DatabaseSync } from 'node:sqlite';
import { constants, closeSync, lstatSync, mkdirSync, openSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { parseWebhookEvent, verifyWebhook } from '@ghostpay/merchant-hooks';

function privateDirectory(directory) {
  const path = resolve(directory);
  mkdirSync(path, { mode: 0o700, recursive: true });
  const st = lstatSync(path);
  if (!st.isDirectory() || st.isSymbolicLink() || (st.mode & 0o077) !== 0 ||
      (process.getuid && st.uid !== process.getuid())) throw new Error('unsafe-state-directory');
  const file = join(path, 'webhooks.sqlite');
  const fd = openSync(file, constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW, 0o600);
  closeSync(fd);
  const dbStat = lstatSync(file);
  if (!dbStat.isFile() || dbStat.nlink !== 1 || (dbStat.mode & 0o077) !== 0 ||
      (process.getuid && dbStat.uid !== process.getuid())) throw new Error('unsafe-state-file');
  return file;
}

/** State never expires an event or steals a claim based on a clock. Full stores fail closed.
 * SQLite transactions serialize processes. WAL + FULL sync protects committed state on a local filesystem.
 * An unfinished handler is unresolved, including process death; only explicit reconcile() can change it.
 */
export class DurableWebhookStore {
  #db;
  #maxEvents;
  #maxNonces;
  #maxAttempts;
  constructor(directory, { maxEvents = 100_000, maxNonces = 10_000, maxAttempts = 8 } = {}) {
    for (const n of [maxEvents, maxNonces, maxAttempts]) {
      if (!Number.isSafeInteger(n) || n < 1 || n > 1_000_000) throw new Error('bad-store-limit');
    }
    this.#maxEvents = maxEvents;
    this.#maxNonces = maxNonces;
    this.#maxAttempts = maxAttempts;
    this.#db = new DatabaseSync(privateDirectory(directory));
    try {
      this.#db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
        CREATE TABLE IF NOT EXISTS nonces (nonce TEXT PRIMARY KEY, expires_at INTEGER NOT NULL) STRICT;
        CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, digest TEXT NOT NULL,
          state TEXT NOT NULL CHECK(state IN ('processing','unresolved','done','retry')),
          token TEXT NOT NULL, attempts INTEGER NOT NULL CHECK(attempts > 0), updated_at INTEGER NOT NULL) STRICT;`);
    } catch (e) { this.#db.close(); throw e; }
  }
  #transaction(fn) {
    this.#db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.#db.exec('COMMIT'); return result; }
    catch (e) { this.#db.exec('ROLLBACK'); throw e; }
  }
  /** Authenticates before parsing; nonce reservation + event claim are one transaction. */
  accept(secret, body, header, { now = Math.floor(Date.now() / 1000), toleranceSeconds } = {}) {
    if (typeof body !== 'string' || Buffer.byteLength(body) > 65536) return { kind: 'invalid' };
    return this.#transaction(() => {
      const nonces = {
        has: (nonce, at) => Boolean(this.#db.prepare('SELECT 1 FROM nonces WHERE nonce=? AND expires_at>?').get(nonce, at)),
        add: (nonce, expiresAt, at) => {
          this.#db.prepare('DELETE FROM nonces WHERE expires_at<=?').run(at);
          if (this.#db.prepare('SELECT count(*) AS n FROM nonces').get().n >= this.#maxNonces) return false;
          this.#db.prepare('INSERT INTO nonces(nonce,expires_at) VALUES(?,?)').run(nonce, expiresAt);
          return true;
        },
      };
      if (!verifyWebhook(secret, body, header, { now, nonces, toleranceSeconds }).ok) return { kind: 'invalid' };
      let event;
      try { event = parseWebhookEvent(body); } catch { return { kind: 'invalid' }; }
      const digest = createHash('sha256').update(body, 'utf8').digest('hex');
      const old = this.#db.prepare('SELECT * FROM events WHERE id=?').get(event.id);
      if (old) {
        if (old.digest !== digest) return { kind: 'conflict' };
        if (old.state === 'done') return { kind: 'done' };
        if (old.state !== 'retry' || old.attempts >= this.#maxAttempts) return { kind: 'processing' };
      } else if (this.#db.prepare('SELECT count(*) AS n FROM events').get().n >= this.#maxEvents) return { kind: 'capacity' };
      const token = randomUUID();
      this.#db.prepare(`INSERT INTO events(id,digest,state,token,attempts,updated_at) VALUES(?,?,'processing',?,1,?)
        ON CONFLICT(id) DO UPDATE SET state='processing',token=excluded.token,attempts=events.attempts+1,updated_at=excluded.updated_at`).run(event.id, digest, token, now);
      return { kind: 'claimed', event, token, digest };
    });
  }
  #finish(id, token, state, now) {
    if (!Number.isSafeInteger(now) || now < 0) throw new Error('bad-clock');
    const result = this.#db.prepare(`UPDATE events SET state=?,updated_at=? WHERE id=? AND token=? AND state='processing'`).run(state, now, id, token);
    if (result.changes !== 1) throw new Error('stale-claim');
  }
  complete(id, token, now) { this.#finish(id, token, 'done', now); }
  uncertain(id, token, now) { this.#finish(id, token, 'unresolved', now); }
  inspect(id) { return this.#db.prepare('SELECT * FROM events WHERE id=?').get(id) ?? null; }
  /** Operator only, never an HTTP route. Stop/quiesce original handler first. `retry` requires proven no effect
   * or the SAME event id as a downstream idempotency key; `done` requires externally confirmed completion.
   * Caller owns this evidence; this local database cannot independently establish it or prevent rollback.
   */
  reconcile(id, { token, digest, outcome, now, originalHandlerStopped }) {
    if (originalHandlerStopped !== true || !['done', 'retry'].includes(outcome) || !Number.isSafeInteger(now) || now < 0) throw new Error('bad-reconciliation');
    return this.#transaction(() => {
      const r = this.#db.prepare(`UPDATE events SET state=?,updated_at=? WHERE id=? AND token=? AND digest=?
        AND state IN ('processing','unresolved') AND (?='done' OR attempts<?)`).run(outcome, now, id, token, digest, outcome, this.#maxAttempts);
      if (r.changes !== 1) throw new Error('stale-reconciliation');
    });
  }
  close() { this.#db.close(); }
}
