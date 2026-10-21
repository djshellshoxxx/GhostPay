import { createHmac, timingSafeEqual } from 'node:crypto';
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

function mac(secret: Uint8Array, c: QuoteClaims): Buffer {
  const canonical = [
    'ghostpay-quote-v1',
    String(c.chainId),
    c.token.toLowerCase(),
    c.owner.toLowerCase(),
    c.destination.toLowerCase(),
    c.amount.toString(),
    c.fee.toString(),
    c.feeTo.toLowerCase(),
    String(c.expiresAt),
  ].join('\n');
  return createHmac('sha256', secret).update(canonical).digest();
}

/**
 * Signs a quote: `v1.<expiresAt>.<fee>.<hmac-sha256 hex>`.
 *
 * @remarks Stateless: the MAC covers chain, token, owner, destination, amount, fee, feeTo and expiry,
 * so a client cannot reuse a quote for a different order. Single use is enforced by the contract's
 * sweep nonce, not by the server.
 *
 * @param secret Server secret (at least 32 bytes).
 * @param claims Quote content.
 * @returns Opaque token.
 */
export function signQuote(secret: Uint8Array, claims: QuoteClaims): string {
  return `v1.${String(claims.expiresAt)}.${claims.fee.toString()}.${mac(secret, claims).toString('hex')}`;
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
 * @param secret Server secret.
 * @param token Presented token.
 * @param binding The order fields the token must be bound to.
 * @returns Fee and expiry when authentic, otherwise `null`.
 */
export function verifyQuote(
  secret: Uint8Array,
  token: string,
  binding: Omit<QuoteClaims, 'fee' | 'expiresAt'>,
): VerifiedQuote | null {
  if (!QUOTE_TOKEN_PATTERN.test(token)) return null;
  const [, exp, fee, tag] = token.split('.') as [string, string, string, string];
  const expiresAt = Number(exp); // at most 12 digits (pattern), always a safe integer
  const claims: QuoteClaims = { ...binding, fee: BigInt(fee), expiresAt };
  const expected = mac(secret, claims);
  const presented = Buffer.from(tag, 'hex');
  if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) return null;
  return { fee: claims.fee, expiresAt };
}
