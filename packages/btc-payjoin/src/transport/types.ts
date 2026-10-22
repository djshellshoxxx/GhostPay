import type { PayjoinErrorCode } from '../errors.js';
import type { BtcNetwork } from '../network.js';
import type { PayjoinParams } from '../params.js';
import type { PayjoinUri } from '../uri.js';

/** An Original waiting at the receiver, with the means to answer it. */
export interface IncomingOriginal {
  readonly originalPsbt: string;
  /** Sender parameters as received (v1: query string; v2: inside the encrypted message). */
  readonly params: PayjoinParams;
  /** Answer with a proposal PSBT (base64) or a well-known error. Safe to call once. */
  reply(proposal: string | { readonly error: PayjoinErrorCode }): Promise<void>;
}

/** Receiver-side half of a session. */
export interface ReceiverTransportSession {
  readonly uri: PayjoinUri;
  /** Next Original, or `null` when none is waiting. Never blocks forever. */
  poll(): Promise<IncomingOriginal | null>;
  /** Release resources and forget the session (keys are zeroized by v2 adapters). */
  close(): Promise<void>;
}

/** Sender-side half of a session. */
export interface SenderTransportSession {
  /** Proposal, an error, or `null` while pending. */
  poll(): Promise<{ readonly proposalPsbt: string } | { readonly error: PayjoinErrorCode } | null>;
}

/** Request to open a receiver session. */
export interface OpenReceiverRequest {
  readonly address: string;
  readonly network: BtcNetwork;
  readonly amountSats?: bigint;
  readonly expirySeconds: number;
  /** `false` encodes `pjos=0` in the URI. */
  readonly outputSubstitution?: boolean;
  readonly directoryUrl?: string;
  readonly ohttpRelays?: readonly string[];
}

/**
 * Transport abstraction. The policy core never sees a socket: it sees
 * "an Original arrived" and "a proposal arrived".
 *
 * @remarks Implementations: `memory` (tests, no encryption), `v1-http`
 * (BIP-78, TLS or onion or loopback), `v2-ohttp` (BIP-77 via payjoin-ffi,
 * optional, Node-only). Transports are untrusted: every PSBT they return is
 * re-validated by the TS policy core (BPJ-FFI-2).
 */
export interface PayjoinTransport {
  readonly kind: 'v1-http' | 'v2-ohttp' | 'memory';
  openReceiverSession(r: OpenReceiverRequest): Promise<ReceiverTransportSession>;
  sendOriginal(uri: PayjoinUri, originalPsbt: string, params: PayjoinParams): Promise<SenderTransportSession>;
}
