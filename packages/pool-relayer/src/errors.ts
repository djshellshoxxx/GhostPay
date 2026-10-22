/** Client-facing error: stable `code`, HTTP `status`. Never carries request data. */
export class RelayerError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly retryAfterSeconds: number | undefined;

  public constructor(status: number, code: string, retryAfterSeconds?: number) {
    super(code);
    this.name = 'RelayerError';
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Thrown by a {@link ChainPort} when the simulation reverts (never a transport failure). */
export class SimulationRevert extends Error {
  public constructor() {
    super('simulation reverted');
    this.name = 'SimulationRevert';
  }
}

/** Shorthand for a 400 error. */
export function invalid(code: string): RelayerError {
  return new RelayerError(400, code);
}
