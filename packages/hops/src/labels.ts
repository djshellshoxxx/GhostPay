/** Mandatory UI copy (HOP-UX-1..4). Wording is fixed here so apps cannot soften it. */

/** Dialog title and badge. */
export const TITLE = 'Delayed forwarding (weak)';
export const WEAK_BADGE = 'weak';

/** The five points that MUST appear in the enable dialog (spec section 3). */
export const BODY_POINTS: readonly string[] = [
  'The payer and anyone using a block explorer can still follow your funds hop by hop.',
  'This adds delay and cost, not unlinkability.',
  'Automated analysis links these hops easily.',
  'The relayer you use sees each hop; using several relayers does not hide the on-chain path.',
  'For real unlinkability use a shared pool exit; hops do not add to it.',
];

/** What the mode does NOT protect, N1..N9 (copied from the spec; for docs/privacy-limits). */
export const LIMITATIONS: readonly string[] = [
  'N1: The payer can follow every hop. Each hop is a public transfer and a public sweep event with token, owner and destination all indexed.',
  'N2: Automated clustering links the chain. Each hop is one input, one output, same token, a predictable fee, a short gap and a fresh address.',
  'N3: Amounts are linkable. Each hop amount equals the previous one minus a visible fee, so the final amount identifies the original amount within a small candidate set.',
  'N4: Delay without a crowd is not an anonymity set. The crowd on a testnet router is tiny.',
  'N5: The relayer sees every hop (owner, destination, amount, fee, timing, and IP unless proxied). Using one relayer for all hops gives it the full chain.',
  'N6: Network metadata is unchanged. Hops add more requests from one client in a time window.',
  'N7: The fingerprint gets worse. A chain of fresh addresses moved by the shared sweep relayer marks you as a GhostPay user who chose to forward, and analysts may read the pattern as layering.',
  'N8: Hops before a pool add nothing to the pool, and hops after a pool exit are pure cost.',
  'N9: Mainnet is out of scope. No claim is made for any real-value chain.',
];

/** Single-relayer warning (HOP-REQ-11). */
export const SINGLE_RELAYER_WARNING =
  'Only one relayer is configured: it sees your whole forwarding chain with certainty.';
/** Overdue notice (HOP-UX-4). */
export const OVERDUE_NOTICE =
  'Some legs are overdue because the app was closed. They continue when you unlock; the real delay is longer than the drawn one.';
/** Resume note. */
export const RESUME_NOTE = 'Legs only run while the app is open. Nothing is signed or queued while waiting.';
/** External-destination warning (HOP-REQ-14, hygiene wording). */
export const EXTERNAL_DEST_WARNING = 'The final destination must be a fresh, never-used address that you control.';
/** Pool note (HOP-POOL-1). */
export const POOL_NOTE = 'Hops before a pool add no privacy.';
/** Fixed single-sweep comparison (HOP-UX-2). `fee` is formatted by the caller. */
export function singleSweepLine(fee: string): string {
  return `One plain sweep to a fresh address costs ${fee} and gives the same unlinkability against the payer.`;
}

/**
 * Case-insensitive banned substrings (HOP-UX-3). The pool sentence template contains none, so no
 * exception is needed.
 */
export const BANNED_PATTERN = /anonymous|anonymis|untraceable|mix|launder|obfuscat|private/i;

/**
 * Returns the banned substring found in `text`, or null.
 *
 * @param text Candidate UI string.
 * @returns Match or null.
 */
export function findBanned(text: string): string | null {
  const m = BANNED_PATTERN.exec(text);
  return m === null ? null : m[0];
}

/** Every static string this package ships. */
export function allShippedStrings(): string[] {
  return [
    TITLE,
    WEAK_BADGE,
    ...BODY_POINTS,
    ...LIMITATIONS,
    SINGLE_RELAYER_WARNING,
    OVERDUE_NOTICE,
    RESUME_NOTE,
    EXTERNAL_DEST_WARNING,
    POOL_NOTE,
    singleSweepLine('<fee>'),
  ];
}
