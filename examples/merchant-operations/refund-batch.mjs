// Offline fixture harness only. No chain verifier, signer, sender or broadcast port.
import { createHash } from 'node:crypto';
import { closeSync, lstatSync, mkdirSync, openSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { confirmBatch, planRefund, previewBatch } from '@ghostpay/merchant-billing';

const MAX_RECORDS = 256;
const MAX_BYTES = 1_048_576;
const UINT256 = (1n << 256n) - 1n;
const json = (v) => JSON.stringify(v, (_, value) => typeof value === 'bigint' ? value.toString() : value);
const hash = (v) => createHash('sha256').update(`ghostpay-fixture-operation-v1\n${json(v)}`).digest('hex');
const fail = () => { throw new Error('Invalid fixture operation or stored state'); };
const keys = (value, expected) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).sort().join('|') !== [...expected].sort().join('|')) fail();
};
const amount = (v) => {
  if (typeof v !== 'string' || !/^[1-9][0-9]{0,77}$/.test(v) || BigInt(v) > UINT256) fail();
  return BigInt(v);
};

// Public deterministic TEST curve points, no private keys or real payment evidence.
export const FIXTURE_META = 'st:eth:0x0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798' +
  '02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5';
export const FIXTURE_PAYMENT = Object.freeze({
  paymentId: 'fixture-payment:1', invoiceNonce: '00112233445566778899aabbccddeeff',
  chainId: 11155111, token: '0x0000000000000000000000000000000000000000',
  paidAmount: '1000000', senderAddress: '0x1111111111111111111111111111111111111111',
});
const original = () => ({ ...FIXTURE_PAYMENT, paidAmount: BigInt(FIXTURE_PAYMENT.paidAmount) });

function refundSource(input) {
  keys(input, ['fixture', 'original', 'request']);
  if (input.fixture !== true || json(input.original) !== json(FIXTURE_PAYMENT)) fail();
  keys(input.request, ['idempotencyKey', 'amount', 'destinationMeta']);
  const request = input.request;
  amount(request.amount);
  if (typeof request.idempotencyKey !== 'string' || typeof request.destinationMeta !== 'string') fail();
  return { fixture: true, original: { ...FIXTURE_PAYMENT }, request: { ...request } };
}

function batchSource(input) {
  keys(input, ['fixture', 'csv', 'chainId', 'token', 'decimals']);
  if (input.fixture !== true || typeof input.csv !== 'string' || Buffer.byteLength(input.csv) > 65536 ||
      !Number.isSafeInteger(input.chainId) || input.chainId < 1 ||
      typeof input.token !== 'string' || !/^0x[0-9a-f]{40}$/.test(input.token) ||
      !Number.isSafeInteger(input.decimals) || input.decimals < 0 || input.decimals > 18) fail();
  return { fixture: true, csv: input.csv, chainId: input.chainId, token: input.token, decimals: input.decimals };
}

function makePlan(kind, input) {
  if (kind === 'refund') {
    const source = refundSource(input);
    const result = planRefund(original(), [], { ...source.request, amount: amount(source.request.amount) });
    return { source, plan: JSON.parse(json(result.plan)), id: result.plan.refundId, count: 1 };
  }
  if (kind !== 'batch') fail();
  const source = batchSource(input);
  const preview = previewBatch(source.csv, { ...source, duplicates: 'reject', allowLowercaseAddress: true,
    limits: { minAmount: 1n, perRecipientMax: UINT256, maxRecipients: 100, maxTotal: UINT256 } });
  if (!preview.ok) throw new Error('Invalid batch CSV');
  const plan = confirmBatch(preview, preview.previewHash);
  return { source, plan: JSON.parse(json(plan)), id: plan.planId, count: plan.items.length };
}

function checkRecord(r) {
  keys(r, ['kind', 'id', 'source', 'plan', 'confirmation', 'phase', 'items']);
  const expected = makePlan(r.kind, r.source);
  if (r.id !== expected.id || json(r.plan) !== json(expected.plan) ||
      r.confirmation !== hash({ kind: r.kind, source: expected.source, plan: expected.plan }) ||
      !['planned', 'approved', 'invalidated'].includes(r.phase) ||
      !Array.isArray(r.items) || r.items.length !== expected.count) fail();
  for (const item of r.items) {
    keys(item, ['status', 'reference']);
    if (!['unsubmitted', 'submitted-unknown', 'fixture-confirmed', 'definitively-failed'].includes(item.status)) fail();
    if (item.status === 'unsubmitted') { if (item.reference !== null) fail(); }
    else if (r.phase !== 'approved' || typeof item.reference !== 'string' ||
      !/^fixture-tx:[a-zA-Z0-9._:-]{1,100}$/.test(item.reference)) fail();
  }
  return r;
}

function checkState(records) {
  if (!Array.isArray(records) || records.length > MAX_RECORDS || Buffer.byteLength(json(records)) > MAX_BYTES) fail();
  const ids = new Set();
  const references = new Set();
  let reserved = 0n;
  for (const record of records) {
    checkRecord(record);
    if (ids.has(record.id)) fail();
    ids.add(record.id);
    for (const item of record.items) if (item.reference !== null) {
      if (references.has(item.reference)) fail();
      references.add(item.reference);
    }
    if (record.kind === 'refund' && record.phase !== 'invalidated' &&
        record.items[0].status !== 'definitively-failed') reserved += amount(record.plan.amount);
  }
  if (reserved > original().paidAmount) throw new Error('Refund exceeds remaining fixture payment amount');
  return records;
}

function privatePath(dir) {
  try { mkdirSync(dir, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  const stat = lstatSync(dir);
  if (!stat.isDirectory() || (stat.mode & 0o077) !== 0 || stat.uid !== process.getuid())
    throw new Error('State requires an owned private directory');
  const path = join(dir, 'fixture-operations.sqlite');
  try { closeSync(openSync(path, 'wx', 0o600)); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  const file = lstatSync(path);
  if (!file.isFile() || file.nlink !== 1 || (file.mode & 0o077) !== 0 || file.uid !== process.getuid())
    throw new Error('State requires an owned private regular file');
  return path;
}

/** Qualified on local POSIX filesystems only. Fixture opt-in cannot confer payment authority. */
export class FixtureOperations {
  #db;
  #fault;
  constructor(directory, { fixture = false, fault = () => {} } = {}) {
    if (fixture !== true) throw new Error('Real payment authority adapter unavailable; fixture opt-in required');
    if (typeof process.getuid !== 'function') throw new Error('POSIX private-directory qualification required');
    this.#fault = fault;
    this.#db = new DatabaseSync(privatePath(directory));
    try {
      this.#db.exec('PRAGMA busy_timeout=2000; PRAGMA journal_mode=DELETE; PRAGMA synchronous=EXTRA; PRAGMA trusted_schema=OFF;');
      this.#db.exec('CREATE TABLE IF NOT EXISTS fixture_state (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL CHECK(length(data)<=1048576)) STRICT');
      this.#db.prepare('INSERT OR IGNORE INTO fixture_state VALUES (1, ?)').run('[]');
      this.snapshot();
    } catch (error) { this.#db.close(); throw error; }
  }
  close() { this.#db.close(); }
  #read() {
    const row = this.#db.prepare('SELECT data FROM fixture_state WHERE id=1').get();
    if (!row || typeof row.data !== 'string' || Buffer.byteLength(row.data) > MAX_BYTES) fail();
    return checkState(JSON.parse(row.data));
  }
  #transaction(change) {
    this.#db.exec('BEGIN IMMEDIATE');
    try {
      const records = this.#read();
      const result = change(records);
      checkState(records);
      this.#db.prepare('UPDATE fixture_state SET data=? WHERE id=1').run(json(records));
      this.#fault('before-commit');
      this.#db.exec('COMMIT');
      this.#fault('after-commit');
      return structuredClone(result);
    } catch (error) {
      if (this.#db.isTransaction) this.#db.exec('ROLLBACK');
      throw error;
    }
  }
  snapshot() { return this.#read(); }
  preview(kind, input) {
    const computed = makePlan(kind, input);
    const confirmation = hash({ kind, source: computed.source, plan: computed.plan });
    return this.#transaction((records) => {
      const prior = records.find((r) => r.id === computed.id);
      if (prior) {
        if (prior.confirmation !== confirmation) throw new Error('Changed input for existing operation');
        return prior;
      }
      const record = { kind, id: computed.id, source: computed.source, plan: computed.plan, confirmation,
        phase: 'planned', items: Array.from({ length: computed.count }, () => ({ status: 'unsubmitted', reference: null })) };
      records.push(record);
      return record;
    });
  }
  approve(id, confirmation, currentInput) {
    return this.#transaction((records) => {
      const record = records.find((r) => r.id === id);
      if (!record || record.phase === 'invalidated') fail();
      const current = makePlan(record.kind, currentInput);
      if (current.id !== id || hash({ kind: record.kind, source: current.source, plan: current.plan }) !== confirmation ||
          confirmation !== record.confirmation) throw new Error('Confirmation mismatch');
      record.phase = 'approved';
      return record;
    });
  }
  invalidate(id) {
    return this.#transaction((records) => {
      const r = records.find((record) => record.id === id);
      if (!r || r.items.some((i) => i.status !== 'unsubmitted')) throw new Error('Submitted outcomes remain reserved');
      r.phase = 'invalidated';
      return r;
    });
  }
  submitted(id, confirmation, itemIndex, reference) {
    return this.#transaction((records) => {
      const r = records.find((record) => record.id === id);
      if (!r || r.phase !== 'approved' || confirmation !== r.confirmation || !Number.isSafeInteger(itemIndex)) fail();
      const item = r.items[itemIndex];
      if (!item) fail();
      if (item.status !== 'unsubmitted') {
        if (item.reference !== reference) throw new Error('Submission already recorded');
        return r;
      }
      item.reference = reference;
      item.status = 'submitted-unknown';
      return r;
    });
  }
  reconcileFixture(id, itemIndex, evidence) {
    keys(evidence, ['fixture', 'reference', 'outcome']);
    if (evidence.fixture !== true || !['confirmed', 'definitively-failed', 'unknown'].includes(evidence.outcome))
      throw new Error('Only explicit fixture outcomes accepted; timeout is not failure');
    return this.#transaction((records) => {
      const r = records.find((record) => record.id === id);
      if (!Number.isSafeInteger(itemIndex)) fail();
      const item = r?.items[itemIndex];
      if (!item || item.reference === null || item.reference !== evidence.reference) fail();
      const next = evidence.outcome === 'confirmed' ? 'fixture-confirmed' :
        evidence.outcome === 'unknown' ? 'submitted-unknown' : 'definitively-failed';
      if (item.status !== 'submitted-unknown' && item.status !== next) throw new Error('Terminal outcome cannot change');
      item.status = next;
      return r;
    });
  }
}
