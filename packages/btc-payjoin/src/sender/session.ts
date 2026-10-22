import { PayjoinError, fail, type PayjoinErrorCode } from '../errors.js';
import { assertNetwork, addressToScript } from '../network.js';
import { withDefaults, type PayjoinParams } from '../params.js';
import { encodePsbt, inputOutpoint, parsePsbt } from '../psbt.js';
import type { PsbtSigner } from '../signers.js';
import type { PayjoinTransport, SenderTransportSession } from '../transport/types.js';
import { buildOriginalPsbt, type BuiltOriginal, type OriginalInputs } from './original.js';
import { checkFinalFeeRate, verifyProposal } from './checks.js';

/** Sender session states (BPJ spec section 8). */
export type SenderState = 'created' | 'posted' | 'proposal_received' | 'verified' | 'signed' | 'broadcast' | 'fallback' | 'failed' | 'expired';

/** What `poll` reports. */
export type SenderEvent =
  | { readonly kind: 'pending' }
  | { readonly kind: 'ready'; readonly payjoin: boolean; readonly psbt: string; readonly txHex: string; readonly txid: string }
  | { readonly kind: 'fallback'; readonly reason: PayjoinErrorCode; readonly txHex: string; readonly txid: string }
  | { readonly kind: 'failed'; readonly reason: PayjoinErrorCode }
  | { readonly kind: 'done'; readonly path: 'payjoin' | 'fallback' };

/** Inputs for {@link SenderSession.open}. */
export interface SenderOpen extends OriginalInputs {
  readonly params?: Partial<PayjoinParams>;
  readonly transport: PayjoinTransport;
  /** Unix seconds. Injected (BPJ-GEN-4). */
  readonly now: () => number;
  /** Seconds after which an unanswered session may fall back. Default 3600. */
  readonly expirySeconds?: number;
  /** When true (default), `poll` offers the Original for broadcast on failure or expiry. */
  readonly fallbackOnFailure?: boolean;
}

/**
 * Sender state machine: build Original, post it, verify the proposal, sign
 * only the sender's own inputs, and either broadcast the payjoin or fall back.
 *
 * @security Fail-closed (BPJ-SND-2/4/5): nothing is signed before
 * {@link verifyProposal} passes; at most one of {payjoin, fallback} may be
 * marked broadcast; remote text never surfaces (only codes).
 */
export class SenderSession {
  private st: SenderState = 'created';
  private sess?: SenderTransportSession;
  private failure?: PayjoinErrorCode;
  private readonly startedAt: number;
  private broadcastKind?: 'payjoin' | 'fallback';

  private constructor(
    private readonly built: BuiltOriginal,
    private readonly o: SenderOpen,
    private readonly params: PayjoinParams,
  ) {
    this.startedAt = o.now();
  }

  /**
   * Builds the Original and posts it through the transport.
   *
   * @throws {PayjoinError} when the Original cannot be built or posted.
   */
  public static async open(o: SenderOpen): Promise<SenderSession> {
    assertNetwork(o.uri.network);
    const base = withDefaults(o.params);
    const built = buildOriginalPsbt(o);
    const params: PayjoinParams = {
      ...base,
      v: 1,
      disableOutputSubstitution: base.disableOutputSubstitution || !o.uri.outputSubstitution,
      ...(built.changeIndex !== undefined && base.additionalFeeOutputIndex === undefined && base.maxAdditionalFeeContributionSats !== undefined
        ? { additionalFeeOutputIndex: built.changeIndex }
        : {}),
    };
    const s = new SenderSession(built, o, params);
    try {
      s.sess = await o.transport.sendOriginal(o.uri, built.psbt, params);
    } catch (e) {
      s.st = 'failed';
      s.failure = e instanceof PayjoinError ? e.code : 'transport_failed';
      return s;
    }
    s.st = 'posted';
    return s;
  }

  /** Current state. */
  public get state(): SenderState {
    return this.st;
  }

  /** Parameters actually sent to the receiver. */
  public get sentParams(): PayjoinParams {
    return this.params;
  }

  /** The fully signed Original as base64 PSBT. */
  public originalPsbt(): string {
    return this.built.psbt;
  }

  /**
   * The Original as a broadcastable transaction.
   *
   * @throws {PayjoinError} `session_state` once the payjoin was marked broadcast (BPJ-SND-5).
   */
  public fallbackTx(): { hex: string; txid: string } {
    if (this.broadcastKind === 'payjoin') fail('session_state', 'payjoin already broadcast');
    return { hex: this.built.tx.hex, txid: this.built.tx.id };
  }

  /**
   * Records that a transaction was handed to the network. Only one of the two
   * may ever be recorded.
   *
   * @throws {PayjoinError} `session_state` on a second call or a payjoin that was never verified.
   */
  public markBroadcast(kind: 'payjoin' | 'fallback'): void {
    if (this.broadcastKind !== undefined) fail('session_state', 'already broadcast');
    if (kind === 'payjoin' && this.st !== 'signed') fail('session_state', 'payjoin not signed');
    this.broadcastKind = kind;
    this.st = kind === 'fallback' ? 'fallback' : 'broadcast';
  }

  private fallbackAllowed(): boolean {
    return (this.o.fallbackOnFailure ?? true) && this.broadcastKind === undefined;
  }

  private failWith(code: PayjoinErrorCode): SenderEvent {
    this.st = 'failed';
    this.failure = code;
    return this.failedEvent();
  }

  private failedEvent(): SenderEvent {
    const reason = this.failure ?? 'unavailable';
    if (this.fallbackAllowed()) {
      const f = this.fallbackTx();
      return { kind: 'fallback', reason, txHex: f.hex, txid: f.txid };
    }
    return { kind: 'failed', reason };
  }

  /** Polls the transport once; verifies and signs the proposal when it arrives. */
  public async poll(): Promise<SenderEvent> {
    if (this.broadcastKind !== undefined) return { kind: 'done', path: this.broadcastKind };
    if (this.st === 'failed' || this.st === 'expired') return this.failedEvent();
    if (this.st !== 'posted') return { kind: 'pending' };
    const expiry = this.startedAt + (this.o.expirySeconds ?? 3600);
    let res: Awaited<ReturnType<SenderTransportSession['poll']>>;
    try {
      res = await (this.sess as SenderTransportSession).poll();
    } catch (e) {
      return this.failWith(e instanceof PayjoinError ? e.code : 'transport_failed');
    }
    if (res === null) {
      if (this.o.now() >= expiry) {
        this.st = 'expired';
        this.failure = 'session_expired';
        return this.failedEvent();
      }
      return { kind: 'pending' };
    }
    if ('error' in res) return this.failWith(res.error);
    this.st = 'proposal_received';
    try {
      const out = this.finalize(res.proposalPsbt);
      return { kind: 'ready', payjoin: out.payjoin, psbt: out.psbt, txHex: out.txHex, txid: out.txid };
    } catch (e) {
      return this.failWith(e instanceof PayjoinError ? e.code : 'psbt_invalid');
    }
  }

  /**
   * Runs {@link verifyProposal}, copies the sender's own signing data into the
   * proposal, signs only the sender's inputs, finalizes and re-checks `minfeerate`.
   *
   * @throws {PayjoinError} on any violated check. Nothing is signed on failure.
   */
  public finalize(proposalPsbt: string): { psbt: string; txHex: string; txid: string; payjoin: boolean } {
    if (this.broadcastKind !== undefined) fail('session_state');
    const proposal = parsePsbt(proposalPsbt);
    const paymentScript = addressToScript(this.o.uri.address, this.o.uri.network);
    const verdict = verifyProposal(this.built.tx, proposal, this.params, { paymentScript });
    this.st = 'verified';
    const signer: PsbtSigner = this.o.signer;
    const ours = new Set<number>();
    for (let i = 0; i < proposal.inputsLength; i++) {
      const data = this.built.signingData.get(inputOutpoint(proposal, i));
      if (data === undefined) continue; // receiver input: never touched
      ours.add(i);
      proposal.updateInput(i, {
        witnessUtxo: { script: data.script, amount: data.amount },
        ...(data.signing?.redeemScript !== undefined ? { redeemScript: data.signing.redeemScript } : {}),
        ...(data.signing?.witnessScript !== undefined ? { witnessScript: data.signing.witnessScript } : {}),
        ...(data.signing?.tapInternalKey !== undefined ? { tapInternalKey: data.signing.tapInternalKey } : {}),
      });
    }
    for (const i of ours) {
      signer.signInput(proposal, i);
      proposal.finalizeIdx(i);
    }
    if (!proposal.isFinal) fail('psbt_not_finalized', 'not all inputs final after signing');
    checkFinalFeeRate(proposal, this.params);
    this.st = 'signed';
    return { psbt: encodePsbt(proposal), txHex: proposal.hex, txid: proposal.id, payjoin: verdict.addedInputs > 0 };
  }
}

export type { BuiltOriginal };
