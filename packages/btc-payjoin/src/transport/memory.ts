import { PayjoinError, fail, type PayjoinErrorCode } from '../errors.js';
import { assertNetwork } from '../network.js';
import { parsePsbt, MAX_PSBT_BASE64 } from '../psbt.js';
import type { PayjoinParams } from '../params.js';
import { buildPayjoinUri, type PayjoinUri } from '../uri.js';
import type {
  IncomingOriginal,
  OpenReceiverRequest,
  PayjoinTransport,
  ReceiverTransportSession,
  SenderTransportSession,
} from './types.js';

interface Mailbox {
  readonly id: string;
  readonly expiresAt: number;
  original?: { psbt: string; params: PayjoinParams };
  delivered: boolean;
  reply?: { proposalPsbt: string } | { error: PayjoinErrorCode };
  closed: boolean;
}

/** Message sizes the fake directory observed, to test padding-free metadata exposure. */
export interface ObservedMessage {
  readonly direction: 'sender-to-receiver' | 'receiver-to-sender';
  readonly bytes: number;
}

/**
 * In-process store-and-forward directory for tests.
 *
 * @security NOT a security boundary: payloads are stored in clear and sizes
 * are not padded. It models only the store-and-forward shape of BIP-77 (async,
 * single mailbox per session, expiry), nothing cryptographic.
 */
export class MemoryDirectory {
  private readonly boxes = new Map<string, Mailbox>();
  public readonly observed: ObservedMessage[] = [];

  public constructor(
    private readonly now: () => number,
    private readonly randomId: () => string,
  ) {}

  /** @internal */
  public create(expirySeconds: number): Mailbox {
    const id = this.randomId();
    if (!/^[A-Z0-9]{8,32}$/.test(id) || this.boxes.has(id)) fail('transport_failed', 'bad mailbox id');
    const box: Mailbox = { id, expiresAt: this.now() + expirySeconds, delivered: false, closed: false };
    this.boxes.set(id, box);
    return box;
  }

  /** @internal */
  public get(id: string): Mailbox | undefined {
    return this.boxes.get(id);
  }

  /** @internal */
  public expired(box: Mailbox): boolean {
    return this.now() >= box.expiresAt;
  }
}

/**
 * Memory implementation of {@link PayjoinTransport}. `pj` is a loopback-shaped
 * v1 URL so the standard URI validators apply unchanged.
 */
export class MemoryTransport implements PayjoinTransport {
  public readonly kind = 'memory' as const;

  public constructor(private readonly dir: MemoryDirectory) {}

  public openReceiverSession(r: OpenReceiverRequest): Promise<ReceiverTransportSession> {
    assertNetwork(r.network);
    if (!Number.isFinite(r.expirySeconds) || r.expirySeconds <= 0) fail('uri_invalid');
    const box = this.dir.create(r.expirySeconds);
    const uri: PayjoinUri = {
      address: r.address,
      ...(r.amountSats !== undefined ? { amountSats: r.amountSats } : {}),
      pj: `http://localhost/pj/${box.id}`,
      outputSubstitution: r.outputSubstitution ?? true,
      network: r.network,
    };
    buildPayjoinUri(uri); // validates address and pj
    const dir = this.dir;
    return Promise.resolve({
      uri,
      poll(): Promise<IncomingOriginal | null> {
        if (box.closed) return Promise.resolve(null);
        if (dir.expired(box)) return Promise.reject(new PayjoinError('session_expired'));
        if (box.original === undefined || box.delivered) return Promise.resolve(null);
        box.delivered = true;
        const { psbt, params } = box.original;
        return Promise.resolve({
          originalPsbt: psbt,
          params,
          reply(proposal): Promise<void> {
            if (box.reply !== undefined) return Promise.reject(new PayjoinError('session_state'));
            box.reply = typeof proposal === 'string' ? { proposalPsbt: proposal } : { error: proposal.error };
            dir.observed.push({ direction: 'receiver-to-sender', bytes: typeof proposal === 'string' ? proposal.length : 0 });
            return Promise.resolve();
          },
        });
      },
      close(): Promise<void> {
        box.closed = true;
        return Promise.resolve();
      },
    });
  }

  public sendOriginal(uri: PayjoinUri, originalPsbt: string, params: PayjoinParams): Promise<SenderTransportSession> {
    assertNetwork(uri.network);
    const m = /^http:\/\/localhost\/pj\/([A-Z0-9]+)$/.exec(uri.pj);
    if (m === null) fail('transport_failed', 'not a memory pj url');
    const box = this.dir.get(m[1] as string);
    if (box === undefined) fail('transport_failed', 'unknown mailbox');
    if (this.dir.expired(box)) fail('session_expired');
    if (box.original !== undefined) fail('session_state', 'mailbox already used');
    if (originalPsbt.length > MAX_PSBT_BASE64) fail('psbt_invalid');
    parsePsbt(originalPsbt); // directory-side sanity: refuse garbage early
    box.original = { psbt: originalPsbt, params };
    this.dir.observed.push({ direction: 'sender-to-receiver', bytes: originalPsbt.length });
    const dir = this.dir;
    return Promise.resolve({
      poll() {
        if (box.reply !== undefined) return Promise.resolve(box.reply);
        if (dir.expired(box)) return Promise.resolve({ error: 'session_expired' as const });
        return Promise.resolve(null);
      },
    });
  }
}
