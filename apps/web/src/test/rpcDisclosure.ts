/**
 * TEST-ONLY RPC disclosure instrumentation (PRIV-T02). Never imported by app code and never bundled.
 *
 * It wraps the EXISTING transport boundaries (chain-adapters `RpcTransport`, the `RpcClient` surface, and scan-source
 * `HttpTransport`) and records, for every observable request, SANITIZED metadata only: method, endpoint role, sequence,
 * relative timing, parameter CLASSES and booleans. It never stores a request body, an address, a transaction hash, a
 * topic or a block number. Raw values are compared in memory against the scenario's synthetic sets and then dropped.
 *
 * It does not change a request. It is not a second RPC client and adds no telemetry: records live in the test process.
 *
 * Scope of what the records show: what an endpoint operator OBSERVES (parameter classes, sizes, order, timing). Whether
 * an observer can INFER something from that is analysed separately and labelled as inference by the callers.
 */
import type { LogFilter, RpcClient, RpcTransport } from '@ghostpay/chain-adapters';

/** A request may belong to several classes. `unknown` is never silently dropped: unrecognised shapes are reported. */
export type RpcDisclosureClass =
  | 'public-chain-metadata'
  | 'public-block-range'
  | 'contract-specific'
  | 'address-specific'
  | 'transaction-specific'
  | 'recipient-specific'
  | 'payment-specific'
  | 'unknown';

export const ALL_DISCLOSURE_CLASSES: readonly RpcDisclosureClass[] = Object.freeze([
  'public-chain-metadata',
  'public-block-range',
  'contract-specific',
  'address-specific',
  'transaction-specific',
  'recipient-specific',
  'payment-specific',
  'unknown',
]);

/** Where in the stack the request was observed. A scenario should instrument ONE layer per endpoint (no double counting). */
export type DisclosureLayer = 'transport' | 'client' | 'http';

export type DisclosureOutcome = 'ok' | 'error';

/** One sanitized observation. Contains no raw parameter value. */
export interface RpcDisclosureRecord {
  readonly scenario: string;
  readonly seq: number;
  /** Milliseconds since the recorder was created, from the injected clock. */
  readonly relMs: number;
  readonly layer: DisclosureLayer;
  /** Free-form role such as `primary`, `secondary`, `indexer`, `second-source`. */
  readonly role: string;
  readonly method: string;
  /** 0 for the first send of a request id, >0 for a retry of the same JSON-RPC id (transport layer only). */
  readonly attempt: number;
  readonly classes: readonly RpcDisclosureClass[];
  /** Inclusive block span of a range request, otherwise null. Sizes are public; absolute positions are not stored. */
  readonly blockRangeSize: number | null;
  readonly hasAddress: boolean;
  readonly hasTransactionHash: boolean;
  readonly hasEventTopic: boolean;
  readonly hasTokenIdentifier: boolean;
  readonly hasRecipientFilter: boolean;
  /** References an address or transaction hash that the scenario marked as part of a matched payment. */
  readonly relatedToMatchedPayment: boolean;
  /** An address or hash in this request already appeared in an earlier response of this recorder. */
  readonly followsResponse: boolean;
  /** A block bound is not grid-aligned (or no grid is known), so the position of the scan can be read off the request. */
  readonly revealsScanProgress: boolean;
  readonly outcome: DisclosureOutcome;
}

/** Synthetic values the classifier compares against. Held in memory only; never copied into a record. */
export interface DisclosureContext {
  /** Protocol contracts that are the same for every user (announcer, router, registry). Lowercase or any case. */
  readonly publicContracts: readonly string[];
  /** Token contracts. A request naming one sets `hasTokenIdentifier`. */
  readonly tokenContracts: readonly string[];
  /** Synthetic seller/stealth addresses that identify the scanning user. */
  readonly sensitiveAddresses: readonly string[];
  /** Event topic hashes (announcement, transfer). Topic 0 equal to one of these sets `hasEventTopic`. */
  readonly eventTopics: readonly string[];
  /** Window grid. Block bounds aligned to it do not reveal progress. Undefined means every explicit bound reveals. */
  readonly gridBlocks?: number;
}

const HEX_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HEX_WORD = /^0x[0-9a-fA-F]{64}$/;
const HEX_ANY = /^0x(?:[0-9a-fA-F]{2})*$/;
const QUANTITY = /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/;
const BLOCK_TAGS = new Set(['latest', 'earliest', 'pending', 'safe', 'finalized']);

const lower = (s: string): string => s.toLowerCase();

/** Methods the classifier understands. Everything else is `unknown`. */
const KNOWN_METHODS = new Set([
  'eth_chainId',
  'eth_blockNumber',
  'eth_getBlockByNumber',
  'eth_getLogs',
  'eth_getBalance',
  'eth_getTransactionCount',
  'eth_getCode',
  'eth_call',
  'eth_getTransactionReceipt',
  'eth_getTransactionByHash',
]);

const METADATA_ONLY = new Set(['eth_chainId', 'eth_blockNumber']);

function toBigInt(v: unknown): bigint | undefined {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0) return BigInt(v);
  if (typeof v === 'string' && QUANTITY.test(v)) return BigInt(v);
  if (typeof v === 'string' && /^(?:0|[1-9][0-9]{0,30})$/.test(v)) return BigInt(v);
  return undefined;
}

/** Mutable, in-memory scenario state. Nothing here is serialised. */
export class DisclosureState {
  private readonly publicContracts: Set<string>;
  private readonly tokens: Set<string>;
  private readonly sensitive: Set<string>;
  private readonly topics: Set<string>;
  private readonly matchedAddresses = new Set<string>();
  private readonly matchedHashes = new Set<string>();
  private readonly seen = new Set<string>();
  public headBlock: bigint | undefined;
  public readonly gridBlocks: number | undefined;

  public constructor(ctx: DisclosureContext) {
    this.publicContracts = new Set(ctx.publicContracts.map(lower));
    this.tokens = new Set(ctx.tokenContracts.map(lower));
    this.sensitive = new Set(ctx.sensitiveAddresses.map(lower));
    this.topics = new Set(ctx.eventTopics.map(lower));
    this.gridBlocks = ctx.gridBlocks;
  }

  /** Marks addresses and transaction hashes as belonging to a matched payment. Later requests naming them are payment-specific. */
  public markMatched(o: { readonly addresses?: readonly string[]; readonly transactionHashes?: readonly string[] }): void {
    for (const a of o.addresses ?? []) this.matchedAddresses.add(lower(a));
    for (const h of o.transactionHashes ?? []) this.matchedHashes.add(lower(h));
  }

  /** Remembers identifiers in a response so a later request that reuses one is flagged `followsResponse`. */
  public observeResponse(text: string): void {
    for (const m of text.matchAll(/0x[0-9a-fA-F]{40}(?:[0-9a-fA-F]{24})?/g)) this.seen.add(lower(m[0]));
    for (const m of text.matchAll(/0x[0-9a-fA-F]{64}/g)) {
      const w = lower(m[0]);
      this.seen.add(w);
      if (w.startsWith('0x000000000000000000000000')) this.seen.add(`0x${w.slice(26)}`);
    }
  }

  public isPublicContract(a: string): boolean {
    return this.publicContracts.has(lower(a));
  }
  public isToken(a: string): boolean {
    return this.tokens.has(lower(a));
  }
  public isSensitive(a: string): boolean {
    return this.sensitive.has(lower(a));
  }
  public isMatchedAddress(a: string): boolean {
    return this.matchedAddresses.has(lower(a));
  }
  public isMatchedHash(h: string): boolean {
    return this.matchedHashes.has(lower(h));
  }
  public isHead(n: bigint): boolean {
    return this.headBlock !== undefined && n === this.headBlock;
  }
  public isEventTopic(t: string): boolean {
    return this.topics.has(lower(t));
  }
  public wasSeen(v: string): boolean {
    return this.seen.has(lower(v));
  }

  /** Whether a block bound reveals scan progress: not on the grid, and (for an upper bound only) not the public head. */
  public revealsPosition(n: bigint, kind: 'lower' | 'upper'): boolean {
    if (kind === 'upper' && this.headBlock !== undefined && n === this.headBlock) return false;
    const g = this.gridBlocks;
    if (g === undefined || g <= 0) return true;
    const edge = kind === 'lower' ? n : n + 1n;
    return edge % BigInt(g) !== 0n;
  }

  /** Drops everything remembered. Called by recorders on `dispose()`. */
  public clear(): void {
    this.matchedAddresses.clear();
    this.matchedHashes.clear();
    this.seen.clear();
  }
}

/** Result of classifying one request, before it is stamped with scenario and timing. */
export interface Classification {
  readonly classes: readonly RpcDisclosureClass[];
  readonly blockRangeSize: number | null;
  readonly hasAddress: boolean;
  readonly hasTransactionHash: boolean;
  readonly hasEventTopic: boolean;
  readonly hasTokenIdentifier: boolean;
  readonly hasRecipientFilter: boolean;
  readonly relatedToMatchedPayment: boolean;
  readonly followsResponse: boolean;
  readonly revealsScanProgress: boolean;
}

interface Acc {
  classes: Set<RpcDisclosureClass>;
  blockRangeSize: number | null;
  hasAddress: boolean;
  hasTransactionHash: boolean;
  hasEventTopic: boolean;
  hasTokenIdentifier: boolean;
  hasRecipientFilter: boolean;
  matched: boolean;
  follows: boolean;
  progress: boolean;
}

function newAcc(): Acc {
  return {
    classes: new Set(),
    blockRangeSize: null,
    hasAddress: false,
    hasTransactionHash: false,
    hasEventTopic: false,
    hasTokenIdentifier: false,
    hasRecipientFilter: false,
    matched: false,
    follows: false,
    progress: false,
  };
}

/** Records an address-shaped value seen anywhere in a request. `embedded` = inside a padded word or calldata. */
function noteAddress(s: DisclosureState, a: Acc, addr: string): void {
  a.hasAddress = true;
  if (s.wasSeen(addr)) a.follows = true;
  if (s.isToken(addr)) a.hasTokenIdentifier = true;
  if (s.isMatchedAddress(addr)) {
    a.matched = true;
    a.classes.add('payment-specific');
    a.classes.add('recipient-specific');
  } else if (s.isSensitive(addr)) {
    a.classes.add('recipient-specific');
  } else if (s.isPublicContract(addr) || s.isToken(addr)) {
    a.classes.add('contract-specific');
  } else {
    a.classes.add('address-specific');
  }
}

function noteHash(s: DisclosureState, a: Acc, h: string): void {
  a.hasTransactionHash = true;
  a.classes.add('transaction-specific');
  if (s.wasSeen(h)) a.follows = true;
  if (s.isMatchedHash(h)) {
    a.matched = true;
    a.classes.add('payment-specific');
  }
}

/** Scans calldata (4-byte selector + 32-byte words) for padded addresses. Returns false if the shape is not recognisable. */
function scanCalldata(s: DisclosureState, a: Acc, data: string): boolean {
  if (!HEX_ANY.test(data) || data.length < 10 || (data.length - 10) % 64 !== 0) return false;
  const body = data.slice(10);
  for (let i = 0; i + 64 <= body.length; i += 64) {
    const word = `0x${body.slice(i, i + 64)}`;
    if (word.slice(2, 26) === '0'.repeat(24) && word.slice(26) !== '0'.repeat(40)) noteAddress(s, a, `0x${word.slice(26)}`);
  }
  return true;
}

/** Block parameter of a state read: a named tag or a numeric height. Anything else is not a shape we know. */
function validBlockParam(p: unknown): boolean {
  return typeof p === 'string' && BLOCK_TAGS.has(p) ? true : toBigInt(p) !== undefined;
}

function classifyLogsFilter(s: DisclosureState, a: Acc, f: unknown): boolean {
  if (typeof f !== 'object' || f === null || Array.isArray(f)) return false;
  const o = f as Record<string, unknown>;
  const allowed = new Set(['address', 'topics', 'fromBlock', 'toBlock']);
  for (const k of Object.keys(o)) if (!allowed.has(k)) return false;
  a.classes.add('public-block-range');
  const from = toBigInt(o['fromBlock']);
  const to = toBigInt(o['toBlock']);
  if (from === undefined || to === undefined || to < from) {
    // tags or malformed bounds: a range we cannot size is reported, not assumed harmless
    if (!(typeof o['fromBlock'] === 'string' && BLOCK_TAGS.has(o['fromBlock']) && typeof o['toBlock'] === 'string' && BLOCK_TAGS.has(o['toBlock']))) return false;
  } else {
    a.blockRangeSize = Number(to - from + 1n);
    if (s.revealsPosition(from, 'lower') || s.revealsPosition(to, 'upper')) a.progress = true;
  }
  const addr = o['address'];
  if (typeof addr === 'string') {
    if (!HEX_ADDRESS.test(addr)) return false;
    noteAddress(s, a, addr);
  } else if (addr !== undefined) {
    return false;
  }
  const topics = o['topics'];
  if (topics !== undefined) {
    if (!Array.isArray(topics)) return false;
    for (let i = 0; i < topics.length; i++) {
      const t: unknown = topics[i];
      if (t === null || t === undefined) continue;
      if (typeof t !== 'string' || !HEX_WORD.test(t)) return false;
      if (i === 0) {
        if (s.isEventTopic(t)) a.hasEventTopic = true;
        else return false;
        continue;
      }
      const small = BigInt(t) < 2n ** 64n;
      if (small) continue; // scheme id style small integer: same for every user
      const tail = `0x${t.slice(26)}`;
      if (t.slice(2, 26) === '0'.repeat(24)) {
        const publicTopic = s.isPublicContract(tail) || s.isToken(tail);
        if (!publicTopic) a.hasRecipientFilter = true;
        noteAddress(s, a, tail);
      } else {
        a.hasRecipientFilter = true;
        a.classes.add('unknown');
      }
    }
  }
  return true;
}

/** Classifies one JSON-RPC request. Pure with respect to its inputs; reads the scenario state, never stores raw values. */
export function classifyRequest(method: string, params: readonly unknown[], s: DisclosureState): Classification {
  const a = newAcc();
  let recognised = KNOWN_METHODS.has(method);
  if (recognised) {
    if (METADATA_ONLY.has(method)) {
      a.classes.add('public-chain-metadata');
      recognised = params.length === 0;
    } else if (method === 'eth_getBlockByNumber') {
      a.classes.add('public-chain-metadata');
      const n = params[0];
      recognised = params.length === 2 && typeof params[1] === 'boolean' && (typeof n === 'string' && BLOCK_TAGS.has(n) ? true : toBigInt(n) !== undefined);
      if (recognised && !(typeof n === 'string' && BLOCK_TAGS.has(n))) {
        // an exact read at any height other than the head tells the provider where the scan is, grid-aligned or not
        const v = toBigInt(n) as bigint;
        if (!s.isHead(v)) a.progress = true;
      }
    } else if (method === 'eth_getLogs') {
      recognised = params.length === 1 && classifyLogsFilter(s, a, params[0]);
    } else if (method === 'eth_getBalance' || method === 'eth_getTransactionCount' || method === 'eth_getCode') {
      const addr = params[0];
      recognised = params.length === 2 && typeof addr === 'string' && HEX_ADDRESS.test(addr) && validBlockParam(params[1]);
      if (recognised) noteAddress(s, a, addr as string);
    } else if (method === 'eth_call') {
      const c = params[0];
      recognised = params.length === 2 && typeof c === 'object' && c !== null && !Array.isArray(c) && validBlockParam(params[1]);
      if (recognised) {
        const o = c as Record<string, unknown>;
        for (const k of Object.keys(o)) if (!['to', 'data', 'input', 'from'].includes(k)) recognised = false;
        for (const k of ['to', 'from'] as const) {
          const v = o[k];
          if (typeof v === 'string') {
            if (HEX_ADDRESS.test(v)) noteAddress(s, a, v);
            else recognised = false;
          }
        }
        for (const k of ['data', 'input'] as const) {
          const v = o[k];
          if (typeof v === 'string' && !scanCalldata(s, a, v)) recognised = false;
        }
      }
    } else if (method === 'eth_getTransactionReceipt' || method === 'eth_getTransactionByHash') {
      const h = params[0];
      recognised = params.length === 1 && typeof h === 'string' && HEX_WORD.test(h);
      if (recognised) noteHash(s, a, h as string);
    }
  }
  if (!recognised) a.classes.add('unknown');
  if (a.classes.size === 0) a.classes.add('unknown');
  return {
    classes: ALL_DISCLOSURE_CLASSES.filter((c) => a.classes.has(c)),
    blockRangeSize: a.blockRangeSize,
    hasAddress: a.hasAddress,
    hasTransactionHash: a.hasTransactionHash,
    hasEventTopic: a.hasEventTopic,
    hasTokenIdentifier: a.hasTokenIdentifier,
    hasRecipientFilter: a.hasRecipientFilter,
    relatedToMatchedPayment: a.matched,
    followsResponse: a.follows,
    revealsScanProgress: a.progress,
  };
}

/** Collects sanitized records for one scenario. */
export class DisclosureRecorder {
  public readonly state: DisclosureState;
  private readonly rows: RpcDisclosureRecord[] = [];
  private readonly started: number;
  private readonly attempts = new Map<string, number>();

  public constructor(
    public readonly scenario: string,
    ctx: DisclosureContext,
    private readonly now: () => number = () => performance.now(),
  ) {
    this.state = new DisclosureState(ctx);
    this.started = now();
  }

  public get records(): readonly RpcDisclosureRecord[] {
    return this.rows;
  }

  /** Attempt counter keyed by role + JSON-RPC id (transport layer): the same id again is a retry. */
  public nextAttempt(role: string, id: unknown): number {
    const k = `${role}#${typeof id === 'number' || typeof id === 'string' ? String(id) : 'noid'}`;
    const n = this.attempts.get(k) ?? 0;
    this.attempts.set(k, n + 1);
    return n;
  }

  /** Appends a record and returns a function that finalises its outcome (records are immutable once pushed). */
  public begin(
    layer: DisclosureLayer,
    role: string,
    method: string,
    params: readonly unknown[],
    attempt = 0,
    override?: Partial<Classification>,
  ): (outcome: DisclosureOutcome, responseText?: string) => void {
    const c: Classification = { ...classifyRequest(method, params, this.state), ...override };
    const index = this.rows.length;
    const base = { scenario: this.scenario, seq: index, relMs: Math.round(this.now() - this.started), layer, role, method, attempt, ...c };
    this.rows.push({ ...base, outcome: 'error' });
    return (outcome, responseText) => {
      this.rows[index] = { ...base, outcome };
      if (responseText !== undefined) this.state.observeResponse(responseText);
    };
  }

  /** Records a request whose structure could not be read (batch, non-JSON). Always `unknown`. */
  public beginUnreadable(layer: DisclosureLayer, role: string, label: string): (outcome: DisclosureOutcome, responseText?: string) => void {
    const index = this.rows.length;
    const base: Omit<RpcDisclosureRecord, 'outcome'> = {
      scenario: this.scenario, seq: index, relMs: Math.round(this.now() - this.started), layer, role, method: label, attempt: 0,
      classes: ['unknown'], blockRangeSize: null, hasAddress: false, hasTransactionHash: false, hasEventTopic: false, hasTokenIdentifier: false,
      hasRecipientFilter: false, relatedToMatchedPayment: false, followsResponse: false, revealsScanProgress: true,
    };
    this.rows.push({ ...base, outcome: 'error' });
    return (outcome, responseText) => {
      this.rows[index] = { ...base, outcome };
      if (responseText !== undefined) this.state.observeResponse(responseText);
    };
  }

  /** Forgets the in-memory comparison sets. Records are kept. */
  public dispose(): void {
    this.state.clear();
  }
}

/** Wraps a chain-adapters `RpcTransport`: sees every wire request, including retries and chain-id re-checks. */
export function instrumentRpcTransport(inner: RpcTransport, rec: DisclosureRecorder, role: string): RpcTransport {
  return {
    async send(url, body, init) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        parsed = undefined;
      }
      const o = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined;
      const done =
        o !== undefined && typeof o['method'] === 'string' && Array.isArray(o['params'])
          ? rec.begin('transport', role, o['method'], o['params'] as unknown[], rec.nextAttempt(role, o['id']))
          : rec.beginUnreadable('transport', role, Array.isArray(parsed) ? 'batch' : 'unreadable');
      try {
        const text = await inner.send(url, body, init);
        done('ok', text);
        return text;
      } catch (e) {
        done('error');
        throw e;
      }
    },
  };
}

function filterParams(f: LogFilter): unknown[] {
  return [{ address: f.address, topics: f.topics, fromBlock: f.fromBlock, toBlock: f.toBlock }];
}

/**
 * Wraps an `RpcClient` (for mock clients that bypass the transport). Each typed method is recorded as the wire method it
 * implies. Instrument either this layer OR the transport for one endpoint, not both.
 */
export function instrumentRpcClient<T extends RpcClient>(inner: T, rec: DisclosureRecorder, role: string): T {
  const run = async <R>(method: string, params: readonly unknown[], f: () => Promise<R>, text: (r: R) => string): Promise<R> => {
    const done = rec.begin('client', role, method, params);
    try {
      const r = await f();
      done('ok', text(r));
      return r;
    } catch (e) {
      done('error');
      throw e;
    }
  };
  const stringify = (v: unknown): string => JSON.stringify(v, (_k, x: unknown) => (typeof x === 'bigint' ? `0x${x.toString(16)}` : x)) ?? '';
  return {
    ...inner,
    request: (method: string, params: readonly unknown[]) => run(method, params, () => inner.request(method, params), stringify),
    blockNumber: () => run('eth_blockNumber', [], () => inner.blockNumber(), stringify),
    getBlock: (n: bigint) => run('eth_getBlockByNumber', [n, false], () => inner.getBlock(n), stringify),
    getLogs: (f: LogFilter) => run('eth_getLogs', filterParams(f), () => inner.getLogs(f), stringify),
  };
}

/** Minimal shape of scan-source's `HttpTransport` (kept structural so this file has no extra dependency). */
export interface HttpTransportLike {
  request(req: {
    readonly method: 'GET' | 'POST';
    readonly url: string;
    readonly body?: Uint8Array;
    readonly timeoutMs: number;
    readonly maxBytes: number;
    readonly signal?: AbortSignal | undefined;
  }): Promise<{ readonly status: number; readonly body: Uint8Array }>;
}

/** Wraps an indexer HTTP transport. Only the path shape and numeric range query are read; the URL itself is not stored. */
export function instrumentHttpTransport<T extends HttpTransportLike>(inner: T, rec: DisclosureRecorder, role: string): HttpTransportLike {
  return {
    async request(req) {
      let method = 'HTTP unreadable';
      let done: ((o: DisclosureOutcome, text?: string) => void) | undefined;
      try {
        const u = new URL(req.url);
        const known = req.method === 'GET' && u.pathname === '/v1/logs' && req.body === undefined;
        const keys = [...u.searchParams.keys()].sort().join(',');
        const dec = (k: string): bigint | undefined => {
          const v = u.searchParams.get(k);
          return v !== null && /^\d{1,18}$/.test(v) ? BigInt(v) : undefined;
        };
        const from = dec('from');
        const to = dec('to');
        const decimalRest = dec('chainId') !== undefined && dec('pageSize') !== undefined;
        if (known && decimalRest && keys === 'chainId,from,pageSize,to' && from !== undefined && to !== undefined && to >= from) {
          method = 'HTTP GET /v1/logs';
          done = rec.begin('http', role, method, [], 0, {
            classes: ['public-block-range'],
            blockRangeSize: Number(to - from + 1n),
            revealsScanProgress: rec.state.revealsPosition(from, 'lower') || rec.state.revealsPosition(to, 'upper'),
          });
        }
      } catch {
        /* unreadable URL: reported below as unknown */
      }
      done ??= rec.beginUnreadable('http', role, method);
      try {
        const r = await inner.request(req);
        done(r.status === 200 ? 'ok' : 'error');
        return r;
      } catch (e) {
        done('error');
        throw e;
      }
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Fake wire for scenarios

/** Thrown by a scenario handler to make the fake wire fail like a node would. */
export class WireFault extends Error {
  public constructor(public readonly kind: 'http' | 'transport', public readonly status = 503) {
    super('wire-fault');
  }
}

/** A transport answered by a handler `(method, params) => result`. Params arrive as the real client serialised them (hex quantities). */
export function handlerTransport(
  handler: (method: string, params: readonly unknown[]) => unknown,
  fail: (e: WireFault) => Error,
): RpcTransport {
  return {
    send(_url, body) {
      const req = JSON.parse(body) as { id: number; method: string; params: unknown[] };
      try {
        return Promise.resolve(JSON.stringify({ jsonrpc: '2.0', id: req.id, result: handler(req.method, req.params) }));
      } catch (e) {
        if (e instanceof WireFault) return Promise.reject(fail(e));
        return Promise.reject(e instanceof Error ? e : new Error('handler failure'));
      }
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Metrics and reports

export interface DisclosureSummary {
  readonly scenario: string;
  readonly totalCalls: number;
  readonly byMethod: Readonly<Record<string, number>>;
  readonly byRole: Readonly<Record<string, number>>;
  readonly addressSpecific: number;
  readonly transactionSpecific: number;
  readonly recipientSpecific: number;
  readonly matchDependent: number;
  readonly retryDependent: number;
  readonly unknown: number;
  readonly revealingProgress: number;
  readonly followingResponse: number;
  readonly failed: number;
  /** Per role, the set of parameter classes that role observed. Provider-specific disclosure. */
  readonly classesByRole: Readonly<Record<string, readonly RpcDisclosureClass[]>>;
}

const bump = (m: Record<string, number>, k: string): void => {
  m[k] = (m[k] ?? 0) + 1;
};

export function summarize(scenario: string, rows: readonly RpcDisclosureRecord[]): DisclosureSummary {
  const byMethod: Record<string, number> = {};
  const byRole: Record<string, number> = {};
  const roleClasses = new Map<string, Set<RpcDisclosureClass>>();
  for (const r of rows) {
    bump(byMethod, r.method);
    bump(byRole, r.role);
    const set = roleClasses.get(r.role) ?? new Set<RpcDisclosureClass>();
    for (const c of r.classes) set.add(c);
    roleClasses.set(r.role, set);
  }
  const has = (r: RpcDisclosureRecord, c: RpcDisclosureClass): boolean => r.classes.includes(c);
  return {
    scenario,
    totalCalls: rows.length,
    byMethod,
    byRole,
    addressSpecific: rows.filter((r) => has(r, 'address-specific')).length,
    transactionSpecific: rows.filter((r) => has(r, 'transaction-specific')).length,
    recipientSpecific: rows.filter((r) => has(r, 'recipient-specific')).length,
    matchDependent: rows.filter((r) => r.relatedToMatchedPayment).length,
    retryDependent: rows.filter((r) => r.attempt > 0).length,
    unknown: rows.filter((r) => has(r, 'unknown')).length,
    revealingProgress: rows.filter((r) => r.revealsScanProgress).length,
    followingResponse: rows.filter((r) => r.followsResponse).length,
    failed: rows.filter((r) => r.outcome === 'error').length,
    classesByRole: Object.fromEntries([...roleClasses].map(([k, v]) => [k, ALL_DISCLOSURE_CLASSES.filter((c) => v.has(c))])),
  };
}

/** Order-independent shape of a request: used to compare scenarios without comparing sequence or timing. */
export function signature(r: RpcDisclosureRecord): string {
  return [r.role, r.method, r.classes.join('+'), r.blockRangeSize ?? '-', r.hasAddress ? 'A' : '', r.hasTransactionHash ? 'T' : '', r.hasRecipientFilter ? 'R' : '', r.hasTokenIdentifier ? 'K' : ''].join('|');
}

function countSignatures(rows: readonly RpcDisclosureRecord[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) m.set(signature(r), (m.get(signature(r)) ?? 0) + 1);
  return m;
}

/** Signatures (with counts) present in `other` beyond what `base` has. Empty when the two are indistinguishable by shape. */
export function addedSignatures(base: readonly RpcDisclosureRecord[], other: readonly RpcDisclosureRecord[]): Map<string, number> {
  const b = countSignatures(base);
  const out = new Map<string, number>();
  for (const [k, n] of countSignatures(other)) {
    const extra = n - (b.get(k) ?? 0);
    if (extra > 0) out.set(k, extra);
  }
  return out;
}

/** True if the request shape multiset is identical, ignoring sequence and timing. */
export function sameShape(a: readonly RpcDisclosureRecord[], b: readonly RpcDisclosureRecord[]): boolean {
  return addedSignatures(a, b).size === 0 && addedSignatures(b, a).size === 0;
}

/**
 * Throws if a serialised artifact contains any of `forbidden` raw values (case-insensitive) or ANY 20-byte or 32-byte hex
 * literal. Records and reports must contain classes and counts only.
 */
export function assertSanitized(artifact: unknown, forbidden: readonly string[]): void {
  const text = JSON.stringify(artifact, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v));
  const hay = text.toLowerCase();
  for (const f of forbidden) {
    if (f.length === 0) continue;
    const v = f.toLowerCase();
    const bare = v.startsWith('0x') ? v.slice(2) : v;
    if (hay.includes(v) || (bare.length > 0 && hay.includes(bare))) throw new Error('sanitization failure: forbidden value present');
  }
  // any long hex run, with or without 0x, is an address, hash, key or calldata word and must never appear in an artifact
  if (/[0-9a-f]{32,}/.test(hay)) throw new Error('sanitization failure: hex identifier present');
}

/** Markdown table for a set of summaries. Counts and class names only. */
export function renderReport(title: string, rows: readonly DisclosureSummary[]): string {
  const head = '| Scenario | Calls | Addr | Tx | Recipient | Match-dep | Retry | Unknown | Progress | Failed | Roles |\n|---|---|---|---|---|---|---|---|---|---|---|';
  const body = rows.map((s) =>
    `| ${s.scenario} | ${String(s.totalCalls)} | ${String(s.addressSpecific)} | ${String(s.transactionSpecific)} | ${String(s.recipientSpecific)} | ${String(s.matchDependent)} | ${String(s.retryDependent)} | ${String(s.unknown)} | ${String(s.revealingProgress)} | ${String(s.failed)} | ${Object.entries(s.byRole).map(([k, v]) => `${k}:${String(v)}`).join(' ')} |`,
  );
  return `## ${title}\n\n${head}\n${body.join('\n')}\n`;
}
