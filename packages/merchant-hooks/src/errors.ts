/** Thrown on invalid input. Message carries a code only, never untrusted input. */
export class HooksError extends Error {
  public constructor(public readonly code: string) {
    super(`hooks error: ${code}`);
    this.name = 'HooksError';
  }
}
