import type { LogStore, StoredAnnouncement, StoredHeader } from './store.js';
import { ENVELOPE_RESERVE_BYTES, WIRE_VERSION, type Hex, type LogsPage, type LogsQuery, type WireAnnouncement, type WireErrorCode, type WireHeader } from './wire.js';

/** Result of {@link buildPage}: the body to serialize, or a wire error. */
export type PageResult = { readonly ok: true; readonly page: LogsPage; readonly body: string } | { readonly ok: false; readonly code: WireErrorCode };

const wireHeader = (h: StoredHeader): WireHeader => ({ number: h.number.toString(), hash: h.hash, parentHash: h.parentHash });
const wireAnn = (a: StoredAnnouncement): WireAnnouncement => ({
  schemeId: a.schemeId.toString(),
  stealthAddress: a.stealthAddress,
  caller: a.caller,
  ephemeralPublicKey: a.ephemeralPublicKey,
  metadata: a.metadata,
  blockNumber: a.blockNumber.toString(),
  blockHash: a.blockHash,
  logIndex: a.logIndex,
  transactionHash: a.transactionHash,
});
const byteLen = (s: string): number => Buffer.byteLength(s, 'utf8');

/**
 * Builds one bounded page of a validated query. Pages end on block boundaries only: a page holds whole blocks, each
 * with every served announcement of that block, and stops before the first block that would exceed `pageSize`
 * records or `maxResponseBytes`. A cut page sets `next` to that block; its headers then stop short of the window, so a
 * client that ignores `next` (the reference client) sees an incomplete header chain and fails closed.
 *
 * Runs synchronously against the store, so ingestion cannot interleave: a page is a consistent snapshot.
 * Before serving, the stored header chain of the page is re-checked (contiguous, parent-linked, announcements on
 * their block's hash); any defect is `STORE_INCONSISTENT`, never a silently shorter answer.
 */
export function buildPage(store: LogStore, q: LogsQuery, o: { readonly announcer: Hex; readonly maxResponseBytes: number }): PageResult {
  const fail = (code: WireErrorCode): PageResult => ({ ok: false, code });
  if (store.halted) return fail('HALTED');
  const tip = store.tip();
  if (tip === undefined) return fail('NOT_READY');
  if (q.from < store.indexedFrom) return fail('BEFORE_INDEXED_RANGE');
  const start = q.cursor ?? q.from;
  if (start > tip.number) return fail('NOT_YET_INDEXED');
  const end = q.to < tip.number ? q.to : tip.number;

  const headers = store.headers(start, end);
  if (headers.length !== Number(end - start) + 1) return fail('STORE_INCONSISTENT');
  const parentOfStart = start > store.indexedFrom ? store.header(start - 1n) : undefined;
  if (start > store.indexedFrom && parentOfStart?.hash !== headers[0]?.parentHash) return fail('STORE_INCONSISTENT');
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i] as StoredHeader;
    const p = headers[i - 1];
    if (h.number !== start + BigInt(i) || (p !== undefined && h.parentHash !== p.hash)) return fail('STORE_INCONSISTENT');
  }

  // One record beyond the cap tells whether the cap cuts the window (rows are ordered, so earlier blocks are whole).
  const rows = store.announcements(start, end, q.pageSize + 1);
  const rowsByBlock = new Map<bigint, StoredAnnouncement[]>();
  for (const a of rows) {
    const list = rowsByBlock.get(a.blockNumber) ?? [];
    list.push(a);
    rowsByBlock.set(a.blockNumber, list);
  }
  const capHit = rows.length > q.pageSize;
  const lastRowBlock = rows[rows.length - 1]?.blockNumber;

  const budget = o.maxResponseBytes - ENVELOPE_RESERVE_BYTES;
  const outHeaders: WireHeader[] = [];
  const outAnns: WireAnnouncement[] = [];
  let bytes = 0;
  let omitted = 0;
  let next: bigint | undefined;
  for (const h of headers) {
    const blockAnns = rowsByBlock.get(h.number) ?? [];
    const partial = capHit && h.number === lastRowBlock; // this block's rows may be incomplete
    const wh = wireHeader(h);
    const was = blockAnns.map(wireAnn);
    let blockBytes = byteLen(JSON.stringify(wh)) + 1;
    for (const a of was) {
      if (a.blockHash !== h.hash) return fail('STORE_INCONSISTENT');
      blockBytes += byteLen(JSON.stringify(a)) + 1;
    }
    if (partial || outAnns.length + was.length > q.pageSize || bytes + blockBytes > budget) {
      if (outHeaders.length === 0) return fail('BLOCK_EXCEEDS_PAGE_LIMIT');
      next = h.number;
      break;
    }
    outHeaders.push(wh);
    outAnns.push(...was);
    bytes += blockBytes;
    omitted += h.omitted;
  }
  const last = outHeaders[outHeaders.length - 1] as WireHeader;
  const page: LogsPage = {
    version: WIRE_VERSION,
    chainId: q.chainId,
    announcer: o.announcer,
    coverage: { fromBlock: start.toString(), toBlock: last.number },
    next: next === undefined ? null : next.toString(),
    head: { number: tip.number.toString(), hash: tip.hash },
    headers: outHeaders,
    announcements: outAnns,
    omitted,
  };
  // The envelope (fixed keys, two short numbers, three hashes) is far below ENVELOPE_RESERVE_BYTES; tests pin the bound.
  return { ok: true, page, body: JSON.stringify(page) };
}
