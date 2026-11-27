import { isReason, sanitizeDisplayText, metaAddressFingerprint } from '@ghostpay/address-safety';

/** Result of {@link safeText}. */
export interface SafeText {
  /** Text that is safe to render: hostile characters are shown as visible `⟦U+XXXX⟧` markers. */
  readonly text: string;
  /** True when anything was altered or flagged (bidi/invisible/tag/private-use/control characters, mixed scripts). */
  readonly flagged: boolean;
}

const HOSTILE = /[\p{Bidi_Control}\p{Default_Ignorable_Code_Point}\p{Co}\p{Cc}\p{Cs}\u{E0000}-\u{E007F}]/u;
const KEEP = new Set(['\n', '\t']);
const MAX = 4096;

function escapeHostile(s: string): string {
  let result = '';
  for (const ch of s) {
    const visible = !KEEP.has(ch) && HOSTILE.test(ch)
      ? `⟦U+${(ch.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}⟧`
      : ch;
    // Never leave half of a visible U+ marker or a UTF-16 surrogate pair at the display boundary.
    if (result.length + visible.length > MAX) break;
    result += visible;
  }
  return result;
}

/**
 * Prepares untrusted invoice text (memo, line-item descriptions) for display (audit S3-12).
 *
 * @remarks Each line is checked on its own: a memo may hold line feeds, the one control the invoice schema allows. A
 * clean line passes through NFC-normalised, with a visible marker on tokens that mix Latin with Cyrillic or Greek
 * letters. A line containing bidi controls, zero-width/invisible, tag, private-use or control characters is shown with
 * each such character replaced by a visible code-point marker, so it can neither reorder nor hide anything.
 * Overlong text is truncated. React escaping already prevents markup injection; this closes visual spoofing.
 *
 * @param s Untrusted text.
 */
export function safeText(s: string): SafeText {
  let clipped = s.length > MAX ? s.slice(0, MAX) : s;
  // A code-unit cut through a valid pair must not manufacture a lone high surrogate
  // for the sanitizer. The rendered-output cap below still applies independently.
  if (s.length > MAX) {
    const last = s.charCodeAt(MAX - 1);
    const next = s.charCodeAt(MAX);
    if (last >= 0xd800 && last <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) {
      clipped = clipped.slice(0, -1);
    }
  }
  let flagged = s.length > MAX;
  const lines = clipped.split('\n').map((line) => {
    const r = sanitizeDisplayText(line);
    if (!isReason(r)) {
      flagged ||= r.mixedScript;
      return r.text;
    }
    flagged = true;
    return line.normalize('NFC');
  });
  // Marks what a refused line holds and applies the output cap; a clean line has nothing to mark.
  return { text: escapeHostile(lines.join('\n')), flagged };
}

/** Fixed-format digest of the seller meta-address for comparing out of band (display aid, 80 bits). */
export function payeeFingerprint(metaAddress: string): string {
  return metaAddressFingerprint(metaAddress);
}
