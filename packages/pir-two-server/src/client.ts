import { PirError, requireArg } from './errors.js';
import { assertTestnetChainId } from './guard.js';
import { manifestLeaves, manifestsEqual, parseManifest, verifyPage, type Manifest } from './manifest.js';
import { unpackPage, type UnpackedAnnouncement } from './pages.js';
import { csprng, randomBelow, shuffle, type RandomBytes } from './rand.js';
import { pirQuery, pirReconstruct } from './xor.js';

/** Minimal HTTP transport (bytes in, bytes out). Callers supply a Tor/OHTTP-capable implementation. */
export interface PirHttpTransport {
  request(req: {
    readonly method: 'GET' | 'POST';
    readonly url: string;
    readonly body?: Uint8Array;
    readonly timeoutMs: number;
    readonly maxBytes: number;
    readonly signal?: AbortSignal | undefined;
  }): Promise<{ readonly status: number; readonly body: Uint8Array }>;
}

/** Connection to one PIR server replica. */
export interface PirServerLink {
  /** Origin string used for the same-operator check and nothing else. */
  readonly origin: string;
  getManifest(): Promise<unknown>;
  answer(query: Uint8Array): Promise<Uint8Array>;
}

/** Default minimum dummy-padded fetch count per epoch (NP-P-4). */
export const MIN_PAGES_PER_EPOCH = 4;
const MAX_MANIFEST_BYTES = 64 * 1024 * 1024;

function parseHost(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new PirError('INVALID_ARGUMENT', 'malformed server url');
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new PirError('INVALID_ARGUMENT', 'unsupported url scheme');
  return u.hostname.toLowerCase();
}

/** Heuristic "registrable" key: IPs and single labels as-is, else the last two labels (no public-suffix list). */
function operatorKey(host: string): string {
  if (/^[0-9.]+$/.test(host) || host.includes(':')) return host;
  const labels = host.split('.');
  return labels.slice(-2).join('.');
}

/**
 * Refuses two PIR servers that are the same host or share a registrable domain (heuristic: last two DNS
 * labels, no public-suffix list; an IP is compared whole). NP-P-5.
 *
 * @security A heuristic, NOT a proof of independence: two different domains can still be one operator.
 * @returns `noPrivacy: true` only when `allowSameOperatorNoPrivacy` let a same-operator pair through.
 * @throws PirError `SAME_OPERATOR`.
 */
export function validateServerPair(
  urlA: string,
  urlB: string,
  o: { readonly allowSameOperatorNoPrivacy?: boolean } = {},
): { noPrivacy: boolean } {
  const same = operatorKey(parseHost(urlA)) === operatorKey(parseHost(urlB));
  if (same && o.allowSameOperatorNoPrivacy !== true) {
    throw new PirError('SAME_OPERATOR', 'the two PIR servers must be on different domains');
  }
  return { noPrivacy: same };
}

/** Builds a {@link PirServerLink} over HTTP (`GET /v1/manifest`, `POST /v1/pir`). */
export function createHttpLink(
  baseUrl: string,
  chainId: number,
  transport: PirHttpTransport,
  o: { readonly timeoutMs?: number; readonly signal?: AbortSignal } = {},
): PirServerLink {
  assertTestnetChainId(chainId);
  parseHost(baseUrl);
  const base = baseUrl.replace(/\/+$/, '');
  const timeoutMs = o.timeoutMs ?? 30_000;
  const wrap = async <T>(f: () => Promise<T>): Promise<T> => {
    try {
      return await f();
    } catch (e) {
      if (e instanceof PirError) throw e;
      throw new PirError('TRANSPORT', 'PIR server request failed'); // fixed text: never echo the URL
    }
  };
  return {
    origin: base,
    getManifest: () =>
      wrap(async () => {
        const r = await transport.request({ method: 'GET', url: `${base}/v1/manifest?chainId=${String(chainId)}`, timeoutMs, maxBytes: MAX_MANIFEST_BYTES, signal: o.signal });
        if (r.status !== 200) throw new PirError('TRANSPORT', 'PIR server request failed');
        return JSON.parse(new TextDecoder().decode(r.body)) as unknown;
      }),
    answer: (q) =>
      wrap(async () => {
        const r = await transport.request({ method: 'POST', url: `${base}/v1/pir`, body: q, timeoutMs, maxBytes: 1 << 20, signal: o.signal });
        if (r.status !== 200) throw new PirError('TRANSPORT', 'PIR server request failed');
        return r.body;
      }),
  };
}

/** Pages whose declared block range intersects `[from, to]` (decimal-string ranges from the manifest). */
export function pagesForRange(m: Manifest, from: bigint, to: bigint): number[] {
  const out: number[] = [];
  m.pageRanges.forEach((r, i) => {
    if (r !== null && BigInt(r[0]) <= to && BigInt(r[1]) >= from) out.push(i);
  });
  return out;
}

/** Options for {@link PirClient.open}. */
export interface PirClientOptions {
  readonly chainId: number;
  /** Exactly two links, server A and server B. */
  readonly links: readonly [PirServerLink, PirServerLink];
  /** CSPRNG (default `crypto.getRandomValues`). Tests inject a seeded source. */
  readonly rand?: RandomBytes;
  /** Pages fetched per epoch: real + dummy (NP-P-4), at least 4, default 8. */
  readonly pagesPerEpoch?: number;
  /** Testing only: accept two servers of one operator. The client then reports `noPrivacy`. */
  readonly allowSameOperatorNoPrivacy?: boolean;
  /**
   * Third-source check (NP-P-6): returns the hash of block `toBlock` from a source other than the two PIR
   * servers (e.g. the RPC). Required to trust `headHash`; if omitted the head is NOT cross-checked.
   */
  readonly thirdSourceBlockHash?: (block: bigint) => Promise<string>;
}

/**
 * Two-server PIR client. Holds the agreed, verified manifest and fetches pages privately.
 *
 * @security PIR hides which pages, not that PIR is used, not the IP, and nothing if the servers collude
 * (see `PIR2_CLAIMS`). Answers are accepted only if `sha256(page) == leafHashes[i]`.
 */
export class PirClient {
  /** Manifest both servers agreed on. */
  public readonly manifest: Manifest;
  /** True when the pair was accepted despite being one operator: there is no privacy. */
  public readonly noPrivacy: boolean;
  private readonly links: readonly [PirServerLink, PirServerLink];
  private readonly rand: RandomBytes;
  private readonly w: number;
  private readonly leaves: Uint8Array[];

  private constructor(m: Manifest, o: PirClientOptions, noPrivacy: boolean) {
    this.manifest = m;
    this.links = o.links;
    this.rand = o.rand ?? csprng;
    this.w = o.pagesPerEpoch ?? 8;
    this.noPrivacy = noPrivacy;
    this.leaves = manifestLeaves(m);
  }

  /**
   * Fetches and cross-checks both manifests.
   *
   * @throws PirError `TESTNET_ONLY`, `SAME_OPERATOR`, `MANIFEST_MISMATCH` (servers disagree, wrong chain,
   * head hash differs from the third source), `TRANSPORT`, `INVALID_ARGUMENT`.
   */
  public static async open(o: PirClientOptions): Promise<PirClient> {
    assertTestnetChainId(o.chainId);
    const w = o.pagesPerEpoch ?? 8;
    requireArg(Number.isInteger(w) && w >= MIN_PAGES_PER_EPOCH && w <= 4096, 'pagesPerEpoch out of range');
    const pair = validateServerPair(o.links[0].origin, o.links[1].origin, o.allowSameOperatorNoPrivacy === true ? { allowSameOperatorNoPrivacy: true } : {});
    const [rawA, rawB] = await Promise.all([o.links[0].getManifest(), o.links[1].getManifest()]);
    const a = parseManifest(rawA);
    const b = parseManifest(rawB);
    if (a.chainId !== o.chainId || !manifestsEqual(a, b)) throw new PirError('MANIFEST_MISMATCH', 'servers disagree on the manifest');
    if (o.thirdSourceBlockHash) {
      const third = await o.thirdSourceBlockHash(BigInt(a.toBlock));
      if (a.headHash === null || a.headHash !== third.toLowerCase()) {
        throw new PirError('MANIFEST_MISMATCH', 'manifest head does not match the third source');
      }
    }
    return new PirClient(a, o, pair.noPrivacy);
  }

  /** Pages fetched per epoch. */
  public get pagesPerEpoch(): number {
    return this.w;
  }

  /** One private fetch of page `index` from both servers; verified against the manifest leaf. */
  private async fetchOne(index: number): Promise<Uint8Array> {
    const { qA, qB } = pirQuery(this.manifest.nPages, index, this.rand);
    const [aA, aB] = await Promise.all([this.links[0].answer(qA), this.links[1].answer(qB)]);
    if (aA.length !== this.manifest.pageBytes || aB.length !== this.manifest.pageBytes) {
      throw new PirError('PIR_INTEGRITY', 'answer has wrong size');
    }
    const page = pirReconstruct(aA, aB);
    if (!verifyPage(page, index, this.leaves)) throw new PirError('PIR_INTEGRITY', 'reconstructed page failed verification');
    return page;
  }

  /**
   * Fetches exactly `pagesPerEpoch` pages: the (deduplicated) real indices plus uniformly random dummy
   * indices, in shuffled order (NP-P-4). Every page, real or dummy, is verified.
   *
   * @security Real count must be `< pagesPerEpoch`, otherwise the epoch could not be padded.
   * @throws PirError `TOO_MANY_PAGES`, `INVALID_ARGUMENT`, `PIR_INTEGRITY`, `TRANSPORT`.
   */
  public async fetchPages(real: readonly number[]): Promise<Map<number, Uint8Array>> {
    const wanted = [...new Set(real)];
    for (const i of wanted) requireArg(Number.isInteger(i) && i >= 0 && i < this.manifest.nPages, 'page index out of range');
    if (wanted.length >= this.w) throw new PirError('TOO_MANY_PAGES', 'more real pages than pagesPerEpoch; raise it');
    const slots = [...wanted];
    while (slots.length < this.w) slots.push(randomBelow(this.rand, this.manifest.nPages));
    shuffle(slots, this.rand);
    const got = new Map<number, Uint8Array>();
    for (const idx of slots) {
      const page = await this.fetchOne(idx);
      if (wanted.includes(idx)) got.set(idx, page);
    }
    return got;
  }

  /**
   * Like {@link fetchPages} but decodes each real page and checks its records against the manifest's
   * declared block range for that page.
   *
   * @throws PirError `BAD_PAGE` if a record lies outside the declared range.
   */
  public async fetchRecords(real: readonly number[]): Promise<Map<number, UnpackedAnnouncement[]>> {
    const pages = await this.fetchPages(real);
    const out = new Map<number, UnpackedAnnouncement[]>();
    for (const [i, page] of pages) {
      const recs = unpackPage(page, this.manifest.pageBytes);
      const range = this.manifest.pageRanges[i] ?? null;
      for (const r of recs) {
        if (range === null || r.blockNumber < BigInt(range[0]) || r.blockNumber > BigInt(range[1])) {
          throw new PirError('BAD_PAGE', 'record outside declared page range');
        }
      }
      out.set(i, recs);
    }
    return out;
  }
}
