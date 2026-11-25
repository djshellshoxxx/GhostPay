import type { AddressInfo } from 'node:net';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import type { HeadSource, HttpTransport } from '@ghostpay/scan-source';
import type { RawLog } from './abi.js';
import type { ChainHeader, ChainReader } from './rpc.js';
import { createLogsServer, type ServiceOptions } from './server.js';
import { ANNOUNCEMENT_TOPIC, type Hex } from './wire.js';

/** Test-only announcer address (all data here is synthetic). */
export const ANNOUNCER: Hex = '0x55649e01b5df198d18d95b5cc5051630cfd45564';
export const ZERO32: Hex = `0x${'00'.repeat(32)}`;

const word = (n: number | bigint): string => BigInt(n).toString(16).padStart(64, '0');
const padRight = (hexBody: string): string => hexBody.padEnd(Math.ceil(hexBody.length / 64) * 64, '0');
export const topicOf = (addr: Hex): Hex => `0x${addr.slice(2).padStart(64, '0')}`;

/** `abi.encode(bytes ephemeralPubKey, bytes metadata)` (canonical encoding). */
export function encodeAnnouncementData(pk: Hex, meta: Hex): Hex {
  const a = pk.slice(2);
  const b = meta.slice(2);
  const headA = 64;
  const headB = headA + 32 + padRight(a).length / 2;
  return `0x${word(headA)}${word(headB)}${word(a.length / 2)}${padRight(a)}${word(b.length / 2)}${padRight(b)}`;
}

/** Calldata for `ERC5564Announcer.announce(uint256 schemeId, address stealthAddress, bytes ephemeralPubKey, bytes metadata)`. */
export function encodeAnnounceCall(selector: string, schemeId: bigint, stealth: Hex, pk: Hex, meta: Hex): Hex {
  const tails = encodeAnnouncementData(pk, meta).slice(2 + 128); // both length-prefixed byte strings
  const offA = 4 * 32;
  const offB = offA + 32 + padRight(pk.slice(2)).length / 2;
  return `0x${selector}${word(schemeId)}${stealth.slice(2).padStart(64, '0')}${word(offA)}${word(offB)}${tails}`;
}

/** Synthetic announcement content. */
export interface FakeAnn {
  readonly schemeId?: bigint;
  readonly stealth: Hex;
  readonly caller?: Hex;
  readonly pk?: Hex;
  readonly meta?: Hex;
  /** Raw override for the data field (malformed-log tests). */
  readonly data?: Hex;
}

export const hx = (byte: number, len: number): Hex => `0x${byte.toString(16).padStart(2, '0').repeat(len)}`;
export const fakeAnn = (seed: number, metaLen = 1): FakeAnn => ({ stealth: hx(seed & 0xff, 20), pk: `0x02${hx(seed & 0xff, 32).slice(2)}`, meta: hx(0xab, metaLen) });

/** Builds the raw log of one synthetic announcement. */
export function rawLog(block: ChainHeader, logIndex: number, a: FakeAnn, address: Hex = ANNOUNCER): RawLog {
  return {
    address,
    topics: [ANNOUNCEMENT_TOPIC, `0x${word(a.schemeId ?? 1n)}`, topicOf(a.stealth), topicOf(a.caller ?? hx(0xaa, 20))],
    data: a.data ?? encodeAnnouncementData(a.pk ?? `0x02${'11'.repeat(32)}`, a.meta ?? '0xab'),
    blockNumber: block.number,
    blockHash: block.hash,
    logIndex,
    transactionHash: `0x${bytesToHex(sha256(utf8ToBytes(`tx-${block.hash}-${String(logIndex)}`)))}`,
    removed: false,
  };
}

interface FakeBlock extends ChainHeader {
  readonly logs: RawLog[];
}

/**
 * In-memory chain implementing {@link ChainReader}. Block hashes depend on the parent hash and a fork salt, so a fork
 * produces different hashes at the same heights. Hooks let tests mutate the chain in the middle of a read.
 */
export class FakeChain implements ChainReader {
  public readonly blocks: FakeBlock[] = [];
  public readonly calls: string[] = [];
  public onHeader: ((n: bigint) => void) | undefined;
  public logFilter: ((logs: RawLog[]) => RawLog[]) | undefined;

  public constructor(public readonly id = 31337, genesisSalt = 'g') {
    this.push(genesisSalt, []);
  }

  private push(salt: string, anns: readonly FakeAnn[]): void {
    const parent = this.blocks[this.blocks.length - 1];
    const number = BigInt(this.blocks.length);
    const parentHash = parent?.hash ?? ZERO32;
    const hash: Hex = `0x${bytesToHex(sha256(utf8ToBytes(`${parentHash}|${number.toString()}|${salt}`)))}`;
    const header = { number, hash, parentHash };
    this.blocks.push({ ...header, logs: anns.map((a, i) => rawLog(header, i, a)) });
  }

  /** Mines `count` blocks; `anns(n)` gives the announcements of block `n`. */
  public mine(count: number, anns: (n: bigint) => readonly FakeAnn[] = () => [], salt = 'm'): void {
    for (let i = 0; i < count; i++) this.push(salt, anns(BigInt(this.blocks.length)));
  }

  /** Replaces the last `depth` blocks with `replacement` new blocks on a different fork. */
  public reorg(depth: number, replacement: number, anns: (n: bigint) => readonly FakeAnn[] = () => [], salt = 'fork'): void {
    this.blocks.length -= depth;
    this.mine(replacement, anns, salt);
  }

  public get head(): ChainHeader {
    const b = this.blocks[this.blocks.length - 1] as FakeBlock;
    return { number: b.number, hash: b.hash, parentHash: b.parentHash };
  }

  public chainId(): Promise<number> {
    this.calls.push('chainId');
    return Promise.resolve(this.id);
  }

  public blockNumber(): Promise<bigint> {
    this.calls.push('blockNumber');
    return Promise.resolve(this.head.number);
  }

  public header(n: bigint): Promise<ChainHeader | undefined> {
    this.calls.push(`header:${n.toString()}`);
    this.onHeader?.(n);
    const b = this.blocks[Number(n)];
    return Promise.resolve(b === undefined ? undefined : { number: b.number, hash: b.hash, parentHash: b.parentHash });
  }

  public announcerLogs(from: bigint, to: bigint, announcer: Hex): Promise<RawLog[]> {
    this.calls.push(`logs:${from.toString()}-${to.toString()}`);
    const out = this.blocks.filter((b) => b.number >= from && b.number <= to).flatMap((b) => b.logs.filter((l) => l.address === announcer));
    return Promise.resolve(this.logFilter ? this.logFilter(out) : out);
  }

  /** The chain as the client's independent second source (its own RPC). */
  public headSource(): HeadSource {
    return {
      head: () => Promise.resolve({ number: this.head.number, hash: this.head.hash }),
      blockHash: (n) => {
        const b = this.blocks[Number(n)];
        return b === undefined ? Promise.reject(new Error('no block')) : Promise.resolve(b.hash);
      },
    };
  }
}

/** scan-source `HttpTransport` over the global fetch, honoring `maxBytes`. */
export function fetchTransport(log: string[] = [], rewrite?: (body: Record<string, unknown>) => void): HttpTransport {
  return {
    async request(r) {
      log.push(r.url);
      const res = await fetch(r.url, { method: r.method, ...(r.signal ? { signal: r.signal } : {}) });
      let body = new Uint8Array(await res.arrayBuffer());
      if (body.byteLength > r.maxBytes) throw new Error('too large');
      if (rewrite !== undefined && res.status === 200) {
        const doc = JSON.parse(new TextDecoder().decode(body)) as Record<string, unknown>;
        rewrite(doc);
        body = new TextEncoder().encode(JSON.stringify(doc));
      }
      return { status: res.status, body };
    },
  };
}

/** Starts the service on an ephemeral loopback port. */
export async function serve(o: ServiceOptions): Promise<{ url: string; close(): Promise<void>; counters: ReturnType<typeof createLogsServer>['counters'] }> {
  const { server, counters } = createLogsServer(o);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${String(port)}`,
    counters,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

/** GET helper returning status, headers and parsed JSON (or text). */
export async function get(url: string, init: RequestInit = {}): Promise<{ status: number; headers: Headers; json: Record<string, unknown>; text: string }> {
  const res = await fetch(url, init);
  const text = await res.text();
  const json = ((): Record<string, unknown> => {
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return {};
    }
  })();
  return { status: res.status, headers: res.headers, json, text };
}
