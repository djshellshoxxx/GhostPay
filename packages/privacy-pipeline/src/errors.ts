/** Error codes thrown by this package. Never carries user data. */
export type PipelineErrorCode =
  | 'E_WRONG_CHAIN'
  | 'E_ILLEGAL_TRANSITION'
  | 'E_PLAN_HASH'
  | 'E_NOT_VALID'
  | 'E_ACK_MISSING'
  | 'E_ABORT_IN_FLIGHT'
  | 'E_BAD_INPUT'
  | 'E_NO_DRIVER'
  | 'E_NOT_FOUND';

/** Typed error. The message is a fixed code-derived string: no addresses, amounts or secrets. */
export class PipelineError extends Error {
  public readonly code: PipelineErrorCode;
  public constructor(code: PipelineErrorCode, detail?: string) {
    super(detail === undefined ? code : `${code}: ${detail}`);
    this.name = 'PipelineError';
    this.code = code;
  }
}
