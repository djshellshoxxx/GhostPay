/**
 * Pure scanning core used inside the Web Worker. It must not use any network API (fetch, XMLHttpRequest, WebSocket,
 * EventSource, sendBeacon, importScripts): a test reads this file and the worker entry and fails if one appears.
 * Public logs go in; match flags and addresses come out. Key material never leaves this module.
 */
import {
  checkAnnouncement,
  parseCompressedPoint,
  secretScalarFromBytes,
  zeroize,
  type AnnouncementCheck,
  type CompressedPoint,
  type SecretScalar,
} from '@ghostpay/core-crypto';

export interface WireLog {
  readonly id: string;
  readonly schemeId: bigint;
  readonly stealthAddress: string;
  readonly ephemeralPublicKey: string;
  readonly metadata: string;
  /** Skip the one-byte view tag as an opt-in recovery scan (router announcements only). */
  readonly skipTag?: boolean;
}

export interface WireMatch {
  readonly id: string;
  readonly stealthAddress: string;
  readonly tagMatches: boolean;
}

export type ToWorker =
  | { readonly type: 'start'; readonly viewingKey: Uint8Array; readonly spendingPublicKey: string }
  | { readonly type: 'batch'; readonly batchId: number; readonly logs: readonly WireLog[] }
  | { readonly type: 'cancel' }
  | { readonly type: 'end' };

export type FromWorker =
  | { readonly type: 'ready' }
  | { readonly type: 'progress'; readonly batchId: number; readonly scanned: number }
  | { readonly type: 'matches'; readonly batchId: number; readonly matches: readonly WireMatch[]; readonly scanned: number }
  | { readonly type: 'error'; readonly code: string }
  | { readonly type: 'ended' };

function hexToPoint(hex: string): CompressedPoint {
  if (!/^(?:02|03)[0-9a-fA-F]{64}$/.test(hex)) throw new Error('INVALID_POINT');
  return parseCompressedPoint(Uint8Array.from(hex.match(/../g) ?? [], (h) => parseInt(h, 16)));
}

/** Distinct announcements remembered per session (spec 05 replay memo); the memo is dropped, not evicted, when full. */
export const REPLAY_MEMO_LIMIT = 4096;
const EPHEMERAL_HEX = /^0x(?:02|03)[0-9a-fA-F]{64}$/;
const ADDRESS_HEX = /^0x[0-9a-fA-F]{40}$/;
const METADATA_HEX = /^0x(?:[0-9a-fA-F]{2})+$/;

/**
 * Memo key for a well-formed announcement, or undefined when the outcome may depend on more than these fields. Given the
 * keys, `checkAnnouncement` is a function of the ephemeral key, the announced tag (the first metadata byte), the announced
 * address and the deep-scan flag alone, so an exact replay (the cheapest spam: copying an announcement) costs a lookup
 * instead of an ECDH. Raw strings are kept as given: a checksum-cased address that fails the strict check is its own key.
 */
function memoKey(log: WireLog): string | undefined {
  if ((log.schemeId !== 1n) || !EPHEMERAL_HEX.test(log.ephemeralPublicKey) || !ADDRESS_HEX.test(log.stealthAddress) || !METADATA_HEX.test(log.metadata)) return undefined;
  return `${log.skipTag === true ? 'd' : 's'}|${log.ephemeralPublicKey}|${log.metadata.slice(2, 4).toLowerCase()}|${log.stealthAddress}`;
}

/** One scan: holds the viewing scalar only until `dispose()`. */
export class ScanSession {
  private secret: SecretScalar | undefined;
  private readonly spend: CompressedPoint;
  private cancelled = false;
  private total = 0;
  private readonly memo = new Map<string, AnnouncementCheck>();

  public constructor(viewingKey: Uint8Array, spendingPublicKey: string) {
    try {
      this.spend = hexToPoint(spendingPublicKey);
      this.secret = secretScalarFromBytes(viewingKey);
    } finally {
      zeroize(viewingKey);
    }
  }

  public cancel(): void {
    this.cancelled = true;
    this.memo.clear();
    if (this.secret !== undefined) zeroize(this.secret);
  }

  public get scanned(): number {
    return this.total;
  }

  /** Checks a batch. Stops early (returning partial matches) when cancelled. Malformed logs never throw. */
  public processBatch(logs: readonly WireLog[], onProgress?: (scanned: number) => void): WireMatch[] {
    const secret = this.secret;
    if (secret === undefined) throw new Error('DISPOSED');
    const out: WireMatch[] = [];
    for (let i = 0; i < logs.length; i++) {
      if (this.cancelled) break;
      const log = logs[i] as WireLog;
      const key = memoKey(log);
      let hit = key === undefined ? undefined : this.memo.get(key);
      if (hit === undefined) {
        hit = checkAnnouncement(log, secret, this.spend, log.skipTag === true ? { ignoreViewTag: true } : {});
        if (key !== undefined) {
          if (this.memo.size >= REPLAY_MEMO_LIMIT) this.memo.clear();
          this.memo.set(key, hit);
        }
      }
      this.total++;
      if (hit.matches) out.push({ id: log.id, stealthAddress: hit.stealthAddress, tagMatches: hit.tagMatches ?? true });
      if (onProgress !== undefined && i % 128 === 127) onProgress(this.total);
    }
    return out;
  }

  public dispose(): void {
    this.memo.clear();
    if (this.secret !== undefined) zeroize(this.secret);
    this.secret = undefined;
  }
}

/** Message handler shared by the worker entry and in-process tests. Returns messages to post back. */
export class ScanProtocol {
  private session: ScanSession | undefined;

  public handle(msg: ToWorker, post: (m: FromWorker) => void): void {
    switch (msg.type) {
      case 'start':
        this.session?.dispose();
        try {
          this.session = new ScanSession(msg.viewingKey, msg.spendingPublicKey);
          post({ type: 'ready' });
        } catch {
          this.session = undefined;
          post({ type: 'error', code: 'BAD_KEYS' });
        }
        return;
      case 'batch': {
        const s = this.session;
        if (s === undefined) {
          post({ type: 'error', code: 'NOT_STARTED' });
          return;
        }
        const matches = s.processBatch(msg.logs, (scanned) => {
          post({ type: 'progress', batchId: msg.batchId, scanned });
        });
        post({ type: 'matches', batchId: msg.batchId, matches, scanned: s.scanned });
        return;
      }
      case 'cancel':
        this.session?.cancel();
        return;
      case 'end':
        this.session?.dispose();
        this.session = undefined;
        post({ type: 'ended' });
        return;
    }
  }
}
