import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { PirServer, packPages, type Manifest } from '@ghostpay/pir-two-server';
import type { FetchRequest, HeadSource, Head, Hex, HttpTransport, RangeBackend } from './types.js';

/** Fake block hash for tests. */
export const blockHash = (n: bigint): Hex => `0x${bytesToHex(sha256(utf8ToBytes(`fake-block-${n.toString()}`)))}`;
export const ZERO: Hex = `0x${'00'.repeat(32)}`;

const hx = (b: number, len: number): Hex => `0x${b.toString(16).padStart(2, '0').repeat(len)}`;

/** Raw (wire-form) fake announcement. All data fake. */
export function rawAnn(block: number, logIndex: number, metaLen = 1): Record<string, unknown> {
  return {
    schemeId: '1',
    stealthAddress: hx((block + logIndex) & 0xff, 20),
    caller: hx(0xaa, 20),
    ephemeralPublicKey: `0x02${hx(block & 0xff, 32).slice(2)}`,
    metadata: `0x${'ab'.repeat(metaLen)}`,
    blockNumber: String(block),
    blockHash: blockHash(BigInt(block)),
    logIndex,
  };
}

/** Deterministic chain slice: announcements in blocks 0..2999 (about every 47 blocks, plus a double). */
export const CHAIN_HEAD = 2999n;
export const RAW: Record<string, unknown>[] = [
  ...Array.from({ length: 60 }, (_, i) => rawAnn(i * 47 + 3, 0, 20 + (i % 5))),
  rawAnn(1500, 1),
  rawAnn(1500, 2),
];

export const headOf = (n: bigint = CHAIN_HEAD): Head => ({ number: n, hash: blockHash(n) });

export function inRange(from: bigint, to: bigint): Record<string, unknown>[] {
  return RAW.filter((r) => BigInt(r['blockNumber'] as string) >= from && BigInt(r['blockNumber'] as string) <= to);
}

/** Backend recording every call. */
export function fakeBackend(raw: readonly unknown[] = RAW, head: Head = headOf()): RangeBackend & { calls: FetchRequest[] } {
  const calls: FetchRequest[] = [];
  return {
    calls,
    getHead: () => Promise.resolve(head),
    getAnnouncements: (req) => {
      calls.push(req);
      return Promise.resolve(
        raw.filter((r) => {
          if (typeof r !== 'object' || r === null) return true; // hostile junk is passed through untouched
          const raw = (r as Record<string, unknown>)['blockNumber'];
          if (typeof raw !== 'string' || !/^[0-9]+$/.test(raw)) return true;
          const b = BigInt(raw);
          return b >= req.fromBlock && b <= req.toBlock;
        }),
      );
    },
  };
}

export function fakeSecond(head: Head = headOf(), override: (n: bigint) => Hex | undefined = () => undefined): HeadSource {
  return {
    head: () => Promise.resolve(head),
    blockHash: (n) => Promise.resolve(override(n) ?? blockHash(n)),
  };
}

export interface IndexerTamper {
  dropHeaderAt?: bigint;
  breakParentAt?: bigint;
  forkFrom?: bigint; // headers/hashes from this block on are fake (consistent chain)
  truncateTail?: number;
  extraRaw?: unknown[];
  rawBody?: string;
  status?: number;
}

/** Fake indexer transport serving /v1/logs from the fake chain; records requested URLs. */
export function fakeIndexer(tamper: IndexerTamper = {}): HttpTransport & { urls: string[] } {
  const urls: string[] = [];
  return {
    urls,
    request: (r) => {
      urls.push(r.url);
      if (tamper.status !== undefined) return Promise.resolve({ status: tamper.status, body: new Uint8Array(1) });
      if (tamper.rawBody !== undefined) return Promise.resolve({ status: 200, body: new TextEncoder().encode(tamper.rawBody) });
      const u = new URL(r.url);
      const from = BigInt(u.searchParams.get('from') ?? '0');
      let to = BigInt(u.searchParams.get('to') ?? '0');
      if (to > CHAIN_HEAD) to = CHAIN_HEAD;
      const hashOf = (n: bigint): Hex => (tamper.forkFrom !== undefined && n >= tamper.forkFrom ? (`0x${bytesToHex(sha256(utf8ToBytes(`fork-${n.toString()}`)))}`) : blockHash(n));
      let headers = [];
      for (let n = from; n <= to; n++) {
        if (n === tamper.dropHeaderAt) continue;
        headers.push({ number: n.toString(), hash: hashOf(n), parentHash: n === 0n ? ZERO : n === tamper.breakParentAt ? ZERO : hashOf(n - 1n) });
      }
      if (tamper.truncateTail) headers = headers.slice(0, headers.length - tamper.truncateTail);
      const anns = inRange(from, to).map((a) => ({ ...a, blockHash: hashOf(BigInt(a['blockNumber'] as string)) }));
      const body = JSON.stringify({ announcements: [...anns, ...(tamper.extraRaw ?? [])], headers, head: { number: to.toString(), hash: hashOf(to) } });
      return Promise.resolve({ status: 200, body: new TextEncoder().encode(body) });
    },
  };
}

/** In-memory PIR HTTP transport over two PirServer instances keyed by hostname; records requests. */
export function pirTransport(servers: Record<string, PirServer>, log: { url: string; bodyLen: number }[] = []): HttpTransport {
  return {
    request: (r) => {
      const u = new URL(r.url);
      const s = servers[u.hostname];
      log.push({ url: r.url, bodyLen: r.body?.length ?? 0 });
      if (!s) return Promise.resolve({ status: 404, body: new Uint8Array(1) });
      if (r.method === 'GET') return Promise.resolve({ status: 200, body: new TextEncoder().encode(JSON.stringify(s.manifest)) });
      return Promise.resolve({ status: 200, body: s.answer(r.body ?? new Uint8Array(0)) });
    },
  };
}

/** Packs the fake chain into a PIR shard (small pages so several pages exist). */
export function buildShard(chainId = 31337, withHead = true): { pir: PirServer; manifest: Manifest; pages: Uint8Array[] } {
  const anns = RAW.map((r) => ({
    schemeId: 1n,
    stealthAddress: r['stealthAddress'] as string,
    caller: r['caller'] as string,
    ephemeralPublicKey: r['ephemeralPublicKey'] as string,
    metadata: r['metadata'] as string,
    blockNumber: BigInt(r['blockNumber'] as string),
    blockHash: r['blockHash'] as string,
    logIndex: r['logIndex'] as number,
  }));
  const { pages, manifest } = packPages(anns, { chainId, fromBlock: 0n, toBlock: CHAIN_HEAD, ...(withHead ? { headHash: blockHash(CHAIN_HEAD) } : {}) }, 512);
  return { pir: new PirServer(pages, manifest), manifest, pages };
}
