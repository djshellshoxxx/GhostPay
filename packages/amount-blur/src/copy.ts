/** Fixed UI copy keys (AB-H1, AB-H2). Strings are normative; do not paraphrase into stronger claims. */
export const ABCopy = Object.freeze({
  AB_NOT_ANONYMOUS: 'This does not make you anonymous. See what it does not hide.',
  AB_COST_GAS:
    'Each part is a separate payment with its own gas cost, so splitting costs extra gas and one wallet prompt per part.',
  AB_FEE_DELTA: 'Splitting can change the total fee by a few base units, because the fee is rounded down for each part.',
  AB_ROUND_UP: 'Rounding only goes up. The seller receives the extra amount and it cannot be refunded.',
  AB_FANOUT_LINKABLE:
    'Several payments from the same wallet in a short time can be linked to each other by anyone watching the chain.',
  AB_TAB_OPEN: 'Keep this tab open. Closing it cancels the parts that have not been sent yet.',
} as const);

/** Key of {@link ABCopy}. */
export type ABCopyKey = keyof typeof ABCopy;

/** What blurring does NOT protect (normative list from the spec, section 2). */
export const AB_NOT_PROTECTED: readonly string[] = Object.freeze([
  'No anonymity. Payer address, token, every part amount, fee and block time stay public, and the payer still knows every stealth address it paid.',
  'No crowd, no gain. With a small crowd, blurring changes almost nothing. Delaying one payment is not a crowd.',
  'Fan-out is itself a fingerprint. Several payments from one wallet within a short time can be linked to each other by sender, token, router and time.',
  'Rounding up costs money. Anyone who knows the grid can undo the rounding to a bucket. Rounding down is not offered.',
  'Seller side: sweeping each part through a relayer links the parts again, because the relayer sees owner, destination, amount and timing. Fresh destinations per sweep still matter.',
  'Timing runs in the open tab. It does not hide your IP address from the RPC, the relayer or the host. A closed tab cancels the schedule.',
  'No hidden amounts. Nothing here encrypts or conceals an amount.',
]);

const FORBIDDEN = ['anonymous', 'untraceable', 'hidden', 'private'] as const;
const NEGATION = /\b(?:not|no|never|nothing|cannot|without)\b[^.]{0,24}$/i;

/**
 * Lint for AB-H2: returns each forbidden word used as a property of blurred payments.
 * A word is allowed only when a negation (`not`, `no`, `never`, `nothing`, `cannot`, `without`)
 * precedes it within the same sentence and 24 characters.
 *
 * @param text UI string or doc text.
 * @returns Offending words (empty when clean).
 */
export function findForbiddenWords(text: string): string[] {
  const bad: string[] = [];
  for (const w of FORBIDDEN) {
    const re = new RegExp(`\\b${w}\\b`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (!NEGATION.test(text.slice(0, m.index))) bad.push(w);
    }
  }
  return bad;
}
