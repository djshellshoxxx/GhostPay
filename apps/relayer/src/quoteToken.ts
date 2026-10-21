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

/** One signing/verification key with its public identifier. */
export interface QuoteKey {
  /** 8 lowercase hex chars: a truncated hash of the secret (reveals nothing usable about it). */
  readonly id: string;
  readonly secret: Uint8Array;
}

/** Current signing key plus an optional verify-only previous key for a rotation window. */
export interface QuoteKeyring {
  readonly primary: QuoteKey;
  readonly previous?: QuoteKey;
}

/**
 * @param secret Quote secret.
 * @returns Key id (first 4 bytes of SHA-256 over a domain tag and the secret).
 */
export function quoteKeyId(secret: Uint8Array): string {
  return createHash('sha256').update('ghostpay-quote-kid\n').update(secret).digest().subarray(0, 4).toString('hex');
}

/**
 * Builds a keyring.
 *
 * @param primary Secret used to sign (and verify).
 * @param previous Optional older secret accepted for verification only, so rotation does not invalidate
 * quotes issued shortly before.
 * @returns Keyring.
 * @throws {Error} when both secrets are identical (a rotation that changes nothing is a mistake).
 */
export function makeKeyring(primary: Uint8Array, previous?: Uint8Array): QuoteKeyring {
  const p: QuoteKey = { id: quoteKeyId(primary), secret: primary };
  if (previous === undefined) return { primary: p };
  const q: QuoteKey = { id: quoteKeyId(previous), secret: previous };
  if (q.id === p.id) throw new Error('previous quote secret must differ from the current one');
  return { primary: p, previous: q };
}

function mac(key: QuoteKey, c: QuoteClaims): Buffer {
  const canonical = [
    'ghostpay-quote-v2',
    key.id,
    String(c.chainId),
    c.token.toLowerCase(),
    c.owner.toLowerCase(),
    c.destination.toLowerCase(),
    c.amount.toString(),
    c.fee.toString(),
    c.feeTo.toLowerCase(),
    String(c.expiresAt),
  ].join('\n');
  return createHmac('sha256', key.secret).update(canonical).digest();
}

/**
 * Signs a quote: `v2.<keyId>.<expiresAt>.<fee>.<hmac-sha256 hex>` (canonical decimals, no leading zeros).
 *
 * @remarks Stateless: the MAC covers chain, token, owner, destination, amount, fee, feeTo and expiry,
 * so a client cannot reuse a quote for a different order. Single use is enforced by the contract's
 * sweep nonce, not by the server.
 *
 * @param key Signing key (the keyring's primary).
 * @param claims Quote content.
 * @returns Opaque token.
 */
export function signQuote(key: QuoteKey, claims: QuoteClaims): string {
  return `v2.${key.id}.${String(claims.expiresAt)}.${claims.fee.toString()}.${mac(key, claims).toString('hex')}`;
}

/** What a verified token reveals. */
export interface VerifiedQuote {
  readonly fee: bigint;
  readonly expiresAt: number;
}

/**
 * Verifies a token against the order it is presented with, in constant time.
 *
 * @remarks Does NOT check expiry: the caller compares `expiresAt` with its clock, so "expired" and
 * "tampered" stay distinguishable internally.
 *
 * @param keyring Server keys; the token's key id selects which one verifies it.
 * @param token Presented token.
 * @param binding The order fields the token must be bound to.
 * @returns Fee and expiry when authentic, otherwise `null`.
 */
export function verifyQuote(
  keyring: QuoteKeyring,
  token: string,
  binding: Omit<QuoteClaims, 'fee' | 'expiresAt'>,
): VerifiedQuote | null {
  if (!QUOTE_TOKEN_PATTERN.test(token)) return null;
  const [, kid, exp, fee, tag] = token.split('.') as [string, string, string, string, string];
  const key = keyring.primary.id === kid ? keyring.primary : keyring.previous?.id === kid ? keyring.previous : undefined;
  if (key === undefined) return null;
  const expiresAt = Number(exp); // at most 12 digits (pattern), always a safe integer
  const claims: QuoteClaims = { ...binding, fee: BigInt(fee), expiresAt };
  const expected = mac(key, claims);
  const presented = Buffer.from(tag, 'hex');
  if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) return null;
  return { fee: claims.fee, expiresAt };
}
