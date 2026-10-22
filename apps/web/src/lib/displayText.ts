import { isReason, sanitizeDisplayText, metaAddressFingerprint } from '@ghostpay/address-safety';

/** Result of {@link safeText}. */
export interface SafeText {
  /** Text that is safe to render: hostile characters are shown as visible `⟦U+XXXX⟧` markers. */
  readonly text: string;
  /** True when anything was altered or flagged (bidi/invisible/tag/private-use/control characters, mixed scripts). */
  readonly flagged: boolean;
}

const HOSTILE = /[\p{Bidi_Control}\p{Default_Ignorable_Code_Point}\p{Co}\p{Cc}\p{Cs}\u{E0000}-\u{E007F}]/gu;
const KEEP = new Set(['\n', '\t']);
const MAX = 4096;

function escapeHostile(s: string): string {
  return s.replace(HOSTILE, (ch) => (KEEP.has(ch) ? ch : `⟦U+${(ch.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}⟧`));
}

/**
 * Prepares untrusted invoice text (memo, line-item descriptions) for display (audit S3-12).
 *
 * @remarks Clean text passes through NFC-normalised, with a visible marker on tokens that mix Latin with Cyrillic or
 * Greek letters. Text containing bidi controls, zero-width/invisible, tag, private-use or control characters is shown
 * with each such character replaced by a visible code-point marker, so it can neither reorder nor hide anything.
 * Overlong text is truncated. React escaping already prevents markup injection; this closes visual spoofing.
 *
 * @param s Untrusted text.
 */
export function safeText(s: string): SafeText {
  const clipped = s.length > MAX ? s.slice(0, MAX) : s;
  const r = sanitizeDisplayText(clipped);
  if (!isReason(r)) return { text: r.text, flagged: r.mixedScript || s.length > MAX };
  return { text: escapeHostile(clipped.normalize('NFC')), flagged: true };
}

/** Fixed-format digest of the seller meta-address for comparing out of band (display aid, 80 bits). */
export function payeeFingerprint(metaAddress: string): string {
  return metaAddressFingerprint(metaAddress);
}
