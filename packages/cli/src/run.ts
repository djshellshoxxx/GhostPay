import { suggest, parseArgs } from './args.js';
import { batchCommands } from './commands/batch.js';
import { doctorCommands } from './commands/doctor.js';
import { exportCommands } from './commands/export.js';
import { i18nCommands } from './commands/i18n.js';
import { invoiceCommands } from './commands/invoice.js';
import { sandboxCommands } from './commands/sandbox.js';
import { splitCommands } from './commands/split.js';
import { subCommands } from './commands/sub.js';
import type { Command } from './commands/types.js';
import { webhookCommands } from './commands/webhook.js';
import { Ctx } from './ctx.js';
import { CliError, EXIT_OK, safeToken, usageError, type Io } from './io.js';
import { BillingError } from '@ghostpay/merchant-billing';
import { I18nError } from '@ghostpay/i18n';
import { InvoiceError } from '@ghostpay/invoice-schema';
import { LedgerError } from '@ghostpay/merchant-ledger';
import { HooksError } from '@ghostpay/merchant-hooks';
import { SandboxError } from '@ghostpay/sandbox';

export const VERSION = '0.1.0';

export const COMMANDS: readonly Command[] = [
  ...invoiceCommands,
  ...webhookCommands,
  ...subCommands,
  ...splitCommands,
  ...batchCommands,
  ...exportCommands,
  ...sandboxCommands,
  ...i18nCommands,
  ...doctorCommands,
];

function topHelp(): string {
  const width = Math.max(...COMMANDS.map((c) => c.path.join(' ').length));
  return [
    `ghostpay ${VERSION} - GhostPay command line (offline: no network, no telemetry)`,
    '',
    'Usage: ghostpay <command> [options]   (add --json for machine output, --help for details)',
    '',
    'Commands:',
    ...COMMANDS.map((c) => `  ${c.path.join(' ').padEnd(width)}  ${c.summary}`),
    '',
    'Secrets (keys, webhook secrets) are never accepted as arguments: use --key-file/--key-env NAME/--key-stdin',
    'and --secret-file/--secret-env NAME/--secret-stdin. Use "-" as a path to read stdin.',
    'Exit codes: 0 ok, 1 verification or validation failed, 2 usage error, 3 I/O error.',
  ].join('\n');
}

function commandHelp(c: Command): string {
  return `${c.summary}\n\nUsage: ${c.usage}\n\nAlso: --json (machine output), --help`;
}

function groupHelp(word: string): string {
  const subs = COMMANDS.filter((c) => c.path[0] === word);
  return [`ghostpay ${word} - subcommands:`, ...subs.map((c) => `  ${c.path.join(' ')}  ${c.summary}`)].join('\n');
}

function find(words: readonly string[]): { command: Command; rest: readonly string[] } | undefined {
  let best: Command | undefined;
  for (const c of COMMANDS)
    if (c.path.length <= words.length && c.path.every((w, i) => words[i] === w) && (best === undefined || c.path.length > best.path.length)) best = c;
  return best === undefined ? undefined : { command: best, rest: words.slice(best.path.length) };
}

function describe(e: unknown): CliError {
  if (e instanceof CliError) return e;
  if (e instanceof InvoiceError)
    return new CliError('fail', e.code, `invoice rejected (${e.code}${e.path === undefined ? '' : ` at ${e.path}`}).`, 'Check the input against the invoice schema.');
  if (e instanceof BillingError)
    return new CliError('fail', e.code, `rejected (${e.code}${e.where === undefined ? '' : ` at ${e.where}`}): ${e.message}.`);
  if (e instanceof LedgerError || e instanceof HooksError || e instanceof SandboxError || e instanceof I18nError)
    return new CliError('fail', e.code, `rejected (${e.code}).`, 'Check the input values for this command.');
  return new CliError('fail', 'INTERNAL', 'unexpected internal error.', 'Run `ghostpay doctor`; this is a bug if it persists.');
}

/**
 * Runs the CLI. Pure with respect to the process: all effects go through `io`.
 *
 * @param argv Arguments after the executable name.
 * @param io Injected stdout/stderr/files/stdin/env/clock/randomness.
 * @returns Process exit code: 0 ok, 1 failed check, 2 usage, 3 I/O.
 * @security Never prints secrets or raw untrusted input; secrets are accepted only from file, stdin or env var NAME.
 */
export async function run(argv: readonly string[], io: Io): Promise<number> {
  const args: string[] = [];
  let json = false;
  let help = false;
  let version = false;
  let rest = false;
  for (const a of argv) {
    if (!rest && a === '--') rest = true;
    if (!rest && a === '--json') json = true;
    else if (!rest && (a === '--help' || a === '-h')) help = true;
    else if (!rest && a === '--version') version = true;
    else args.push(a);
  }
  const ctx = new Ctx(io, json);
  try {
    if (version) {
      ctx.out({ ok: true, version: VERSION }, VERSION);
      return EXIT_OK;
    }
    const words: string[] = [];
    for (const a of args) {
      if (a.startsWith('-')) break;
      words.push(a);
    }
    if (words.length === 0 && args.length > 0 && !help)
      throw usageError('UNKNOWN_OPTION', 'options must come after a command.', 'Run `ghostpay --help` to list commands.');
    if (words.length === 0 || words[0] === 'help') {
      if (words[0] === 'help' && words.length > 1) {
        const f = find(words.slice(1));
        if (f !== undefined) {
          ctx.out({ ok: true, usage: f.command.usage }, commandHelp(f.command));
          return EXIT_OK;
        }
      }
      ctx.out({ ok: true, commands: COMMANDS.map((c) => ({ command: c.path.join(' '), summary: c.summary })) }, topHelp());
      return EXIT_OK;
    }
    const found = find(words);
    if (found === undefined) {
      const groups = [...new Set(COMMANDS.map((c) => c.path[0] as string))];
      if (groups.includes(words[0] as string)) {
        if (help) {
          ctx.out({ ok: true, commands: COMMANDS.filter((c) => c.path[0] === words[0]).map((c) => c.path.join(' ')) }, groupHelp(words[0] as string));
          return EXIT_OK;
        }
        throw usageError('MISSING_SUBCOMMAND', `"${words[0] as string}" needs a subcommand.`, groupHelp(words[0] as string).replace(/\n/g, '; '));
      }
      const near = suggest(words[0] as string, groups);
      throw usageError(
        'UNKNOWN_COMMAND',
        `unknown command "${safeToken(words[0] as string)}".`,
        near === undefined ? 'Run `ghostpay --help` to list commands.' : `Did you mean \`ghostpay ${near}\`?`,
      );
    }
    if (help) {
      ctx.out({ ok: true, usage: found.command.usage }, commandHelp(found.command));
      return EXIT_OK;
    }
    return await found.command.handler(ctx, parseArgs(args.slice(found.command.path.length), found.command.opts));
  } catch (e) {
    const err = describe(e);
    if (json) io.stderr(`${JSON.stringify({ ok: false, error: { code: err.code, message: err.message, ...(err.hint === undefined ? {} : { hint: err.hint }) } })}\n`);
    else io.stderr(`ghostpay: error: ${err.message}${err.hint === undefined ? '' : `\n  hint: ${err.hint}`}\n`);
    return err.exitCode;
  }
}
