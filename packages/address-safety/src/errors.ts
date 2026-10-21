/** Stable machine-readable rejection reasons. Never contain caller data. */
export type ReasonCode =
  | 'not_a_string'
  | 'bad_length'
  | 'bad_format'
  | 'bad_checksum'
  | 'all_uppercase'
  | 'too_long'
  | 'bidi_control'
  | 'default_ignorable'
  | 'private_use'
  | 'tag_character'
  | 'control_character'
  | 'unpaired_surrogate';

/** A rejection result (returned, not thrown, by parse-style functions). */
export interface Reason {
  readonly ok: false;
  readonly reason: ReasonCode;
}

/**
 * Builds a {@link Reason}.
 * @param reason Stable code.
 * @returns Frozen rejection object.
 * @security Carries no input data, so it is safe to log and to show.
 */
export function reject(reason: ReasonCode): Reason {
  return Object.freeze({ ok: false, reason });
}

/**
 * Type guard separating a {@link Reason} from a successful value.
 * @param v Result of a parse-style function.
 * @returns Whether `v` is a rejection.
 * @security Callers must check this before using the value; a Reason is never an address.
 */
export function isReason(v: unknown): v is Reason {
  return typeof v === 'object' && v !== null && (v as { ok?: unknown }).ok === false;
}

/** Thrown for programmer errors (bad options / bad already-typed input). */
export class AddressSafetyError extends Error {
  /** Stable code. */
  public readonly code: 'INVALID_ARGUMENT';

  /** @param message Fixed text (no caller data). */
  public constructor(message: string) {
    super(message);
    this.name = 'AddressSafetyError';
    this.code = 'INVALID_ARGUMENT';
  }
}
