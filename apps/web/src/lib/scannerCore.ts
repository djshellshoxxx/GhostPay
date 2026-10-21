/**
 * Pure scanning core used inside the Web Worker. It must not use any network API (fetch, XMLHttpRequest, WebSocket,
 * EventSource, sendBeacon, importScripts): a test reads this file and the worker entry and fails if one appears.
 * Public logs go in; match flags and addresses come out. Key material never leaves this module.
 */
import { checkAnnouncementDeep } from '@ghostpay/chain-adapters/deepscan';
import {
  checkAnnouncement,
  parseCompressedPoint,
  secretScalarFromBytes,
  zeroize,
  type CompressedPoint,
  type SecretScalar,
} from '@ghostpay/core-crypto';

export interface WireLog {
  readonly id: string;
  readonly schemeId: bigint;
  readonly stealthAddress: string;
  readonly ephemeralPublicKey: string;
  readonly metadata: string;
  /** Deep scan: ignore the view tag for this log (it was announced by the router). */
  readonly skipTag?: boolean;
}

export interface WireMatch {
  readonly id: string;
  readonly stealthAddress: string;
  /** Set only for skipTag logs: whether the announced view tag was the right one. */
  readonly tagMatches?: boolean;
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

/** One scan: holds the viewing scalar only until `dispose()`. */
export class ScanSession {
  private secret: SecretScalar | undefined;
  private readonly spend: CompressedPoint;
  private cancelled = false;
  private total = 0;

  public constructor(viewingKey: Uint8Array, spendingPublicKey: string) {
    this.spend = hexToPoint(spendingPublicKey);
    try {
      this.secret = secretScalarFromBytes(viewingKey);
    } finally {
      zeroize(viewingKey);
    }
  }

  public cancel(): void {
    this.cancelled = true;
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
      this.total++;
      if (log.skipTag === true) {
        const deep = checkAnnouncementDeep(log, secret, this.spend);
        if (deep.matches) out.push({ id: log.id, stealthAddress: deep.stealthAddress, tagMatches: deep.tagMatches });
      } else {
        const hit = checkAnnouncement(log, secret, this.spend);
        if (hit.matches) out.push({ id: log.id, stealthAddress: hit.stealthAddress });
      }
      if (onProgress !== undefined && i % 128 === 127) onProgress(this.total);
    }
    return out;
  }

  public dispose(): void {
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
