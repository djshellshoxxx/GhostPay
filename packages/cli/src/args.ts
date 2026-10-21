import { safeToken, usageError } from './io.js';

export type OptKind = 'value' | 'flag' | 'multi';
export type OptSpec = Readonly<Record<string, OptKind>>;

export interface Parsed {
  readonly values: ReadonlyMap<string, string>;
  readonly multi: ReadonlyMap<string, readonly string[]>;
  readonly flags: ReadonlySet<string>;
  readonly positionals: readonly string[];
}

/** Option names that look like inline secrets. Refused everywhere unless a command declares them itself. */
const SECRET_NAMES = new Set([
  'key',
  'secret',
  'private-key',
  'signing-key',
  'password',
  'passphrase',
  'mnemonic',
  'seed-phrase',
  'api-key',
]);

function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0] as number;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j] as number;
      prev[j] = Math.min(up + 1, (prev[j - 1] as number) + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length] as number;
}

/** Closest candidate within a small edit distance, or undefined. */
export function suggest(word: string, candidates: readonly string[]): string | undefined {
  let best: string | undefined;
  let bestD = 3;
  for (const c of candidates) {
    const d = editDistance(word, c);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/**
 * Parses `--name value`, `--name=value`, flags and repeatable options against a spec.
 *
 * @security Refuses option names that suggest an inline secret and never echoes option values in errors.
 */
export function parseArgs(argv: readonly string[], spec: OptSpec): Parsed {
  const values = new Map<string, string>();
  const multi = new Map<string, string[]>();
  const flags = new Set<string>();
  const positionals: string[] = [];
  const names = Object.keys(spec);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (arg === '--') {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }
    const eq = arg.indexOf('=');
    const name = arg.slice(2, eq === -1 ? undefined : eq);
    const kind = Object.hasOwn(spec, name) ? spec[name] : undefined;
    if (kind === undefined) {
      if (SECRET_NAMES.has(name))
        throw usageError(
          'SECRET_ON_ARGV',
          `--${name} is refused: secrets must not be passed on the command line (they leak via shell history and process lists).`,
          'Use the command\'s *-file, *-stdin or *-env NAME option instead (see --help).',
        );
      const near = suggest(name, names);
      throw usageError(
        'UNKNOWN_OPTION',
        `unknown option --${safeToken(name)}.`,
        near === undefined ? 'Run the command with --help to list options.' : `Did you mean --${near}?`,
      );
    }
    if (kind === 'flag') {
      if (eq !== -1) throw usageError('BAD_OPTION', `--${name} does not take a value.`);
      flags.add(name);
      continue;
    }
    let value: string;
    if (eq !== -1) value = arg.slice(eq + 1);
    else {
      const next = argv[i + 1];
      if (next === undefined || (next.startsWith('--') && next !== '--'))
        throw usageError('MISSING_VALUE', `--${name} needs a value.`);
      value = next;
      i++;
    }
    if (kind === 'multi') multi.set(name, [...(multi.get(name) ?? []), value]);
    else {
      if (values.has(name)) throw usageError('DUPLICATE_OPTION', `--${name} was given twice.`);
      values.set(name, value);
    }
  }
  return { values, multi, flags, positionals };
}

export function requireValue(a: Parsed, name: string): string {
  const v = a.values.get(name);
  if (v === undefined) throw usageError('MISSING_OPTION', `--${name} is required.`, 'Run the command with --help for usage.');
  return v;
}

export function noPositionals(a: Parsed): void {
  if (a.positionals.length > 0)
    throw usageError('UNEXPECTED_ARGUMENT', 'unexpected extra argument.', 'Options take the form --name value.');
}

/** Strict non-negative safe integer from option text. */
export function parseIntOption(text: string, name: string, min: number, max: number): number {
  if (!/^(?:0|[1-9][0-9]{0,15})$/.test(text)) throw usageError('BAD_NUMBER', `--${name} must be a whole number.`);
  const n = Number(text);
  if (!Number.isSafeInteger(n) || n < min || n > max)
    throw usageError('BAD_NUMBER', `--${name} must be between ${min} and ${max}.`);
  return n;
}

/** Unix seconds from `now`, digits, or strict `YYYY-MM-DDTHH:MM:SSZ`. */
export function parseTime(text: string, name: string, now: () => number): number {
  if (text === 'now') return now();
  if (/^[0-9]{1,12}$/.test(text)) return Number(text);
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})Z$/.exec(text);
  if (m !== null) {
    const ms = Date.parse(`${m[1] as string}.000Z`);
    if (!Number.isNaN(ms) && new Date(ms).toISOString() === `${m[1] as string}.000Z`) return ms / 1000;
  }
  throw usageError('BAD_TIME', `--${name} must be unix seconds, "now", or YYYY-MM-DDTHH:MM:SSZ.`);
}
