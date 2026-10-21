import { reject, type Reason } from './errors.js';

const MAX_TEXT = 4096;

const BIDI = /\p{Bidi_Control}/u;
const TAG = /[\u{E0000}-\u{E007F}]/u;
const IGNORABLE = /\p{Default_Ignorable_Code_Point}/u;
const PRIVATE = /\p{Co}/u;
const CONTROL = /\p{Cc}/u;
const SURROGATE = /\p{Cs}/u;
const LATIN = /\p{Script=Latin}/u;
const LOOKALIKE_SCRIPT = /[\p{Script=Cyrillic}\p{Script=Greek}]/u;
const TOKEN = /\S+/gu;

/** Policy for {@link sanitizeDisplayText}. */
export interface SanitizePolicy {
  /** Permit U+200D (between visible characters) and U+FE0F for emoji sequences. */
  readonly allowZwjEmoji?: boolean;
}

/** Successful sanitisation. */
export interface SanitizedText {
  readonly ok: true;
  /** NFC text, mixed-script tokens prefixed with a visible marker. */
  readonly text: string;
  /** Number of marker insertions. */
  readonly replaced: number;
  /** Whether any token mixed Latin with Cyrillic or Greek. */
  readonly mixedScript: boolean;
}

/** Marker prefixed to mixed-script tokens. */
export const MIXED_SCRIPT_MARKER = '⚠';

function badChar(ch: string, prev: string, next: string, allowZwj: boolean): Reason | null {
  if (SURROGATE.test(ch)) return reject('unpaired_surrogate');
  if (BIDI.test(ch)) return reject('bidi_control');
  if (TAG.test(ch)) return reject('tag_character');
  if (PRIVATE.test(ch)) return reject('private_use');
  if (CONTROL.test(ch)) return reject('control_character');
  if (IGNORABLE.test(ch)) {
    const joiner = ch === '‍' && prev !== '' && !/\s/u.test(prev) && next !== '' && !/\s/u.test(next);
    if (allowZwj && (joiner || ch === '️')) return null;
    return reject('default_ignorable');
  }
  return null;
}

/**
 * Validates untrusted display text (invoice memos, EIP-6963 wallet names).
 * @param s Text to check.
 * @param policy Optional {@link SanitizePolicy}.
 * @returns NFC text with visible markers on mixed-script tokens, or a {@link Reason} for bidi
 * controls, default-ignorable, private-use, tag, control characters, unpaired surrogates or text
 * over 4096 UTF-16 units.
 * @security Property classes come from the JS engine (`\p{..}`), all patterns are linear-time.
 * Same-script homoglyphs (for example within Cyrillic only) are NOT detected; render with
 * `unicode-bidi: isolate` as well.
 */
export function sanitizeDisplayText(s: string, policy: SanitizePolicy = {}): SanitizedText | Reason {
  if (typeof s !== 'string') return reject('not_a_string');
  if (s.length > MAX_TEXT) return reject('too_long');
  const allowZwj = policy.allowZwjEmoji === true;
  const chars = Array.from(s);
  for (let i = 0; i < chars.length; i++) {
    const bad = badChar(chars[i] ?? '', chars[i - 1] ?? '', chars[i + 1] ?? '', allowZwj);
    if (bad !== null) return bad;
  }
  let replaced = 0;
  const text = s.normalize('NFC').replace(TOKEN, (tok) => {
    if (LATIN.test(tok) && LOOKALIKE_SCRIPT.test(tok)) {
      replaced++;
      return MIXED_SCRIPT_MARKER + tok;
    }
    return tok;
  });
  return { ok: true, text, replaced, mixedScript: replaced > 0 };
}
