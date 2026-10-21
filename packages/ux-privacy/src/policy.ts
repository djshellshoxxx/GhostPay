import { fail } from './errors.js';

/** `PolicyAccountFactory.MIN_DELAY` (1 hour), mirrored from packages/policy-scheme. */
export const MIN_TIMELOCK_SECONDS = 3600n;
/** `PolicyAccount.MAX_DELAY` (30 days), mirrored from packages/policy-scheme. */
export const MAX_TIMELOCK_SECONDS = 30n * 24n * 3600n;
/** Largest uint64, bound of a limit window. */
export const MAX_WINDOW_SECONDS = 2n ** 64n - 1n;
/** Largest uint256; as a limit it means unlimited (policy-scheme `UNLIMITED`). */
export const UNLIMITED_LIMIT = 2n ** 256n - 1n;
/** Native coin pseudo-token. */
export const NATIVE_TOKEN = '0x0000000000000000000000000000000000000000';
/** Maximum guardians accepted by this describer. */
export const MAX_GUARDIANS = 10;
/** Maximum allowlist entries accepted by this describer. */
export const MAX_ALLOWLIST = 50;
/** Maximum spend-limit rows. */
export const MAX_LIMITS = 50;
/** Time-lock below which a warning is raised (24 hours). */
export const SHORT_TIMELOCK_SECONDS = 24n * 3600n;

/** A spend limit row as the user entered it. */
export interface FriendlySpendLimit {
  /** ERC-20 address, or the zero address for the native coin. */
  readonly token: string;
  /** Display symbol (untrusted, 1-12 of `A-Za-z0-9$.-`). */
  readonly symbol: string;
  /** Token decimals, 0-36. */
  readonly decimals: number;
  /** Cap per window in base units, or `'unlimited'`. */
  readonly limit: bigint | 'unlimited';
  /** Window length in seconds (ignored for unlimited). */
  readonly windowSeconds: bigint;
}

/** A guardian (recovery/co-approver). */
export interface FriendlyGuardian {
  readonly address: string;
  /** Optional human label, at most 40 printable characters. */
  readonly label?: string;
}

/** Human-level policy. Pure data; nothing here touches a chain. */
export interface FriendlyPolicy {
  /** Optional account nickname (at most 40 printable characters). */
  readonly name?: string;
  /** Where withdrawals go. */
  readonly destination: string;
  /** Withdrawal time-lock in seconds. */
  readonly timeLockSeconds: bigint;
  /** Per-token spend limits; empty means no limits. */
  readonly spendLimits: readonly FriendlySpendLimit[];
  /** Optional list of approved recipients (not enforceable by the current scheme). */
  readonly allowlist?: readonly string[];
  /** Optional guardians (not enforceable by the current scheme). */
  readonly guardians?: readonly FriendlyGuardian[];
  /** Guardian approvals required, 1..guardians.length. */
  readonly guardianThreshold?: number;
}

/** Severity of a validation finding. */
export type IssueSeverity = 'error' | 'warning' | 'info';

/** One validation finding. */
export interface PolicyIssue {
  readonly severity: IssueSeverity;
  /** Stable code. */
  readonly code: string;
  /** Dotted field path. */
  readonly field: string;
  /** i18n key (`policy.issue.<code>`). */
  readonly key: string;
  /** Plain-English fallback. */
  readonly message: string;
}

/** Validation result. `ok` is true iff there is no `error`. */
export interface PolicyValidation {
  readonly ok: boolean;
  readonly issues: readonly PolicyIssue[];
}

/** Whether the current on-chain scheme enforces a feature. */
export type Enforcement = 'onchain' | 'notEnforced';

/** One line of the plain-language summary. */
export interface DescriptionLine {
  readonly feature: 'destination' | 'timeLock' | 'spendLimit' | 'allowlist' | 'guardians' | 'destinationChange';
  /** i18n key. */
  readonly key: string;
  readonly text: string;
  readonly enforcement: Enforcement;
}

/** Plain-language policy summary. */
export interface PolicyDescription {
  readonly headline: string;
  readonly lines: readonly DescriptionLine[];
  readonly warnings: readonly PolicyIssue[];
}

/** Plain data accepted by `buildLimitsTree`/`validatePolicy` of policy-scheme (addresses lowercase). */
export interface SchemePolicyInput {
  readonly destination: string;
  readonly delaySeconds: bigint;
  readonly limits: readonly { token: string; limit: bigint; windowSeconds: bigint }[];
}

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const SYMBOL_RE = /^[A-Za-z0-9$.-]{1,12}$/;
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/;
const MAX_LABEL = 40;

/** @internal */
function issue(severity: IssueSeverity, code: string, field: string, message: string): PolicyIssue {
  return { severity, code, field, key: `policy.issue.${code}`, message };
}

/** @internal Validates an address; mixed case is accepted but its checksum is not verified here. */
function checkAddress(value: unknown, field: string, out: PolicyIssue[], allowZero = false): string | null {
  if (typeof value !== 'string' || !ADDR_RE.test(value)) {
    out.push(issue('error', 'INVALID_ADDRESS', field, 'This is not a valid 0x address (40 hex characters).'));
    return null;
  }
  const lower = value.toLowerCase();
  if (!allowZero && lower === NATIVE_TOKEN) {
    out.push(issue('error', 'ZERO_ADDRESS', field, 'The zero address is not allowed here.'));
    return null;
  }
  const body = value.slice(2);
  if (body !== body.toLowerCase() && body !== body.toUpperCase()) {
    out.push(
      issue('warning', 'CHECKSUM_UNVERIFIED', field, 'Mixed-case address: its checksum is not verified by this check; verify it before use.'),
    );
  }
  return lower;
}

/** @internal */
function checkLabel(value: unknown, field: string, out: PolicyIssue[]): void {
  if (value === undefined) return;
  if (typeof value !== 'string' || value.length > MAX_LABEL || CONTROL_RE.test(value)) {
    out.push(issue('error', 'INVALID_LABEL', field, 'Names must be at most 40 characters without control characters.'));
  }
}

/** @internal Plain-language duration, largest units first, at most two parts. */
export function formatDuration(seconds: bigint): string {
  if (seconds < 0n) return fail('seconds');
  const units: readonly (readonly [bigint, string])[] = [
    [86400n, 'day'],
    [3600n, 'hour'],
    [60n, 'minute'],
    [1n, 'second'],
  ];
  const parts: string[] = [];
  let rest = seconds;
  for (const [size, name] of units) {
    const n = rest / size;
    rest %= size;
    if (n > 0n && parts.length < 2) parts.push(`${String(n)} ${name}${n === 1n ? '' : 's'}`);
  }
  return parts.length === 0 ? '0 seconds' : parts.join(' ');
}

/** @internal Window phrase: "per day", "per 6 hours". */
function windowPhrase(seconds: bigint): string {
  if (seconds === 86400n) return 'per day';
  if (seconds === 3600n) return 'per hour';
  if (seconds === 7n * 86400n) return 'per week';
  return `per ${formatDuration(seconds)}`;
}

/**
 * Formats base units with decimals, trimming trailing zeros.
 *
 * @param amount Non-negative base-unit amount.
 * @param decimals Integer 0-36.
 * @returns Decimal string such as `1.5`.
 * @throws {UxPrivacyError} `INVALID_INPUT` for a negative amount or bad decimals.
 */
export function formatUnits(amount: bigint, decimals: number): string {
  if (typeof amount !== 'bigint' || amount < 0n) return fail('amount');
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) return fail('decimals');
  const s = amount.toString().padStart(decimals + 1, '0');
  const whole = s.slice(0, s.length - decimals);
  const frac = s.slice(s.length - decimals).replace(/0+$/, '');
  return frac === '' ? whole : `${whole}.${frac}`;
}

/** @internal */
export function shortAddress(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/**
 * Validates a friendly policy against the rules of the official factory plus honesty checks.
 *
 * @remarks Mirrors `validatePolicy` and `buildLimitsTree` of policy-scheme (non-zero destination,
 * time-lock 1 hour to 30 days, positive limits, non-zero window for limited rows, no duplicate
 * tokens). Allowlists and guardians are accepted as data but flagged `NOT_ENFORCED`: the scheme
 * has a single destination and no guardian role. Pure; never throws on bad input, it reports.
 *
 * @param p Untrusted policy.
 * @returns All findings; `ok` is false if any is an error.
 * @security A policy this function rejects would make funds unrecoverable if published (the factory
 * refuses it). Unenforced features must never be presented as protections.
 */
export function validateFriendlyPolicy(p: FriendlyPolicy): PolicyValidation {
  const out: PolicyIssue[] = [];
  if (typeof p !== 'object' || p === null) {
    return { ok: false, issues: [issue('error', 'INVALID_POLICY', 'policy', 'The policy is missing or malformed.')] };
  }
  checkLabel(p.name, 'name', out);
  const dest = checkAddress(p.destination, 'destination', out);

  const t = p.timeLockSeconds;
  if (typeof t !== 'bigint' || t < MIN_TIMELOCK_SECONDS || t > MAX_TIMELOCK_SECONDS) {
    out.push(issue('error', 'INVALID_TIMELOCK', 'timeLockSeconds', 'The time-lock must be between 1 hour and 30 days.'));
  } else if (t < SHORT_TIMELOCK_SECONDS) {
    out.push(issue('warning', 'SHORT_TIMELOCK', 'timeLockSeconds', 'A time-lock under 24 hours leaves little time to notice and cancel an unwanted withdrawal.'));
  }

  const limits: unknown = p.spendLimits;
  if (!Array.isArray(limits) || limits.length > MAX_LIMITS) {
    out.push(issue('error', 'INVALID_LIMITS', 'spendLimits', 'Spend limits must be a list of at most 50 rows.'));
  } else if (limits.length === 0) {
    out.push(issue('warning', 'NO_LIMITS', 'spendLimits', 'No spend limits: whoever controls the key can withdraw the whole balance after the time-lock.'));
  } else {
    const seen = new Set<string>();
    (p.spendLimits).forEach((l, i) => {
      const f = `spendLimits[${String(i)}]`;
      const tok = typeof l === 'object' && l !== null ? checkAddress(l.token, `${f}.token`, out, true) : null;
      if (typeof l !== 'object' || l === null) {
        out.push(issue('error', 'INVALID_LIMITS', f, 'This limit row is malformed.'));
        return;
      }
      if (tok !== null) {
        if (seen.has(tok)) out.push(issue('error', 'DUPLICATE_TOKEN', `${f}.token`, 'Each token may appear only once.'));
        seen.add(tok);
      }
      if (typeof l.symbol !== 'string' || !SYMBOL_RE.test(l.symbol)) {
        out.push(issue('error', 'INVALID_SYMBOL', `${f}.symbol`, 'Symbols are 1-12 letters, digits or $ . -'));
      }
      if (!Number.isInteger(l.decimals) || l.decimals < 0 || l.decimals > 36) {
        out.push(issue('error', 'INVALID_DECIMALS', `${f}.decimals`, 'Decimals must be a whole number from 0 to 36.'));
      }
      if (l.limit !== 'unlimited') {
        if (typeof l.limit !== 'bigint' || l.limit < 1n || l.limit >= UNLIMITED_LIMIT) {
          out.push(issue('error', 'INVALID_LIMIT', `${f}.limit`, 'The limit must be greater than zero.'));
        }
        if (typeof l.windowSeconds !== 'bigint' || l.windowSeconds < 1n || l.windowSeconds > MAX_WINDOW_SECONDS) {
          out.push(issue('error', 'INVALID_WINDOW', `${f}.windowSeconds`, 'The window must be at least 1 second.'));
        }
      }
    });
    out.push(
      issue('info', 'UNLISTED_TOKENS_BLOCKED', 'spendLimits', 'Tokens without a limit row cannot be withdrawn at all; add an "unlimited" row for every token you may receive.'),
    );
  }

  if (p.allowlist !== undefined) {
    const list: unknown = p.allowlist;
    if (!Array.isArray(list) || list.length > MAX_ALLOWLIST) {
      out.push(issue('error', 'INVALID_ALLOWLIST', 'allowlist', 'The allowlist must be a list of at most 50 addresses.'));
    } else if (list.length > 0) {
      const set = new Set<string>();
      (list as unknown[]).forEach((a, i) => {
        const x = checkAddress(a, `allowlist[${String(i)}]`, out);
        if (x !== null) {
          if (set.has(x)) out.push(issue('error', 'DUPLICATE_ADDRESS', `allowlist[${String(i)}]`, 'This address is listed twice.'));
          set.add(x);
        }
      });
      if (dest !== null && !set.has(dest)) {
        out.push(issue('error', 'DESTINATION_NOT_ALLOWLISTED', 'destination', 'The withdrawal destination is not on your allowlist.'));
      }
      if (set.size > 1 || (set.size === 1 && dest === null)) {
        out.push(issue('warning', 'NOT_ENFORCED', 'allowlist', 'The current scheme pays out to one destination only; extra allowlist entries are not enforced on-chain.'));
      }
    }
  }

  if (p.guardians !== undefined) {
    const gl: unknown = p.guardians;
    if (!Array.isArray(gl) || gl.length > MAX_GUARDIANS) {
      out.push(issue('error', 'INVALID_GUARDIANS', 'guardians', 'Guardians must be a list of at most 10.'));
    } else if (gl.length > 0) {
      const set = new Set<string>();
      (p.guardians).forEach((g, i) => {
        const f = `guardians[${String(i)}]`;
        if (typeof g !== 'object' || g === null) {
          out.push(issue('error', 'INVALID_GUARDIANS', f, 'This guardian entry is malformed.'));
          return;
        }
        const x = checkAddress(g.address, `${f}.address`, out);
        checkLabel(g.label, `${f}.label`, out);
        if (x !== null) {
          if (set.has(x)) out.push(issue('error', 'DUPLICATE_ADDRESS', `${f}.address`, 'This guardian is listed twice.'));
          if (x === dest) out.push(issue('warning', 'GUARDIAN_IS_DESTINATION', `${f}.address`, 'A guardian that is also the destination adds no independent protection.'));
          set.add(x);
        }
      });
      const th = p.guardianThreshold;
      if (th === undefined || !Number.isInteger(th) || th < 1 || th > gl.length) {
        out.push(issue('error', 'INVALID_THRESHOLD', 'guardianThreshold', 'The approvals needed must be between 1 and the number of guardians.'));
      }
      out.push(issue('warning', 'NOT_ENFORCED', 'guardians', 'Guardians are not part of the current scheme and are not enforced on-chain.'));
    }
  } else if (p.guardianThreshold !== undefined) {
    out.push(issue('error', 'INVALID_THRESHOLD', 'guardianThreshold', 'A threshold needs guardians.'));
  }

  return { ok: !out.some((x) => x.severity === 'error'), issues: out };
}

/**
 * Plain-language summary of a policy.
 *
 * @remarks Output text is built only from validated, typed pieces; user strings (names, labels,
 * symbols) are character-restricted by {@link validateFriendlyPolicy}, but the UI must still render
 * them as text, never HTML.
 *
 * @param p Policy.
 * @returns Headline, one line per feature (marked on-chain or not enforced) and warnings.
 * @throws {UxPrivacyError} `INVALID_INPUT` if the policy has validation errors.
 * @security Lines for allowlists and guardians say "not enforced"; the describer never presents
 * them as protections the chain provides.
 */
export function describePolicy(p: FriendlyPolicy): PolicyDescription {
  const v = validateFriendlyPolicy(p);
  if (!v.ok) return fail('policy');
  const lines: DescriptionLine[] = [];
  const dest = p.destination.toLowerCase();
  lines.push({
    feature: 'destination',
    key: 'policy.line.destination',
    text: `Withdrawals can only go to ${shortAddress(dest)}.`,
    enforcement: 'onchain',
  });
  lines.push({
    feature: 'timeLock',
    key: 'policy.line.timeLock',
    text: `Every withdrawal waits ${formatDuration(p.timeLockSeconds)} before it can complete, and can be cancelled meanwhile.`,
    enforcement: 'onchain',
  });
  lines.push({
    feature: 'destinationChange',
    key: 'policy.line.destinationChange',
    text: `Changing the destination waits ${formatDuration(p.timeLockSeconds * 2n)} (twice the time-lock).`,
    enforcement: 'onchain',
  });
  if (p.spendLimits.length === 0) {
    lines.push({ feature: 'spendLimit', key: 'policy.line.noLimits', text: 'There is no spend limit.', enforcement: 'onchain' });
  }
  for (const l of p.spendLimits) {
    const who = l.token.toLowerCase() === NATIVE_TOKEN ? `${l.symbol} (native coin)` : `${l.symbol} (${shortAddress(l.token.toLowerCase())})`;
    const text =
      l.limit === 'unlimited'
        ? `${who}: no limit.`
        : `${who}: at most ${formatUnits(l.limit, l.decimals)} ${l.symbol} ${windowPhrase(l.windowSeconds)}.`;
    lines.push({ feature: 'spendLimit', key: l.limit === 'unlimited' ? 'policy.line.limitNone' : 'policy.line.limit', text, enforcement: 'onchain' });
  }
  const allow = p.allowlist ?? [];
  if (allow.length > 0) {
    lines.push({
      feature: 'allowlist',
      key: 'policy.line.allowlist',
      text: `You listed ${String(allow.length)} approved recipient(s); the scheme itself only enforces the single destination above.`,
      enforcement: 'notEnforced',
    });
  }
  const gs = p.guardians ?? [];
  if (gs.length > 0) {
    lines.push({
      feature: 'guardians',
      key: 'policy.line.guardians',
      text: `${String(p.guardianThreshold ?? 0)} of ${String(gs.length)} guardians would need to approve, but this is not enforced on-chain.`,
      enforcement: 'notEnforced',
    });
  }
  const limited = p.spendLimits.filter((l) => l.limit !== 'unlimited').length;
  const headline =
    `${p.name !== undefined && p.name !== '' ? `${p.name}: ` : ''}` +
    `pays out to one destination after a ${formatDuration(p.timeLockSeconds)} wait, ` +
    (limited > 0 ? `with ${String(limited)} spend limit(s).` : 'with no spend limit.');
  return Object.freeze({
    headline,
    lines: Object.freeze(lines),
    warnings: Object.freeze(v.issues.filter((x) => x.severity !== 'info')),
  });
}

/**
 * Maps a valid friendly policy to the plain inputs of policy-scheme's `validatePolicy` and
 * `buildLimitsTree`. Allowlist and guardians are dropped (they have no on-chain form).
 *
 * @param p Policy.
 * @returns Destination, delay and limits with lowercase addresses; `unlimited` becomes `2^256-1`
 * with window 0, as policy-scheme expects.
 * @throws {UxPrivacyError} `INVALID_INPUT` if the policy has validation errors.
 * @security Pure data; the caller must pass the result through policy-scheme's own validation.
 */
export function toSchemePolicyInput(p: FriendlyPolicy): SchemePolicyInput {
  if (!validateFriendlyPolicy(p).ok) return fail('policy');
  return {
    destination: p.destination.toLowerCase(),
    delaySeconds: p.timeLockSeconds,
    limits: p.spendLimits.map((l) =>
      l.limit === 'unlimited'
        ? { token: l.token.toLowerCase(), limit: UNLIMITED_LIMIT, windowSeconds: 0n }
        : { token: l.token.toLowerCase(), limit: l.limit, windowSeconds: l.windowSeconds },
    ),
  };
}
