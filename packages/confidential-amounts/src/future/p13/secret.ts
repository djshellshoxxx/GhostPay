/**
 * Client-side handling of plaintext confidential amounts. A `SecretAmount` keeps the bigint in a private field,
 * refuses every serialisation path and is read only through `reveal`. JavaScript bigints are immutable and cannot be
 * wiped: `dispose` drops the reference, it does not zeroise memory. This is a guardrail against accidental disclosure
 * (logs, JSON, storage, worker messages), not a boundary against a compromised page.
 */
import { check, fail } from './errors.js';
import { EUINT64_DOMAIN, assertInDomain, parseDecimalUnits, type AmountDomain } from './units.js';

const REDACTED = '[SecretAmount]';

/** An amount that must not leave the local process in plaintext. */
export class SecretAmount {
  #value: bigint | undefined;

  private constructor(value: bigint) {
    this.#value = value;
  }

  /** Wraps an amount after a domain check (default 1..2^64-1). */
  public static from(value: bigint, domain: AmountDomain = EUINT64_DOMAIN): SecretAmount {
    return new SecretAmount(assertInDomain(value, domain));
  }

  /** Wraps a COMMON `DecimalUnits` string. */
  public static fromDecimalUnits(text: unknown, domain: AmountDomain = EUINT64_DOMAIN): SecretAmount {
    return SecretAmount.from(parseDecimalUnits(text), domain);
  }

  /** True after {@link dispose}. */
  public get disposed(): boolean {
    return this.#value === undefined;
  }

  /**
   * Runs `fn` with the plaintext. `fn` must not store or return the value to a place that outlives the call.
   * @throws {P13Error} `P13_SECRET_DISPOSED` after {@link dispose}.
   */
  public reveal<T>(fn: (value: bigint) => T): T {
    const v = this.#value;
    check(v !== undefined, 'P13_SECRET_DISPOSED', 'secret amount was disposed');
    return fn(v);
  }

  /** True if both hold the same amount. */
  public equals(other: SecretAmount): boolean {
    return this.reveal((a) => other.reveal((b) => a === b));
  }

  /** Drops the reference. Idempotent. */
  public dispose(): void {
    this.#value = undefined;
  }

  /** @throws Always: secret amounts are not serialisable. */
  public toJSON(): never {
    return fail('P13_SECRET_SERIALIZE', 'secret amount cannot be serialised');
  }

  /** Redacted text. */
  public toString(): string {
    return REDACTED;
  }

  /** @throws Always: blocks `String(x)`, templates and numeric coercion. */
  public [Symbol.toPrimitive](): never {
    return fail('P13_SECRET_SERIALIZE', 'secret amount cannot be coerced');
  }

  /** Node `util.inspect` / `console.log` view. */
  public [Symbol.for('nodejs.util.inspect.custom')](): string {
    return REDACTED;
  }
}

const MAX_DEPTH = 8;
const MAX_NODES = 10_000;

/**
 * Throws if `value` contains a {@link SecretAmount}, a raw bigint or a non-plain object. Call before a payload leaves
 * the module (storage summary, UI state, worker message). Bounded: depth 8, 10,000 nodes (cycles hit the bound).
 */
export function assertNoSecretAmount(value: unknown): void {
  let nodes = 0;
  const walk = (v: unknown, depth: number): void => {
    nodes += 1;
    check(depth <= MAX_DEPTH && nodes <= MAX_NODES, 'P13_RECORD_LIMIT', 'payload too deep or too large');
    if (v instanceof SecretAmount || typeof v === 'bigint') fail('P13_SECRET_SERIALIZE', 'payload contains an amount');
    if (typeof v !== 'object' || v === null) return;
    if (Array.isArray(v)) {
      for (const x of v as readonly unknown[]) walk(x, depth + 1);
      return;
    }
    const proto: unknown = Object.getPrototypeOf(v);
    check(proto === Object.prototype || proto === null, 'P13_SECRET_SERIALIZE', 'payload contains a non-plain object');
    for (const x of Object.values(v)) walk(x, depth + 1);
  };
  walk(value, 0);
}
