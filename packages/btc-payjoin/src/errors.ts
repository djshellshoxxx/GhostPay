/**
 * Closed set of machine-readable failure codes. Remote text never reaches a
 * code or a message (BPJ-GEN-3): unknown remote errors collapse to
 * `unknown_remote_error`.
 */
export type PayjoinErrorCode =
  | 'network_not_allowed'
  | 'uri_invalid'
  | 'uri_conflict'
  | 'psbt_invalid'
  | 'psbt_unsigned'
  | 'psbt_not_finalized'
  | 'input_seen'
  | 'input_owned_by_receiver'
  | 'not_broadcastable'
  | 'fee_decreased'
  | 'fee_over_cap'
  | 'feerate_below_min'
  | 'output_missing'
  | 'output_decreased'
  | 'output_substitution_forbidden'
  | 'input_missing'
  | 'order_changed'
  | 'sequence_changed'
  | 'version_or_locktime_changed'
  | 'keypaths_present'
  | 'receiver_input_not_finalized'
  | 'sender_input_finalized'
  | 'partial_sigs_present'
  | 'session_expired'
  | 'session_state'
  | 'transport_failed'
  | 'version_unsupported'
  | 'unavailable'
  | 'not_enough_money'
  | 'original_psbt_rejected'
  | 'rate_limited'
  | 'unknown_remote_error';

/**
 * The only error type thrown by this package's public entry points.
 *
 * @remarks `detail` is a static, locally authored hint for debug sinks. It is
 * never built from remote input, PSBT bytes, outpoints or addresses (BPJ-GEN-2).
 */
export class PayjoinError extends Error {
  public readonly code: PayjoinErrorCode;

  public constructor(code: PayjoinErrorCode, detail?: string) {
    super(detail === undefined ? code : `${code}: ${detail}`);
    this.name = 'PayjoinError';
    this.code = code;
  }
}

/** @internal Throw a {@link PayjoinError}. */
export function fail(code: PayjoinErrorCode, detail?: string): never {
  throw new PayjoinError(code, detail);
}

/** BIP-78 "Receiver's well known errors" (the only ones a sender may show). */
export const WELL_KNOWN_REMOTE_ERRORS = [
  'unavailable',
  'not-enough-money',
  'version-unsupported',
  'original-psbt-rejected',
] as const;

/**
 * Maps a remote `errorCode` string to a local code. Unknown strings (which
 * could be used to phish the user) become `unknown_remote_error`.
 *
 * @security Never surface the remote `message` in a UI (BIP-78: "Such error
 * codes or messages could be used maliciously to phish a non-technical user").
 */
export function mapRemoteError(remote: unknown): PayjoinErrorCode {
  switch (remote) {
    case 'unavailable':
      return 'unavailable';
    case 'not-enough-money':
      return 'not_enough_money';
    case 'version-unsupported':
      return 'version_unsupported';
    case 'original-psbt-rejected':
      return 'original_psbt_rejected';
    default:
      return 'unknown_remote_error';
  }
}

/** Inverse of {@link mapRemoteError} for the receiver's HTTP error body. */
export function toRemoteErrorCode(code: PayjoinErrorCode): (typeof WELL_KNOWN_REMOTE_ERRORS)[number] {
  switch (code) {
    case 'unavailable':
    case 'session_expired':
    case 'rate_limited':
      return 'unavailable';
    case 'not_enough_money':
      return 'not-enough-money';
    case 'version_unsupported':
      return 'version-unsupported';
    default:
      return 'original-psbt-rejected';
  }
}
