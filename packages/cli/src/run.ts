import { GLOBAL_SWITCHES, parseArgs, suggest, type GlobalSwitch, type Parsed } from './args.js';
import { batchCommands } from './commands/batch.js';
import { doctorCommands } from './commands/doctor.js';
import { exportCommands } from './commands/export.js';
import { i18nCommands } from './commands/i18n.js';
import { invoiceCommands } from './commands/invoice.js';
import { merchantCommands } from './commands/merchant.js';
import { refundCommands } from './commands/merchant-refund.js';
import { operatorCommands } from './commands/operator.js';
import { paymentCommands } from './commands/payment.js';
import { receiptCommands } from './commands/receipt.js';
import { backupCommands } from './commands/backup.js';
import { chainCommands, diagnosticsRpcCommands } from './commands/chain.js';
import { historyCommands } from './commands/history.js';
import { qrCommands } from './commands/qr.js';
import { sellerCommands } from './commands/seller.js';
import { scanCommands } from './commands/scan.js';
import { reconcileCommands } from './commands/reconcile.js';
import { registryCommands } from './commands/registry.js';
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

import { VERSION } from './version.js';
export { VERSION } from './version.js';

export const COMMANDS: readonly Command[] = [
  ...invoiceCommands,
  ...receiptCommands,
  ...paymentCommands,
  ...merchantCommands,
  ...refundCommands,
  ...operatorCommands,
  ...backupCommands,
  ...chainCommands,
  ...diagnosticsRpcCommands,
  ...historyCommands,
  ...qrCommands,
  ...sellerCommands,
  ...scanCommands,
  ...reconcileCommands,
  ...registryCommands,
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
    `ghostpay ${VERSION} - GhostPay command line (offline by default; explicit read-only RPC, no telemetry)`,
    '',
    'Requires Node >=22.',
    'Usage: ghostpay <command> [options]   (add --json for machine output, --help for details)',
    '',
    'Commands:',
    ...COMMANDS.map((c) => `  ${c.path.join(' ').padEnd(width)}  ${c.summary}`),
    '',
    'Secrets (keys, webhook secrets) are never accepted as arguments: use --key-file/--key-env NAME/--key-stdin',
    'and --secret-file/--secret-env NAME/--secret-stdin. Use "-" as a path to read stdin.',
    'Exit codes: 0 ok, 1 verification or validation failed, 2 usage error, 3 I/O error, 4 network failure, 5 unsupported, 6 configuration failure.',
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
 * @returns Process exit code: 0 ok, 1 failed check, 2 usage, 3 I/O, 4 network, 5 unsupported, 6 configuration.
 * @security Never prints secrets or raw untrusted input; secrets are accepted only from file, stdin or env var NAME.
 */
export async function run(argv: readonly string[], io: Io): Promise<number> {
  // --json never becomes an option value (parseArgs refuses `--` tokens as values), so it can be
  // detected up front; this only selects the output format, including for parse errors.
  const terminator = argv.indexOf('--');
  const json = (terminator === -1 ? argv : argv.slice(0, terminator)).includes('--json');
  const ctx = new Ctx(io, json);
  try {
    // Leading words name the command; global switches may be mixed in before the first other option.
    const words: string[] = [];
    const globals = new Set<GlobalSwitch>();
    let i = 0;
    for (; i < argv.length; i++) {
      const a = argv[i] as string;
      const g = GLOBAL_SWITCHES.get(a);
      if (g !== undefined) globals.add(g);
      else if (a.startsWith('-')) break;
      else words.push(a);
    }
    const tail = argv.slice(i);
    const found = words.length === 0 || words[0] === 'help' ? undefined : find(words);
    let parsed: Parsed | undefined;
    if (found !== undefined) {
      // The command's own option spec decides which tokens are values, so a global switch is
      // recognised only in a flag position. After a value-taking option, `-h` is that option's value
      // and `--help`/`--version` are a missing value like any other `--` token.
      parsed = parseArgs([...words.slice(found.command.path.length), ...tail], found.command.opts, globals);
    } else {
      // No command, hence no value-taking options: every token before `--` is in a flag position.
      for (const a of tail) {
        if (a === '--') break;
        const g = GLOBAL_SWITCHES.get(a);
        if (g !== undefined) globals.add(g);
      }
    }
    const help = globals.has('help');
    if (globals.has('version')) {
      ctx.out({ ok: true, version: VERSION }, VERSION);
      return EXIT_OK;
    }
    if (words.length === 0 && tail.some((a) => !GLOBAL_SWITCHES.has(a)) && !help)
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
    if (found === undefined || parsed === undefined) {
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
    return await found.command.handler(ctx, parsed);
  } catch (e) {
    const err = describe(e);
    if (json) io.stderr(`${JSON.stringify({ ok: false, error: { code: err.code, message: err.message, ...(err.hint === undefined ? {} : { hint: err.hint }) } })}\n`);
    else io.stderr(`ghostpay: error: ${err.message}${err.hint === undefined ? '' : `\n  hint: ${err.hint}`}\n`);
    return err.exitCode;
  }
}
