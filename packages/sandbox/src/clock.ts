import { SandboxError } from './errors.js';

/** Injectable clock in unix seconds. */
export interface Clock {
  now(): number;
}

/**
 * Manually driven clock. Time only moves when the test says so and never goes backwards.
 */
export class ManualClock implements Clock {
  private seconds: number;

  /** @param startSeconds Initial unix time in whole seconds (default 1_800_000_000). */
  public constructor(startSeconds = 1_800_000_000) {
    ManualClock.check(startSeconds);
    this.seconds = startSeconds;
  }

  private static check(v: number): void {
    if (!Number.isSafeInteger(v) || v < 0) throw new SandboxError('INVALID_CLOCK', 'clock value must be a non-negative safe integer');
  }

  /** @returns Current unix seconds. */
  public now(): number {
    return this.seconds;
  }

  /**
   * Moves time forward.
   * @param delta Whole seconds, >= 0.
   * @returns New time.
   * @throws {SandboxError} `INVALID_CLOCK` on a negative or non-integer delta.
   */
  public advance(delta: number): number {
    ManualClock.check(delta);
    this.seconds += delta;
    return this.seconds;
  }

  /**
   * Jumps to an absolute time. Cannot move backwards.
   * @throws {SandboxError} `INVALID_CLOCK` if `t` is invalid or earlier than now.
   */
  public set(t: number): number {
    ManualClock.check(t);
    if (t < this.seconds) throw new SandboxError('INVALID_CLOCK', 'clock cannot move backwards');
    this.seconds = t;
    return t;
  }
}
