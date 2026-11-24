import { parseArgs } from './args.js';
import { Ctx } from './ctx.js';
import type { Command } from './commands/types.js';
import type { TestIo } from './fixtures.testutil.js';

/** Exercise the same public handler/argument seam used by the process entry. */
export async function invoke(commands: readonly Command[], name: string, args: readonly string[], io: TestIo, json = true): Promise<number> {
  const command = commands.find((candidate) => candidate.path.join(' ') === name);
  if (command === undefined) throw new Error(`Missing command: ${name}`);
  return command.handler(new Ctx(io, json), parseArgs(args, command.opts));
}

export function result(io: TestIo): Record<string, unknown> {
  return JSON.parse(io.out.join('').trim()) as Record<string, unknown>;
}
