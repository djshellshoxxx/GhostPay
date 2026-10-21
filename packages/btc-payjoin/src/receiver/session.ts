import { PayjoinError, type PayjoinErrorCode } from '../errors.js';
import type { PayjoinParams } from '../params.js';
import type { ReceiverTransportSession } from '../transport/types.js';
import { checkOriginal, type ReceiverContext } from './checks.js';
import { buildProposal } from './contribute.js';
import type { ExposedUtxos } from './seen.js';

/** Outcome of handling one Original. */
export type ReceiverOutcome =
  | { readonly ok: true; readonly psbt: string; readonly contributed: boolean; readonly contributedOutpoints: readonly string[] }
  | { readonly ok: false; readonly code: PayjoinErrorCode };

/**
 * Receiver state machine for one invoice address.
 *
 * @remarks States: `open` -> (`busy` while handling) -> `open` on failure or
 * `done` on success. In `interactive` mode a `done` session answers every
 * further Original with `rate_limited` (BPJ-RCV-12: one live Original per
 * address, so an attacker cannot mint addresses to probe UTXOs). In
 * `non-interactive` mode the session stays open and relies on the seen-inputs
 * store and the broadcastability check.
 *
 * @security Every Original is checked by {@link checkOriginal} before any
 * wallet call; outpoints are locked in-flight, and recorded in the persistent
 * store only after a proposal was built. Failures return a code, never remote
 * or wallet text (BPJ-GEN-2/3).
 */
export class ReceiverSession {
  private state: 'open' | 'busy' | 'done' = 'open';
  private readonly inflight = new Set<string>();

  public constructor(
    private readonly ctx: ReceiverContext,
    private readonly exposed?: ExposedUtxos,
  ) {}

  /** Current state, for tests and UIs. */
  public get status(): 'open' | 'busy' | 'done' {
    return this.state;
  }

  /** Handles one Original and returns a proposal or a well-known failure code. */
  public async handleOriginal(originalPsbt: string, params: PayjoinParams): Promise<ReceiverOutcome> {
    if (this.state === 'busy' || (this.state === 'done' && this.ctx.mode === 'interactive')) {
      return { ok: false, code: 'rate_limited' };
    }
    const previous = this.state;
    this.state = 'busy';
    let locked: readonly string[] = [];
    try {
      const checked = await checkOriginal(originalPsbt, this.ctx);
      for (const op of checked.outpoints) if (this.inflight.has(op)) throw new PayjoinError('input_seen');
      locked = checked.outpoints;
      for (const op of locked) this.inflight.add(op);
      const built = await buildProposal(checked, params, this.ctx, this.exposed);
      await this.ctx.seen.add(checked.outpoints);
      this.state = 'done';
      return { ok: true, psbt: built.psbt, contributed: built.contributed, contributedOutpoints: built.contributedOutpoints };
    } catch (e) {
      this.state = previous === 'done' ? 'done' : 'open';
      return { ok: false, code: e instanceof PayjoinError ? e.code : 'unavailable' };
    } finally {
      for (const op of locked) this.inflight.delete(op);
    }
  }

  /**
   * Polls a transport session once and answers whatever is waiting.
   *
   * @returns `'idle'` when nothing was waiting, otherwise the outcome.
   */
  public async serve(session: ReceiverTransportSession): Promise<'idle' | ReceiverOutcome> {
    const incoming = await session.poll();
    if (incoming === null) return 'idle';
    const outcome = await this.handleOriginal(incoming.originalPsbt, incoming.params);
    await incoming.reply(outcome.ok ? outcome.psbt : { error: outcome.code });
    return outcome;
  }
}
