import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { TlvEncoder, U64_MAX } from './encoding.js';
import { MultisigError } from './errors.js';
import { ACCOUNT_ID_RE, CONTROLLER_RE, PUBKEY_RE, decimalString, int, readExact, str } from './validate.js';

/** Maximum number of signers in a policy. */
export const MAX_SIGNERS = 20;
/** Maximum timelock for any proposal kind: 30 days, in seconds. */
export const MAX_TIMELOCK_SECONDS = 30 * 24 * 60 * 60;
/** Maximum policy version (rotations). */
export const MAX_POLICY_VERSION = 0xffff_ffff;

/** Domain separation prefix of the policy hash. */
export const POLICY_DOMAIN = 'GhostPay.MerchantMultisig.Policy.v1\0';

/** One authorised signer. */
export interface Signer {
  /** Compressed secp256k1 public key, lowercase hex (66 chars). */
  readonly publicKey: string;
  /**
   * Who physically controls this key (person, HSM, device). Two signers with the
   * same controller (case-insensitive) are rejected: one party must never hold
   * two votes.
   */
  readonly controller: string;
}

/** Per-kind delay between reaching threshold (queueing) and execution, in seconds. */
export interface Timelocks {
  readonly payout: number;
  readonly refund: number;
  /** Must be at least `max(payout, refund)` so timelocks cannot be shortened faster than they protect. */
  readonly config: number;
}

/** Mutable part of a policy; what a config-change proposal replaces. */
export interface PolicyBody {
  readonly signers: readonly Signer[];
  readonly threshold: number;
  readonly timelocks: Timelocks;
}

/** A merchant account's m-of-n approval policy. */
export interface MultisigPolicy extends PolicyBody {
  /** Merchant account id (lowercase slug). */
  readonly accountId: string;
  /** Chain id as a canonical decimal string (EIP-155 style), 1..2^64-1. */
  readonly chainId: string;
  /** Incremented on every executed config change. */
  readonly version: number;
}

function validateSigners(value: unknown, path: string): Signer[] {
  if (!Array.isArray(value)) throw new MultisigError('POLICY', path);
  if (value.length < 1 || value.length > MAX_SIGNERS) throw new MultisigError('POLICY', path);
  const seenX = new Set<string>();
  const seenController = new Set<string>();
  const out: Signer[] = [];
  for (let i = 0; i < value.length; i++) {
    const p = `${path}[${i}]`;
    const r = readExact(value[i] as unknown, ['publicKey', 'controller'], 'POLICY', p);
    const publicKey = str(r.publicKey, PUBKEY_RE, 'POLICY', `${p}.publicKey`);
    const controller = str(r.controller, CONTROLLER_RE, 'POLICY', `${p}.controller`);
    try {
      secp256k1.Point.fromHex(publicKey).assertValidity();
    } catch {
      throw new MultisigError('POLICY', `${p}.publicKey`);
    }
    // Same x-coordinate covers both exact duplicates and the negated key (02/03 prefix
    // flip): secret k and n-k are trivially derivable from each other, so they are
    // one party. Rejecting them prevents a single holder from casting two votes.
    const x = publicKey.slice(2);
    if (seenX.has(x)) throw new MultisigError('POLICY', `${p}.publicKey`);
    seenX.add(x);
    const c = controller.toLowerCase();
    if (seenController.has(c)) throw new MultisigError('POLICY', `${p}.controller`);
    seenController.add(c);
    out.push(Object.freeze({ publicKey, controller }));
  }
  out.sort((a, b) => (a.publicKey < b.publicKey ? -1 : 1));
  return out;
}

function validateTimelocks(value: unknown, path: string): Timelocks {
  const r = readExact(value, ['payout', 'refund', 'config'], 'POLICY', path);
  const payout = int(r.payout, 0, MAX_TIMELOCK_SECONDS, 'POLICY', `${path}.payout`);
  const refund = int(r.refund, 0, MAX_TIMELOCK_SECONDS, 'POLICY', `${path}.refund`);
  const config = int(r.config, 0, MAX_TIMELOCK_SECONDS, 'POLICY', `${path}.config`);
  if (config < Math.max(payout, refund)) throw new MultisigError('POLICY', `${path}.config`);
  return Object.freeze({ payout, refund, config });
}

/**
 * Validates the mutable policy body (signers, threshold, timelocks).
 *
 * @param value Untrusted input.
 * @param path Field path prefix for errors.
 * @returns Frozen copy, signers sorted by public key.
 * @throws {MultisigError} `POLICY` on any violation.
 * @security Trust boundary: rejects duplicate keys, negated (same-x) keys, shared
 * controllers, invalid curve points, threshold outside 1..n.
 */
export function validatePolicyBody(value: unknown, path = ''): PolicyBody {
  const r = readExact(value, ['signers', 'threshold', 'timelocks'], 'POLICY', path);
  const pre = path === '' ? '' : `${path}.`;
  const signers = validateSigners(r.signers, `${pre}signers`);
  const threshold = int(r.threshold, 1, signers.length, 'POLICY', `${pre}threshold`);
  const timelocks = validateTimelocks(r.timelocks, `${pre}timelocks`);
  return Object.freeze({ signers: Object.freeze(signers), threshold, timelocks });
}

/**
 * Validates a full policy.
 *
 * @param value Untrusted input.
 * @returns Frozen canonical copy (signers sorted by public key).
 * @throws {MultisigError} `POLICY` on any violation.
 * @security Trust boundary. See {@link validatePolicyBody}.
 */
export function validatePolicy(value: unknown): MultisigPolicy {
  const r = readExact(
    value,
    ['accountId', 'chainId', 'version', 'signers', 'threshold', 'timelocks'],
    'POLICY',
    '',
  );
  const accountId = str(r.accountId, ACCOUNT_ID_RE, 'POLICY', 'accountId');
  const chainId = decimalString(r.chainId, 1n, U64_MAX, 'POLICY', 'chainId');
  const version = int(r.version, 0, MAX_POLICY_VERSION, 'POLICY', 'version');
  const body = validatePolicyBody({ signers: r.signers, threshold: r.threshold, timelocks: r.timelocks });
  return Object.freeze({ accountId, chainId, version, ...body });
}

/** Appends the canonical encoding of a validated body. */
export function encodePolicyBody(enc: TlvEncoder, body: PolicyBody): void {
  enc.u64(0x20, BigInt(body.signers.length));
  for (const s of body.signers) {
    enc.bytes(0x21, hexToBytes(s.publicKey));
    enc.str(0x22, s.controller);
  }
  enc.u64(0x23, BigInt(body.threshold));
  enc.u64(0x24, BigInt(body.timelocks.payout));
  enc.u64(0x25, BigInt(body.timelocks.refund));
  enc.u64(0x26, BigInt(body.timelocks.config));
}

/**
 * Policy hash: `keccak256(POLICY_DOMAIN || TLV(accountId, chainId, version, body))`.
 *
 * @param policy Policy (re-validated).
 * @returns Lowercase hex, 64 chars.
 * @throws {MultisigError} `POLICY` if invalid.
 * @security Every proposal commits to this hash, so a signature can never be
 * replayed under a different signer set, threshold, timelock or version.
 */
export function policyHash(policy: MultisigPolicy): string {
  const p = validatePolicy(policy);
  const enc = new TlvEncoder()
    .str(0x10, p.accountId)
    .u64(0x11, BigInt(p.chainId))
    .u64(0x12, BigInt(p.version));
  encodePolicyBody(enc, p);
  return bytesToHex(keccak_256(concatBytes(utf8ToBytes(POLICY_DOMAIN), enc.finish())));
}
