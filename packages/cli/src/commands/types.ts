import type { OptSpec, Parsed } from '../args.js';
import type { Ctx } from '../ctx.js';

export interface Command {
  readonly path: readonly string[];
  readonly summary: string;
  readonly usage: string;
  readonly opts: OptSpec;
  /** @returns exit code 0 or 1 (other failures are thrown as CliError). */
  readonly handler: (ctx: Ctx, a: Parsed) => Promise<number>;
}
