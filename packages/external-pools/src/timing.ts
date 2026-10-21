/** Exit-timing advice (EP-UX-2). Advice only: never blocks an emergency exit. */
export interface TimingAdvice {
  readonly ready: boolean;
  readonly missingDeposits: number;
  readonly remainingSec: number;
  readonly text: string;
}

export interface TimingConfig {
  /** Default 20. */
  readonly minDeposits?: number;
  /** Default 86 400 (24 h). */
  readonly minElapsedSec?: number;
}

/**
 * @param observedDepositsSince Same-asset deposits seen in the pool since the note's deposit.
 * @param elapsedSec Seconds since the deposit.
 * @param cfg Thresholds.
 * @returns Advice. The text reports only the observed count; it never states an anonymity score (EP-UX-3).
 */
export function adviseExit(observedDepositsSince: number, elapsedSec: number, cfg: TimingConfig = {}): TimingAdvice {
  const minDeposits = cfg.minDeposits ?? 20;
  const minElapsed = cfg.minElapsedSec ?? 86_400;
  const dep = Math.max(0, Math.floor(observedDepositsSince));
  const el = Math.max(0, elapsedSec);
  const missingDeposits = Math.max(0, minDeposits - dep);
  const remainingSec = Math.max(0, minElapsed - el);
  const ready = missingDeposits === 0 && remainingSec === 0;
  const text = ready
    ? `Observed same-asset deposits since yours: ${String(dep)}. This is advice, not a guarantee.`
    : `Observed same-asset deposits since yours: ${String(dep)} (advice: wait for ${String(minDeposits)} deposits and ${String(Math.ceil(minElapsed / 3600))} hours). The emergency exit is never blocked.`;
  return { ready, missingDeposits, remainingSec, text };
}
