import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { Address } from 'viem';
import { QUOTE_TOKEN_PATTERN } from './validate.js';

/** Everything a quote token commits to. */
export interface QuoteClaims {
  readonly chainId: number;
  readonly token: Address;
  readonly owner: Address;
  readonly destination: Address;
  readonly amount: bigint;
  readonly fee: bigint;
  readonly feeTo: Address;
  /** Unix seconds. */
  readonly expiresAt: number;
}

/** One signing or verification key, identified without exposing the secret. */
export interface QuoteKey {
  readonly id: string;
  readonly secret: Uint8Array;
}

/** Current signing key and optional verify-only previous key. */
export interface QuoteKeyring {
  readonly primary: QuoteKey;
  readonly previous?: QuoteKey;
}

export function quoteKeyId(secret: Uint8Array): string {
  return createHash('sha256').update('ghostpay-quote-kid\n').update(secret).digest().subarray(0, 4).toString('hex');
}

/** Creates a rotation keyring. Identical primary and previous secrets are rejected. */
export function makeKeyring(primary: Uint8Array, previous?: Uint8Array): QuoteKeyring {
  const current = { id: quoteKeyId(primary), secret: primary };
  if (previous === undefined) return { primary: current };
  const prior = { id: quoteKeyId(previous), secret: previous };
  if (prior.id === current.id) throw new Error('previous quote secret must differ from the current one');
  return { primary: current, previous: prior };
}

function mac(key: QuoteKey, c: QuoteClaims): Buffer {
  const canonical = [
    'ghostpay-quote-v2', key.id, String(c.chainId), c.token.toLowerCase(), c.owner.toLowerCase(),
    c.destination.toLowerCase(), c.amount.toString(), c.fee.toString(), c.feeTo.toLowerCase(), String(c.expiresAt),
  ].join('\n');
  return createHmac('sha256', key.secret).update(canonical).digest();
}

/** Signs a stateless order-bound token using the primary quote key. */
export function signQuote(key: QuoteKey | Uint8Array, claims: QuoteClaims): string {
  const signingKey = key instanceof Uint8Array ? makeKeyring(key).primary : key;
  return `v2.${signingKey.id}.${String(claims.expiresAt)}.${claims.fee.toString()}.${mac(signingKey, claims).toString('hex')}`;
}

export interface VerifiedQuote {
  readonly fee: bigint;
  readonly expiresAt: number;
}

/** Verifies an order-bound quote in constant time, accepting the current and optional previous key. */
export function verifyQuote(
  keys: QuoteKeyring | Uint8Array,
  token: string,
  binding: Omit<QuoteClaims, 'fee' | 'expiresAt'>,
): VerifiedQuote | null {
  if (!QUOTE_TOKEN_PATTERN.test(token)) return null;
  const keyring = keys instanceof Uint8Array ? makeKeyring(keys) : keys;
  const [, kid, exp, fee, tag] = token.split('.') as [string, string, string, string, string];
  const key = keyring.primary.id === kid ? keyring.primary : keyring.previous?.id === kid ? keyring.previous : undefined;
  if (key === undefined) return null;
  const expiresAt = Number(exp);
  const claims: QuoteClaims = { ...binding, fee: BigInt(fee), expiresAt };
  const expected = mac(key, claims);
  const presented = Buffer.from(tag, 'hex');
  if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) return null;
  return { fee: claims.fee, expiresAt };
}
